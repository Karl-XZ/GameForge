import test from 'node:test';import assert from 'node:assert/strict';
import {validatePlayableHtml} from '../src/lib/playableHtml';
test('rejects JavaScript parse failures before presenting a game as ready',()=>{
  assert.throws(()=>validatePlayableHtml('<html><script>window.GameAgentBridge={ready:true}; const broken=(;</script></html>',true),/JavaScript/);
  assert.throws(()=>validatePlayableHtml('<html><script src="https://cdn.test/game.js"></script></html>',true),/external|inline/);
  assert.doesNotThrow(()=>validatePlayableHtml('<html><script>window.GameAgentBridge={ready:true,reset(seed){},observe(){return {won:false}}};</script></html>',true));
});
