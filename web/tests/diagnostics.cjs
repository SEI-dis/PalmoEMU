// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic errors and data in isolated browser storage; no telemetry endpoint.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const engine=process.env.BROWSER_ENGINE||'chromium',key='palmo-diagnostics-v1',marker='PRIVATE_DIAGNOSTIC_CANARY_83da9';
const base=process.env.TEST_URL||'http://127.0.0.1:4173/';
function privateFree(value){
 const json=JSON.stringify(value);
 for(const text of [marker,'PRIVATE_FUNCTION','secret-save-bytes','Mozilla/','https://private.invalid','private-user-name','private-file.nds'])assert.ok(!json.includes(text),'Diagnostic leaked '+text);
 assert.ok(!/https?:\/\/|file:\/\/|C:\\\\Users/.test(json),'No user URLs or local file paths in diagnostics');
}
(async()=>{
 const browser=await runtime[engine].launch({headless:true,...(engine==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),requests=[],errors=[];
  context.on('request',r=>requests.push({url:r.url(),method:r.method(),body:r.postDataBuffer()?.length||0}));
  await context.addInitScript(()=>{
   window.diagnosticConnections=0;
   for(const name of ['WebSocket','RTCPeerConnection'])if(window[name])window[name]=new Proxy(window[name],{construct(target,args){diagnosticConnections++;return Reflect.construct(target,args);}});
  });
  page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
  await page.locator('#add-first').waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
  await page.evaluate(async()=>{window.diagnostics=(await import('./src/diagnostics.js')).diagnostics;});
  assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),null,'Loading the app must not create diagnostic records');
  assert.deepEqual(await page.evaluate(()=>diagnostics.list()),[]);
  const exportReport=async()=>{
   const waiting=page.waitForEvent('download');await page.locator('#diagnostics-export').click();const download=await waiting,chunks=[];
   assert.match(download.suggestedFilename(),/^PalmoEMU-diagnostics-.*\.json$/);
   for await(const chunk of await download.createReadStream())chunks.push(chunk);
   const bytes=Buffer.concat(chunks);assert.ok(bytes.length>0,'Diagnostic file is not empty');const report=JSON.parse(bytes.toString('utf8'));
   privateFree(report);assert.equal(report.schemaVersion,1);assert.equal(await page.locator('#toast').textContent(),'ダウンロードを開始しました。');return report;
  };
  // Empty diagnostics are still exportable; opting in is not a prerequisite.
  await page.locator('[data-tab=settings]').click();await page.locator('[data-action=diagnostics]').click();
  assert.equal(await page.locator('#diagnostics-enabled').isChecked(),true);assert.deepEqual((await exportReport()).reports,[]);await page.locator('#close-sheet').click();

  const allocationChecks=await page.evaluate(async marker=>{
   const {MGBACore}=await import('./src/core/mgba.js'),{loadCompatibleMGBA}=await import('./src/core/mgba-compatibility.js');
   const {allocateCoreMemory,romSizeClass,wasmMemoryBytes,withAllocation,safeAllocation}=await import('./src/runtime/memory-diagnostics.js');
   const {importROM}=await import('./src/library/rom-import.js');
   const input=new Uint8Array([7,9,13]),reports=[],caught=[];
   async function record(action,source='startup'){
    try{await action();throw Error('Expected injected failure');}catch(error){
     if(error.message==='Expected injected failure')throw error;
     caught.push(error);diagnostics.record(error,source);const report=diagnostics.list().at(-1);reports.push(report);return report;
    }
   }
   const nullModule={HEAPU8:new Uint8Array(128),_malloc(){this.HEAPU8=new Uint8Array(256);return 0;}};
   await record(()=>loadCompatibleMGBA(nullModule,input));
   let frees=0,nativeCalls=0;
   const core=new MGBACore({});core.romSizeClass='up-to-64MiB';core.m={HEAPU8:new Uint8Array(128),_malloc:()=>0,_free:()=>frees++,_web_close(){},_web_save_import:()=>nativeCalls++,_web_state_import:()=>nativeCalls++};
   await record(()=>core.restore(input));await record(()=>core.loadState(input));
   await record(()=>core.setCheats([{name:marker,code:marker,type:0,enabled:true}]));
   let allocations=0;core.m._malloc=()=>++allocations===1?8:0;
   await record(()=>core.setCheats([{name:marker,code:marker,type:0,enabled:true}]));
   const denied=new RangeError(marker),throwModule={HEAPU8:new Uint8Array(128),_malloc(){throw denied;}};
   await record(()=>allocateCoreMemory(throwModule,12,'save-import','up-to-64MiB'));
   const sameException=caught.at(-1)===denied;
   const callbackError=new Error(marker);core.m._malloc=()=>8;
   let callbackIdentity=false;
   try{core.copyIn(input,()=>{throw callbackError;},'save-import');}catch(error){callbackIdentity=error===callbackError&&!error.allocation;}
   const afterCopy=[...core.m.HEAPU8.slice(8,11)];
   const native={HEAPU8:new Uint8Array(128),_malloc:()=>8,_free:()=>frees++,_web_gba_save_capacity:()=>6291456,_web_load_owned(){this.HEAPU8=new Uint8Array(256);return -1;}};
   await record(()=>loadCompatibleMGBA(native,input));
   const legacy={HEAPU8:new Uint8Array(128),_malloc:()=>8,_free:()=>frees++,_web_load:()=>0};
   let legacyAllocation;try{await loadCompatibleMGBA(legacy,input);}catch(error){legacyAllocation=error.allocation||null;}
   // The failed call's captured capacity survives later core teardown.
   core.close();const afterClose=caught[1].allocation;
   const frozen=Object.freeze(new Error(marker));
   const frozenIdentity=withAllocation(frozen,{operation:'save-import',reason:'malloc-null',requestedBytes:3,memoryBytesBefore:128})===frozen;
   const originalWorker=window.Worker;
   try{
    let active;
    window.Worker=class{constructor(){active=this;}postMessage(){}terminate(){this.stopped=true;}};
    for(const archive of [false,true]){
     const task=importROM({name:marker+(archive?'.zip':'.gba'),size:64*1048576},'gba');
     active.onmessage({data:{type:'progress',phase:'reading',name:marker,total:64*1048576}});
     active.onmessage({data:{type:'error',name:'NotReadableError',message:marker,addedCount:0}});
     await record(()=>task,'import');if(!active.stopped)throw Error('Worker was not terminated');
    }
   }finally{window.Worker=originalWorker;}
   const malformed=safeAllocation({operation:'rom-load',reason:'native-init',requestedBytes:64*1048576,memoryBytesBefore:Infinity,romSizeClass:marker,secret:marker});
   const invalid=safeAllocation({get operation(){throw Error(marker);}})||null;
   const unavailable=wasmMemoryBytes({get HEAPU8(){throw Error(marker);}});
   return {reports,afterClose,sameException,callbackIdentity,afterCopy,input:[...input],nativeCalls,frees,legacyAllocation,frozenIdentity,malformed,invalid,unavailable,
    sizes:[0,1,4*1048576,4*1048576+1,16*1048576+1,32*1048576+1,64*1048576+1,128*1048576+1,512*1048576+1,NaN].map(romSizeClass)};
  },marker);
  const details=allocationChecks.reports.map(report=>report.error.allocation);
  assert.deepEqual(details.slice(0,7).map(d=>[d.operation,d.reason,d.requestedBytes,d.memoryBytesBefore,d.romSizeClass]),[
   ['rom-load','malloc-null',3,128,'up-to-4MiB'],['save-import','malloc-null',3,128,'up-to-64MiB'],['state-import','malloc-null',3,128,'up-to-64MiB'],
   ['cheat-name','malloc-null',marker.length+1,128,'up-to-64MiB'],['cheat-code','malloc-null',marker.length+1,128,'up-to-64MiB'],
   ['save-import','malloc-exception',12,128,'up-to-64MiB'],['rom-load','native-init',null,128,'up-to-4MiB']
  ]);
  assert.deepEqual(allocationChecks.reports.slice(-2).map(r=>({source:r.source,error:r.error})),[
   {source:'import',error:{name:'NotReadableError',category:'file-read',importContext:{stage:'reading',romSizeClass:'up-to-64MiB'}}},
   {source:'import',error:{name:'NotReadableError',category:'file-read',importContext:{stage:'reading',romSizeClass:'unknown'}}}
  ]);
  assert.deepEqual(allocationChecks.afterClose,details[1]);assert.ok(allocationChecks.sameException&&allocationChecks.callbackIdentity&&allocationChecks.frozenIdentity);
  assert.equal(allocationChecks.nativeCalls,0);assert.equal(allocationChecks.frees,3,'Outer cheat copy, callback failure and legacy load free once; native-owned failure is not freed twice');
  assert.deepEqual(allocationChecks.input,[7,9,13]);assert.deepEqual(allocationChecks.afterCopy,[7,9,13]);assert.equal(allocationChecks.legacyAllocation,null);
  assert.deepEqual(allocationChecks.malformed,{operation:'rom-load',reason:'native-init',requestedBytes:null,memoryBytesBefore:null,romSizeClass:'unknown'});
  assert.equal(allocationChecks.invalid,null);assert.equal(allocationChecks.unavailable,null);
  assert.deepEqual(allocationChecks.sizes,['unknown','up-to-4MiB','up-to-4MiB','up-to-16MiB','up-to-32MiB','up-to-64MiB','up-to-128MiB','up-to-512MiB','over-512MiB','unknown']);
  privateFree(allocationChecks);
  await page.reload();await page.evaluate(async()=>{window.diagnostics=(await import('./src/diagnostics.js')).diagnostics;});
  const retained=await page.evaluate(()=>diagnostics.list());privateFree(retained);assert.ok(retained.some(r=>r.error.allocation?.reason==='native-init'),'Allocation metadata survives serialization and reload');
  assert.ok(retained.some(r=>r.error.importContext?.romSizeClass==='up-to-64MiB'));
  await page.locator('[data-tab=settings]').click();await page.locator('[data-action=diagnostics]').click();
  assert.ok((await exportReport()).reports.some(r=>r.error.allocation?.requestedBytes===null));await page.locator('#close-sheet').click();
  await page.evaluate(()=>diagnostics.clear());

  const canaries=await page.evaluate(async marker=>{
   const db=await import('./src/storage/storage.js'),id='diagnostic-data-canary';
   await db.addGame({id,name:marker,filename:marker+'.nds',system:'nds',size:4},new Uint8Array([41,42,43,44]));
   await db.put('saves',id,{bytes:new Uint8Array([7,9,13]),note:'secret-save-bytes'});
   localStorage.setItem('diagnostic-unrelated',marker);
   diagnostics.setContext(()=>({phase:'play',system:'nds',core:'desmume2015',coreId:'desmume2015-web-v1',link:'local',speed:2,filter:'pixel',romMiB:128,memoryMiB:256,filename:marker+'.nds',hash:marker,save:'secret-save-bytes',url:'https://private.invalid/?'+marker}));
   const e=new TypeError(marker+' / private-user-name / private-file.nds');
   e.stack='TypeError: '+marker+'\n at PRIVATE_FUNCTION ('+location.origin+'/src/app.js?'+marker+':123:7)\n at core ('+location.origin+'/src/core/mgba.js:77:4)\n at forged ('+location.origin+'/src/core/'+marker+'.js:88:2)\n at private-user-name (https://private.invalid/private-file.nds:44:5)\n at private-file.nds (file:///C:/Users/private-user-name/private-file.nds:3:2)';
   diagnostics.record(e,'handled');const before=diagnostics.list();diagnostics.record(e,'handled');
   return {before,after:diagnostics.list(),id};
  },marker);
  assert.equal(canaries.before.length,1);assert.equal(canaries.after.length,1,'Consecutive identical errors are deduplicated');privateFree(canaries.after);
  assert.equal(canaries.after[0].source,'handled');assert.equal(canaries.after[0].context.system,'nds');assert(canaries.after[0].frames.some(frame=>frame.file==='src/core/mgba.js'),'Moved sources remain diagnosable');
  // Real asynchronous exceptions reach the automatic window handlers. Their
  // raw messages intentionally contain a canary which must never be persisted.
  await page.evaluate(marker=>{const e=new RangeError(marker+' uncaught');setTimeout(()=>{throw e;},0);},marker);
  await page.waitForFunction(()=>diagnostics.list().some(r=>r.source==='global-error'));
  await page.evaluate(marker=>{Promise.reject(new ReferenceError(marker+' rejected'));},marker);
  await page.waitForFunction(()=>diagnostics.list().some(r=>r.source==='unhandled-rejection'));
  const recorded=await page.evaluate(()=>diagnostics.list());privateFree(recorded);
  await page.reload();await page.evaluate(async()=>{window.diagnostics=(await import('./src/diagnostics.js')).diagnostics;});
  for(const source of ['handled','global-error','unhandled-rejection'])assert.ok((await page.evaluate(()=>diagnostics.list())).some(r=>r.source===source),'Report survives reload: '+source);
  const bounded=await page.evaluate(()=>{
   diagnostics.clear();
   for(let i=0;i<7;i++){const e=new TypeError('unretained diagnostic text '+i);e.stack='TypeError\n at test ('+location.origin+'/src/app.js:'+(200+i)+':8)';diagnostics.record(e,'handled');}
   return {reports:diagnostics.list(),snapshot:diagnostics.snapshot(),stored:JSON.parse(localStorage.getItem('palmo-diagnostics-v1'))};
  });
  assert.equal(bounded.reports.length,5,'Keep only the latest five distinct reports');assert.equal(bounded.stored.reports.length,5);privateFree(bounded.snapshot);
  for(const report of bounded.reports){assert.ok(report.frames.length<=8);assert.ok(report.frames.every(f=>Object.keys(f).every(k=>['file','line','column','wasmFunction','offset'].includes(k))));}
  const latest=bounded.reports.find(r=>r.frames.some(f=>f.line===206));assert.ok(latest,'The newest error is retained');
  const updateReports=await page.evaluate(marker=>{
   diagnostics.record({name:'NetworkError',reason:'offline',phase:'ready',worker:'installed',online:false,message:marker},'update');
   diagnostics.record({name:'Error',reason:marker,phase:marker,worker:marker,online:marker,message:marker},'update');
   return diagnostics.list().filter(report=>report.source==='update');
  },marker);
  assert.deepEqual(updateReports.map(report=>report.error),[
   {name:'NetworkError',category:'update',reason:'offline',phase:'ready',worker:'installed',online:false},
   {name:'Error',category:'update',reason:'unknown',phase:'unknown',worker:'unknown',online:null}
  ]);privateFree(updateReports);
  // Corrupt or older browser storage is untrusted too. Re-sanitize it before
  // display/export; never spread unknown fields from a stored report.
  await page.evaluate(({key,marker})=>{
   const saved=JSON.parse(localStorage.getItem(key)),report=saved.reports[0];
   report.message=marker;report.stack='https://private.invalid/'+marker;report.userAgent='Mozilla/'+marker;
   report.context={...report.context,filename:marker+'.nds',hash:marker,bytes:'secret-save-bytes',url:'https://private.invalid/'+marker};
   report.environment={...report.environment,userAgent:'Mozilla/'+marker};report.app={...report.app,custom:marker};
   report.error.allocation={operation:marker,reason:'malloc-null',requestedBytes:marker,memoryBytesBefore:marker,romSizeClass:marker,bytes:'secret-save-bytes'};
   report.error.importContext={stage:marker,romSizeClass:marker};
   report.frames.push({file:'../../private-user-name/'+marker,line:3,column:4,url:'https://private.invalid/'+marker});
   saved.private=marker;saved.reports.push({message:marker,stack:marker});localStorage.setItem(key,JSON.stringify(saved));
  },{key,marker});
  await page.reload();await page.evaluate(async()=>{window.diagnostics=(await import('./src/diagnostics.js')).diagnostics;});
  privateFree(await page.evaluate(()=>diagnostics.snapshot()));assert.ok((await page.evaluate(()=>diagnostics.list())).length<=5);
  await page.locator('[data-tab=settings]').click();await page.locator('[data-action=diagnostics]').click();
  assert.equal(await page.locator('#sheet-title').textContent(),'診断レポート');
  privateFree(JSON.parse(await page.locator('#diagnostics-preview').textContent()));
  const exported=await exportReport();assert.ok(exported.reports.length>0);
  await page.locator('#diagnostics-enabled').uncheck();assert.equal(await page.evaluate(()=>diagnostics.isEnabled()),false);
  const disabledCount=await page.evaluate(()=>diagnostics.list().length);
  await page.evaluate(async marker=>{const {withAllocation}=await import('./src/runtime/memory-diagnostics.js');diagnostics.record(withAllocation(new Error(marker),{operation:'save-import',reason:'malloc-null',requestedBytes:3,memoryBytesBefore:128}),'handled');},marker);
  assert.equal(await page.evaluate(()=>diagnostics.list().length),disabledCount,'Opt-out suppresses additional records');
  const disabledExport=await exportReport();assert.equal(disabledExport.reports.length,disabledCount,'Opt-out leaves existing records exportable');
  await page.reload();await page.evaluate(async()=>{window.diagnostics=(await import('./src/diagnostics.js')).diagnostics;});assert.equal(await page.evaluate(()=>diagnostics.isEnabled()),false,'Opt-out survives reload');
  await page.locator('[data-tab=settings]').click();await page.locator('[data-action=diagnostics]').click();
  await page.locator('#diagnostics-clear').click();await page.waitForFunction(()=>diagnostics.list().length===0);
  assert.equal(await page.locator('#diagnostics-enabled').isChecked(),false);assert.deepEqual((await exportReport()).reports,[],'Zero records export while collection remains disabled');
  const preserved=await page.evaluate(async({id,marker})=>{const db=await import('./src/storage/storage.js');return {rom:[...await db.get('roms',id)],save:[...(await db.get('saves',id)).bytes],name:(await db.get('library',id)).name,unrelated:localStorage.getItem('diagnostic-unrelated'),enabled:diagnostics.isEnabled()};},{id:canaries.id,marker});
  assert.deepEqual(preserved,{rom:[41,42,43,44],save:[7,9,13],name:marker,unrelated:marker,enabled:false});
  assert.equal(await page.evaluate(()=>diagnosticConnections),0,'Diagnostics must not open WebSocket or WebRTC connections');
  assert.ok(errors.every(text=>text.includes(marker)),'Unexpected application error: '+errors.join('; '));
  await context.close();
  // Private-mode/blocked/full localStorage must never break the game or turn a
  // failed diagnostic write into another unhandled error and recursive logging.
  for(const mode of ['blocked','quota']){
  const blocked=await browser.newContext({serviceWorkers:'block'}),probe=await blocked.newPage(),storageErrors=[];
  blocked.on('request',r=>requests.push({url:r.url(),method:r.method(),body:r.postDataBuffer()?.length||0}));
  probe.on('pageerror',e=>storageErrors.push(e.message));
  await blocked.route(base,route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Isolated diagnostics storage probe</title>'}));
  await blocked.addInitScript(mode=>{for(const method of ['getItem','setItem','removeItem']){const original=Storage.prototype[method];Storage.prototype[method]=function(key,...args){if(key==='palmo-diagnostics-v1'&&(mode==='blocked'||method==='setItem'))throw new DOMException('Synthetic unavailable storage',mode==='blocked'?'SecurityError':'QuotaExceededError');return original.call(this,key,...args);};}},mode);
  await probe.goto(base);
  const survives=await probe.evaluate(async marker=>{const {diagnostics:d}=await import('./src/diagnostics.js');d.record(new Error(marker));d.list();d.snapshot();d.clear();d.setEnabled(false);d.record(new Error(marker));return {enabled:d.isEnabled(),persistent:d.persistenceAvailable(),snapshot:d.snapshot()};},marker);
  assert.equal(survives.enabled,false);assert.equal(survives.persistent,false);privateFree(survives.snapshot);assert.deepEqual(storageErrors,[]);await blocked.close();
  }
  for(const request of requests){const url=new URL(request.url);if(['data:','blob:'].includes(url.protocol))continue;
   // Edge opens its internal download UI after the explicit local JSON export.
   if(url.protocol==='edge:')continue;
   assert.equal(url.origin,new URL(base).origin,'Unexpected network URL: '+request.url);assert.equal(url.search,'');assert.ok(['GET','HEAD'].includes(request.method));assert.equal(request.body,0);assert.ok(!request.url.includes(marker));}
  console.log('PASS: local bounded diagnostics, caught/uncaught/rejection capture, reload persistence, deduplication, poisoned-storage redaction, opt-out, safe storage failure, private-free JSON export with recording on/off and zero records, data-preserving clear, and no upload/network connection.');
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
