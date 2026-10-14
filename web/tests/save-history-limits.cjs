// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic byte arrays in isolated storage; never touches a user profile.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),traffic=[],errors=[];
  context.on('request',r=>traffic.push(r));page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';await page.goto(base+'privacy.html');
  const result=await page.evaluate(async()=>{
   const db=await import('./src/storage/storage.js'),{SaveProtection}=await import('./src/storage/save-safety.js'),{historyByteLimit,historyRecordBytes}=await import('./src/storage/save-history.js');
   const check=(v,message)=>{if(!v)throw Error(message);};
   // Battery histories can also exceed a single IndexedDB value's limit. Keep
   // the newest values within the budget, with unchanged max-count semantics.
   await db.put('sessions','large-battery',{id:'owner'});
   const battery=new Uint8Array(32*1048576);
   for(let i=0;i<6;i++){
    battery[0]=i;
    await db.commitProtection('large-battery','owner',{bytes:battery,at:i*300000+1,hash:String(i)},null);
   }
   const batteryValues=await db.get('backups','large-battery'),archives=await db.get('archives','large-battery');
   check(batteryValues.map(r=>r.bytes[0]).join()==='4,3','Newest battery history retained');
   check(archives.map(r=>r.bytes[0]).join()==='5,4','Newest spaced archive retained');
   check([batteryValues,archives].every(rows=>rows.reduce((n,r)=>n+historyRecordBytes(r),0)<=historyByteLimit),'Each history is bounded');
   // A large indivisible battery save accepted by a development core must not
   // make history retention block the next save, including a smaller one.
   await db.put('sessions','single-large-battery',{id:'owner'});
   const largeBattery=new Uint8Array(100*1048576);largeBattery[0]=7;
   await db.commitProtection('single-large-battery','owner',{bytes:largeBattery,at:1,hash:'7'},null);
   await db.commitProtection('single-large-battery','owner',{bytes:new Uint8Array([8]),at:300001,hash:'8'},null);
   check((await db.get('saves','single-large-battery')).bytes[0]===8,'New smaller battery saved');
   const singleOld=await db.get('backups','single-large-battery');
   check(singleOld.length===1&&singleOld[0].bytes.length===100*1048576&&singleOld[0].bytes[0]===7,'Previous large battery retained intact');
   // A synchronous failure in an IndexedDB success callback must retain its
   // actual error, roll back all writes, and not escape as a page exception.
   for(const id of ['atomic-one','atomic-two']){
    await db.put('sessions',id,{id:'owner',dirty:false});
    await db.commitProtection(id,'owner',{bytes:new Uint8Array([1]),at:1,hash:'1'},{bytes:new Uint8Array([11]),save:new Uint8Array([1]),at:1},true);
   }
   const snapshot=async id=>JSON.stringify(await Promise.all(['saves','backups','archives','recoveries','sessions'].map(name=>db.get(name,id))));
   const before=await Promise.all(['atomic-one','atomic-two'].map(snapshot)),original=IDBObjectStore.prototype.put;
   let caught;
   IDBObjectStore.prototype.put=function(value,key){if(this.name==='recoveries'&&key==='atomic-two')throw new DOMException('Synthetic write failure','QuotaExceededError');return original.call(this,value,key);};
   try{await db.commitProtectionBatch(['atomic-one','atomic-two'].map(id=>({id,sessionId:'owner',save:{bytes:new Uint8Array([2]),at:300001,hash:'2'},recovery:{bytes:new Uint8Array([22]),save:new Uint8Array([2]),at:300001}})));}
   catch(e){caught=e.name;}finally{IDBObjectStore.prototype.put=original;}
   check(caught==='QuotaExceededError','Original synchronous error retained');
   check(JSON.stringify(before)===JSON.stringify(await Promise.all(['atomic-one','atomic-two'].map(snapshot))),'Both players rollback atomically');
   // One unsupported oversized state must not block battery saving or replace
   // the previous usable state. A subsequent normal checkpoint still works.
   const statuses=[],protection=new SaveProtection(status=>statuses.push(status));await protection.open({id:'oversized-state',system:'gba'},'mgba-rom64-save6-v2');
   await protection.save({save:()=>new Uint8Array([1]),state:()=>new Uint8Array([11])},{checkpoint:true});
   const oldState=(await db.get('recoveries','oversized-state'))[0];let stateFailure;
   try{await protection.save({save:()=>new Uint8Array([2]),state:()=>new Uint8Array(historyByteLimit)},{checkpoint:true,clean:true});}catch(e){stateFailure=e.message;}
   check(stateFailure?.includes('ゲーム内セーブは保存しました'),'Partial checkpoint failure is explicit');
   check((await db.get('saves','oversized-state')).bytes[0]===2,'Battery saved despite oversized state');
   check((await db.get('recoveries','oversized-state')).length===1&&(await db.get('recoveries','oversized-state'))[0].hash===oldState.hash,'Previous recovery preserved');
   check((await db.get('sessions','oversized-state')).dirty,'Recovery failure leaves dirty marker');
   await protection.save({save:()=>new Uint8Array([3]),state:()=>new Uint8Array([33])},{checkpoint:true,clean:true});await protection.close();
   check(!(await db.get('sessions','oversized-state')).dirty,'Normal saving recovers after failure');
   check((await db.get('saves','oversized-state')).bytes[0]===3,'Normal battery save resumes');
   return {budgetMiB:historyByteLimit/1048576,backups:batteryValues.length,archives:archives.length,atomic:true,oversizedFallback:true};
  });
  assert.deepEqual(result,{budgetMiB:96,backups:2,archives:2,atomic:true,oversizedFallback:true});
  assert.deepEqual(errors,[]);assert.ok(traffic.every(r=>r.method()==='GET'&&!r.postData()&&new URL(r.url()).origin===new URL(base).origin));
  await context.close();console.log(`PASS ${kind}: byte-bounded battery histories, synchronous write failure preserves both players, oversized state preserves battery/old recovery, later saves recover, zero uploads.`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
