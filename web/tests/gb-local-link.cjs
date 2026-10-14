// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated contexts, authored ROMs and generated RAM. No user data or network.
const assert=require('node:assert/strict');
const engine=process.env.BROWSER_ENGINE||'chromium',runtime=require('./browser-runtime.cjs');
const {cartridge}=require('./gb-link-core.cjs');
(async()=>{
 const browser=await runtime[engine].launch({headless:true,...(engine==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 const base=process.env.TEST_URL||'http://127.0.0.1:4173/';
 try{for(const color of [false,true]){
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),page=await ctx.newPage(),errors=[];
  await ctx.route('**/*',route=>{assert.equal(new URL(route.request().url()).origin,new URL(base).origin,'GB communication remains on this device');return route.continue();});
  await page.addInitScript(()=>localStorage.setItem('palmo-language','ja'));
  page.on('pageerror',error=>errors.push(error.message));await page.goto(base);
  await page.evaluate(async()=>{
   const {GBLocalLink}=await import('./src/link/local-link-core.js'),start=GBLocalLink.prototype.start;
   GBLocalLink.prototype.start=async function(...args){window.gbLink=this;return start.apply(this,args);};
   const {SaveProtection}=await import('./src/storage/save-safety.js'),open=SaveProtection.prototype.open;window.gbProtections=[];
   SaveProtection.prototype.open=async function(...args){const result=await open.apply(this,args);gbProtections.push(this);return result;};
  });
  await page.evaluate(async rom=>{
   const {MGBACore}=await import('./src/core/mgba.js'),{LocalLinkCore,GBLocalLink}=await import('./src/link/local-link-core.js');
   const first=new MGBACore(document.createElement('canvas')),second=new MGBACore(document.createElement('canvas'));
   await first.load(new Uint8Array(rom));first.pause(true);await second.load(new Uint8Array(rom),{sharedCore:first});second.pause(true);
   [first,second].forEach((core,i)=>{const save=new Uint8Array(8192);save[0]=i===0?1:0;save[1]=i===0?0x31:0xa7;core.restore(save);});
   const pair=new LocalLinkCore(first,second),link=new GBLocalLink(pair,{onClosing:()=>pair.pause(true)});await link.start();
   window.gbWire={first,second,pair,link};pair.pause(false);
  },[...cartridge({color,fast:color})]);
  await page.waitForFunction(()=>gbWire.first.save()[0x40]===0x5c&&gbWire.second.save()[0x40]===0x5c);
  assert.deepEqual(await page.evaluate(()=>[gbWire.first,gbWire.second].map(core=>{const bytes=core.save();return [bytes[2],bytes[4],bytes[6]];})),[[0xa7,0xa8,0xa9],[0x31,0x32,0x33]],'Browser scheduling exchanges actual native serial bytes both ways');
  await page.evaluate(async()=>{await gbWire.link.close();gbWire.pair.dispose();gbWire.first.close();delete window.gbWire;window.gbLink=null;});
  await page.locator('#rom-input').setInputFiles({name:'Authored local cable.'+(color?'gbc':'gb'),mimeType:'application/octet-stream',buffer:Buffer.from(cartridge({color,idle:true}))});
  await page.locator('.game-launch').waitFor();
  await page.evaluate(async()=>{
   const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),game=(await db.all('library'))[0];
   window.gbGameId=game.id;
   for(const [suffix,byte]of [['',0x21],['@link-2p',0x42]]){const bytes=new Uint8Array(8192);bytes[0]=byte;await db.put('saves',game.id+suffix,{bytes,hash:await hash(bytes),at:Date.now(),coreId:'mgba-rom64-save6-v2'});}
   await db.setGamePreferences(game.id,{rtcMode:'offset',rtcOffset:3600,gameRumble:false});
  });
  await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
  await page.locator('#player-link').click();
  assert.equal(await page.locator('[data-link-mode=room]').count(),0);assert.equal(await page.locator('[data-link-mode=usb]').count(),0);
  await page.locator('#link-local-start').click();await page.waitForFunction(()=>window.gbLink?.connected);
  const info=await page.evaluate(()=>({sameModule:gbLink.paired.cores[0].nativeModule===gbLink.paired.cores[1].nativeModule,platforms:gbLink.paired.cores.map(c=>c.m._web_platform()),saves:gbLink.paired.cores.map(c=>c.save()[0]),clocks:gbLink.paired.cores.map(c=>c.m._web_rtc_offset())}));
  assert.deepEqual(info,{sameModule:true,platforms:[1,1],saves:[0x21,0x42],clocks:[3600,3600]});
  const frames=await page.evaluate(()=>gbLink.paired.cores.map(c=>c.frames));await page.waitForFunction(before=>gbLink.paired.cores.every((c,i)=>c.frames>before[i]+3),frames);
  await page.locator('[data-link-player="1"]').click();assert.equal(await page.evaluate(()=>gbLink.paired.view),1);
  await page.locator('#link-complete').click();assert.equal(await page.evaluate(()=>gbLink.paired.paused),true);
  assert.equal(await page.locator('#link-confirm-complete').count(),1,'Commit requires a second explicit confirmation');
  await page.locator('#link-cancel-complete').click();assert.equal(await page.evaluate(()=>gbLink.paired.paused),false);
  await page.locator('#link-complete').click();
  await page.evaluate(()=>gbLink.paired.cores.forEach((core,i)=>{const bytes=core.save();bytes[0]=0x81+i;core.restore(bytes);}));
  await page.locator('#link-confirm-complete').click();await page.waitForFunction(()=>document.querySelector('#player-link').dataset.state==='idle');
  const values=()=>page.evaluate(async()=>{const db=await import('./src/storage/storage.js');return Promise.all(['','@link-2p'].map(async suffix=>(await db.get('saves',gbGameId+suffix)).bytes[0]));});
  assert.deepEqual(await values(),[0x81,0x82],'Both separate save owners commit together');
  const secondBefore=await page.evaluate(async()=>{const db=await import('./src/storage/storage.js');return {save:await db.get('saves',gbGameId+'@link-2p'),recovery:await db.get('recoveries',gbGameId+'@link-2p')};});
  await page.locator('#link-2p-source').selectOption('blank');await page.locator('#link-local-start').click();await page.waitForFunction(()=>window.gbLink?.connected);
  assert.equal(await page.evaluate(()=>gbLink.paired.cores[1].save()[0]),0xff,'Blank 2P starts with erased RAM, independently of 1P and the prior 2P save');
  await page.locator('#link-stop').click();await page.waitForFunction(()=>document.querySelector('#player-link').dataset.state==='idle');
  assert.deepEqual(await values(),[0x81,0x82],'Cancellation rolls back 1P and retains the existing 2P save');
  const secondAfter=await page.evaluate(async()=>{const db=await import('./src/storage/storage.js');return {save:await db.get('saves',gbGameId+'@link-2p'),recovery:await db.get('recoveries',gbGameId+'@link-2p')};});
  assert.deepEqual(secondAfter,secondBefore);
  await page.locator('#link-2p-source').selectOption('saved');await page.locator('#link-local-start').click();await page.waitForFunction(()=>window.gbLink?.connected);
  await page.locator('#link-complete').click();
  const durable=await page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),result={};for(const store of ['saves','backups','archives','recoveries'])result[store]=await Promise.all(['','@link-2p'].map(suffix=>db.get(store,gbGameId+suffix)));return result;});
  await page.evaluate(()=>{
   gbLink.paired.cores.forEach((core,i)=>{const bytes=core.save();bytes[0]=0xe1+i;core.restore(bytes);});
   gbProtections.at(-1).id='authored-invalid-second-session';
  });
  await page.locator('#link-confirm-complete').click();await page.locator('#player').waitFor({state:'hidden'});
  const retained=await page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),result={};for(const store of ['saves','backups','archives','recoveries'])result[store]=await Promise.all(['','@link-2p'].map(suffix=>db.get(store,gbGameId+suffix)));return result;});
  assert.deepEqual(retained,durable,'Losing either save session aborts both saves and every retained generation');
  assert.deepEqual(errors,[]);await ctx.close();
 }
 console.log('PASS: GB/GBC local-only UI, shared native coordinator with independent RAM/RTC, advancing CPUs, player selection, two-step commit, atomic dual saves, cancellation retaining old 2P data, and failed-owner rollback with no network.');
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
