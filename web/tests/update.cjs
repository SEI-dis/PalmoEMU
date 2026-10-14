// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const browserName=process.env.BROWSER_ENGINE||'chromium',browserType=require('./browser-runtime.cjs')[browserName];
(async()=>{
 const root=path.resolve(__dirname,'..'),manifestScope={self:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'offline-manifest.js'),'utf8'),manifestScope);
 const lazyAsset=manifestScope.self.APP_OFFLINE.files.find(name=>name.startsWith('cores/')&&name.endsWith('.js'));
 assert.ok(lazyAsset);let revision=1,staleBootstrap=true,failAsset=null,originUnavailable=false,holdAsset=null;
 // The ROM-update Play handoff also crosses a new release. Its release notice
 // must wait until the requested game exits, without swallowing the Play action.
 const releaseVersion=()=>`0.0.${revision>=8?4:process.env.UPDATE_FLOW_ONLY?3:Math.min(revision,3)}`;
 const stageDeadline=1200,buildChecks=[];
 const heldRequests=[],shots=process.env.SCREENSHOT_DIR||path.join(root,'test-results','update-flow-'+browserName);fs.mkdirSync(shots,{recursive:true});
 const releaseHeld=()=>{holdAsset=null;for(const finish of heldRequests.splice(0))finish();};
 const server=http.createServer((req,res)=>{
  if(originUnavailable){req.socket.destroy();return;}
  const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
  if(name===failAsset){const fail=()=>res.writeHead(503,{'Cache-Control':'no-store'}).end('Simulated interrupted update');if(name===holdAsset)heldRequests.push(fail);else fail();return;}
  const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml','.txt':'text/plain','.md':'text/plain'};
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  // Reproduce a static host's still-fresh HTTP cache independently of Cache Storage.
  res.setHeader('Cache-Control','public, max-age=3600');let bytes=fs.readFileSync(file);
  if(name==='/sw.js')bytes=Buffer.concat([bytes,Buffer.from('\n// update-test revision '+revision)]);
  if(name==='/src/updates/auto-update-worker.js'&&[3,8].includes(revision))bytes=Buffer.from(bytes.toString().replace('await self.skipWaiting();','await new Promise(resolve=>setTimeout(resolve,1500));await self.skipWaiting();'));
  if(name==='/src/updates/auto-update.js'){
   const source=bytes.toString();let matches=0;
   // Only shorten the staging-help timer, leaving startup gates, coordinator
   // leases and network timeouts at their real product values.
   bytes=Buffer.from(source.replace(/(stageTimer=setTimeout\([\s\S]*?),60000\)/g,(_,prefix)=>{matches++;return prefix+','+stageDeadline+')';}).replace('if(build&&currentBuild&&build!==currentBuild)',"console.debug('update-test-build '+JSON.stringify({build,currentBuild,controller:navigator.serviceWorker.controller?.state}));if(build&&currentBuild&&build!==currentBuild)"));
   assert.equal(matches,1,'Expected exactly one 60-second staging timer');
   bytes=Buffer.concat([bytes,Buffer.from('\nglobalThis.updateTestAutoHash='+JSON.stringify(require('node:crypto').createHash('sha256').update(source).digest('hex'))+';')]);
  }
  if(name==='/offline-manifest.js')bytes=Buffer.from(bytes.toString().replace(/"version":"[^"]+"/,`"version":"update-test-${revision}"`));
  if(name==='/index.html')bytes=Buffer.from(bytes.toString()
   .replace(/(<meta name="app-build" content=")[^"]+/,`$1update-test-${revision}`)
   .replace(/(<meta name="app-version" content=")[^"]+/,`$1${releaseVersion()}`)
   .replace(/(<template id="latest-update-notes" data-version=")[^"]+/,`$1${releaseVersion()}`)
   .replace(/(<p class="update-note-version"[^>]*>)[^<]+/,`$1${releaseVersion()}`));
  if(name==='/index.html'&&req.url.includes('new-tab=1')){
   res.setHeader('Cache-Control','no-store');
   if(staleBootstrap){staleBootstrap=false;bytes=Buffer.from(bytes.toString().replace(/(<meta name="app-build" content=")[^"]+/,`$1update-test-${revision-1}`));}
  }
  if(name==='/src/views/settings.js')bytes=Buffer.concat([bytes,Buffer.from('\nglobalThis.updateTestRevision='+revision+';')]);
  if(name==='/src/storage/storage.js')bytes=Buffer.from(bytes.toString().replace('async function setGamePreferences(id,preferences){','async function setGamePreferences(id,preferences){if(globalThis.holdUpdatePreference)await globalThis.holdUpdatePreference;'));
  if(name==='/'+lazyAsset)bytes=Buffer.concat([bytes,Buffer.from('\n// lazy asset revision '+revision)]);
  if(name===holdAsset)heldRequests.push(()=>res.end(bytes));else res.end(bytes);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port+'/';
 const browser=await browserType.launch({headless:true,...(browserName==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  context.on('page',client=>client.on('console',message=>{if(message.text().startsWith('update-test-build ')){buildChecks.push({url:client.url(),...JSON.parse(message.text().slice(18))});if(buildChecks.length>40)buildChecks.shift();}}));
  const page=await context.newPage();await page.goto(base+'index.html');
  // Playwright WebKit's offline flag rejects even cached SW navigations (#42775).
  // Use a real origin outage there; Edge also exercises the native online event.
  async function connection(offline){
   if(browserName!=='webkit')return context.setOffline(offline);
   originUnavailable=offline;
   if(!offline)for(const client of context.pages())await client.evaluate(()=>window.dispatchEvent(new Event('online')));
  }
  async function cachedReload(client){const response=await client.reload();assert.equal(response.fromServiceWorker(),true,'Reload is served by the app worker, not the HTTP cache');await client.locator('.game-launch').waitFor();}
  async function noReleaseNotice(clients,version,message){
   // Observe multiple retry intervals, including the storage event delivered
   // to peer tabs when the displayed notice is acknowledged.
   for(let i=0;i<6;i++){
    for(const client of clients){assert.equal(await client.locator('#sheet.release-notice[open]').count(),0,message);assert.equal(await client.evaluate(()=>localStorage.getItem('palmo-release-seen:/')),version);}
    if(i<5)await clients[0].waitForTimeout(200);
   }
  }
  async function acknowledgeRelease(clients,version){
   let shown;
   for(let i=0;i<100&&!shown;i++){
    for(const client of clients)if(await client.locator('#sheet.release-notice[open]').isVisible()){shown=client;break;}
    if(!shown)await clients[0].waitForTimeout(100);
   }
   assert.ok(shown,'The new release notice appears immediately after update, without another navigation');
   await shown.bringToFront();
   assert.equal(await shown.evaluate(()=>document.hidden),false,'The release notice is shown in a visible tab');
   assert.equal(await shown.locator('#sheet-title').textContent(),'更新しました');
   assert.equal(await shown.locator('#sheet .update-note-version').textContent(),version);
   const changes=await shown.locator('#sheet-body li').count();assert.ok(changes>=1&&changes<=3,'The notice contains one to three release changes');
   assert.equal(await shown.locator('#release-notice-details').isVisible(),true);
   assert.match(await shown.locator('#release-notice-details').getAttribute('href'),/^notices\.html#v[\d-]+$/);
   // Keep the lock held across a retry in the other tab, then verify that only
   // one tab owns the release dialog before acknowledging it.
   await shown.waitForTimeout(700);
   assert.equal((await Promise.all(clients.map(client=>client.locator('#sheet.release-notice[open]').count()))).reduce((sum,count)=>sum+count,0),1,'Only one tab presents the release notice');
   await shown.locator('#release-notice-done').click();await shown.locator('#sheet').waitFor({state:'hidden'});
   await noReleaseNotice(clients,version,'Acknowledging the release prevents another tab from showing it again');
  }
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;const db=await import('./src/storage/storage.js');await db.put('saves','keep',{bytes:new Uint8Array([7,9]),at:1});});
  await page.waitForFunction(()=>globalThis.updateTestRevision===1);
  await page.waitForFunction(version=>localStorage.getItem('palmo-release-seen:/')===version,releaseVersion());
  assert.equal(await page.locator('#sheet.release-notice[open]').count(),0,'A first visit establishes the current release without an update notice');
  assert.match(await page.evaluate(name=>fetch(name).then(r=>r.text()),lazyAsset),/lazy asset revision 1/);
  async function restoredGame(client){
   await client.evaluate(()=>{window.restoreGameMarker='same-game';window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
   await client.waitForTimeout(1100); // Observe two coordinator ticks and any navigation.
   assert.equal(await client.evaluate(()=>window.restoreGameMarker),'same-game','Page-cache restoration must not reload a running game');
   assert.equal(await client.locator('#player').isVisible(),true);assert.equal(await client.locator('#resume-game').isVisible(),true);
   await client.locator('#resume-game').click();assert.equal(await client.locator('#resume-game').isVisible(),false,'Restored gameplay can resume');
  }
  if(process.env.UPDATE_RESTORE_ONLY){
   await page.locator('#rom-input').setInputFiles({name:'Restore-test.gb',mimeType:'application/octet-stream',buffer:Buffer.from(require('./cartridges.cjs').gb())});
   await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
   await restoredGame(page);
   await page.evaluate(async()=>{const {guardUpdateTask}=await import('./src/updates/update-activity.js');guardUpdateTask(()=>new Promise(resolve=>{window.finishRestoreTask=resolve;}))();});
   await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
   await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>window.restoreGameMarker),'same-game','File operation still blocks the deferred reload after gameplay ends');
   await page.evaluate(()=>finishRestoreTask());await page.waitForFunction(()=>window.restoreGameMarker===undefined);await page.locator('.game-launch').waitFor();
   assert.equal(await page.evaluate(()=>globalThis.updateTestRevision),1,'Refresh happens once the in-memory work is safely finished');
   console.log('PASS: page-cache restoration retains paused gameplay and pending file work, then refreshes only when safe.');await context.close();return;
  }
  if(process.env.UPDATE_FLOW_ONLY){
   await page.locator('#rom-input').setInputFiles({name:'Original-update-test.gb',mimeType:'application/octet-stream',buffer:Buffer.from(require('./cartridges.cjs').gb())});await page.locator('.game-launch').waitFor();
   await exerciseUpdateFlow(page);await context.close();return;
  }
  const update=await context.newPage();await update.goto(base+'update.html');
  await update.getByText('最新の状態です。',{exact:true}).waitFor();assert.equal(await update.locator('#apply-update').isDisabled(),true,'No pending update must leave the update button disabled');
  await update.locator('#apply-update').dispatchEvent('click');assert.equal(update.url(),base+'update.html','A stale click must not navigate when there is no pending update');
  revision=2;await update.reload();
  await update.getByText('更新できます。',{exact:true}).waitFor();await update.locator('#apply-update:enabled').click();
  await update.getByText('この画面以外のアプリのタブを閉じてください。',{exact:true}).waitFor();
  await page.close();await update.locator('#apply-update').click();await update.waitForURL(base+'index.html');
  await acknowledgeRelease([update],releaseVersion());
  const data=await update.evaluate(async()=>{const db=await import('./src/storage/storage.js');return [...(await db.get('saves','keep')).bytes];});
  assert.deepEqual(data,[7,9]);assert.equal(await update.evaluate(()=>globalThis.updateTestRevision),2,'New worker must not install shell files from an old HTTP cache');
  assert.match(await update.evaluate(name=>fetch(name).then(r=>r.text()),lazyAsset),/lazy asset revision 2/,'First core request after update must bypass old HTTP cache');
  assert.deepEqual(await update.evaluate(()=>caches.keys()),['manic-web:/:update-test-2']);
  await update.goto(base+'update.html');await update.getByText('最新の状態です。',{exact:true}).waitFor();assert.equal(await update.locator('#apply-update').isDisabled(),true,'The button becomes disabled after applying the update');await update.goto(base+'index.html');
  await noReleaseNotice([update],releaseVersion(),'Reopening the manually updated app does not repeat the release notice');
  console.log('PASS: manual update blocks other tabs, immediately shows release changes once, preserves saves, and refreshes shell and lazy core assets despite a still-fresh HTTP cache.');
  const second=await context.newPage();await second.goto(base+'index.html');
  await second.locator('#rom-input').setInputFiles({name:'Original-update-test.gb',mimeType:'application/octet-stream',buffer:Buffer.from(require('./cartridges.cjs').gb())});
  await second.locator('.game-launch').click();await second.locator('.game-info-play').click();await second.locator('#loading').waitFor({state:'hidden'});
  await restoredGame(second);
  await update.locator('[data-tab=settings]').click();await update.locator('[data-action=video]').click();
  revision=3;await update.evaluate(async()=>{await(await navigator.serviceWorker.ready).update();});
  const stays=async expected=>{await update.waitForTimeout(4000);assert.equal(await update.evaluate(()=>globalThis.updateTestRevision),expected);assert.equal(await second.evaluate(()=>globalThis.updateTestRevision),expected);};
  await stays(2);assert.equal(await second.locator('#player').isVisible(),true,'An active game in another tab blocks automatic update');
  await second.locator('#player-menu').click();await second.locator('[data-action=exit]').click();await second.locator('#player').waitFor({state:'hidden'});
  await stays(2);assert.equal(await update.locator('#sheet').isVisible(),true,'An open settings dialog is not discarded');
  // Keep this fixture transition atomic even on a slow CI runner. The actual
  // offline download owns its own pending-task guard once its button is used.
  await update.evaluate(async()=>{const {guardUpdateTask}=await import('./src/updates/update-activity.js');guardUpdateTask(()=>new Promise(resolve=>{window.finishOpenOfflineDialog=resolve;}))();});
  await update.locator('#close-sheet').click();
  await update.evaluate(()=>{const send=ServiceWorker.prototype.postMessage;ServiceWorker.prototype.postMessage=function(message,...rest){if(message?.type==='download'){window.finishOfflineDownload=()=>{ServiceWorker.prototype.postMessage=send;send.call(this,message,...rest);};return;}return send.call(this,message,...rest);};});
  await update.locator('[data-action=offline]').click();await update.locator('#offline-download').click();
  await update.waitForFunction(()=>typeof window.finishOfflineDownload==='function');await update.evaluate(()=>finishOpenOfflineDialog());await update.locator('#close-sheet').click();
  await stays(2);
  await update.evaluate(async()=>{const {guardUpdateTask}=await import('./src/updates/update-activity.js');guardUpdateTask(()=>new Promise(resolve=>{window.finishUpdateTestTask=resolve;}))();});
  await update.evaluate(()=>finishOfflineDownload());
  await stays(2);
  const pickerEvent=update.waitForEvent('filechooser');await update.locator('#rom-input').evaluate(input=>input.click());const picker=await pickerEvent;
  await update.evaluate(()=>finishUpdateTestTask());await stays(2);
  await update.emulateMedia({reducedMotion:'reduce'});
  await picker.setFiles([]);await update.locator('#rom-input').dispatchEvent('cancel');
  await update.locator('.update-progress[data-phase=applying]').waitFor();
  const progress=await update.locator('.update-progress').boundingBox();
  assert.ok(Math.abs(progress.x+progress.width/2-195)<2&&Math.abs(progress.y+progress.height/2-422)<2,'Update progress stays at the center of the phone viewport');
  assert.equal(await update.locator('.update-progress').evaluate(el=>el.scrollWidth>el.clientWidth||el.scrollHeight>el.clientHeight),false,'Update progress has no clipped text or spinner');
  assert.equal(await update.locator('.update-spinner').evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.equal(await second.locator('.update-spinner').evaluate(el=>getComputedStyle(el).animationName),'update-spin');
  await second.screenshot({path:path.join(shots,'update-existing-portrait.png')});
  await update.waitForFunction(()=>globalThis.updateTestRevision===3,{},{timeout:30000});await second.waitForFunction(()=>globalThis.updateTestRevision===3);await second.locator('.game-launch').waitFor();await update.locator('.settings-page').waitFor();
  await acknowledgeRelease([update,second],releaseVersion());
  assert.equal(new URL(update.url()).hash,'#settings','Automatic reload retains the selected tab');
  assert.equal(await second.locator('.game-launch').count(),1,'Automatic reload retains the original cartridge');
  assert.deepEqual(await update.evaluate(async()=>[...(await(await import('./src/storage/storage.js')).get('saves','keep')).bytes]),[7,9]);
  assert.equal(await update.evaluate(async()=>(await(await import('./src/updates/offline.js')).offlineStatus()).ready),true,'Updated app includes every offline resource, including newly used cores');
  console.log('PASS: automatic update waits for another tab to exit a game, settings dialogs, asynchronous tasks and native file selection; then refreshes every idle tab, shows release changes in one tab, and preserves data.');
  await update.evaluate(()=>{
   let started;
   new MutationObserver(()=>{const el=document.querySelector('.update-progress');if(el.open&&el.dataset.phase==='applying'&&started===undefined)started=performance.now();}).observe(document.querySelector('.update-progress'),{attributes:true});
   window.addEventListener('pagehide',()=>{if(started!==undefined)sessionStorage.setItem('update-test-visible-ms',String(performance.now()-started));});
  });
  const unknown=await context.newPage();await unknown.goto(base+'privacy.html');revision=4;
  await update.evaluate(async()=>{await(await navigator.serviceWorker.ready).update();});await stays(3);
  await unknown.close();await update.waitForFunction(()=>globalThis.updateTestRevision===4,{},{timeout:30000});await second.waitForFunction(()=>globalThis.updateTestRevision===4);await second.locator('.game-launch').waitFor();await update.locator('.settings-page').waitFor();
  assert.ok(Number(await update.evaluate(()=>sessionStorage.getItem('update-test-visible-ms')))>=1100,'Even a fast activation leaves the update notice visible for about 1.2 seconds');
  await noReleaseNotice([update,second],releaseVersion(),'A new build of an acknowledged app version does not repeat the release notice');
  // Become busy after answering the probe. All prepared tabs must be released.
  await second.evaluate(async()=>{
   const {guardUpdateTask}=await import('./src/updates/update-activity.js');
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
  await noReleaseNotice([late],releaseVersion(),'A new tab with corrected stale HTML does not repeat the acknowledged release notice');
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
  revision=6;failAsset=holdAsset='/'+lazyAsset;
  // Reconnection itself must check immediately, even within the usual throttle.
  await connection(false);await update.locator('.update-progress[data-phase=downloading]').waitFor();releaseHeld();await update.waitForFunction(()=>window.updateInstallFailed===true,{},{timeout:30000});await stays(5);
  await update.locator('.update-progress[data-phase=failed]').waitFor();
  assert.equal(await update.locator('.update-progress [role=status]').textContent(),'更新できませんでした。');
  await update.getByRole('button',{name:'あとで',exact:true}).click();
  assert.equal(await update.getByRole('dialog',{name:'アプリの更新',exact:true}).isVisible(),false,'Dismissing a real download failure returns to the current app');
  await connection(true);await cachedReload(second);
  await second.locator('.game-launch').click();await second.locator('.game-info-play').click();await second.locator('#loading').waitFor({state:'hidden'});
  assert.equal(await second.locator('#player').isVisible(),true,'The old core still runs offline after an interrupted update');
  await second.locator('#player-menu').click();await second.locator('[data-action=exit]').click();await second.locator('#player').waitFor({state:'hidden'});
  // Later defers this visit. Reopen the cached app before retrying online.
  await update.reload();await update.locator('.settings-page').waitFor();
  failAsset=null;revision=7;await connection(false);
  try{await update.waitForFunction(()=>globalThis.updateTestRevision===7,{},{timeout:30000});await second.waitForFunction(()=>globalThis.updateTestRevision===7);await second.locator('.game-launch').waitFor();}
  catch(error){console.error('Reconnection startup build checks:',JSON.stringify(buildChecks));throw error;}
  await connection(true);await cachedReload(second);
  assert.match(await second.evaluate(name=>fetch(name).then(r=>r.text()),lazyAsset),/lazy asset revision 7/,'Previously cached cores are refreshed before switching versions and remain available offline');
  assert.deepEqual(await second.evaluate(async()=>[...(await(await import('./src/storage/storage.js')).get('saves','keep')).bytes]),[7,9]);
  console.log('PASS: cached play survives failed update downloads; reconnection retries automatically and refreshed cores and saves remain available. Outage mode: '+(browserName==='webkit'?'origin unavailable with explicit online event':'browser offline with native online event'));
  await update.close();await exerciseUpdateFlow(second);await context.close();
  async function exerciseUpdateFlow(second){
  await connection(false);
  // Detect an installing candidate while game details are open. The explicit
  // Play action must hand off to staging without starting a core or save session.
  await second.locator('.game-launch').click();
  const originalSave=await second.evaluate(async()=>{
   const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),[game]=await db.all('library');
   let save=await db.get('saves',game.id);if(!save){const bytes=new Uint8Array(8192);bytes[42]=73;save={bytes,at:1,hash:await hash(bytes)};await db.put('saves',game.id,save);}
   return {id:game.id,hash:await hash(save.bytes)};
  });
  const updatedROM=Buffer.from(require('./cartridges.cjs').gb());updatedROM[updatedROM.length-1]=2;
  await second.locator('[data-action=updateROM]').click();await second.locator('#rom-update-file').setInputFiles({name:'Updated-update-test.gb',mimeType:'application/octet-stream',buffer:updatedROM});
  await second.locator('#rom-update-compatible').check();await second.locator('#rom-update-confirm').click();await second.locator('#rom-update-play').waitFor();
  await second.evaluate(async()=>{const {MGBACore}=await import('./src/core/mgba.js'),load=MGBACore.prototype.load;window.updateGateLoads=0;MGBACore.prototype.load=function(...args){updateGateLoads++;return load.apply(this,args);};});
  revision=8;holdAsset='/'+lazyAsset;await second.evaluate(async()=>{await(await navigator.serviceWorker.ready).update();});
  await second.waitForFunction(async()=>!!(await navigator.serviceWorker.ready).installing);
  assert.equal(await second.getByRole('dialog',{name:'アプリの更新',exact:true}).isVisible(),false,'An open game/settings sheet is not interrupted');
  await second.locator('#rom-update-play').click();await second.locator('.update-progress[data-phase=downloading]').waitFor();
  assert.equal(await second.locator('#player').isVisible(),false);assert.equal(await second.evaluate(()=>updateGateLoads),0,'A known installing candidate wins the launch race');
  assert.equal(await second.locator('.update-progress strong').textContent(),'アプリの更新');assert.equal(await second.locator('.update-progress [role=status]').textContent(),'ダウンロード中…');
  assert.equal(await second.locator('.update-progress button').isVisible(),false,'Normal downloads do not offer an old-version choice');await second.keyboard.press('Escape');assert.equal(await second.locator('.update-progress').isVisible(),true);
  async function screenshot(name,width,height){
   await second.setViewportSize({width,height});const modal=second.locator('.update-progress'),box=await modal.boundingBox();
   assert.ok(Math.abs(box.x+box.width/2-width/2)<2&&Math.abs(box.y+box.height/2-height/2)<2,'Update window is centered at '+width+'x'+height);
   assert.equal(await modal.evaluate(el=>el.scrollWidth>el.clientWidth||el.scrollHeight>el.clientHeight),false,'Update title/status fit the window');await second.screenshot({path:path.join(shots,name+'.png')});
  }
  await screenshot('download-portrait',390,844);await screenshot('download-landscape',844,390);await second.setViewportSize({width:390,height:844});
  // A slow but healthy download must not become a failed update or disappear.
  // Keep the actual asset response pending beyond the shortened help deadline.
  await second.waitForTimeout(Math.max(2000,stageDeadline+500));
  assert.equal(await second.locator('.update-progress[data-phase=downloading]').isVisible(),true,'A held download remains active after the staging deadline');
  assert.equal(await second.locator('.update-progress [role=status]').textContent(),'ダウンロード中…');
  assert.equal(await second.getByRole('button',{name:'今は続ける',exact:true}).isVisible(),true,'A long download offers a way to continue');
  assert.equal(await second.locator('.update-progress[data-phase=failed]').count(),0,'Elapsed time is not a download failure');
  assert.equal(await second.evaluate(()=>updateGateLoads),0,'A long download does not start a core');
  releaseHeld();
  try{await second.locator('.update-progress[data-phase=applying]').waitFor();}
  catch(error){
   console.error('Post-download update context:',await second.evaluate(async()=>{const reg=await navigator.serviceWorker.ready,dialog=document.querySelector('.update-progress');return {revision:globalThis.updateTestRevision,build:document.querySelector('meta[name=app-build]')?.content,hidden:document.hidden,active:document.activeElement?.outerHTML,phase:dialog?.dataset.phase,open:dialog?.open,status:dialog?.querySelector('[role=status]')?.textContent,tasks:(await import('./src/updates/update-activity.js')).updateTasksPending(),locks:await navigator.locks.query(),waiting:reg.waiting?.state,installing:reg.installing?.state};}));throw error;
  }
  await screenshot('applying-portrait',390,844);await screenshot('applying-landscape',844,390);await second.setViewportSize({width:390,height:844});
  await second.waitForFunction(()=>globalThis.updateTestRevision===8,{},{timeout:30000});await second.locator('#player').waitFor({state:'visible'});await second.locator('#loading').waitFor({state:'hidden'});
  assert.equal(await second.locator('#sheet').isVisible(),false,'The explicit play request resumes without an intervening release notice');
  const resumed=await second.evaluate(async original=>{
   const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),game=(await db.all('library')).find(g=>g.name==='Updated-update-test');
   return {id:game.id,previous:game.romUpdate.previousId,dirty:(await db.get('sessions',game.id))?.dirty,copy:await hash((await db.get('saves',game.id)).bytes),source:await hash((await db.get('saves',original.id)).bytes),intent:sessionStorage.getItem('palmo-launch-after-update:/')};
  },originalSave);
  assert.deepEqual({...resumed,id:undefined},{id:undefined,previous:originalSave.id,dirty:true,copy:originalSave.hash,source:originalSave.hash,intent:null},'Only the selected updated ROM starts; copied/original saves remain intact and the request is consumed');
  await second.locator('#player-menu').click();await second.locator('[data-action=exit]').click();await second.locator('#player').waitFor({state:'hidden'});
  await acknowledgeRelease([second],'0.0.4');
  await second.evaluate(async id=>{await(await import('./src/storage/storage.js')).removeGame(id);},resumed.id);
  assert.deepEqual(await second.evaluate(async()=>[...(await(await import('./src/storage/storage.js')).get('saves','keep')).bytes]),[7,9]);
  console.log('PASS: installing-candidate launch gate, slow download beyond staging deadline, download → apply window, portrait/landscape layout and unchanged saves. Screenshots: '+shots);
  // A stalled script check must not block cached startup or Play indefinitely.
  // A candidate found after the bounded gate must wait until this game exits.
  revision=9;holdAsset='/sw.js';await second.reload();await second.locator('.game-launch').waitFor();
  for(let i=0;i<100&&!heldRequests.length;i++)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(heldRequests.length,'The update script check is held at the origin');
  await second.locator('.game-launch').click();const gateStart=Date.now();await second.locator('.game-info-play').click();await second.locator('#player').waitFor({timeout:4000});assert.ok(Date.now()-gateStart<3500,'A launch check has an 800 ms budget');await second.locator('#loading').waitFor({state:'hidden'});
  releaseHeld();await second.waitForFunction(async()=>!!(await navigator.serviceWorker.ready).waiting,{},{timeout:30000});
  assert.equal(await second.evaluate(()=>globalThis.updateTestRevision),8);assert.equal(await second.getByRole('dialog',{name:'アプリの更新',exact:true}).isVisible(),false,'A late network result cannot interrupt active play');
  await second.locator('#player-menu').click();await second.locator('[data-action=exit]').click();await second.locator('#player').waitFor({state:'hidden'});
  try{await second.waitForFunction(()=>globalThis.updateTestRevision===9,{},{timeout:30000});}catch(error){
   console.error('Post-exit update context:',await second.evaluate(async()=>{const reg=await navigator.serviceWorker.ready;return {revision:updateTestRevision,hidden:document.hidden,hash:location.hash,active:document.activeElement?.outerHTML,dialogs:[...document.querySelectorAll('dialog[open]')].map(el=>el.outerHTML),tasks:(await import('./src/updates/update-activity.js')).updateTasksPending(),locks:await navigator.locks.query(),waiting:reg.waiting?.state};}));throw error;
  }await second.locator('.game-launch').waitFor();
  console.log('PASS: stalled startup/launch network checks are bounded and a late update waits for the game to exit.');
  // Another tab can be busy indefinitely. Explain the wait and allow this page
  // to continue, without withdrawing any other tab's version lock.
  const playing=await context.newPage();await playing.goto(base+'index.html');const otherROM=Buffer.from(require('./cartridges.cjs').gb());otherROM[otherROM.length-1]^=1;
  await playing.evaluate(async()=>{const {MGBACore}=await import('./src/core/mgba.js'),load=MGBACore.prototype.load;MGBACore.prototype.load=function(...args){window.updateWaitingCore=this;return load.apply(this,args);};});
  await playing.locator('#rom-input').setInputFiles({name:'Other-update-test.gb',mimeType:'application/octet-stream',buffer:otherROM});await playing.getByRole('button',{name:'Other-update-testの設定を開く',exact:true}).click();await playing.locator('.game-info-play').click();await playing.locator('#loading').waitFor({state:'hidden'});
  await second.getByRole('button',{name:'Original-update-testの設定を開く',exact:true}).click();
  revision=10;await second.evaluate(async()=>{await(await navigator.serviceWorker.ready).update();});await second.waitForFunction(async()=>!!(await navigator.serviceWorker.ready).waiting,{},{timeout:30000});await second.locator('.game-info-play').click();await second.locator('.update-progress[data-phase=waiting]').waitFor();
  assert.equal(await second.locator('.update-progress [role=status]').textContent(),'ほかのタブの操作が終わると更新します。');assert.equal(await playing.locator('#player').isVisible(),true);
  await second.waitForTimeout(Math.max(2000,stageDeadline+500));
  assert.equal(await second.locator('.update-progress[data-phase=waiting]').isVisible(),true,'Another busy tab may wait beyond the staging deadline');
  assert.equal(await second.locator('.update-progress [role=status]').textContent(),'ほかのタブの操作が終わると更新します。');
  assert.equal(await playing.evaluate(()=>updateWaitingCore.paused),false,'Long staging never pauses the other game');
  assert.equal(await playing.evaluate(()=>globalThis.updateTestRevision),9,'Long staging never reloads the other game');
  assert.deepEqual(await second.evaluate(async()=>[...(await(await import('./src/storage/storage.js')).get('saves','keep')).bytes]),[7,9]);
  // Replace an already waiting candidate with a genuinely newer installation.
  // The old worker becoming redundant is supersession, not a failed download.
  await second.evaluate(async()=>{
   window.replacedUpdateWorker=(await navigator.serviceWorker.ready).waiting;window.replacementFailed=false;window.replacementPhases=[];
   window.replacementObserver=new MutationObserver(()=>{const dialog=document.querySelector('.update-progress');if(dialog.open&&dialog.dataset.phase==='failed')replacementFailed=true;replacementPhases.push({phase:dialog.dataset.phase,open:dialog.open,old:replacedUpdateWorker.state});});
   replacementObserver.observe(document.querySelector('.update-progress'),{attributes:true,attributeFilter:['open','data-phase']});
  });
  revision=11;holdAsset='/'+lazyAsset;await second.evaluate(async()=>{await(await navigator.serviceWorker.ready).update();});
  await second.waitForFunction(async()=>!!(await navigator.serviceWorker.ready).installing);releaseHeld();
  await second.waitForFunction(async()=>{const worker=(await navigator.serviceWorker.ready).waiting;return worker&&worker!==replacedUpdateWorker&&replacedUpdateWorker.state==='redundant';},{},{timeout:30000});
  await second.locator('.update-progress[data-phase=waiting]').waitFor();
  assert.equal(await second.evaluate(()=>replacementFailed),false,'Replacing a waiting worker does not show a failure');
  assert.equal(await playing.evaluate(()=>updateWaitingCore.paused),false,'Replacement leaves the other game running');
  await second.getByRole('button',{name:'今は続ける',exact:true}).click();assert.equal(await second.locator('.update-progress').isVisible(),false);
  try{await second.locator('#player').waitFor({state:'visible'});}catch(error){
   console.error('Replacement launch context:',await second.evaluate(async()=>{const reg=await navigator.serviceWorker.ready,dialog=document.querySelector('.update-progress');return {source:updateTestAutoHash,phase:dialog.dataset.phase,open:dialog.open,status:dialog.querySelector('[role=status]').textContent,toast:document.querySelector('#toast')?.textContent,waiting:reg.waiting?.state,installing:reg.installing?.state,old:replacedUpdateWorker.state,phases:replacementPhases};}));throw error;
  }
  await second.locator('#loading').waitFor({state:'hidden'});assert.equal(await second.locator('#player').isVisible(),true);await second.evaluate(()=>replacementObserver.disconnect());
  assert.equal(await second.evaluate(()=>globalThis.updateTestRevision),9,'Continue permits the existing cached version');
  await playing.locator('#player-menu').click();await playing.locator('[data-action=exit]').click();await playing.locator('#player').waitFor({state:'hidden'});await playing.close();
  await second.locator('#player-menu').click();await second.locator('[data-action=exit]').click();await second.locator('#player').waitFor({state:'hidden'});await second.waitForTimeout(2200);
  assert.equal(await second.evaluate(()=>globalThis.updateTestRevision),9,'Continue is respected for this visit even after other tabs finish');
  await second.reload();await second.waitForFunction(()=>globalThis.updateTestRevision===11,{},{timeout:30000});await second.locator('.game-launch').first().waitFor();
  assert.deepEqual(await second.evaluate(async()=>[...(await(await import('./src/storage/storage.js')).get('saves','keep')).bytes]),[7,9]);console.log('PASS: another active tab is never reloaded, long waits are dismissible, superseded waiting workers do not fail, and the next visit applies the newest update safely.');
  // Hold a real game-preference write after its menu closes. Both download
  // staging and activation must wait for this queued setting to commit.
  await second.evaluate(()=>{globalThis.holdUpdatePreference=new Promise(resolve=>{globalThis.finishUpdatePreference=resolve;});});
  await second.getByRole('button',{name:'Original-update-testの設定を開く',exact:true}).click();await second.locator('[data-setting=filter]').selectOption('lcd');await second.locator('#close-sheet').click();
  revision=12;await second.evaluate(async()=>{await(await navigator.serviceWorker.ready).update();});await second.waitForFunction(async()=>!!(await navigator.serviceWorker.ready).waiting,{},{timeout:30000});
  assert.equal(await second.getByRole('dialog',{name:'アプリの更新',exact:true}).isVisible(),false,'Pending game settings are not interrupted even after their sheet closes');assert.equal(await second.evaluate(()=>globalThis.updateTestRevision),11);
  await second.evaluate(()=>finishUpdatePreference());await second.waitForFunction(()=>globalThis.updateTestRevision===12,{},{timeout:30000});
  await second.getByRole('button',{name:'Original-update-testの設定を開く',exact:true}).click();assert.equal(await second.locator('[data-setting=filter]').inputValue(),'lcd');await second.locator('#close-sheet').click();
  console.log('PASS: queued game settings finish before staging/activation and remain saved after reload.');
  // A real failed asset download gets a persistent, actionable notice. It can
  // be dismissed to keep using the installed app, or lead to manual updating.
  async function failedUpdate(){
   const dialog=second.locator('.update-progress[data-phase=failed]');await dialog.waitFor();
   assert.equal(await dialog.locator('strong').textContent(),'アプリの更新');
   assert.equal(await dialog.locator('[role=status]').textContent(),'更新できませんでした。');
   assert.equal(await dialog.locator('.update-spinner').isVisible(),false,'Failure does not imply work is still running');
   assert.equal(new URL(await dialog.getByRole('link',{name:'手動で更新',exact:true}).getAttribute('href'),second.url()).href,base+'update.html');
   assert.equal(await dialog.getByRole('button',{name:'あとで',exact:true}).isVisible(),true);
   assert.equal(await second.evaluate(()=>globalThis.updateTestRevision),12,'Failed install keeps the current app');
   const report=await second.evaluate(async()=>{const {diagnostics}=await import('./src/diagnostics.js');return diagnostics.list().filter(item=>item.source==='update').at(-1);});
   assert.ok(report,'Real worker failure is recorded locally');
   assert.equal(report.source,'update');assert.equal(report.error.reason,'worker-redundant');
   assert.ok(['downloading','ready'].includes(report.error.phase),'Diagnostic records the phase before failure');
   assert.equal(report.error.worker,'redundant');assert.equal(report.error.online,true);
   assert.deepEqual(await second.evaluate(async()=>[...(await(await import('./src/storage/storage.js')).get('saves','keep')).bytes]),[7,9]);
   return dialog;
  }
  revision=13;failAsset=holdAsset='/'+lazyAsset;await second.evaluate(async()=>{await(await navigator.serviceWorker.ready).update();});
  await second.locator('.update-progress[data-phase=downloading]').waitFor();releaseHeld();
  const failed=await failedUpdate();await screenshot('failed-portrait',390,844);await screenshot('failed-landscape',844,390);await second.setViewportSize({width:390,height:844});await failed.getByRole('button',{name:'あとで',exact:true}).click();
  assert.equal(await second.locator('.update-progress').isVisible(),false,'Later closes the failure notice');
  await second.getByRole('button',{name:'Original-update-testの設定を開く',exact:true}).click();await second.locator('.game-info-play').click();await second.locator('#player').waitFor({state:'visible'});await second.locator('#loading').waitFor({state:'hidden'});
  assert.equal(await second.locator('#player').isVisible(),true,'Installed core remains playable after dismissing the failure');
  await second.locator('#player-menu').click();await second.locator('[data-action=exit]').click();await second.locator('#player').waitFor({state:'hidden'});
  // Later also defers future candidates for this visit; reload explicitly
  // before exercising a separate failed attempt and the manual recovery link.
  revision=14;holdAsset=failAsset;await second.reload();await second.locator('.update-progress[data-phase=downloading]').waitFor();releaseHeld();const failedAgain=await failedUpdate();
  assert.equal(context.pages().filter(page=>!page.isClosed()).length,1,'Manual retry has no other app tabs');
  failAsset=null;revision=15;await failedAgain.getByRole('link',{name:'手動で更新',exact:true}).click();await second.waitForURL(base+'update.html');
  await second.getByText('更新できます。',{exact:true}).waitFor();await second.locator('#apply-update:enabled').click();await second.waitForURL(base+'index.html');
  await second.waitForFunction(()=>globalThis.updateTestRevision===15,{},{timeout:30000});await second.locator('.game-launch').first().waitFor();
  assert.deepEqual(await second.evaluate(async()=>[...(await(await import('./src/storage/storage.js')).get('saves','keep')).bytes]),[7,9]);
  assert.equal(await second.getByRole('button',{name:'Original-update-testの設定を開く',exact:true}).count(),1,'Manual retry retains the imported cartridge');
  console.log('PASS: real asset failure shows manual update/later actions, preserves cached play and saves, and manual retry succeeds with one app tab.');
  await second.goto('about:blank');
  }
 }finally{await browser.close();server.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
