// SPDX-License-Identifier: AGPL-3.0-or-later
// Requires Playwright. Tests only synthetic cartridges generated in memory.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const browserName=process.env.BROWSER_ENGINE||'chromium',browserType=require('./browser-runtime.cjs')[browserName];
const cartridges=require('./cartridges.cjs');
(async()=>{
 const browser=await browserType.launch({headless:true,...(browserName==='chromium'?{...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{}),args:['--autoplay-policy=no-user-gesture-required']}:{})});
 try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const p=await ctx.newPage(),requests=[],errors=[];
 p.on('request',r=>requests.push({url:r.url(),method:r.method(),body:r.postDataBuffer()?.length||0}));p.on('pageerror',e=>errors.push(e.message));
 const base=process.env.TEST_URL||'http://127.0.0.1:4173/';await p.goto(base);
 // Unknown extension filters can gray out files in iOS's native document picker.
 // Desktop setInputFiles bypasses that picker, so keep this policy explicit.
 for(const id of ['rom-input','skin-input','save-input'])assert.equal(await p.locator('#'+id).getAttribute('accept'),null,'Custom formats must remain selectable on iOS: '+id);
 await p.locator('[data-tab=imports]').click();
 const chooser=p.waitForEvent('filechooser');await p.locator('#choose-rom').click();
 await (await chooser).setFiles({name:'unsupported.txt',mimeType:'text/plain',buffer:Buffer.from('original fixture')});
 await p.getByRole('status').filter({hasText:'未対応の形式です。'}).waitFor();
 assert.equal(await p.locator('.game-launch').count(),0,'Picker accepts files; app rejects unsupported formats locally');
 for(const [system,generate] of Object.entries(cartridges)){
  const file=path.join(os.tmpdir(),'manic-web-test-'+process.pid+'-'+system+'.'+(system==='snes'?'sfc':system));fs.writeFileSync(file,generate());
  try{await p.locator('#rom-input').setInputFiles(file);await p.getByRole('button',{name:'manic-web-test-'+process.pid+'-'+system+'の設定を開く',exact:true}).waitFor();}finally{fs.unlinkSync(file);}
  await p.getByRole('button',{name:'manic-web-test-'+process.pid+'-'+system+'の設定を開く',exact:true}).click();await p.locator('.game-info-play').click();
  await p.locator('#loading').waitFor({state:'hidden',timeout:90000});await p.waitForTimeout(1200);
  assert.equal(await p.locator('#player').isVisible(),true,system+' failed to start');
  if(system==='gba'){const rgba=await p.locator('#screen canvas').evaluate(c=>[...c.getContext('2d').getImageData(0,0,1,1).data]);assert.ok(rgba[1]>200&&rgba[0]<10&&rgba[2]<10,rgba.toString());}
  if(['nes','snes','md'].includes(system)){
   await p.evaluate(async()=>{const {RetroCore}=await import('./src/core/retro.js');const old=RetroCore.prototype.setKeys;window.inputLog=[];RetroCore.prototype.setKeys=function(mask){old.call(this,mask);inputLog.push(this.keys);};});
   const a=p.locator('.skin-button[aria-label=A]');const pos=await a.boundingBox();await p.mouse.move(pos.x+pos.width/2,pos.y+pos.height/2);await p.mouse.down();await p.waitForTimeout(100);await p.mouse.up();
   const input=await p.evaluate(()=>inputLog);assert.ok(input.includes(1<<(system==='md'?1:8)),system+' A mapping');assert.ok(input.includes(0),system+' A release');
  }
  await p.locator('#player-menu').click();await p.locator('[data-action=newState]').click();await p.locator('#confirm-state-save').click();await p.locator('[data-slot-load="0"]:enabled').waitFor();await p.locator('[data-slot-load="0"]').click();await p.locator('#sheet').waitFor({state:'hidden'});
  await p.setViewportSize({width:844,height:390});await p.waitForTimeout(200);assert.ok(await p.locator('.skin-button[aria-label=A]').isVisible());
  await p.locator('#player-menu').click();await p.locator('[data-action=exit]').click();await p.locator('#player').waitFor({state:'hidden'});await p.setViewportSize({width:390,height:844});
  console.log('PASS:',system,'launch / input / state / rotation / exit');
 }
 await p.reload();await p.locator('.game-launch').nth(5).waitFor();assert.equal(await p.locator('.game-launch').count(),6);
 const network=requests.filter(r=>/^https?:/.test(r.url));assert.equal(network.filter(r=>new URL(r.url).origin!==new URL(base).origin).length,0,'Third-party requests');assert.equal(network.filter(r=>!['GET','HEAD'].includes(r.method)||r.body).length,0,'Uploads');
 assert.ok(network.every(r=>!r.url.includes('test-')&&!r.url.includes('?')),'Cartridge metadata in requests');assert.deepEqual(errors,[]);console.log('PASS: persistence, zero uploads, zero third-party requests, zero runtime errors.');
 await p.goto('about:blank');await ctx.close();
 }finally{await Promise.race([browser.close(),new Promise(r=>setTimeout(r,2500))]);}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
