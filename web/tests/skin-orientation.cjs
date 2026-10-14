// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createStaticServer}=require('../scripts/serve.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',runtime=require('./browser-runtime.cjs')[kind];
(async()=>{
 const server=createStaticServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await runtime.launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(version=>{localStorage.setItem('manic-settings',JSON.stringify({skins:{gba:'builtin:mint'},haptics:false}));localStorage.setItem('palmo-release-seen:'+new URL('.',location.href).pathname,version);},require('../package.json').version);await page.reload();
  await page.locator('#rom-input').setInputFiles({name:'Orientation.gba',mimeType:'application/octet-stream',buffer:Buffer.from(require('./link.cjs').cartridge(31,992))});await page.locator('.game-launch').waitFor();
  await page.evaluate(async()=>{
   const db=await import('./src/storage/storage.js'),game=(await db.all('library'))[0];await db.setGameSkin(game.id,'builtin:sunset');
   const c=document.createElement('canvas');c.width=256;c.height=192;c.getContext('2d').fillRect(0,0,256,192);
   const blob=await new Promise(r=>c.toBlob(r)),image={bytes:new Uint8Array(await blob.arrayBuffer())};
   const rep={mappingSize:{width:844,height:390},assets:{resizable:'art'},screens:[{outputFrame:{x:200,y:20,width:450,height:300}}],items:[{inputs:['a'],frame:{x:700,y:100,width:80,height:80}}]};
   await db.put('skins','skin:orientation',{id:'skin:orientation',name:'Orientation fixture',system:'gba',images:{art:image},portrait:rep,landscape:rep});
  });await page.reload();
  const orientation=async name=>{await page.locator(`[data-skin-orientation=${name}]`).click();await page.waitForFunction(name=>document.querySelector('#skin-grid')?.dataset.orientation===name,name);};
  const selected=()=>page.locator('#skin-grid').getAttribute('data-effective');
  const choose=async id=>{
   if(!id)await page.locator('#skin-inherit').check();
   else if(id.startsWith('builtin:')){await page.locator('[data-skin-choice^="builtin:"]').click({position:{x:10,y:10}});await page.locator(`[data-skin-color=${id.slice(8)}]`).click();}
   else await page.locator(`[data-skin-choice="${id}"]`).click({position:{x:10,y:10}});
   await page.waitForFunction(id=>document.querySelector('#skin-grid')?.dataset.selection===id&&!document.querySelector('#manage-skins')?.textContent.includes('完了')&&!document.querySelector('[data-skin-choice]')?.disabled,id);
  };
  const close=()=>page.locator('#close-sheet').click();
  const openShared=async()=>{await page.locator('[data-tab=settings]').click();await page.locator('#content [data-action=skins]').click();};
  const openGame=async()=>{await page.locator('[data-tab=games]').click();await page.getByRole('button',{name:'Orientationのメニュー',exact:true}).click();await page.locator('[data-action=gameSkin]').click();};
  const stored=()=>page.evaluate(async()=>{const db=await import('./src/storage/storage.js');return(await db.all('library'))[0];});
  await openShared();assert.equal(await selected(),'builtin:mint');await orientation('landscape');assert.equal(await selected(),'builtin:mint');
  await choose('bundled:manic-gba');await orientation('portrait');assert.equal(await selected(),'builtin:mint');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).skins.gba),{portrait:'builtin:mint',landscape:'bundled:manic-gba'});await close();
  await openGame();assert.equal(await selected(),'builtin:sunset');await choose('');assert.equal(await selected(),'builtin:mint');
  await orientation('landscape');assert.equal(await selected(),'builtin:sunset');assert.equal(await page.locator('#skin-inherit').isChecked(),false);
  await choose('skin:orientation');assert.deepEqual((await stored()).skinId,{landscape:'skin:orientation'});
  if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`skin-orientation-${kind}.png`)});}
  await close();await page.reload();
  await page.evaluate(async()=>{const{MGBACore}=await import('./src/core/mgba.js'),load=MGBACore.prototype.load;MGBACore.prototype.load=function(...args){window.orientationCore=this;return load.apply(this,args);};});
  await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
  const expectLive=async id=>page.waitForFunction(id=>document.querySelector('#player')?.dataset.skinId===id,id);
  await expectLive('builtin:mint');
  await page.setViewportSize({width:844,height:390});await expectLive('skin:orientation');
  const button=await page.getByRole('button',{name:'a',exact:true}).boundingBox();await page.mouse.move(button.x+20,button.y+20);await page.mouse.down();assert.equal(await page.evaluate(()=>orientationCore.keys&1),1);
  await page.setViewportSize({width:390,height:844});await expectLive('builtin:mint');assert.equal(await page.evaluate(()=>orientationCore.keys),0);await page.mouse.up();
  // Repeated rotations use the same running core and do not reload Blob images.
  const requests=[];page.on('request',r=>{if(r.url().includes('/assets/skins/'))requests.push(r.url());});
  await page.evaluate(()=>window.originalOrientationCore=orientationCore);
  for(let i=0;i<3;i++){await page.setViewportSize({width:844,height:390});await expectLive('skin:orientation');await page.setViewportSize({width:390,height:844});await expectLive('builtin:mint');}
  assert.equal(await page.evaluate(()=>originalOrientationCore===orientationCore),true);assert.deepEqual(requests,[]);
  // Editing the inactive orientation must not replace the current portrait skin.
  await page.locator('#player-menu').click();await page.locator('#sheet [data-action=skins]').click();await orientation('landscape');await choose('bundled:manic-gba');await expectLive('builtin:mint');
  await close();await page.setViewportSize({width:844,height:390});await expectLive('bundled:manic-gba');
  await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});await page.setViewportSize({width:390,height:844});
  // The shared and game selections lose only references to the deleted skin.
  await openShared();await choose('skin:orientation');await close();await openGame();await orientation('landscape');await choose('skin:orientation');await orientation('portrait');await choose('builtin:purple');
  await page.locator('#manage-skins').click();await page.locator('[data-delete-skin="skin:orientation"]').click();await page.locator('#confirm-skin-delete').click();await page.locator('#skin-grid').waitFor();
  assert.deepEqual((await stored()).skinId,{portrait:'builtin:purple'});
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).skins.gba),{landscape:'bundled:manic-gba'});
  await orientation('landscape');assert.equal(await page.locator('#skin-inherit').isChecked(),true);assert.equal(await selected(),'bundled:manic-gba');await close();
  // Atomic updates preserve the other orientation and unrelated game metadata.
  const atomic=await page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),g=(await db.all('library'))[0];await db.put('library',g.id,{...g,favorite:true});await Promise.all([db.setGameSkin(g.id,'builtin:mint','portrait'),db.setGameSkin(g.id,'builtin:sunset','landscape')]);return db.get('library',g.id);});
  assert.deepEqual(atomic.skinId,{portrait:'builtin:mint',landscape:'builtin:sunset'});assert.equal(atomic.favorite,true);
  assert.equal(await page.evaluate(async()=>{const db=await import('./src/storage/storage.js');return(await db.all('roms')).length;}),1);
  // Both orientation loads share image ownership; failed or superseded work
  // must not revoke the current skin or leak its temporary Blob URLs.
  const lifetime=await page.evaluate(async()=>{
   const db=await import('./src/storage/storage.js'),loader=await import('./src/skins/skins.js');
   const originalCreate=URL.createObjectURL,originalRevoke=URL.revokeObjectURL,originalFetch=window.fetch;
   const created=[],revoked=[];URL.createObjectURL=blob=>{const url=originalCreate(blob);created.push(url);return url;};URL.revokeObjectURL=url=>{revoked.push(url);originalRevoke(url);};
   const rep={mappingSize:{width:256,height:192},assets:{resizable:'art'},screens:[],items:[]};
   await db.put('skins','skin:lifetime',{id:'skin:lifetime',name:'Lifetime',system:'gba',images:{art:{bytes:new Uint8Array([1,2,3])}},portrait:rep,landscape:rep});
   try{
    const pair=await loader.loadSkinPair('gba','skin:lifetime'),live=pair.portrait.images.art,shared=pair.portrait===pair.landscape&&created.length===1;
    const fixture=await db.get('skins','skin:lifetime');await db.put('skins','skin:lifetime',{...fixture,system:'gb'});
    window.fetch=(url,...args)=>String(url).includes('/manic/gb/skin.json')?Promise.resolve(new Response('',{status:503})):originalFetch(url,...args);
    let failed=false;try{await loader.loadSkinPair('gb',{portrait:'skin:lifetime',landscape:'bundled:manic-gb'});}catch{failed=true;}
    const currentSurvived=!revoked.includes(live)&&(await originalFetch(live)).ok;
    let started,unblock;const gate=new Promise(r=>unblock=r),ready=new Promise(r=>started=r);
    window.fetch=async(url,...args)=>{if(String(url).includes('/manic/gb/skin.json')){started();await gate;}return originalFetch(url,...args);};
    const stale=loader.loadSkinPair('gb',{portrait:'skin:lifetime',landscape:'bundled:manic-gb'});await ready;
    const newest=await loader.loadSkinPair('gb','builtin:mint');unblock();const discarded=await stale;
    const staleIgnored=discarded===null&&newest.portrait.id==='builtin:mint';loader.releaseSkin();
    return{shared,failed,currentSurvived,staleIgnored,allRevoked:created.every(url=>revoked.includes(url)),onlyOnce:new Set(revoked).size===revoked.length};
   }finally{loader.releaseSkin();URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;window.fetch=originalFetch;}
  });
  assert.deepEqual(lifetime,{shared:true,failed:true,currentSurvived:true,staleIgnored:true,allRevoked:true,onlyOnce:true});
  assert.deepEqual(errors,[]);await context.close();
  console.log(`PASS ${kind}: legacy selections, independent portrait/landscape, per-game inheritance, live rotation/input release, deletion, atomic metadata and ROM retention.`);
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
