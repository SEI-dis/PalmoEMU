// SPDX-License-Identifier: AGPL-3.0-or-later
// Actual workers/Cache Storage, isolated origin, synthetic assets and save bytes.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const engine=process.env.BROWSER_ENGINE||'chromium',runtime=require('./browser-runtime.cjs'),root=path.resolve(__dirname,'..');
const sources=new Map(['sw.js','src/updates/auto-update-worker.js','src/updates/update.js','src/updates/download-progress.js','src/updates/controller-activation.js'].map(file=>[file,fs.readFileSync(path.join(root,file),'utf8')]));
let revision=1,offline=false,fail=false,hold=false,quota=false,metadataQuota=false,installQuota=false,finish;
const requests=[],files=['index.html','app.js','cores/used.bin','cores/late.bin','cores/cold.bin','cores/changed.bin','update.html','src/i18n/page.js','src/i18n/index.js',...[...sources.keys()].filter(file=>file!=='sw.js')];
const shell=files.filter(file=>!file.startsWith('cores/')),large=Buffer.alloc(1024*1024,37);
function bytes(file){
 if(file==='index.html')return Buffer.from('<!doctype html><meta charset="utf-8"><title>Delta '+revision+'</title><p>Delta '+revision+'</p>');
 if(file==='app.js')return Buffer.from('/* stable application shell */');
 if(file==='update.html')return Buffer.from('<!doctype html><html lang="ja"><meta charset="utf-8"><p id="update-status"></p><button id="apply-update" disabled>更新</button><script type="module" src="src/updates/update.js"></script>');
 if(file==='src/i18n/index.js')return Buffer.from('export const tr=source=>source;');
 if(file==='src/i18n/page.js')return Buffer.from('/* isolated Japanese UI */');
 if(file==='cores/changed.bin')return Buffer.from('changed core '+revision);
 if(file.startsWith('cores/'))return Buffer.concat([large,Buffer.from(file)]);
 let text=sources.get(file);assert.ok(text,file);
 if(file==='sw.js'){
  text+='\n// delta fixture '+revision;
  if(quota&&revision===2)text+="\nlet quotaActive=true;self.addEventListener('message',e=>{if(e.data?.type==='fixture-quota-off'){quotaActive=false;e.ports[0]?.postMessage({ok:true});}});const realPut=Cache.prototype.put;Cache.prototype.put=function(request,response){if(quotaActive&&String(request.url||request).endsWith('/cores/late.bin'))return Promise.reject(new DOMException('Synthetic cache quota','QuotaExceededError'));return realPut.call(this,request,response);};";
  if(metadataQuota&&revision===2)text+="\nlet quotaActive=true;self.addEventListener('message',e=>{if(e.data?.type==='fixture-quota-off'){quotaActive=false;e.ports[0]?.postMessage({ok:true});}});const realPut=Cache.prototype.put;Cache.prototype.put=async function(request,response){if(quotaActive&&String(request.url||request).endsWith('/.offline-release.json')&&(await response.clone().json()).active)throw new DOMException('Synthetic activation metadata quota','QuotaExceededError');return realPut.call(this,request,response);};";
  if(installQuota&&revision===2)text+="\nconst realPut=Cache.prototype.put;Cache.prototype.put=function(request,response){if(String(request.url||request).endsWith('/cores/changed.bin'))return Promise.reject(new DOMException('Synthetic install quota','QuotaExceededError'));return realPut.call(this,request,response);};";
 }
 return Buffer.from(text);
}
function manifest(){return {version:'delta-'+revision,files,shell,bytes:files.reduce((n,file)=>n+bytes(file).length,0),sizes:Object.fromEntries(files.map(file=>[file,bytes(file).length])),integrity:Object.fromEntries(files.map(file=>[file,'sha256-'+crypto.createHash('sha256').update(bytes(file)).digest('base64')]))};}
const server=http.createServer((req,res)=>{
 const file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
 requests.push({revision,file,bytes:0});const entry=requests.at(-1);
 if(offline){req.socket.destroy();return;}
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.bin')?'application/octet-stream':'text/javascript');
 if(file==='offline-manifest.js'){res.end('self.APP_OFFLINE='+JSON.stringify(manifest())+';');return;}
 if(!files.includes(file)&&file!=='sw.js'){res.writeHead(404).end();return;}
 if(revision===2&&file==='cores/changed.bin'&&fail){res.writeHead(503).end('Transient failure');return;}
 const body=bytes(file),data=file==='cores/used.bin'?zlib.gzipSync(body):body;
 if(file==='cores/used.bin')res.setHeader('Content-Encoding','gzip');
 res.setHeader('Content-Length',data.length);
 const send=()=>{entry.bytes=data.length;res.end(data);};
 if(revision===2&&file==='index.html'&&hold)finish=send;else send();
});
async function message(page,type,target='active'){
 return page.evaluate(async({type,target})=>{const registration=await navigator.serviceWorker.getRegistration();return new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=e=>{if(type==='download'&&!e.data.done)return;channel.port1.close();resolve(e.data);};registration[target].postMessage({type},[channel.port2]);});},{type,target});
}
async function update(page){await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();const found=new Promise(resolve=>reg.addEventListener('updatefound',()=>{globalThis.deltaCandidate=reg.installing;resolve();},{once:true}));await reg.update();await found;});}
async function waitPage(page,predicate){const deadline=Date.now()+30000;while(!await page.evaluate(predicate)){assert.ok(Date.now()<deadline,'Worker condition timed out');await page.waitForTimeout(25);}}
async function waiting(page){await waitPage(page,async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);}
async function fetchText(page,file){return page.evaluate(file=>fetch(file).then(async response=>({status:response.status,text:await response.text()})),file);}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let base='http://127.0.0.1:'+server.address().port+'/';
 const browser=await runtime[engine].launch({headless:true,...(engine==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  for(const mode of (process.env.DELTA_CASE?[process.env.DELTA_CASE==='quota'?'carry':process.env.DELTA_CASE]:['normal','carry','metadata'])){
   const quotaCase=mode!=='normal';
   revision=1;offline=false;fail=false;hold=false;quota=mode==='carry';metadataQuota=mode==='metadata';requests.length=0;
   const context=await browser.newContext();let page=await context.newPage();page.setDefaultTimeout(30000);
   try{
    await page.goto(base);await page.evaluate(async()=>{await navigator.serviceWorker.register('sw.js',{updateViaCache:'none'});await navigator.serviceWorker.ready;});await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    assert.equal((await fetchText(page,'cores/used.bin')).status,200);
    await page.evaluate(async()=>{
     const cache=await caches.open('manic-web:/:delta-1');await cache.put('app.js',new Response('corrupt body'));
     await(await caches.open('unrelated-app')).put('keep',new Response('unrelated'));
     const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('delta-save',1);req.onupgradeneeded=()=>req.result.createObjectStore('saves');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
     await new Promise((resolve,reject)=>{const tx=db.transaction('saves','readwrite');tx.objectStore('saves').put(new Uint8Array([9,17,255]),'battery');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
    });
    assert.equal(await page.evaluate(async()=>await(await(await caches.open('manic-web:/:delta-1')).match('app.js')).text()),'corrupt body');revision=2;fail=!quotaCase;await update(page);
    if(fail){
     await page.waitForFunction(()=>globalThis.deltaCandidate?.state==='redundant');
     assert.equal((await message(page,'app-version')).version,'delta-1');assert.equal((await fetchText(page,'index.html')).text.includes('Delta 1'),true,'Failed staging keeps the old shell');
     assert.equal(await page.evaluate(()=>caches.has('manic-web:/:delta-1')),true);
     fail=false;hold=true;
     // Force a genuine network step on retry so progress can be inspected.
     await page.evaluate(async()=>{await(await caches.open('manic-web:/:delta-2')).delete('index.html');});
     await update(page);await waitPage(page,async()=>!!(await navigator.serviceWorker.getRegistration()).installing);
     const progress=await message(page,'update-progress','installing');assert.ok(progress.totalBytes>1024*1024&&progress.bytes<progress.totalBytes,'Progress uses planned byte sizes, including verified local reuse');
     const deadline=Date.now()+30000;while(!finish){assert.ok(Date.now()<deadline,'Held update request did not start');await new Promise(resolve=>setTimeout(resolve,10));}hold=false;finish();finish=null;
    }
    await waiting(page);
    assert.equal((await message(page,'app-version','waiting')).version,'delta-2');
    assert.equal(await page.evaluate(async()=>JSON.parse(await(await(await caches.open('manic-web:/:delta-2')).match('.offline-release.json')).text()).active),false,'Querying a waiting worker does not mark it active');
    assert.equal(await page.evaluate(()=>caches.has('manic-web:/:delta-1')),true,'Querying a waiting worker keeps the active cache');
    assert.equal(requests.filter(r=>r.revision===2&&r.file==='cores/used.bin').length,0,'Unchanged used core never contacts the network');
    assert.equal(requests.filter(r=>r.revision===2&&r.file==='cores/cold.bin').length,0,'Unused unchanged core is not staged');
    const replacements=requests.filter(r=>r.revision===2&&r.file==='app.js').length;
    assert.ok(replacements>=1&&replacements<=(engine==='webkit'&&!quotaCase?2:1),'Corrupt cache is replaced; WebKit may discard failed-install partial downloads');
    assert.equal(await page.evaluate(async()=>await(await(await caches.open('manic-web:/:delta-2')).match('app.js')).text()),'/* stable application shell */');
    // This asset was NOT in the install snapshot. A late old-page fetch must
    // survive natural activation when the last tab closes, even offline.
    assert.equal((await fetchText(page,'cores/late.bin')).status,200);offline=true;await page.close();
    page=await context.newPage();await page.goto(base);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    assert.equal((await message(page,'app-version')).version,'delta-2');
    const used=await fetchText(page,'cores/used.bin');assert.equal(used.status,200);assert.equal(used.text,bytes('cores/used.bin').toString(),'Reused gzip responses retain their decoded body');assert.equal((await fetchText(page,'cores/late.bin')).status,200);
    assert.equal((await fetchText(page,'cores/changed.bin')).text,'changed core 2','Changed optional resource is prepared before activation');
    const saved=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const req=indexedDB.open('delta-save');req.onsuccess=()=>resolve(req.result);});return new Promise(resolve=>{const req=db.transaction('saves').objectStore('saves').get('battery');req.onsuccess=()=>{db.close();resolve([...req.result]);};});});assert.deepEqual(saved,[9,17,255]);
    assert.equal(await page.evaluate(()=>caches.has('unrelated-app')),true);
    assert.equal(await page.evaluate(()=>caches.has('manic-web:/:delta-1')),quotaCase,'Failed carry-over or active metadata writes keep the old fallback cache');
    if(metadataQuota)assert.equal(await page.evaluate(async()=>JSON.parse(await(await(await caches.open('manic-web:/:delta-2')).match('.offline-release.json')).text()).active),false,'Activation succeeded despite a rejected active metadata write');
    assert.equal((await fetchText(page,'cores/cold.bin')).status,503,'Never-used assets are not falsely reported as offline-ready');
    const wire=requests.filter(r=>r.revision===2&&files.includes(r.file)&&r.file!=='cores/late.bin').reduce((n,r)=>n+r.bytes,0);
    console.log(`PASS ${engine}: ${quotaCase?mode+' quota fallback':'failed install/retry'}, natural offline activation, late asset preservation, integrity and unchanged save bytes; update payload ${wire} bytes vs ${manifest().bytes} bytes for a full set (synthetic assets).`);
    if(quotaCase){
     // Simulate space being freed after activation, and a newer candidate
     // already staging. Startup cleanup must only retire recorded predecessors.
     await page.evaluate(async()=>{await(await caches.open('manic-web:/:future-candidate')).put('app.js',new Response('future candidate'));});
     await message(page,'fixture-quota-off');await message(page,'app-version');
     await waitPage(page,async()=>!await caches.has('manic-web:/:delta-1'));
     await waitPage(page,async()=>{const record=await(await(await caches.open('manic-web:/:delta-2')).match('.offline-release.json')).json();return record.active===true&&record.predecessors.length===0;});
     assert.equal(await page.evaluate(()=>caches.has('manic-web:/:future-candidate')),true);
     assert.equal(await page.evaluate(async()=>!!await(await caches.open('manic-web:/:delta-2')).match('cores/late.bin')),true);
     await message(page,'app-version');assert.equal((await fetchText(page,'cores/late.bin')).status,200);
     console.log('PASS '+engine+': startup retries deferred carry-over offline, retires only predecessors and preserves a newer candidate cache.');
    }
    if(!quotaCase){
     offline=false;const all=await message(page,'download');assert.equal(all.ready,true,'Explicit full offline download still includes cold assets');
     revision=3;await update(page);await waiting(page);await page.close();page=await context.newPage();await page.goto(base);
     assert.equal((await message(page,'status')).ready,true,'A full offline installation remains complete after an update');
     console.log('PASS '+engine+': explicit full-offline coverage survives another update.');
    }
   }finally{
    offline=false;finish?.();finish=null;await context.close();
    // A closed WebKit context can finish a queued worker request afterwards.
    // Give each fault scenario its own origin so it cannot affect the next
    // revision's response or request counters.
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port+'/';
   }
  }
  // No legacy manifest: reuse matching bodies, validate a corrupt one and
  // conservatively stage the rest. Do not guess the old release's hashes.
  revision=1;quota=false;metadataQuota=false;requests.length=0;const context=await browser.newContext(),page=await context.newPage();
  try{
   await page.goto(base);await page.evaluate(async()=>{const cache=await caches.open('manic-web:/:legacy');await cache.put('app.js',new Response('/* stable application shell */'));await cache.put('cores/used.bin',new Response('corrupt legacy core'));});
   await page.evaluate(async()=>{await navigator.serviceWorker.register('sw.js',{updateViaCache:'none'});await navigator.serviceWorker.ready;});await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
   assert.equal(requests.filter(r=>r.file==='app.js').length,0);assert.equal(requests.filter(r=>r.file==='cores/used.bin').length,1);assert.equal((await message(page,'status')).ready,true);
   console.log('PASS '+engine+': legacy cache migration reuses verified files and replaces corrupt bytes.');
  }finally{await context.close();}
  revision=1;quota=false;requests.length=0;const quotaContext=await browser.newContext(),quotaPage=await quotaContext.newPage();
  try{
   await quotaPage.goto(base+'update.html');await quotaPage.getByText('最新の状態です。',{exact:true}).waitFor();
   revision=2;installQuota=true;await quotaPage.reload();await quotaPage.getByText('容量が不足しているため保存できません。',{exact:true}).waitFor();
   const failure=await message(quotaPage,'update-failure');assert.equal(failure.reason,'quota');assert.ok(failure.retryAfter>Date.now());
   assert.equal((await message(quotaPage,'app-version')).version,'delta-1');
   const before=requests.filter(r=>r.revision===2&&files.includes(r.file)&&r.file!=='src/updates/auto-update-worker.js').length;
   await update(quotaPage);await quotaPage.waitForFunction(()=>deltaCandidate.state==='redundant');
   assert.equal(requests.filter(r=>r.revision===2&&files.includes(r.file)&&r.file!=='src/updates/auto-update-worker.js').length,before,'Same-build quota retry is deferred before any asset transfers');
   installQuota=false;fail=true;await quotaPage.locator('#apply-update').click();await quotaPage.getByText('更新できませんでした。接続を確認し、もう一度お試しください。',{exact:true}).waitFor();
   assert.equal((await message(quotaPage,'update-failure')).reason,'download','A later network failure must not retain the previous quota explanation');
   fail=false;await quotaPage.locator('#apply-update').click();await quotaPage.getByText('更新できます。',{exact:true}).waitFor();
   await quotaPage.locator('#apply-update').click();await quotaPage.waitForURL(base+'index.html');
   assert.equal((await message(quotaPage,'app-version')).version,'delta-2');
   console.log('PASS '+engine+': install quota keeps the old app, reports storage rather than network failure, throttles same-build retries and permits an explicit manual retry.');
  }finally{installQuota=false;fail=false;await quotaContext.close();}
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
