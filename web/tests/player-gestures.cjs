// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored cartridge only; desktop WebKit cannot reproduce iOS system gestures.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{assert.equal(new URL(route.request().url()).origin,new URL(base).origin);assert.equal(route.request().method(),'GET');return route.continue();});
  await page.goto(base);
  await page.locator('#rom-input').setInputFiles({name:'Gesture fixture.gba',mimeType:'application/octet-stream',buffer:Buffer.from(require('./link.cjs').cartridge(31,992))});
  await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
  await page.evaluate(()=>{
   const padding=document.createElement('div');padding.id='gesture-padding';padding.style.cssText='position:absolute;left:20px;top:120px;width:350px;height:120px;z-index:50';padding.textContent='Non-interactive player area';document.querySelector('#player').append(padding);
  });
  const pinch=async()=>{
   const cdp=await context.newCDPSession(page);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:160,y:180},{id:2,x:230,y:180}]});
   for(let i=1;i<=10;i++){
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:160-i*12,y:180},{id:2,x:230+i*12,y:180}]});
    await page.waitForTimeout(30);
   }
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(200);await cdp.detach();
  };
  const scale=await page.evaluate(()=>visualViewport.scale);
  if(kind==='chromium'){
   await pinch();assert.equal(await page.evaluate(()=>visualViewport.scale),scale,'Two-finger player gestures must not magnify the viewport');
  }
  for(let i=0;i<12;i++)await page.locator('#gesture-padding').tap();
  assert.equal(await page.evaluate(()=>visualViewport.scale),scale,'Rapid player taps must not magnify the viewport');
  // These events verify handler scope, not iOS's native recognizer. In
  // particular, desktop WebKit does not implement the iPhone zoom UI.
  const defaults=selector=>page.locator(selector).evaluate(el=>{
   const result={};for(const type of ['gesturestart','gesturechange','dblclick','touchmove','touchend','copy','cut','paste']){
    const event=new Event(type,{bubbles:true,cancelable:true});el.dispatchEvent(event);result[type]=event.defaultPrevented;
   }
   return result;
  });
  for(const selector of ['#player','#gesture-padding','#save-status','#fps-meter','#screen canvas','.skin-button[aria-label=A]']){
   const result=await defaults(selector);
   for(const type of ['gesturestart','gesturechange','dblclick','touchmove','touchend'])assert.equal(result[type],true,selector+' cancels '+type);
   for(const type of ['copy','cut','paste'])assert.equal(result[type],false);
  }
  // Browser-generated single clicks must survive: no synthetic .click()
  // forwarding or touchstart cancellation is used by the guard.
  for(const selector of ['#player-link','#player-menu','#quick-save','#quick-load','#boost','#resume-game']){
   const result=await defaults(selector);assert.equal(result.touchend,false,selector+' retains native clicks');
  }
  await page.locator('#gesture-padding').evaluate(el=>el.remove());
  for(let i=0;i<5;i++)await page.locator('#boost').tap();
  assert.equal(await page.locator('#boost').textContent(),'1×','Every speed tap fires exactly once');
  await page.locator('#player-menu').tap();await page.locator('#sheet').waitFor({state:'visible'});
  assert.equal((await defaults('#sheet')).gesturestart,false,'Settings retain native gestures');
  await page.locator('#close-sheet').tap();assert.equal(await page.locator('#resume-game').isVisible(),false,'Closing the menu resumes play');
  await page.locator('#player-link').tap();await page.locator('#link-panel').waitFor({state:'visible'});
  await page.evaluate(()=>{
   const root=document.querySelector('.link-panel-body');root.style.maxHeight='120px';
   const fixture=document.createElement('div');fixture.id='gesture-fields';
   fixture.innerHTML='<textarea>Note</textarea><select><option>One</option><option>Two</option></select><div contenteditable><span>Editable</span></div><div contenteditable="plaintext-only"><span>Plain</span></div><p style="height:800px">Scrollable</p>';
   root.append(fixture);
   // Editable controls outside the panel must also be exempt.
   const outside=fixture.cloneNode(true);outside.id='gesture-player-fields';outside.hidden=true;document.querySelector('#player').append(outside);
  });
  for(const selector of ['#link-panel','.link-panel-body','#link-input','#gesture-fields textarea','#gesture-fields select','#gesture-fields [contenteditable] span','#gesture-player-fields textarea','#gesture-player-fields select','#gesture-player-fields [contenteditable] span']){
   const result=await defaults(selector.includes('[contenteditable]')?selector.replace('[contenteditable]','[contenteditable=""]'):selector);
   assert.ok(Object.values(result).every(value=>!value),selector+' retains editing/scrolling');
  }
  assert.ok(Object.values(await defaults('#gesture-player-fields [contenteditable="plaintext-only"] span')).every(value=>!value));
  await page.locator('#link-input').fill('1234');await page.locator('#link-input').selectText();
  assert.deepEqual(await page.locator('#link-input').evaluate(el=>[el.selectionStart,el.selectionEnd]),[0,4]);
  await page.keyboard.insertText('5678');assert.equal(await page.locator('#link-input').inputValue(),'5678');
  await page.locator('#link-input').blur();
  if(kind==='chromium'){
   const cdp=await context.newCDPSession(page),r=await page.locator('.link-panel-body').boundingBox(),x=r.x+r.width/2,y=r.y+r.height-15;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});
   for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x,y:y-i*14}]});await page.waitForTimeout(30);}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
   await page.waitForFunction(()=>document.querySelector('.link-panel-body').scrollTop>20);
  }
  await page.locator('#link-panel-close').tap();
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  assert.equal((await defaults('#resume-game')).gesturestart,true,'Paused player also blocks pinch');
  await page.locator('#resume-game').tap();assert.equal(await page.locator('#resume-game').isVisible(),false);
  await page.setViewportSize({width:844,height:390});await page.locator('.skin-button[aria-label=A]').tap();
  assert.equal(await page.evaluate(()=>visualViewport.scale),scale,'Rotation and subsequent tap preserve scale');
  await page.setViewportSize({width:390,height:844});
  if(kind==='chromium'){
   // Positive control: the same native gesture really zooms an ordinary page.
   await page.evaluate(()=>{document.querySelector('#player').hidden=true;const outside=document.createElement('div');outside.style.cssText='position:fixed;inset:0;background:white';document.body.append(outside);});
   await pinch();assert.ok(await page.evaluate(()=>visualViewport.scale)>scale,'Ordinary pages keep native pinch zoom');
  }
  console.log('PASS: player pinch/rapid taps, scoped Safari event fallback, native command clicks, panel editing and scroll, pause/resume, rotation; '+kind+'. iPhone hardware gestures not tested.');
  assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
