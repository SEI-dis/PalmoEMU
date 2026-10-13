// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic records in a fresh browser context; never use a personal profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const runtime=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[],traffic=[];
  page.on('pageerror',e=>errors.push(e.message));context.on('request',r=>traffic.push(r));
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';
  // Throw after earlier writes have been queued in the real Worker transaction.
  // Its abort must retain every previous store, including the clean marker.
  await context.route('**/src/save-worker.js?fault=*',route=>{
   const fault=new URL(route.request().url()).searchParams.get('fault');
   const injected=`const originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='recoveries')throw new DOMException('synthetic ${fault}', '${fault}');return originalPut.apply(this,args);};\n`;
   return route.fulfill({contentType:'text/javascript',body:injected+fs.readFileSync(path.join(__dirname,'../src/save-worker.js'),'utf8')});
  });
  await page.goto(base+'privacy.html');
  const result=await page.evaluate(async()=>{
   const db=await import('./src/storage.js'),{createSaveWriter}=await import('./src/save-writer.js'),{hash}=await import('./src/shared.js'),{updateTasksPending}=await import('./src/update-activity.js');
   const check=(value,message)=>{if(!value)throw Error(message);},wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
   const entry=(id,n=1,size=1048576)=>{const bytes=new Uint8Array(size).fill(n),state=new Uint8Array(size+3).fill(n+10),sessionId='owner-'+id;return {id,sessionId,save:{bytes,at:n*400000,hash:'save-'+n,coreId:'synthetic'},recovery:{bytes:state,save:bytes,at:n*400000,hash:'state-'+n,sessionId,coreId:'synthetic'},clean:false};};
   const seed=async(id,n=1)=>{await db.put('sessions',id,{id:'owner-'+id,dirty:false,canary:'keep'});await db.commitProtectionBatch([entry(id,n)]);};
   const rejected=async promise=>{try{await promise;}catch(error){return error;}throw Error('Expected rejection');};
   const realWorkers=[];
   const actualWorker=()=>{const worker=new Worker(new URL('./src/save-worker.js',location.href),{type:'module'});realWorkers.push(worker);return worker;};
   // No Worker is created for small battery saves, preserving the old path.
   let created=0;const small=createSaveWriter({createWorker:()=>{created++;throw Error('Must not create');}});
   await db.put('sessions','small',{id:'owner-small'});await small.commit(entry('small',1,8));await small.close();check(created===0,'Small entry uses main');
   await db.addGame({id:'personal-canary',system:'gba',name:'Synthetic canary'},new Uint8Array([4,5,6]));await db.put('saves','personal-canary',{bytes:new Uint8Array([7,8])});
   await db.put('sessions','real',{id:'owner-real',dirty:false,canary:'keep'});
   const writer=createSaveWriter({createWorker:actualWorker});
   const first=entry('real'),expectedSave=await hash(first.save.bytes),expectedState=await hash(first.recovery.bytes);
   await writer.commit(first);
   check(first.save.bytes===first.recovery.save&&first.save.bytes.length===1048576,'Source alias and buffers retained');
   check(await hash(first.save.bytes)===expectedSave&&await hash(first.recovery.bytes)===expectedState,'Source bytes unchanged');
   let stored=await db.get('saves','real'),recovery=(await db.get('recoveries','real'))[0];
   check(await hash(stored.bytes)===expectedSave&&await hash(recovery.bytes)===expectedState&&await hash(recovery.save)===expectedSave,'Stored bytes and paired battery are exact');
   // Concurrent calls still reach storage in order; close waits for all accepted
   // saves and reports completion only after the final session marker commits.
   const two=entry('real',2),three=entry('real',3);three.clean=true;
   const writes=[writer.commit(two),writer.commit(three)],closing=writer.close();
   await Promise.all(writes);await closing;
   check((await db.get('saves','real')).bytes[0]===3,'Queued writes preserve order');
   check((await db.get('backups','real')).map(r=>r.bytes[0]).join(',')==='2,1','Backup generations preserve order');
   check((await db.get('recoveries','real')).map(r=>r.bytes[0]).join(',')==='13,12,11','Recovery generations preserve order');
   check((await db.get('sessions','real')).dirty===false,'Clean marker committed before close');
   await rejected(writer.commit(entry('real',4)));
   // DB errors are definite aborts, not transport uncertainty, and remain in the
   // selected UI language. A following valid job can reuse the healthy Worker.
   const ownerWriter=createSaveWriter({createWorker:actualWorker}),wrong={...entry('real',4),sessionId:'wrong'};
   const ownerError=await rejected(ownerWriter.commit(wrong));
   check(ownerError.saveOutcomeUnknown===false&&ownerError.name==='Error'&&ownerError.message.includes('別のタブ'),'Worker session error keeps language and outcome');
   check((await db.get('saves','real')).bytes[0]===3,'Wrong owner cannot write');
   await ownerWriter.commit(entry('real',4));await ownerWriter.close();
   const snapshot=async id=>{
    const records=await Promise.all(['saves','backups','archives','recoveries','sessions'].map(store=>db.get(store,id)));
    return Promise.all(records.map(async record=>{if(!record)return null;const rows=Array.isArray(record)?record:[record];return Promise.all(rows.map(async row=>({...row,bytes:row.bytes?await hash(row.bytes):null,save:row.save?await hash(row.save):null})));}));
   };
   for(const fault of ['DataCloneError','QuotaExceededError']){
    const id='atomic-'+fault;await seed(id);const before=await snapshot(id),faulty=createSaveWriter({createWorker:()=>new Worker(new URL('./src/save-worker.js?fault='+fault,location.href),{type:'module'})});
    const e=await rejected(faulty.commit({...entry(id,2),clean:true}));await faulty.close();
    check(e.name===fault&&e.message==='synthetic '+fault&&e.saveOutcomeUnknown===false,fault+' is a definite abort');
    check(JSON.stringify(await snapshot(id))===JSON.stringify(before),fault+' rolls back all five stores');
   }
   // A known quota abort of an automatic checkpoint may rescue its ordinary
   // save once. Do not delete old recoveries or capture a different snapshot.
   const {SaveProtection}=await import('./src/save-safety.js');
   for(const useWorker of [false,true]){
    const id='quota-rescue-'+useWorker,statuses=[],protection=new SaveProtection(s=>statuses.push(s),{useWorker:false});
    await protection.open({id,system:'gba'},'synthetic');
    await protection.save({save:()=>new Uint8Array([1]),state:()=>new Uint8Array([11])},{checkpoint:true});
    const previousRecovery=await hash((await db.get('recoveries',id))[0].bytes),previousStateAt=protection.stateAt;
    await protection.writer.close();
    const writer=createSaveWriter({useWorker,createWorker:()=>new Worker(new URL('./src/save-worker.js?fault=QuotaExceededError',location.href),{type:'module'})});
    let commits=0,captures=0,stateCaptures=0;const entries=[],rawCommit=writer.commit;
    writer.commit=entry=>{commits++;entries.push({save:entry.save,hasRecovery:!!entry.recovery,clean:entry.clean});return rawCommit(entry);};protection.writer=writer;
    const put=IDBObjectStore.prototype.put;
    if(!useWorker)IDBObjectStore.prototype.put=function(...args){if(this.name==='recoveries')throw new DOMException('synthetic checkpoint quota','QuotaExceededError');return put.apply(this,args);};
    let failure;
    try{failure=await rejected(protection.save({save:()=>{captures++;return new Uint8Array(1048576).fill(2);},state:()=>{stateCaptures++;return new Uint8Array(1048576).fill(12);}},{checkpoint:true,clean:true,reason:'exit'}));}
    finally{IDBObjectStore.prototype.put=put;}
    check(failure.name==='QuotaExceededError'&&failure.saveCommitted===true&&failure.message.includes('ゲーム内セーブは保存しました'),'Partial success preserves quota classification and explanation');
    check(commits===2&&captures===1&&stateCaptures===1&&entries[0].save===entries[1].save,'Exactly one retry uses the same captured snapshot');
    check(entries[0].hasRecovery&&!entries[1].hasRecovery&&entries[1].clean===false,'Retry omits checkpoint and retains dirty marker');
    check((await db.get('saves',id)).bytes[0]===2&&(await db.get('saves',id)).reason==='exit','Current battery snapshot persisted');
    const histories=await db.get('backups',id),recoveries=await db.get('recoveries',id);
    check(histories.length===1&&histories[0].bytes[0]===1,'Aborted first transaction creates no duplicate history');
    check(recoveries.length===1&&await hash(recoveries[0].bytes)===previousRecovery,'Earlier checkpoint is retained unchanged');
    check((await db.get('sessions',id)).dirty&&protection.stateAt===previousStateAt&&statuses.at(-1).error.includes('ゲーム内セーブは保存しました'),'Failed checkpoint stays explicit, dirty, and does not advance its timestamp');
    await protection.close();
   }
   // A failed battery-only retry leaves all previous stores intact. Other
   // failures and ambiguous acknowledgements must never trigger quota rescue.
   for(const kind of ['quota-both','clone','unknown']){
    const id='quota-negative-'+kind,protection=new SaveProtection(()=>{},{useWorker:false});await protection.open({id,system:'gba'},'synthetic');
    await protection.save({save:()=>new Uint8Array([3]),state:()=>new Uint8Array([13])},{checkpoint:true});
    const before=await snapshot(id);let commits=0;const actual=protection.writer.commit;
    protection.writer.commit=entry=>{commits++;if(kind==='unknown'){const e=new DOMException('synthetic missing acknowledgment','QuotaExceededError');e.saveOutcomeUnknown=true;return Promise.reject(e);}return actual(entry);};
    const put=IDBObjectStore.prototype.put;
    if(kind!=='unknown')IDBObjectStore.prototype.put=function(...args){if(this.name===(kind==='clone'?'recoveries':'saves'))throw new DOMException('synthetic failure',kind==='clone'?'DataCloneError':'QuotaExceededError');return put.apply(this,args);};
    let failure;try{failure=await rejected(protection.save({save:()=>new Uint8Array([4]),state:()=>new Uint8Array([14])},{checkpoint:true,clean:true}));}finally{IDBObjectStore.prototype.put=put;}
    check(!failure.saveCommitted&&commits===(kind==='quota-both'?2:1),'No hidden success or unbounded/unsafe retries: '+kind);
    const after=await snapshot(id);check(JSON.stringify(before.slice(0,4))===JSON.stringify(after.slice(0,4)),'All saved bytes/history retained after failure: '+kind);
    if(kind==='unknown')check(failure.saveOutcomeUnknown&&protection.id!==before[4][0].id,'Unknown commit is fenced instead of replayed');
    await protection.close();
   }
   class FakeWorker{
    constructor(onPost){this.onPost=onPost;this.sent=[];this.terminated=0;}
    postMessage(message){this.sent.push({type:message.type,id:message.id});this.onPost(message,this);}
    emit(data){this.onmessage?.({data});}
    terminate(){this.terminated++;}
    ready(message){this.emit({version:1,type:'ready',id:message.id});}
    done(message){this.emit({version:1,type:'done',id:message.id});}
   }
   const fakeFactory=(onCommit,onInit=(message,fake)=>fake.ready(message))=>{
    let fake;return {createWorker:()=>fake=new FakeWorker((message,worker)=>queueMicrotask(()=>message.type==='init'?onInit(message,worker):onCommit(message,worker))),get fake(){return fake;}};
   };
   // Startup failures never receive a snapshot, so fallback can safely commit it
   // once. A writer stays on main after such a failure.
   const startupCases=['constructor','error','messageerror','malformed','timeout'];
   for(const failure of startupCases){
    const id='startup-'+failure;await db.put('sessions',id,{id:'owner-'+id});let factoryCalls=0;
    const mock=fakeFactory(()=>{throw Error('No commit may be dispatched');},(message,fake)=>{
     if(failure==='error')fake.onerror?.({preventDefault(){}});
     if(failure==='messageerror')fake.onmessageerror?.({});
     if(failure==='malformed')fake.emit({type:'ready',id:0});
    });
    const fallback=createSaveWriter({readyTimeoutMs:40,createWorker:()=>{factoryCalls++;if(failure==='constructor')throw Error('Disabled Worker');return mock.createWorker();}});
    await fallback.commit(entry(id));await fallback.commit(entry(id,2));await fallback.close();
    check(factoryCalls===1&&(await db.get('saves',id)).bytes[0]===2,failure+' fallback commits newest snapshot');
    check(!mock.fake||mock.fake.sent.every(m=>m.type==='init'),failure+' sent no snapshot to Worker');
   }
   // After dispatch, never resend the uncertain snapshot. The caller owns the
   // session fence; only a later fresh commit is allowed down the main path.
   const transportCases=['error','messageerror','malformed','future-id','timeout'];
   for(const failure of transportCases){
    const id='transport-'+failure;await seed(id);let late;
    const mock=fakeFactory((message,fake)=>{
     late=fake.onmessage;
     if(failure==='error')fake.onerror?.({preventDefault(){}});
     if(failure==='messageerror')fake.onmessageerror?.({});
     if(failure==='malformed')fake.emit(null);
     if(failure==='future-id')fake.emit({version:1,type:'done',id:message.id+1});
    });
    const fallback=createSaveWriter({createWorker:mock.createWorker,timeoutMs:40});
    const e=await rejected(fallback.commit(entry(id,2)));
    check(e.saveOutcomeUnknown===true&&mock.fake.terminated===1,failure+' terminates uncertain backend');
    check((await db.get('saves',id)).bytes[0]===1,failure+' never retries uncertain snapshot');
    // Emulate the caller's fence before another write; a late old acknowledgment
    // cannot influence the fresh main-thread operation.
    await db.put('sessions',id,{id:'new-owner'});
    late?.({data:{version:1,type:'done',id:1}});
    await fallback.commit({...entry(id,3),sessionId:'new-owner'});await fallback.close();
    check((await db.get('saves',id)).bytes[0]===3,failure+' uses main only for a later snapshot');
    check(mock.fake.sent.filter(m=>m.type==='commit').length===1,failure+' sends only one Worker job');
   }
   // A synchronous postMessage throw is known not to dispatch a save.
   const cloneMock=fakeFactory(()=>{}),cloneWriter=createSaveWriter({createWorker:()=>{
    const fake=cloneMock.createWorker(),original=fake.postMessage;fake.postMessage=function(message){if(message.type==='commit')throw new DOMException('uncloneable','DataCloneError');return original.call(this,message);};return fake;
   }});
   const cloneError=await rejected(cloneWriter.commit(entry('post-throw')));await cloneWriter.close();
   check(cloneError.name==='DataCloneError'&&cloneError.saveOutcomeUnknown===false,'Synchronous post failure is unsent');
   // A caller that enqueues another old-session save before the transport error
   // arrives cannot accidentally write it on main before completing its fence.
   await seed('queued-uncertain');
   const queuedMock=fakeFactory((message,fake)=>fake.onerror?.({preventDefault(){}}));
   const queuedWriter=createSaveWriter({createWorker:queuedMock.createWorker});
   const queuedResults=await Promise.all([queuedWriter.commit(entry('queued-uncertain',2)),queuedWriter.commit(entry('queued-uncertain',3))].map(rejected));
   check(queuedResults[0].saveOutcomeUnknown&&queuedResults[1].saveSessionRetired,'Queued old-session snapshot is refused');
   check((await db.get('saves','queued-uncertain')).bytes[0]===1,'Queued old-session snapshot never reaches main');
   await db.put('sessions','queued-uncertain',{id:'fenced-owner'});
   await queuedWriter.commit({...entry('queued-uncertain',4),sessionId:'fenced-owner'});await queuedWriter.close();
   check((await db.get('saves','queued-uncertain')).bytes[0]===4,'Fresh fenced session may proceed');
   // An older acknowledgment is ignored while another job is pending. Closing
   // cannot terminate that pending job or release the update activity guard.
   let held,secondSettled=false,closeSettled=false;
   const delayed=fakeFactory((message,fake)=>{if(message.id===1)fake.done(message);else held={message,fake};});
   const delayedWriter=createSaveWriter({createWorker:delayed.createWorker});await delayedWriter.commit(entry('fake'));
   const second=delayedWriter.commit(entry('fake',2)).then(()=>{secondSettled=true;});
   await wait(15);check(held&&updateTasksPending(),'Update blocked while Worker is pending');
   held.fake.emit({version:1,type:'done',id:1});await wait(10);check(!secondSettled,'Older acknowledgment ignored');
   const delayedClose=delayedWriter.close().then(()=>{closeSettled=true;});await wait(15);
   check(!closeSettled&&!delayed.fake.terminated&&updateTasksPending(),'Close waits without terminating a write');
   held.fake.done(held.message);await second;await delayedClose;
   check(delayed.fake.terminated===1&&!updateTasksPending(),'Close and activity settle after acknowledgment');
   // Hidden time and the immediate foreground resume do not consume the write
   // timeout. This avoids false unknown outcomes when iOS suspends a web app.
   const visibility=new EventTarget();visibility.hidden=true;let hiddenJob,hiddenSettled=false;
   const hiddenMock=fakeFactory((message,fake)=>{hiddenJob={message,fake};});
   const hiddenWriter=createSaveWriter({createWorker:hiddenMock.createWorker,timeoutMs:60,visibility,lifecycle:null});
   const hiddenSave=hiddenWriter.commit(entry('hidden')).then(()=>{hiddenSettled=true;});
   await wait(130);check(hiddenJob&&!hiddenSettled&&!hiddenMock.fake.terminated,'Hidden time does not time out');
   visibility.hidden=false;visibility.dispatchEvent(new Event('visibilitychange'));await wait(25);
   visibility.dispatchEvent(new Event('resume'));await wait(45);
   check(!hiddenSettled&&!hiddenMock.fake.terminated,'Resume grants a fresh foreground interval');
   hiddenJob.fake.done(hiddenJob.message);await hiddenSave;await hiddenWriter.close();
   check((await db.get('roms','personal-canary')).join(',')==='4,5,6'&&(await db.get('saves','personal-canary')).bytes.join(',')==='7,8','Unrelated ROM and save are unchanged');
   check(!updateTasksPending(),'All activity guards released');
   return {atomicErrors:2,startupCases:startupCases.length,transportCases:transportCases.length,actualWorkers:realWorkers.length,byteExact:true,ordered:true,close:true,hidden:true,canary:true};
  });
  assert.deepEqual(result,{atomicErrors:2,startupCases:5,transportCases:5,actualWorkers:2,byteExact:true,ordered:true,close:true,hidden:true,canary:true});
  assert.deepEqual(errors,[]);assert.ok(traffic.every(r=>r.method()==='GET'&&!r.postData()&&new URL(r.url()).origin===new URL(base).origin));
  await context.close();console.log(`PASS ${kind}: Worker byte-exact copies, ordered five-store commits, definite aborts, startup fallback, uncertain transport no retry, session handoff, stale replies, update guard, close/hidden/resume, unchanged ROM/save canary, zero uploads.`);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
