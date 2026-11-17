// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored flash/records and an independent codec only; no ROM or user save.
const assert=require('node:assert/strict'),f=require('./helpers/start-save-format-fixtures.cjs'),crypt=require('./helpers/start-save-keyed-fixture.cjs');
const {hash}=require('./helpers/start-save-fixtures.cjs');
const stride=8388608,sector=4096,signature=0x08012025,speciesLimit=0x5ef;
const block=(bytes,slot,physical)=>bytes.subarray(slot*stride+physical*sector,slot*stride+(physical+1)*sector);
function packed(record){
 const out=record.slice(),species=f.u16(out,28),exp=f.u32(out,32);
 if(species){assert(species<speciesLimit);f.put16(out,28,species|((exp>>>27)<<11));f.put32(out,32,exp&0x07ffffff);}
 return out;
}
function record(index,seed=0){
 const out=new Uint8Array(78);out.set(f.record(Math.floor(index/30)%50,index%30,{seed,high:false}));
 f.put16(out,28,index===2999?0:(index+seed)%(speciesLimit-1)+1);
 f.put32(out,32,((index%32)<<27)|((0x12345+index*371+seed)&0x07ffffff));
 for(let i=58;i<78;i++)out[i]=(index*7+seed*13+i*11)&255;
 return out;
}
function position(index){
 if(index>=1500){const page=Math.floor((index-1500)/52);return {physical:218+page,id:32+page,offset:(index-1500)%52*78};}
 if(index>=780){const page=Math.floor((index-780)/52);return {physical:160+page,id:18+page,offset:(index-780)%52*78};}
 if(index<8)return {physical:10,id:0,offset:3371+index*78};
 const page=1+Math.floor((index-8)/52);return {physical:10+page,id:page,offset:(index-8)%52*78};
}
function ownFooter(bytes){f.put16(bytes,4084,0);f.put16(bytes,4086,0);f.put32(bytes,4088,signature);f.put32(bytes,4092,0);}
function sum(bytes,seed,start,end){let total=seed;for(let i=start;i<end;i++)total+=bytes[i]+((i-start)&255);return total&65535;}
const eggSum=bytes=>sum(bytes,0x4547,16,136+30*(f.u16(bytes,4)===1?63:78));
const reliveSum=bytes=>sum(bytes,0x4c52,16,16+30*78);
function hfrSum(bytes){let total=0x4852;for(let i=0;i<f.u16(bytes,6)/2;i++)total+=f.u16(bytes,16+i*2)+i;return total&65535;}
function auxiliary(bytes,slot){
 for(const physical of [88,89]){
  const b=block(bytes,slot,physical),width=physical===88?63:78;b.fill(0);
  f.put32(b,0,0x58424745);f.put16(b,4,width===63?1:2);f.put32(b,8,190+slot);
  for(let i=16;i<136;i++)b[i]=(i*17+slot+physical)&255;
  for(let i=0;i<30;i++)b.set(record(i+70,slot+physical).subarray(0,width),136+i*width);
  f.put16(b,6,eggSum(b));ownFooter(b);
 }
 for(const physical of [90,91]){
  const b=block(bytes,slot,physical),size=physical===90?642:554;b.fill(0);
  f.put32(b,0,0x31524648);f.put16(b,4,size===642?3:2);f.put16(b,6,size);
  for(let i=0;i<size;i++)b[16+i]=(i*3+slot+physical)&255;
  f.put16(b,12,hfrSum(b));ownFooter(b);
 }
 for(const physical of [94,95]){
  const b=block(bytes,slot,physical);b.fill(0);f.put32(b,0,0x58424c52);f.put16(b,4,1);f.put32(b,8,physical);
  for(let i=0;i<30;i++)b.set(record(i+170,slot+physical),16+i*78);
  f.put16(b,6,reliveSum(b));
  // Both a regular encrypted sector and a raw own-checksum sector are valid.
  if(physical===94)f.seal(b,0,0x80,7,4080);
 }
}
(async()=>{
 const {convertFormatSave:convert,inspectFormatSave:inspect}=await import('../src/start-save/format-l.js');
 const api=await import('../src/start-save/migration.js'),{startSaveCompatibility:compat}=await import('../src/start-save/compatibility.js');
 const target={version:'0.71.1',minimumSaveVersion:'0.67.0',saveFormat:'E'};
 assert.equal(compat('0.66.1',target).status,'convert');assert.equal(compat('0.67.0',target).status,'compatible');
 assert.equal(compat('0.71.1',{...target,version:'0.71.0'}).status,'downgrade');
 assert.equal(compat('0.66.1',{...target,saveFormat:'Z',minimumSaveVersion:'0.36.2'}).status,'unknown','Z layout cannot authorize a target at or beyond E');
 assert.equal(compat('0.67.0',{...target,minimumSaveVersion:'0.68.0'}).status,'unknown','Unknown future native minimum fails closed');
 const reject=async(bytes,code,options={})=>{const before=hash(bytes);await assert.rejects(convert(bytes,{to:'E',storageLayout:2,...options}),{code});assert.equal(hash(bytes),before,'Rejected input stays byte-exact');};
 const old=f.old49({encrypted:false}).bytes,p0=old.subarray(10*sector,11*sector);
 f.put16(p0,3371+28,speciesLimit-1);f.put32(p0,3371+32,0xfedcba98);f.seal(p0,0,0x40,7,4080);
 const original=f.encode(old),originalHash=hash(original),canonical=await convert(original,{to:'Z'}),beforeZ=f.newLayout(canonical.bytes,0,'Z',crypt.decode);
 for(const format of ['old','L','W','X','Y','Z']){
  const input=format==='old'?original:format==='Z'?canonical.bytes:(await convert(original,{to:format})).bytes,inputHash=hash(input);
  const output=await convert(input,{to:'E',storageLayout:2}),after=f.newLayout(output.bytes,0,'E',crypt.decode),info=inspect(output.bytes);
  assert.equal(output.report.recordsVerified,3000,format+' verifies all destination records');
  assert.equal(output.report.fromFormat,format);assert.equal(info.slots[0].format,'E');assert.equal(info.slots[0].boxes,100);assert.equal(info.slots[0].versionStamp,0x4300);
  assert(info.slots[1].unused);assert.deepEqual(output.bytes.slice(-16),input.slice(-16));
  for(let i=0;i<3000;i++)assert.deepEqual(after.readRecord(Math.floor(i/30),i%30),packed(beforeZ.readRecord(Math.floor(i/30),i%30)),format+' record '+i);
  assert.equal(hash(input),inputHash,format+' original unchanged');
 }
 assert.equal(hash(original),originalHash);
 // Exercise every populated page in all 100 boxes and both adventures, with
 // all 32 EXP high-bit combinations, EV/IV tails, and a species-zero payload.
 const dense=(await convert(f.old49({second:true}).bytes,{to:'Z',storageLayout:2})).bytes,plain=crypt.decode(dense);
 for(const slot of [0,1]){
  const p=block(plain,slot,10),pages=new Map();
  for(let page=0;page<29;page++){block(plain,slot,218+page).fill(0);p[4012+page]=186+page;}
  for(let i=0;i<3000;i++){const at=position(i);block(plain,slot,at.physical).set(record(i,slot*17),at.offset);pages.set(at.physical,at.id);}
  for(let i=0;i<500;i++)block(plain,slot,246)[3432+i]=(i*19+slot+1)&255;
  f.put16(p,0x245,0x4200);
  for(const [physical,id]of pages)f.seal(block(plain,slot,physical),0,0x40+id,7,4080);
  auxiliary(plain,slot);
 }
 const native=crypt.encode(plain,30),nativeHash=hash(native),info=inspect(native);
 assert(info.slots.every(s=>s.valid&&s.format==='Z'&&s.boxes===100&&s.eggStale));
 const migrated=await convert(native,{to:'E',storageLayout:2}),decoded=crypt.decode(migrated.bytes);
 assert.equal(migrated.report.recordsVerified,6000);assert.deepEqual(migrated.report.convertedSlots,[0,1]);
 assert(inspect(migrated.bytes).slots.every(s=>s.valid&&s.format==='E'&&!s.eggStale));
 for(const slot of [0,1]){
  const after=f.newLayout(migrated.bytes,slot,'E',crypt.decode);
  for(let i=0;i<3000;i++)assert.deepEqual(after.readRecord(Math.floor(i/30),i%30),packed(record(i,slot*17)),`Slot ${slot}, box record ${i}`);
  assert.deepEqual(after.page(60).subarray(3432,3932),block(plain,slot,246).subarray(3432,3932),'100-box metadata');
  for(const physical of [88,89]){
   const before=block(plain,slot,physical),after=block(decoded,slot,physical),width=physical===88?63:78;
   assert.equal(f.u16(after,4),2);assert.equal(f.u16(after,6),eggSum(after));assert.equal(f.u16(after,4086),0,'Own-checksum footer stays zero');
   assert.deepEqual(after.subarray(8,136),before.subarray(8,136));
   for(let i=0;i<30;i++){const expected=new Uint8Array(78);expected.set(before.subarray(136+i*width,136+(i+1)*width));assert.deepEqual(after.subarray(136+i*78,136+(i+1)*78),packed(expected));}
  }
  for(const physical of [94,95]){
   const before=block(plain,slot,physical),after=block(decoded,slot,physical);
   assert.equal(f.u16(after,6),reliveSum(after));assert.deepEqual(after.subarray(8,16),before.subarray(8,16));
   for(let i=0;i<30;i++)assert.deepEqual(after.subarray(16+i*78,16+(i+1)*78),packed(before.subarray(16+i*78,16+(i+1)*78)));
  }
  for(const [first,last]of [[32,40],[90,94],[96,160],[276,768]])
   assert.equal(hash(migrated.bytes.subarray(slot*stride+first*sector,slot*stride+last*sector)),hash(native.subarray(slot*stride+first*sector,slot*stride+last*sector)),'Unowned ranges stay byte-exact');
 }
 assert.equal(hash(native),nativeHash);assert.deepEqual(migrated.bytes.slice(-16),native.slice(-16));
 for(const selection of [0,1]){
  const chosen=await convert(native,{to:'E',storageLayout:2,selection}),other=1-selection;
  assert.equal(chosen.report.recordsVerified,3000);assert.equal(hash(chosen.bytes.subarray(other*stride,(other+1)*stride)),hash(native.subarray(other*stride,(other+1)*stride)));
  assert.deepEqual(chosen.bytes.slice(-16),native.slice(-16));assert.equal(inspect(chosen.bytes).slots[other].format,'Z');
 }
 // New native key 41 and already-packed species must never be re-converted.
 const ePlain=crypt.decode(migrated.bytes);
 for(const slot of [0,1]){const p=block(ePlain,slot,10);f.put16(p,0x245,0x4701);f.seal(p,0,0x40,7,4080);}
 const key41=crypt.encode(ePlain,41),key41Hash=hash(key41);
 assert(inspect(key41).slots.every(s=>s.valid&&s.format==='E'&&s.versionStamp===0x4701));
 assert.equal(api.detectStartSaveVersion(key41),'0.71.1');
 const same=await convert(key41,{to:'E',storageLayout:2});assert.equal(hash(same.bytes),key41Hash);assert.equal(same.report.recordsVerified,0);assert.deepEqual(same.report.convertedSlots,[]);
 // An E save left with an old v1 egg block repairs that block once, without
 // packing its already-E boxes, v2 eggs or relive records a second time.
 const stalePlain=ePlain.slice();block(stalePlain,0,88).set(block(plain,0,88));
 const stale=crypt.encode(stalePlain,41),staleHash=hash(stale);assert(inspect(stale).slots[0].eggStale);
 const repaired=await convert(stale,{to:'E',storageLayout:2}),repairedPlain=crypt.decode(repaired.bytes);
 assert(!inspect(repaired.bytes).slots[0].eggStale);assert.deepEqual(block(repairedPlain,0,88),block(decoded,0,88));
 assert.equal(hash(repaired.bytes.subarray(0,88*sector)),hash(stale.subarray(0,88*sector)));
 assert.equal(hash(repaired.bytes.subarray(89*sector)),hash(stale.subarray(89*sector)));
 assert.equal(hash(stale),staleHash);assert.equal(hash((await convert(repaired.bytes,{to:'E',storageLayout:2})).bytes),hash(repaired.bytes));
 const sparse=(await convert(f.old49({dense:false,metadata:false,rtc:false}).bytes,{to:'E'})).bytes,sparsePlain=crypt.decode(sparse);
 for(let key=17;key<=41;key++)assert(inspect(crypt.encode(sparsePlain,key)).slots[0].valid,'New supplied key '+key);
 const unknownKey=key41.slice();unknownKey[4080]^=41^42;await reject(unknownKey,'START_FORMAT_KEY');
 for(const to of ['L','W','X','Y','Z'])await reject(key41,'START_FORMAT_DOWNGRADE',{to});
 // Invalid species are rejected, never erased as a side effect of migration.
 for(const value of [speciesLimit,65535])for(const area of ['box','egg','relive']){
  const bad=plain.slice(),physical=area==='box'?10:area==='egg'?89:95,b=block(bad,0,physical),offset=area==='box'?3371:area==='egg'?136:16;
  f.put16(b,offset+28,value);
  if(area==='box')f.seal(b,0,0x40,7,4080);else f.put16(b,6,area==='egg'?eggSum(b):reliveSum(b));
  await reject(crypt.encode(bad,30),'START_FORMAT_SPECIES');
 }
 const invalidRelive=plain.slice();block(invalidRelive,0,95)[20]^=1;await reject(crypt.encode(invalidRelive,30),'START_FORMAT_RELIVE');
 // Own-checksum exceptions require exactly the recognized magic and zero
 // footer, plus the keyed MAC. They are not a generic checksum bypass.
 for(const [physical,edit,code]of [
  [90,b=>f.put32(b,0,0x31524649),'AUTH'],[90,b=>f.put16(b,4086,1),'AUTH'],[90,b=>f.put32(b,4092,1),'AUTH'],
  [90,b=>f.put16(b,4,4),'AUTH'],[90,b=>f.put16(b,6,640),'AUTH'],[90,b=>b[20]^=1,'AUTH'],
  [89,b=>f.put32(b,0,0x58424746),'AUTH'],[89,b=>f.put16(b,4084,0x40),'AUTH'],[89,b=>f.put32(b,4092,1),'AUTH'],
  [89,b=>b[6]^=1,'EGG']
 ]){const bad=plain.slice();edit(block(bad,0,physical));await reject(crypt.encode(bad,30),'START_FORMAT_'+code);}
 for(const physical of [89,90]){const bad=native.slice();bad[physical*sector+4082]^=1;await reject(bad,'START_FORMAT_AUTH');}
 assert.equal(hash(native),nativeHash);assert.equal(hash(key41),key41Hash);
 console.log('PASS: E from old/L/W/X/Y/Z, 100 boxes/6000 records, EXP packing/tails, both eggs/relive blocks, native key 41 no-op, selected-slot/RTC ownership, narrow own-checksum/MAC validation, invalid species and downgrade rejection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
