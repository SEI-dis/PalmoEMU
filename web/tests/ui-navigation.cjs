// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic controllers and ROMs in isolated browser storage; no user devices.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/components/ui-navigation.js'),'utf8');
function deterministicNavigation(){
 const callbacks=new Map();let next=0,reads=0,active=false,capturing=false,clicks=0,backs=0,releases=0;
 const document=new EventTarget();document.hidden=false;
 const buttons=Array.from({length:5},(_,index)=>({
  disabled:false,type:'button',classList:{add(){},remove(){}},closest:()=>null,matches:()=>false,
  getClientRects:()=>[{}],getBoundingClientRect:()=>({left:index*100,right:index*100+60,top:0,bottom:40}),
  focus(){document.activeElement=this;},scrollIntoView(){},click(){clicks++;this.onClick?.();}
 }));
 document.body={querySelectorAll:()=>buttons};document.querySelector=()=>null;document.querySelectorAll=()=>buttons;document.activeElement=buttons[0];
 const pad={connected:true,axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};
 const sandbox={document,navigator:{getGamepads:()=>{reads++;return [pad];}},getComputedStyle:()=>({visibility:'visible'}),requestAnimationFrame:callback=>{callbacks.set(++next,callback);return next;},cancelAnimationFrame:id=>callbacks.delete(id)};
 vm.runInNewContext(source.replace('export function ','function ')+'\nglobalThis.create=createUINavigation;',sandbox);
 const nav=sandbox.create({active:()=>active,capturing:()=>capturing,release:()=>releases++,back:()=>backs++});
 const step=time=>{const pending=[...callbacks.values()];callbacks.clear();pending.forEach(callback=>callback(time));};
 const held=(...indexes)=>pad.buttons.forEach((button,index)=>button.pressed=indexes.includes(index));
 step(0);step(16);assert.equal(reads,0,'Inactive UI never queries gamepads');
 held(0,1,15);active=true;step(32);step(1000);assert.deepEqual([clicks,backs,releases,document.activeElement===buttons[0]],[0,0,1,true],'Entry consumes held buttons as baseline without direction repeats');
 held();step(1016);held(0,1);step(1032);step(2032);assert.deepEqual([clicks,backs],[1,1],'New accept/back presses fire once without repeating');
 active=false;const inactiveReads=reads;step(2048);step(2064);assert.equal(reads,inactiveReads);
 active=true;step(2080);assert.deepEqual([clicks,backs,releases],[1,1,2],'Re-entry cannot reuse a gameplay press');
 capturing=true;const captureReads=reads;step(3000);held(0,1,15);step(4000);assert.equal(reads,captureReads,'Capture owns gamepad polling');
 capturing=false;step(4016);step(5000);assert.deepEqual([clicks,backs,releases,document.activeElement===buttons[0]],[1,1,3,true]);
 held();step(5016);held(15);step(6000);assert.equal(document.activeElement,buttons[1]);
 step(6399);assert.equal(document.activeElement,buttons[1]);step(6400);assert.equal(document.activeElement,buttons[2],'Direction first repeats after 400 ms');
 step(6529);assert.equal(document.activeElement,buttons[2]);step(6530);assert.equal(document.activeElement,buttons[3],'Further repeats retain the 130 ms interval');
 capturing=true;step(6540);capturing=false;step(8000);step(9999);assert.equal(document.activeElement,buttons[3],'Resume discards the old repeat deadline');
 document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));const hiddenReads=reads;held(0,1);step(10000);step(10016);assert.equal(reads,hiddenReads,'Hidden UI never queries gamepads');
 document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));step(10032);assert.deepEqual([clicks,backs],[1,1]);
 held();step(10048);
 // Browsers can suspend all animation callbacks while hidden; both visibility
 // events may therefore precede the very next navigation tick.
 document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));held(0,1);document.hidden=false;document.dispatchEvent(new Event('visibilitychange'));step(11000);assert.deepEqual([clicks,backs],[1,1],'Visibility resets baseline even without a hidden animation frame');
 held();step(11016);buttons[0].focus();buttons[0].onClick=()=>nav.destroy();held(0);step(11032);assert.equal(clicks,2);assert.equal(callbacks.size,0,'Destroy from an action must not schedule another tick');
 const destroyedReads=reads;step(12000);nav.destroy();assert.equal(reads,destroyedReads);assert.equal(callbacks.size,0);
 console.log('PASS: inactive/capture/hidden zero polling, re-entry baselines, exact 400/130 ms repeats, visibility without frames, destroy during action.');
}
(async()=>{
 deterministicNavigation();
 const kind=process.env.BROWSER_ENGINE||'chromium',runtime=require('./browser-runtime.cjs');
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage();
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';await page.goto(base+'privacy.html');
  const result=await page.evaluate(async()=>{
   document.body.innerHTML='<div style="display:flex;gap:20px"><button id="one">One</button><button id="two">Two</button><button id="three">Three</button></div>';
   let active=false,capturing=false,hidden=false,reads=0,clicks=0,backs=0,releases=0;
   const pad={connected:true,axes:[0,0],buttons:Array.from({length:16},()=>({pressed:false,value:0}))};
   Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>{reads++;return [pad];}});Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
   const {createUINavigation}=await import('./src/components/ui-navigation.js'),nav=createUINavigation({active:()=>active,capturing:()=>capturing,release:()=>releases++,back:()=>backs++});
   const frames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))),check=(value,message)=>{if(!value)throw Error(message);};
   const one=document.querySelector('#one');one.onclick=()=>clicks++;one.focus();await frames();check(reads===0,'Inactive browser UI must not poll');
   pad.buttons[0].pressed=pad.buttons[1].pressed=true;active=true;await frames();check(reads>0&&clicks===0&&backs===0&&releases===1,'Browser activation uses held baseline');
   pad.buttons[0].pressed=pad.buttons[1].pressed=false;await frames();pad.buttons[0].pressed=true;await frames();check(clicks===1,'New browser press activates button');
   capturing=true;let before=reads;await frames();check(reads===before,'Capture must not have a second UI poll');pad.buttons[1].pressed=true;capturing=false;await frames();check(clicks===1&&backs===0,'Capture-held buttons cannot accept/back after resume');
   hidden=true;document.dispatchEvent(new Event('visibilitychange'));before=reads;await frames();check(reads===before,'Hidden browser UI must not poll');hidden=false;document.dispatchEvent(new Event('visibilitychange'));await frames();check(clicks===1&&backs===0,'Hidden-held buttons cannot accept/back');
   pad.buttons[0].pressed=pad.buttons[1].pressed=false;await frames();hidden=true;document.dispatchEvent(new Event('visibilitychange'));pad.buttons[0].pressed=true;hidden=false;document.dispatchEvent(new Event('visibilitychange'));await frames();check(clicks===1,'Hidden interval without frames still establishes baseline');
   pad.buttons[0].pressed=false;await frames();pad.buttons[15].pressed=true;await frames();check(document.activeElement.id==='two','New direction moves browser focus');await new Promise(resolve=>setTimeout(resolve,450));check(document.activeElement.id==='three','Held direction repeats in browser');
   active=false;before=reads;await frames();check(reads===before,'Returning to play stops all UI polling');nav.destroy();before=reads;await frames();check(reads===before,'Destroyed UI must not poll');delete document.hidden;
   return {clicks,backs,releases};
  });assert.equal(result.clicks,1);assert.equal(result.backs,0);
  // Exercise the unchanged app -> core.beforeFrame -> inputControls.poll path
  // with a real synthetic GB cartridge. A flag marks polling owned by that
  // actual callback, so no timing/FPS assumption is needed for the assertion.
  await page.goto(base);await page.locator('#add-first').waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
  await page.evaluate(async()=>{
   window.navPollStats={beforeFrames:0,inFrame:0,other:0};window.navInFrame=false;
   window.navPad={index:0,id:'Navigation test pad',connected:true,axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
   Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>{navPollStats[navInFrame?'inFrame':'other']++;return [navPad];}});
   const {MGBACore}=await import('./src/core/mgba.js'),load=MGBACore.prototype.load;
   MGBACore.prototype.load=async function(...args){window.navTestCore=this;return load.apply(this,args);};
   Object.defineProperty(MGBACore.prototype,'beforeFrame',{configurable:true,get(){return this.navigationTestFrame;},set(callback){this.navigationTestFrame=()=>{navPollStats.beforeFrames++;navInFrame=true;try{return callback();}finally{navInFrame=false;}};}});
  });
  await page.locator('#rom-input').setInputFiles({name:'Navigation-poll-test.gb',mimeType:'application/octet-stream',buffer:Buffer.from(require('./cartridges.cjs').gb())});await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
  await page.evaluate(()=>{navPollStats={beforeFrames:0,inFrame:0,other:0};navPad.buttons[0].pressed=true;});
  await page.waitForFunction(()=>navPollStats.beforeFrames>=12&&!!(navTestCore.keys&1));
  const playing=await page.evaluate(()=>({...navPollStats,keys:navTestCore.keys}));assert.equal(playing.other,0,'UI polling is absent during real emulation');assert.ok(playing.inFrame>=playing.beforeFrames&&playing.beforeFrames>=12,'Actual beforeFrame continues to poll game input');assert.ok(playing.keys&1,'Gamepad input reaches the running core');
  await page.evaluate(()=>{navPad.buttons[0].pressed=false;});await page.waitForFunction(()=>!(navTestCore.keys&1));
  await page.locator('#player-menu').click();await page.locator('#sheet[open]').waitFor();await page.evaluate(()=>{navPollStats={beforeFrames:0,inFrame:0,other:0};});
  await page.waitForFunction(()=>navPollStats.other>=3);assert.equal(await page.evaluate(()=>navPollStats.beforeFrames),0,'Paused gameplay yields input ownership back to the menu');
  await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  await context.close();console.log('PASS: '+kind+' native focus/click/repeat, zero disabled UI polls, and unchanged actual core beforeFrame input during play.');
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
