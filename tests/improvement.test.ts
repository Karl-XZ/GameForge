import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createGameRecord,loadGameRecord,saveGameRecord,listGames,saveAssetFile} from '../src/lib/store';
import {snapshotGame,selectVersion,loadVersion,versionDir} from '../src/lib/versions';
import {withGameLock} from '../src/lib/lock';
import {createRun,runDir,controlRun,getRun} from '../src/lib/improvement';

test('rollback restores absent fields and concurrent writes keep both edits',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'gf-rollback-'));process.env.GAMEFORGE_DATA_DIR=root;
  try{
    const game=await createGameRecord({mode:'side-scroller',prompt:'fixture',language:'en',textModel:'qwen/test',imageModel:'qwen/image'});
    const draft=await snapshotGame(game.id);
    await saveGameRecord(game.id,{gameHtml:'<html>ready</html>',status:'ready'});
    const ready=await snapshotGame(game.id);
    await selectVersion(game.id,draft.id,ready.id);
    assert.equal((await loadGameRecord(game.id))?.gameHtml,undefined);
    assert.equal((await snapshotGame(game.id)).id,draft.id);
    await withGameLock(game.id,async()=>assert.equal((await listGames()).length,1));
    await Promise.all([saveGameRecord(game.id,{gameHtml:'<html>edited</html>'}),saveGameRecord(game.id,{warnings:['concurrent']})]);
    const record=await loadGameRecord(game.id);assert.deepEqual(record?.warnings,['concurrent']);assert.equal(record?.gameHtml,'<html>edited</html>');
    const version=await snapshotGame(game.id);const file=path.join(versionDir(game.id,version.id),'version.json');
    const raw=JSON.parse(await fs.readFile(file,'utf8'));raw.record.gameHtml='<html>tampered</html>';await fs.writeFile(file,JSON.stringify(raw));
    await assert.rejects(()=>loadVersion(game.id,version.id),/integrity/);
    await assert.rejects(()=>snapshotGame(game.id),/integrity/);
  }finally{await fs.rm(root,{recursive:true,force:true});delete process.env.GAMEFORGE_DATA_DIR;}
});

test('jobs validate budgets, deduplicate dispatch, stop and resume without replacing the active game',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'gf-jobs-'));process.env.GAMEFORGE_DATA_DIR=root;process.env.GAMEFORGE_DISABLE_WORKER='1';
  const hadKey=!!process.env.DEEPSEEK_API_KEY;if(!hadKey)process.env.DEEPSEEK_API_KEY='sk-test'; // createRun needs a configured worker model
  try{
    const game=await createGameRecord({mode:'side-scroller',prompt:'fixture',language:'en',textModel:'qwen/test',imageModel:'qwen/image'});
    await saveGameRecord(game.id,{gameHtml:'<html>original</html>',status:'ready'});const base=await snapshotGame(game.id);
    await assert.rejects(()=>createRun(game.id,{budgets:{rounds:100}}));
    await assert.rejects(()=>createRun(game.id,{baseVersion:'stale'}),/conflict/);
    const run=await createRun(game.id,{requestId:'fixture-job',baseVersion:base.id,budgets:{rounds:1,calls:8}});
    assert.equal((await createRun(game.id,{requestId:'fixture-job'})).id,run.id);
    await assert.rejects(()=>createRun(game.id,{requestId:'different'}),/active/);
    await controlRun(game.id,run.id,'stop');assert.equal(await fs.readFile(path.join(runDir(game.id,run.id),'stop'),'utf8'),'stop');
    const file=path.join(runDir(game.id,run.id),'state.json');await fs.writeFile(file,JSON.stringify({...run,status:'stopped'}));
    await controlRun(game.id,run.id,'resume');assert.equal((await getRun(game.id,run.id)).status,'queued');
    assert.equal((await snapshotGame(game.id)).id,base.id);
  }finally{await fs.rm(root,{recursive:true,force:true});delete process.env.GAMEFORGE_DATA_DIR;delete process.env.GAMEFORGE_DISABLE_WORKER;if(!hadKey)delete process.env.DEEPSEEK_API_KEY;}
});

test('editing upstream designs invalidates downstream HTML and image reuse while retaining the old version',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'gf-invalidate-'));process.env.GAMEFORGE_DATA_DIR=root;
  try{
    const game=await createGameRecord({mode:'side-scroller',prompt:'fixture',language:'en',textModel:'qwen/test',imageModel:'qwen/image'});
    await saveAssetFile(game.id,'hero.png',Buffer.from('old sprite'));
    await saveGameRecord(game.id,{plan:{title:'old'},gameHtml:'<html>old</html>',images:{assets:{hero:'hero.png'}},status:'ready'});
    const old=await snapshotGame(game.id);
    await saveGameRecord(game.id,{plan:{title:'new'}});
    const changed=await loadGameRecord(game.id);assert.equal(changed?.gameHtml,undefined);assert.equal(Object.keys(changed?.images?.assets||{}).length,0);
    assert.equal((await loadVersion(game.id,old.id))?.record.gameHtml,'<html>old</html>');
    const story=await createGameRecord({mode:'text-adventure',prompt:'fixture',language:'en',textModel:'qwen/test',imageModel:'qwen/image'});
    await saveAssetFile(story.id,'scene.png',Buffer.from('old scene'));
    await saveGameRecord(story.id,{outline:{title:'old'},scenes:{scenes:[]},images:{cover:'scene.png',scenes:{first:'scene.png'}},status:'ready'});
    await saveGameRecord(story.id,{outline:{title:'new'}});
    const next=await loadGameRecord(story.id);assert.equal(next?.scenes,undefined);assert.equal(Object.keys(next?.images?.scenes||{}).length,0);assert.equal(next?.images?.cover,undefined);
  }finally{await fs.rm(root,{recursive:true,force:true});delete process.env.GAMEFORGE_DATA_DIR;}
});
