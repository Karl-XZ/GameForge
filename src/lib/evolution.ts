import {promises as fs} from 'node:fs';
import path from 'node:path';
import {dataRoot, safeId, listGames, safeFile} from './store';
import {atomicJson, digest} from './versions';
import {listRuns, runDir, getRun} from './improvement';
import {withGameLock} from './lock';
import {complete, configuredModels} from './providers';

export type Persona = {id:string;arch:string;archLabel:string;name:string;bio:string;style:string;follows:string[]};
let personaCache: {archetypes:Record<string,string>;people:Persona[]}|null=null;
export async function personas() {
  if(!personaCache) personaCache=JSON.parse(await fs.readFile(path.join(process.cwd(),'worker','personas.json'),'utf8'));
  return personaCache!;
}

const likesFile=(gameId:string)=>path.join(dataRoot(),safeId(gameId),'likes.json');
async function readLikes(gameId:string):Promise<Record<string,number>> {
  return fs.readFile(likesFile(gameId),'utf8').then(JSON.parse).catch(()=>({}));
}

async function speciesFrames(gameId:string,runId:string,evidence?:string) {
  if(!evidence) return [];
  const folder=path.join(runDir(gameId,runId),'evidence',safeId(evidence));
  const files=(await fs.readdir(folder).catch(()=>[])).filter(f=>/^episode-\d+\.json$/.test(f)).sort();
  const frames:string[]=[];
  for(const file of files) {
    const data=await fs.readFile(path.join(folder,file),'utf8').then(JSON.parse).catch(()=>null);
    for(const step of data?.steps||[]) if(typeof step.frame==='string' && /^runtime\/frame-[a-f0-9]+\.png$/.test(step.frame)) frames.push(`${evidence}/${step.frame}`);
  }
  if(frames.length<=10) return frames;
  return Array.from({length:10},(_,i)=>frames[Math.floor(i*(frames.length-1)/9)]);
}

/** Every evolution run of a game, with species, live state and human selections. */
export async function gameEvolution(gameId:string) {
  const runs=(await listRuns(gameId)).filter(r=>r.kind==='evolve');
  const detailed=[];
  for(const run of runs) {
    try {
      const full=await getRun(gameId,run.id);
      for(const species of full.evolution?.species||[]) species.frames=await speciesFrames(gameId,run.id,species.evidence);
      detailed.push(full);
    }
    catch(e){detailed.push({...run,integrityError:String(e)});}
  }
  return {runs:detailed,likes:await readLikes(gameId),personas:await personas()};
}

export async function likeSpecies(gameId:string,runId:string,sid:string) {
  safeId(runId);safeId(sid);
  return withGameLock(gameId,async()=>{
    const state=JSON.parse(await fs.readFile(path.join(runDir(gameId,runId),'state.json'),'utf8'));
    if(!(state.evolution?.species||[]).some((s:any)=>s.id===sid && s.status==='alive')) throw new Error('Unknown species');
    const likes=await readLikes(gameId);const key=`${runId}:${sid}`;likes[key]=(likes[key]||0)+1;
    await atomicJson(likesFile(gameId),likes);return {ok:true,likes:likes[key]};
  });
}

/** Header statistics across all games. */
export async function overview() {
  const games=await listGames();let species=0,alive=0,calls=0,runs=0,likes=0,generations=0;
  for(const game of games) {
    for(const run of await listRuns(game.id)) {
      const budget=await fs.readFile(path.join(runDir(game.id,run.id),'budget.json'),'utf8').then(JSON.parse).catch(()=>null);
      calls+=budget?.calls?.length||0;
      if(run.kind!=='evolve') continue;
      runs++;const list=run.evolution?.species||[];species+=list.length;alive+=list.filter((s:any)=>s.status==='alive').length;
      generations=Math.max(generations,run.evolution?.generation||0);
    }
    likes+=Object.values(await readLikes(game.id)).reduce((a,b)=>a+b,0);
  }
  return {games:games.length,runs,species,alive,calls,likes,generations};
}

export async function interview(gameId:string,runId:string,body:any) {
  const sid=safeId(String(body.species||''));const personaId=String(body.persona||'');
  const question=String(body.question||'').trim().slice(0,300);if(!question) throw new Error('Question is empty');
  const state=JSON.parse(await fs.readFile(path.join(runDir(gameId,runId),'state.json'),'utf8'));
  const species=(state.evolution?.species||[]).find((s:any)=>s.id===sid);if(!species) throw new Error('Unknown species');
  const person=(await personas()).people.find(p=>p.id===personaId);if(!person) throw new Error('Unknown persona');
  const post=(species.society?.posts||[]).find((p:any)=>p.persona===person.id||p.arch===person.arch);
  const history=(Array.isArray(body.history)?body.history:[]).slice(-6).map((h:any)=>({q:String(h.q||'').slice(0,300),a:String(h.a||'').slice(0,400)}));
  const zh=(state.language||'zh')!=='en';
  const prompt=`You are role-playing a simulated player in GameForge Darwin Evolution's player society. Stay in character, answer in ${zh?'Simplified Chinese':'English'}, at most 90 ${zh?'Chinese characters':'words'}, conversational, concrete.
Persona: ${person.name} (${person.archLabel}) — ${person.bio}; speaking style: ${person.style}.
The game species you tried: ${JSON.stringify({name:species.name,latin:species.latin,gene:species.gene,hypothesis:species.hypothesis,changes:species.changes})}
Your community post about it: ${JSON.stringify(post||{note:'you heard about it from friends but your archetype has no post'})}
What the real recorded play sessions showed (bridge state, not invented): ${JSON.stringify((species.play?.episodes||[]).map((e:any)=>({purpose:e.purpose?.slice(0,40),steps:e.steps,final:e.final})).slice(0,3)).slice(0,2500)}
Community summary: ${species.society?.summary||''}
Ground every claim in the post and play facts above; if asked something they do not cover, say you are not sure. Never claim to be a real human if asked directly.
Conversation so far: ${JSON.stringify(history)}
Question: ${question}
Return only your answer text.`;
  const model=state.model||configuredModels().defaultText;
  const answer=await complete({model,prompt});
  return {ok:true,answer:answer.replace(/^["“]|["”]$/g,'').slice(0,600),persona:person.id};
}

export async function speciesFile(gameId:string,runId:string,sid:string,file:string[]) {
  safeId(sid);
  const directory=runDir(gameId,runId);
  const state=JSON.parse(await fs.readFile(path.join(directory,'state.json'),'utf8'));
  const species=(state.evolution?.species||[]).find((s:any)=>s.id===sid);
  if(!species?.source || !species.sourceHash) throw new Error('Species not playable');
  const parts=String(species.source).split('/');
  const folder=parts[0]==='baseline'&&parts.length===1?path.join(directory,'baseline'):parts.length===2&&parts[0]==='species'?path.join(directory,'species',safeId(parts[1])):null;
  if(!folder) throw new Error('Invalid species source');
  if(file.join('/')==='index.html') {
    const html=await fs.readFile(path.join(folder,'index.html'),'utf8');
    if(digest(html)!==species.sourceHash) throw new Error('Species integrity failure');
    return {html};
  }
  if(file.length!==2||file[0]!=='assets') throw new Error('Not found');
  return {bytes:await fs.readFile(path.join(folder,'assets',safeFile(file[1])))};
}
