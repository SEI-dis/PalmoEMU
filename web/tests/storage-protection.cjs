// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('./browser-runtime.cjs');
const base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
 try{
  for(const scenario of ['grant','already','deny','error','unsupported','unknown','estimate-error','pending','native']){
   const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[],external=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base)||!['GET','HEAD'].includes(r.method()))external.push(r.url());});
   if(scenario!=='native')await context.addInitScript(scenario=>{
    window.persistCalls=0;window.granted=scenario==='already';window.outcome=scenario;
    Object.defineProperty(navigator.storage,'persisted',{configurable:true,value:async()=>{if(scenario==='unknown')throw new Error('Status unavailable');return window.granted;}});
    Object.defineProperty(navigator.storage,'persist',{configurable:true,value:scenario==='unsupported'?undefined:async()=>{
     window.persistCalls++;
     if(window.outcome==='error')throw new TypeError('Storage disabled');
     if(window.outcome==='pending')await new Promise(resolve=>window.finishPersist=resolve);
     return window.granted=window.outcome!=='deny';
    }});
    if(scenario==='estimate-error')Object.defineProperty(navigator.storage,'estimate',{configurable:true,value:async()=>{throw new Error('Estimate unavailable');}});
   },scenario);
   await page.goto(base);await page.locator('[data-tab=settings]').click();await page.locator('[data-action=storage]').click();
   await page.waitForFunction(()=>document.querySelector('#persistent-status')?.dataset.state);
   if(scenario==='already'){
    assert.equal(await page.locator('#persistent-status').getAttribute('data-state'),'granted');assert.equal(await page.locator('#persistent').isVisible(),false);assert.equal(await page.locator('#persistent').isDisabled(),true);assert.equal(await page.evaluate(()=>window.persistCalls),0);
   }else if(scenario==='unsupported'){
    assert.equal(await page.locator('#persistent-status').getAttribute('data-state'),'unsupported');assert.equal(await page.locator('#persistent').isDisabled(),true);
   }else{
    if(scenario==='estimate-error')await page.getByText('保存容量を取得できません。',{exact:true}).waitFor();
    if(scenario==='unknown')assert.equal(await page.locator('#persistent-status').getAttribute('data-state'),'unknown');
    if(await page.locator('#persistent').isEnabled()){
     await page.locator('#persistent').click();
     if(scenario==='pending'){
      await page.locator('#persistent-status[data-state=pending]').waitFor();assert.equal(await page.locator('#persistent').isDisabled(),true);
      // A double activation must not queue a second request.
      await page.locator('#persistent').evaluate(b=>b.click());assert.equal(await page.evaluate(()=>window.persistCalls),1);
      await page.locator('#close-sheet').click();await page.locator('[data-action=video]').click();await page.evaluate(()=>window.finishPersist());
      await page.getByRole('heading',{name:'映像とフレームレート'}).waitFor();assert.equal(await page.locator('#persistent-status').count(),0);
     }else{
      await page.waitForFunction(()=>document.querySelector('#persistent-status').dataset.state!=='pending');
      const state=await page.locator('#persistent-status').getAttribute('data-state');
      if(scenario==='native')console.log('Native Edge storage result:',state,await page.locator('#persistent-status').textContent());
      else assert.equal(state,scenario==='deny'?'denied':scenario==='error'?'error':'granted');
      assert.equal(await page.locator('#persistent').isDisabled(),state==='granted');
      if(scenario==='error'){
       await page.evaluate(()=>window.outcome='grant');await page.locator('#persistent').click();await page.locator('#persistent-status[data-state=granted]').waitFor();assert.equal(await page.evaluate(()=>window.persistCalls),2);
      }
      if(scenario==='grant'){
       await page.locator('#close-sheet').click();await page.locator('[data-action=storage]').click();await page.locator('#persistent-status[data-state=granted]').waitFor();assert.equal(await page.evaluate(()=>window.persistCalls),1);
      }
     }
    }
   }
   if(process.env.SCREENSHOT_DIR&&['grant','deny','unsupported','native'].includes(scenario)){
    fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`storage-${scenario}.png`)});
   }
   // Also verify the common toast layer while a modal is open, and after it closes.
   if(scenario==='grant'){
    await page.locator('#close-sheet').click();await page.locator('[data-action=skins]').click();await page.locator('#skin-preview .skin-mini').waitFor();
    await page.locator('#import-skin').click();await page.locator('#skin-input').setInputFiles({name:'invalid.deltaskin',mimeType:'application/octet-stream',buffer:Buffer.from('invalid test fixture')});
    await page.locator('#toast.show').waitFor();assert.equal(await page.locator('#toast').evaluate(t=>t.parentElement===document.querySelector('#sheet')),true);
    await page.locator('#close-sheet').click();await page.waitForFunction(()=>document.querySelector('#toast').parentElement===document.body);
   }
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await context.close();
   console.log('PASS:',scenario);
  }
 }finally{await Promise.race([browser.close(),new Promise(r=>setTimeout(r,2500))]);}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
