// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const engine=process.env.BROWSER_ENGINE||'chromium',browserType=require('./browser-runtime.cjs')[engine],root=path.resolve(__dirname,'..');
(async()=>{
 const messages=[],client={id:'test',url:'https://example.test/index.html',postMessage(message,ports){if(message.type==='local-play-update-prepare')ports[0].onmessage=event=>messages.push(event.data.type);ports[0].postMessage({ready:true});}},worker={clients:{matchAll:async()=>[client]},navigator:{locks:{request:async(_name,_options,callback)=>callback({})}},registration:{waiting:{}},skipWaiting:async()=>{throw Error('Rejected before activation');}};
 const coordinatorContext={self:worker,URL,crypto,MessageChannel,setTimeout:(fn,ms)=>setTimeout(fn,ms===1200?0:ms),clearTimeout};
 vm.runInNewContext(fs.readFileSync(path.join(root,'src/updates/auto-update-worker.js'),'utf8')+'\nglobalThis.testCoordinator=automaticUpdateCoordinator(new URL("https://example.test/"));',coordinatorContext);
 await assert.rejects(coordinatorContext.testCoordinator.apply(client),/Rejected before activation/);await new Promise(resolve=>setTimeout(resolve,20));
 assert.deepEqual(messages,['commit','abort','cancel'],'A rejected skipWaiting explicitly aborts and releases prepared pages');
 const activationContext={};vm.runInNewContext(fs.readFileSync(path.join(root,'src/updates/controller-activation.js'),'utf8').replace('export function ','function ')+'\nglobalThis.watchActivation=afterControllerActivation;',activationContext);
 class Target{constructor(state){this.state=state;this.listeners=new Map();}addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(listener);}removeEventListener(type,listener){this.listeners.get(type)?.delete(listener);}send(type){for(const listener of [...this.listeners.get(type)||[]])listener();}count(){return [...this.listeners.values()].reduce((sum,listeners)=>sum+listeners.size,0);}}
 const container=new Target(),early=new Target('activated');container.controller=early;let callbacks=0;
 activationContext.watchActivation(worker=>{assert.equal(worker,early);callbacks++;},container);assert.equal(callbacks,1);assert.equal(container.count()+early.count(),0,'Already-active observation cleans up immediately');
 container.controller=null;const stop=activationContext.watchActivation(()=>callbacks++,container),obsolete=new Target('activating'),replacement=new Target('activating');
 container.controller=obsolete;container.send('controllerchange');obsolete.state='redundant';obsolete.send('statechange');assert.equal(callbacks,1,'A redundant controller never authorizes reload');
 container.controller=replacement;container.send('controllerchange');assert.equal(obsolete.count(),0,'Replacement detaches the previous worker listener');obsolete.state='activated';obsolete.send('statechange');assert.equal(callbacks,1,'An obsolete worker cannot reload the page');
 replacement.state='activated';replacement.send('statechange');replacement.send('statechange');stop();assert.equal(callbacks,2);assert.equal(container.count()+replacement.count(),0,'Activation calls once and removes all listeners');
 container.controller=null;const cancel=activationContext.watchActivation(()=>callbacks++,container);cancel();container.controller=early;container.send('controllerchange');assert.equal(callbacks,2);assert.equal(container.count(),0,'Cancelling a no-controller wait removes its listener');
 let revision=1,failedAsset=null;const requests=new Map(),trace=[],started=Date.now();
 const names=['index.html','update.html','src/updates/update.js','src/updates/controller-activation.js','src/i18n/page.js','src/i18n/index.js','src/updates/auto-update-worker.js','assets/retry.js','cores/test/core.js','vendor/test.js'];
 const sourceFiles=new Map(['sw.js','src/updates/update.js','src/updates/controller-activation.js','src/updates/auto-update-worker.js'].map(name=>[name,fs.readFileSync(path.join(root,name),'utf8')]));
 const shell=names.filter(name=>!name.startsWith('cores/')&&!name.startsWith('vendor/'));
 function bytes(name){
  if(name==='index.html')return Buffer.from('<!doctype html><title>Update safety fixture</title><p>Release '+revision+'</p>');
  if(name==='update.html')return Buffer.from('<!doctype html><p id="update-status"></p><button id="apply-update" disabled>更新</button><script type="module" src="src/updates/update.js"></script>');
  if(name==='src/i18n/page.js')return Buffer.from("navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.testFailure)globalThis.testFailure=e.data;});");
  if(name==='src/i18n/index.js')return Buffer.from('export const tr=source=>source;');
  if(['assets/retry.js','cores/test/core.js','vendor/test.js'].includes(name))return Buffer.from('globalThis.fixtureRevision='+revision+'; // '+name);
  let text=sourceFiles.get(name);
  if(name==='sw.js'){
   text="const testTrace=point=>void fetch(new URL('test-trace?revision="+revision+"&point='+encodeURIComponent(point),self.location.href)).catch(()=>{});\n"+text;
   text=text.replace("self.addEventListener('activate',e=>e.waitUntil((async()=>{", "self.addEventListener('activate',e=>e.waitUntil((async()=>{testTrace('activate:start');");
   text=text.replace('await self.clients.claim();autoUpdate.activated();',"testTrace('claim:start');await self.clients.claim();testTrace('claim:done');autoUpdate.activated();testTrace('activate:done');");
   text=text.replace('port.postMessage({ok:true});await self.skipWaiting();',"testTrace('manual:skip-waiting');port.postMessage({ok:true});await self.skipWaiting();testTrace('manual:skipped');");
   if(revision===2)text=text.replace("testTrace('claim:start');", "testTrace('claim:held');await new Promise(resolve=>{self.finishTestActivation=resolve;});testTrace('claim:start');");
   text=text.replace('if(failure)throw failure;',"if(failure){for(const client of await self.clients.matchAll({includeUncontrolled:true}))client.postMessage({testFailure:failure.message,keys:(await cache.keys()).map(r=>r.url),cacheName});throw failure;}");
   text+='\n// fixture revision '+revision;
   if(revision===3){
    text=text.replace("self.addEventListener('activate',e=>e.waitUntil((async()=>{", "self.addEventListener('activate',e=>e.waitUntil((async()=>{await new Promise(resolve=>{self.finishTestActivation=resolve;});");
   }
   if([2,3].includes(revision))text+="\nself.addEventListener('message',event=>{if(event.data?.type==='test-finish-activation')self.finishTestActivation?.();});";
  }
  return Buffer.from(text);
 }
 const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(name==='test-trace'){trace.push({ms:Date.now()-started,event:req.url});res.writeHead(204).end();return;}
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
  const context=await browser.newContext(),page=await context.newPage();
  page.on('console',message=>{if(message.text().startsWith('TEST-WORKER-EVENT'))trace.push({ms:Date.now()-started,event:message.text()});});
  page.on('pageerror',error=>trace.push({ms:Date.now()-started,event:'pageerror: '+error.message}));
  await page.addInitScript(()=>{navigator.serviceWorker.addEventListener('controllerchange',()=>console.debug('TEST-WORKER-EVENT controllerchange: '+navigator.serviceWorker.controller?.state));});
  await page.goto(base);
  async function snapshot(){return page.evaluate(async()=>{
   const registration=await navigator.serviceWorker.getRegistration(),state=worker=>worker?{state:worker.state,scriptURL:worker.scriptURL}:null;
   const version=worker=>!worker?null:new Promise(resolve=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve('no-response');},1000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data);};worker.postMessage({type:'app-version'},[channel.port2]);});
   return {url:location.href,controller:state(navigator.serviceWorker.controller),active:state(registration?.active),waiting:state(registration?.waiting),installing:state(registration?.installing),controllerVersion:await version(navigator.serviceWorker.controller),activeVersion:await version(registration?.active),caches:await caches.keys()};
  });}
  async function waitAsync(predicate){const end=Date.now()+30000;while(!await page.evaluate(predicate)){if(Date.now()>=end){console.error('WORKER DIAGNOSTICS',JSON.stringify({engine,browser:browser.version(),snapshot:await snapshot(),trace,requests:Object.fromEntries(requests)},null,2));assert.fail('Timed out waiting for worker state');}await page.waitForTimeout(50);}}
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
  await page.locator('#apply-update').click();
  await waitAsync(async()=>{const active=(await navigator.serviceWorker.getRegistration()).active;return active?.state==='activating'&&navigator.serviceWorker.controller===active;});
  const holdDeadline=Date.now()+30000;
  while(!trace.some(entry=>entry.event.includes('revision=2&point=claim%3Aheld'))){assert.ok(Date.now()<holdDeadline,'The activation fixture must reach its hold before release');await page.waitForTimeout(20);}
  await page.waitForTimeout(500);
  assert.equal(page.url(),base+'update.html','Manual update must keep the page alive until activation completes, not navigate on controllerchange');
  assert.equal(await page.evaluate(()=>localStorage.getItem('keep-save')),'unchanged');
  await page.evaluate(async()=>{(await navigator.serviceWorker.getRegistration()).active.postMessage({type:'test-finish-activation'});});
  try{await page.waitForURL(base+'index.html');}catch(error){console.error('ACTIVATION DIAGNOSTICS',JSON.stringify({snapshot:await snapshot(),trace},null,2));throw error;}
  assert.equal(await page.evaluate(()=>localStorage.getItem('keep-save')),'unchanged');
  assert.equal(await page.locator('p').textContent(),'Release 2');
  // The page waits for activation before navigating. Both exposed objects must
  // now agree, in addition to running the same build and retiring the old cache.
  await waitAsync(async()=>{const registration=await navigator.serviceWorker.getRegistration();return registration?.active?.state==='activated'&&!!navigator.serviceWorker.controller;});
  assert.equal(await page.evaluate(()=>navigator.serviceWorker.controller.state),'activated');
  const activated=await page.evaluate(async()=>{
   const registration=await navigator.serviceWorker.getRegistration();
   const version=worker=>new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('Activated worker did not answer app-version'));},5000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data.version);};worker.postMessage({type:'app-version'},[channel.port2]);});
   return {active:await version(registration.active),controller:await version(navigator.serviceWorker.controller),oldCache:(await caches.keys()).includes('manic-web:/:safety-1')};
  });
  assert.deepEqual(activated,{active:'safety-2',controller:'safety-2',oldCache:false},'The activated registration and controlling worker must run the new build, with the old cache retired');
  if(process.env.UPDATE_SAFETY_TRACE)console.log('WORKER TRACE',JSON.stringify({snapshot:await snapshot(),trace}));
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
