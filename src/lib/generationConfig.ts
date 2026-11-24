import {createHash} from 'node:crypto';
import type {GameRecord} from './store';
function settings(input:Record<string,any>) {
  return {mode:input.mode,prompt:String(input.prompt||'').trim(),language:input.language==='en'?'en':'zh',textModel:input.textModel,imageModel:input.imageModel,
    visualMode:input.mode==='side-scroller'?(input.visualMode==='canvas'?'canvas':Number(input.assetLimit)===1?'background':'full'):'scenes'};
}
export function generationFingerprint(input:Record<string,any>) {
  return createHash('sha256').update(JSON.stringify(settings(input))).digest('hex');
}
export function canResumeGeneration(record:GameRecord,input:Record<string,any>) {
  if(record.generationConfig)return record.generationConfig===generationFingerprint(input);
  const expected=settings(input);
  if(record.mode!==expected.mode||record.prompt.trim()!==expected.prompt||record.language!==expected.language||record.textModel!==expected.textModel||record.imageModel!==expected.imageModel)return false;
  if(record.mode==='side-scroller'&&record.plan) {
    const count=record.plan.assets?.length||0;
    const previous=count===0?'canvas':count===1&&record.plan.assets[0]?.type==='background'?'background':'full';
    return expected.visualMode===previous;
  }
  return true;
}
