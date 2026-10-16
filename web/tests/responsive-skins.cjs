// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const browserName=process.env.BROWSER_ENGINE||'chromium',browserType=require('./browser-runtime.cjs')[browserName];
const sizes=[[240,320],[280,240],[320,320],[400,360],[480,240],[320,568],[360,800],[390,844],[412,915],[568,320],[800,360],[844,390],[915,412],[768,1024],[820,1180],[1024,768],[1180,820],[1280,720],[1920,1080],[2560,1080],[360,600],[600,500]];
(async()=>{
 const browser=await browserType.launch({headless:true,...(browserName==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block'}),p=await context.newPage(),errors=[],uploads=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(r.method()!=='GET')uploads.push(r.url());});
  await p.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');
  await p.locator('#rom-input').setInputFiles({name:'Original-test.gba',mimeType:'application/octet-stream',buffer:Buffer.from(require('./link.cjs').cartridge(31,992))});await p.locator('.game-launch').waitFor();
  const fits=async selector=>{
   await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const issues=await p.locator(selector).evaluate(root=>{
    const bad=[];if(root.scrollWidth>root.clientWidth+1)bad.push('horizontal scroll');
    for(const e of root.querySelectorAll('button,input,select,.row>span,.game-card,.system-pill')){
     const r=e.getBoundingClientRect();if(!r.width||!r.height)continue;
     if(r.left<-.1||r.right>innerWidth+.1)bad.push(e.textContent+' outside viewport');
     if(e.matches('.row>span')&&r.width<55)bad.push(e.textContent+' label squeezed');
    }return bad;
   });assert.deepEqual(issues,[],`${selector} at ${JSON.stringify(p.viewportSize())}`);
  };
  for(const [width,height] of [[240,320],[320,568],[390,844],[844,390],[768,1024],[1280,720]]){
   await p.setViewportSize({width,height});
   for(const tab of ['games','imports','settings']){await p.locator(`[data-tab=${tab}]`).click();await fits('#app');}
   await p.locator('[data-action=video]').click();await fits('#sheet');await p.locator('#close-sheet').click();
  }
  await p.setViewportSize({width:390,height:844});
  await p.locator('[data-tab=settings]').click();await p.locator('[data-action=skins]').click();await p.locator('#skin-preview .skin-mini').waitFor();
  for(const color of ['mint','sunset','graphite','purple']){
   await p.locator(`[data-skin-color=${color}]`).click();await p.waitForFunction(c=>document.querySelector('#skin-preview')?.getAttribute('aria-label')?.includes(c),{mint:'ミント',sunset:'サンセット',graphite:'グラファイト',purple:'パープル'}[color]);
   assert.equal(await p.locator(`[data-skin-color=${color}]`).getAttribute('aria-pressed'),'true');
  }
  await p.locator('[data-skin-orientation=landscape]').click();assert.match(await p.locator('#skin-preview').getAttribute('aria-label'),/横/);
  await p.locator('#skin-system').selectOption('md');await p.waitForFunction(()=>document.querySelectorAll('#skin-preview .skin-mini-button').length===9);
  await p.locator('#skin-system').selectOption('gba');await p.locator('[data-skin-orientation=portrait]').click();
  const out=process.env.SCREENSHOT_DIR;if(out){fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,'skin-picker.png')});}
  // Inspect all systems and widths, including split view. Screen/control rectangles may touch, never overlap.
  const checked=await p.evaluate(async sizes=>{
   const {builtinSkin,builtinLayout}=await import('./src/skins/skin-art.js');let n=0;
   for(let w=240;w<=1600;w+=73)for(let h=200;h<=1200;h+=97)sizes.push([w,h]);
   for(const system of ['gba','gb','gbc','nes','snes','md'])for(const [w,h] of sizes){
    const skin=builtinSkin(system),rep=builtinLayout(skin,w,h),frames=[rep.screens[0].outputFrame,...rep.items.map(i=>i.frame),...rep.actions.map(i=>i.frame)];
    for(const f of frames)if(Object.values(f).some(v=>!Number.isFinite(v))||f.width<=0||f.height<=0||f.x<0||f.y<0||f.x+f.width>w+.01||f.y+f.height>h+.01)throw Error(`Out of bounds: ${system} ${w}x${h}`);
    for(let i=0;i<frames.length;i++)for(let j=i+1;j<frames.length;j++){const a=frames[i],b=frames[j];if(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>.01&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>.01)throw Error(`Overlap: ${system} ${w}x${h} ${i}/${j}`);}
    const pad=rep.items[0].frame;if(Math.abs(pad.width-pad.height)>.001)throw Error('Squashed dpad');n++;
    if(rep.wide){const controls=frames.slice(1);if(Math.max(...controls.map(f=>f.y+f.height))-Math.min(...controls.map(f=>f.y))>360.01)throw Error('Controls spread too far vertically');}
   }return n;
  },sizes);assert.ok(checked>1300);
  // Gallery artwork is virtualized and rebuilt on resize; inspect the current
  // visible preview atomically instead of retaining a replaced child handle.
  await p.locator('#skin-preview').scrollIntoViewIfNeeded();
  await p.waitForFunction(()=>{const r=document.querySelector('#skin-preview .skin-mini')?.getBoundingClientRect();return r?.height>0&&Math.abs(r.width/r.height-390/844)<.01;});
  await p.setViewportSize({width:390,height:650});await p.waitForFunction(()=>{const r=document.querySelector('#skin-preview .skin-mini')?.getBoundingClientRect();return r?.height>0&&Math.abs(r.width/r.height-390/650)<.01;});
  await p.locator('#close-sheet').click();
  await p.locator('[data-tab=games]').click();await p.locator('.game-launch').click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});
  await p.locator('#player-menu').click();await p.locator('[data-setting=showFps]').check();await p.locator('#close-sheet').click();
  for(const [width,height] of sizes){
   await p.setViewportSize({width,height});await p.waitForFunction(w=>Math.abs(document.querySelector('#skin').getBoundingClientRect().width-w)<1,width);
   const rects=await p.evaluate(()=>{const get=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};};return{screen:get('#screen'),pad:get('[aria-label="十字キー"]'),buttons:[...document.querySelectorAll('#quick-actions button,#player-menu,#boost,.skin-button,#fps-meter,#save-status')].map(b=>{const r=b.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};})};});
   assert.ok(Math.abs(rects.pad.w-rects.pad.h)<.1,'Rendered dpad stays square');assert.ok(Math.abs(rects.screen.w/rects.screen.h-1.5)<.01,'Game aspect ratio');
   for(const a of rects.buttons){assert.ok(a.x>=0&&a.y>=0&&a.x+a.w<=width+.1&&a.y+a.h<=height+.1,'Controls in viewport');const b=rects.screen;assert.ok(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)<.1||Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)<.1,'No control covers game');}
   if(width===390&&height===844){assert.ok(rects.screen.w>=378-.1,'Full width screen');assert.ok(rects.pad.w>=170,'Larger dpad');}
   if(out&&[[320,320],[400,360],[390,844],[844,390],[1024,768],[1280,720]].some(([w,h])=>w===width&&h===height)){await p.locator('#toast.show').waitFor({state:'hidden'});await p.screenshot({path:path.join(out,`player-${width}x${height}.png`)});}
  }
  // Duplicate resize notifications must not replace a held input's DOM node.
  assert.equal(await p.evaluate(async()=>{const pad=document.querySelector('.dpad');for(let i=0;i<20;i++)window.dispatchEvent(new Event('resize'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return pad===document.querySelector('.dpad');}),true);
  // Safe-area padding is subtracted before arranging controls; rotation reflows the same game.
  await p.setViewportSize({width:844,height:390});await p.addStyleTag({content:'#player{padding:12px 40px 20px 44px}'});
  await p.waitForFunction(()=>Math.abs(document.querySelector('#skin').getBoundingClientRect().width-760)<1);
  const safe=await p.locator('#skin').boundingBox();assert.equal(safe.x,44);assert.equal(safe.y,12);assert.equal(safe.height,358);
  await p.locator('#resume-game').evaluate(e=>{if(!e.hidden)e.click();});
  const count=()=>p.evaluate(async()=>{const db=await import('./src/storage/storage.js');return(await db.all('states')).length;});
  await p.locator('#quick-save').click();await p.locator('#cancel-state-save').click();assert.equal(await count(),0);
  for(let i=0;i<2;i++){await p.locator('#quick-save').click();await p.locator('#confirm-state-save').click();await p.locator('#sheet').waitFor({state:'hidden'});}assert.equal(await count(),2);
  await p.locator('#quick-load').click();await p.locator('#cancel-quick-load').click();assert.equal(await count(),2);
  await p.locator('#quick-load').click();await p.locator('#confirm-quick-load').click();await p.locator('#sheet').waitFor({state:'hidden'});assert.equal(await count(),2);
  assert.ok(await p.evaluate(async()=>{const db=await import('./src/storage/storage.js');return(await db.all('recoveries')).flat().some(r=>r.bytes?.length&&r.hash&&Date.now()-r.at<5000);}),'Checkpoint before quick load');
  await p.locator('#player-menu').click();await p.locator('[data-setting=touchControls]').uncheck();await p.locator('#close-sheet').click();
  assert.equal(await p.locator('.skin-button').count(),0);assert.equal(await p.locator('#quick-actions').isVisible(),false);
  const full=await p.locator('#screen').boundingBox();assert.ok(full.height>=358-.1,'Display-only uses all available height');
  await p.locator('#player-menu').click();await p.locator('[data-setting=touchControls]').check();await p.locator('#close-sheet').click();assert.ok(await p.locator('.skin-button').count()>0);
  assert.deepEqual(errors,[]);assert.deepEqual(uploads,[]);
  console.log(`PASS: ${checked} responsive layouts, ${sizes.length} actual viewports, square dpad, aspect ratio, safe area, badges, unchanged-resize input stability, previews, confirmed save/load, pre-load recovery, no uploads.`);
  await context.close();
 }finally{await Promise.race([browser.close(),new Promise(r=>setTimeout(r,2500))]);}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
