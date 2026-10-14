// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict');
const {chromium}=require('./browser-runtime.cjs');
(async()=>{const b=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});try{
 const c=await b.newContext(),p=await c.newPage(),base=process.env.TEST_URL||'http://127.0.0.1:4173/';let traffic=[];
 c.on('request',r=>traffic.push(r));await p.goto(base+'privacy.html');
 // Preserve a version-1 database through the real upgrade, never touching a user's profile.
 await p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('manicemu-web',1);r.onupgradeneeded=()=>{for(const s of ['library','roms','saves','states'])r.result.createObjectStore(s);};r.onsuccess=()=>{const d=r.result,t=d.transaction('saves','readwrite');t.objectStore('saves').put({bytes:new Uint8Array([90]),at:1},'legacy');t.oncomplete=()=>{d.close();resolve();};};r.onerror=()=>reject(r.error);}));
 const result=await p.evaluate(async()=>{
  const db=await import('./src/storage/storage.js'),{SaveProtection}=await import('./src/storage/save-safety.js');window.db=db;window.statuses=[];window.s=new SaveProtection(v=>statuses.push(v));await s.open({id:'test',system:'gba'},'mgba-rom64-link-v1');
  window.n=0;window.core={save:()=>new Uint8Array([n]),state:()=>new Uint8Array([n,42]),restore:v=>{window.restoredSave=[...v];},loadState:v=>{window.restoredState=[...v];}};
  for(n=0;n<8;n++)await s.save(core,{checkpoint:true});n=7;await s.save(core);const backups=await db.get('backups','test'),states=await db.get('recoveries','test');
  await s.restoreState(core,states[0]);let corrupt=false;try{await s.restoreState(core,{...states[0],bytes:new Uint8Array([88])});}catch{corrupt=true;}
  const before=await db.get('saves','test');let aborted=false;try{await db.commitProtection('test','wrong-owner',{bytes:new Uint8Array([77])},null);}catch{aborted=true;}
  return {legacy:[...(await db.get('saves','legacy')).bytes],history:backups.map(r=>r.bytes[0]),states:states.map(r=>r.bytes[0]),restoredState,restoredSave,corrupt,aborted,unchanged:before.hash===(await db.get('saves','test')).hash};
 });
 assert.deepEqual(result,{legacy:[90],history:[6,5,4,3,2],states:[7,6,5,4,3],restoredState:[7,42],restoredSave:[7],corrupt:true,aborted:true,unchanged:true});
 const asynchronous=await p.evaluate(async()=>{
  const {SaveProtection}=await import('./src/storage/save-safety.js');const p=new SaveProtection(()=>{});await p.open({id:'async-checkpoint',system:'gba'},'mgba-rom64-link-v1');
  const core={save:async()=>{throw Error('Must use paired worker snapshot');},state:async()=>{throw Error('Must use paired worker snapshot');},checkpoint:async()=>({save:new Uint8Array([4]),state:new Uint8Array([5]),stateError:null})};
  await p.save(core,{checkpoint:true});let failed=false;core.checkpoint=async()=>({save:new Uint8Array([6]),state:null,stateError:'state unavailable'});
  try{await p.save(core,{checkpoint:true});}catch{failed=true;}
  const d=await import('./src/storage/storage.js'),save=await d.get('saves','async-checkpoint'),states=await d.get('recoveries','async-checkpoint');await p.close();
  return {failed,save:[...save.bytes],pairedSave:[...states[0].save],state:[...states[0].bytes]};
 });assert.deepEqual(asynchronous,{failed:true,save:[6],pairedSave:[4],state:[5]});
 assert.deepEqual(await p.evaluate(async()=>{const {compatibleState:c}=await import('./src/core/core-registry.js');return [c('mgba-rom64-save6-v2',{coreId:'mgba-rom64-link-v1'}),c('mgba-rom64-save6-v2',{}),c('mgba-rom64-link-v1',{coreId:'mgba-rom64-save6-v2'}),c('mgba-rom64-save6-v2',{coreId:'unknown'})];}),[true,true,false,false]);
 const p2=await c.newPage();await p2.goto(base+'privacy.html');assert.equal(await p2.evaluate(async()=>{const {SaveProtection}=await import('./src/storage/save-safety.js');window.s2=new SaveProtection(()=>{});try{await s2.open({id:'test',system:'gba'},'mgba-rom64-link-v1');return false;}catch{return true;}}),true);
 const failure=await p.evaluate(async()=>{const old=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(names,mode,...args){if(mode==='readwrite')throw new DOMException('simulated full disk','QuotaExceededError');return old.call(this,names,mode,...args);};n=33;try{await s.save(core,{checkpoint:true});}catch{}finally{IDBDatabase.prototype.transaction=old;}return {error:statuses.at(-1).error,save:[...(await db.get('saves','test')).bytes],history:(await db.get('backups','test')).length};});assert.match(failure.error,/容量/);assert.deepEqual(failure.save,[7]);assert.equal(failure.history,5);
 // Closing without clean exit releases the lock but preserves the abnormal-exit marker.
 // Use an actual queued acquisition as the release barrier; query() is only a snapshot.
 await p.close();await p2.evaluate(()=>navigator.locks.request('local-game:test',{signal:AbortSignal.timeout(10000)},()=>{}));const recovery=await p2.evaluate(async()=>{const x=await s2.open({id:'test',system:'gba'},'mgba-rom64-link-v1');let restoredState,restoredSave;await s2.restoreState({loadState:v=>{restoredState=[...v];},restore:v=>{restoredSave=[...v];}},x.recoveries.at(-1));return {interrupted:x.interrupted,states:x.recoveries.map(r=>r.bytes[0]),restoredState,restoredSave};});assert.deepEqual(recovery,{interrupted:true,states:[7,6,5,4,3],restoredState:[3,42],restoredSave:[3]});
 await p2.evaluate(async()=>{await s2.save({save:()=>new Uint8Array([7]),state:()=>new Uint8Array([7,42])},{checkpoint:true,clean:true});await s2.close();});
 const clean=await p2.evaluate(async()=>{const v=await s2.open({id:'test',system:'gba'},'mgba-rom64-link-v1');await s2.close();return v.interrupted;});assert.equal(clean,false);
 await p2.evaluate(async()=>{for(let i=0;i<5;i++){await s2.open({id:'lock-cycle',system:'gba'},'mgba-rom64-link-v1');await s2.close();}});
 const linkResult=await p2.evaluate(async()=>{
  const {SaveProtection}=await import('./src/storage/save-safety.js'),{LinkSafety}=await import('./src/link/link-safety.js'),db=await import('./src/storage/storage.js');
  const protection=new SaveProtection(()=>{});await protection.open({id:'link-test',system:'gba'},'mgba-rom64-link-v1');
  let battery=1,ram=10;const core={pause:()=>{},save:()=>new Uint8Array([battery]),state:()=>new Uint8Array([ram]),restore:b=>{battery=b[0];},loadState:b=>{ram=b[0];}};
  const safety=new LinkSafety(protection,core);await safety.begin();battery=9;ram=90;await safety.finish(false);
  const rollback=[battery,ram,(await db.get('saves','link-test')).bytes[0]];
  await safety.begin();battery=2;ram=20;await safety.finish(true);const commit=[battery,ram,(await db.get('saves','link-test')).bytes[0]];
  const old=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(names,mode,...args){if(mode==='readwrite')throw new DOMException('test quota','QuotaExceededError');return old.call(this,names,mode,...args);};
  let blocked=false;try{await new LinkSafety(protection,core).begin();}catch{blocked=true;}finally{IDBDatabase.prototype.transaction=old;}
  await protection.close();return {rollback,commit,blocked};
 });assert.deepEqual(linkResult,{rollback:[1,10,1],commit:[2,20,2],blocked:true});
 console.log('PASS: link backup durability, paired state/save rollback, normal result commit and refusal when backup cannot be stored.');
 assert.ok(traffic.every(r=>new URL(r.url()).origin===new URL(base).origin&&r.method()==='GET'&&!r.postData()));
 console.log('PASS: v1 migration, 5 changed generations, 5 states, oldest retained state recovery, paired recovery, corruption rejection, atomic owner failure, quota failure, cross-tab lock, crash recovery, clean exit, zero uploads.');await c.close();
 }finally{await b.close();}})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
