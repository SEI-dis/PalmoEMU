// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated HTTP deployments, real Service Workers and the production updater.
// No application source substitution except the staging-help timer. Opt into
// one real >60-second wait with UPDATE_RECOVERY_LONG=1 (Chromium only).
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const engine=process.env.BROWSER_ENGINE||'chromium',runtime=require('./browser-runtime.cjs'),root=path.resolve(__dirname,'..');
const modules=['src/updates/auto-update.js','src/updates/offline.js','src/updates/update-activity.js','src/updates/controller-activation.js','src/updates/download-progress.js','src/updates/auto-update-worker.js','src/core/development.js','src/i18n/index.js','src/i18n/format.js','src/i18n/languages.js','src/i18n/locales/en.js'];
// Reading an earlier complete source revision permits a red/green check without
// changing the worktree or substituting the behavior being tested.
const baseline=process.env.UPDATE_RECOVERY_BASELINE;
const sources=new Map(['sw.js',...modules].map(name=>[name,baseline?require('node:child_process').execFileSync('git',['show',baseline+':web/'+name],{cwd:root,encoding:'utf8',windowsHide:true}):fs.readFileSync(path.join(root,name),'utf8')]));
const names=['index.html','fixture.js',...modules,'assets/update-payload.bin'],shell=names.filter(name=>name!=='assets/update-payload.bin');
const requested=process.env.UPDATE_RECOVERY_CASE?.split(','),allCases=['transient503','disconnect','recover','later','continue','pending','lease','lease-cancel','lease-reject'];
let revision=1,helpMs=1200,assetMode='ok',failuresLeft=0,requests=0,held=[],heldAt=0,caseName='';
function releaseAsset(){assetMode='ok';for(const finish of held.splice(0))finish();}
function resource(name){
 if(name==='index.html')return Buffer.from('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="app-build" content="recovery-'+revision+'"><title>Update recovery fixture</title><main>Release '+revision+'</main><script type="module" src="fixture.js"></script>');
 if(name==='fixture.js')return Buffer.from(`import {startAutoUpdates} from './src/updates/auto-update.js';
  globalThis.fixtureRevision=${revision};globalThis.safeToUpdate=true;
  globalThis.updater=await startAutoUpdates(()=>safeToUpdate,()=>{},()=>{sessionStorage.setItem('failures',String(Number(sessionStorage.getItem('failures')||0)+1));},{beforeReload:()=>{sessionStorage.setItem('reloads',String(Number(sessionStorage.getItem('reloads')||0)+1));},onContinue:()=>{globalThis.continued=true;}});
  globalThis.fixtureReady=true;`);
 if(name==='assets/update-payload.bin')return Buffer.from('Verified update payload '+revision+'\n'.repeat(1024));
 let source=sources.get(name);assert.equal(typeof source,'string',name);
 if(name==='sw.js')source+='\n// isolated recovery deployment '+revision;
 if(name==='src/updates/auto-update.js'&&helpMs!==60000){
  let replacements=0;source=source.replace(/(stageTimer=setTimeout\([\s\S]*?),60000\)/g,(_,prefix)=>{replacements++;return prefix+','+helpMs+')';});
  assert.equal(replacements,1,'Only the staging-help timer is shortened');
 }
 return Buffer.from(source);
}
const server=http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',name.endsWith('.html')?'text/html':name.endsWith('.bin')?'application/octet-stream':'text/javascript');
 if(name==='offline-manifest.js'){
  const manifest={version:'recovery-'+revision,files:names,shell,bytes:4096,integrity:Object.fromEntries(names.map(file=>[file,'sha256-'+crypto.createHash('sha256').update(resource(file)).digest('base64')]))};
  res.end('self.APP_OFFLINE='+JSON.stringify(manifest)+';');return;
 }
 if(name!=='sw.js'&&!names.includes(name)){res.writeHead(404).end();return;}
 if(name==='assets/update-payload.bin'&&revision===2){
  requests++;
  if(assetMode==='hold'){heldAt||=Date.now();const bytes=resource(name);held.push(()=>{if(!res.destroyed)res.end(bytes);});return;}
  if(assetMode==='permanent'||failuresLeft>0){
   if(failuresLeft>0)failuresLeft--;
   if(assetMode==='disconnect'){req.socket.destroy();return;}
   res.writeHead(503).end('Temporary origin failure');return;
  }
 }
 res.end(resource(name));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port+'/';
 const browser=await runtime[engine].launch({headless:true,...(engine==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  for(caseName of allCases.filter(name=>!requested||requested.includes(name))){
   revision=1;assetMode='ok';failuresLeft=0;requests=0;held=[];heldAt=0;
   const realWait=caseName==='pending'&&engine==='chromium'&&process.env.UPDATE_RECOVERY_LONG==='1';helpMs=realWait?60000:1200;
   const context=await browser.newContext({locale:'ja-JP'}),page=await context.newPage();page.setDefaultTimeout(25000);
   await context.addInitScript(()=>{
    localStorage.setItem('palmo-language','ja');
    const update=ServiceWorkerRegistration.prototype.update,checks=globalThis.fixtureUpdateChecks={count:0,pending:0,completed:0};
    ServiceWorkerRegistration.prototype.update=function(...args){
     globalThis.fixtureUpdateRegistration=this;checks.count++;checks.pending++;
     const finish=()=>{checks.pending--;checks.completed++;};
     try{return update.apply(this,args).finally(finish);}catch(error){finish();throw error;}
    };
   });
   if(caseName.startsWith('lease')){
    // Keep the real shared lock held briefly after the app resolves its lease.
    // A ready reply must wait for the LockManager request itself to complete.
    await context.addInitScript(mode=>{
     const request=navigator.locks.request.bind(navigator.locks);let releases=0;
     navigator.locks.request=(name,options,callback)=>request(name,options,options?.mode==='shared'&&name==='local-play-version:/'?async lock=>{
      const result=await callback(lock);globalThis.leaseReleasePending=true;
      const first=++releases===1;sessionStorage.setItem('lease-releases',String(Number(sessionStorage.getItem('lease-releases')||0)+1));
      await new Promise(resolve=>setTimeout(resolve,mode==='lease-cancel'&&first?2500:250));globalThis.leaseReleasePending=false;
      if(mode==='lease-reject'&&first)throw Error('Synthetic lease completion failure');return result;
     }:callback);
    },caseName);
   }
   try{
     await page.goto(base);
     // fixtureReady precedes the updater's asynchronous initial check. Finish
     // that job before deploying revision 2, or update() may join the old job.
     await page.waitForFunction(()=>{
      const checks=globalThis.fixtureUpdateChecks,registration=globalThis.fixtureUpdateRegistration;
      return globalThis.fixtureReady&&!!navigator.serviceWorker.controller&&checks?.count>0&&checks.completed>0&&checks.pending===0&&!!registration&&!registration.installing&&!registration.waiting;
     });
    await page.evaluate(async()=>{
     sessionStorage.setItem('failures','0');sessionStorage.setItem('reloads','0');sessionStorage.setItem('lease-releases','0');
     const request=indexedDB.open('update-save-sentinel',1);request.onupgradeneeded=()=>request.result.createObjectStore('saves');
     const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
     await new Promise((resolve,reject)=>{const tx=db.transaction('saves','readwrite');tx.objectStore('saves').put(new Uint8Array([7,9,42]),'keep');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
    });
    async function sentinel(){return page.evaluate(async()=>{
     const request=indexedDB.open('update-save-sentinel',1),db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
     const bytes=await new Promise((resolve,reject)=>{const read=db.transaction('saves').objectStore('saves').get('keep');read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(read.error);});db.close();return [...bytes];
    });}
    async function oldVersion(){return page.evaluate(()=>new Promise(resolve=>{
     const channel=new MessageChannel();channel.port1.onmessage=event=>{channel.port1.close();resolve(event.data.version);};navigator.serviceWorker.controller.postMessage({type:'app-version'},[channel.port2]);
    }));}
    async function update(){await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});}
    async function applied(expectedFailures){
     await page.waitForFunction(()=>globalThis.fixtureRevision===2&&globalThis.fixtureReady);
     assert.equal(await oldVersion(),'recovery-2');assert.deepEqual(await sentinel(),[7,9,42]);
     assert.equal(await page.evaluate(()=>Number(sessionStorage.getItem('failures'))),expectedFailures,'Unexpected failure dialog in '+caseName);
     assert.equal(await page.locator('.update-progress[open]').count(),0);
    }
    revision=2;
    if(caseName.startsWith('lease')){
     await update();await page.waitForFunction(()=>globalThis.leaseReleasePending===true);
     assert.equal(await page.evaluate(()=>fixtureRevision),1,'The page stays on its current build while its shared lock is releasing');
     await page.waitForFunction(()=>globalThis.fixtureRevision===2&&globalThis.fixtureReady,{},{timeout:10000});await applied(0);
     if(caseName!=='lease')assert.ok(await page.evaluate(()=>Number(sessionStorage.getItem('lease-releases'))>=2),'Cancellation/failure reacquires a shared lease before another preparation');
     console.log('PASS '+engine+': '+caseName+' waits for shared-lock release and safely recovers from cancelled/rejected preparation.');
    }else if(['transient503','disconnect'].includes(caseName)){
     assetMode=caseName==='disconnect'?'disconnect':'transient';failuresLeft=1;
     await update();await applied(0);assert.ok(requests>=2,'The failed asset must be requested again');
     console.log('PASS '+engine+': '+caseName+' recovers the same build automatically, without a failure dialog or save loss.');
    }else if(['recover','later'].includes(caseName)){
     assetMode='permanent';await update();await page.locator('.update-progress[data-phase=failed][open]').waitFor();
     assert.equal(await oldVersion(),'recovery-1');assert.equal(await page.evaluate(()=>fixtureRevision),1);assert.deepEqual(await sentinel(),[7,9,42]);
     const dialog=page.locator('.update-progress');assert.equal(await dialog.locator('.update-manual').isVisible(),true);assert.equal(await dialog.locator('button').textContent(),'あとで');assert.equal(await dialog.locator('button').isEnabled(),true);
     assert.ok(requests>=1&&requests<=3,'A permanent failure has bounded retries');
     if(caseName==='later')await dialog.locator('button').click();
     else await page.evaluate(()=>{safeToUpdate=false;});
     assetMode='ok';await update();await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
     await page.waitForTimeout(1500);assert.equal(await page.evaluate(()=>fixtureRevision),1,'Unsafe/deferred pages must keep the old version');
     if(caseName==='recover'){
      await page.evaluate(()=>{safeToUpdate=true;updater.refresh();});await applied(1);
      console.log('PASS '+engine+': real permanent failure keeps the old app; a same-build replacement automatically recovers only when safe.');
     }else{
      assert.equal(await page.locator('.update-progress[open]').count(),0);assert.equal(await page.evaluate(()=>Number(sessionStorage.getItem('reloads'))),0);assert.deepEqual(await sentinel(),[7,9,42]);
      console.log('PASS '+engine+': Later remains deferred after a repaired same-build candidate arrives.');
     }
    }else{
     assetMode='hold';await update();await page.locator('.update-progress[data-phase=downloading][open]').waitFor();
     if(realWait)console.log('Waiting for the real 60-second help timer; the response remains pending.');
     await page.locator('.update-progress button').waitFor({state:'visible',timeout:realWait?70000:10000});
     if(realWait){
      assert.ok(heldAt,'The response is still held by the origin');
      await page.waitForTimeout(Math.max(0,61000-(Date.now()-heldAt)));
      assert.ok(Date.now()-heldAt>=61000,'The real pending response exceeds 60 seconds');
     }
     assert.equal(await page.evaluate(()=>fixtureRevision),1);assert.equal(await page.locator('.update-progress').getAttribute('data-phase'),'downloading');
     assert.equal(await page.locator('.update-manual').isVisible(),false);assert.equal(await page.evaluate(()=>Number(sessionStorage.getItem('failures'))),0);
     if(caseName==='continue')await page.locator('.update-progress button').click();
     releaseAsset();
     if(caseName==='continue'){
      await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);await page.waitForTimeout(1500);
      assert.equal(await page.evaluate(()=>fixtureRevision),1);assert.equal(await page.locator('.update-progress[open]').count(),0);assert.deepEqual(await sentinel(),[7,9,42]);
      console.log('PASS '+engine+': Continue keeps a completed pending download deferred.');
     }else{
      await applied(0);console.log('PASS '+engine+': '+(realWait?'real >60-second':'shortened-help')+' pending download remains nonfatal and applies automatically when completed.');
     }
    }
   }catch(error){
    console.error('RECOVERY FIXTURE',JSON.stringify({caseName,engine,revision,requests,assetMode,state:await page.evaluate(()=>({revision:globalThis.fixtureRevision,ready:globalThis.fixtureReady,checks:globalThis.fixtureUpdateChecks,phase:document.querySelector('.update-progress')?.dataset.phase,open:document.querySelector('.update-progress')?.open,failures:sessionStorage.getItem('failures')})).catch(()=>null)}));throw error;
   }finally{releaseAsset();await context.close();}
  }
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
