// SPDX-License-Identifier: AGPL-3.0-or-later
// Physical slot relocation is independent from the 50-box W record format.
const assert=require('node:assert/strict');
const {old49,newLayout,changePage,put16,slotBytes}=require('./helpers/start-save-format-fixtures.cjs');
(async()=>{
 const {convertFormatSave,inspectFormatSave}=await import('../src/start-save/format-l.js');
 const {inspectStartUpdate,migrateStartSave,detectStartSaveVersion}=await import('../src/start-save/migration.js');
 const old=old49({second:true}),w=await convertFormatSave(old.bytes,{to:'W'});
 let source=w.bytes;
 for(const slot of [0,1])source=changePage(source,slot,10,page=>put16(page,0x245,0x3900));
 const original=source.slice(),target={version:'0.59.0',minimumSaveVersion:'0.36.2',saveFormat:'W'};
 assert.equal(detectStartSaveVersion(source),'0.57.0');
 for(const version of ['0.59.0','0.59.1','0.60.0'])assert.equal(inspectStartUpdate(source,'0.57.0',{...target,version}).compatibility.status,'convert');
 assert.equal(inspectStartUpdate(source,'0.57.0',{...target,version:'0.58.9'}).compatibility.status,'compatible');
 const result=await migrateStartSave(source,{from:'0.57.0',target});
 assert.equal(result.bytes.length,16*1048576+16);assert.equal(result.report.layoutMoved,true);
 assert.deepEqual(source,original);assert.deepEqual(result.bytes.subarray(-16),source.subarray(-16));
 assert.equal(inspectFormatSave(result.bytes).layout.version,2);
 for(const slot of [0,1]){
  const before=newLayout(source,slot,'W'),view=new Uint8Array(6*1048576).fill(255);
  view.set(result.bytes.subarray(slot*8*1048576,slot*8*1048576+slotBytes));
  const after=newLayout(view,0,'W');
  for(let box=0;box<50;box++)for(let n=0;n<30;n++)assert.deepEqual(after.readRecord(box,n),before.readRecord(box,n));
  for(const [a,b] of [[0,34*4096],[35*4096,slotBytes]])assert.deepEqual(result.bytes.subarray(slot*8*1048576+a,slot*8*1048576+b),source.subarray(slot*slotBytes+a,slot*slotBytes+b));
 }
 assert.equal(inspectStartUpdate(result.bytes,'0.57.0',target).compatibility.status,'compatible');
 assert.equal(inspectStartUpdate(result.bytes,'0.57.0',{...target,version:'0.58.0'}).compatibility.status,'downgrade');
 const repeat=await convertFormatSave(result.bytes,{to:'W',storageLayout:2});assert.deepEqual(repeat.bytes,result.bytes);assert.equal(repeat.report.layoutMoved,false);
 const one=source.slice();one.fill(255,slotBytes,slotBytes*2);
 assert.equal(inspectStartUpdate(one,'0.57.0',target).compatibility.status,'compatible');
 assert.deepEqual((await convertFormatSave(one,{to:'W',storageLayout:2})).bytes,one);
 const padded=new Uint8Array(16*1048576+16).fill(255);padded.set(source.subarray(0,6*1048576));padded.set(source.subarray(-16),16*1048576);padded[12*1048576+25]=42;
 const preserved=await convertFormatSave(padded,{to:'W',storageLayout:2});assert.equal(preserved.bytes[12*1048576+25],42);
 const conflict=padded.slice();conflict[8*1048576+123]=1;
 await assert.rejects(convertFormatSave(conflict,{to:'W',storageLayout:2}),{code:'START_FORMAT_STORAGE_CONFLICT'});
 const badMark=source.slice();badMark[34*4096+255]=0;
 await assert.rejects(convertFormatSave(badMark,{to:'W',storageLayout:2}),{code:'START_FORMAT_STORAGE_MARKER'});
 const truncated=source.subarray(0,source.length-1);await assert.rejects(convertFormatSave(truncated,{to:'W',storageLayout:2}));
 // Conversion from pre-W must preserve all boxes as well as relocating slots.
 const direct=await convertFormatSave(old.bytes,{to:'W',storageLayout:2});
 for(const slot of [0,1]){
  const v=new Uint8Array(6*1048576).fill(255);v.set(direct.bytes.subarray(slot*8*1048576,slot*8*1048576+slotBytes));
  const a=newLayout(w.bytes,slot,'W'),b=newLayout(v,0,'W');
  for(let box=0;box<50;box++)for(let n=0;n<30;n++)assert.deepEqual(b.readRecord(box,n),a.readRecord(box,n));
 }
 console.log('PASS: 16 MiB slot relocation; 3,000 box records, metadata, RTC, idempotence, boundaries, conflicts and immutable input.');
})().catch(error=>{console.error(error);process.exitCode=1;});
