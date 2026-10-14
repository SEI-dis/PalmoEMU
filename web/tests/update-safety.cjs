// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const engine=process.env.BROWSER_ENGINE||'chromium',browserType=require('./browser-runtime.cjs')[engine],root=path.resolve(__dirname,'..');
(async()=>{
 const messages=[],client={id:'test',url:'https://example.test/index.html',postMessage(message,ports){if(message.type==='local-play-update-prepare')ports[0].onmessage=event=>messages.push(event.data.type);ports[0].postMessage({ready:true});}},worker={clients:{matchAll:async()=>[client]},navigator:{locks:{request:async(_name,_options,callback)=>callback({})}},registration:{waiting:{}},skipWaiting:async()=>{throw Error('Rejected before activation');}};
 const coordinatorContext={self:worker,URL,crypto,MessageChannel,setTimeout:(fn,ms)=>setTimeout(fn,ms===1200?0:ms),clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(root,'src/updates/auto-update-worker.js'),'utf8')+'\nglobalThis.testCoordinator=automaticUpdateCoordinator(new URL("https://example.test/"));',coordinatorContext);
 await assert.rejects(coordinatorContext.testCoordinator.apply(client),/Rejected before activation/);await new Promise(resolve=>setTimeout(resolve,20));
 assert.deepEqual(messages,['commit','abort','cancel'],'A rejected skipWaiting explicitly aborts and releases prepared pages');
 let revision=1,failedAsset=null;const requests=new Map();
 const names=['index.html','update.html','src/updates/update.js','src/i18n/page.js','src/i18n/index.js','src/updates/auto-update-worker.js','assets/retry.js','cores/test/core.js','vendor/test.js'];
 const sourceFiles=new Map(['sw.js','src/updates/update.js','src/updates/auto-update-worker.js'].map(name=>[name,fs.readFileSync(path.join(root,name),'utf8')]));
 const shell=names.filter(name=>!name.startsWith('cores/')&&!name.startsWith('vendor/'));
 function bytes(name){
  if(name==='index.html')return Buffer.from('<!doctype html><title>Update safety fixture</title><p>Release '+revision+'</p>');
  if(name==='update.html')return Buffer.from('<!doctype html><p id="update-status"></p><button id="apply-update" disabled>更新</button><script type="module" src="src/updates/update.js"></script>');
  if(name==='src/i18n/page.js')return Buffer.from("navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.testFailure)globalThis.testFailure=e.data;});");
  if(name==='src/i18n/index.js')return Buffer.from('export const tr=source=>source;');
  if(['assets/retry.js','cores/test/core.js','vendor/test.js'].includes(name))return Buffer.from('globalThis.fixtureRevision='+revision+'; // '+name);
  let text=sourceFiles.get(name);
  if(name==='sw.js'){
   text=text.replace('if(failure)throw failure;',"if(failure){for(const client of await self.clients.matchAll({includeUncontrolled:true}))client.postMessage({testFailure:failure.message,keys:(await cache.keys()).map(r=>r.url),cacheName});throw failure;}");
   text+='\n// fixture revision '+revision;
   if(revision===3){
    text=text.replace("self.addEventListener('activate',e=>e.waitUntil((async()=>{", "self.addEventListener('activate',e=>e.waitUntil((async()=>{await new Promise(resolve=>{self.finishTestActivation=resolve;});");
    text+="\nself.addEventListener('message',event=>{if(event.data?.type==='test-finish-activation')self.finishTestActivation?.();});";
   }
  }
  return Buffer.from(text);
 }
 const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  requests.set(revision+':'+name,(requests.get(revision+':'+name)||0)+1);
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',name.endsWith('.html')?'text/html':'text/javascript');
  if(name===failedAsset){res.writeHead(503).end('Interrupted download');return;}
  if(name==='offline-manifest.js'){
   const manifest={version:'safety-'+revision,files:names,shell,bytes:1000,integrity:Object.fromEntries(names.map(file=>[file,'sha256-'+crypto.createHash('sha256').update(bytes(file)).digest('base64')]))};
   res.end('self.APP_OFFLINE='+JSON.stringify(manifest)+';');return;
  }
  if(!names.includes(name)&&name!=='sw.js'){res.writeHead(404).end();return;}
  res.end(bytes(name));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port+'/';
 const browser=await browserType.launch({headless:true,...(engine==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext(),page=await context.newPage();await page.goto(base);
  async function waitAsync(predicate){const end=Date.now()+30000;while(!await page.evaluate(predicate)){assert.ok(Date.now()<end,'Timed out waiting for worker state');await page.waitForTimeout(50);}}
  await page.evaluate(async()=>{localStorage.setItem('keep-save','unchanged');await navigator.serviceWorker.register('sw.js',{updateViaCache:'none'});await navigator.serviceWorker.ready;});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await page.reload();
  revision=2;
  const stale=await page.evaluate(async()=>{
   const results=[];for(const name of ['cores/test/core.js','vendor/test.js'])results.push((await fetch(name)).status);
   const cache=await caches.open('manic-web:/:safety-1');
   return {statuses:results,core:!!await cache.match('cores/test/core.js'),vendor:!!await cache.match('vendor/test.js')};
  });
  assert.deepEqual(stale,{statuses:[503,503],core:false,vendor:false},'Old worker must not return or cache newly deployed lazy code');
  const download=await page.evaluate(()=>new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=event=>{if(event.data.done){channel.port1.close();resolve(event.data);}};navigator.serviceWorker.controller.postMessage({type:'download'},[channel.port2]);}));
  assert.ok(download.error,'An offline download using an old manifest also rejects new bytes');
  console.log('PASS '+engine+': old shell rejects mismatched core/vendor bytes and offline download does not contaminate its cache.');
  failedAsset='assets/retry.js';await page.goto(base+'update.html');
  await page.getByText('更新できませんでした。接続を確認し、もう一度お試しください。',{exact:true}).waitFor();
  assert.equal(await page.locator('#apply-update').isEnabled(),true,'A failed install offers a retry instead of latest');
  assert.equal(await page.locator('#update-status').textContent(),'更新できませんでした。接続を確認し、もう一度お試しください。');
  await waitAsync(async()=>{const registration=await navigator.serviceWorker.getRegistration();return !registration.installing;});
  // Inspect verified entries in the install worker before it becomes redundant.
  await page.waitForFunction(()=>!!globalThis.testFailure);
  const before=await page.evaluate(()=>testFailure.keys.map(url=>new URL(url).pathname.slice(1)));
  assert.ok(before.includes('index.html'),'Successful verified downloads survive an interrupted installation');
  const counts=new Map(before.map(name=>[name,requests.get('2:'+name)||0]));
  failedAsset=null;await page.locator('#apply-update').click();await page.getByText('更新できます。',{exact:true}).waitFor();
  // WebKit can discard the failed worker's partial cache. It must still retry
  // safely; Chromium also verifies reuse where those entries remain available.
  if(engine!=='webkit')for(const name of before)if(!['src/updates/auto-update-worker.js'].includes(name))assert.equal(requests.get('2:'+name)||0,counts.get(name),'Retry must reuse verified '+name);
  await page.locator('#apply-update').click();await page.waitForURL(base+'index.html');
  assert.equal(await page.evaluate(()=>localStorage.getItem('keep-save')),'unchanged');
  assert.equal(await page.locator('p').textContent(),'Release 2');
  await page.waitForFunction(()=>navigator.serviceWorker.controller?.state==='activated');
  console.log('PASS '+engine+': failed manual installation is actionable, retry completes safely and activation preserves local data.');
  // Deliberately exceed the former 10-second activation timeout. A real worker
  // and MessagePorts must keep prepared pages frozen until clients.claim().
  revision=3;await page.evaluate(async()=>{
   globalThis.prepared=false;globalThis.cancelled=false;globalThis.committed=false;globalThis.applied=null;globalThis.changedWhilePrepared=null;
   navigator.serviceWorker.addEventListener('controllerchange',()=>{changedWhilePrepared=prepared;});
   navigator.serviceWorker.addEventListener('message',event=>{
    if(event.data?.type==='local-play-update-probe'){event.ports[0].postMessage({ready:true});return;}
    if(event.data?.type!=='local-play-update-prepare')return;
    prepared=true;event.ports[0].onmessage=message=>{if(message.data?.type==='cancel'){cancelled=true;prepared=false;}if(message.data?.type==='commit')committed=true;};event.ports[0].postMessage({ready:true});
   });
   await(await navigator.serviceWorker.ready).update();
  });
  await waitAsync(async()=>{const candidate=(await navigator.serviceWorker.getRegistration()).waiting;if(candidate)globalThis.updateCandidate=candidate;return !!candidate;});
  await page.evaluate(()=>{const channel=new MessageChannel();channel.port1.onmessage=event=>{applied=event.data.applied;channel.port1.close();};updateCandidate.postMessage({type:'auto-update'},[channel.port2]);});
  await page.waitForFunction(()=>committed);await page.waitForTimeout(11200);
  assert.deepEqual(await page.evaluate(()=>({prepared,cancelled,applied})),{prepared:true,cancelled:false,applied:null},'Long activation is irreversible and must not resume an old page');
  await page.evaluate(async()=>{(await navigator.serviceWorker.getRegistration()).active.postMessage({type:'test-finish-activation'});});
  await page.waitForFunction(()=>applied===true&&changedWhilePrepared===true);
  assert.equal(await page.evaluate(()=>cancelled),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('keep-save')),'unchanged');
  console.log('PASS '+engine+': activation delayed beyond 10 seconds keeps pages prepared through controllerchange.');
  await context.close();
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
