// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic saves only. Allocation totals are cumulative, not heap/RSS peaks.
const assert=require('node:assert/strict');
const {fixture35,hash}=require('./helpers/start-save-fixtures.cjs');
function measure(input,action){
 const Native=Uint8Array,slice=Native.prototype.slice,from=Native.from,large=[];let inputCopies=0;
 const record=bytes=>{if(bytes.byteLength>=1048576)large.push(bytes.byteLength);};
 const Wrapped=new Proxy(Native,{
  construct(target,args){const out=Reflect.construct(target,args,target);if(!(args[0] instanceof ArrayBuffer)&&!(typeof SharedArrayBuffer!=='undefined'&&args[0] instanceof SharedArrayBuffer))record(out);return out;},
  get(target,key){if(key==='from')return(value,...args)=>{if(value===input)inputCopies++;return Reflect.apply(from,Wrapped,[value,...args]);};return Reflect.get(target,key);},
 });
 globalThis.Uint8Array=Wrapped;
 Native.prototype.slice=function(...args){const out=slice.apply(this,args);record(out);return out;};
 try{const result=action();return {result,inputCopies,largeAllocations:large.length,allocatedMiB:large.reduce((n,size)=>n+size,0)/1048576};}
 finally{globalThis.Uint8Array=Native;Native.prototype.slice=slice;}
}
(async()=>{
 const api=await import('../src/start-save/migration.js');
 const target={version:'0.50.0',minimumSaveVersion:'0.36.2',saveFormat:'L'};
 const old=fixture35({stamp:0x3100,second:true}),originalHash=hash(old);
 const converted=await api.migrateStartSave(old,{from:'0.49.0',target});
 const wideTarget={version:'0.54.0',minimumSaveVersion:'0.36.2',saveFormat:'W'},wide=await api.migrateStartSave(converted.bytes,{from:'0.50.0',target:wideTarget});
 const {convertFormatSave}=await import('../src/start-save/format-l.js');
 const wide16=await convertFormatSave(wide.bytes,{to:'W',storageLayout:2});
 const allocationResults=[];
 for(const [version,bytes] of [['0.49.0',old],['0.50.0',converted.bytes],['0.53.0',wide.bytes],['0.53.0',wide16.bytes]]){
  const padded=new Uint8Array(bytes.length+32).fill(0xac);padded.set(bytes,16);
  const input=padded.subarray(16,-16),before=hash(padded);
  const operations={detect:()=>api.detectStartSaveVersion(input),inspect:()=>api.inspectStartSave(input,version),update:()=>api.inspectStartUpdate(input,version,target)};
  for(const [name,operation] of Object.entries(operations)){
   const measured=measure(input,operation);
   const isolated=Uint8Array.from(input).buffer;
   const expected=name==='detect'?api.detectStartSaveVersion(isolated):name==='inspect'?api.inspectStartSave(isolated,version):api.inspectStartUpdate(isolated,version,target);
   assert.deepEqual(measured.result,expected,`${version} ${name}: offset view and isolated input produce identical results`);
   assert.equal(hash(padded),before,`${version} ${name}: every input byte, both slots and RTC remain unchanged`);
   assert.equal(measured.inputCopies,0,`${version} ${name}: synchronous inspection must not duplicate the whole ordinary input`);
   if(version!=='0.49.0')assert.ok(measured.largeAllocations<=2,`${name}: Modern inspection uses slot working copies, not a full save snapshot`);
   if(bytes.length>16000000)allocationResults.push({name,inputMiB:Number((bytes.length/1048576).toFixed(2)),inputCopies:measured.inputCopies,allocatedMiB:Number(measured.allocatedMiB.toFixed(2))});
   if(version==='0.49.0'&&name!=='inspect'){
    // Baseline before the borrowed read-only view: detect 17 / 102.34 MiB,
    // update 46 / 277.03 MiB. Keep at least the removed full input allocation.
    assert.ok(measured.largeAllocations<=(name==='detect'?16:45),`${name}: full-save allocation regression`);
    allocationResults.push({name,largeAllocations:measured.largeAllocations,cumulativeMiB:Number(measured.allocatedMiB.toFixed(2))});
   }
  }
  assert.throws(()=>api.inspectStartSave(input,version==='0.49.0'?'0.40.0':'0.49.0'),{code:'START_MISMATCH'});
  assert.equal(hash(padded),before,'Failed source-version validation also preserves the original');
  if(typeof SharedArrayBuffer!=='undefined'){
   const shared=new Uint8Array(new SharedArrayBuffer(bytes.length));shared.set(bytes);
   const checked=measure(shared,()=>api.inspectStartUpdate(shared,version,target));
   assert.equal(checked.inputCopies,1,'Shared memory still receives a defensive inspection snapshot');
   assert.deepEqual(checked.result,api.inspectStartUpdate(bytes,version,target));assert.equal(hash(shared),hash(bytes));
  }
 }
 for(const [from,source,destination] of [
  ['0.49.0',old,target],
  ['0.50.0',converted.bytes,wideTarget],
  ['0.35.0',fixture35({second:true}),{version:'0.49.0',minimumSaveVersion:'0.36.2'}],
 ]){
  const before=hash(source),expected=await api.migrateStartSave(source,{from,target:destination}),mutable=source.slice();let changed=false;
  const measured=measure(mutable,()=>api.migrateStartSave(mutable,{from,target:destination,onProgress:()=>{if(!changed){changed=true;mutable.fill(0);}}}));
  const actual=await measured.result;
  assert.ok(measured.inputCopies>=1,'Async migration keeps its private entry snapshot');
  assert.equal(changed,true);assert.deepEqual(actual.bytes,expected.bytes,'Caller writes from a progress callback cannot change conversion output');
  assert.equal(hash(source),before);assert.notEqual(actual.bytes.buffer,mutable.buffer);
  assert.deepEqual(actual.bytes.slice(-16),source.slice(-16),'RTC survives both conversion paths');
 }
 assert.equal(hash(old),originalHash);
 assert.throws(()=>api.detectStartSaveVersion(new Uint8Array(6291473)),{code:'START_SIZE'});
 assert.throws(()=>api.inspectStartUpdate('save.sav','0.49.0',target),{code:'START_INPUT'});
 console.log('PASS: START read-only offset/ArrayBuffer equivalence, immutable originals, shared snapshots and async defensive copies; cumulative allocations '+JSON.stringify(allocationResults));
})().catch(error=>{console.error(error);process.exitCode=1;});
