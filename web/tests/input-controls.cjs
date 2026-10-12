// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic keyboard/gamepad/touch input; no user controllers or ROMs.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),kind=process.env.BROWSER_ENGINE||'chromium',runtime=require('./browser-runtime.cjs');
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');
  // Install fixtures only after the real app has finished assigning handlers;
  // otherwise its asynchronous startup can overwrite the fixture's close hook.
  await page.locator('#add-first').waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
  await page.evaluate(async()=>{
   const {createInputControls}=await import('./src/input-controls.js');
   window.testInputState={system:'gba',active:true,paused:false,linked:false,deadZone:.4};window.testInputSettings={};window.testInputActions=[];window.testInputMasks=[];window.testPads=[];window.testPressed=new Map();window.testInputSaved=0;
   Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>testPads});
   const keybits={a:0,b:1,select:2,start:3,right:4,left:5,up:6,down:7,r:8,l:9,x:10,y:11,c:12,z:13};
   window.testInputs=createInputControls({settings:testInputSettings,keybits,pressed:testPressed,getState:()=>testInputState,updateKeys:time=>{let bits=0;for(const mask of testPressed.values())bits|=mask;testInputMasks.push(testInputs.transform(bits,time));},action:action=>testInputActions.push(action),saveSettings:()=>testInputSaved++,ignoreEvent:e=>!!e.target.closest?.('dialog[open]')});
  });
  await page.keyboard.down('x');assert.equal(await page.evaluate(()=>testInputMasks.at(-1)),1);await page.keyboard.up('x');assert.equal(await page.evaluate(()=>testInputMasks.at(-1)),0);
  await page.evaluate(()=>testInputs.assign('gba','keyboard','a','KeyJ'));await page.keyboard.down('x');assert.equal(await page.evaluate(()=>testInputMasks.at(-1)),0);await page.keyboard.up('x');await page.keyboard.down('j');assert.equal(await page.evaluate(()=>testInputMasks.at(-1)),1);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await page.evaluate(()=>testInputMasks.at(-1)),0);await page.keyboard.up('j');
  // Key capture suppresses all emulator shortcuts, including while paused.
  await page.evaluate(()=>{testInputState.paused=true;testInputs.capture('keyboard',code=>window.capturedKey=code);});await page.keyboard.press('F5');assert.equal(await page.evaluate(()=>capturedKey),'F5');assert.deepEqual(await page.evaluate(()=>testInputActions),[]);
  await page.keyboard.press('Escape');await page.keyboard.press('F5');await page.keyboard.press('j');assert.deepEqual(await page.evaluate(()=>testInputActions),['menu'],'Paused input permits the menu only');assert.equal(await page.evaluate(()=>testInputMasks.at(-1)),0);await page.evaluate(()=>{testInputActions.length=0;});
  await page.evaluate(()=>{testInputState.paused=false;const input=document.createElement('input');input.id='input-test-text';document.body.append(input);input.focus();});await page.keyboard.press('j');assert.equal(await page.evaluate(()=>testInputMasks.at(-1)),0,'Text editing is never game input');await page.locator('#input-test-text').evaluate(e=>e.remove());
  await page.keyboard.down('F5');await page.keyboard.down('F5');await page.keyboard.up('F5');await page.keyboard.press('F8');await page.keyboard.press('Tab');await page.keyboard.press('r');
  assert.deepEqual(await page.evaluate(()=>testInputActions),['save','load','speed','rewind']);
  const assist=await page.evaluate(()=>{
   testInputs.setAssist('gba','a','turbo');testInputs.setInterval('gba',100);const pulse=[testInputs.transform(1,0),testInputs.transform(1,60),testInputs.transform(1,100),testInputs.transform(0,110)];
   testInputs.setAssist('gba','a','hold');const hold=[testInputs.transform(1,200),testInputs.transform(0,210),testInputs.transform(1,220),testInputs.transform(0,230)];
   testInputs.transform(1,240);testInputState.paused=true;const paused=testInputs.transform(0,250);testInputState.paused=false;const resumed=testInputs.transform(0,260);
   testInputs.setAssist('gba','a','turboHold');const combined=[testInputs.transform(1,300),testInputs.transform(0,310),testInputs.transform(0,360),testInputs.transform(0,400)];
   testInputState.linked=true;const linked=[testInputs.transform(1,460),testInputs.transform(0,470)];testInputState.linked=false;const ended=testInputs.transform(0,480);testInputs.release();
   return {pulse,hold,paused,resumed,combined,linked,ended};
  });assert.deepEqual(assist,{pulse:[1,0,1,0],hold:[1,1,0,0],paused:0,resumed:0,combined:[1,1,0,1],linked:[1,0],ended:0});
  const gamepad=await page.evaluate(async()=>{
   const {deviceKey}=await import('./src/input-controls.js');testInputs.setAssist('gba','a','hold');
   const pad={index:0,id:'Synthetic pad',connected:true,buttons:Array.from({length:17},()=>({pressed:false,value:0})),axes:[0,0]};testPads=[pad];testInputs.poll(500);pad.buttons[0].pressed=true;testInputs.poll(510);const down=testInputMasks.at(-1);pad.buttons[0].pressed=false;testInputs.poll(520);const held=testInputMasks.at(-1);
   testPads=[];testInputs.poll(530);const disconnected=testInputMasks.at(-1);testPads=[pad];testInputs.poll(540);
   const key=deviceKey(pad);testInputs.assign('gba',key,'b','b0');pad.buttons[0].pressed=true;testInputs.poll(550);const remapped=testInputMasks.at(-1);pad.buttons[0].pressed=false;testInputs.poll(560);
   testInputs.capture(key,code=>window.capturedPad=code);pad.axes[0]=1;testInputs.poll(570);pad.axes[0]=0;testInputs.poll(580);
   testInputState.system='gb';pad.buttons[0].pressed=true;testInputs.poll(590);const otherSystem=testInputMasks.at(-1);pad.buttons[0].pressed=false;testInputs.poll(600);testPads=[];testInputs.release();testInputState.system='gba';
   return {down,held,disconnected,remapped,captured:capturedPad,otherSystem};
  });assert.deepEqual(gamepad,{down:1,held:1,disconnected:0,remapped:2,captured:'a0+',otherSystem:1});
  const sanitized=await page.evaluate(async()=>{
   const {sanitizeInputControls}=await import('./src/input-controls.js');return sanitizeInputControls({profiles:{gba:{keyboard:{KeyJ:'a',UntrustedKey:'b',KeyK:'uploadROM'},'https://private-device.invalid':{b0:'a'}}},assist:{gba:{interval:-1,modes:{a:'turbo',b:'javascript',unknown:'hold'}}},privateData:'not retained'});
  });assert.deepEqual(sanitized,{version:1,profiles:{gba:{keyboard:{KeyJ:'a'}}},assist:{gba:{interval:100,modes:{a:'turbo'}}}});
  // Use the actual settings component and real focus/key capture in both engines.
  await page.evaluate(async()=>{
   const {createInputControlsView}=await import('./src/views/input-controls.js');testInputState.paused=true;let cleanup=()=>{};
   const sheet=(title,html)=>{cleanup();cleanup=()=>{};const dialog=document.querySelector('#sheet');if(dialog.open)dialog.close();document.querySelector('#sheet-title').textContent=title;document.querySelector('#sheet-body').innerHTML=html;dialog.showModal();};
   window.testShowInputs=createInputControlsView({controls:testInputs,sheet,onClose:fn=>cleanup=fn,getSystem:()=>testInputState.system});
   document.querySelector('#close-sheet').onclick=()=>{cleanup();document.querySelector('#sheet').close();};testShowInputs();
  });
  await page.addStyleTag({url:new URL('input-controls.css',page.url()).href});
  for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.equal(await page.locator('.input-controls-view').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true,'Controller settings fit a narrow screen');}
  if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'input-controls.png')});}
  await page.locator('[data-action=map-a]').click();await page.keyboard.press('k');assert.match(await page.locator('[data-action=map-a]').textContent(),/K/);assert.equal(await page.locator('#input-capture').isVisible(),false);
  await page.locator('[data-action=map-b]').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#sheet').isVisible(),true);assert.equal(await page.locator('#input-capture').isVisible(),false);
  await page.locator('[data-input-tab=assist]').click();await page.locator('[data-input-assist=a]').selectOption('turboHold');await page.locator('#input-turbo-interval').selectOption('200');
  assert.deepEqual(await page.evaluate(()=>testInputs.assist('gba')),{interval:200,modes:{a:'turboHold'}});
  await page.locator('#input-system').selectOption('gb');assert.equal(await page.locator('[data-input-assist=l]').count(),0);assert.equal(await page.locator('[data-input-assist=a]').inputValue(),'off');
  await page.locator('#input-system').selectOption('gba');await page.locator('[data-input-tab=mapping]').click();await page.locator('#input-reset').click();assert.match(await page.locator('[data-action=map-a]').textContent(),/X/);
  await page.locator('[data-action=map-a]').click();await page.locator('#close-sheet').click();assert.equal(await page.evaluate(()=>testInputs.isCapturing()),false);
  await page.evaluate(()=>{testInputState.paused=false;testInputs.setAssist('gba','a','off');});await page.keyboard.down('x');assert.equal(await page.evaluate(()=>testInputMasks.at(-1)),1);await page.keyboard.up('x');
  assert.ok(await page.evaluate(()=>testInputSaved)>5);await page.evaluate(()=>testInputs.destroy());assert.deepEqual(errors,[]);await context.close();
  console.log('PASS: keyboard/per-device gamepad remapping, special actions/capture, system isolation, touch-mask turbo/hold, link suppression, release/disconnect safety, bounded configuration and settings UI. '+kind);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
