// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs'),{createStaticServer}=require('../scripts/serve.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{const server=createStaticServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:'msedge'}:{})});try{
 const shellContext=await browser.newContext({locale:'ja-JP'}),shellPage=await shellContext.newPage();shellPage.setDefaultTimeout(30000);await shellPage.goto(base+'/update.html');
 await shellPage.evaluate(async()=>{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
 const shellFiles=await shellPage.evaluate(async()=>{const name=(await caches.keys()).find(key=>key.startsWith('manic-web:/:'));return (await(await caches.open(name)).keys()).map(request=>new URL(request.url).pathname);});
 assert.ok(shellFiles.includes('/vendor/start-save-migrate/engine.js'),'First offline GBA import needs the lazily executed identification engine');assert.ok(shellFiles.includes('/vendor/start-save-format/engine.js'),'First offline 0.50 update needs the separate L-format engine');assert.ok(shellFiles.includes('/README.md'),'The user guide linked from credits remains available offline');assert.equal(shellFiles.includes('/cores/mgba/mgba.wasm'),false,'This context only installed the shell');
 const context=await browser.newContext({locale:'ja-JP'}),page=await context.newPage();await page.goto(base+'/update.html');
 const result=await page.evaluate(async()=>{
  const reg=await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  const message=data=>new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=e=>{if(e.data.done){channel.port1.close();resolve(e.data);}};reg.active.postMessage(data,[channel.port2]);});
  const selection={cores:['mgba'],files:[]},before=await message({type:'status',selection}),download=await message({type:'download',selection}),after=await message({type:'status',selection}),all=await message({type:'status'}),invalid=await message({type:'download',selection:{cores:['../escape'],files:[]}});
  const prefix='manic-web:'+new URL('.',location.href).pathname+':',name=(await caches.keys()).find(key=>key.startsWith(prefix)),cache=await caches.open(name),files=(await cache.keys()).map(request=>new URL(request.url).pathname);
  return {before,download,after,all,invalid,files};
 });
 assert.equal(result.download.error,undefined);assert.equal(result.after.ready,true);assert.equal(result.after.missingBytes,0);assert.equal(result.all.ready,false);assert.ok(result.after.bytes<result.all.bytes);assert.ok(result.invalid.error);assert.ok(result.files.some(file=>file.endsWith('/cores/mgba/mgba.wasm')));assert.equal(result.files.some(file=>file.includes('/ipad_')),false);assert.equal(result.files.some(file=>file.includes('/cores/nds/')),false);
 // A library whose selected files are already cached offers Done immediately.
 await page.goto(base+'/index.html#settings');await page.locator('.settings-page').waitFor();
 await page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),rom=new Uint8Array([1,2,3,4]),id=await hash(rom);await db.addGame({id,name:'Offline UI fixture',filename:'offline-ui.gba',system:'gba',size:rom.length,added:1,lastPlayed:0},rom);});
 await page.reload();await page.locator('.settings-page').waitFor();if(await page.locator('#sheet.release-notice[open]').count())await page.locator('#close-sheet').click();
 await page.evaluate(()=>{window.offlineDownloads=0;const send=ServiceWorker.prototype.postMessage;ServiceWorker.prototype.postMessage=function(message,...rest){if(message?.type==='download')window.offlineDownloads++;return send.call(this,message,...rest);};});
 await page.locator('[data-action=offline]').click();await page.getByText('現在のゲームと設定で、オフラインで遊べます。',{exact:true}).waitFor();assert.equal(await page.locator('#offline-download').textContent(),'完了');await page.locator('#offline-download').click();await page.locator('#sheet').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>offlineDownloads),0,'Done closes without downloading again');
 // A real origin outage exercises the worker cache in both engines; WebKit's
 // offline emulation rejects this fetch despite the populated worker cache.
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 const response=page.waitForResponse(base+'/cores/mgba/mgba.wasm');
 const available=await page.evaluate(async()=>{const r=await fetch('./cores/mgba/mgba.wasm');return r.ok&&(await r.arrayBuffer()).byteLength>0;});assert.equal(available,true);assert.equal((await response).fromServiceWorker(),true);await context.close();
 // No all/selected download was requested in this isolated context. First GBA
 // import and the user guide must still work after the origin goes away.
 await shellPage.goto(base+'/index.html');await shellPage.locator('#rom-input').waitFor({state:'attached'});
 const rom=Buffer.from(require('./link.cjs').cartridge(47,998));await shellPage.locator('#rom-input').setInputFiles({name:'Offline-first.gba',mimeType:'application/octet-stream',buffer:rom});
 await shellPage.waitForFunction(()=>[...document.querySelectorAll('#content .game-launch')].some(el=>el.textContent.includes('Offline-first'))||document.querySelector('#import-results-close'));
 assert.equal(await shellPage.locator('#import-results-close').count(),0,'The first offline GBA import failed');
 const imported=await shellPage.evaluate(async()=>{const db=await import('./src/storage/storage.js'),games=await db.all('library'),game=games.find(game=>game.name==='Offline-first');return {count:games.length,name:game?.name,size:game?.size,rom:game?[...await db.get('roms',game.id)]:null,engine:typeof(await import('./vendor/start-save-migrate/engine.js')).inspectInput};});
 assert.equal(imported.count,1);assert.equal(imported.size,rom.length);assert.deepEqual(imported.rom,[...rom]);assert.equal(imported.engine,'function');assert.equal(await shellPage.evaluate(async()=>typeof(await import('./src/start-save/format-l.js')).convertFormatSave),'function','The complete L-format dependency chain loads with the origin stopped');
 const guideResponse=shellPage.waitForResponse(base+'/README.md'),guide=await shellPage.evaluate(async()=>{const response=await fetch('./README.md');return {ok:response.ok,text:await response.text()};});assert.equal(guide.ok,true);assert.match(guide.text,/PalmoEMU/);assert.equal((await guideResponse).fromServiceWorker(),true);await shellContext.close();
 console.log('PASS '+kind+': selected offline download, completeness, unrelated core/skin exclusion, offline core fetch and first shell-only offline GBA import/user guide.');
 }finally{await browser.close();server.closeAllConnections();if(server.listening)await new Promise(r=>server.close(r));}})().catch(error=>{console.error(error);process.exit(1);});
