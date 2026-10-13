// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic snapshots and isolated storage; exercise ownership, not real ROMs.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[],traffic=[];
  page.on('pageerror',e=>errors.push(e.message));context.on('request',r=>traffic.push(r));
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';await page.goto(base+'privacy.html');
  const result=await page.evaluate(async()=>{
   const db=await import('./src/storage.js'),{SaveProtection}=await import('./src/save-safety.js'),{createSaveWriter}=await import('./src/save-writer.js'),{updateTasksPending}=await import('./src/update-activity.js');
   const check=(v,message)=>{if(!v)throw Error(message);},coreId='mgba-rom64-save6-v2',tick=()=>new Promise(resolve=>setTimeout(resolve,0));
   const wait=async fn=>{for(let i=0;i<1000;i++){if(fn())return;await tick();}throw Error('Timed out waiting for synthetic save stage');};
   const rejected=async promise=>{try{await promise;}catch(error){return error;}throw Error('Expected rejection');};
   const available=id=>navigator.locks.request('local-game:'+id,{ifAvailable:true},lock=>!!lock);
   const open=async id=>{const protection=new SaveProtection(()=>{});await protection.open({id,system:'gba'},coreId);return protection;};
   const fake=async(protection,commit)=>{await protection.writer.close();let closed=0;protection.writer={commit,close:async()=>{closed++;}};return()=>closed;};
   const unknown=()=>Object.assign(Error('synthetic lost acknowledgement'),{saveOutcomeUnknown:true});
   const holdSessions=async()=>{
    const connection=await new Promise((resolve,reject)=>{const r=indexedDB.open('manicemu-web');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    let release=false;const tx=connection.transaction('sessions','readwrite'),store=tx.objectStore('sessions');
    const finished=new Promise((resolve,reject)=>{tx.oncomplete=()=>{connection.close();resolve();};tx.onabort=()=>reject(tx.error);});
    function pump(){const request=store.get('synthetic-fence-hold');request.onsuccess=()=>{if(!release)pump();};}pump();
    return {release(){release=true;},finished};
   };

   // The fence only rotates its expected owner, preserves metadata, and returns
   // after completion. Every late old-owner transaction must abort atomically.
   await db.put('sessions','rotation',{id:'original',dirty:false,startedAt:123,coreId,custom:'preserved'});
   await db.put('saves','rotation',{bytes:new Uint8Array([1]),at:1});
   const next=await db.rotateSaveSession('rotation','original'),session=await db.get('sessions','rotation');
   check(next!== 'original'&&session.id===next&&session.dirty&&session.startedAt===123&&session.custom==='preserved','Rotation commits and preserves metadata');
   await rejected(db.rotateSaveSession('rotation','original'));
   await rejected(db.commitProtection('rotation','original',{bytes:new Uint8Array([99]),at:2},{bytes:new Uint8Array([99]),at:2},true));
   check((await db.get('saves','rotation')).bytes[0]===1&&!await db.has('recoveries','rotation')&&(await db.get('sessions','rotation')).id===next,'Late old owner cannot write any store');

   // Drive the actual writer transport through commit-success/acknowledgment-
   // loss. It must terminate before the fence, then use main for a queued fresh
   // snapshot. The ambiguous first snapshot is never submitted a second time.
   const queued=await open('queued-fence'),oldId=queued.id;let terminated=0,dispatches=0,captures=0,oldEntry;
   await queued.writer.close();
   const worker={onmessage:null,onerror:null,onmessageerror:null,terminate(){terminated++;},postMessage(message){
    if(message.type==='init'){queueMicrotask(()=>this.onmessage?.({data:{version:1,type:'ready',id:0}}));return;}
    dispatches++;oldEntry=message.entry;
    db.commitProtectionBatch([message.entry]).then(()=>this.onerror?.({preventDefault(){}}));
   }};
   queued.writer=createSaveWriter({createWorker:()=>worker});
   const core={save:()=>{captures++;const bytes=new Uint8Array(1048576);bytes[0]=10+captures;return bytes;},state:()=>new Uint8Array([captures,42])};
   const first=queued.save(core,{checkpoint:true}).catch(error=>error),second=queued.save(core,{checkpoint:true});
   const firstError=await first;await second;
   check(firstError.saveOutcomeUnknown&&terminated===1&&dispatches===1&&captures===2&&queued.id!==oldId,'Unknown result terminates once, rotates, reports error, and keeps queued fresh save');
   const newest=await db.get('saves','queued-fence'),recoveries=await db.get('recoveries','queued-fence');
   check(newest.bytes[0]===12&&recoveries.length===2&&recoveries[0].sessionId===queued.id&&recoveries[1].sessionId===oldId,'Queued recovery uses rotated ID and preserves committed old snapshot');
   await rejected(db.commitProtectionBatch([oldEntry]));check((await db.get('saves','queued-fence')).bytes[0]===12,'Late replay remains rejected');
   await queued.close();check(!updateTasksPending()&&await available('queued-fence'),'Resolved close releases activity and lock');

   // A delayed real IndexedDB fence holds update protection and the Web Lock.
   // close must wait; accepting a new save after close started is forbidden.
   const delayed=await open('delayed-fence');let holder,closingDone=false;
   const writerClosed=await fake(delayed,async()=>{holder=await holdSessions();throw unknown();});
   const delayedSave=delayed.save({save:()=>new Uint8Array([8])}).catch(error=>error);
   await wait(()=>!!delayed.fence);
   const delayedClose=delayed.close().then(()=>{closingDone=true;});
   await rejected(delayed.save({save:()=>{throw Error('Late capture must not run');}}));
   check(updateTasksPending()&&!closingDone&&!writerClosed()&&!await available('delayed-fence'),'Unresolved transaction blocks close, updates, and other tabs');
   holder.release();await holder.finished;check((await delayedSave).saveOutcomeUnknown,'Original transport error surfaces after delayed fence');await delayedClose;
   check(writerClosed()===1&&!updateTasksPending()&&await available('delayed-fence'),'Lock and writer released only after completed fence');

   // Synchronous put failure must abort the fence. Neither another save nor
   // close may discard it, release the lock, or capture/write another snapshot.
   const stuck=await open('failed-fence'),stuckId=stuck.id;await db.put('saves','failed-fence',{bytes:new Uint8Array([4]),at:1});
   let stuckCaptures=0,stuckCommits=0;const stuckClosed=await fake(stuck,async()=>{stuckCommits++;throw unknown();});
   const put=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(...args){if(this.name==='sessions')throw new DOMException('synthetic fence disk full','QuotaExceededError');return put.apply(this,args);};
   try{
    const failure=await rejected(stuck.save({save:()=>{stuckCaptures++;return new Uint8Array([5]);}}));
    check(failure.saveOutcomeUnknown&&failure.fenceError?.name==='QuotaExceededError'&&stuck.fence&&stuck.id===stuckId,'Failed fence keeps original ownership and explicit unresolved state');
    await rejected(stuck.save({save:()=>{stuckCaptures++;return new Uint8Array([6]);}}));
    await rejected(stuck.close());
    check(stuckCaptures===1&&stuckCommits===1&&!stuckClosed()&&updateTasksPending()&&!await available('failed-fence'),'Retries cannot capture/write or release protection before fence succeeds');
    check((await db.get('saves','failed-fence')).bytes[0]===4&&(await db.get('sessions','failed-fence')).id===stuckId,'Failed fence leaves original save and session unchanged');
   }finally{IDBObjectStore.prototype.put=put;}
   await stuck.close();check(!stuck.fence&&!updateTasksPending()&&stuckClosed()===1&&await available('failed-fence'),'A later close retries and completes the fence');
   const generation=stuck.openGeneration;await stuck.open({id:'failed-fence',system:'gba'},coreId);
   check(stuck.openGeneration!==generation&&stuck.id!==stuckId,'Reopening same ROM uses a distinct generation and session');await stuck.save({save:()=>new Uint8Array([7])});await stuck.close();

   // A next save can also recover a failed fence without replaying the failed
   // bytes. Known atomic failures do not rotate an otherwise valid owner.
   const retry=await open('save-retry'),retryId=retry.id;let attempts=0,retryCaptures=0;
   await fake(retry,async entry=>{if(!attempts++){throw unknown();}return db.commitProtectionBatch([entry]);});
   IDBObjectStore.prototype.put=function(...args){if(this.name==='sessions')throw Error('synthetic fence retry');return put.apply(this,args);};
   try{await rejected(retry.save({save:()=>{retryCaptures++;return new Uint8Array([1]);}}));}finally{IDBObjectStore.prototype.put=put;}
   await retry.save({save:()=>{retryCaptures++;return new Uint8Array([2]);}});
   check(retry.id!==retryId&&retryCaptures===2&&attempts===2&&(await db.get('saves','save-retry')).bytes[0]===2&&!await db.has('backups','save-retry'),'Next save fences first and captures only its fresh snapshot');
   const knownId=retry.id;await fake(retry,async()=>{throw Object.assign(Error('known atomic abort'),{saveOutcomeUnknown:false});});
   await rejected(retry.save({save:()=>new Uint8Array([3])}));check(retry.id===knownId&&!retry.fence,'Known failure leaves session stable');await retry.close();

   // A temporary non-playing import has no later UI retry owner. Its explicit
   // main mode must never create a Worker, even for a large battery, and a known
   // aborted transaction must permit close to release the lock immediately.
   const main=new SaveProtection(()=>{},{useWorker:false});await main.open({id:'temporary-main',system:'gba'},coreId);
   const NativeWorker=globalThis.Worker;let workerStarts=0;
   globalThis.Worker=class{constructor(){workerStarts++;throw Error('Worker must not be created');}};
   try{
    const bytes=new Uint8Array(2*1048576);bytes[0]=31;await main.save({save:()=>bytes},{clean:true});
    const mainId=main.id;
    IDBObjectStore.prototype.put=function(...args){if(this.name==='saves')throw new DOMException('synthetic import quota','QuotaExceededError');return put.apply(this,args);};
    let failure;try{bytes[0]=32;failure=await rejected(main.save({save:()=>bytes},{clean:true}));}finally{IDBObjectStore.prototype.put=put;}
    check(!workerStarts&&failure.name==='QuotaExceededError'&&!failure.saveOutcomeUnknown&&!main.fence&&main.id===mainId,'Main-only large save has a known atomic failure');
    check((await db.get('saves','temporary-main')).bytes[0]===31,'Failed temporary import preserves the preceding large save');
    await main.close();check(!updateTasksPending()&&await available('temporary-main'),'Temporary import can close after failure without orphaning a lock');
   }finally{globalThis.Worker=NativeWorker;}

   const opening=new SaveProtection(()=>{}),openingPromise=opening.open({id:'open-close',system:'gba'},coreId),closingPromise=opening.close();
   await openingPromise;await closingPromise;await rejected(opening.save({save:()=>new Uint8Array([1])}));
   check(!opening.game&&!opening.accepting&&await available('open-close'),'Close during opening waits and leaves no orphan owner');
   check(!updateTasksPending(),'All activity holds released after successful resolution');
   return {rotation:true,queued:true,delayed:true,failed:true,retry:true,known:true,mainOnly:true,lifecycle:true};
  });
  assert.deepEqual(result,{rotation:true,queued:true,delayed:true,failed:true,retry:true,known:true,mainOnly:true,lifecycle:true});assert.deepEqual(errors,[]);
  assert.ok(traffic.every(r=>r.method()==='GET'&&!r.postData()&&new URL(r.url()).origin===new URL(base).origin));
  await context.close();console.log(`PASS ${kind}: atomic session fence, lost acknowledgement, no replay, queued fresh saves, held lock/update guard, failed-fence retry, known abort, large main-only temporary save, close/open lifecycle; zero uploads.`);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
