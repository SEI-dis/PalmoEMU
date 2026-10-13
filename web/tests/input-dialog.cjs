// SPDX-License-Identifier: AGPL-3.0-or-later
// Real dialog layout with simulated visual viewport changes. No iOS keyboard emulation.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
 await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
 await page.addInitScript(()=>{
  const viewport=new EventTarget(),listeners=new Map();Object.assign(viewport,{height:844,width:390,offsetTop:0,offsetLeft:0,scale:1});
  const add=viewport.addEventListener.bind(viewport),remove=viewport.removeEventListener.bind(viewport);
  viewport.addEventListener=(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);add(type,fn);};
  viewport.removeEventListener=(type,fn)=>{listeners.get(type)?.delete(fn);remove(type,fn);};
  Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport});
  window.keyboardViewport={set(values,type='resize'){Object.assign(viewport,values);viewport.dispatchEvent(new Event(type));},count(){return [...listeners.values()].reduce((sum,set)=>sum+set.size,0);}};
 });
 await page.goto(base+'#settings');await page.locator('#trainer-nickname').waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
 const count=()=>page.evaluate(()=>keyboardViewport.count()),baseline=await count();
 const open=()=>page.locator('#trainer-nickname').tap();
 const viewport=async(values,type)=>{await page.evaluate(({values,type})=>keyboardViewport.set(values,type),{values,type});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
 const fitted=async(top,bottom,whole=true)=>{
  const rects=await page.evaluate(()=>{const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {top:r.top,bottom:r.bottom};};return {dialog:rect('#sheet'),input:rect('#trainer-name'),save:rect('#trainer-name-form [type=submit]'),active:document.activeElement.id};});
  assert.ok(rects.dialog.top>=top+11&&rects.dialog.bottom<=bottom-11,JSON.stringify(rects));
  assert.ok(rects.input.top>=rects.dialog.top&&rects.input.bottom<=rects.dialog.bottom-10,JSON.stringify(rects));
  if(whole)assert.ok(rects.save.bottom<=rects.dialog.bottom-10,JSON.stringify(rects));
  assert.equal(rects.active,'trainer-name');
 };
 await open();assert.equal(await page.locator('#sheet').getAttribute('data-input-viewport'),null,'No change without keyboard');
 await page.locator('#trainer-name').fill('しめじトレーナー');await page.locator('#trainer-name').evaluate(input=>input.setSelectionRange(2,4));
 for(const [height,offsetTop]of [[430,0],[340,30],[300,96],[420,140]]){await viewport({height,offsetTop});await fitted(offsetTop,offsetTop+height);assert.deepEqual(await page.locator('#trainer-name').evaluate(input=>[input.value,input.selectionStart,input.selectionEnd]),['しめじトレーナー',2,4]);}
 // A native focus pan may arrive as scroll only, and keyboard toolbars can resize again.
 await viewport({offsetTop:62},'scroll');await fitted(62,482);
 await viewport({height:844,offsetTop:47});assert.equal(await page.locator('#sheet').getAttribute('data-input-viewport'),null,'Dismissal ignores stale iOS pan offset');
 await viewport({height:340,offsetTop:30,scale:1.5});assert.equal(await page.locator('#sheet').getAttribute('data-input-viewport'),null,'Keep native pinch zoom');
 await viewport({scale:1});await fitted(30,370);
 // Blurring for a button must not move it before the click finishes.
 await page.locator('#trainer-name').evaluate(input=>input.blur());const before=await page.locator('#sheet').boundingBox();await viewport({});assert.deepEqual(await page.locator('#sheet').boundingBox(),before);
 await page.locator('#trainer-name-form [type=submit]').tap();await page.locator('#sheet').waitFor({state:'hidden'});assert.match(await page.locator('#trainer-nickname').textContent(),/しめじトレーナー/);assert.equal(await count(),baseline);
 for(let n=0;n<3;n++){await open();await page.locator('#trainer-name').fill('cancel');await page.locator(n%2?'#close-sheet':'#trainer-name-cancel').tap();await page.locator('#sheet').waitFor({state:'hidden'});assert.equal(await count(),baseline);}
 await viewport({height:844,offsetTop:0});await page.setViewportSize({width:844,height:390});await viewport({height:390,width:844});await open();await viewport({height:184,offsetTop:0});await fitted(0,184,false);
 // Tiny landscape viewports can scroll the form to the save action.
 await page.locator('#trainer-name').fill('横画面');await page.locator('#trainer-name-form [type=submit]').tap();await page.locator('#sheet').waitFor({state:'hidden'});assert.match(await page.locator('#trainer-nickname').textContent(),/横画面/);
 await page.setViewportSize({width:390,height:844});await viewport({height:360,width:390,offsetTop:0});await open();await fitted(0,360);
 const output=path.join(__dirname,'../../work/input-dialog');fs.mkdirSync(output,{recursive:true});await page.locator('#sheet').screenshot({path:path.join(output,kind+'-keyboard-dialog.png')});
 await page.locator('#close-sheet').tap();await page.locator('[data-action=video]').tap();assert.equal(await page.locator('#sheet').getAttribute('data-input-viewport'),null,'No viewport styles leak into another sheet');await page.locator('#close-sheet').tap();
 await page.evaluate(()=>Object.defineProperty(window,'visualViewport',{configurable:true,value:null}));await open();assert.equal(await page.locator('#sheet').getAttribute('data-input-viewport'),null);await page.locator('#trainer-name-cancel').tap();
 assert.deepEqual(errors,[]);console.log(`PASS ${kind}: keyboard resize/pan, toolbar height, selection, pinch, dismissal, save/cancel, landscape scroll, cleanup and missing API. iPhone/Simeji hardware not tested.`);
}finally{await browser.close();}})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
