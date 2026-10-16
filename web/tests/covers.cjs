// SPDX-License-Identifier: AGPL-3.0-or-later
// Local artwork and synthetic cartridges only. External networking is forbidden.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const kind=process.env.BROWSER_ENGINE||'chromium',pw=require('./browser-runtime.cjs');
(async()=>{
 const browser=await pw[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 let context;
 try{
  context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage(),requests=[],errors=[];
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';
  context.on('request',r=>{if(/^https?:/.test(r.url()))requests.push({url:r.url(),method:r.method(),body:r.postData()});});
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  // This legacy cover preference belongs to the current-release fixture.
  await context.addInitScript(({version,scope})=>{if(!localStorage.getItem('manic-settings'))localStorage.setItem('manic-settings',JSON.stringify({autoCovers:true}));localStorage.setItem('palmo-release-seen:'+scope,version);},{version:require('../package.json').version,scope:new URL('.',base).pathname});
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);await page.goto(base);
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.locator('#content .empty-library').waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).autoCovers),undefined,'Legacy opt-in is removed');
  await page.locator('[data-tab=settings]').click();assert.equal(await page.locator('[data-setting=autoCovers]').count(),0);
  const rom=Buffer.from(require('./cartridges.cjs').gb());
  await page.locator('#rom-input').setInputFiles({name:'Local Test.gb',mimeType:'application/octet-stream',buffer:rom});
  await page.locator('.game-launch').click();await page.locator('[data-action=cover]').click();
  assert.equal(await page.locator('[data-action=cover-search]').count(),0);
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=400;const x=c.getContext('2d');['#ff0000','#00ff00','#0000ff','#ffff00'].forEach((color,index)=>{x.fillStyle=color;x.fillRect(index*200,0,200,400);});return c.toDataURL('image/png').split(',')[1];}),'base64');
  const before=await page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),[g]=await db.all('library'),bytes=new Uint8Array([9,7,5,3]);await db.put('saves',g.id,{bytes,at:1});await db.put('backups',g.id,[{bytes:bytes.slice(),at:0}]);return JSON.stringify([await db.all('saves'),await db.all('backups'),await db.all('states')]);});
  const readCover=()=>page.evaluate(async()=>(await(await import('./src/storage/storage.js')).all('library'))[0].cover||null);
  const originalCover=await readCover();
  const chooser=page.waitForEvent('filechooser');await page.locator('[data-action=cover-local]').click();
  await (await chooser).setFiles({name:'Original Artwork.png',mimeType:'image/png',buffer:png});
  const crop=page.locator('#cover-crop-canvas'),zoom=page.locator('#cover-crop-zoom');await crop.waitFor();
  assert.equal(await readCover(),originalCover,'Selecting an image is only a preview');
  await zoom.fill('200');await zoom.dispatchEvent('input');
  const box=await crop.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*2.7,box.y+box.height/2,{steps:8});await page.mouse.up();
  await page.waitForFunction(()=>{const c=document.querySelector('#cover-crop-canvas'),p=c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data;return p[0]>240&&p[1]<10&&p[2]<10;});
  assert.equal(await readCover(),originalCover,'Moving and zooming do not change storage');
  await crop.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'cover-crop-canvas','Arrow keys keep focus on the image');
  await page.locator('#cover-crop-save').click();await page.locator('.game-info-play').waitFor();
  const saved=await page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),[g]=await db.all('library');return {g,rom:[...await db.get('roms',g.id)]};});
  assert.equal(saved.g.coverSource,'custom');assert.match(saved.g.cover,/^data:image\/(webp|png);base64,/);assert.ok(!saved.g.coverUrl);assert.deepEqual(Buffer.from(saved.rom),rom);
  const pixels=await page.evaluate(async data=>{const image=await createImageBitmap(new Blob([Uint8Array.from(atob(data.split(',')[1]),x=>x.charCodeAt(0))],{type:data.slice(5,data.indexOf(';'))})),c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const samples=[[.1,.1],[.9,.1],[.1,.9],[.9,.9],[.5,.5]].map(([x,y])=>[...ctx.getImageData(Math.floor(c.width*x),Math.floor(c.height*y),1,1).data]);image.close();return {width:c.width,height:c.height,samples};},saved.g.cover);
  assert.equal(pixels.width,pixels.height);assert.ok(pixels.width<=512);
  for(const [r,g,b,a] of pixels.samples){assert.ok(r>230&&g<20&&b<20,'Saved crop contains the chosen red area, with no outside border');assert.equal(a,255);}
  assert.equal(await page.evaluate(async()=>{const db=await import('./src/storage/storage.js');return JSON.stringify([await db.all('saves'),await db.all('backups'),await db.all('states')]);}),before,'Artwork edits leave saves, history and states byte-identical');
  await page.reload();assert.equal(await page.locator('.game-launch img').getAttribute('src'),saved.g.cover,'Local cover survives reload');
  // Old downloaded covers stay local and are never fetched again by their old URL.
  await page.evaluate(async id=>{const db=await import('./src/storage/storage.js'),g=await db.get('library',id);await db.put('library',id,{...g,coverSource:'libretro',coverUrl:'https://example.invalid/old-cover.png'});},saved.g.id);
  await page.reload();assert.equal(await page.locator('.game-launch img').getAttribute('src'),saved.g.cover);
  await page.locator('.game-launch').click();await page.locator('[data-action=cover]').click();
  await page.locator('[data-action=cover-adjust]').click();await crop.waitFor();await zoom.fill('300');await zoom.dispatchEvent('input');await page.locator('#cover-crop-cancel').click();
  assert.equal(await readCover(),saved.g.cover,'Cancelling adjustment preserves the existing cover');
  // Failure to save keeps both the original and an editable preview for retry.
  await page.locator('[data-action=cover-adjust]').click();await crop.waitFor();
  await page.evaluate(()=>{const original=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(stores,mode,...rest){if(mode==='readwrite'&&[].concat(stores).includes('library')){IDBDatabase.prototype.transaction=original;throw new DOMException('Synthetic storage pressure','QuotaExceededError');}return original.call(this,stores,mode,...rest);};});
  await page.locator('#cover-crop-save').click();await page.waitForFunction(()=>!document.querySelector('#cover-crop-save').disabled);
  assert.equal(await readCover(),saved.g.cover,'Write failure preserves the original cover');
  assert.equal(await crop.count(),1,'Write failure keeps the editor available');
  await page.locator('#cover-crop-cancel').click();
  // Closing while image decoding is pending must not reopen an old editor.
  await page.evaluate(()=>{const original=createImageBitmap;window.createImageBitmap=(...args)=>new Promise((resolve,reject)=>{window.finishCoverDecode=()=>original(...args).then(value=>{resolve(value);window.coverDecodeResolved=true;},reject);});});
  const delayed=page.waitForEvent('filechooser');await page.locator('[data-action=cover-local]').click();await(await delayed).setFiles({name:'Delayed.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>!!window.finishCoverDecode);await page.locator('#close-sheet').click();
  await page.evaluate(async()=>{const finish=window.finishCoverDecode;delete window.finishCoverDecode;finish();});
  await page.waitForFunction(()=>window.coverDecodeResolved);assert.equal(await crop.count(),0,'Late decode cannot resurrect a closed sheet');
  await page.reload();await page.locator('.game-launch').click();await page.locator('[data-action=cover]').click();
  const bad=page.waitForEvent('filechooser');await page.locator('[data-action=cover-local]').click();
  await (await bad).setFiles({name:'not-an-image.png',mimeType:'image/png',buffer:Buffer.from('invalid')});
  await page.waitForFunction(()=>document.querySelector('#cover-input').value==='');
  assert.equal(await page.evaluate(async id=>(await (await import('./src/storage/storage.js')).get('library',id)).cover,saved.g.id),saved.g.cover,'Invalid input never replaces a saved cover');
  // Exercise original crop geometry and two-pointer event handling on both
  // browser engines. These are synthetic touch events, not an iPhone gesture test.
  const gestures=await page.evaluate(async()=>{
   const {mountCoverCrop}=await import('./src/components/cover-crop.js');
   const src=document.createElement('canvas');src.width=800;src.height=400;const ctx=src.getContext('2d');['red','lime','blue','yellow'].forEach((color,index)=>{ctx.fillStyle=color;ctx.fillRect(index*200,0,200,400);});
   const bitmap=await createImageBitmap(src),host=document.createElement('div'),canvas=document.createElement('canvas'),slider=document.createElement('input');
   host.style.cssText='position:fixed;inset:0;z-index:999999';canvas.style.cssText='width:300px;height:300px';slider.type='range';slider.min=100;slider.max=400;host.append(canvas,slider);document.body.append(host);
   const editor=mountCoverCrop(canvas,slider,bitmap);const captures=new Set();canvas.setPointerCapture=id=>captures.add(id);canvas.hasPointerCapture=id=>captures.has(id);canvas.releasePointerCapture=id=>captures.delete(id);
   const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const pointer=(type,id,x,y)=>{const b=canvas.getBoundingClientRect();canvas.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',button:0,buttons:type==='pointerup'?0:1,bubbles:true,cancelable:true,clientX:b.x+x*b.width,clientY:b.y+y*b.height}));};
   pointer('pointerdown',101,.3,.5);pointer('pointerdown',102,.7,.5);pointer('pointermove',101,.1,.5);pointer('pointermove',102,.9,.5);await frame();const pinch=Number(slider.value);
   pointer('pointercancel',101,.1,.5);pointer('pointerup',102,.9,.5);const afterCancel=editor.toDataURL();pointer('pointermove',102,0,0);await frame();const ignored=editor.toDataURL()===afterCancel;
   canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));await frame();const keyboard=editor.toDataURL()!==afterCancel;
   const beforeResize=editor.toDataURL();canvas.style.width='180px';canvas.style.height='180px';await frame();const resized=editor.toDataURL()===beforeResize;
   editor.setDisabled(true);const disabled=editor.toDataURL();canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));await frame();const frozen=editor.toDataURL()===disabled;
   editor.dispose();const released=canvas.width===1&&canvas.height===1&&captures.size===0;host.remove();bitmap.close();return {pinch,ignored,keyboard,resized,frozen,released};
  });
  assert.deepEqual(gestures,{pinch:200,ignored:true,keyboard:true,resized:true,frozen:true,released:true});
  for(const r of requests){assert.equal(new URL(r.url).origin,new URL(base).origin);assert.ok(['GET','HEAD'].includes(r.method));assert.equal(r.body,null);}
  assert.deepEqual(errors,[]);console.log('PASS: local crop/zoom, selected pixels, cancel, failed writes, late decode, reload and invalid-image preservation; ROM/saves/history/states unchanged and no external requests.');
 }finally{
  // WebKit on Windows can finish every assertion but stall while closing a
  // context with a service worker. Always reach our owned browser's cleanup.
  let timer;
  try{if(context)await Promise.race([context.close(),new Promise(resolve=>{timer=setTimeout(resolve,5000);})]);}
  finally{clearTimeout(timer);await browser.close();}
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
