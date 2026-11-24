// Verifies existing REAL generated games. Generation and worker runs are separate,
// paid actions; this command does not silently dispatch additional model calls.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import http from 'node:http';
import JSZip from 'jszip';
import {chromium} from 'playwright';
const base=process.env.GAMEFORGE_TEST_URL||'http://127.0.0.1:3210';
const ids=process.argv.slice(2);if(!ids.length)throw Error('Pass existing real game IDs');
const root=path.resolve('output/live-e2e');await fs.mkdir(root,{recursive:true});
const env=Object.fromEntries(['PATH','SystemRoot','TEMP','TMP','USERPROFILE'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const browser=await chromium.launch({headless:true,env,...(process.env.GAMEFORGE_TEST_BROWSER?{channel:process.env.GAMEFORGE_TEST_BROWSER}:{})});
const results=[];
try {
  for(const id of ids) {
    assert.match(id,/^[a-zA-Z0-9_-]+$/);
    const record=(await (await fetch(`${base}/api/games/${id}`)).json()).record;
    const version=(await (await fetch(`${base}/api/versions/${id}`)).json()).current;
    const preview=await (await fetch(`${base}/api/preview/${id}/${version}/index.html`)).text();
    const zipped=Buffer.from(await (await fetch(`${base}/api/export/${id}?version=${version}`)).arrayBuffer());
    const zip=await JSZip.loadAsync(zipped);const html=await zip.file('index.html').async('string');
    assert.equal(html,preview,'Preview/export differ');if(record.mode==='side-scroller')assert.equal(html,record.gameHtml,'Saved/tested bytes differ');
    const manifest=JSON.parse(await zip.file('manifest.json').async('string'));assert.equal(manifest.version,version);
    const directory=path.join(root,id);await fs.mkdir(directory,{recursive:true});
    await fs.writeFile(path.join(directory,'game.zip'),zipped);
    for(const [file,entry] of Object.entries(zip.files)) {
      assert(!file.includes('..')&&!path.isAbsolute(file));if(entry.dir)continue;
      const target=path.join(directory,'offline',file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,await entry.async('nodebuffer'));
    }
    for(const [file,hash] of Object.entries(manifest.assets)) {
      const bytes=await zip.file('assets/'+file).async('nodebuffer');assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);
    }
    const context=await browser.newContext();
    await context.route(/^https?:/,route=>route.abort());
    const page=await context.newPage();const errors=[];const resources=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>resources.push(r.url()));
    await page.goto(pathToFileURL(path.join(directory,'offline/index.html')).href);
    let before,after,choicePaths;
    if(record.mode==='side-scroller') {
      await page.waitForFunction(()=>window.GameAgentBridge?.ready===true,undefined,{timeout:10000});
      before=await page.evaluate(()=>{window.GameAgentBridge.reset(42);return window.GameAgentBridge.observe();});
      await page.keyboard.press('Enter');await page.keyboard.down('ArrowRight');await page.waitForTimeout(400);await page.keyboard.up('ArrowRight');
      after=await page.evaluate(()=>window.GameAgentBridge.observe());
      assert.notDeepEqual(after,before,'Normal input did not change game state');
    } else {
      const graph=new Map(record.scenes.scenes.map(s=>[s.id,s]));
      for(const scene of graph.values())for(const choice of scene.choices)assert(graph.has(choice.nextSceneId));
      const route=(type)=>{const queue=[{id:record.scenes.startingSceneId,path:[]}],seen=new Set();while(queue.length){const node=queue.shift();if(seen.has(node.id))continue;seen.add(node.id);const scene=graph.get(node.id);if(scene.isEnding&&scene.endingType===type)return node.path;for(const choice of scene.choices)queue.push({id:choice.nextSceneId,path:[...node.path,{text:choice.text,id:choice.nextSceneId}]});}throw Error('No reachable '+type+' ending');};
      choicePaths={};
      for(const type of ['win','fail']) {
        const steps=route(type);choicePaths[type]=steps;
        for(const step of steps){await page.getByRole('button',{name:step.text,exact:true}).click();assert.equal(await page.locator('#scene-title').textContent(),graph.get(step.id).title);}
        assert(await page.locator('#ending').isVisible());
        await page.waitForFunction(()=>{const image=document.querySelector('#scene-image');return image.complete&&image.naturalWidth>0;});
        await page.screenshot({path:path.join(directory,`ending-${type}.png`),fullPage:true});
        await page.locator('#restart').click();assert.equal(await page.locator('#scene-title').textContent(),graph.get(record.scenes.startingSceneId).title);
      }
    }
    assert.equal(errors.length,0,errors.join('\n'));assert.deepEqual(resources,[],'Offline resources failed');
    await page.screenshot({path:path.join(directory,'offline-play.png'),fullPage:true});
    results.push({id,mode:record.mode,version,htmlSha256:createHash('sha256').update(html).digest('hex'),assets:Object.keys(manifest.assets).length,offline:true,realInput:true,errors,before,after,choicePaths});
    await context.close();console.log(id,'offline/inputs/assets/bytes PASS');
  }
  const sameOrigin=await fetch(`${base}/api/feedback/${ids[0]}`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'});assert.equal(sameOrigin.status,400);
  const denied=await fetch(`${base}/api/feedback/${ids[0]}`,{method:'POST',headers:{Origin:'null','Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,403);
  const remote=await new Promise((resolve,reject)=>{http.get(`${base}/api/models`,{headers:{host:'example.com'}},res=>{res.resume();resolve(res.statusCode)}).on('error',reject)});assert.equal(remote,403);
  const result={at:new Date().toISOString(),results,crossOriginWritesDenied:true,unconfiguredRemoteDenied:true,humanStudy:false};
  await fs.writeFile(path.join(root,'report.json'),JSON.stringify(result,null,2));console.log('Security boundary PASS');
} finally {await browser.close();}
