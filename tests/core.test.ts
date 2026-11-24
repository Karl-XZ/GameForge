import assert from 'node:assert/strict';
import { test } from 'node:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { parseModel, cleanJson, redact } from '../src/lib/providers';
import { createGameRecord, saveGameRecord, saveAssetFile } from '../src/lib/store';
import { snapshotGame, loadVersion, selectVersion, listVersions } from '../src/lib/versions';
import { buildZipBuffer, buildSideScrollerHtml } from '../src/lib/export';

test('provider routing rejects unknown providers and keeps deployed model identity', () => {
  assert.deepEqual(parseModel('deepseek/deepseek-flash'), { provider: 'deepseek', model: 'deepseek-flash' });
  assert.deepEqual(parseModel('qwen/qwen4-max'), { provider: 'qwen', model: 'qwen4-max' });
  assert.throws(() => parseModel('http://evil/model'));
  assert.deepEqual(cleanJson('```json\n{"value":2}\n```'), { value: 2 });
  assert.equal(redact('Bearer private-token sk-test1234567890'), 'Bearer [REDACTED] [REDACTED]');
});

test('text adventure versions freeze the rendered entry and detect template artifact tampering',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'gf-text-entry-'));process.env.GAMEFORGE_DATA_DIR=root;
  try {
    const game=await createGameRecord({mode:'text-adventure',prompt:'fixture',language:'en',textModel:'qwen/test',imageModel:'qwen/image'});
    await saveGameRecord(game.id,{scenes:{title:'Frozen story',startingSceneId:'start',scenes:[{id:'start',title:'Start',text:'Story',choices:[],isEnding:true,endingType:'win'}]},status:'ready'});
    const version=await snapshotGame(game.id);assert.ok(version.entryHtml?.includes('id="restart"'));
    const zip=await JSZip.loadAsync(await buildZipBuffer(version.record,version));assert.equal(await zip.file('index.html')!.async('string'),version.entryHtml);
    assert.equal((await snapshotGame(game.id)).id,version.id);
    const file=path.join(root,game.id,'versions',version.id,'version.json');const raw=JSON.parse(await fs.readFile(file,'utf8'));raw.entryHtml+='tampered';await fs.writeFile(file,JSON.stringify(raw));
    await assert.rejects(()=>loadVersion(game.id,version.id),/integrity/);
  }finally{await fs.rm(root,{recursive:true,force:true});delete process.env.GAMEFORGE_DATA_DIR;}
});

test('HTML with an ordinary URL is delivered unchanged rather than silently replaced', () => {
  const html = '<!doctype html><html><body><!-- https://example.com -->Actual game</body></html>';
  assert.equal(buildSideScrollerHtml({ gameHtml: html } as any), html);
  assert.throws(() => buildSideScrollerHtml({} as any), /HTML/);
});

test('versions freeze overwritten assets and reject stale selection or traversal', async () => {
  process.env.GAMEFORGE_DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'gameforge-test-'));
  const game = await createGameRecord({ mode: 'side-scroller', prompt: 'test', language: 'en', textModel: 'qwen/qwen4-max', imageModel: 'qwen/qwen-image-3.0' });
  const html = '<html><body>First game<img src="assets/hero.png"></body></html>';
  await saveAssetFile(game.id, 'hero.png', Buffer.from('first-image'));
  await saveGameRecord(game.id, { gameHtml: html, images: { assets: { hero: 'hero.png' } } });
  const first = await snapshotGame(game.id, 'original');
  await saveAssetFile(game.id, 'hero.png', Buffer.from('new-image'));
  await saveGameRecord(game.id, { gameHtml: '<html><body>Edited</body></html>' });
  const second = await snapshotGame(game.id, 'manual edit');
  assert.notEqual(first.id, second.id);
  const frozen = await loadVersion(game.id, first.id);
  const zip = await JSZip.loadAsync(await buildZipBuffer(frozen!.record, frozen!));
  assert.equal(await zip.file('assets/hero.png')!.async('string'), 'first-image');
  assert.equal(await zip.file('index.html')!.async('string'), html);
  assert.equal(JSON.parse(await zip.file('manifest.json')!.async('string')).version, first.id);
  await assert.rejects(() => selectVersion(game.id, first.id, first.id), /changed|conflict/i);
  await assert.rejects(() => loadVersion('../outside', first.id));
  assert.ok((await listVersions(game.id)).length >= 2);
});
