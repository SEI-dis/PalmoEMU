// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated profile and original synthetic cartridge only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const browserName=process.env.BROWSER_ENGINE||'chromium',browserType=require('./browser-runtime.cjs')[browserName];
(async()=>{
 const browser=await browserType.launch({headless:true,...(browserName==='chromium'&&process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),p=await ctx.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');
  const instrument=()=>p.evaluate(async()=>{const {MGBACore}=await import('./src/core/mgba.js'),original=MGBACore.prototype.setSpeed;MGBACore.prototype.setSpeed=function(v){window.testEngine=this;return original.call(this,v);};});await instrument();
  await p.locator('#rom-input').setInputFiles({name:'Original speed test.gba',mimeType:'application/octet-stream',buffer:Buffer.from(require('./link.cjs').cartridge(31,992))});
  const launch=async()=>{await p.locator('.game-launch').click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});};
  await launch();const button=p.locator('#boost');
  const expect=async speed=>{assert.equal(await button.textContent(),speed+'×');assert.equal(await p.evaluate(()=>testEngine.speed),speed);assert.equal(await p.evaluate(async()=>{const game=(await (await import('./src/storage/storage.js')).all('library'))[0];return game.preferences?.speed??JSON.parse(localStorage.getItem('manic-settings')).speed;}),speed);assert.equal(await button.getAttribute('aria-label'),`速度 ${speed}倍。押すと${speed%5+1}倍`);};
  await expect(1);for(const speed of [2,3,4,5,1]){await button.tap();await expect(speed);}
  const r=await button.boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.waitForTimeout(650);await expect(1);await p.mouse.up();await expect(2);
  await p.keyboard.down('Tab');await expect(3);await p.keyboard.down('Tab');await expect(3);await p.keyboard.up('Tab');await expect(3);
  for(const [key,next]of [['Enter',4],['Space',5]]){await button.focus();await p.keyboard.down(key);await expect(next);assert.equal(await p.evaluate(()=>testEngine.keys),0,'Button activation must not press game START');await p.keyboard.down(key);await expect(next);await p.keyboard.up(key);await expect(next);}
  await p.locator('#player-menu').click();assert.equal(await p.locator('[data-setting=speed]').inputValue(),'5');await p.locator('[data-setting=speed]').selectOption('2');await expect(2);await p.locator('[data-action=play]').click();await expect(2);
  await p.evaluate(()=>window.dispatchEvent(new Event('blur')));await p.locator('#resume-game').waitFor();await p.keyboard.press('Tab');await expect(2);await p.locator('#resume-game').click();await expect(2);
  for(const [width,height]of [[390,844],[844,390],[320,568],[768,1024],[1920,1080]]){
   await p.setViewportSize({width,height});await p.waitForTimeout(100);
   const position=await button.evaluate(b=>{const r=b.getBoundingClientRect(),s=b.firstElementChild.getBoundingClientRect();return{dx:(s.left+s.right-r.left-r.right)/2,dy:(s.top+s.bottom-r.top-r.bottom)/2,inside:s.left>=r.left&&s.right<=r.right&&s.top>=r.top&&s.bottom<=r.bottom};});
   assert.ok(Math.abs(position.dx)<.6&&Math.abs(position.dy)<.6&&position.inside,JSON.stringify(position));await expect(2);
   if(process.env.SCREENSHOT_DIR&&width===390){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await button.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'speed-button.png')});}
  }
  await p.locator('#player-menu').click();await p.locator('[data-action=exit]').click();await p.locator('#player').waitFor({state:'hidden'});await p.reload();await instrument();await launch();await expect(2);
  await p.locator('#player-menu').click();await p.locator('[data-action=exit]').click();await p.locator('#player').waitFor({state:'hidden'});await p.locator('[data-tab=settings]').click();await p.locator('[data-action=audio]').click();assert.match(await p.locator('#sheet').textContent(),/1〜5倍を順に切り替え/);assert.doesNotMatch(await p.locator('#sheet').textContent(),/長押し/);await p.locator('[data-setting=speed]').selectOption('4');await p.locator('#close-sheet').click();await p.locator('[data-action=controllers]').click();assert.match(await p.locator('#sheet').textContent(),/速度切り替え/);assert.doesNotMatch(await p.locator('#sheet').textContent(),/長押し/);await p.locator('#close-sheet').click();await p.locator('[data-tab=games]').click();await launch();await expect(2);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).speed),4,'Global changes preserve a game override');await p.locator('#player-menu').click();await p.locator('[data-action=resetPreferences]').click();await p.locator('#preferences-reset').click();await p.locator('[data-action=play]').click();await expect(4);await button.tap();await expect(5);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).speed),4,'Game controls never replace the global speed');
  assert.deepEqual(errors,[]);await ctx.close();
  console.log('PASS: touch 1–5 cycle, held pointer/repeated keys, keyboard activation without START, per-game/global inheritance and reset, pause/resume, reload persistence, centered portrait/landscape/tablet/desktop labels and revised help.');
 }finally{await Promise.race([browser.close(),new Promise(r=>setTimeout(r,2500))]);}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
