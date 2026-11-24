import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSideScrollerGameHtmlPrompt} from '../src/lib/prompts';
import {TextAdventureScenesSchema} from '../src/lib/schemas';
test('new games must expose real state and reset without test-only victory shortcuts', () => {
  const prompt = buildSideScrollerGameHtmlPrompt({plan:{}, assets:[]});
  assert.match(prompt, /GameAgentBridge/);
  assert.match(prompt, /reset\(seed\)/);
  assert.match(prompt, /observe\(\)/);
});
test('scene graph rejects a choice pointing to a missing scene', () => {
  const scenes=Array.from({length:6},(_,i)=>({id:`s${i}`,title:'x',text:'x',cgPrompt:'x',choices:[{text:'go',nextSceneId:'missing'}]}));
  assert.equal(TextAdventureScenesSchema.safeParse({title:'x',language:'en',setting:'x',tone:'x',startingSceneId:'s0',scenes}).success,false);
});
