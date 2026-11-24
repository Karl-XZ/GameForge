import test from 'node:test';import assert from 'node:assert/strict';
import {generationFingerprint,canResumeGeneration} from '../src/lib/generationConfig';
test('only identical generation settings resume; visual, language and model changes start a new game',()=>{
  const input={mode:'side-scroller',prompt:'Moon',language:'zh',textModel:'qwen/text',imageModel:'qwen/image',visualMode:'canvas'};
  const record:any={...input,plan:{assets:[]},generationConfig:generationFingerprint(input)};
  assert.equal(canResumeGeneration(record,input),true);
  for(const patch of [{visualMode:'full'},{assetLimit:1,visualMode:undefined},{language:'en'},{textModel:'deepseek/text'},{prompt:'Forest'}])assert.equal(canResumeGeneration(record,{...input,...patch}),false);
  delete record.generationConfig;
  assert.equal(canResumeGeneration(record,input),true);
  assert.equal(canResumeGeneration(record,{...input,visualMode:'full'}),false);
});
