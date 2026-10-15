// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored synthetic flash layouts only: no ROM, real saves, DOM or network.
const assert=require('node:assert/strict');
const {fixture35,fixture22,fakeROM,hash,put16,put32,seal,sector,slotBytes}=require('./helpers/start-save-fixtures.cjs');
(async()=>{
 const api=await import('../src/start-save/migration.js'),engine=await import('../vendor/start-save-migrate/engine.js');
 const {START_MIGRATION_VERSION,START_SOURCE_VERSIONS,identifyStartROM,inspectStartSave,migrateStartSave}=api;
 const {startVersionFromName}=await import('../src/start-save/version.js');
 for(const [name,expected] of [['PokemonStart_v0.35.0.gba','0.35.0'],['START 0.35.gba','0.35.0'],['START-v0.1.gba','0.1'],['START 0.18.0.gba','0.18'],['START 0.42.3.gba','0.42.3'],['START.gba',null],['START 0.99.0.gba','0.99.0'],['PokemonStart_v0.42.5.gba','0.42.5'],['START 1.0.35.0.gba',null],['START 0.35.0 to 0.42.3.gba',null]])assert.equal(startVersionFromName(name),expected,name);
 assert.equal(startVersionFromName('PokemonStart_v0.35.0.gba','renamed 0.42.3'),'0.35.0');assert.equal(startVersionFromName(undefined,'START 0.35.0'),'0.35.0');assert.equal(startVersionFromName('0.35.0 to 0.42.3.gba','START 0.35.0'),null);
 assert.equal(START_MIGRATION_VERSION,'0.48.0');assert.equal(START_SOURCE_VERSIONS.length,70);assert.equal(START_SOURCE_VERSIONS.find(v=>v.version==='0.17').sampleTested,false);assert(Object.isFrozen(START_SOURCE_VERSIONS[0]));
 assert.equal(identifyStartROM(new Uint8Array(192)),null);assert.equal(identifyStartROM(new Uint8Array(20)),null);
 assert.deepEqual(identifyStartROM(fakeROM(47924504)),{version:'0.42.3',crc32:47924504});
 assert.deepEqual(identifyStartROM(fakeROM(1951955636)),{version:null,versions:['0.18','0.19'],crc32:1951955636});
 assert.throws(()=>inspectStartSave(new Uint8Array(6291473),'0.35'),{code:'START_SIZE'});assert.throws(()=>inspectStartSave('file.sav','0.35'),{code:'START_INPUT'});assert.throws(()=>inspectStartSave(fixture35(),'9.0'),{code:'START_VERSION'});
 const original=fixture35(),originalHash=hash(original),before=engine.snapshot(engine.readSave(original)),progress=[];
 const info=inspectStartSave(original,'0.35');assert.equal(info.sourceVersion,'0.35.0');assert.deepEqual(info.slots.map(s=>s.valid),[true,false]);assert.equal(info.slots[0].name,'A');assert.equal(info.slots[0].boxes,50);assert.equal(info.slots[0].encrypted,true);
 const result=await migrateStartSave(original,{from:'0.35.0',target:'0.42.3',onProgress:p=>progress.push([p.index,p.total])});
 assert.equal(hash(original),originalHash);assert.equal(result.bytes.length,original.length);assert.deepEqual(result.bytes.slice(-16),original.slice(-16));assert.deepEqual(result.bytes.slice(slotBytes,2*slotBytes),original.slice(slotBytes,2*slotBytes));assert.equal(result.bytes[0x120000],0xa7);
 assert.equal(progress.length,20);assert.deepEqual(progress.at(-1),[20,20]);assert.equal(result.report.to,'0.42.3');assert.equal(result.report.fullGameplayTest,false);
 const afterState=engine.readSave(result.bytes),after=engine.snapshot(afterState);
 assert.equal(engine.getVariable(afterState,0x50ef),10755);for(let id=0x5140;id<=0x5146;id++)assert.equal(engine.getVariable(afterState,id),0);
 assert.equal(after.trainer[9],5);assert.deepEqual([...after.common.slice(12,20)],[8,9,255,94,254,255,32,0]);
 const expectedTrainer=before.trainer.slice();expectedTrainer[9]|=1;assert.deepEqual(after.trainer,expectedTrainer);
 const expectedCommon=before.common.slice();expectedCommon.set([8,9,255,94,254,255,32,0],12);assert.deepEqual(after.common,expectedCommon);
 const expectedExtra=before.extra.slice();put16(expectedExtra,0x3de,10755);expectedExtra.fill(0,0x480,0x48e);assert.deepEqual(after.extra,expectedExtra);assert.deepEqual(after.party,before.party);assert.deepEqual(after.pc,before.pc);
 assert.throws(()=>inspectStartSave(result.bytes,'0.41.0'),{code:'START_MISMATCH'});assert.throws(()=>inspectStartSave(result.bytes,'0.35.0'),{code:'START_MISMATCH'});
 const noOp=await migrateStartSave(result.bytes,{from:'0.42.3',target:'0.42.3'});assert.deepEqual(noOp.bytes,result.bytes);
 const two=fixture35({second:true}),twoHash=hash(two),one=await migrateStartSave(two,{from:'0.35.0',target:'0.42.3',selection:0});assert.deepEqual(one.bytes.slice(slotBytes),two.slice(slotBytes));assert.equal(hash(two),twoHash);
 const old=fixture22({mixed:true}),oldHash=hash(old),oldInfo=inspectStartSave(old,'0.22');assert.equal(oldInfo.slots[0].name,'A');assert.equal(oldInfo.slots[0].counter,1);
 const oldResult=await migrateStartSave(old,{from:'0.22',target:'0.42.3'});assert.equal(inspectStartSave(oldResult.bytes,'0.42.3').slots[0].name,'A');assert.equal(hash(old),oldHash);assert.deepEqual(oldResult.bytes.slice(-16),old.slice(-16));assert.equal(oldResult.bytes.length,6291472);
 const oldPair=new Uint8Array(2*slotBytes+16).fill(255);oldPair.set(old.slice(0,131072));oldPair.set(old.slice(0,131072),slotBytes);oldPair.set(old.slice(-16),2*slotBytes);
 const secondOnly=await migrateStartSave(oldPair,{from:'0.22',target:'0.42.3',selection:1});assert.deepEqual(secondOnly.bytes.slice(0,slotBytes),oldPair.slice(0,slotBytes));assert.equal(engine.readSave(secondOnly.bytes,0).version,undefined);assert.equal(engine.readSave(secondOnly.bytes,1).boxCount,50);assert.equal(engine.getVariable(engine.readSave(secondOnly.bytes,1),0x50ef),10755);
 const wrap=fixture22();for(let id=0;id<14;id++){put32(wrap,id*sector+4092,0xffffffff);put32(wrap,(14+id)*sector+4092,0);}assert.equal(inspectStartSave(wrap,'0.22').slots[0].name,'B');
 const duplicate=fixture22();put16(duplicate,sector+4084,0);duplicate[14*sector]^=1;assert.throws(()=>inspectStartSave(duplicate,'0.22'),/有効なレポート/);
 const corrupt=fixture22();corrupt[0]^=1;corrupt[14*sector]^=1;assert.throws(()=>inspectStartSave(corrupt,'0.22'),/有効なレポート/);
 // Recent manifest stamps do not prove native compatibility corrections.
 // A newer ROM receives the reviewed bridge, never an invented 0.48 stamp.
 const recentTarget={version:'0.48.0',minimumSaveVersion:'0.36.2'},steps=[];
 const recent=await migrateStartSave(two,{from:'0.35.0',target:recentTarget,onProgress:p=>steps.push(p.row)});
 assert.equal(recent.report.to,'0.42.5');assert.equal(steps.length,22);assert.equal(steps.at(-1).to,'0.42.5');
 for(let i=1;i<steps.length;i++)assert.equal(steps[i].from,steps[i-1].to,'Every migration edge is adjacent');
 for(const slot of [0,1]){
  const state=engine.readSave(recent.bytes,slot);assert.equal(engine.getVariable(state,0x50ef),0x2a05);
  const before=engine.snapshot(engine.readSave(two,slot)),after=engine.snapshot(state);
  assert.deepEqual(after.party,before.party);assert.deepEqual(after.pc,before.pc);
 }
 assert.equal(hash(two),twoHash);assert.deepEqual(recent.bytes.slice(-16),two.slice(-16));
 const exported=await migrateStartSave(two,{from:'0.35.0'});assert.deepEqual(exported.bytes,recent.bytes,'Standalone export uses the last reviewed bridge');
 await assert.rejects(migrateStartSave(two,{from:'0.35.0',target:{version:'0.48.0',minimumSaveVersion:'0.43.0'}}));assert.equal(hash(two),twoHash);

 // Re-seal authored encrypted page-zero records with boundary IDs; high held
 // item metadata bits must be preserved, not mistaken for an item number.
 const crypt=Uint8Array.from({length:sector},(_,i)=>{let x=(Math.imul(i,0x9e3779b1)+0x504b5354)>>>0;x^=x>>>15;x=Math.imul(x,0x2c1b3c6d)>>>0;x^=x>>>12;x=Math.imul(x,0x297a2d39)>>>0;x^=x>>>15;return x>>>24;});
 // The native warp-validity check reads bank + map as a 16-bit field.
 // Bank zero alone must not hide a valid map when both coordinates are zero.
 const bankZero=fixture35();
 for(const physical of [1,6]){
  const page=bankZero.slice(physical*sector,(physical+1)*sector);for(let i=0;i<sector;i++)page[i]^=crypt[i];
  page.set([0,9,0,0,0,0,0,0],0x1c);seal(page,0,1);for(let i=0;i<sector;i++)page[i]^=crypt[i];bankZero.set(page,physical*sector);
 }
 const bankZeroHash=hash(bankZero),bankZeroResult=await migrateStartSave(bankZero,{from:'0.35.0',target:'0.42.3'}),bankZeroState=engine.snapshot(engine.readSave(bankZeroResult.bytes));
 assert.deepEqual([...bankZeroState.common.slice(12,20)],[0,9,255,94,0,0,0,0]);assert.equal(bankZeroState.trainer[9],5);assert.equal(hash(bankZero),bankZeroHash);
 assert.deepEqual(bankZeroResult.bytes.slice(-16),bankZero.slice(-16));assert.deepEqual(bankZeroResult.bytes.slice(slotBytes),bankZero.slice(slotBytes));
 function boundarySave({stamp=0x3000,move=1005,item=868,badSlot=-1}={}){
  const bytes=fixture35({stamp,second:true});
  for(const slot of [0,1]){
   const offset=slot*slotBytes+10*sector,page=bytes.slice(offset,offset+sector);for(let i=0;i<sector;i++)page[i]^=crypt[i];
   const record=3371;put16(page,record+30,0xfc00|(badSlot<0||badSlot===slot?item:868));
   const value=badSlot<0||badSlot===slot?move:1005;let bits=BigInt(value);for(let i=0;i<5;i++)page[record+39+i]=Number((bits>>BigInt(i*8))&255n);
   seal(page,0,0x40,2,4080);for(let i=0;i<sector;i++)page[i]^=crypt[i];bytes.set(page,offset);
  }return bytes;
 }
 const latest=boundarySave(),latestHash=hash(latest);assert.equal(inspectStartSave(latest,'0.48.0').slots.filter(s=>s.valid).length,2);
 const latestCopy=await migrateStartSave(latest,{from:'0.48.0',target:recentTarget});assert.equal(latestCopy.report.to,'0.48.0');assert.deepEqual(latestCopy.bytes,latest);assert.equal(hash(latest),latestHash);
 for(const slot of [0,1]){const record=engine.readRecord(engine.readSave(latestCopy.bytes,slot),0);assert.equal(new DataView(record.buffer,record.byteOffset,record.byteLength).getUint16(30,true),0xfc00|868);}
 for(const badSlot of [0,1])for(const change of [{move:1006},{item:869}]){const bytes=boundarySave({...change,badSlot}),before=hash(bytes);assert.throws(()=>inspectStartSave(bytes,'0.48.0'),/範囲外/);assert.equal(hash(bytes),before);}
 assert.equal(inspectStartSave(boundarySave({stamp:0x2a03,move:1003,item:857}),'0.42.3').slots.filter(s=>s.valid).length,2,'Historical maximum IDs remain valid');
 for(const change of [{move:1004,item:857},{move:1003,item:858}])assert.throws(()=>inspectStartSave(boundarySave({stamp:0x2a03,...change}),'0.42.3'),/範囲外/,'Historical source limits remain stricter than 0.48');
 await assert.rejects(migrateStartSave(latest,{from:'0.48.0',target:'0.42.3'}));assert.equal(hash(latest),latestHash);
 const abort=new AbortController();await assert.rejects(migrateStartSave(two,{from:'0.35.0',target:recentTarget,signal:abort.signal,onProgress:p=>{if(p.index===3)abort.abort();}}),{name:'AbortError'});assert.equal(hash(two),twoHash);
 const already=new AbortController();already.abort();await assert.rejects(migrateStartSave(original,{from:'0.35.0',signal:already.signal}),{name:'AbortError'});
 await assert.rejects(migrateStartSave(original,{from:'0.35.0',onProgress:()=>{throw Error('observer failed');}}),/observer failed/);assert.equal(hash(original),originalHash);
 await assert.rejects(migrateStartSave(original,{from:'0.35.0',selection:1}),{code:'START_SLOT'});
 console.log('PASS START migration: historical 0.42.3 output, reviewed 0.42.5 bridge for newer ROMs, 0.48 record bounds/no-op, both slots/RTC, corruption, cancellation and immutable input');
})().catch(error=>{console.error(error);process.exitCode=1;});
