// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored cartridge and skin only. Missing pointer notifications are injected;
// desktop WebKit cannot establish the cause of an intermittent iPhone gesture.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs'),{zip}=require('./skin-fixture.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  for(const skin of ['builtin','bundled','imported']){
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[],unexpected=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>{const r=route.request();if(new URL(r.url()).origin!==new URL(base).origin||r.method()!=='GET'){unexpected.push(r.url());return route.abort();}return route.continue();});
   await page.goto(base);
   if(skin==='bundled')await page.evaluate(()=>localStorage.setItem('manic-settings',JSON.stringify({skins:{gba:'bundled:manic-gba'}})));
   if(skin==='imported'){
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=390;c.height=844;return c.toDataURL().split(',')[1];});
    const frame=(x,y,width,height)=>({x,y,width,height}),rep={mappingSize:{width:390,height:844},assets:{Large:'art.png'},screens:[{outputFrame:frame(0,0,390,260)}],items:[
     {inputs:{up:'up',down:'down',left:'left',right:'right'},frame:frame(20,480,150,150)},
     {inputs:['a'],frame:frame(270,480,70,70)},{inputs:['b'],frame:frame(200,590,70,70)}
    ]};
    const bytes=zip({'info.json':JSON.stringify({name:'Input recovery fixture',gameTypeIdentifier:'com.rileytestut.delta.game.gba',representations:{iphone:{edgeToEdge:{portrait:rep,landscape:rep}}}}),'art.png':Buffer.from(png,'base64')});
    await page.evaluate(async bytes=>{const {importSkin}=await import('./src/skins/skins.js'),skin=await importSkin(new File([new Uint8Array(bytes)],'recovery.deltaskin'));localStorage.setItem('manic-settings',JSON.stringify({skins:{gba:skin.id}}));},[...bytes]);
   }
   await page.evaluate(version=>localStorage.setItem('palmo-release-seen:'+new URL('.',location.href).pathname,version),require('../package.json').version);
   await page.reload();await page.evaluate(async()=>{const {MGBACore}=await import('./src/core/mgba.js'),set=MGBACore.prototype.setKeys;MGBACore.prototype.setKeys=function(mask){window.testKeys=mask;return set.call(this,mask);};});
   await page.locator('#rom-input').setInputFiles({name:'Touch recovery.gba',mimeType:'application/octet-stream',buffer:Buffer.from(require('./link.cjs').cartridge(31,992))});
   await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
   const controls=await page.locator('#touch-controls button').evaluateAll(buttons=>buttons.map((b,i)=>{b.dataset.testControl=String(i);return {selector:`[data-test-control="${i}"]`,name:b.getAttribute('aria-label'),pad:b.classList.contains('dpad')};}));
   const pad=controls.find(c=>c.pad).selector,a=controls.find(c=>c.name.toLowerCase()==='a').selector,b=controls.find(c=>c.name.toLowerCase()==='b').selector;
   const keys=async value=>{await page.waitForFunction(value=>window.testKeys===value,value,{timeout:3000});};
   // Synthetic IDs cannot capture real hardware pointers. Keep the DOM capture
   // protocol controllable for event-order and missing-notification regressions.
   await page.evaluate(()=>{window.captureMethods=['setPointerCapture','hasPointerCapture','releasePointerCapture'].map(k=>Element.prototype[k]);window.captures=new Map();Element.prototype.setPointerCapture=function(id){captures.set(id,this);};Element.prototype.hasPointerCapture=function(id){return captures.get(id)===this;};Element.prototype.releasePointerCapture=function(id){if(captures.get(id)===this)captures.delete(id);};});
   const pointer=(selector,type,id,x=.5,y=.5,extra={})=>page.locator(selector).evaluate((el,{type,id,x,y,extra})=>{const r=el.getBoundingClientRect();el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'touch',isPrimary:false,button:0,buttons:type==='pointerup'?0:1,clientX:r.left+r.width*x,clientY:r.top+r.height*y,...extra}));},{type,id,x,y,extra});
   const touchEnd=remaining=>page.evaluate(remaining=>{const event=new Event('touchend',{bubbles:true,cancelable:true});Object.defineProperty(event,'touches',{value:Array.from({length:remaining},()=>({}))});document.dispatchEvent(event);return event.defaultPrevented;},remaining);
   await pointer(pad,'pointerdown',41,.1,.5);await keys(32);
   // No pointerup/cancel/lostcapture: the browser still reports no fingers left.
   assert.equal(await touchEnd(0),false);await keys(0);
   await pointer(pad,'pointerdown',42,.9,.5);await keys(16);
   // A late event on another control must not erase this live direction.
   await pointer(a,'lostpointercapture',42);await keys(16);
   // Capture may have failed/been lost; a document-level finish still releases.
   await pointer('body','pointerup',42);await keys(0);
   await pointer(pad,'pointerdown',43,.1,.5);await keys(32);
   await pointer(pad,'pointerdown',44,.9,.5,{isPrimary:true});await keys(16);
   await pointer(a,'pointerdown',45);await keys(17);
   await touchEnd(1);await keys(17); // Never cancel a genuine multi-touch hold.
   await pointer(pad,'pointerup',44);await keys(1);
   await pointer('body','pointercancel',45);await keys(0);
   await pointer(pad,'pointerdown',48,.1,.5);await keys(32);
   await pointer('body','pointerdown',49,.5,.5,{isPrimary:true});await keys(0);
   await page.keyboard.down('KeyZ');await keys(2);
   await pointer(pad,'pointerdown',46,.1,.5);await keys(34);await touchEnd(0);await keys(2);
   await page.keyboard.up('KeyZ');await keys(0);
   // Recover even if setPointerCapture throws, without aborting input handling.
   await page.evaluate(()=>Element.prototype.setPointerCapture=()=>{throw new DOMException('Inactive pointer','NotFoundError');});
   await pointer(a,'pointerdown',47);await keys(1);await pointer(a,'lostpointercapture',47);await keys(1);await pointer('body','pointerup',47);await keys(0);
   await page.evaluate(()=>['setPointerCapture','hasPointerCapture','releasePointerCapture'].forEach((k,i)=>Element.prototype[k]=captureMethods[i]));
   // Real browser hit-testing, long hold and repeated taps after recovery.
   const r=await page.locator(pad).boundingBox();await page.mouse.move(r.x+r.width*.9,r.y+r.height*.5);await page.mouse.down();await keys(16);await page.waitForTimeout(700);await keys(16);await page.mouse.up();await keys(0);
   await page.locator(a).tap();await page.locator(b).tap();await keys(0);
   if(kind==='chromium'){
    const cdp=await context.newCDPSession(page),ar=await page.locator(a).boundingBox(),br=await page.locator(b).boundingBox(),pa={id:1,x:ar.x+ar.width/2,y:ar.y+ar.height/2},pb={id:2,x:br.x+br.width/2,y:br.y+br.height/2};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pa,pb]});await keys(3);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[pa]});await keys(2);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await keys(0);
   }
   await page.mouse.move(r.x+r.width*.9,r.y+r.height*.5);await page.mouse.down();await keys(16);
   await page.setViewportSize({width:844,height:390});await keys(0);await page.mouse.up();
   const rotated=await page.locator('#touch-controls .dpad').boundingBox();await page.mouse.move(rotated.x+rotated.width*.9,rotated.y+rotated.height*.5);await page.mouse.down();await keys(16);await page.mouse.up();await keys(0);
   assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);await context.close();console.log('PASS: '+kind+' '+skin+' missing-release recovery, owner isolation, primary touch, multi-touch, keyboard independence, capture failure and real input.');
  }
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
