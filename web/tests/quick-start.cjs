// SPDX-License-Identifier: AGPL-3.0-or-later
// Real app navigation and core startup, using an original tiny GB program in a
// fresh browser context. No user profile, ROM, save or external request is used.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[],traffic=[];
  page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));context.on('request',r=>traffic.push(r));
  await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  const ready=()=>page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy')&&localStorage.getItem('manic-settings')!==null);
  const close=async()=>{await page.locator('#close-sheet').click();await page.locator('#sheet').waitFor({state:'hidden'});};
  const observeCore=()=>page.evaluate(async()=>{
   const {MGBACore}=await import('./src/mgba.js'),original=MGBACore.prototype.load;
   window.quickStartLoads=0;window.quickStartFrames=0;window.quickStartCore=null;
   MGBACore.prototype.load=async function(...args){
    quickStartLoads++;const result=await original.apply(this,args);window.quickStartCore=this;
    const frame=this.m._web_frame;this.m._web_frame=(...args)=>{quickStartFrames++;return frame(...args);};return result;
   };
  });
  await page.goto(base);await ready();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).quickStart),false,'Default is off');
  const rom=Buffer.from(require('./cartridges.cjs').gb());
  await page.locator('#rom-input').setInputFiles({name:'Quick start fixture.gb',mimeType:'application/octet-stream',buffer:rom});
  await page.locator('.game-launch').waitFor();
  const fixture=await page.evaluate(async()=>{
   const db=await import('./src/storage.js'),{hash}=await import('./src/shared.js'),[game]=await db.all('library'),rom=await db.get('roms',game.id);
   const missing={id:'quick-start-missing',name:'Missing ROM fixture',system:'gb',size:rom.length};
   await db.addGame(missing,rom);await db.put('saves',missing.id,{bytes:new Uint8Array([9,4,2]),at:7});await db.detachROM(missing.id);
   return {id:game.id,name:game.name,romHash:await hash(rom)};
  });
  await page.reload();await ready();await page.locator(`[data-game="${fixture.id}"]`).waitFor();await observeCore();
  const game=()=>page.locator(`[data-game="${fixture.id}"]`),menu=()=>page.locator(`[data-details="${fixture.id}"]`);
  assert.equal(await game().getAttribute('aria-haspopup'),'dialog');assert.match(await game().getAttribute('aria-label'),/設定を開く/);
  await game().click();await page.locator('#sheet.game-info .game-info-play').waitFor();
  assert.equal(await page.locator('#player').isVisible(),false);assert.equal(await page.evaluate(()=>quickStartLoads),0,'Default card opens details without a core');await close();
  // Enable through the actual global settings UI, then reload to prove it is
  // persisted rather than a transient flag held by the library view.
  await page.locator('[data-tab=settings]').click();const toggle=page.locator('[data-setting=quickStart]');
  assert.equal(await toggle.isChecked(),false);await toggle.check();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('manic-settings')).quickStart===true);
  await page.reload();await ready();assert.equal(await toggle.isChecked(),true,'On survives reload');
  await page.locator('[data-tab=games]').click();await game().waitFor();await observeCore();
  assert.equal(await game().getAttribute('aria-haspopup'),null,'Direct start is not announced as a dialog');assert.match(await game().getAttribute('aria-label'),/プレイ/);
  assert.equal(await menu().getAttribute('aria-haspopup'),'dialog');
  await menu().click();await page.locator('#sheet.game-info .game-info-play').waitFor();
  assert.equal(await page.evaluate(()=>quickStartLoads),0,'Ellipsis still opens details');assert.equal(await page.locator('#player').isVisible(),false);await close();
  // A removed ROM retains its details and reattach action, including when quick
  // start is enabled. This must not try loading an absent cartridge.
  const missing=page.locator('[data-game="quick-start-missing"]');
  assert.equal(await missing.getAttribute('aria-haspopup'),'dialog');assert.match(await missing.getAttribute('aria-label'),/設定を開く/);
  await missing.click();await page.locator('#sheet.game-info [data-action=restoreROM]').waitFor();
  assert.equal(await page.evaluate(()=>quickStartLoads),0,'Missing ROM never starts a core');await close();
  // Selection mode owns taps and keyboard activation regardless of quick start.
  await page.locator('#library-select').click();assert.equal(await menu().count(),0);
  assert.equal(await game().getAttribute('aria-haspopup'),null);assert.equal(await game().getAttribute('aria-pressed'),'false');assert.match(await game().getAttribute('aria-label'),/選択/);
  await game().click();assert.equal(await game().getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#library-selected-count').textContent(),'1件を選択');
  await game().focus();await page.keyboard.press('Space');assert.equal(await game().getAttribute('aria-pressed'),'false');
  assert.equal(await page.evaluate(()=>quickStartLoads),0);assert.equal(await page.locator('#sheet').isVisible(),false);await page.locator('#library-select').click();
  // A normal card tap now reaches the real core without even briefly opening a
  // GameInfo dialog. Count emulated frames rather than only a visible player.
  await page.evaluate(()=>{
   window.quickStartDetailsSeen=false;
   window.quickStartObserver=new MutationObserver(()=>{const sheet=document.querySelector('#sheet');if(sheet.open&&sheet.classList.contains('game-info'))quickStartDetailsSeen=true;});
   quickStartObserver.observe(document.querySelector('#sheet'),{attributes:true,attributeFilter:['open','class']});
  });
  await game().click();await page.locator('#player').waitFor({state:'visible'});await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>quickStartFrames>=3&&quickStartCore?.paused===false);
  assert.equal(await page.evaluate(()=>quickStartLoads),1,'Quick start loads the core once');assert.equal(await page.evaluate(()=>quickStartDetailsSeen),false);assert.equal(await page.locator('#sheet').isVisible(),false);
  await page.evaluate(()=>quickStartObserver.disconnect());
  await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});await game().waitFor();
  // Turning off remains available and restores the original default behavior.
  await page.locator('[data-tab=settings]').click();await toggle.uncheck();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('manic-settings')).quickStart===false);
  await page.reload();await ready();assert.equal(await toggle.isChecked(),false,'Off survives reload');
  await page.locator('[data-tab=games]').click();await game().waitFor();await observeCore();
  assert.equal(await game().getAttribute('aria-haspopup'),'dialog');await game().focus();await page.keyboard.press('Enter');await page.locator('#sheet.game-info').waitFor();
  assert.equal(await page.evaluate(()=>quickStartLoads),0,'Disabling restores details, including keyboard activation');await close();
  const preserved=await page.evaluate(async id=>{const db=await import('./src/storage.js'),{hash}=await import('./src/shared.js');return {romHash:await hash(await db.get('roms',id)),missingSave:[...(await db.get('saves','quick-start-missing')).bytes],missingROM:await db.has('roms','quick-start-missing'),perGame:(await db.get('library',id)).preferences?.quickStart};},fixture.id);
  assert.deepEqual(preserved,{romHash:fixture.romHash,missingSave:[9,4,2],missingROM:false,perGame:undefined});
  assert.deepEqual(errors,[]);assert.ok(traffic.every(r=>r.method()==='GET'&&!r.postData()&&new URL(r.url()).origin===new URL(base).origin));
  await context.close();console.log(`PASS ${kind}: quick start defaults off, persisted on/off, real GB core launch, details ellipsis, missing-ROM reattach, selection/keyboard semantics, matching ARIA and unchanged ROM/save canary; zero uploads.`);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
