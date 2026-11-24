import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createGameRecord,saveGameRecord} from '../src/lib/store';
import {snapshotGame,digest} from '../src/lib/versions';
import {createRun,runDir,getRun} from '../src/lib/improvement';
import {gameEvolution,likeSpecies,speciesFile,overview,personas} from '../src/lib/evolution';

async function fixture() {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'gf-evolve-'));process.env.GAMEFORGE_DATA_DIR=root;process.env.GAMEFORGE_DISABLE_WORKER='1';process.env.DEEPSEEK_API_KEY='sk-test';
  const game=await createGameRecord({mode:'side-scroller',prompt:'fixture',language:'zh',textModel:'deepseek/deepseek-flash',imageModel:'none'});
  await saveGameRecord(game.id,{gameHtml:'<html><script>window.GameAgentBridge={ready:true}</script></html>',status:'ready'});
  const base=await snapshotGame(game.id);
  return {root,game,base};
}
const cleanup=async(root:string)=>{await fs.rm(root,{recursive:true,force:true});delete process.env.GAMEFORGE_DATA_DIR;delete process.env.GAMEFORGE_DISABLE_WORKER;delete process.env.DEEPSEEK_API_KEY;};

test('evolution runs validate budgets and record generations, children, language and an independent judge',async()=>{
  const {root,game,base}=await fixture();
  try{
    await assert.rejects(()=>createRun(game.id,{kind:'evolve',budgets:{generations:9}}));
    await assert.rejects(()=>createRun(game.id,{kind:'mutate'}));
    const run=await createRun(game.id,{kind:'evolve',requestId:'evo-1',baseVersion:base.id,budgets:{generations:2,children:3,calls:40}});
    const input=JSON.parse(await fs.readFile(path.join(runDir(game.id,run.id),'input.json'),'utf8'));
    assert.equal(input.kind,'evolve');assert.equal(input.budgets.generations,2);assert.equal(input.budgets.children,3);assert.equal(input.language,'zh');
    assert.equal(input.reviewModel,'deepseek/deepseek-v4-pro');
    assert.equal((await gameEvolution(game.id)).runs.length,1);
  }finally{await cleanup(root);}
});

test('species previews are integrity checked, likes need a live species and the overview counts them',async()=>{
  const {root,game,base}=await fixture();
  try{
    const run=await createRun(game.id,{kind:'evolve',requestId:'evo-2',baseVersion:base.id});
    const directory=runDir(game.id,run.id);const html='<html><script>window.GameAgentBridge={ready:true};/*child*/</script></html>';
    await fs.mkdir(path.join(directory,'species','g1c0'),{recursive:true});await fs.writeFile(path.join(directory,'species','g1c0','index.html'),html);
    const state=JSON.parse(await fs.readFile(path.join(directory,'state.json'),'utf8'));
    state.evolution={generation:1,species:[{id:'g1c0',status:'alive',source:'species/g1c0',sourceHash:digest(html)},{id:'g1c1',status:'stillborn'}]};
    await fs.writeFile(path.join(directory,'state.json'),JSON.stringify(state));
    assert.equal((await speciesFile(game.id,run.id,'g1c0',['index.html'])).html,html);
    await assert.rejects(()=>speciesFile(game.id,run.id,'g1c0',['..','x']));
    await assert.rejects(()=>speciesFile(game.id,run.id,'g1c1',['index.html']));
    await fs.writeFile(path.join(directory,'species','g1c0','index.html'),html+'tampered');
    await assert.rejects(()=>speciesFile(game.id,run.id,'g1c0',['index.html']),/integrity/);
    await likeSpecies(game.id,run.id,'g1c0');await likeSpecies(game.id,run.id,'g1c0');
    await assert.rejects(()=>likeSpecies(game.id,run.id,'g1c1'),/Unknown/);
    assert.equal((await gameEvolution(game.id)).likes[`${run.id}:g1c0`],2);
    const stats=await overview();assert.equal(stats.likes,2);assert.equal(stats.species,2);assert.equal(stats.alive,1);
    assert.equal((await getRun(game.id,run.id)).status,'queued');
    assert.equal((await personas()).people.length,40);
  }finally{await cleanup(root);}
});
