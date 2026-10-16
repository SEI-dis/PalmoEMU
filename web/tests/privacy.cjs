// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated browser and loopback server; only synthetic cartridges/save data.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {createStaticServer}=require('../scripts/serve.cjs');
const browserName=process.env.BROWSER_ENGINE||'chromium',browserType=require('./browser-runtime.cjs')[browserName];
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=createStaticServer(),hits=[];server.prependListener('request',(req)=>hits.push({method:req.method,url:req.url}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port+'/';
 const browser=await browserType.launch({headless:true,...(browserName==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),requests=[],errors=[];
  context.on('request',r=>requests.push({url:r.url(),method:r.method(),body:r.postDataBuffer()?.length||0}));
  await context.addInitScript(()=>{window.showSaveFilePicker=undefined;window.wsStarts=0;const WS=window.WebSocket;window.WebSocket=new Proxy(WS,{construct(target,args){window.wsStarts++;return Reflect.construct(target,args);}});window.rtcStarts=0;const Original=window.RTCPeerConnection;if(Original)window.RTCPeerConnection=new Proxy(Original,{construct(target,args){window.rtcStarts++;return Reflect.construct(target,args);}});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
  await page.goto(base);await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));});
  const marker='LOCAL_ONLY_PRIVATE_79db2',rom=Buffer.from(require('./cartridges.cjs').gb());
  await page.locator('#rom-input').setInputFiles({name:marker+'.gb',mimeType:'application/octet-stream',buffer:rom});await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
  await page.locator('#player-menu').click();await page.locator('[data-action=newState]').click();await page.locator('[data-slot-load]').first().waitFor();
  await page.locator('[data-slot-load]').first().click();await page.locator('#sheet').waitFor({state:'hidden'});await page.locator('#player-menu').click();await page.locator('[data-action=saveData]').click();
  const downloadWait=page.waitForEvent('download');await page.locator('[data-action=export]').click();await page.locator('[data-export-save]').click();const download=await downloadWait;const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);const save=Buffer.concat(chunks);assert.ok(save.length>0);await page.locator('[data-export-close]').click();
  await page.locator('#save-input').setInputFiles({name:marker+'.sav',mimeType:'application/octet-stream',buffer:save});await page.locator('#sheet').waitFor({state:'hidden'});
  await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  const storage=await page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),[game]=await db.all('library');const keys=[];for(const key of await caches.keys())for(const request of await (await caches.open(key)).keys())keys.push(request.url);return {rom:[...await db.get('roms',game.id)],save:[...(await db.get('saves',game.id)).bytes],states:(await db.stateEntries(game.id)).length,auto:(await db.get('recoveries',game.id)).length,localKeys:Object.keys(localStorage),sessionKeys:Object.keys(sessionStorage),cacheKeys:keys};});
  assert.deepEqual(Buffer.from(storage.rom),rom);assert.deepEqual(Buffer.from(storage.save),save);assert.equal(storage.states,1);assert.ok(storage.auto>0);
  const metadata=await page.evaluate(async()=>{const rows=[];for(const key of await caches.keys())for(const request of await(await caches.open(key)).keys())if(/\.offline-(release|failure)\.json$/.test(request.url))rows.push({path:new URL(request.url).pathname,data:await(await(await caches.open(key)).match(request)).json()});return rows;});
  for(const {path:metaPath,data}of metadata){assert.ok(!JSON.stringify(data).includes(marker),'Metadata never stores game names');if(metaPath.endsWith('release.json')){assert.deepEqual(Object.keys(data).sort(),['active','files','format','full','integrity','predecessors','version'].sort());for(const file of data.files)assert.ok(fs.existsSync(path.join(root,file)));}else assert.ok(Object.keys(data).every(key=>['version','reason','at','retryAfter','usage','quota'].includes(key)));}
  const releaseKey='palmo-release-seen:'+new URL('.',base).pathname;
  assert.deepEqual(storage.localKeys.sort(),['manic-settings',releaseKey].sort());assert.deepEqual(storage.sessionKeys,[releaseKey]);
  assert.deepEqual(await page.evaluate(key=>[localStorage.getItem(key),sessionStorage.getItem(key)],releaseKey),[require('../package.json').version,require('../package.json').version],'Release notice storage contains only the acknowledged version');
  for(const url of storage.cacheKeys){assert.ok(!url.includes(marker));const name=new URL(url).pathname;assert.ok(fs.existsSync(path.join(root,name))||['/.offline-release.json','/.offline-failure.json'].includes(name),'Cache contains only shipped app files and app-update metadata');}
  await page.locator('#rom-input').setInputFiles({name:marker+'-gba.gba',mimeType:'application/octet-stream',buffer:Buffer.from(require('./link.cjs').cartridge(31,992))});
  await page.getByRole('button',{name:marker+'-gbaの設定を開く',exact:true}).click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
  await page.locator('#player-menu').click();await page.locator('[data-action=link]').click();assert.equal(await page.evaluate(()=>wsStarts),0,'Opening link setup must not start networking');
  await page.locator('#link-input').fill('1234');assert.equal(await page.evaluate(()=>wsStarts),0,'Entering a room number must not start networking');
  await page.locator('#link-panel-close').click();await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>rtcStarts+wsStarts),0,'Ordinary play must never construct a socket or peer connection');
  for(const req of requests.filter(r=>/^https?:/.test(r.url))){const url=new URL(req.url);assert.equal(url.origin,new URL(base).origin,'Unexpected host');assert.equal(url.search,'','Unexpected query');assert.equal(req.body,0);assert.ok(['GET','HEAD'].includes(req.method));assert.ok(!req.url.includes(marker));}
  assert.ok(hits.every(r=>['GET','HEAD'].includes(r.method)&&!r.url.includes(marker)));
  console.log('PASS: import/play/manual state/restore/save export+import/exit use IndexedDB and local downloads; HTTP is same-site static GET/HEAD with no request body, names or query; no automatic WebSocket/WebRTC; caches contain only app files.');
  // Dedicated harmless probes: not ROM/save data. SW must stop accidental writes
  // before the loopback HTTP server even observes them. CSP is not a WebRTC guard.
  const before=hits.length;
  const blocked=await page.evaluate(async()=>{
   const statuses=[];for(const method of ['POST','PUT','PATCH','DELETE'])statuses.push((await fetch('index.html',{method,body:'privacy-probe'})).status);
   const queryBlocked=(await fetch('index.html?privacy-probe')).status===403;return {statuses,queryBlocked};
  });assert.deepEqual(blocked,{statuses:[405,405,405,405],queryBlocked:true});assert.equal(hits.length,before,'Blocked requests reached server');
  assert.deepEqual(errors,[]);
  // The static development server independently has no writable/upload endpoint.
  for(const method of ['POST','PUT','PATCH','DELETE']){const response=await fetch(base+'index.html',{method,body:'privacy-probe'});assert.equal(response.status,405);assert.equal(response.headers.get('allow'),'GET, HEAD');assert.equal(await response.text(),'');}
  const head=await fetch(base+'index.html',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  console.log('PASS: active service worker blocks write/query probes without HTTP; preview server independently refuses write methods and supports body-free HEAD.');
  await page.goto('about:blank');await context.close();
 }finally{await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,2500))]);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
