// SPDX-License-Identifier: AGPL-3.0-or-later
// Independent synthetic 0.49 flash records; no downloaded tool, ROM or save.
const assert=require('node:assert/strict');
const {fixture22,hash}=require('./helpers/start-save-fixtures.cjs');
const {old49,record,expectedL,newLayout,changePage,decode,encode,u16,u32,put16,put32,seal,sector,payload,slotBytes,mainSizes}=require('./helpers/start-save-format-fixtures.cjs');
(async()=>{
 const {inspectFormatSave,convertFormatSave}=await import('../src/start-save/format-l.js');
 const legacy=await import('../vendor/start-save-migrate/engine.js');
 const inspect=bytes=>inspectFormatSave(bytes).slots;
 const joinSections=sections=>{const out=new Uint8Array(mainSizes.slice(1).reduce((a,b)=>a+b,0));let at=0;for(let i=1;i<5;i++){out.set(sections[i].subarray(0,mainSizes[i]),at);at+=mainSizes[i];}return out;};
 const verifySlot=(bytes,slot,fixture)=>{
  const output=newLayout(bytes,slot);assert.equal(output.counter,fixture.counter);assert.equal(u16(output.p0,0x243),0x3000,'First-seen version is preserved');assert.equal(u16(output.p0,0x245),0x31ff,'0.50 consumes the 0x31ff compatibility guard');
  // All 50 boxes include every fixed/stream/ext boundary, plus both ends of
  // every page. Expected bytes are computed directly from each old record.
  for(let box=0;box<50;box++)for(let pos=0;pos<30;pos++)assert.deepEqual(output.readRecord(box,pos),expectedL(fixture.boxes[box][pos]),`slot ${slot}, box ${box+1}, position ${pos+1}`);
  const trainer=fixture.sections[0].slice();trainer.fill(0,0xf8,0xf8+1740);assert.deepEqual(output.sections[0],trainer,'Moved box 25 leaves other trainer bytes intact');
  const common=joinSections(fixture.sections),actual=output.sb1.slice();common.fill(0,0x18e8,0x18e8+3480);common.fill(0,0x1400,0x1429);actual.fill(0,0x1400,0x1429);assert.deepEqual(actual,common,'Only fixed boxes and the page map change in SaveBlock1, including party data');
  const expectedRegion=fixture.region.slice();expectedRegion.fill(0,0xb10,0xb10+5220);const region=new Uint8Array(payload*2);region.set(output.page(16));region.set(output.page(17),payload);assert.deepEqual(region,expectedRegion,'Only old boxes 20–22 move out of the region');
  const prefix=fixture.p0Prefix.slice();put16(prefix,0x245,0x31ff);assert.deepEqual(output.p0.slice(0,3371),prefix,'Headers, tails and other persistent variables survive');
  assert.deepEqual(output.page(25).slice(240,350),fixture.metadata,'Extended box names and wallpaper metadata move intact');
  return output;
 };
 const rejectUnchanged=async(bytes,label,selection='all')=>{const before=hash(bytes);await assert.rejects(convertFormatSave(bytes,{selection}),undefined,label);assert.equal(hash(bytes),before,label+' does not alter input');};
 const source=old49({second:true}),before=hash(source.bytes),progress=[];
 // Independently authored old records must also be readable by the existing
 // engine. No expected new-format value is taken from either converter.
 for(let slot=0;slot<2;slot++){const old=legacy.readSave(source.bytes,slot);assert.equal(legacy.getVariable(old,0x50ef),0x3100);for(let box=0;box<50;box++)for(let pos=0;pos<30;pos++)assert.deepEqual(legacy.readRecord(old,box*30+pos),source.slots[slot].boxes[box][pos]);}
 assert.deepEqual(inspect(source.bytes).map(({slot,valid,format,versionStamp,counter})=>({slot,valid,format,versionStamp,counter})),[0,1].map(slot=>({slot,valid:true,format:'old',versionStamp:0x3100,counter:7})));
 const converted=await convertFormatSave(source.bytes,{onProgress:event=>progress.push(event)});assert.ok(progress.length>0);assert.equal(converted.report.toFormat,'L');assert.equal(converted.report.fromFormat,'old');assert.equal(converted.report.versionStamp,0x31ff);assert.deepEqual(converted.report.convertedSlots,[0,1]);assert.deepEqual(converted.report.unchangedSlots,[]);assert.equal(converted.report.fullGameplayTest,false);assert.equal(hash(source.bytes),before);assert.equal(converted.bytes.length,source.bytes.length);
 // The game's capability probe compares the first 16 raw flash bytes at
 // sectors 0/16 against 32/752. A single active bank can leave sector 0 or
 // 16 erased, falsely looking like aliases of unused extended flash.
 const probePasses=(bytes,slot)=>[[0,32],[16,32],[0,752],[16,752]].every(([a,b])=>!bytes.subarray(slot*slotBytes+a*sector,slot*slotBytes+a*sector+16).every((value,i)=>value===bytes[slot*slotBytes+b*sector+i]));
 assert.ok(probePasses(converted.bytes,0)&&probePasses(converted.bytes,1),'Converted slots must pass the unmodified extended-flash probe before a first in-game save');
 for(const counter of [0,1,2,0xffffffff])for(const dense of [false,true]){
  const fixture=old49({second:true,counter,dense,metadata:dense}),result=await convertFormatSave(fixture.bytes);
  for(const slot of [0,1]){
   const output=verifySlot(result.bytes,slot,fixture.slots[slot]),start=slot*slotBytes,active=5*(counter%2),backup=5-active;
   assert.ok(probePasses(result.bytes,slot),`Raw flash probe: counter ${counter}, dense ${dense}, slot ${slot}`);
   for(let id=0;id<5;id++){
    assert.equal(u32(output.decoded,start+(active+id)*sector+4092),counter);
    if(counter>0){assert.equal(u32(output.decoded,start+(backup+id)*sector+4092),counter-1);assert.deepEqual(output.decoded.subarray(start+(backup+id)*sector,start+(backup+id)*sector+payload),output.sections[id],'Backup bank retains the same payload at an older generation');}
    else assert.ok(output.decoded.subarray(start+(backup+id)*sector,start+(backup+id+1)*sector).every(value=>value===255),'Counter zero does not invent an older generation');
   }
   if(!dense){assert.deepEqual(output.decoded.subarray(start+16*sector,start+16*sector+payload),output.p0,'Unused sector 16 holds a page-zero backup');assert.equal(u16(output.decoded,start+16*sector+4084),0x40);assert.equal(u32(output.decoded,start+16*sector+4092),Math.max(counter-1,0));}
   else assert.equal(u16(output.decoded,start+16*sector+4084),0x46,'A populated box page in sector 16 must not be replaced');
  }
 }
 for(let slot=0;slot<2;slot++){verifySlot(converted.bytes,slot,source.slots[slot]);assert.deepEqual(converted.bytes.slice(slot*slotBytes+86*sector,(slot+1)*slotBytes),source.bytes.slice(slot*slotBytes+86*sector,(slot+1)*slotBytes),'Non-layout flash remains byte-identical');assert.deepEqual(converted.bytes.slice(slot*slotBytes+32*sector,slot*slotBytes+40*sector),source.bytes.slice(slot*slotBytes+32*sector,slot*slotBytes+40*sector));}
 assert.deepEqual(converted.bytes.slice(-16),source.bytes.slice(-16));assert.deepEqual(inspect(converted.bytes).map(s=>[s.valid,s.format,s.versionStamp,s.mons]),[[true,'L',0x31ff,1499],[true,'L',0x31ff,1499]]);
 const output=newLayout(converted.bytes),empty=output.readRecord(49,29);assert.equal(u16(empty,28),0);assert.equal(empty[16]&0x40,0x40,'An empty record is not normalized');assert.equal(u16(empty,58),0);assert.deepEqual(empty.slice(0,58),source.slots[0].boxes[49][29]);
 for(const [pos,level,extension]of [[0,127,0],[2,254,0x100],[4,128,0x100]]){const value=output.readRecord(0,pos);assert.equal(u16(value,52)&127,level&127);assert.equal(u16(value,58),extension);assert.equal(value[16]&0x40,0);assert.equal(value[16]&0xbf,source.slots[0].boxes[0][pos][16]&0xbf);}
 const lHash=hash(converted.bytes),noop=await convertFormatSave(converted.bytes);assert.deepEqual(noop.bytes,converted.bytes,'Validated L saves are a byte-for-byte no-op');assert.deepEqual(noop.report.convertedSlots,[]);assert.deepEqual(noop.report.unchangedSlots,[0,1]);assert.equal(hash(converted.bytes),lHash);
 const nativeL=changePage(converted.bytes,0,10,page=>{put16(page,0x245,0x3200);put16(page,3371+58,0xffff);});assert.equal(inspect(nativeL)[0].versionStamp,0x3200);assert.deepEqual((await convertFormatSave(nativeL)).bytes,nativeL,'Native L version and new record-extension bits are never downgraded');
 for(const selection of [0,1]){const chosen=await convertFormatSave(source.bytes,{selection});verifySlot(chosen.bytes,selection,source.slots[selection]);const other=1-selection;assert.deepEqual(chosen.bytes.slice(other*slotBytes,(other+1)*slotBytes),source.bytes.slice(other*slotBytes,(other+1)*slotBytes));assert.deepEqual(chosen.bytes.slice(-16),source.bytes.slice(-16));assert.deepEqual(inspect(chosen.bytes).map(s=>s.format),selection===0?['L','old']:['old','L']);const all=await convertFormatSave(chosen.bytes);assert.deepEqual(all.bytes.slice(selection*slotBytes,(selection+1)*slotBytes),chosen.bytes.slice(selection*slotBytes,(selection+1)*slotBytes),'An existing L slot remains untouched when converting the other slot');verifySlot(all.bytes,other,source.slots[other]);}
 const plain=old49({second:true,encrypted:false,rtc:false}),plainResult=await convertFormatSave(plain.bytes,{selection:1});assert.equal(plainResult.bytes.length,2*slotBytes);assert.deepEqual(plainResult.bytes.slice(0,slotBytes),plain.bytes.slice(0,slotBytes));verifySlot(plainResult.bytes,1,plain.slots[1]);
 const sparse=old49({dense:false,metadata:false}),sparseResult=await convertFormatSave(sparse.bytes);verifySlot(sparseResult.bytes,0,sparse.slots[0]);assert.equal(inspect(sparse.bytes)[1].unused,true);assert.deepEqual(sparseResult.bytes.slice(slotBytes),sparse.bytes.slice(slotBytes));await rejectUnchanged(sparse.bytes,'Selecting an unused slot',1);
 for(const rtc of [false,true])for(const grow of [false,true]){const smallFixture=old49({dense:false,metadata:false,rtc,records:[[grow?34:0,0]]}),small=new Uint8Array(131072+(rtc?16:0));small.set(smallFixture.bytes.subarray(0,131072));if(rtc)small.set(smallFixture.bytes.subarray(-16),131072);const result=await convertFormatSave(small);assert.equal(result.bytes.length,grow?2*slotBytes+(rtc?16:0):small.length,'128 KiB grows only when new extended pages are needed');assert.equal(result.report.grew,grow);if(rtc)assert.deepEqual(result.bytes.slice(-16),small.slice(-16));verifySlot(result.bytes,0,smallFixture.slots[0]);}
 const blank=new Uint8Array(2*slotBytes+16).fill(255);blank.set(source.bytes.subarray(-16),2*slotBytes);assert.ok(inspect(blank).every(slot=>slot.unused&&!slot.valid));await rejectUnchanged(blank,'No slot is selected from wholly unused flash');
 for(const bytes of [new Uint8Array(0),new Uint8Array(131073),new Uint8Array(2*slotBytes+17),fixture22()])await rejectUnchanged(bytes,'Unsupported size or pre-shelf 14-sector save');
 assert.throws(()=>inspectFormatSave('save.sav'));await rejectUnchanged(source.bytes,'Invalid slot selection',2);
 // A torn main set must never mix five sections from different generations.
 // This migration deliberately refuses partial banks instead of repairing them.
 const fallback=changePage(source.bytes,0,1,page=>put32(page,4092,8));assert.equal(inspect(fallback)[0].valid,false);await rejectUnchanged(fallback,'A main bank has mixed counters');
 let torn=changePage(fallback,0,6,page=>put32(page,4092,8));assert.equal(inspect(torn)[0].valid,false);await rejectUnchanged(torn,'Both main banks have mixed counters');
 let wrap=old49({counter:0});for(let id=0;id<5;id++)wrap.bytes=changePage(wrap.bytes,0,id,page=>{put32(page,4092,0xffffffff);if(id===2)put32(page,0x414,0xffffffff);});assert.equal(inspect(wrap.bytes)[0].counter,0);assert.equal(inspect(wrap.bytes)[0].bank,1);verifySlot((await convertFormatSave(wrap.bytes)).bytes,0,wrap.slots[0]);
 const corruptions=[
  ['bad PC checksum',bytes=>changePage(bytes,0,11,page=>{page[0]^=1;},{reseal:false})],
  ['wrong PC logical page',bytes=>changePage(bytes,0,11,page=>put16(page,4084,0x42))],
  ['bad extended checksum',bytes=>changePage(bytes,0,40,page=>{page[0]^=1;},{reseal:false})],
  ['wrong extended map',bytes=>changePage(bytes,0,10,page=>{page[4068]=255-1;})],
  ['duplicate mapped page',bytes=>{let out=bytes;for(const physical of [2,7])out=changePage(out,0,physical,page=>{page[0x419]=page[0x418];});return out;}],
  ['missing required page zero',bytes=>{let out=bytes;for(const physical of [2,7])out=changePage(out,0,physical,page=>{page[0x418]=255;});return out;}],
  ['inconsistent map generation',bytes=>{let out=bytes;for(const physical of [2,7])out=changePage(out,0,physical,page=>put32(page,0x414,123));return out;}],
  ['partially missing main',bytes=>{const out=decode(bytes);out.fill(255,sector,2*sector);out.fill(255,6*sector,7*sector);return encode(out);}],
 ];
 for(const [label,damage]of corruptions){const bytes=damage(source.bytes),slot=inspect(bytes)[0];assert.equal(slot.valid,false,label);assert.equal(slot.unused,false,label+' is not mistaken for an unused slot');await rejectUnchanged(bytes,label);const other=await convertFormatSave(bytes,{selection:1});assert.deepEqual(other.bytes.slice(0,slotBytes),bytes.slice(0,slotBytes),label+' in an unselected slot is retained');verifySlot(other.bytes,1,source.slots[1]);}
 const invalidL=changePage(converted.bytes,0,11,page=>{page[8]^=1;},{reseal:false});await rejectUnchanged(invalidL,'L no-op still validates referenced pages');
 // Old overflow page one lives at extra physical page 24 (flash sector 56).
 // Give it a distinguishable record and test newer/older/wrapped counters.
 for(const [mainCounter,backupCounter,useBackup]of [[7,8,true],[7,6,false],[0xffffffff,0,true]]){
  const fixture=old49({counter:mainCounter}),decoded=decode(fixture.bytes),page=decoded.slice(11*sector,12*sector),replacement=record(0,12,{seed:321,high:true,level:1});page.set(replacement,0);seal(page,0,0x41,backupCounter,payload);decoded.set(page,56*sector);
  const last=decoded.slice(44*sector,45*sector);last[3010]=0x59;last[3011]=24;seal(last,0,0x55,mainCounter,payload);decoded.set(last,44*sector);fixture.bytes=encode(decoded);if(useBackup)fixture.slots[0].boxes[0][12]=replacement;
  const result=await convertFormatSave(fixture.bytes);verifySlot(result.bytes,0,fixture.slots[0]);
 }
 const aborted=new AbortController();aborted.abort();await assert.rejects(convertFormatSave(source.bytes,{signal:aborted.signal}),{name:'AbortError'});
 const during=new AbortController();await assert.rejects(convertFormatSave(source.bytes,{signal:during.signal,onProgress:()=>during.abort()}),{name:'AbortError'});assert.equal(hash(source.bytes),before);
 await assert.rejects(convertFormatSave(source.bytes,{onProgress:()=>{throw Error('Synthetic progress failure');}}),/Synthetic progress failure/);assert.equal(hash(source.bytes),before);
// Authored wide-format regression coverage, appended inside the existing suite.
 const wide=await convertFormatSave(source.bytes,{to:'W'});
 assert.equal(hash(source.bytes),before);assert.deepEqual(wide.bytes.slice(-16),source.bytes.slice(-16));
 assert.equal(wide.report.toFormat,'W');assert.equal(wide.report.recordsVerified,3000);
 for(const slot of [0,1]){
  const layout=newLayout(wide.bytes,slot,'W');assert.equal(u16(layout.p0,0x245),0x34ff);
  for(let box=0;box<50;box++)for(let pos=0;pos<30;pos++){
   const expected=new Uint8Array(63);expected.set(expectedL(source.slots[slot].boxes[box][pos]));
   assert.deepEqual(layout.readRecord(box,pos),expected,`W ${slot}:${box+1}:${pos+1}`);
  }
  assert.deepEqual(layout.page(26).slice(1764,1874),source.slots[slot].metadata,'W box metadata moves after the final 28 records');
  assert.deepEqual(wide.bytes.subarray(slot*slotBytes+88*sector,(slot+1)*slotBytes),source.bytes.subarray(slot*slotBytes+88*sector,(slot+1)*slotBytes),'Non-layout data stays byte-identical');
 }
 assert.deepEqual((await convertFormatSave(wide.bytes,{to:'W'})).bytes,wide.bytes,'W no-op preserves the whole container');
 await assert.rejects(convertFormatSave(wide.bytes,{to:'L'}),{code:'START_FORMAT_DOWNGRADE'});
 const selectedW=await convertFormatSave(converted.bytes,{to:'W',selection:1});assert.deepEqual(selectedW.bytes.slice(0,slotBytes),converted.bytes.slice(0,slotBytes));
 assert.deepEqual(inspect(selectedW.bytes).map(s=>s.format),['L','W']);
 // Independently authored high move bits exercise all 4 positions, level,
 // location and unused extension bits. The 58-byte record remains identical.
 let highL=converted.bytes;
 for(const slot of [0,1])highL=changePage(highL,slot,10,page=>put16(page,3371+58,0xffff));
 const highW=await convertFormatSave(highL,{to:'W'});
 for(const slot of [0,1]){
  const old=newLayout(highL,slot).readRecord(0,0),out=newLayout(highW.bytes,slot,'W').readRecord(0,0);
  assert.deepEqual(out.slice(0,58),old.slice(0,58));assert.equal(u16(out,58),0xe1ff);
  assert.equal(out[60]|out[61]<<8|out[62]<<16,0x41041,'4 independent move high bits occupy 6-bit fields');
 }
 // Native W moves can use all six high bits; a no-op must not truncate them.
 const nativeW=changePage(wide.bytes,0,10,page=>{page.set([255,255,255],3371+60);put16(page,0x245,0x3501);});
 assert.deepEqual((await convertFormatSave(nativeW,{to:'W'})).bytes,nativeW);
 for(const [label,damage]of [
  ['W checksum',bytes=>changePage(bytes,0,48,p=>{p[0]^=1;},{reseal:false})],
  ['W extension outside allocation',bytes=>changePage(bytes,0,10,p=>{p[4065]=26;})],
  ['W overflow overlaps extension',bytes=>changePage(bytes,0,48,p=>{p[1875]=24;})]
 ]){const bytes=damage(wide.bytes),digest=hash(bytes);await assert.rejects(convertFormatSave(bytes,{to:'W'}),undefined,label);assert.equal(hash(bytes),digest);}
 const cancelledW=new AbortController();await assert.rejects(convertFormatSave(source.bytes,{to:'W',signal:cancelledW.signal,onProgress:()=>cancelledW.abort()}),{name:'AbortError'});
 console.log('PASS START W: all 3000 records, old/L → W, high move bits, both slots, selected slots, RTC, metadata, W no-op, downgrade/corruption/cancellation safety');
 console.log('PASS START format L: independent 3000-record 58→60 expectations, all box/page boundaries, level/empty/tail preservation, 0x31ff, both slots/RTC, 128 KiB growth, L no-op, counter coherence/wrap, overflow, corruption rejection and cancellation');
})().catch(error=>{console.error(error);process.exitCode=1;});
