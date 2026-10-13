// SPDX-License-Identifier: AGPL-3.0-or-later
// Headless Chromium keeps tabs visible. Drive the visibility event explicitly
// to test the same lifecycle transition that desktop/mobile browsers deliver.
const assert=require('node:assert/strict');
const browserName=process.env.BROWSER_ENGINE||'chromium',browserType=require('./browser-runtime.cjs')[browserName];
const {cartridge}=require('./link.cjs'),{nes}=require('./core.cjs');
(async()=>{const browser=await browserType.launch({headless:true,...(browserName==='chromium'?{...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{}),args:['--autoplay-policy=no-user-gesture-required']}:{})});
try{const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');
for(const [ext,bytes] of [['gba',cartridge(31,992)],['nes',nes()]]){
 await page.locator('#rom-input').setInputFiles({name:'Visibility test.'+ext,mimeType:'application/octet-stream',buffer:Buffer.from(bytes)});
 await page.locator('.game-launch').last().click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
 await page.locator('#player-menu').click();await page.locator('[data-setting=showFps]').check();await page.locator('[data-action=play]').click();
 await page.waitForFunction(()=>/[1-9][0-9]*\.[0-9] fps/.test(document.querySelector('#fps-meter').textContent));
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
 await page.locator('#resume-game').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#fps-meter').textContent==='一時停止');
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
 await page.locator('#resume-game').click();await page.locator('#resume-game').waitFor({state:'hidden'});
 await page.waitForFunction(()=>/[1-9][0-9]*\.[0-9] fps/.test(document.querySelector('#fps-meter').textContent));
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.locator('#resume-game').waitFor({state:'visible'});await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.locator('#player-menu').click();await page.locator('#sheet').waitFor({state:'visible'});await page.locator('#close-sheet').click();await page.locator('#resume-game').waitFor({state:'hidden'});await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
 assert.equal(await page.locator('#resume-game').getAttribute('hidden'),'','Exit clears the previous pause overlay');
 // Hold the next real startup at save-session acquisition, after the player
 // becomes visible. Observe every DOM transition, not just the final frame.
 await page.evaluate(async()=>{
  const {SaveProtection}=await import('./src/save-safety.js'),open=SaveProtection.prototype.open;
  window.relaunchHeld=false;window.stalePauseSeen=false;
  const check=()=>{if(!document.querySelector('#player').hidden&&!document.querySelector('#loading').hidden&&!document.querySelector('#resume-game').hidden)stalePauseSeen=true;};
  window.relaunchObserver=new MutationObserver(check);relaunchObserver.observe(document.querySelector('#player'),{subtree:true,attributes:true,attributeFilter:['hidden']});
  SaveProtection.prototype.open=async function(...args){SaveProtection.prototype.open=open;relaunchHeld=true;await new Promise(resolve=>{window.releaseRelaunch=resolve;});return open.apply(this,args);};
 });
 await page.locator('.game-launch').last().click();await page.locator('.game-info-play').click();await page.waitForFunction(()=>window.relaunchHeld);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.locator('#loading').isVisible(),true);assert.equal(await page.locator('#resume-game').isVisible(),false,'Slow relaunch shows loading without the previous pause overlay');
 await page.evaluate(()=>releaseRelaunch());await page.locator('#loading').waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>{relaunchObserver.disconnect();return stalePauseSeen;}),false,'No stale pause overlay during startup');
 assert.equal(await page.locator('#sheet').isVisible(),false,'A normal exit does not offer interrupted-session recovery');
 await page.waitForFunction(()=>/[1-9][0-9]*\.[0-9] fps/.test(document.querySelector('#fps-meter').textContent));
 await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
 console.log('PASS: '+ext+' background pause, visible resume affordance, resumed emulation frames, normal exit and immediate relaunch without a stale pause overlay.');
}
assert.deepEqual(errors,[]);
}finally{await Promise.race([browser.close(),new Promise(r=>setTimeout(r,2500))]);}})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
