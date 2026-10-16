// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated storage and an original synthetic cartridge; never uses user games.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const pw=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await pw[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),p=await ctx.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(15000);await p.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');
  const result=await p.evaluate(async()=>{
   const {builtinSkin,builtinLayout}=await import('./src/skins/skin-art.js'),{screenBounds}=await import('./src/skins/control-layout.js');let count=0;
   const inside=(f,w,h)=>f.x>=-.01&&f.y>=-.01&&f.width>0&&f.height>0&&f.x+f.width<=w+.01&&f.y+f.height<=h+.01;
   const overlaps=(a,b)=>a.x<b.x+b.width-.01&&b.x<a.x+a.width-.01&&a.y<b.y+b.height-.01&&b.y<a.y+a.height-.01;
   for(const w of [240,320,390,430,568,734,844,932,1024,1366])for(const h of [200,300,390,568,730,844,1024]){
    const rep=builtinLayout(builtinSkin('nds'),w,h),[a,b]=rep.screens.map(s=>s.outputFrame),buttons=[...rep.items,...rep.actions];
    for(const f of [a,b,...buttons.map(b=>b.frame)])if(!inside(f,w,h))throw Error(`Outside ${w}x${h}: ${JSON.stringify(f)}`);
    if(overlaps(a,b)||Math.abs(a.width/a.height-4/3)>.001||Math.abs(b.width/b.height-4/3)>.001)throw Error('Screens overlap or distort');
    for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++)if(overlaps(buttons[i].frame,buttons[j].frame))throw Error(`Controls overlap ${w}x${h}: ${buttons[i].id||buttons[i].inputs} / ${buttons[j].id||buttons[j].inputs}`);
    if(w<=h){if(Math.abs(a.y+a.height-b.y)>.01||a.width!==b.width)throw Error('Portrait pair must be contiguous');}
    else if(a.x>=b.x||a.width<b.width*1.4)throw Error('Landscape main screen must be larger on the left');
    count++;
   }
   const skin=builtinSkin('nds'),base=builtinLayout(skin,390,844),legacy=builtinLayout(skin,390,844,{screen:{scale:.7,x:.2,y:.1}});
   const before=screenBounds(base),after=screenBounds(legacy);
   if(Math.abs(after.width/before.width-.7)>.001||Math.abs(after.x-(390-after.width)*.2)>.001)throw Error('Legacy group preference lost');
   return count;
  });assert.equal(result,70);
  const stored=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).controlLayouts?.nds);
  const size=async v=>{await p.locator('#edit-size').fill(String(v));await p.locator('#edit-size').dispatchEvent('input');};
  const open=async()=>{await p.locator('[data-tab=settings]').click();await p.locator('[data-action=skins]').click();await p.locator('#skin-system').selectOption('nds');await p.locator('#edit-controls').click();await p.locator('[data-edit-mode=screen]').click();};
  await open();await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.deepEqual(await p.locator('#edit-selection option').allTextContents(),['メイン画面','サブ画面']);
  const main=p.locator('[data-edit-control=screen-main]'),sub=p.locator('[data-edit-control=screen-sub]'),beforeMain=await main.boundingBox(),beforeSub=await sub.boundingBox();
  await p.locator('#edit-selection').selectOption('screen-sub');await size(70);
  assert.deepEqual(await main.boundingBox(),beforeMain);assert.ok(Math.abs((await sub.boundingBox()).width/beforeSub.width-.7)<.01);
  await sub.focus();await p.keyboard.press('ArrowRight');await p.keyboard.press('ArrowDown');
  await p.locator('[data-edit-orientation=landscape]').click();await size(85);
  await p.locator('#edit-selection').selectOption('screen-main');await size(90);
  await p.locator('#edit-save').click();await p.locator('#skin-grid').waitFor();const saved=await stored();
  assert.equal(saved.portrait['screen-sub'].scale,.7);assert.equal(saved.landscape['screen-sub'].scale,.85);assert.equal(saved.landscape['screen-main'].scale,.9);
  await p.locator('#close-sheet').click();
  // Updating another setting after shared-layout save must not discard the layout.
  await p.locator('[data-action=audio]').click();await p.locator('[data-setting=speed]').selectOption('2');await p.locator('#close-sheet').click();assert.deepEqual(await stored(),saved);
  await p.reload();await open();await p.locator('[data-edit-orientation=portrait]').click();await p.locator('#edit-selection').selectOption('screen-sub');assert.equal(await p.locator('#edit-size').inputValue(),'70');
  await p.locator('#edit-reset').click();assert.equal(await p.locator('#edit-size').inputValue(),'100');await p.locator('#edit-cancel').click();assert.deepEqual(await stored(),saved);await p.locator('#close-sheet').click();
  await p.evaluate(async()=>{const {NDSCore}=await import('./src/core/nds.js'),load=NDSCore.prototype.load;NDSCore.prototype.load=async function(bytes){await load.call(this,bytes);const touch=this.m._web_touch;this.m._web_touch=(...args)=>{if(args[2])window.stylusCoordinates=args;return touch(...args);};};});
  await p.locator('#rom-input').setInputFiles({name:'Original NDS skin.nds',mimeType:'application/octet-stream',buffer:require('./nds-cartridge.cjs')()});await p.locator('.game-launch').click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});
  const settle=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const pixel=async green=>p.waitForFunction(g=>document.querySelector('.nds-bottom').getContext('2d').getImageData(0,0,1,1).data[1]===(g?255:0),green);
  const touch=async()=>{const r=await p.locator('.nds-bottom').boundingBox();await p.mouse.move(r.x+r.width*.8,r.y+r.height*.3);await p.mouse.down();await pixel(true);const coords=await p.evaluate(()=>window.stylusCoordinates);if(coords){assert.ok(Math.abs(coords[0]-19660)<400&&Math.abs(coords[1]-9830)<300,'Stylus coordinates match resized/swapped canvas');}await p.mouse.up();await pixel(false);};
  for(const [width,height]of [[390,844],[844,390]]){
   await p.setViewportSize({width,height});await settle();
   const expected=await p.evaluate(async()=>{const {builtinLayout,builtinSkin}=await import('./src/skins/skin-art.js'),s=JSON.parse(localStorage.getItem('manic-settings'));return builtinLayout(builtinSkin('nds'),innerWidth,innerHeight,s.controlLayouts.nds[innerWidth>innerHeight?'landscape':'portrait']).screens.map(s=>s.outputFrame);});
   for(let i=0;i<2;i++){const actual=await p.locator('.nds-display canvas').nth(i).boundingBox();for(const key of ['x','y','width','height'])assert.ok(Math.abs(actual[key]-expected[i][key])<.1,'Gameplay matches edited '+key);}
   await touch();await p.locator('#player-menu').click();await p.locator('[data-setting=ndsSwapScreens]').check();await p.locator('#close-sheet').click();await touch();
   const frames=await p.locator('.nds-display canvas').evaluateAll(cs=>cs.map(c=>({x:c.getBoundingClientRect().x,y:c.getBoundingClientRect().y,width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height})));
   await p.locator('#player-menu').click();await p.locator('[data-setting=touchControls]').uncheck();await p.locator('#close-sheet').click();
   for(let i=0;i<2;i++){const actual=await p.locator('.nds-display canvas').nth(i).boundingBox();for(const key of ['x','y','width','height'])assert.ok(Math.abs(actual[key]-frames[i][key])<.1,'Hidden controls retain edited screen');}await touch();
   await p.locator('#player-menu').click();await p.locator('[data-setting=touchControls]').check();await p.locator('[data-setting=ndsSwapScreens]').uncheck();await p.locator('#close-sheet').click();
  }
  // Fresh default layout with simulated iPhone safe areas and simultaneous controls/stylus.
  await p.locator('#player-menu').click();await p.locator('[data-action=exit]').click();await p.locator('#player').waitFor({state:'hidden'});
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('manic-settings'));delete s.controlLayouts.nds;s.speed=1;localStorage.setItem('manic-settings',JSON.stringify(s));});await p.reload();
  await p.locator('.game-launch').click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});
  const dir=path.join(__dirname,'../test-results/nds-skin');fs.mkdirSync(dir,{recursive:true});
  for(const [width,height,padding]of [[390,844,'47px 0px 34px'],[844,390,'0px 47px 21px']]){
   await p.setViewportSize({width,height});await p.locator('#player').evaluate((e,padding)=>e.style.padding=padding,padding);await settle();
   const rects=await p.locator('.nds-display canvas').evaluateAll(cs=>cs.map(c=>{const r=c.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
   for(const r of rects){assert.ok(r.x>=(width>height?47:0)-.1&&r.x+r.width<=width-(width>height?47:0)+.1);assert.ok(r.y>=(width>height?0:47)-.1&&r.y+r.height<=height-(width>height?21:34)+.1);}
   await touch();
   await p.locator('#player-menu').click();await p.locator('[data-setting=filter]').selectOption('scanlines');await p.locator('#close-sheet').click();
   const overlays=await p.locator('.nds-display').evaluate(e=>['::before','::after'].map((pseudo,i)=>{const s=getComputedStyle(e,pseudo),c=e.querySelectorAll('canvas')[i];return {content:s.content,w:parseFloat(s.width),cw:c.getBoundingClientRect().width,pointer:s.pointerEvents};}));
   for(const o of overlays){assert.equal(o.content,'""');assert.ok(Math.abs(o.w-o.cw)<.1);assert.equal(o.pointer,'none');}await touch();
   await p.locator('#player-menu').click();await p.locator('[data-setting=filter]').selectOption('pixel');await p.locator('#close-sheet').click();
   await p.locator('#toast').evaluate(e=>e.style.visibility='hidden');
   await p.screenshot({path:path.join(dir,kind+`-safe-${width}x${height}.png`)});
  }
  if(kind==='chromium'){
   const cdp=await ctx.newCDPSession(p),a=await p.locator('.skin-button[aria-label=A]').boundingBox(),b=await p.locator('.nds-bottom').boundingBox();
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2,id:1},{x:b.x+b.width*.8,y:b.y+b.height*.3,id:2}]});await pixel(true);
   await p.waitForFunction(()=>document.querySelector('.nds-top').getContext('2d').getImageData(0,0,1,1).data[1]===255);
   await p.setViewportSize({width:390,height:844});await settle();await pixel(false);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  assert.deepEqual(errors,[]);console.log(`PASS ${kind}: 70 NDS layouts, separate screen editing, persistence/reset/cancel, legacy layouts, actual swapped/resized stylus, hidden controls, safe areas and rotation input release.`);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
