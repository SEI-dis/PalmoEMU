// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic saves/states only. Imports must never offer an older paired save
// as automatic crash recovery, while explicit history remains intact.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});try{
 const context=await browser.newContext({serviceWorkers:'block',locale:'ja-JP'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/src/storage/save-worker.js?import-reset-fault=1',route=>route.fulfill({contentType:'text/javascript',body:`const oldPut=IDBObjectStore.prototype.put;let failImport=true;IDBObjectStore.prototype.put=function(...args){if(this.name==='saves'&&failImport){failImport=false;throw new DOMException('Synthetic failed import','QuotaExceededError');}return oldPut.apply(this,args);};\n`+fs.readFileSync(path.join(__dirname,'../src/storage/save-worker.js'),'utf8')}));
 await page.goto(base+'privacy.html');
 const result=await page.evaluate(async()=>{
  const db=await import('./src/storage/storage.js'),{SaveProtection}=await import('./src/storage/save-safety.js'),{hash}=await import('./src/shared.js'),{updateTasksPending}=await import('./src/updates/update-activity.js');
  const check=(value,label)=>{if(!value)throw Error(label);},reject=async promise=>{try{await promise;}catch(error){return error;}throw Error('Expected rejection');};
  const NativeWorker=window.Worker;let workers=0,fault=false;
  window.Worker=class extends NativeWorker{constructor(url,options){const next=new URL(url);if(next.pathname.endsWith('/save-worker.js')){workers++;if(fault)next.searchParams.set('import-reset-fault','1');}super(next,options);}};
  const inspected=['saves','backups','archives','recoveries','sessions'];
  const snapshot=async key=>JSON.stringify(await Promise.all(inspected.map(store=>db.get(store,key))));
  const setup=async(id,{useWorker,alternative=false}={})=>{
   const game={id,name:'Synthetic '+id,system:'gba',size:4,...(alternative?{coreKey:'vba-next'}:{})},key=alternative?id+'@vba-next':id,coreId=alternative?'vba-next-web-v1':'mgba-rom64-save6-v2';
   await db.addGame(game,new Uint8Array([4,5,6,7]));const statuses=[],protection=new SaveProtection(status=>statuses.push(status),{useWorker});await protection.open(game,coreId);
   let bytes=new Uint8Array([1]);const core={save:()=>bytes,state:()=>new Uint8Array([bytes[0],42])};
   await protection.save(core,{checkpoint:true});bytes=new Uint8Array([2]);await protection.save(core,{checkpoint:true});
   const manual=(await db.get('recoveries',key))[0];await db.put('states',key+':manual',manual);
   await db.put('recoveries',id+'@link-2p',[{bytes:new Uint8Array([77]),at:1}]);
   if(alternative)await db.put('recoveries',id,[{bytes:new Uint8Array([88]),at:1}]);
   const archives=await db.get('archives',key),manualText=JSON.stringify(manual);
   return {game,key,coreId,protection,statuses,core,setBytes:value=>{bytes=value;},archives,manualText};
  };
  const reports=[];
  try{
   for(const [label,useWorker,alternative,size]of [['main',false,true,8],['worker',true,false,1048576]]){
    const value=await setup('import-'+label,{useWorker,alternative}),{game,key,coreId,protection,core}=value,workerBefore=workers;
    const originalArchiveHashes=value.archives.map(record=>record.hash);value.setBytes(new Uint8Array(size).fill(9));
    await protection.save(core,{reason:'import',resetRecovery:true,clean:true});
    const saved=await db.get('saves',key),backups=await db.get('backups',key),archives=await db.get('archives',key);
    check(saved.bytes.length===size&&saved.bytes[0]===9&&saved.hash===await hash(saved.bytes),'Imported bytes and hash commit');
    check(!await db.has('recoveries',key),'Previous automatic states are invalidated');
    check(protection.stateAt===0&&value.statuses.at(-1).stateAt===0,'Recovery scheduling and status reset');
    check(backups.some(record=>record.bytes[0]===2)&&backups.some(record=>record.bytes[0]===1),'Old battery saves are retained');
    check(originalArchiveHashes.every(hash=>archives.some(record=>record.hash===hash)),'Archive history retained');
    check(JSON.stringify(await db.get('states',key+':manual'))===value.manualText,'Manual states retained unchanged');
    check((await db.get('recoveries',game.id+'@link-2p'))[0].bytes[0]===77,'Local 2P recovery untouched');
    if(alternative)check((await db.get('recoveries',game.id))[0].bytes[0]===88,'Other core recovery untouched');
    check(workers-workerBefore===(useWorker?1:0),'Expected real writer route');
    await protection.close();let opened=await protection.open(game,coreId);
    check(!opened.interrupted&&opened.recoveries.length===0&&opened.save.bytes[0]===9,'Clean import reopens from imported save');
    // Opening marks a dirty session. Closing without a clean save simulates
    // an interruption before the first checkpoint after an imported save.
    await protection.close();opened=await protection.open(game,coreId);
    check(opened.interrupted&&opened.recoveries.length===0&&opened.save.bytes[0]===9,'A later crash cannot revive a pre-import state');
    await protection.save(core,{checkpoint:true});const fresh=await db.get('recoveries',key);
    check(fresh.length===1&&fresh[0].save[0]===9,'Next checkpoint starts a new automatic history');await protection.close();reports.push(label+' import / reopen / interrupted reopen');
   }
   for(const useWorker of [false,true]){
    const value=await setup('failed-'+(useWorker?'worker':'main'),{useWorker}),{key,protection,core}=value,before=await snapshot(key),stateAt=protection.stateAt;
    value.setBytes(new Uint8Array(useWorker?1048576:8).fill(11));const original=IDBObjectStore.prototype.put;
    if(useWorker)fault=true;else IDBObjectStore.prototype.put=function(...args){if(this.name==='saves')throw new DOMException('Synthetic failed import','QuotaExceededError');return original.apply(this,args);};
    let failure;try{failure=await reject(protection.save(core,{reason:'import',resetRecovery:true,clean:true}));}finally{fault=false;IDBObjectStore.prototype.put=original;}
    check(failure.name==='QuotaExceededError'&&before===await snapshot(key),'Failed import rolls back save, recovery deletion, histories and session');
    check(protection.stateAt===stateAt&&value.statuses.at(-1).stateAt===stateAt,'Failed import keeps recovery status');
    await reject(db.commitProtectionBatch([{id:key,sessionId:'wrong-owner',save:{bytes:new Uint8Array([12])},resetRecovery:true}]));check(before===await snapshot(key),'Stale owner cannot clear recovery');
    value.setBytes(null);await reject(protection.save(core,{reason:'import',resetRecovery:true}));check(before===await snapshot(key),'Empty import cannot clear recovery');
    value.setBytes(new Uint8Array(useWorker?1048576:8).fill(13));await protection.save(core,{reason:'import',resetRecovery:true});
    check(!await db.has('recoveries',key)&&(await db.get('saves',key)).bytes[0]===13,'Failed import permits safe retry');await protection.close();reports.push((useWorker?'worker':'main')+' atomic failure / stale owner / empty / retry');
   }
   check(!updateTasksPending(),'Storage activity barrier released');return {reports,workers};
  }finally{window.Worker=NativeWorker;}
 });
 assert.ok(result.workers>=2);assert.deepEqual(errors,[]);for(const report of result.reports)console.log('PASS '+kind+': '+report);await context.close();
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
