// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated browser UI and an original ARM loop; never reads user files.
const assert=require('node:assert/strict'),kind=process.env.BROWSER_ENGINE||'chromium',runtime=require('./browser-runtime.cjs');
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'&&process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');await page.locator('#add-first').waitFor();
  await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
  await page.evaluate(async()=>{
   const {showGBAOptions}=await import('./src/views/gba-options.js'),{createGamePreferences}=await import('./src/library/game-preferences.js');
   window.optionGame={id:'synthetic-options-a'},window.otherOptionGame={id:'synthetic-options-b'};window.optionSaved=[];window.optionToasts=[];
   window.optionPreferences=createGamePreferences({filter:'pixel'},{getGame:()=>optionGame,saveGame:(id,value)=>optionSaved.push({id,value})});window.optionSettings=optionPreferences.settings;
   window.optionEngine={supportsRTC:true,supportsGameRumble:true,sensors:{enabled:false,async enable(){this.enabled=true;return true;},disable(){this.enabled=false;}}};
   let cleanup=()=>{};
   window.showOptionFixture=system=>showGBAOptions({system,engine:optionEngine,settings:optionSettings,applySettings:()=>optionPreferences.save(),toast:text=>optionToasts.push(text),onClose:fn=>cleanup=fn,sheet:(title,body)=>{cleanup();const sheet=document.querySelector('#sheet');document.querySelector('#sheet-title').textContent=title;document.querySelector('#sheet-body').innerHTML=body;if(!sheet.open)sheet.showModal();}});
   showOptionFixture('gbc');
  });
  assert.equal(await page.locator('[data-sensor]').count(),2);assert.equal(await page.locator('[data-setting=overclock]').count(),0);assert.equal(await page.locator('[data-setting=sunlight]').count(),0);
  await page.locator('[data-sensor=tiltX]').fill('0.5');await page.locator('[data-sensor=tiltX]').dispatchEvent('change');
  assert.equal(await page.evaluate(()=>optionGame.preferences.tiltX),.5);
  await page.locator('#motion-toggle').click();assert.equal(await page.locator('[data-sensor=tiltX]').isDisabled(),true);await page.locator('#motion-toggle').click();
  await page.locator('[data-setting=rtcMode]').selectOption('offset');assert.equal(await page.locator('#rtc-adjust').isVisible(),true);
  await page.locator('#rtc-date').evaluate(input=>{const date=new Date(Date.now()+86400000);const p=n=>String(n).padStart(2,'0');input.value=`${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;});
  await page.locator('#rtc-apply').click();const offset=await page.evaluate(()=>optionSettings.rtcOffset);assert.ok(offset>86300&&offset<=86400);
  await page.locator('#rtc-date').fill('2099-01-01T12:00');await page.locator('#rtc-apply').click();assert.equal(await page.evaluate(()=>optionSettings.rtcOffset),offset,'Invalid date preserves the last setting');
  await page.locator('[data-setting=gameRumble]').check();assert.equal(await page.evaluate(()=>optionGame.preferences.gameRumble),true);
  for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.equal(await page.locator('#sheet-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'Date/time control fits the sheet');}
  await page.locator('[data-setting=rtcMode]').selectOption('auto');assert.equal(await page.locator('#rtc-adjust').isVisible(),false);
  assert.equal(await page.evaluate(()=>optionPreferences.global.gameRumble),undefined);assert.equal(await page.evaluate(()=>otherOptionGame.preferences),undefined);
  await page.evaluate(()=>showOptionFixture('gba'));assert.equal(await page.locator('[data-sensor]').count(),3);assert.equal(await page.locator('[data-setting=overclock]').count(),1);
  assert.equal(await page.locator('[data-setting=overclock]').inputValue(),'0','Untouched cartridges default to automatic CPU selection');
  await page.locator('[data-setting=overclock]').selectOption('1');assert.equal(await page.evaluate(()=>optionGame.preferences.overclock),1);
  await page.locator('[data-setting=overclock]').selectOption('0');assert.equal(await page.evaluate(()=>optionGame.preferences.overclock),0);
  await page.evaluate(()=>{optionEngine.supportsRTC=false;optionEngine.supportsGameRumble=false;showOptionFixture('gb');});assert.equal(await page.locator('[data-setting=rtcMode]').count(),0);assert.equal(await page.locator('[data-setting=gameRumble]').count(),0);
  const rtc=await page.evaluate(async()=>{
   const {MGBACore}=await import('./src/core/mgba.js');const engine=new MGBACore(document.createElement('canvas'));
   const rom=new Uint8Array(8192);new DataView(rom.buffer).setUint32(0,0xeafffffe,true);rom[0xb2]=0x96;
   try{
    engine.setCartridgeOptions({rtcMode:'offset',rtcOffset:3600,gameRumble:true});const start=engine.startLoop;let initialOffset;engine.startLoop=function(){initialOffset=this.m._web_rtc_offset();start.call(this);};
    await engine.load(rom);engine.pause(true);if(initialOffset!==3600)throw Error('Clock must be configured before the first frame');engine.setCartridgeOptions({rtcMode:'offset',rtcOffset:3600,gameRumble:true});
    const state=engine.state();engine.m._web_rtc_set(1,42);engine.loadState(state);const restored=engine.m._web_rtc_offset();
    engine.reset();const reset=engine.m._web_rtc_offset();engine.setCartridgeOptions({rtcMode:'auto'});const automatic=engine.m._web_rtc_mode();
    engine.setCartridgeOptions({rtcMode:'offset',rtcOffset:Infinity});const invalid=engine.m._web_rtc_offset();
    return {restored,reset,automatic,invalid,paused:engine.rumble.paused};
   }finally{engine.close();}
  });assert.deepEqual(rtc,{restored:3600,reset:3600,automatic:0,invalid:0,paused:true});
  const clocks=await page.evaluate(async()=>{
   const {MGBACore}=await import('./src/core/mgba.js'),{recommendedGBACPUClock}=await import('./src/core/mgba-clock.js');
   const rom=new Uint8Array(0x02000008),view=new DataView(rom.buffer);view.setUint32(0,0xeafffffe,true);rom[0xb2]=0x96;
   const plain=recommendedGBACPUClock(rom);view.setUint32(0x02000000,0x50534b50,true);view.setUint32(0x02000004,0x31534349,true);
   const engine=new MGBACore(document.createElement('canvas')),initial=[];engine.startLoop=function(){initial.push(this.overclock);};
   try{
    engine.setCartridgeOptions({});await engine.load(rom);const auto=engine.overclock,calls=[],native=engine.m._web_overclock;
    engine.m._web_overclock=value=>{calls.push(value);return native(value);};
    const state=engine.state();engine.reset();engine.loadState(state);engine.linkIO().enable(true);engine.linkIO().enable(false);
    const restored=calls.at(-1);engine.setCartridgeOptions({overclock:1});engine.loadState(state);const explicit=engine.overclock;
    engine.setCartridgeOptions({overclock:0});const selectedAuto=engine.overclock;
    rom[0x02000004]^=1;const unknown=recommendedGBACPUClock(rom);rom[0x02000004]^=1;
    const padded=new Uint8Array(rom.length+3);padded.set(rom,3);const offsetView=recommendedGBACPUClock(padded.subarray(3));
    return {plain,auto,initial,restored,explicit,selectedAuto,unknown,offsetView,resetAndState:calls.slice(0,2)};
   }finally{engine.close();}
  });assert.deepEqual(clocks,{plain:1,auto:2,initial:[2],restored:2,explicit:1,selectedAuto:2,unknown:1,offsetView:2,resetAndState:[2,2]},'Extended cartridges use the upstream CPU default without changing ordinary ROMs or explicit choices');
  // A real app launch must not execute while persistent-save verification waits.
  // This original program reads SRAM once and renders that byte, then loops.
  // Running even one frame before restore therefore leaves the wrong pixel.
  await page.reload();await page.locator('#add-first').waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
  const startupROM=new Uint8Array(8192),startupView=new DataView(startupROM.buffer);startupROM[0xb2]=0x96;startupView.setUint32(0,0xea00003e,true);
  const program=[0xe59f0020,0xe3a01003,0xe3811b01,0xe1c010b0,0xe59f0014,0xe5d01000,0xe5c01000,0xe59f000c,0xe1c010b0,0xeafffffe,0x04000000,0x0e000000,0x06000000];program.forEach((word,index)=>startupView.setUint32(0x100+index*4,word,true));startupROM.set(Buffer.from('SRAM_V113'),0x200);
  await page.locator('#rom-input').setInputFiles({name:'Original startup order.gba',mimeType:'application/octet-stream',buffer:Buffer.from(startupROM)});await page.locator('.game-launch').waitFor();
  await page.evaluate(async()=>{
   const db=await import('./src/storage/storage.js'),{saveKey,coreFor}=await import('./src/core/core-registry.js'),{hash}=await import('./src/shared.js'),{MGBACore}=await import('./src/core/mgba.js'),{SaveProtection}=await import('./src/storage/save-safety.js');
   const game=(await db.all('library'))[0],fixture=new MGBACore(document.createElement('canvas'));let save;
   try{await fixture.load(await db.get('roms',game.id));fixture.pause(true);fixture.m._web_frame(0);fixture.m._web_frame(0);save=fixture.save();if(save?.length!==32768)throw Error('Synthetic SRAM fixture must export a valid 32 KiB save: '+save?.length);save[0]=31;}finally{fixture.close();}
   await db.put('saves',saveKey(game),{bytes:save,hash:await hash(save),at:Date.now(),coreId:coreFor(game).id});
   window.startupGateEnabled=true;window.startupVerifyWaiting=false;window.startupRestored=false;window.startupRestoreFrames=[];window.startupFrameEvents=[];
   const load=MGBACore.prototype.load,restore=MGBACore.prototype.restore,verify=SaveProtection.prototype.verify;
   MGBACore.prototype.load=async function(...args){window.startupCore=this;const result=await load.apply(this,args),frame=this.m._web_frame;this.m._web_frame=keys=>{startupFrameEvents.push({restored:startupRestored});return frame(keys);};return result;};
   MGBACore.prototype.restore=function(...args){startupRestoreFrames.push(this.frames);const result=restore.apply(this,args);startupRestored=true;return result;};
   SaveProtection.prototype.verify=async function(...args){const bytes=await verify.apply(this,args);if(startupGateEnabled){startupVerifyWaiting=true;await new Promise(resolve=>window.releaseStartupVerify=resolve);startupVerifyWaiting=false;}return bytes;};
  });
  await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.waitForFunction(()=>window.startupVerifyWaiting);
  const waiting=await page.evaluate(async()=>{for(let i=0;i<8;i++)await new Promise(requestAnimationFrame);return {frames:startupCore.frames,paused:startupCore.paused,restores:startupRestoreFrames.length,calls:startupFrameEvents.length};});
  assert.deepEqual(waiting,{frames:0,paused:true,restores:0,calls:0},'Save verification spans browser frames without running the game');
  await page.evaluate(()=>releaseStartupVerify());await page.locator('#loading').waitFor({state:'hidden'});await page.waitForFunction(()=>startupCore.frames>=2);
  const started=await page.evaluate(()=>{const m=startupCore.m,p=m._web_pixels();return {restores:startupRestoreFrames,allAfterRestore:startupFrameEvents.every(frame=>frame.restored),pixel:[...m.HEAPU8.subarray(p,p+3)]};});
  assert.deepEqual(started.restores,[0]);assert.equal(started.allAfterRestore,true);assert.ok(started.pixel[0]>200&&started.pixel[1]<10&&started.pixel[2]<10,'The first SRAM read must see the restored red-pixel byte');
  await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  await page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),{saveKey}=await import('./src/core/core-registry.js'),game=(await db.all('library'))[0];await db.remove('saves',saveKey(game));startupGateEnabled=false;startupRestored=false;startupRestoreFrames=[];startupFrameEvents=[];});
  await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});await page.waitForFunction(()=>startupCore.frames>=2);
  assert.deepEqual(await page.evaluate(()=>({paused:startupCore.paused,waiting:startupVerifyWaiting,restores:startupRestoreFrames})),{paused:false,waiting:false,restores:[]},'A normal launch without a saved record still starts');
  await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);await context.close();console.log('PASS: cartridge UI, GB/GBC sensor scope, clock validation, per-game persistence, delayed-save startup ordering and core lifecycle. '+kind);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
