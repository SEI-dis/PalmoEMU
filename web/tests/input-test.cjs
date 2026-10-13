// SPDX-License-Identifier: AGPL-3.0-or-later
// ROM-free, isolated settings and synthetic keyboard/gamepad/touch input.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),runtime=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  // The inspector owns gamepad polling here; the library navigation controller
  // must not interpret the same synthetic pad as a second UI input consumer.
  await page.route('**/src/app.js',route=>route.fulfill({contentType:'text/javascript',body:'/* isolated input component fixture */'}));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');
  await page.evaluate(async()=>{
   const {createInputControls}=await import('./src/input-controls.js'),{createInputControlsView}=await import('./src/views/input-controls.js'),{createGamePreferences}=await import('./src/game-preferences.js'),{touchInputDefaults}=await import('./src/dpad-input.js');
   document.documentElement.removeAttribute('aria-busy');window.fixtureGame=null;window.fixtureGlobal={...touchInputDefaults};window.fixtureSaves=[];window.fixtureActions=[];window.fixturePads=[];window.fixturePressed=new Map();window.fixtureMasks=[];
   window.fixturePreferences=createGamePreferences(fixtureGlobal,{getGame:()=>fixtureGame,saveGame:async(id,preferences)=>fixtureSaves.push({id,preferences})});
   Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>fixturePads});
   const keybits={a:0,b:1,select:2,start:3,right:4,left:5,up:6,down:7,r:8,l:9,x:10,y:11,c:12,z:13};
   window.fixtureControls=createInputControls({settings:fixturePreferences.settings,keybits,pressed:fixturePressed,getState:()=>({system:'gba',active:false,paused:true,deadZone:.4}),updateKeys:()=>{let raw=0;for(const value of fixturePressed.values())raw|=value;fixtureMasks.push(raw);},action:action=>fixtureActions.push(action)});
   let cleanup=()=>{};const sheet=(title,html)=>{cleanup();cleanup=()=>{};const d=document.querySelector('#sheet');if(d.open)d.close();document.querySelector('#sheet-title').textContent=title;document.querySelector('#sheet-body').innerHTML=html;d.showModal();};
   window.fixtureShow=createInputControlsView({controls:fixtureControls,sheet,onClose:fn=>cleanup=fn,settings:fixturePreferences.settings,applySettings:()=>fixturePreferences.save()});
   const close=()=>{cleanup();document.querySelector('#sheet').close();};document.querySelector('#close-sheet').onclick=close;document.querySelector('#sheet').oncancel=()=>cleanup();fixtureShow();
  });
  await page.locator('[data-input-tab=test]').click();await page.keyboard.down('ArrowUp');await page.keyboard.down('x');
  if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'input-test-'+kind+'-390.png')});}
  assert.equal(await page.locator('[data-test-action=up]').evaluate(el=>el.classList.contains('input-test-active')),true);assert.equal(await page.locator('[data-test-action=a]').evaluate(el=>el.classList.contains('input-test-active')),true);
  await page.keyboard.down('F5');assert.match(await page.locator('#input-test-status').textContent(),/ステート保存/);await page.keyboard.up('F5');await page.keyboard.up('x');await page.keyboard.up('ArrowUp');
  assert.deepEqual(await page.evaluate(()=>fixtureActions),[]);assert.ok((await page.evaluate(()=>fixtureMasks)).every(mask=>mask===0));
  await page.evaluate(()=>{fixturePads=[{id:'Synthetic pad',index:0,connected:true,buttons:[{pressed:true,value:1}],axes:[-.8,0]}];});
  await page.waitForFunction(()=>document.querySelector('[data-test-action=left]').classList.contains('input-test-active'));
  assert.match(await page.locator('#input-test-devices').textContent(),/Synthetic pad/);await page.evaluate(()=>{fixturePads=[];});
  const touch=async(type,id,selector,x=.5,y=.5)=>page.locator(selector).evaluate((element,{type,id,x,y})=>{const r=element.getBoundingClientRect();element.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:id,pointerType:'touch',isPrimary:id===31,button:0,buttons:type==='pointerup'?0:1,clientX:r.left+r.width*x,clientY:r.top+r.height*y}));},{type,id,x,y});
  await touch('pointerdown',31,'.input-test-dpad',.1,.1);await touch('pointerdown',32,'[data-test-button=a]');
  assert.equal(await page.locator('.input-test-active').count(),3,'Diagonal and A simultaneous');await touch('pointercancel',31,'.input-test-dpad');await touch('pointerup',32,'[data-test-button=a]');assert.equal(await page.locator('.input-test-active').count(),0);
  await page.locator('[data-input-tab=touch]').click();await page.locator('[data-touch-option=touchDpadMode]').selectOption('four');assert.equal(await page.locator('[data-touch-option=touchDpadDiagonal]').isDisabled(),true);
  await touch('pointerdown',31,'.input-test-dpad',.1,.1);assert.equal(await page.locator('.input-test-active').count(),1);await touch('pointerup',31,'.input-test-dpad');
  await page.locator('[data-touch-option=touchDpadDeadZone]').selectOption('0.24');await touch('pointerdown',31,'.input-test-dpad',.65,.5);assert.equal(await page.locator('.input-test-active').count(),0);await touch('pointerup',31,'.input-test-dpad');
  await page.locator('[data-touch-option=touchHitSlop]').selectOption('16');assert.ok(await page.locator('.touch-hit-extension').count());
  // A hit in the expanded region reaches the closest visible control, even if
  // another button's transparent extension happens to be the DOM target.
  const hit=await page.evaluate(async()=>{
   const {configureBuiltinTouchTargets}=await import('./src/touch-targets.js');const box=document.createElement('div');box.style.cssText='position:fixed;top:10px;left:10px;width:200px;height:80px';box.innerHTML='<button class="skin-button" style="left:0;top:0;width:40px;height:40px">A</button><button class="skin-button" style="left:50px;top:0;width:40px;height:40px">B</button>';document.querySelector('#sheet').append(box);
   const buttons=[...box.children],seen=[];buttons.forEach((button,i)=>button.onpointerdown=()=>seen.push(i));configureBuiltinTouchTargets(box,{touchHitSlop:16});const r=buttons[0].getBoundingClientRect();buttons[1].querySelector('span').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',clientX:r.left+20,clientY:r.top+20}));
   configureBuiltinTouchTargets(box,null);const count=box.querySelectorAll('.touch-hit-extension').length;box.remove();return {seen,count};
  });assert.deepEqual(hit,{seen:[0],count:0});
  await page.evaluate(()=>{fixtureGame={id:'synthetic',preferences:{}};fixtureShow();});await page.locator('[data-input-tab=touch]').click();await page.locator('[data-touch-option=touchDpadMode]').selectOption('eight');
  const scope=await page.evaluate(async()=>{await fixturePreferences.flush();return {global:fixtureGlobal.touchDpadMode,game:fixtureGame.preferences.touchDpadMode,save:fixtureSaves.at(-1)};});assert.equal(scope.global,'four');assert.equal(scope.game,'eight');assert.equal(scope.save.id,'synthetic');
  await page.locator('#touch-options-reset').click();assert.deepEqual(await page.evaluate(()=>fixtureGame.preferences),{touchDpadMode:'eight',touchDpadDeadZone:.12,touchDpadDiagonal:.6,touchHitSlop:0});
  for(const viewport of [{width:320,height:744},{width:844,height:390}]){await page.setViewportSize(viewport);assert.equal(await page.locator('.input-controls-view').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'touch-options-'+kind+'-'+viewport.width+'.png')});}
  await page.keyboard.press('Escape');assert.equal(await page.locator('#sheet').isVisible(),false);assert.equal(await page.evaluate(()=>fixtureControls.isCapturing()),false);assert.deepEqual(errors,[]);
  await page.evaluate(()=>fixtureControls.destroy());await context.close();console.log('PASS: ROM-free input test, simultaneous inputs, shortcuts isolated, touch feel/hit slop, global/game persistence and narrow layout '+kind);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
