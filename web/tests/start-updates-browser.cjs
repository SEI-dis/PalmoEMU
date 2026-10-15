// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated synthetic library and mocked public metadata. Never patch a ROM.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
const endpoint='https://api.github.com/repos/pm-start/PokemonStart/git/trees/main',key='palmo-start-updates-v1';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage(),errors=[],requests=[];let count=0,version='0.47.1',status=200;
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r));page.setDefaultTimeout(30000);
  await context.route(endpoint,route=>{count++;return route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({sha:'a'.repeat(40),truncated:false,tree:[{path:`PokemonStart_v${version}.pks`,sha:'b'.repeat(40),mode:'100644',type:'blob',size:21701997}]})});});
  await page.goto(base);await page.locator('[data-tab=imports]').waitFor();assert.equal(count,0,'No PokemonStart means no external request');
  const rom=Buffer.from(require('./link.cjs').cartridge(31,992));
  await page.locator('#rom-input').setInputFiles({name:'PokemonStart_v0.46.0.gba',mimeType:'application/octet-stream',buffer:rom});
  await page.locator('#start-update-notice').waitFor();assert.equal(count,1);assert.match(await page.locator('#start-update-notice').textContent(),/0\.47\.1/);
  const id=await page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),[game]=await db.all('library'),bytes=new Uint8Array([1,2,3]);await db.put('saves',game.id,{bytes,hash:await hash(bytes),at:100});await db.put('states',game.id+':manual',{bytes:new Uint8Array([4,5]),at:99});return game.id;});
  const snapshot=()=>page.evaluate(async()=>{const db=await import('./src/storage/storage.js');return JSON.stringify(await Promise.all(['library','roms','saves','states','recoveries','coverCatalogs'].map(store=>db.all(store))));});
  const before=await snapshot();
  for(const width of [320,390,844]){await page.setViewportSize({width,height:844});const box=await page.locator('#start-update-notice').boundingBox();assert(box.x>=0&&box.x+box.width<=width);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.setViewportSize({width:390,height:844});
  if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`start-notice-${kind}.png`)});}
  await page.locator('[data-start-open]').click();await page.locator('#start-update-dialog').waitFor();
  const links=await page.locator('.start-update-links a').evaluateAll(nodes=>nodes.map(a=>({href:a.href,rel:a.rel,target:a.target})));
  assert.deepEqual(links.map(a=>a.href),['https://github.com/pm-start/PokemonStart','https://github.com/pm-start/PokemonStart/blob/main/CHANGELOG.md']);assert(links.every(a=>a.rel==='noopener noreferrer'&&a.target==='_blank'));
  await page.locator('[data-start-check]').click();assert.equal(count,1,'Repeated clicks do not poll GitHub');
  assert.match(await page.locator('[data-start-summary]').textContent(),/新しいバージョンがあります/);
  assert.match(await page.locator('[data-start-summary] p').textContent(),/v0\.46\.0 → v0\.47\.1/);
  assert.equal(await page.locator('[data-start-version]').isVisible(),false,'No duplicated version-only notice');
  if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`start-update-${kind}.png`)});
  await page.locator('#start-update-rom').click();await page.locator('#rom-update-file').waitFor({state:'attached'});assert.equal(await page.locator('#rom-update-file').getAttribute('accept'),null);
  await page.locator('#rom-update-news').click();await page.locator('#start-update-dialog').waitFor();await page.locator('#start-update-back').click();await page.locator('#rom-update-file').waitFor({state:'attached'});
  await page.locator('#rom-update-back').click();await page.locator('#start-update-dialog').waitFor();await page.locator('#start-update-back').click();
  await page.locator('[data-tab=imports]').click();await page.locator('#start-update-notice').waitFor();await page.locator('#import-update-rom').click();await page.locator(`[data-update-rom="${id}"]`).click();await page.locator('#rom-update-news').click();
  await page.locator('[data-start-auto]').uncheck();await page.locator('#close-sheet').click();assert.equal(await page.locator('#start-update-notice').count(),0);
  await page.reload();await page.locator('#import-update-rom').waitFor();assert.equal(count,1);assert.equal(await page.locator('#start-update-notice').count(),0);
  await page.locator('#import-update-rom').click();await page.locator(`[data-update-rom="${id}"]`).click();await page.locator('#rom-update-news').click();await page.locator('[data-start-auto]').check();await page.locator('#close-sheet').click();
  await page.locator('.start-update-dismiss').click();await page.reload();await page.locator('#import-update-rom').waitFor();assert.equal(await page.locator('#start-update-notice').count(),0,'Dismissal persists for this distribution');
  const expire=()=>page.evaluate(key=>{const state=JSON.parse(localStorage.getItem(key));state.checkedAt=Date.now()-3600001;state.retryAt=0;localStorage.setItem(key,JSON.stringify(state));},key);
  version='0.48.0';await expire();await page.reload();await page.locator('#start-update-notice').waitFor();assert.equal(count,2);assert.match(await page.locator('#start-update-notice').textContent(),/0\.48\.0/);
  status=503;await expire();await page.reload();await page.locator('#import-update-rom').waitFor();await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).failed,key);
  assert.equal(await page.locator('[data-start-summary]:visible').count(),0,'Failed checks never claim a current update result');
  assert.equal(await page.locator('#start-update-notice').count(),0);await page.locator('#import-update-rom').click();await page.locator(`[data-update-rom="${id}"]`).click();await page.locator('#rom-update-news').click();assert.match(await page.locator('[data-start-status]').textContent(),/確認できません/);assert.match(await page.locator('[data-start-version]').textContent(),/前回確認/);assert.equal(await snapshot(),before,'Checking/notifying/navigating never changes ROMs, saves, states or library records');
  await context.setOffline(true);await page.locator('#close-sheet').click();await page.locator('#import-update-rom').click();await page.locator(`[data-update-rom="${id}"]`).click();await page.locator('#rom-update-news').click();assert.match(await page.locator('[data-start-status]').textContent(),/オフライン/);assert.equal(await page.locator('[data-start-check]').isDisabled(),true);
  await context.setOffline(false);await page.locator('#close-sheet').click();
  // Test the gameplay gate with a fresh view and empty metadata cache. This
  // does not launch the synthetic cart or alter any game save.
  const beforeGate=count;
  await page.evaluate(async()=>{const {createStartUpdatesView}=await import('./src/views/start-updates.js');localStorage.removeItem('palmo-start-updates-v1');const view=createStartUpdatesView({games:()=>[{system:'gba',filename:'PokemonStart_v0.46.0.gba'}],active:()=>false});view.refresh();});assert.equal(count,beforeGate);
  for(const request of requests.filter(req=>new URL(req.url()).origin!==new URL(base).origin)){assert.equal(request.url(),endpoint);assert.equal(request.method(),'GET');assert.equal(request.postData(),null);assert.equal(request.headers().authorization,undefined);assert.equal(request.headers().referer,undefined);}
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS '+kind+': library/import notice, existing update handoff and return, responsive layout, opt-out/cache/dismissal/new release/error/offline states, metadata-only traffic and unchanged stored games/saves.');
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
