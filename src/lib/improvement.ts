import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dataRoot, safeId } from './store';
import { atomicJson, digest, loadVersion, readVersionAsset, snapshotGame, versionDir, type GameVersion } from './versions';
import { buildSideScrollerHtml } from './export';
import { withGameLock } from './lock';
import { configuredModels, parseModel } from './providers';
import { z } from 'zod';

const budgetsSchema=z.object({rounds:z.number().int().min(1).max(5).default(3),episodes:z.number().int().min(1).max(3).default(3),calls:z.number().int().min(4).max(300).default(30),minutes:z.number().int().min(1).max(600).default(30),generations:z.number().int().min(1).max(5).default(3),children:z.number().int().min(1).max(6).default(4),teamMinutes:z.number().int().min(5).max(90).default(25)});
export const runDir=(gameId:string,runId:string)=>path.join(dataRoot(),safeId(gameId),'runs',safeId(runId));
const linuxPath=(file:string)=>file.replace(/^([A-Za-z]):[\\/]/,(_,letter)=>`/mnt/${letter.toLowerCase()}/`).replace(/\\/g,'/');

async function launch(directory:string) {
  if(process.env.GAMEFORGE_DISABLE_WORKER==='1') return;
  const launchToken=randomUUID();const stateFile=path.join(directory,'state.json');
  await atomicJson(stateFile,{...JSON.parse(await fs.readFile(stateFile,'utf8')),launchToken});
  const root=process.cwd();
  const log=await fs.open(path.join(directory,'worker.log'),'a');
  const env={...process.env,WSLENV:[process.env.WSLENV,'QWEN_API_KEY','QWEN_BASE_URL','DEEPSEEK_API_KEY','DEEPSEEK_BASE_URL','GAMEFORGE_RUNTIME_IMAGE'].filter(key=>key && (key===process.env.WSLENV || !!process.env[key])).join(':')};
  const executable=process.env.GAMEFORGE_PYTHON||'python3';
  const args=process.platform==='win32'?['-d',process.env.GAMEFORGE_WSL_DISTRO||'Ubuntu','-u',process.env.GAMEFORGE_WSL_USER||'zhou1','--',executable,linuxPath(path.join(root,'worker/runner.py')),linuxPath(directory)]:[path.join(root,'worker/runner.py'),directory];
  const child=spawn(process.platform==='win32'?'wsl.exe':executable,args,{cwd:root,env,windowsHide:true,detached:true,stdio:['ignore',log.fd,log.fd]});
  child.once('exit',async(code)=>{
    try {
      const file=path.join(directory,'state.json');const state=JSON.parse(await fs.readFile(file,'utf8'));
      if(state.launchToken===launchToken && ['queued','running','stopping'].includes(state.status)) await atomicJson(file,{...state,status:'failed',error:`Worker exited (${code}); inspect worker.log and worker prerequisites`});
    }catch{}
  });
  await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  child.unref();await log.close();
}

export async function createRun(gameId:string,body:any) {
  if(process.env.VERCEL || process.env.KV_REST_API_URL) throw new Error('Improvement requires persistent local storage and an independent Linux/Docker worker');
  const budgets=budgetsSchema.parse(body.budgets||{});
  const kind=z.enum(['improve','evaluate','evolve']).parse(body.kind||'improve');
  const model=String(body.model||configuredModels().defaultText);parseModel(model);
  // Judges look at screenshots: DeepSeek's vision model is flash (V4.1); v4-pro has no image input.
  const strongJudge=model.startsWith('deepseek/')?'deepseek/deepseek-flash':model;
  const reviewModel=String(body.reviewModel||strongJudge);parseModel(reviewModel);
  const goal=String(body.goal||'Improve goal clarity, input response, fairness, pacing and recovery without changing the core game.').slice(0,4000);
  const constraints=String(body.constraints||'Keep the genre, core loop, existing assets and genuine challenge.').slice(0,4000);
  const requestId=safeId(String(body.requestId||randomUUID()));
  return withGameLock(gameId,async()=>{
    const base=await snapshotGame(gameId,'before improvement');
    if(body.baseVersion && body.baseVersion!==base.id) throw new Error('Version conflict: refresh before starting');
    if(base.record.mode!=='side-scroller' || !base.record.gameHtml) throw new Error('Generate an HTML side-scroller first; narrative improvement is not supported yet');
    const directory=runDir(gameId,requestId);
    const existing=await fs.readFile(path.join(directory,'state.json'),'utf8').then(JSON.parse).catch(()=>null);
    if(existing) return existing;
    const runs=await listRuns(gameId);
    if(runs.some(r=>['queued','running','stopping'].includes(r.status))) throw new Error('An improvement run is already active for this game');
    await fs.mkdir(path.join(directory,'baseline','assets'),{recursive:true});
    const html=buildSideScrollerHtml(base.record);
    await fs.writeFile(path.join(directory,'baseline','index.html'),html);
    for(const file of Object.keys(base.assets)) await fs.writeFile(path.join(directory,'baseline','assets',file),await readVersionAsset(base,file));
    const feedback=await fs.readFile(path.join(dataRoot(),gameId,'feedback.json'),'utf8').then(JSON.parse).catch(()=>[]);
    await atomicJson(path.join(directory,'input.json'),{gameId,baseVersion:base.id,baseHash:digest(html),assets:base.assets,goal,constraints,budgets,model,reviewModel,feedback,kind,language:base.record.language||'zh',title:base.record.plan?.title||base.record.prompt?.slice(0,40)||''});
    const state={id:requestId,gameId,baseVersion:base.id,status:'queued',phase:'readiness',createdAt:new Date().toISOString(),goal,constraints,budgets,model,reviewModel,kind};
    await atomicJson(path.join(directory,'state.json'),state);
    try {await launch(directory);}catch(e){await atomicJson(path.join(directory,'state.json'),{...state,status:'failed',error:'Worker could not start'});throw e;}
    return state;
  });
}

export async function listRuns(gameId:string) {
  const directory=path.join(dataRoot(),safeId(gameId),'runs');
  const entries=await fs.readdir(directory,{withFileTypes:true}).catch(()=>[]);
  const runs=await Promise.all(entries.filter(e=>e.isDirectory()).map(e=>fs.readFile(path.join(directory,e.name,'state.json'),'utf8').then(JSON.parse).catch(()=>null)));
  return (await Promise.all(runs.filter(Boolean).map(reconcileRun))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}

async function reconcileRun(state:any) {
  const heartbeat=state.heartbeat?state.heartbeat*1000:Date.parse(state.createdAt);
  if(['queued','running','stopping'].includes(state.status) && Date.now()-heartbeat>90000) {
    const directory=runDir(state.gameId,state.id);
    await fs.writeFile(path.join(directory,'stop'),'stale worker');
    state={...state,status:'failed',error:'Worker heartbeat expired; inspect worker.log before resuming'};
    await atomicJson(path.join(directory,'state.json'),state);
  }
  return state;
}

async function verifyEvidence(directory:string,name:string) {
  safeId(name);
  const root=path.join(directory,'evidence',name);
  const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
  if(!Object.keys(manifest).length) throw new Error('Empty evidence manifest');
  for(const [file,hash] of Object.entries(manifest)) {
    if(file.split('/').some(p=>!/^[-a-zA-Z0-9_.]+$/.test(p)||p.includes('..'))) throw new Error('Invalid evidence manifest path');
    const bytes=await fs.readFile(path.join(root,...file.split('/')));
    if(digest(bytes)!==hash) throw new Error('Evidence integrity failure');
  }
}

async function derivedVersion(base:GameVersion,html:string,label:string) {
  const record={...base.record,gameHtml:html};
  const {selectedVersion,revision,createdAt,updatedAt,...content}=record;
  const id=digest(JSON.stringify({content,assets:base.assets})).slice(0,32);
  const directory=versionDir(base.gameId,id);
  if(await loadVersion(base.gameId,id)) return id;
  const staging=directory+'.'+randomUUID();
  await fs.mkdir(path.join(staging,'assets'),{recursive:true});
  for(const file of Object.keys(base.assets)) await fs.writeFile(path.join(staging,'assets',file),await readVersionAsset(base,file));
  await atomicJson(path.join(staging,'version.json'),{id,gameId:base.gameId,parent:base.id,label,createdAt:new Date().toISOString(),record:{...record,selectedVersion:id},assets:base.assets,revision:base.revision});
  try {await fs.rename(staging,directory);}catch(e:any){if(!['EEXIST','ENOTEMPTY','EPERM'].includes(e.code)) throw e;await fs.rm(staging,{recursive:true,force:true});}
  return id;
}

export async function getRun(gameId:string,id:string) {
  const directory=runDir(gameId,id);
  const state=await reconcileRun(JSON.parse(await fs.readFile(path.join(directory,'state.json'),'utf8')));
  const budget=await fs.readFile(path.join(directory,'budget.json'),'utf8').then(JSON.parse).catch(()=>null);
  let versions:Record<string,string>={baseline:state.baseVersion};
  if(['completed','stopped','failed'].includes(state.status) && state.resultHtml) {
    const base=await loadVersion(gameId,state.baseVersion);if(!base) throw new Error('Missing baseline version');
    await verifyEvidence(directory,'baseline');
    if(state.baseline?.sourceHash!==digest(buildSideScrollerHtml(base.record))) throw new Error('Baseline evidence/source mismatch');
    await withGameLock(gameId,async()=>{
      for(const round of state.history||[]) {
        await verifyEvidence(directory,round.candidate.name);
        await verifyEvidence(directory,'baseline');
        const name=`r${round.round}`;
        const html=await fs.readFile(path.join(directory,`candidate-${round.round}`,'index.html'),'utf8');
        if(digest(html)!==round.candidate.sourceHash) throw new Error('Candidate evidence/source mismatch');
        versions[name]=await derivedVersion(base,html,`${round.promoted?'retained':'rejected'} candidate, run ${id}, round ${round.round}`);
      }
      for(const species of state.evolution?.species||[]) {
        if(species.status!=='alive' || !species.source || species.id==='s0') continue;
        await verifyEvidence(directory,species.evidence);
        const parts=String(species.source).split('/');
        if(parts.length!==2 || parts[0]!=='species') throw new Error('Invalid species source');
        const html=await fs.readFile(path.join(directory,'species',safeId(parts[1]),'index.html'),'utf8');
        if(digest(html)!==species.sourceHash) throw new Error('Species evidence/source mismatch');
        versions[species.id]=await derivedVersion(base,html,`evolved species ${species.name||species.id} · gen ${species.gen} · run ${id}`);
      }
      if(state.evolution) versions.s0=state.baseVersion;
    });
  }
  const evidence=await fs.readdir(path.join(directory,'evidence'),{recursive:true,withFileTypes:true}).catch(()=>[]);
  const files=evidence.filter(e=>e.isFile() && /\.(png|webm|mp4|json)$/.test(e.name)).map(e=>path.relative(path.join(directory,'evidence'),path.join(e.parentPath,e.name)).replace(/\\/g,'/')).sort();
  return {...state,versions,calls:budget?.calls||[],evidence:files};
}

export async function controlRun(gameId:string,id:string,action:string) {
  return withGameLock(gameId,()=>controlUnlocked(gameId,id,action));
}
async function controlUnlocked(gameId:string,id:string,action:string) {
  const directory=runDir(gameId,id);
  const state=JSON.parse(await fs.readFile(path.join(directory,'state.json'),'utf8'));
  if(action==='stop') {await fs.writeFile(path.join(directory,'stop'),'stop');return {ok:true};}
  if(action==='resume') {
    if(!['stopped','failed'].includes(state.status)) throw new Error('Only a stopped or failed run can resume');
    if((await listRuns(gameId)).some(r=>r.id!==id && ['queued','running','stopping'].includes(r.status))) throw new Error('Another run is active for this game');
    await fs.rm(path.join(directory,'stop'),{force:true});await atomicJson(path.join(directory,'state.json'),{...state,status:'queued',error:null,heartbeat:Date.now()/1000});await launch(directory);return {ok:true};
  }
  throw new Error('Unknown run action');
}

export async function saveFeedback(gameId:string,body:any) {
  return withGameLock(gameId,async()=>{
    const version=await loadVersion(gameId,String(body.version));if(!version) throw new Error('Unknown feedback version');
    const file=path.join(dataRoot(),safeId(gameId),'feedback.json');
    const feedback=await fs.readFile(file,'utf8').then(JSON.parse).catch(()=>[]);
    const note=String(body.note||'').trim().slice(0,4000);if(!note) throw new Error('Feedback is empty');
    feedback.push({version:version.id,note,createdAt:new Date().toISOString()});await atomicJson(file,feedback.slice(-100));return {ok:true};
  });
}
