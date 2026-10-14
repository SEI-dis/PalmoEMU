// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated profiles, authored cartridge, injected storage/cleanup failures only.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const {keySaveGB}=require('./mgba-save-completion.cjs'),kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>localStorage.setItem('manic-settings',JSON.stringify({autosave:false,recovery:false})));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');await page.locator('#add-first').waitFor();if(await page.locator('#sheet').isVisible())await page.locator('#close-sheet').click();
  await page.evaluate(async()=>{
   const {MGBACore}=await import('./src/core/mgba.js'),{SaveProtection}=await import('./src/storage/save-safety.js');
   const load=MGBACore.prototype.load,save=SaveProtection.prototype.save,close=SaveProtection.prototype.close;
   MGBACore.prototype.load=async function(...args){window.testCore=this;return load.apply(this,args);};
   window.saveCalls=[];window.closeCalls=0;
   SaveProtection.prototype.save=function(core,options){window.testProtection=this;saveCalls.push(options);if(window.failSave){window.failSave=false;return Promise.reject(Error('Injected save failure'));}return save.call(this,core,options);};
   SaveProtection.prototype.close=function(){closeCalls++;if(window.failProtectionClose){window.failProtectionClose=false;const writer=this.writer,finish=writer.close;writer.close=()=>{writer.close=finish;return Promise.reject(Error('Injected protection close failure'));};}return close.call(this);};
  });
  await page.locator('#rom-input').setInputFiles({name:'Pause safety.gb',mimeType:'application/octet-stream',buffer:Buffer.from(keySaveGB())});
  const launch=async()=>{await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});};
  await launch();
  // Write immediately before menu; do not allow the early-save polling interval.
  await page.evaluate(()=>{testCore.m._web_frame(1);document.querySelector('#player-menu').click();});
  await page.waitForFunction(async()=>{const db=await import('./src/storage/storage.js');const saved=await db.get('saves',testProtection.storageKey);return saved?.bytes?.[0]===0x71;});
  assert.equal(await page.evaluate(()=>saveCalls.some(c=>c.reason==='pause'&&!c.checkpoint)),true,'Opening menu persists battery without a state');
  await page.evaluate(()=>testProtection.queue.catch(()=>{}));await page.locator('#close-sheet').click();
  await page.evaluate(()=>{const writer=testProtection.writer,commit=writer.commit;writer.commit=entry=>{writer.commit=commit;window.pauseWriteStarted=true;return new Promise(resolve=>{window.finishPauseWrite=resolve;}).then(()=>commit(entry));};});
  await page.locator('#player-menu').click();await page.waitForFunction(()=>window.pauseWriteStarted);await page.locator('#close-sheet').click();
  const count=await page.evaluate(()=>saveCalls.length);
  await page.evaluate(()=>{const bytes=testCore.save();bytes[2]=0x63;testCore.restore(bytes);Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await page.evaluate(()=>saveCalls.length),count+1,'A new pause interval must not coalesce into the old in-flight menu save');
  await page.evaluate(async()=>{finishPauseWrite();await testProtection.queue;});
  assert.equal(await page.evaluate(async()=>{const db=await import('./src/storage/storage.js');return (await db.get('saves',testProtection.storageKey)).bytes[2];}),0x63,'Progress made after resume persists even while an earlier write is slow');
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.locator('#resume-game').click();await page.locator('#player-menu').click();await page.evaluate(()=>testProtection.queue.catch(()=>{}));
  // A failed menu write must still be retried when hiding an already-paused app.
  await page.locator('#close-sheet').click();
  await page.evaluate(()=>{failSave=true;testCore.m._web_frame(1);document.querySelector('#player-menu').click();});
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Injected save failure'));
  const before=await page.evaluate(()=>saveCalls.length);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pagehide'));});
  await page.waitForFunction(()=>saveCalls.some(c=>c.reason==='background'));
  await page.evaluate(()=>testProtection.queue.catch(()=>{}));
  assert.equal(await page.evaluate(()=>saveCalls.length),before+1,'Concurrent background notifications share one save');
  assert.equal(await page.evaluate(()=>saveCalls.at(-1).checkpoint),false,'Already-paused background skips expensive state capture');
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  // A final-save failure keeps the core open and allows a normal retry.
  await page.evaluate(()=>{failSave=true;});await page.locator('[data-action=exit]').first().click();
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Injected save failure'));
  assert.equal(await page.evaluate(()=>!!testCore.closed),false);
  // Core closes successfully; protection.close fails once. Retrying must not save
  // or reopen the dead core and must release the held save-session lock.
  await page.evaluate(()=>{failProtectionClose=true;window.savedCore=testCore;});
  await page.locator('[data-action=exit]').first().click();await page.waitForFunction(()=>document.querySelector('#sheet-title').textContent==='ゲームを終了できませんでした。');
  assert.equal(await page.evaluate(()=>testCore.closed),true);assert.equal(await page.locator('#resume-game').isVisible(),false);
  const captures=await page.evaluate(()=>saveCalls.length);
  await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>saveCalls.length),captures,'Retry of teardown never reads a destroyed core');
  await launch();
  assert.equal(await page.evaluate(()=>testCore.save()[0]),0x71,'Saved battery survives close retry and immediate relaunch');
  // A core cleanup error after native destruction uses the same teardown retry.
  await page.locator('#player-menu').click();
  await page.evaluate(()=>{const close=testCore.close.bind(testCore);testCore.close=()=>{close();throw Error('Injected core close failure');};});
  await page.locator('[data-action=exit]').first().click();await page.waitForFunction(()=>document.querySelector('#sheet-title').textContent==='ゲームを終了できませんでした。');
  await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  await launch();await page.locator('#player-menu').click();
  await page.evaluate(()=>{const close=testCore.close.bind(testCore);testCore.close=()=>{testCore.close=close;throw Error('Injected close before destruction');};});
  await page.locator('[data-action=exit]').first().click();await page.waitForFunction(()=>document.querySelector('#sheet-title').textContent==='ゲームを終了できませんでした。');
  await page.evaluate(()=>document.querySelector('#resume-game').click());assert.equal(await page.evaluate(()=>testCore.paused),true,'Unfinished teardown must not resume emulation');
  await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  await launch();await page.locator('#player-menu').click();await page.locator('[data-action=exit]').first().click();await page.locator('#player').waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);console.log('PASS '+kind+': menu/background battery persistence, deduplicated hide, failed-save retry, core/protection teardown failures and relaunch.');
 }finally{await browser.close();}
})().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
