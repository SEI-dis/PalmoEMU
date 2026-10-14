// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated browser storage and original synthetic cartridges only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const kind=process.env.BROWSER_ENGINE||'chromium',pw=require('./browser-runtime.cjs');
(async()=>{const browser=await pw[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),p=await ctx.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');
 const openShared=async()=>{await p.locator('[data-tab=settings]').click();await p.locator('[data-action=skins]').click();await p.locator('#edit-controls').click();};
 const setSize=async n=>{await p.locator('#edit-size').fill(String(n));await p.locator('#edit-size').dispatchEvent('input');};
 const rect=id=>p.locator(`[data-edit-control="${id}"]`).boundingBox();
 const drag=async(selector,dx,dy)=>{const b=await p.locator(selector).boundingBox();await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width/2+dx,b.y+b.height/2+dy,{steps:6});await p.mouse.up();};
 const stored=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).controlLayouts?.gba);
 const close=()=>p.locator('#close-sheet').click();
 await openShared();assert.match(await p.locator('#edit-reset').textContent(),/初期配置に戻す/);assert.doesNotMatch(await p.locator('#edit-reset').textContent(),/この向きをリセット/);
 await p.locator('#edit-selection').selectOption('a');const a=await rect('a');await setSize(150);assert.ok(Math.abs((await rect('a')).width/a.width-1.5)<.02);
 await p.locator('[data-edit-mode=screen]').click();assert.equal(await p.locator('#edit-opacity-row').isVisible(),false);
 const original=await rect('screen');await setSize(60);const scaled=await rect('screen');assert.ok(scaled.width<original.width*.8);assert.ok(Math.abs(scaled.width/scaled.height-1.5)<.01);
 await drag('[data-edit-control=screen]',-9,15);const moved=await rect('screen');assert.ok(moved.y>scaled.y+10);
 await drag('.edit-resize',8,8);assert.ok((await rect('screen')).width>moved.width+5,'Corner handle resizes screen');
 await p.locator('.edit-resize').focus();const startWidth=(await rect('screen')).width;await p.keyboard.press('ArrowLeft');assert.ok((await rect('screen')).width<startWidth);
 if(kind==='chromium'){
  const cdp=await ctx.newCDPSession(p),r=await rect('screen'),x=r.x+r.width/2,y=r.y+r.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-15,y,id:1},{x:x+15,y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-21,y,id:1},{x:x+21,y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok((await rect('screen')).width>r.width*1.2,'Two-finger screen pinch');
 }
 await setSize(60);await p.locator('[data-edit-orientation=landscape]').click();await setSize(75);
 await p.locator('[data-edit-mode=buttons]').click();await p.locator('#edit-selection').selectOption('b');await setSize(130);
 const dir=path.join(__dirname,'../test-results/layout-sizing');fs.mkdirSync(dir,{recursive:true});await p.screenshot({path:path.join(dir,kind+'-landscape-layout.png')});
 await p.locator('[data-edit-orientation=portrait]').click();await p.locator('[data-edit-mode=screen]').click();await p.screenshot({path:path.join(dir,kind+'-screen-editor.png')});
 await p.locator('#edit-save').click();await p.locator('#skin-grid').waitFor();const saved=await stored();assert.equal(saved.portrait.a.scale,1.5);assert.equal(saved.portrait.screen.scale,.6);assert.equal(saved.landscape.screen.scale,.75);assert.equal(saved.landscape.b.scale,1.3);
 await close();await p.reload();await openShared();await p.locator('[data-edit-mode=screen]').click();assert.equal(await p.locator('#edit-size').inputValue(),'60');
 await p.locator('#edit-reset').click();assert.equal(await p.locator('#edit-size').inputValue(),'100');await p.locator('[data-edit-orientation=landscape]').click();assert.equal(await p.locator('#edit-size').inputValue(),'75');
 await p.locator('#edit-cancel').click();assert.deepEqual(await stored(),saved);await close();
 await p.locator('#rom-input').setInputFiles({name:'Original layout.gba',mimeType:'application/octet-stream',buffer:Buffer.from(require('./link.cjs').cartridge(31,992))});await p.locator('.game-launch').click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});
 await p.evaluate(async()=>{const {MGBACore}=await import('./src/core/mgba.js'),set=MGBACore.prototype.setKeys;window.keys=[];MGBACore.prototype.setKeys=function(k){keys.push(k);return set.call(this,k);};});
 // Both the drawn control and its hit rectangle use the saved size. Screen is the same layout in preview and play.
 for(const [width,height]of [[390,844],[844,390],[320,568],[1024,768]]){
  await p.setViewportSize({width,height});await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const expected=await p.evaluate(async()=>{const {builtinSkin,builtinLayout}=await import('./src/skins/skin-art.js');const layout=JSON.parse(localStorage.getItem('manic-settings')).controlLayouts.gba,rep=builtinLayout(builtinSkin('gba'),innerWidth,innerHeight,layout[innerWidth>innerHeight?'landscape':'portrait']);return {screen:rep.screens[0].outputFrame,a:rep.items.find(i=>i.inputs?.[0]==='a').frame};});
  for(const [selector,key]of [['#screen','screen'],['.skin-button[aria-label=A]','a']]){const actual=await p.locator(selector).boundingBox();for(const prop of ['x','y','width','height'])assert.ok(Math.abs(actual[prop]-expected[key][prop])<.15,key+prop);}
 }
  await p.setViewportSize({width:390,height:844});await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const hit=await p.locator('.skin-button[aria-label=A]').boundingBox();await p.mouse.move(hit.x+hit.width/2,hit.y+hit.height/2);await p.mouse.down();await p.mouse.up();assert.ok(await p.evaluate(()=>keys.includes(1)));
 const withControls=await p.locator('#screen').boundingBox();await p.locator('#player-menu').click();await p.locator('[data-setting=touchControls]').check();await close();
 assert.deepEqual(await p.locator('#screen').boundingBox(),withControls,'Hiding controls retains custom screen geometry');
 await p.locator('#player-menu').click();await p.locator('[data-setting=touchControls]').uncheck();await p.locator('[data-action=exit]').click();await p.locator('#player').waitFor({state:'hidden'});
 // Bad and old preferences never place controls outside the screen or distort aspect ratios.
 await p.evaluate(async()=>{const {builtinSkin,builtinLayout}=await import('./src/skins/skin-art.js');for(const system of ['gb','gba','nds','nes','snes','md'])for(const [w,h]of [[240,320],[320,568],[844,390]]){
  const rep=builtinLayout(builtinSkin(system),w,h,{screen:{scale:20,x:-4,y:8},a:{scale:8,x:4,y:-1},dpad:{scale:-5}});
  for(const item of [...rep.items,...rep.actions,...rep.screens]){const f=item.frame||item.outputFrame,b=item.baseFrame;if(f.x<0||f.y<0||f.x+f.width>w+.01||f.y+f.height>h+.01||Math.abs(f.width/f.height-b.width/b.height)>.001)throw Error('Invalid sizing');}
 }});
 // NDS keeps the stylus coordinates correct after the two-screen group is resized and moved.
 await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('manic-settings'));s.controlLayouts.nds={portrait:{screen:{scale:.7,x:.2,y:.2}}};localStorage.setItem('manic-settings',JSON.stringify(s));});await p.reload();
 await p.locator('#rom-input').setInputFiles({name:'Original touch layout.nds',mimeType:'application/octet-stream',buffer:require('./nds-cartridge.cjs')()});await p.getByRole('button',{name:'Original touch layoutの設定を開く',exact:true}).click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});
 const touch=await p.locator('.nds-bottom').boundingBox();await p.mouse.move(touch.x+touch.width/2,touch.y+touch.height/2);await p.mouse.down();
 await p.waitForFunction(()=>document.querySelector('.nds-bottom').getContext('2d').getImageData(0,0,1,1).data[1]===255);await p.mouse.up();
 assert.deepEqual(errors,[]);await ctx.close();console.log('PASS '+kind+': button/screen sizing, movement, handle, keyboard'+(kind==='chromium'?', pinch':'')+', aspect ratio, persistence, orientation reset/cancel, gameplay hit rectangles, old/malformed layout bounds and resized NDS stylus.');
}finally{await browser.close();}})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
