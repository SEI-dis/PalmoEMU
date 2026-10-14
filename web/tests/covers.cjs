// SPDX-License-Identifier: AGPL-3.0-or-later
// Local artwork and synthetic cartridges only. External networking is forbidden.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const kind=process.env.BROWSER_ENGINE||'chromium',pw=require('./browser-runtime.cjs');
(async()=>{
 const browser=await pw[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 let context;
 try{
  context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage(),requests=[],errors=[];
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';
  context.on('request',r=>{if(/^https?:/.test(r.url()))requests.push({url:r.url(),method:r.method(),body:r.postData()});});
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  // This legacy cover preference belongs to the current-release fixture.
  await context.addInitScript(({version,scope})=>{if(!localStorage.getItem('manic-settings'))localStorage.setItem('manic-settings',JSON.stringify({autoCovers:true}));localStorage.setItem('palmo-release-seen:'+scope,version);},{version:require('../package.json').version,scope:new URL('.',base).pathname});
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);await page.goto(base);
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.locator('#content .empty-library').waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).autoCovers),undefined,'Legacy opt-in is removed');
  await page.locator('[data-tab=settings]').click();assert.equal(await page.locator('[data-setting=autoCovers]').count(),0);
  const rom=Buffer.from(require('./cartridges.cjs').gb());
  await page.locator('#rom-input').setInputFiles({name:'Local Test.gb',mimeType:'application/octet-stream',buffer:rom});
  await page.locator('.game-launch').click();await page.locator('[data-action=cover]').click();
  assert.equal(await page.locator('[data-action=cover-search]').count(),0);
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=100;const x=c.getContext('2d');x.fillStyle='#167b81';x.fillRect(0,0,80,100);x.fillStyle='#ffc040';x.fillRect(12,12,56,56);return c.toDataURL('image/png').split(',')[1];}),'base64');
  const chooser=page.waitForEvent('filechooser');await page.locator('[data-action=cover-local]').click();
  await (await chooser).setFiles({name:'Original Artwork.png',mimeType:'image/png',buffer:png});await page.locator('.game-info-play').waitFor();
  const saved=await page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),[g]=await db.all('library');return {g,rom:[...await db.get('roms',g.id)]};});
  assert.equal(saved.g.coverSource,'custom');assert.match(saved.g.cover,/^data:image\/(webp|png);base64,/);assert.ok(!saved.g.coverUrl);assert.deepEqual(Buffer.from(saved.rom),rom);
  await page.reload();assert.equal(await page.locator('.game-launch img').getAttribute('src'),saved.g.cover,'Local cover survives reload');
  // Old downloaded covers stay local and are never fetched again by their old URL.
  await page.evaluate(async id=>{const db=await import('./src/storage/storage.js'),g=await db.get('library',id);await db.put('library',id,{...g,coverSource:'libretro',coverUrl:'https://example.invalid/old-cover.png'});},saved.g.id);
  await page.reload();assert.equal(await page.locator('.game-launch img').getAttribute('src'),saved.g.cover);
  await page.locator('.game-launch').click();await page.locator('[data-action=cover]').click();
  const bad=page.waitForEvent('filechooser');await page.locator('[data-action=cover-local]').click();
  await (await bad).setFiles({name:'not-an-image.png',mimeType:'image/png',buffer:Buffer.from('invalid')});
  await page.waitForFunction(()=>document.querySelector('#cover-input').value==='');
  assert.equal(await page.evaluate(async id=>(await (await import('./src/storage/storage.js')).get('library',id)).cover,saved.g.id),saved.g.cover,'Invalid input never replaces a saved cover');
  for(const r of requests){assert.equal(new URL(r.url).origin,new URL(base).origin);assert.ok(['GET','HEAD'].includes(r.method));assert.equal(r.body,null);}
  assert.deepEqual(errors,[]);console.log('PASS: legacy online preference is inert; local cover import, reload, migration and invalid-image preservation send no external requests or user content.');
 }finally{
  // WebKit on Windows can finish every assertion but stall while closing a
  // context with a service worker. Always reach our owned browser's cleanup.
  let timer;
  try{if(context)await Promise.race([context.close(),new Promise(resolve=>{timer=setTimeout(resolve,5000);})]);}
  finally{clearTimeout(timer);await browser.close();}
 }
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
