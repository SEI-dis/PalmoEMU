// SPDX-License-Identifier: AGPL-3.0-or-later
// Verify API wiring with a spy, not a claim of physical-device vibration.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs'),{zip}=require('./skin-fixture.cjs'),engine=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[engine].launch({headless:true,...(engine==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const ctx=await browser.newContext({hasTouch:true,viewport:{width:390,height:844},serviceWorkers:'block'}),p=await ctx.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await ctx.addInitScript(()=>{window.vibrations=[];Object.defineProperty(navigator,'vibrate',{configurable:true,value:n=>{vibrations.push(n);return true;}});});
  await p.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');
  await p.locator('[data-tab=settings]').click();assert.equal(await p.locator('[data-setting=haptics]').isEnabled(),true);
  await p.locator('[data-setting=haptics]').uncheck();await p.locator('[data-setting=haptics]').check();assert.equal(await p.evaluate(()=>vibrations.at(-1)),8);
  await p.locator('#rom-input').setInputFiles({name:'Haptic test.gba',mimeType:'application/octet-stream',buffer:Buffer.from(require('./link.cjs').cartridge(31,31))});
  await p.locator('[data-tab=games]').click();await p.locator('.game-launch').click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});
  await p.evaluate(()=>vibrations.length=0);await p.locator('.skin-button[aria-label=A]').tap();assert.ok((await p.evaluate(()=>vibrations)).includes(8));
  const pause=async()=>{
   await p.evaluate(()=>{vibrations.length=0;window.dispatchEvent(new Event('blur'));});
   await p.locator('#resume-game').waitFor();assert.equal(await p.evaluate(()=>vibrations.at(-1)),0,'Pausing cancels outstanding vibration');
   await p.locator('#resume-game').click();
  };
  await pause();
  await p.locator('#player-menu').click();await p.locator('[data-setting=hapticStrength]').selectOption('20');await p.locator('#close-sheet').click();
  await p.evaluate(()=>vibrations.length=0);await p.locator('.skin-button[aria-label=B]').tap();assert.ok((await p.evaluate(()=>vibrations)).includes(20));
  await p.locator('#player-menu').click();await p.locator('[data-setting=hapticStrength]').selectOption('0');await p.locator('#close-sheet').click();
  await p.evaluate(()=>vibrations.length=0);await p.locator('.skin-button[aria-label=A]').tap();assert.ok((await p.evaluate(()=>vibrations)).every(n=>n===0));
  await p.locator('#player-menu').click();await p.locator('[data-action=exit]').click();await p.locator('#player').waitFor({state:'hidden'});
  // Exercise the separate imported-skin input path, using original test artwork.
  const png=await p.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=390;canvas.height=844;return canvas.toDataURL().split(',')[1];});
  const info={name:'Haptic fixture',gameTypeIdentifier:'com.rileytestut.delta.game.gba',representations:{iphone:{edgeToEdge:{portrait:{mappingSize:{width:390,height:844},assets:{Large:'art.png'},screens:[{outputFrame:{x:0,y:60,width:390,height:260}}],items:[{inputs:['a'],frame:{x:220,y:550,width:70,height:70}}]}}}}};
  const payload=zip({'info.json':JSON.stringify(info),'art.png':Buffer.from(png,'base64')});
  await p.evaluate(async bytes=>{
   const {importSkin}=await import('./src/skins/skins.js'),skin=await importSkin(new File([new Uint8Array(bytes)],'haptic.manicskin'));
   const settings=JSON.parse(localStorage.getItem('manic-settings'));settings.skins={gba:skin.id};settings.haptics=true;settings.hapticStrength=20;localStorage.setItem('manic-settings',JSON.stringify(settings));
  },[...payload]);
  await p.reload();await p.locator('.game-launch').click();assert.equal(await p.locator('[data-setting=hapticStrength]').inputValue(),'0','A game-specific off setting survives common changes');await p.locator('[data-setting=hapticStrength]').selectOption('20');await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});
  await p.evaluate(()=>vibrations.length=0);await p.locator('.imported-control[aria-label=a]').tap();assert.ok((await p.evaluate(()=>vibrations)).includes(20),'Imported skin controls use the same vibration setting');
  await pause();await p.locator('#player-menu').click();await p.locator('[data-action=exit]').click();await p.locator('#player').waitFor({state:'hidden'});
  await p.evaluate(()=>Object.defineProperty(navigator,'vibrate',{configurable:true,value:undefined}));await p.locator('[data-tab=settings]').click();
  assert.equal(await p.locator('[data-setting=haptics]').isDisabled(),true);assert.equal(await p.locator('[data-setting=haptics]').isChecked(),false);assert.match(await p.locator('[data-setting=haptics]').locator('..').textContent(),/対応していません/);
  await p.locator('[data-tab=games]').click();await p.locator('.game-launch').click();
  assert.equal(await p.locator('[data-setting=hapticStrength]').count(),0,'Unsupported game menu must not offer a working vibration setting');
  assert.match(await p.locator('[data-menu-option=haptic]').textContent(),/非対応/);await p.locator('#close-sheet').click();
  const unavailable=await p.evaluate(async()=>{
   const {tapHaptic,stopHaptics}=await import('./src/input/haptics.js');
   Object.defineProperty(navigator,'vibrate',{configurable:true,value:()=>false});const denied=tapHaptic({haptics:true});stopHaptics();
   Object.defineProperty(navigator,'vibrate',{configurable:true,value:()=>{throw Error('unavailable');}});const failed=tapHaptic({haptics:true});stopHaptics();
   Object.defineProperty(navigator,'vibrate',{configurable:true,value:n=>{vibrations.push(n);return true;}});vibrations.length=0;
   Object.defineProperty(document,'hidden',{configurable:true,value:true});const hidden=tapHaptic({haptics:true});delete document.hidden;
   return {denied,failed,hidden,calls:vibrations};
  });
  assert.deepEqual(unavailable,{denied:false,failed:false,hidden:false,calls:[]});assert.deepEqual(errors,[]);
  await ctx.close();console.log('PASS: vibration settings, built-in/imported controls, 8/20 ms and off, pause cancellation, unsupported UI, API denial/exception and hidden-page suppression. Physical Android/iPhone untested.');
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
