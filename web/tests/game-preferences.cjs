// SPDX-License-Identifier: AGPL-3.0-or-later
// Real app integration in isolated profiles, using original synthetic GBA ROMs.
const assert=require('node:assert/strict');
const browserName=process.env.BROWSER_ENGINE||'chromium',browserType=require('./browser-runtime.cjs')[browserName];
(async()=>{
 const browser=await browserType.launch({headless:true,...(browserName==='chromium'&&process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));await p.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');
  await p.locator('#add-first').waitFor();await p.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
  // Disable periodic disk snapshots so rewind's own volatile behavior can be observed.
  await p.evaluate(()=>localStorage.setItem('manic-settings',JSON.stringify({autosave:false,recovery:false})));await p.reload();
  const instrument=()=>p.evaluate(async()=>{
   const {MGBACore}=await import('./src/core/mgba.js'),speed=MGBACore.prototype.setSpeed,loadState=MGBACore.prototype.loadState,state=MGBACore.prototype.state;
   MGBACore.prototype.setSpeed=function(v){window.testEngine=this;return speed.call(this,v);};
   MGBACore.prototype.loadState=function(...args){window.restoreCount=(window.restoreCount||0)+1;return loadState.apply(this,args);};
   MGBACore.prototype.state=function(...args){window.captureCount=(window.captureCount||0)+1;return state.apply(this,args);};
  });await instrument();
  await p.locator('#rom-input').setInputFiles(['A','B'].map((label,i)=>({name:`Preferences ${label}.gba`,mimeType:'application/octet-stream',buffer:Buffer.from(require('./link.cjs').cartridge(31+i,992+i))})));
  await p.getByRole('button',{name:'Preferences Bの設定を開く',exact:true}).waitFor();
  const ids=await p.evaluate(async()=>Object.fromEntries((await (await import('./src/storage/storage.js')).all('library')).map(g=>[g.name.slice(-1),g.id])));
  const details=label=>p.locator(`.game-launch[data-game="${ids[label]}"]`).click();
  const read=label=>p.evaluate(async id=>(await (await import('./src/storage/storage.js')).get('library',id)).preferences||{},ids[label]);
  const global=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')));
  const range=async(value)=>p.locator('[data-setting=volume]').evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('change',{bubbles:true}));},value);
  const settings=async(speed,volume,filter)=>{await p.locator('[data-setting=speed]').selectOption(String(speed));await range(volume);await p.locator('[data-setting=filter]').selectOption(filter);};
  const expectSettings=async(speed,volume,filter)=>{assert.equal(await p.locator('[data-setting=speed]').inputValue(),String(speed));assert.equal(Number(await p.locator('[data-setting=volume]').inputValue()),volume);assert.equal(await p.locator('[data-setting=filter]').inputValue(),filter);};
  const play=async(label)=>{await details(label);await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});};
  const exit=async()=>{await p.locator('#player-menu').click();await p.locator('[data-action=exit]').click();await p.locator('#player').waitFor({state:'hidden'});};
  const expectEngine=async(speed,volume,filter)=>assert.deepEqual(await p.evaluate(()=>({speed:testEngine.speed,volume:testEngine.volume,filter:testEngine.video.mode})),{speed,volume,filter});
  await details('A');assert.equal(await p.locator('#game-preferences-mode').textContent(),'共通設定を使用');assert.equal(await p.locator('[data-action=resetPreferences]').isDisabled(),true);
  await settings(2,.25,'edge2x');assert.equal(await p.locator('#game-preferences-mode').textContent(),'このゲームの設定');await p.locator('#close-sheet').click();
  await details('B');await expectSettings(1,.7,'pixel');await settings(3,.45,'scanlines');await p.locator('#close-sheet').click();
  assert.deepEqual(await read('A'),{speed:2,volume:.25,filter:'edge2x'});assert.deepEqual(await read('B'),{speed:3,volume:.45,filter:'scanlines'});
  assert.equal((await global()).speed,1);assert.equal((await global()).volume,.7);assert.equal((await global()).filter,'pixel');
  await p.reload();await instrument();await play('A');await expectEngine(2,.25,'edge2x');await exit();await play('B');await expectEngine(3,.45,'scanlines');await exit();
  // Only explicit game fields are overridden; an untouched field still inherits globally.
  await p.locator('[data-tab=settings]').click();await p.locator('[data-action=audio]').click();await p.locator('[data-setting=speed]').selectOption('4');await range(.6);assert.equal(await p.locator('[data-setting=preservePitch]').count(),0);await p.locator('#close-sheet').click();
  await p.locator('[data-action=video]').click();await p.locator('[data-setting=filter]').selectOption('smooth');await p.locator('[data-setting=showFps]').check();await p.locator('#close-sheet').click();await p.locator('[data-tab=games]').click();
  await details('A');await expectSettings(2,.25,'edge2x');assert.equal(await p.locator('[data-setting=preservePitch]').count(),0);await p.locator('#close-sheet').click();
  await details('B');await p.locator('[data-action=resetPreferences]').click();await p.locator('#preferences-cancel').click();await expectSettings(3,.45,'scanlines');
  const before=await p.evaluate(async id=>{const db=await import('./src/storage/storage.js');return {rom:[...await db.get('roms',id)],save:await db.get('saves',id),game:await db.get('library',id)};},ids.B);
  await p.locator('[data-action=resetPreferences]').click();await p.locator('#preferences-reset').click();await expectSettings(4,.6,'smooth');assert.equal(await p.locator('#game-preferences-mode').textContent(),'共通設定を使用');await p.locator('#close-sheet').click();
  const after=await p.evaluate(async id=>{const db=await import('./src/storage/storage.js');return {rom:[...await db.get('roms',id)],save:await db.get('saves',id),game:await db.get('library',id)};},ids.B);
  assert.deepEqual(after.rom,before.rom);assert.deepEqual(after.save,before.save);delete before.game.preferences;delete after.game.preferences;assert.deepEqual(after.game,before.game,'Reset preserves all other game metadata');assert.deepEqual(await read('B'),{});
  await p.reload();await instrument();await play('B');await expectEngine(4,.6,'smooth');assert.equal(await p.evaluate(()=>testEngine.preservePitch),true);await exit();
  await play('A');await expectEngine(2,.25,'edge2x');assert.equal(await p.locator('#fps-meter').isVisible(),true,'An untouched game field continues to inherit the common setting');
  // Actual input settings must drive the running core and survive pause/reload.
  await p.locator('#player-menu').click();await p.locator('[data-action=controllers]').click();await p.locator('[data-action=map-a]').click();await p.keyboard.press('KeyJ');
  assert.match(await p.locator('[data-action=map-a]').textContent(),/J/);await p.locator('[data-input-tab=assist]').click();await p.locator('[data-input-assist=a]').selectOption('hold');await p.locator('#close-sheet').click();
  await p.keyboard.press('KeyJ');await p.waitForFunction(()=>testEngine.keys===1);await p.keyboard.press('KeyJ');await p.waitForFunction(()=>testEngine.keys===0);
  await p.keyboard.press('KeyX');assert.equal(await p.evaluate(()=>testEngine.keys),0,'The old A key no longer drives the core');
  await p.keyboard.press('KeyJ');await p.waitForFunction(()=>testEngine.keys===1);await p.locator('#player-menu').click();assert.equal(await p.evaluate(()=>testEngine.keys),0,'Pause releases held assist');await p.locator('[data-action=controllers]').click();
  await p.locator('[data-input-tab=assist]').click();await p.locator('#input-turbo-interval').selectOption('100');await p.locator('[data-input-assist=a]').selectOption('turbo');await p.locator('#close-sheet').click();
  await p.keyboard.down('KeyJ');const pulses=await p.evaluate(()=>new Promise(resolve=>{const samples=[],end=performance.now()+320;function sample(){samples.push(testEngine.keys&1);if(performance.now()<end)requestAnimationFrame(sample);else resolve(samples);}sample();}));await p.keyboard.up('KeyJ');assert.ok(pulses.includes(1)&&pulses.includes(0),'Live core receives turbo on/off pulses');assert.equal(await p.evaluate(()=>testEngine.keys),0);
  // Touch goes through the same assist transform, not only keyboard input.
  await p.locator('#player-menu').click();await p.locator('[data-action=controllers]').click();await p.locator('[data-input-tab=assist]').click();await p.locator('[data-input-assist=a]').selectOption('hold');await p.locator('#close-sheet').click();
  await p.locator('.skin-button[aria-label="A"]').tap();await p.waitForFunction(()=>testEngine.keys===1);await p.evaluate(()=>window.dispatchEvent(new Event('blur')));await p.locator('#resume-game').waitFor();assert.equal(await p.evaluate(()=>testEngine.keys),0);await p.locator('#resume-game').click();assert.equal(await p.evaluate(()=>testEngine.keys),0);
  // Rewind records only in memory, restores a real core state and resumes input/frame stepping.
  await p.locator('#player-menu').click();await p.locator('[data-setting=rewindEnabled]').check();await p.locator('#close-sheet').click();
  const disk=()=>p.evaluate(async()=>{const db=await import('./src/storage/storage.js');return {states:await db.all('states'),recoveries:await db.all('recoveries'),saves:await db.all('saves')};});const diskBefore=await disk();
  const captures=await p.evaluate(()=>window.captureCount||0);await p.waitForFunction(n=>(window.captureCount||0)>=n+3,captures);const restores=await p.evaluate(()=>window.restoreCount||0);
  await p.locator('#player-menu').click();await p.locator('[data-action=rewind]').click();await p.locator('#sheet').waitFor({state:'hidden'});assert.equal(await p.evaluate(()=>window.restoreCount),restores+1);assert.equal(await p.evaluate(()=>testEngine.paused),false);
  const frame=await p.evaluate(()=>testEngine.frameCount());await p.waitForFunction(n=>testEngine.frameCount()>n+5,frame);assert.deepEqual(await disk(),diskBefore,'Rewind history does not write persistent states or saves');
  await p.keyboard.press('KeyJ');await p.waitForFunction(()=>testEngine.keys===1);await p.keyboard.press('KeyJ');await p.waitForFunction(()=>testEngine.keys===0);
  // The configured rewind keyboard command is routed through the integrated app too.
  const capturesAgain=await p.evaluate(()=>window.captureCount);await p.waitForFunction(n=>window.captureCount>=n+3,capturesAgain);await p.keyboard.press('KeyR');await p.waitForFunction(n=>window.restoreCount===n+2,restores);await p.waitForFunction(()=>!testEngine.paused);
  await exit();await p.reload();await instrument();await play('A');await p.keyboard.press('KeyJ');await p.waitForFunction(()=>testEngine.keys===1);await p.keyboard.press('KeyJ');await p.waitForFunction(()=>testEngine.keys===0);
  assert.equal((await read('A')).rewindEnabled,true);assert.equal((await global()).inputControls.assist.gba.modes.a,'hold');assert.equal((await global()).inputControls.profiles.gba.keyboard.KeyJ,'a');
  assert.deepEqual(errors,[]);await context.close();console.log('PASS: two-game speed/volume/filter isolation, untouched inheritance, reset/cancel, reload/launch, preserved ROM/save metadata, integrated keyboard/touch/hold/turbo, volatile rewind and resumed emulation.');
 }finally{await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,2500))]);}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
