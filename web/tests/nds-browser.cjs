// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const playwright=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await playwright[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r));page.setDefaultTimeout(15000);
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';await page.goto(base);
  await page.locator('#rom-input').setInputFiles({name:'Original dual screen.nds',mimeType:'application/octet-stream',buffer:require('./nds-cartridge.cjs')()});
  await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
  const color=async(selector,r,g,b)=>page.waitForFunction(({selector,r,g,b})=>{const c=document.querySelector(selector);if(!c)return false;const p=c.getContext('2d').getImageData(0,0,1,1).data;return p[0]===r&&p[1]===g&&p[2]===b;},{selector,r,g,b});
  await color('.nds-top',255,0,0);await color('.nds-bottom',0,0,255);
  const a=await page.locator('.skin-button[aria-label=A]').boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await color('.nds-top',0,255,0);await page.mouse.up();await color('.nds-top',255,0,0);
  async function stylus(){const r=await page.locator('.nds-bottom').boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await color('.nds-bottom',0,255,0);await page.mouse.up();await color('.nds-bottom',0,0,255);}
  await stylus();
  for(const [width,height] of [[320,568],[390,844],[844,390],[1024,768]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const rects=await page.locator('.nds-display canvas').evaluateAll(cs=>cs.map(c=>{const r=c.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
   for(const r of rects){assert.ok(r.w>70&&r.h>50);assert.ok(Math.abs(r.w/r.h-4/3)<.02);assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=width+1&&r.y+r.h<=height+1);}
   await stylus();
   if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`nds-${width}x${height}.png`)});}
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#player-menu').click();await page.locator('[data-setting=ndsSwapScreens]').check();await page.locator('[data-setting=ndsPowerSave]').uncheck();await page.locator('[data-setting=filter]').selectOption('edge2x');await page.locator('#close-sheet').click();
  assert.equal(await page.locator('.nds-top').getAttribute('width'),'512');const top=await page.locator('.nds-top').boundingBox(),bottom=await page.locator('.nds-bottom').boundingBox();assert.ok(bottom.y<top.y);await stylus();
  await page.locator('#player-menu').click();await page.locator('[data-action=newState]').click();await page.locator('#confirm-state-save').click();await page.locator('[data-slot-load]').click();await page.locator('#sheet').waitFor({state:'hidden'});await color('.nds-top',255,0,0);
  await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  const dsv=Buffer.alloc(8192+122);dsv.fill(0x36,0,8192);dsv.write('|<--Snip above here to create a raw sav by excluding this DeSmuME savedata footer:',8192);dsv.write('|-DESMUME SAVE-|',dsv.length-16);dsv.writeUInt32LE(8192,dsv.length-40);dsv.writeUInt32LE(8192,dsv.length-36);
  const chooser=page.waitForEvent('filechooser');await page.locator('[data-details]').click();await page.locator('[data-action=importSave]').click();await (await chooser).setFiles({name:'original.dsv',mimeType:'application/octet-stream',buffer:dsv});await page.getByText('セーブデータをインポートしました。',{exact:true}).waitFor();
  await page.locator('[data-action=play]').click();await page.locator('#loading').waitFor({state:'hidden'});await color('.nds-top',255,0,0);
  await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  const saved=await page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),[g]=await db.all('library');return [...(await db.get('saves',g.id)).bytes];});assert.deepEqual(saved,Array(8192).fill(0x36));
  const preview=await page.evaluate(async()=>{
   const {NDSCore}=await import('./src/core/nds.js'),core=new NDSCore(document.createElement('div')),image=document.createElement('canvas');image.width=256;image.height=384;
   const ctx=image.getContext('2d');ctx.fillStyle='#f00';ctx.fillRect(0,0,256,192);ctx.fillStyle='#00f';ctx.fillRect(0,192,256,192);
   await core.restorePreview(image.toDataURL());core.setFilter('edge4x');core.setFilter('pixel');const colors=core.screens.map(c=>[...c.getContext('2d').getImageData(0,0,1,1).data]);core.close();return colors;
  });assert.deepEqual(preview,[[255,0,0,255],[0,0,255,255]],'Paused filter changes preserve separate screen snapshots');
  assert.deepEqual(errors,[]);
  // WebKit may expose local Blob/File reads as requests; they never leave the
  // browser. Keep origin, method and body restrictions for both URL types.
  assert.ok(requests.every(r=>{const url=new URL(r.url());return url.origin===new URL(base).origin&&['http:','https:','blob:'].includes(url.protocol)&&['GET','HEAD'].includes(r.method())&&!r.postData();}));
  console.log('PASS: NDS library/launch, actual dual-screen input, 320px/portrait/landscape layouts, swapped stylus, power/filter settings, state restore and persistent battery. '+kind);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
