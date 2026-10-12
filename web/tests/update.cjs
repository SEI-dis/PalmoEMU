// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const browserName=process.env.BROWSER_ENGINE||'chromium',browserType=require('./browser-runtime.cjs')[browserName];
(async()=>{
 const root=path.resolve(__dirname,'..'),manifestScope={self:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'offline-manifest.js'),'utf8'),manifestScope);
 const lazyAsset=manifestScope.self.APP_OFFLINE.files.find(name=>name.startsWith('cores/')&&name.endsWith('.js'));
 assert.ok(lazyAsset);let revision=1,staleBootstrap=true,failAsset=null,originUnavailable=false;
 const server=http.createServer((req,res)=>{
  if(originUnavailable){req.socket.destroy();return;}
  const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  if(name===failAsset){res.writeHead(503,{'Cache-Control':'no-store'}).end('Simulated interrupted update');return;}
  const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml','.txt':'text/plain','.md':'text/plain'};
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  // Reproduce a static host's still-fresh HTTP cache independently of Cache Storage.
  res.setHeader('Cache-Control','public, max-age=3600');let bytes=fs.readFileSync(file);
  if(name==='/sw.js')bytes=Buffer.concat([bytes,Buffer.from('\n// update-test revision '+revision)]);
  if(name==='/src/auto-update-worker.js'&&revision===3)bytes=Buffer.from(bytes.toString().replace('await self.skipWaiting();','await new Promise(resolve=>setTimeout(resolve,1500));await self.skipWaiting();'));
  if(name==='/offline-manifest.js')bytes=Buffer.from(bytes.toString().replace(/"version":"[^"]+"/,`"version":"update-test-${revision}"`));
  if(name==='/index.html')bytes=Buffer.from(bytes.toString().replace(/(<meta name="app-build" content=")[^"]+/,`$1update-test-${revision}`));
  if(name==='/index.html'&&req.url.includes('new-tab=1')){
   res.setHeader('Cache-Control','no-store');
   if(staleBootstrap){staleBootstrap=false;bytes=Buffer.from(bytes.toString().replace(/(<meta name="app-build" content=")[^"]+/,`$1update-test-${revision-1}`));}
  }
  if(name==='/src/views/settings.js')bytes=Buffer.concat([bytes,Buffer.from('\nglobalThis.updateTestRevision='+revision+';')]);
  if(name==='/'+lazyAsset)bytes=Buffer.concat([bytes,Buffer.from('\n// lazy asset revision '+revision)]);
  res.end(bytes);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port+'/';
 const browser=await browserType.launch({headless:true,...(browserName==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();await page.goto(base+'index.html');
  // Playwright WebKit's offline flag rejects even cached SW navigations (#42775).
  // Use a real origin outage there; Edge also exercises the native online event.
  async function connection(offline){
   if(browserName!=='webkit')return context.setOffline(offline);
   originUnavailable=offline;
   if(!offline)for(const client of context.pages())await client.evaluate(()=>window.dispatchEvent(new Event('online')));
  }
  async function cachedReload(client){const response=await client.reload();assert.equal(response.fromServiceWorker(),true,'Reload is served by the app worker, not the HTTP cache');await client.locator('.game-launch').waitFor();}
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;const db=await import('./src/storage.js');await db.put('saves','keep',{bytes:new Uint8Array([7,9]),at:1});});
  await page.waitForFunction(()=>globalThis.updateTestRevision===1);
  assert.match(await page.evaluate(name=>fetch(name).then(r=>r.text()),lazyAsset),/lazy asset revision 1/);
  const update=await context.newPage();await update.goto(base+'update.html');
  await update.getByText('最新の状態です。',{exact:true}).waitFor();assert.equal(await update.locator('#apply-update').isDisabled(),true,'No pending update must leave the update button disabled');
  await update.locator('#apply-update').dispatchEvent('click');assert.equal(update.url(),base+'update.html','A stale click must not navigate when there is no pending update');
  revision=2;await update.reload();
  await update.getByText('更新できます。',{exact:true}).waitFor();await update.locator('#apply-update:enabled').click();
  await update.getByText('この画面以外のアプリのタブを閉じてください。',{exact:true}).waitFor();
  await page.close();await update.locator('#apply-update').click();await update.waitForURL(base+'index.html');
  const data=await update.evaluate(async()=>{const db=await import('./src/storage.js');return [...(await db.get('saves','keep')).bytes];});
  assert.deepEqual(data,[7,9]);assert.equal(await update.evaluate(()=>globalThis.updateTestRevision),2,'New worker must not install shell files from an old HTTP cache');
  assert.match(await update.evaluate(name=>fetch(name).then(r=>r.text()),lazyAsset),/lazy asset revision 2/,'First core request after update must bypass old HTTP cache');
  assert.deepEqual(await update.evaluate(()=>caches.keys()),['manic-web:/:update-test-2']);
  await update.goto(base+'update.html');await update.getByText('最新の状態です。',{exact:true}).waitFor();assert.equal(await update.locator('#apply-update').isDisabled(),true,'The button becomes disabled after applying the update');await update.goto(base+'index.html');
  console.log('PASS: update blocks other tabs, preserves saves, and refreshes shell and lazy core assets despite a still-fresh HTTP cache.');
  const second=await context.newPage();await second.goto(base+'index.html');
  await second.locator('#rom-input').setInputFiles({name:'Original-update-test.gb',mimeType:'application/octet-stream',buffer:Buffer.from(require('./cartridges.cjs').gb())});
  await second.locator('.game-launch').click();await second.locator('.game-info-play').click();await second.locator('#loading').waitFor({state:'hidden'});
  await update.locator('[data-tab=settings]').click();await update.locator('[data-action=video]').click();
  revision=3;await update.evaluate(async()=>{await(await navigator.serviceWorker.ready).update();});
  const stays=async expected=>{await update.waitForTimeout(4000);assert.equal(await update.evaluate(()=>globalThis.updateTestRevision),expected);assert.equal(await second.evaluate(()=>globalThis.updateTestRevision),expected);};
  await stays(2);assert.equal(await second.locator('#player').isVisible(),true,'An active game in another tab blocks automatic update');
  await second.locator('#player-menu').click();await second.locator('[data-action=exit]').click();await second.locator('#player').waitFor({state:'hidden'});
  await stays(2);assert.equal(await update.locator('#sheet').isVisible(),true,'An open settings dialog is not discarded');
  // Keep this fixture transition atomic even on a slow CI runner. The actual
  // offline download owns its own pending-task guard once its button is used.
  await update.evaluate(async()=>{const {guardUpdateTask}=await import('./src/update-activity.js');guardUpdateTask(()=>new Promise(resolve=>{window.finishOpenOfflineDialog=resolve;}))();});
  await update.locator('#close-sheet').click();
  await update.evaluate(()=>{const send=ServiceWorker.prototype.postMessage;ServiceWorker.prototype.postMessage=function(message,...rest){if(message?.type==='download'){window.finishOfflineDownload=()=>{ServiceWorker.prototype.postMessage=send;send.call(this,message,...rest);};return;}return send.call(this,message,...rest);};});
  await update.locator('[data-action=offline]').click();await update.locator('#offline-download').click();
  await update.waitForFunction(()=>typeof window.finishOfflineDownload==='function');await update.evaluate(()=>finishOpenOfflineDialog());await update.locator('#close-sheet').click();
  await stays(2);
  await update.evaluate(async()=>{const {guardUpdateTask}=await import('./src/update-activity.js');guardUpdateTask(()=>new Promise(resolve=>{window.finishUpdateTestTask=resolve;}))();});
  await update.evaluate(()=>finishOfflineDownload());
  await stays(2);
  const pickerEvent=update.waitForEvent('filechooser');await update.locator('#rom-input').evaluate(input=>input.click());const picker=await pickerEvent;
  await update.evaluate(()=>finishUpdateTestTask());await stays(2);
  await update.emulateMedia({reducedMotion:'reduce'});
  await picker.setFiles([]);await update.locator('#rom-input').dispatchEvent('cancel');
  await update.getByRole('dialog',{name:'更新中…',exact:true}).waitFor();
  const progress=await update.locator('.update-progress').boundingBox();
  assert.ok(Math.abs(progress.x+progress.width/2-195)<2&&Math.abs(progress.y+progress.height/2-422)<2,'Update progress stays at the center of the phone viewport');
  assert.equal(await update.locator('.update-progress').evaluate(el=>el.scrollWidth>el.clientWidth||el.scrollHeight>el.clientHeight),false,'Update progress has no clipped text or spinner');
  assert.equal(await update.locator('.update-spinner').evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.equal(await second.locator('.update-spinner').evaluate(el=>getComputedStyle(el).animationName),'update-spin');
  await second.screenshot({path:path.join(process.env.SCREENSHOT_DIR||require('node:os').tmpdir(),'local-play-auto-update-'+browserName+'.png')});
  await update.waitForFunction(()=>globalThis.updateTestRevision===3,{},{timeout:30000});await second.waitForFunction(()=>globalThis.updateTestRevision===3);await second.locator('.game-launch').waitFor();await update.locator('.settings-page').waitFor();
  await update.locator('#toast.show').filter({hasText:'更新しました。'}).waitFor();
  assert.equal(new URL(update.url()).hash,'#settings','Automatic reload retains the selected tab');
  assert.equal(await second.locator('.game-launch').count(),1,'Automatic reload retains the original cartridge');
  assert.deepEqual(await update.evaluate(async()=>[...(await(await import('./src/storage.js')).get('saves','keep')).bytes]),[7,9]);
  assert.equal(await update.evaluate(async()=>(await(await import('./src/offline.js')).offlineStatus()).ready),true,'Updated app includes every offline resource, including newly used cores');
  console.log('PASS: automatic update waits for another tab to exit a game, settings dialogs, asynchronous tasks and native file selection; then refreshes every idle tab and preserves data.');
  await update.evaluate(()=>{
   let started;
   new MutationObserver(()=>{const el=document.querySelector('.update-progress');if(el.open&&el.getAttribute('aria-label')==='更新中…'&&started===undefined)started=performance.now();}).observe(document.querySelector('.update-progress'),{attributes:true});
   window.addEventListener('pagehide',()=>{if(started!==undefined)sessionStorage.setItem('update-test-visible-ms',String(performance.now()-started));});
  });
  const unknown=await context.newPage();await unknown.goto(base+'privacy.html');revision=4;
  await update.evaluate(async()=>{await(await navigator.serviceWorker.ready).update();});await stays(3);
  await unknown.close();await update.waitForFunction(()=>globalThis.updateTestRevision===4,{},{timeout:30000});await second.waitForFunction(()=>globalThis.updateTestRevision===4);await second.locator('.game-launch').waitFor();await update.locator('.settings-page').waitFor();
  assert.ok(Number(await update.evaluate(()=>sessionStorage.getItem('update-test-visible-ms')))>=1100,'Even a fast activation leaves the update notice visible for about 1.2 seconds');
  // Become busy after answering the probe. All prepared tabs must be released.
  await second.evaluate(async()=>{
   const {guardUpdateTask}=await import('./src/update-activity.js');
   const once=event=>{if(event.data?.type!=='local-play-update-probe')return;navigator.serviceWorker.removeEventListener('message',once);guardUpdateTask(()=>new Promise(resolve=>{window.finishLateUpdateTask=resolve;}))();};
   navigator.serviceWorker.addEventListener('message',once);
  });
  revision=5;await update.evaluate(async()=>{await(await navigator.serviceWorker.ready).update();});await stays(4);
  assert.equal(await update.evaluate(()=>document.body.inert),false,'An aborted preparation unfreezes already prepared tabs');
  await second.evaluate(()=>finishLateUpdateTask());await update.waitForFunction(()=>globalThis.updateTestRevision===5,{},{timeout:30000});await second.waitForFunction(()=>globalThis.updateTestRevision===5);await second.locator('.game-launch').waitFor();await update.locator('.settings-page').waitFor();
  console.log('PASS: unknown/old pages block automatic activation; a task started between probe and preparation cancels safely and retries after completion.');
  const late=await context.newPage();let navigations=0;late.on('framenavigated',frame=>{if(frame===late.mainFrame())navigations++;});
  await late.goto(base+'index.html?new-tab=1');await late.locator('.game-launch').waitFor();
  assert.ok(navigations>=2,'Old HTML arriving after activation is reloaded before app actions become available');
  assert.equal(await late.locator('meta[name=app-build]').getAttribute('content'),'update-test-5');
  assert.equal(await late.evaluate(()=>document.body.inert),false);
  assert.equal(await late.locator('#toast.show').filter({hasText:'更新しました。'}).count(),0,'Opening a new tab does not show a false update-complete notice');
  console.log('PASS: a newly opened tab with stale HTML refreshes before enabling app actions.');
  await late.close();
  assert.match(await second.evaluate(name=>fetch(name).then(r=>r.text()),lazyAsset),/lazy asset revision 5/);
  await update.evaluate(async()=>{
   const reg=await navigator.serviceWorker.ready;
   reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker.addEventListener('statechange',()=>{if(worker.state==='redundant')window.updateInstallFailed=true;});});
  });
  await connection(true);await cachedReload(second);
  if(browserName!=='webkit')assert.equal(await second.evaluate(()=>navigator.onLine),false);
  assert.match(await second.evaluate(name=>fetch(name).then(r=>r.text()),lazyAsset),/lazy asset revision 5/);
  revision=6;failAsset='/'+lazyAsset;
  // Reconnection itself must check immediately, even within the usual throttle.
  await connection(false);await update.waitForFunction(()=>window.updateInstallFailed===true,{},{timeout:30000});await stays(5);
  assert.equal(await update.getByRole('dialog',{name:'更新中…',exact:true}).isVisible(),false,'A failed download does not interrupt the user with an update modal');
  await connection(true);await cachedReload(second);
  await second.locator('.game-launch').click();await second.locator('.game-info-play').click();await second.locator('#loading').waitFor({state:'hidden'});
  assert.equal(await second.locator('#player').isVisible(),true,'The old core still runs offline after an interrupted update');
  await second.locator('#player-menu').click();await second.locator('[data-action=exit]').click();await second.locator('#player').waitFor({state:'hidden'});
  failAsset=null;revision=7;await connection(false);
  await update.waitForFunction(()=>globalThis.updateTestRevision===7,{},{timeout:30000});await second.waitForFunction(()=>globalThis.updateTestRevision===7);await second.locator('.game-launch').waitFor();
  await connection(true);await cachedReload(second);
  assert.match(await second.evaluate(name=>fetch(name).then(r=>r.text()),lazyAsset),/lazy asset revision 7/,'Previously cached cores are refreshed before switching versions and remain available offline');
  assert.deepEqual(await second.evaluate(async()=>[...(await(await import('./src/storage.js')).get('saves','keep')).bytes]),[7,9]);
  console.log('PASS: cached play survives failed update downloads; reconnection retries automatically and refreshed cores and saves remain available. Outage mode: '+(browserName==='webkit'?'origin unavailable with explicit online event':'browser offline with native online event'));
  await update.goto('about:blank');await second.goto('about:blank');await context.close();
 }finally{await browser.close();server.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
