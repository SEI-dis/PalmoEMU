// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated browser and authored cartridge only. Desktop WebKit is not an iPhone.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(25000);
  page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(({version,scope})=>{localStorage.setItem('manic-settings',JSON.stringify({showFps:true}));localStorage.setItem('palmo-release-seen:'+scope,version);},{version:require('../package.json').version,scope:new URL('.',base).pathname});
  await page.goto(base);
  // The app shell disables double-tap zoom while preserving panning and pinch.
  // Standalone documents must be checked in their own page, outside that shell.
  for(const selector of ['html','body'])assert.equal(await page.locator(selector).evaluate(el=>getComputedStyle(el).touchAction),'manipulation','App shell preserves scrolling/pinch and suppresses double-tap zoom');
  const documentation=await context.newPage();documentation.on('pageerror',e=>errors.push(e.message));
  await documentation.goto(new URL('privacy.html',base).href);
  for(const selector of ['html','body'])assert.equal(await documentation.locator(selector).evaluate(el=>getComputedStyle(el).touchAction),'auto','Standalone documentation keeps browser gestures');
  assert.doesNotMatch(await documentation.locator('meta[name=viewport]').getAttribute('content'),/user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=/i,'Documentation retains browser zoom');
  await documentation.close();await page.bringToFront();
  await page.evaluate(async()=>{
   const {MGBACore}=await import('./src/core/mgba.js'),original=MGBACore.prototype.setKeys;
   window.testKeys=0;window.testKeyHistory=[];
   MGBACore.prototype.setKeys=function(keys){testKeys=keys;if(testKeyHistory.at(-1)!==keys)testKeyHistory.push(keys);return original.call(this,keys);};
  });
  await page.locator('#rom-input').setInputFiles({name:'Selection fixture.gba',mimeType:'application/octet-stream',buffer:Buffer.from(require('./link.cjs').cartridge(31,992))});
  await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
  await page.evaluate(()=>{
   const status=document.querySelector('#save-status');status.hidden=false;status.textContent='Saved 19:41';
   const nested=document.createElement('span');nested.id='selection-player-child';nested.textContent='Player padding';nested.style.cssText='position:absolute;top:10px;left:10px;z-index:50;padding:10px';document.querySelector('#player').append(nested);
   const outside=document.createElement('p');outside.id='selection-outside';outside.textContent='Selectable non-player text';document.body.append(outside);
  });
  // Check the final cascade: panel styles must not re-enable double-tap zoom
  // on player padding/status, or disable native scrolling inside the panel.
  assert.equal(await page.locator('#player').evaluate(el=>getComputedStyle(el).touchAction),'pan-y');
  for(const selector of ['#skin','.skin-button[aria-label=A]'])assert.equal(await page.locator(selector).evaluate(el=>getComputedStyle(el).touchAction),'none');
  assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).touchAction),'manipulation','Playing retains the app-shell policy outside the player');
  assert.doesNotMatch(await page.locator('meta[name=viewport]').getAttribute('content'),/user-scalable\s*=\s*(?:no|0)|maximum-scale\s*=/i,'Do not disable zoom globally');
  const scale=await page.evaluate(()=>visualViewport.scale);
  await page.locator('#selection-player-child').tap();await page.locator('#selection-player-child').tap();
  assert.equal(await page.evaluate(()=>visualViewport.scale),scale);
  const inspect=selector=>page.locator(selector).evaluate(el=>{
   const style=getComputedStyle(el),events={};
   for(const type of ['contextmenu','selectstart','dragstart','copy','cut','paste']){
    const event=new Event(type,{bubbles:true,cancelable:true});el.dispatchEvent(event);events[type]=event.defaultPrevented;
   }
   return {select:style.getPropertyValue('user-select')||style.getPropertyValue('-webkit-user-select'),webkitSelect:style.getPropertyValue('-webkit-user-select'),callout:style.getPropertyValue('-webkit-touch-callout'),calloutSupported:CSS.supports('-webkit-touch-callout','none'),events};
  });
  for(const selector of ['#player','#save-status','#fps-meter','#selection-player-child','.skin-button[aria-label=A]']){
   const state=await inspect(selector);
   assert.equal(state.select,'none',selector+' cannot select text');
   assert.equal(state.webkitSelect,'none',selector+' WebKit selection');
   if(state.calloutSupported)assert.equal(state.callout,'none',selector+' WebKit callout');
   for(const event of ['contextmenu','selectstart','dragstart'])assert.equal(state.events[event],true,selector+' suppresses '+event);
  }
  const outside=await inspect('#selection-outside');assert.notEqual(outside.select,'none');assert.ok(Object.values(outside.events).every(value=>!value),'Non-player text remains unaffected');
  console.log('PASS: app-shell/document gesture policies, player selection scope and non-player text');
  // Real editable controls inside the protected player must override its policy.
  await page.evaluate(()=>{
   const fixture=document.createElement('div');fixture.id='selection-fields';fixture.style.cssText='position:fixed;top:100px;left:20px;z-index:100;width:300px;background:#111';
   fixture.innerHTML='<input id="selection-input" value="1234"><textarea id="selection-textarea">Room note</textarea><select id="selection-select"><option value="1">One</option><option value="2">Two</option></select><div id="selection-editable" contenteditable="true"><span>Editable note</span></div><div id="selection-empty-editable" contenteditable><span>Editable note</span></div><div id="selection-plain-editable" contenteditable="plaintext-only"><span>Editable note</span></div>';
   document.querySelector('#player').append(fixture);
  });
  for(const selector of ['#selection-input','#selection-textarea','#selection-select','#selection-editable span','#selection-empty-editable span','#selection-plain-editable span']){
   const state=await inspect(selector);assert.equal(state.select,'text',selector+' selection is retained');
   if(state.calloutSupported)assert.equal(state.callout,'default',selector+' native editing menu is retained');
   assert.ok(Object.values(state.events).every(value=>!value),selector+' editing events remain available');
  }
  for(const selector of ['#selection-input','#selection-textarea']){
   await page.locator(selector).fill('1234');await page.locator(selector).selectText();
   assert.deepEqual(await page.locator(selector).evaluate(el=>[el.selectionStart,el.selectionEnd]),[0,4]);
   await page.keyboard.insertText('5678');assert.equal(await page.locator(selector).inputValue(),'5678');
  }
  await page.locator('#selection-select').selectOption('2');assert.equal(await page.locator('#selection-select').inputValue(),'2');
  await page.locator('#selection-editable').fill('Editable note');await page.locator('#selection-editable').selectText();
  assert.equal(await page.evaluate(()=>getSelection().toString()),'Editable note');
  await page.keyboard.insertText('Replaced');assert.equal(await page.locator('#selection-editable').textContent(),'Replaced');
  await page.evaluate(()=>{document.querySelector('#selection-fields').remove();document.querySelector('#selection-player-child').remove();getSelection().removeAllRanges();});
  console.log('PASS: native editable controls');
  const a=page.locator('.skin-button[aria-label=A]'),b=page.locator('.skin-button[aria-label=B]');
  const center=async locator=>{const r=await locator.boundingBox();return{x:r.x+r.width/2,y:r.y+r.height/2};};
  const aPoint=await center(a),bPoint=await center(b),keys=async value=>{try{await page.waitForFunction(value=>window.testKeys===value,value,{timeout:5000});}catch(e){throw Error('Expected keys '+value+': '+JSON.stringify(await page.evaluate(()=>({keys:testKeys,history:testKeyHistory,paused:!document.querySelector('#resume-game').hidden,errors:document.querySelector('#toast').textContent}))),{cause:e});}};
  await page.mouse.move(aPoint.x,aPoint.y);await page.mouse.down();await keys(1);await page.waitForTimeout(800);await keys(1);
  assert.equal(await page.evaluate(()=>getSelection().toString()),'','Holding a game button does not select text');
  await page.mouse.up();await keys(0);
  await page.evaluate(()=>{testKeyHistory=[0];});
  await b.tap();await b.tap();await keys(0);
  assert.deepEqual(await page.evaluate(()=>testKeyHistory),[0,2,0,2,0],'Rapid repeated taps both reach the core and release');
  assert.equal(await page.evaluate(()=>visualViewport.scale),scale);
  if(kind==='chromium'){
   const cdp=await context.newCDPSession(page);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...aPoint},{id:2,...bPoint}]});
   await keys(3);await page.waitForTimeout(800);await keys(3);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{id:1,...aPoint}]});await keys(2);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await keys(0);
  }
  // Lifecycle cancellation must still release held game input.
  await page.mouse.move(aPoint.x,aPoint.y);await page.mouse.down();await keys(1);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await keys(0);await page.mouse.up();
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS: app-shell manipulation and standalone-document auto policies, player double-tap policy, selection guards, editable exceptions, rapid taps, held/touch input and cancellation; Chromium also checks simultaneous touch. '+kind+'. Physical iPhone gestures not tested.');
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
