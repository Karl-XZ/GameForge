import { POST as outline } from '../app/api/text/outline/route';
import { POST as scenes } from '../app/api/text/scenes/route';
import { POST as textImages } from '../app/api/text/images/route';
import { POST as plan } from '../app/api/side/plan/route';
import { POST as sideImages } from '../app/api/side/images/route';
import { POST as sideGame } from '../app/api/side/game/route';
import { configuredModels } from './providers';
import { loadGameRecord, saveGameRecord } from './store';
import { generationFingerprint, canResumeGeneration } from './generationConfig';
import { snapshotGame } from './versions';
import { studioEnabled, studioProgress } from './studio';

export async function generateGame(input: Record<string, any>, emit: (event: any) => Promise<void> = async () => {}) {
  const mode = input.mode;
  if (!['text-adventure', 'side-scroller'].includes(mode)) throw new Error('Unknown game mode');
  if (!String(input.prompt || '').trim()) throw new Error('Prompt is required');
  const models = configuredModels();
  const body: Record<string, any> = {...input, textModel: input.textModel || models.defaultText, imageModel: input.imageModel || models.defaultImage};
  let record = body.gameId ? await loadGameRecord(body.gameId) : null;
  if (record && !canResumeGeneration(record,body)) {body.gameId = undefined; record = null;}
  const steps = mode === 'text-adventure' ? [
    {id:'outline', title:'剧情大纲', handler:outline}, {id:'scenes', title:'分支场景', handler:scenes}, {id:'images', title:'场景图片', handler:textImages},
  ] : [{id:'plan',title:'游戏设计与素材',handler:plan}, {id:'images',title:'素材生成',handler:sideImages}, {id:'game',title:'可玩游戏',handler:sideGame}];
  await emit({type:'init',mode,steps:steps.map(({id,title})=>({id,title}))});
  for (let i=0;i<steps.length;i++) {
    const step=steps[i];
    const exists = step.id === 'game' ? record?.gameHtml : step.id === 'images' ? false : (record as any)?.[step.id];
    if (!exists) {
      await emit({type:'step',id:step.id,status:'running',percent:Math.round(i/3*100),message:step.title});
      // While a dsh studio builds the game, stream its real progress (it can take tens of minutes).
      let seen=0;
      const watch=step.id==='game' && body.gameId && studioEnabled(String(record?.textModel||body.textModel)) ? setInterval(async()=>{
        const live=await studioProgress(body.gameId,seen).catch(()=>null); if(!live) return;
        for(const line of live.fresh.slice(-6)) await emit({type:'log',level:'info',message:'制作组 · '+line});
        seen=live.calls;
        await emit({type:'step',id:step.id,status:'running',percent:Math.round(i/3*100),message:`dsh 制作组开发中 · 工具调用 ${live.calls} · 自测 ${live.playtests} 次 · 看截图 ${live.images} 张`});
      },4000) : null;
      const response = await step.handler(new Request('http://internal/stage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).finally(()=>{if(watch) clearInterval(watch);});
      const data=await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || `${step.title} failed`);
      body.gameId=data.gameId;
      await saveGameRecord(body.gameId,{generationConfig:generationFingerprint(body)});
      record=await loadGameRecord(body.gameId);
      await emit({type:'game',gameId:body.gameId});
    }
    await emit({type:'step',id:step.id,status:exists?'skipped':'done',percent:Math.round((i+1)/3*100)});
  }
  const version=await snapshotGame(body.gameId,'initial generation');
  const result={ok:true,mode,gameId:body.gameId,version:version.id};
  await emit({type:'result',result});
  return result;
}
