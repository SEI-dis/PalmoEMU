// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored saves only. A declared ROM version must match every valid save slot.
const assert=require('node:assert/strict');
const {fixture35,fixture22,hash,slotBytes}=require('./helpers/start-save-fixtures.cjs');
(async()=>{
 const {startSaveCompatibility:policy}=await import('../src/start-save/compatibility.js');
 const {inspectStartUpdate:inspect,START_SOURCE_VERSIONS}=await import('../src/start-save/migration.js');
 for(const from of ['0.1','0.22','0.35.0','0.35.4','0.36.0','0.36.1'])assert.deepEqual(policy(from),{status:'convert',from,to:'0.42.3'});
 for(const from of ['0.36.2','0.37.0'])assert.deepEqual(policy(from),{status:'unknown',from,to:'0.42.3'});
 for(const from of ['0.38.0','0.38.1','0.39.0','0.40.0','0.41.1','0.42.0','0.42.2','0.42.3'])assert.deepEqual(policy(from),{status:'compatible',from,to:'0.42.3'});
 for(const from of [null,undefined,'','0.36.9','0.42.4','1.0.0','not-a-version'])assert.equal(policy(from).status,'unknown','Unlisted source: '+from);
 for(const to of ['0.38.0','1.0.0','unknown',null])for(const from of ['0.35.0','0.40.0'])assert.equal(policy(from,to).status,'unknown','Unverified target: '+to);
 for(const to of ['0.40.0','0.42.2','0.42.4','0.42.5']){assert.equal(policy('0.35.0',to).status,'convert');assert.equal(policy('0.38.0',to).status,'compatible');}
 for(const version of ['0.42.5','0.43.0','0.99.1']){
  const target={version,minimumSaveVersion:'0.36.2'};
  for(const from of ['0.1','0.35.0','0.36.1'])assert.equal(policy(from,target).status,'convert');
  for(const from of ['0.36.2','0.37.0','0.38.0','0.42.3'])assert.equal(policy(from,target).status,'compatible');
  assert.equal(policy('0.35.0',{...target,minimumSaveVersion:null}).status,'unknown');
 }
 const {canApplyStartMigration:canApply}=await import('../src/start-save/compatibility.js');
 assert.equal(canApply({version:'0.43.0',minimumSaveVersion:'0.36.2'}),true);
 assert.equal(canApply({version:'0.43.0',minimumSaveVersion:'0.43.0'}),false);
 assert.equal(canApply({version:'0.42.5',minimumSaveVersion:null}),false);
 assert.equal(canApply({version:'0.42.5',unverified:true}),false);
 const {detectStartSaveVersion:detect}=await import('../src/start-save/migration.js');
 const newSave=fixture35({stamp:0x2a05,second:true});assert.equal(detect(newSave),'0.42.5');
 assert.equal(inspect(newSave,'0.42.5',{version:'0.43.0',minimumSaveVersion:'0.36.2'}).compatibility.status,'compatible');
 assert.throws(()=>inspect(newSave,'0.35.0'),{code:'START_MISMATCH'});
 assert.equal(detect(fixture35({stamp:0x2a03,second:true})),'0.42.3');
 assert.equal(detect(fixture35({stamp:0x2a03,second:true,secondStamp:0})),null);
 const stamps=new Map([['0.36.1',0x2401],['0.36.2',0x2402],['0.37.0',0x2500],['0.38.0',0x2600],['0.40.0',0x2800],['0.42.3',0x2a03]]);
 const cases=[['0.22',fixture22(),'convert'],['0.31',fixture35({boxes:39,encrypted:false}),'convert'],['0.32',fixture35({encrypted:false}),'convert'],['0.35.0',fixture35(),'convert'],
  ...[...stamps].map(([version,stamp])=>[version,fixture35({stamp,second:true}),policy(version).status])];
 for(const [version,bytes,status]of cases){const before=hash(bytes),info=inspect(bytes,version),source=START_SOURCE_VERSIONS.find(entry=>entry.version===version);assert.equal(info.compatibility.status,status);assert.equal(info.sourceVersion,version);assert.ok(info.slots.some(slot=>slot.valid));for(const slot of info.slots.filter(slot=>slot.valid)){assert.equal(slot.boxes,source.boxes);assert.equal(slot.encrypted,source.encrypted);}assert.equal(hash(bytes),before,'Inspection never rewrites save data');}
 const modern=fixture35({stamp:0x2800});assert.throws(()=>inspect(modern,'0.35.0'),{code:'START_MISMATCH'},'Modern data with an old filename');
 assert.throws(()=>inspect(fixture35(),'0.40.0'),{code:'START_MISMATCH'},'Old data with a compatible filename');
 assert.throws(()=>inspect(fixture35({stamp:0x2800,encrypted:false}),'0.40.0'),{code:'START_MISMATCH'},'Expected encrypted format');
 assert.throws(()=>inspect(fixture35({stamp:0x2800,boxes:39}),'0.40.0'),{code:'START_MISMATCH'},'Expected 50 boxes');
 assert.throws(()=>inspect(fixture35({encrypted:false}),'0.31'),{code:'START_MISMATCH'},'Expected 39 boxes');
 assert.throws(()=>inspect(fixture35(),'0.32'),{code:'START_MISMATCH'},'Expected unencrypted format');
 for(const value of [new Uint8Array(3),new Uint8Array(6291473),'state.sav'])assert.throws(()=>inspect(value,'0.40.0'));
 assert.throws(()=>inspect(new Uint8Array(6291472).fill(255),'0.40.0'),'No valid saved game');
 const corrupt=fixture35({stamp:0x2800});corrupt[0]^=1;corrupt[5*4096]^=1;assert.throws(()=>inspect(corrupt,'0.40.0'),'Both banks corrupted');
 for(const secondStamp of [0,0x2600]){const mixed=fixture35({second:true,stamp:0x2800,secondStamp}),before=hash(mixed);assert.throws(()=>inspect(mixed,'0.40.0'),{code:'START_MISMATCH'},'Second valid slot differs from the selected version');assert.equal(hash(mixed),before);}
 const mixedLayout=fixture35({second:true,stamp:0x2800}),plain=fixture35({stamp:0x2800,encrypted:false});mixedLayout.set(plain.subarray(0,slotBytes),slotBytes);assert.throws(()=>inspect(mixedLayout,'0.40.0'),{code:'START_MISMATCH'},'Second valid slot has a different encryption layout');
 console.log('PASS: START compatibility boundaries, unknown targets/versions, strict save stamps/boxes/encryption, mixed-slot refusal, malformed input and immutable inspection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
