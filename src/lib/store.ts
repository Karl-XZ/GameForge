import { withGameLock } from './lock';
import { promises as fs } from "fs";
import path from "path";
import { kv } from "@vercel/kv";
import { del as blobDel, head as blobHead, list as blobList, put as blobPut, type ListBlobResult } from "@vercel/blob";

export type GameMode = "text-adventure" | "side-scroller";
export type GameStatus = "draft" | "ready";

export type GameRecord = {
  id: string;
  mode: GameMode;
  status: GameStatus;
  createdAt: string;
  updatedAt: string;
  prompt: string;
  language: "zh" | "en";
  textModel: string;
  imageModel: string;
  outline?: any;
  scenes?: any;
  plan?: any;
  images?: {
    cover?: string;
    scenes?: Record<string, string>;
    assets?: Record<string, string>;
  };
  assetMeta?: Record<string, { type: string; needsCutout: boolean; file: string }>;
  gameHtml?: string;
  selectedVersion?: string;
  revision?: number;
  generationConfig?: string;
  warnings?: string[];
  metrics?: Record<string, { startedAt: string; endedAt?: string; durationMs?: number }>;
  studio?: { minutes: number; toolCalls: number; playtests: number; imagesViewed: number; revised: boolean; critique?: any; final?: string };
};

const isVercel = !!process.env.VERCEL;
const hasKv = (!!process.env.KV_URL || !!process.env.KV_REST_API_URL) && !!process.env.KV_REST_API_TOKEN;
const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const useRemoteStorage = hasKv && hasBlob;

// Local filesystem fallback for dev/test only.
// On Vercel, KV + Blob is required to avoid /tmp persistence issues.
export const dataRoot = () => path.resolve(process.env.GAMEFORGE_DATA_DIR || path.join(process.cwd(), ".gameforge-data"));

export function safeId(value: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error("Invalid identifier");
  return value;
}
export function safeFile(value: string) {
  if (!/^[a-zA-Z0-9_.-]{1,180}$/.test(value) || value.includes("..")) throw new Error("Invalid filename");
  return value;
}

const recordKey = (id: string) => `game:${id}`;
const blobPrefix = process.env.GAMEFORGE_BLOB_PREFIX?.trim() || "gameforge";
const blobPath = (id: string, filename: string) => `${blobPrefix}/${id}/${filename}`;

function assertRemoteReady() {
  if (isVercel && !useRemoteStorage) {
    throw new Error(
      "Missing Vercel KV/Blob configuration. Set KV_* env vars and BLOB_READ_WRITE_TOKEN."
    );
  }
}

async function ensureDir(dir: string) {
  if (useRemoteStorage) return;
  await fs.mkdir(dir, { recursive: true });
}

function recordPath(id: string) {
  return path.join(dataRoot(), safeId(id), "record.json");
}

function assetDir(id: string) {
  return path.join(dataRoot(), safeId(id), "assets");
}

function parseRecord(raw: unknown): GameRecord | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as GameRecord;
    } catch {
      return null;
    }
  }
  return raw as GameRecord;
}

function guessContentType(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

export async function createGameRecord(input: {
  mode: GameMode;
  prompt: string;
  language: "zh" | "en";
  textModel: string;
  imageModel: string;
}) {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const now = new Date().toISOString();
  const record: GameRecord = {
    id,
    mode: input.mode,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    prompt: input.prompt,
    language: input.language,
    textModel: input.textModel,
    imageModel: input.imageModel,
  };
  if (useRemoteStorage) {
    assertRemoteReady();
    await kv.set(recordKey(id), JSON.stringify(record));
  } else {
    await ensureDir(path.join(dataRoot(), safeId(id)));
    await ensureDir(assetDir(id));
    await fs.writeFile(recordPath(id), JSON.stringify(record, null, 2), "utf-8");
  }
  return record;
}

export async function loadGameRecord(id: string): Promise<GameRecord | null> {
  safeId(id);
  try {
    if (useRemoteStorage) {
      assertRemoteReady();
      const raw = await kv.get<string>(recordKey(id));
      return parseRecord(raw);
    }
    const text = await fs.readFile(recordPath(id), "utf-8");
    return JSON.parse(text) as GameRecord;
  } catch {
    return null;
  }
}

export async function saveGameRecord(id: string, patch: Partial<GameRecord>): Promise<GameRecord | null> {
  return withGameLock(id, () => saveUnlocked(id, patch));
}
async function saveUnlocked(id: string, patch: Partial<GameRecord>): Promise<GameRecord | null> {
  let current = (await loadGameRecord(id)) ?? null;
  if (!current) return null;
  const changed = ['plan','outline','scenes','gameHtml','images'].some(k => k in patch && JSON.stringify((patch as any)[k]) !== JSON.stringify((current as any)[k]));
  if (changed && (current.gameHtml || (current.status === 'ready' && current.scenes))) {await (await import('./versions')).snapshotGame(id, 'before edit');current=(await loadGameRecord(id))!;}
  if (patch.plan && JSON.stringify(patch.plan) !== JSON.stringify(current.plan) && !('gameHtml' in patch)) {
    patch = {...patch, gameHtml:undefined,status:'draft',...(!('images' in patch)?{images:{...(current.images||{}),assets:{}}}:{})};
  }
  if (patch.outline && JSON.stringify(patch.outline) !== JSON.stringify(current.outline) && !('scenes' in patch)) {
    patch = {...patch, scenes:undefined,status:'draft',...(!('images' in patch)?{images:{...(current.images||{}),cover:undefined,scenes:{}}}:{})};
  }
  if(patch.scenes && JSON.stringify(patch.scenes)!==JSON.stringify(current.scenes) && !('images' in patch)) {
    const previous=new Map((current.scenes?.scenes||[]).map((scene:any)=>[scene.id,scene.cgPrompt]));
    const unchanged=new Set((patch.scenes.scenes||[]).filter((scene:any)=>previous.get(scene.id)===scene.cgPrompt).map((scene:any)=>scene.id));
    patch={...patch,status:'draft',images:{...(current.images||{}),scenes:Object.fromEntries(Object.entries(current.images?.scenes||{}).filter(([id])=>unchanged.has(id)))}};
  }
  if (changed && !('selectedVersion' in patch)) patch = {...patch,selectedVersion:undefined};
  const next: GameRecord = {
    ...current,
    ...patch,
    id: current.id,
    mode: current.mode,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
    revision: (current.revision || 0) + 1,
  };
  if (useRemoteStorage) {
    assertRemoteReady();
    await kv.set(recordKey(id), JSON.stringify(next));
  } else {
    const temp = recordPath(id)+'.'+crypto.randomUUID()+'.tmp';
    await fs.writeFile(temp, JSON.stringify(next, null, 2), "utf-8");
    await fs.rename(temp, recordPath(id));
  }
  return next;
}

export async function listGames(): Promise<GameRecord[]> {
  try {
    const records: GameRecord[] = [];
    if (useRemoteStorage) {
      assertRemoteReady();
      for await (const key of kv.scanIterator({ match: "game:*", count: 100 })) {
        const raw = await kv.get<string>(String(key));
        const record = parseRecord(raw);
        if (record) records.push(record);
      }
    } else {
      await ensureDir(dataRoot());
      const entries = await fs.readdir(dataRoot(), { withFileTypes: true });
      const ids = entries.filter((e) => e.isDirectory() && /^[a-zA-Z0-9_-]{1,100}$/.test(e.name)).map((e) => e.name);
      for (const id of ids) {
        const record = await loadGameRecord(id);
        if (record) records.push(record);
      }
    }
    return records.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}

export async function saveAssetFile(id: string, filename: string, buffer: Buffer): Promise<string> {
  return withGameLock(id, async () => {
    const current = await loadGameRecord(id);
    if (current?.gameHtml || (current?.status === 'ready' && current.scenes)) await (await import('./versions')).snapshotGame(id, 'before asset edit');
    return saveAssetUnlocked(id, filename, buffer);
  });
}
async function saveAssetUnlocked(id: string, filename: string, buffer: Buffer): Promise<string> {
  safeId(id); safeFile(filename);
  if (useRemoteStorage) {
    assertRemoteReady();
    const pathname = blobPath(id, filename);
    await blobPut(pathname, buffer, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: guessContentType(filename),
    });
    return pathname;
  }
  await ensureDir(assetDir(id));
  const filePath = path.join(assetDir(id), filename);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

export async function readAssetFile(id: string, filename: string) {
  safeId(id); safeFile(filename);
  if (useRemoteStorage) {
    assertRemoteReady();
    if (filename.startsWith("http")) {
      const res = await fetch(filename);
      if (!res.ok) throw new Error(`Failed to fetch asset ${filename}`);
      const arr = await res.arrayBuffer();
      return Buffer.from(arr);
    }
    const meta = await blobHead(blobPath(id, filename));
    const res = await fetch(meta.url);
    if (!res.ok) {
      throw new Error(`Failed to fetch blob ${meta.url}`);
    }
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  }
  const filePath = path.join(assetDir(id), filename);
  return fs.readFile(filePath);
}

export function getAssetFilePath(id: string, filename: string) {
  if (useRemoteStorage) return blobPath(id, filename);
  return path.join(assetDir(id), filename);
}

export async function deleteGameRecord(id: string) {
  safeId(id);
  try {
    if (useRemoteStorage) {
      assertRemoteReady();
      await kv.del(recordKey(id));
      const prefix = `${blobPrefix}/${id}/`;
      let cursor: string | undefined = undefined;
      do {
        const res: ListBlobResult = await blobList({ prefix, cursor });
        if (res.blobs.length > 0) {
          await blobDel(res.blobs.map((b) => b.url));
        }
        cursor = res.cursor;
      } while (cursor);
      return true;
    }
    await fs.rm(path.join(dataRoot(), safeId(id)), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

