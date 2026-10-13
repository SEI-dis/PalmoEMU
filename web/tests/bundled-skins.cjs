// SPDX-License-Identifier: AGPL-3.0-or-later
// Reviewed CC-BY artwork and a synthetic GBA cartridge; isolated browser storage.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createStaticServer}=require('../scripts/serve.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',runtime=require('./browser-runtime.cjs')[kind];
const manifest=require('../BUNDLED_SKINS.json');
(async()=>{
 const server=createStaticServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/`;let browser,originUnavailable=false;
 const handler=server.listeners('request')[0];server.removeAllListeners('request');
 server.on('request',(req,res)=>originUnavailable?req.socket.destroy():handler(req,res));
 try{
  browser=await runtime.launch({headless:true,...(kind==='chromium'&&process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),page=await context.newPage(),errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&(!r.url().startsWith(base)||r.method()!=='GET'))external.push(r.url());});
  await page.goto(base);await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const catalog=await page.evaluate(async()=>{const{bundledSkins}=await import('./src/bundled-skins.js');return bundledSkins;});
  assert.deepEqual(catalog.map(s=>s.id),manifest.skins.map(s=>s.id));
  await page.locator('[data-tab=settings]').click();await page.locator('[data-action=skins]').click();
  assert.equal(await page.locator('#skin-grid').getAttribute('data-effective'),'builtin:classic');
  for(const skin of catalog){
   await page.locator('#skin-system').selectOption(skin.system);
   const choice=page.locator(`[data-skin-choice="${skin.id}"]`);await choice.click({position:{x:15,y:15}});
   await page.waitForFunction(id=>document.querySelector('#skin-grid')?.dataset.effective===id,skin.id);
   assert.equal(await page.locator('#skin-palette').isVisible(),false);
   assert.equal(await page.locator('#edit-controls').innerText(),'スクリーンショットボタン');
   assert.equal(await page.locator(`[data-delete-skin="${skin.id}"]`).count(),0);
   assert.ok(await page.locator('a[href="licenses.html#skins"]').isVisible());
   for(const orientation of ['portrait','landscape']){
    await page.locator(`[data-skin-orientation="${orientation}"]`).click();
    await choice.click({position:{x:15,y:15}});await page.waitForFunction(id=>document.querySelector('#skin-grid')?.dataset.effective===id,skin.id);
    const geometry=await page.evaluate(async({system,id,orientation})=>{
     const{previewSkin}=await import('./src/skins.js'),{chooseRepresentation}=await import('./src/skin-format.js');
     const{skin,urls}=await previewSkin(system,id);
     const phone=chooseRepresentation(skin,...(orientation==='portrait'?[390,844]:[844,390]));
     const tablet=chooseRepresentation(skin,...(orientation==='portrait'?[768,1024]:[1024,768]));
     for(const url of Object.values(skin.images)){const image=new Image();image.src=url;await image.decode();}
     return{phone:phone.device,tablet:tablet.device,orientation:phone.orientation,variants:skin.variants.length,screens:phone.screens.length,touch:phone.items.some(i=>i.touch),urls:urls.length};
    },{...skin,orientation});
    assert.equal(geometry.phone,'iphone');assert.equal(geometry.tablet,'ipad');assert.equal(geometry.orientation,orientation);assert.equal(geometry.variants,6);assert.equal(geometry.urls,0);
    assert.equal(geometry.screens,skin.system==='nds'?2:1);if(skin.system==='nds')assert.ok(geometry.touch);
   }
  }
  await page.locator('#skin-system').selectOption('nds');await page.locator('[data-skin-orientation=portrait]').click();
  if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`bundled-${kind}-portrait.png`)});}
  await page.locator('#close-sheet').click();
  await page.locator('[data-tab=games]').click();await page.locator('#rom-input').setInputFiles({name:'Licensed skin test.gba',mimeType:'application/octet-stream',buffer:Buffer.from(require('./link.cjs').cartridge(31,992))});
  await page.getByRole('button',{name:'Licensed skin testのメニュー',exact:true}).click();
  await page.locator('[data-action=gameSkin]').click();
  await page.locator('[data-skin-choice="bundled:manic-gba"]').click({position:{x:15,y:15}});
  await page.waitForFunction(()=>document.querySelector('#skin-grid')?.dataset.selection==='bundled:manic-gba');
  assert.equal(await page.evaluate(async()=>{const db=await import('./src/storage.js');return(await db.all('library'))[0].skinId.portrait;}),'bundled:manic-gba');
  await page.locator('#close-sheet').click();await page.reload();
  await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#skin .imported-art')?.style.backgroundImage.includes('/assets/skins/manic/gba/'));
  assert.ok(await page.getByRole('button',{name:'a',exact:true}).isVisible());
  await page.setViewportSize({width:844,height:390});
  await page.waitForFunction(()=>document.querySelector('#skin .imported-art')?.style.backgroundImage.includes('landscape'));
  if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`bundled-${kind}-game-landscape.png`)});
  await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  // Imported skins stay in their own store. Bundled assets do not duplicate into IndexedDB.
  assert.equal(await page.evaluate(async()=>{const db=await import('./src/storage.js');return(await db.skinCatalog()).length;}),0);
  const fallbacks=await page.evaluate(async()=>{const{previewSkin}=await import('./src/skins.js');return[(await previewSkin('gba','bundled:unknown')).skin.id,(await previewSkin('nds','bundled:manic-gba')).skin.id];});
  assert.deepEqual(fallbacks,['builtin:classic','builtin:classic']);
  // Download through the production worker, then prove assets AND license text work offline.
  await page.evaluate(()=>new Promise((resolve,reject)=>{const channel=new MessageChannel();channel.port1.onmessage=({data})=>{if(data.error)reject(Error(data.error));else if(data.done){channel.port1.close();resolve(data);}};navigator.serviceWorker.controller.postMessage({type:'download'},[channel.port2]);}));
  // Playwright WebKit's offline flag blocks even SW navigations; simulate a real origin outage.
  if(kind==='webkit')originUnavailable=true;else await context.setOffline(true);
  await page.reload();await page.setViewportSize({width:390,height:844});
  await page.locator('[data-tab=settings]').click();await page.locator('[data-action=skins]').click();
  for(const skin of catalog){
   await page.locator('#skin-system').selectOption(skin.system);await page.waitForFunction(id=>document.querySelector('#skin-grid')?.dataset.effective===id,skin.id);
   await page.evaluate(async({system,id})=>{const{previewSkin}=await import('./src/skins.js');const{skin}=await previewSkin(system,id);for(const url of Object.values(skin.images)){const image=new Image();image.src=url;await image.decode();}},skin);
  }
  await page.goto(base+'licenses.html#skins');assert.match(await page.locator('#skins + p').innerText(),/Manic EMU.*CC BY 4.0/);
  const license=await page.evaluate(async()=>{const r=await fetch('./licenses/ManicEMUSkins-CC-BY-4.0.txt');if(!r.ok)throw Error('Offline license missing');return r.text();});assert.match(license,/Creative Commons Attribution 4.0 International/);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await context.close();
  // A transient failed fetch must not poison the bundled-skin loader's cache.
  originUnavailable=false;
  const isolated=await browser.newContext({serviceWorkers:'block'}),retry=await isolated.newPage();await retry.goto(base);
  await retry.route('**/assets/skins/manic/gba/skin.json',r=>r.fulfill({status:503,body:'Unavailable'}));
  assert.ok(await retry.evaluate(async()=>{try{const{previewSkin}=await import('./src/skins.js');await previewSkin('gba','bundled:manic-gba');return false;}catch{return true;}}));
  await retry.unroute('**/assets/skins/manic/gba/skin.json');
  assert.equal(await retry.evaluate(async()=>{const{previewSkin}=await import('./src/skins.js');return(await previewSkin('gba','bundled:manic-gba')).skin.id;}),'bundled:manic-gba');
  await isolated.close();console.log(`PASS ${kind}: seven licensed skins, portrait/landscape/tablet layouts, GBA runtime, persistence, offline artwork/credits, isolation, fallback and retry.`);
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
