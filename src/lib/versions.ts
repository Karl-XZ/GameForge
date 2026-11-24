import { withGameLock } from './lock';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dataRoot, safeId, safeFile, loadGameRecord, readAssetFile, saveGameRecord, type GameRecord } from './store';

export type GameVersion = { id: string; gameId: string; parent?: string; label: string; createdAt: string; record: GameRecord; assets: Record<string, string>; revision: number; entryHtml?:string };
export const digest = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
export async function atomicJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), {recursive: true});
  const temp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temp, file);
}
export const versionDir = (gameId: string, versionId: string) => path.join(dataRoot(), safeId(gameId), 'versions', safeId(versionId));

export async function snapshotGame(gameId: string, label = 'snapshot'): Promise<GameVersion> {
  return withGameLock(gameId, () => snapshotUnlocked(gameId,label));
}
async function snapshotUnlocked(gameId: string, label: string): Promise<GameVersion> {
  const record = await loadGameRecord(gameId);
  if (!record) throw new Error('Game not found');
  const files = [...new Set([record.images?.cover, ...Object.values(record.images?.scenes || {}), ...Object.values(record.images?.assets || {})].filter(Boolean))] as string[];
  const buffers: Record<string, Buffer> = {};
  for (const file of files.sort()) buffers[safeFile(file)] = await readAssetFile(gameId, file);
  const assets = Object.fromEntries(Object.entries(buffers).map(([file, bytes]) => [file, digest(bytes)]));
  const { selectedVersion, revision, createdAt, updatedAt, ...content } = record;
  let entryHtml:string|undefined;
  if(record.mode==='text-adventure' && record.scenes) {
    if(selectedVersion) {
      const previous=await loadVersion(gameId,selectedVersion);
      if(previous?.entryHtml) {
        const {selectedVersion:oldSelection,revision:oldRevision,createdAt:oldCreated,updatedAt:oldUpdated,...oldContent}=previous.record;
        if(JSON.stringify(oldContent)===JSON.stringify(content) && JSON.stringify(previous.assets)===JSON.stringify(assets)) return previous;
      }
    }
    entryHtml=(await import('./export')).buildTextAdventureHtml(record);
  }
  const id = digest(JSON.stringify({content, assets,...(entryHtml?{entrySha256:digest(entryHtml)}:{})})).slice(0, 32);
  const directory = versionDir(gameId, id);
  let version: GameVersion;
  try { version = JSON.parse(await fs.readFile(path.join(directory, 'version.json'), 'utf8')); }
  catch (error: any) {
    if (error.code !== 'ENOENT') throw error;
    const staging = directory + '.' + randomUUID();
    await fs.mkdir(path.join(staging, 'assets'), {recursive: true});
    for (const [file, bytes] of Object.entries(buffers)) await fs.writeFile(path.join(staging, 'assets', file), bytes);
    version = {id, gameId, parent: selectedVersion, label, createdAt: new Date().toISOString(), record: {...record, selectedVersion: id}, assets, revision: revision || 0,...(entryHtml?{entryHtml}:{})};
    await atomicJson(path.join(staging, 'version.json'), version);
    try { await fs.rename(staging, directory); }
    catch (e: any) { if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(e.code)) throw e; await fs.rm(staging, {recursive: true, force: true}); }
  }
  const verified=await loadVersion(gameId,id);
  if(!verified) throw new Error('Snapshot integrity failure');
  version=verified;
  // Do not mark a concurrently edited record as this snapshot.
  const latest = await loadGameRecord(gameId);
  if (latest?.revision === record.revision) await saveGameRecord(gameId, {selectedVersion: id});
  return version;
}

export async function loadVersion(gameId: string, id: string): Promise<GameVersion | null> {
  const directory = versionDir(gameId, id);
  try {
    const version: GameVersion = JSON.parse(await fs.readFile(path.join(directory, 'version.json'), 'utf8'));
    if (version.gameId !== gameId || version.id !== id) throw new Error('Version identity mismatch');
    const {selectedVersion, revision, createdAt, updatedAt, ...content} = version.record;
    if (digest(JSON.stringify({content,assets:version.assets,...(version.entryHtml?{entrySha256:digest(version.entryHtml)}:{})})).slice(0,32) !== id) throw new Error('Version source integrity failure');
    for (const [file, hash] of Object.entries(version.assets)) {
      if (digest(await fs.readFile(path.join(directory, 'assets', safeFile(file)))) !== hash) throw new Error('Version asset integrity failure');
    }
    return version;
  } catch (e: any) { if (e.code === 'ENOENT') return null; throw e; }
}

export async function listVersions(gameId: string) {
  const directory = path.join(dataRoot(), safeId(gameId), 'versions');
  const entries = await fs.readdir(directory, {withFileTypes: true}).catch(() => []);
  const versions = await Promise.all(entries.filter(e => e.isDirectory() && /^[a-f0-9]{32}$/.test(e.name)).map(e => loadVersion(gameId, e.name)));
  return versions.filter(Boolean).sort((a, b) => b!.createdAt.localeCompare(a!.createdAt)) as GameVersion[];
}

export async function readVersionAsset(version: GameVersion, file: string) {
  const bytes = await fs.readFile(path.join(versionDir(version.gameId, version.id), 'assets', safeFile(file)));
  if (digest(bytes) !== version.assets[file]) throw new Error('Asset integrity failure');
  return bytes;
}

export async function selectVersion(gameId: string, versionId: string, expectedVersion: string): Promise<GameVersion> {
  return withGameLock(gameId, () => selectUnlocked(gameId,versionId,expectedVersion));
}
async function selectUnlocked(gameId: string, versionId: string, expectedVersion: string): Promise<GameVersion> {
  const current = await snapshotGame(gameId);
  if (current.id !== expectedVersion) throw new Error('Version conflict: game changed');
  const selected = await loadVersion(gameId, versionId);
  if (!selected) throw new Error('Version not found');
  const {id, mode, createdAt, updatedAt, revision, ...patch} = selected.record;
  // Restore the selected assets as well, so later manual regeneration starts from it.
  const {saveAssetFile} = await import('./store');
  for (const file of Object.keys(selected.assets)) await saveAssetFile(gameId, file, await readVersionAsset(selected, file));
  const clear = Object.fromEntries(Object.keys(current.record).map(key=>[key,undefined]));
  await saveGameRecord(gameId, {...clear,...patch, selectedVersion: versionId});
  return selected;
}
