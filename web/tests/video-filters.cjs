// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic pixels and cartridges only; never uses the user's browser profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('./browser-runtime.cjs');
function cartridge(){
 // Enable GBA mode 3 and copy an original geometric pattern from ROM to VRAM.
 const rom=new Uint8Array(0x200+240*160*2),view=new DataView(rom.buffer);rom[0xb2]=0x96;view.setUint32(0,0xea00003e,true);
 const code=[0xe59f0028,0xe3a01003,0xe3811b01,0xe1c010b0,0xe59f001c,0xe59f101c,0xe59f201c,0xe4903004,0xe4813004,0xe2522001,0x1afffffb,0xeafffffe,0x04000000,0x08000200,0x06000000,19200];
 code.forEach((word,i)=>view.setUint32(0x100+i*4,word,true));
 for(let y=0;y<160;y++)for(let x=0;x<240;x++){
  const dx=x%80-40,dy=y-80,radius=Math.abs(dx)+Math.abs(dy),circle=dx*dx+dy*dy;
  const shape=x<80?radius<29:x<160?circle<29*29:Math.abs(dx+dy)<5&&Math.abs(dy)<29;
  view.setUint16(0x200+(y*240+x)*2,shape?0x7fff:0x2084,true);
 }
 return rom;
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');
  const result=await page.evaluate(async()=>{
   const {VideoOutput}=await import('./src/rendering/video.js'),{RetroCore}=await import('./src/core/retro.js');
   const check=(ok,message)=>{if(!ok)throw Error(message);};
   const canvas=document.createElement('canvas'),video=new VideoOutput(canvas,5,5),image=new ImageData(5,5),words=new Uint32Array(image.data.buffer);
   const black=0xff000000,white=0xffffffff;
   // A staircase should become finer than nearest-neighbour enlargement of 2x.
   for(let y=0;y<5;y++)for(let x=0;x<5;x++)words[y*5+x]=y>=x?white:black;
   video.draw(image);video.setMode('edge2x');const twice=video.ctx.getImageData(0,0,10,10).data;
   video.setMode('edge4x');check(canvas.width===20&&canvas.height===20,'Fourfold width and height');
   let output=new Uint32Array(video.ctx.getImageData(0,0,20,20).data.buffer);
   check(output.every(v=>v===black||v===white),'Original colours and opacity are preserved');
   check(output.some((v,i)=>(v&255)!==twice[(Math.floor(i/20/2)*10+Math.floor(i%20/2))*4]),'4x refines edges beyond just enlarging 2x');
   // No missing borders on constant fields; changed frame contents reuse buffers.
   const intermediate=video.intermediate,enlarged=video.enlarged;
   words.fill(0xff112233);video.draw(image);video.setMode('edge4x');
   output=new Uint32Array(video.ctx.getImageData(0,0,20,20).data.buffer);
   check(output.every(v=>v===0xff112233),'Flat fields, including all four borders, retain their colour');
   check(video.intermediate===intermediate&&video.enlarged===enlarged,'No per-frame or unchanged-mode output allocation');
   // A single pixel remains visible with rounded corners; straight strokes stay sharp.
   words.fill(black);words[12]=white;video.draw(image);
   output=new Uint32Array(video.ctx.getImageData(0,0,20,20).data.buffer);
   check(output.filter(v=>v===white).length===12&&output[9*20+9]===white,'An isolated pixel survives with four rounded corners');
   for(let i=0;i<25;i++)words[i]=i%5===2?white:black;video.draw(image);
   output=new Uint32Array(video.ctx.getImageData(0,0,20,20).data.buffer);
   check(output.every((v,i)=>v===(i%20>=8&&i%20<12?white:black)),'A one-pixel vertical stroke stays sharp');
   const next=new ImageData(5,5);new Uint32Array(next.data.buffer).fill(0xff00ff00);video.draw(next);
   check(video.ctx.getImageData(0,0,1,1).data[1]===255,'A replacement frame updates the cached source');
   const preview=document.createElement('canvas');preview.width=preview.height=2;const previewContext=preview.getContext('2d');previewContext.fillStyle='#ff00ff';previewContext.fillRect(0,0,2,2);
   video.restorePreview(preview);video.setMode('pixel');video.setMode('edge4x');
   check([...video.ctx.getImageData(0,0,1,1).data].join()=== '255,0,255,255','Paused restored screenshots survive filter changes');
   video.draw(next);check(video.preview===null&&video.ctx.getImageData(0,0,1,1).data[1]===255,'The next live frame replaces the restored preview');
   for(const mode of ['pixel','smooth','scanlines','edge2x','edge4x','pixel']){
    video.setMode(mode);check(video.ctx.getImageData(0,0,1,1).data[1]===255,'Paused filter switches redraw immediately');
   }
   check(video.intermediate===null&&video.enlarged===null,'Lighter modes release upscaling buffers');
   for(const [w,h]of [[1,1],[1,7],[7,1]]){
    const v=new VideoOutput(document.createElement('canvas'),w,h),im=new ImageData(w,h);new Uint32Array(im.data.buffer).fill(white);v.setMode('edge4x');v.draw(im);
    check([...v.ctx.getImageData(0,0,w*4,h*4).data].every(n=>n===255),'Single-row/column boundaries');
   }
   // Libretro can change the native resolution during play.
   const core=new RetroCore(document.createElement('div'));let w=4,h=3;
   core.width=w;core.height=h;core.image=new ImageData(w,h);core.video=new VideoOutput(core.canvas,w,h);core.video.setMode('edge4x');
   const bytes=new Uint8Array(8*6*4);bytes.fill(255);core.m={HEAPU8:bytes,_web_width:()=>w,_web_height:()=>h,_web_pixels:()=>0};core.draw();w=8;h=6;core.draw();
   check(core.video.mode==='edge4x'&&core.canvas.width===32&&core.canvas.height===24,'Resolution changes keep the selected filter');
   check(core.canvas.getContext('2d').getImageData(31,23,1,1).data[0]===255,'Resized frame renders through its last pixel');
   // Measure actual filtering and canvas writes after warm-up, without an FPS promise.
   const timings=[];
   for(const [w,h]of [[240,160],[256,224],[320,224],[512,448]]){
    const v=new VideoOutput(document.createElement('canvas'),w,h),im=new ImageData(w,h),px=new Uint32Array(im.data.buffer);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)px[y*w+x]=((x+y)%16<8)?white:black;
    for(const mode of ['pixel','edge2x','edge4x']){
     v.setMode(mode);for(let i=0;i<20;i++)v.draw(im);const start=performance.now();for(let i=0;i<80;i++)v.draw(im);
     timings.push({size:`${w}x${h}`,mode,msPerFrame:Number(((performance.now()-start)/80).toFixed(3))});
    }
   }
   return {timings};
  });
  console.log('PASS: 4x edge refinement, palette/stroke preservation, boundaries, cached buffers, paused previews and dynamic resolution.');
  console.table(result.timings);
  if(process.env.SCREENSHOT_DIR){
   fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});
   const comparison=await context.newPage();await comparison.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');await comparison.setViewportSize({width:960,height:380});
   await comparison.evaluate(async()=>{
    const {VideoOutput}=await import('./src/rendering/video.js');document.body.replaceChildren();document.body.style.cssText='display:flex;gap:24px;padding:24px;background:#14151b;color:white;font:16px sans-serif;';
    const image=new ImageData(32,32),words=new Uint32Array(image.data.buffer);
    for(let y=0;y<32;y++)for(let x=0;x<32;x++){const dx=x-15,dy=y-15;words[y*32+x]=dx*dx+dy*dy<150?0xffb8e6ff:0xff332820;}
    for(const [mode,title]of [['pixel','Pixel'],['edge2x','Edge 2x'],['edge4x','Edge 4x']]){
     const card=document.createElement('div'),label=document.createElement('p'),canvas=document.createElement('canvas');label.textContent=title;label.style.marginBottom='16px';canvas.style.cssText='width:288px;height:288px;image-rendering:pixelated;';
     card.append(label,canvas);document.body.append(card);const video=new VideoOutput(canvas,32,32);video.setMode(mode);video.draw(image);
    }
   });
   await comparison.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'filter-comparison.png')});await comparison.close();await page.bringToFront();
  }
  // Settings and the in-game menu share the same persisted selection.
  await page.locator('[data-tab=settings]').click();await page.locator('[data-action=video]').click();
  await page.getByRole('combobox',{name:'映像フィルター'}).selectOption('edge4x');await page.locator('#video-filter-note').waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).filter),'edge4x');
  await page.reload();
  await page.locator('#rom-input').setInputFiles({name:'Filter-test.gba',mimeType:'application/octet-stream',buffer:Buffer.from(cartridge())});
  await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#screen canvas')?.width===960);
  await page.waitForFunction(()=>{const c=document.querySelector('#screen canvas');return c.getContext('2d').getImageData(160,320,1,1).data[0]>200;});
  await page.locator('#player-menu').click();
  assert.equal(await page.locator('[data-setting=filter]').inputValue(),'edge4x');
  const canvas=page.locator('#screen canvas');
  for(const [mode,width]of [['edge2x',480],['pixel',240],['edge4x',960]]){
   await page.locator('[data-setting=filter]').selectOption(mode);
   const state=await canvas.evaluate(c=>({width:c.width,height:c.height,nonBlack:c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4!==3&&v>0)}));
   assert.deepEqual(state,{width,height:width*2/3,nonBlack:true});
  }
  for(const width of [240,390,844]){
   await page.setViewportSize({width,height:844});
   assert.equal(await page.locator('#sheet').evaluate(d=>d.scrollWidth<=d.clientWidth+1),true,'Filter menu fits narrow screens');
  }
  await page.setViewportSize({width:390,height:844});
  if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'high-quality-filter-menu.png')});}
  await page.locator('[data-action=play]').click();await page.locator('#quick-save').click();await page.locator('#confirm-state-save').click();await page.locator('#sheet').waitFor({state:'hidden'});
  await page.locator('#quick-load').click();await page.locator('#confirm-quick-load').click();await page.locator('#sheet').waitFor({state:'hidden'});
  await page.locator('#player-menu').click();assert.deepEqual(await canvas.evaluate(c=>[c.width,c.height]),[960,640]);
  assert.equal(await page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),[game]=await db.all('library'),[state]=await db.stateEntries(game.id),image=new Image();image.src=state.value.image;await image.decode();return image.width===960&&image.height===640;}),true,'Saved screenshot contains the filtered output');
  await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);console.log('PASS: persisted UI selection, live and paused switching, narrow menus, filtered screenshots and state save/load.');
  await context.close();
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
