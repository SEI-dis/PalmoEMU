// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),f=require('./helpers/start-save-format-fixtures.cjs'),crypt=require('./helpers/start-save-keyed-fixture.cjs');
const {hash}=require('./helpers/start-save-fixtures.cjs');
const eggFixture=require('./helpers/start-save-egg-fixture.cjs');
(async()=>{
 const {convertFormatSave:convert,inspectFormatSave:inspect}=await import('../src/start-save/format-l.js');
 const api=await import('../src/start-save/migration.js'),{startSaveCompatibility:compat}=await import('../src/start-save/compatibility.js');
 const target={version:'0.59.6',minimumSaveVersion:'0.36.2',saveFormat:'X'};
 const source=f.old49({second:true}),before=hash(source.bytes),w=await convert(source.bytes,{to:'W'});
 const plain=crypt.decode(w.bytes),eggSum=b=>{let sum=0x4547;for(let i=16;i<136+30*(f.u16(b,4)===1?63:78);i++)sum+=b[i]+((i-16)&255);return sum&65535;};
 for(const base of [0,f.slotBytes])for(const physical of [88,89]){
  const egg=plain.subarray(base+physical*4096,base+(physical+1)*4096);egg.fill(0);f.put32(egg,0,0x58424745);f.put16(egg,4,1);f.put32(egg,8,physical);
  for(let i=16;i<136+30*63;i++)egg[i]=(i*7+physical)&255;f.put16(egg,6,eggSum(egg));
 }
 const keyed=crypt.encode(plain,2),converted=await convert(keyed,{to:'X',storageLayout:2});
 assert.ok(inspect(converted.bytes).slots.every(s=>s.valid&&s.format==='X'&&s.versionStamp===0x3b02));
 for(const slot of [0,1]){
  const previous=f.newLayout(w.bytes,slot,'W'),after=f.newLayout(converted.bytes,slot,'X',crypt.decode);
  for(let box=0;box<50;box++)for(let pos=0;pos<30;pos++){
   const actual=after.readRecord(box,pos);assert.equal(actual.length,78);assert.deepEqual(actual.slice(0,63),previous.readRecord(box,pos),`All record bytes slot ${slot} box ${box+1}/${pos+1}`);assert.ok(actual.slice(63).every(v=>v===0));
  }
  for(const physical of [88,89]){
   const old=plain.subarray(slot*f.slotBytes+physical*4096,slot*f.slotBytes+(physical+1)*4096),egg=after.decoded.subarray(slot*8388608+physical*4096,slot*8388608+(physical+1)*4096);
   assert.equal(f.u16(egg,4),2);assert.equal(f.u16(egg,6),eggSum(egg));assert.deepEqual(egg.slice(8,136),old.slice(8,136));
   for(let i=0;i<30;i++){assert.deepEqual(egg.slice(136+i*78,136+i*78+63),old.slice(136+i*63,136+(i+1)*63));assert.ok(egg.slice(136+i*78+63,136+(i+1)*78).every(v=>v===0));}
  }
 }
 const nativePlain=crypt.decode(converted.bytes);
 // Preserve nonzero new EV/IV high bits, including species-zero records.
 for(const base of [0,8388608]){const p=nativePlain.subarray(base+10*4096,base+11*4096);f.put16(p,0x245,0x3b05);p.fill(0xa5,3371+63,3371+78);f.seal(p,0,0x40,f.u32(p,4092),4080);}
 const native=crypt.encode(nativePlain);assert.equal(api.detectStartSaveVersion(native),'0.59.5');
 assert.deepEqual((await api.migrateStartSave(native,{from:'0.59.5',target})).bytes,native,'Native X and all new bits are a raw no-op');
 assert.equal(compat('0.59.1',target).status,'convert');assert.equal(compat('0.59.2',target).status,'compatible');
 assert.equal(compat('0.59.5',{...target,version:'0.60.1'}).status,'compatible');
 assert.equal(compat('0.59.5',{version:'0.59.1',minimumSaveVersion:'0.36.2',saveFormat:'W'}).status,'downgrade');
 const migrated=await api.migrateStartSave(source.bytes,{from:'0.49.0',target});assert.equal(api.detectStartSaveVersion(migrated.bytes),'0.59.2');
 for(const index of [1,2,3,4,5,6,7]){const value=crypt.encode(index<3?crypt.decode(w.bytes):nativePlain,index);assert.ok(inspect(value).slots.every(s=>s.valid),'Known key '+index);}
 const reject=async(bytes,code)=>{const before=hash(bytes);await assert.rejects(convert(bytes,{to:'X',storageLayout:2}),{code});assert.equal(hash(bytes),before);};
 let broken=native.slice();broken[4080]^=0x80;await reject(broken,'START_FORMAT_KEY');
 broken=native.slice();broken[4082]^=1;await reject(broken,'START_FORMAT_AUTH');
 broken=native.slice();broken[100]^=1;await reject(broken,'START_FORMAT_AUTH');
 broken=keyed.slice();broken[88*4096+136]^=1;await reject(broken,'START_FORMAT_EGG');
 broken=keyed.slice();broken[160*4096]=3;await reject(broken,'START_FORMAT_STORAGE_CONFLICT');
 await assert.rejects(convert(native,{to:'W',storageLayout:2}),{code:'START_FORMAT_DOWNGRADE'});
 const selected=await convert(keyed,{to:'X',selection:1});assert.deepEqual(selected.bytes.slice(0,f.slotBytes),keyed.slice(0,f.slotBytes));
 assert.deepEqual(converted.bytes.slice(-16),source.bytes.slice(-16));assert.equal(hash(source.bytes),before);
 for(const aligned of [true,false]){
  const withEggs=eggFixture.eggs(w.bytes,{aligned,key:2}),inputHash=hash(withEggs);
  const output=await convert(withEggs,{to:'X',storageLayout:2}),old=crypt.decode(withEggs),now=crypt.decode(output.bytes);
  for(const slot of [0,1])for(const physical of [88,89]){
   const a=old.subarray(slot*f.slotBytes+physical*4096,slot*f.slotBytes+(physical+1)*4096),b=now.subarray(slot*8388608+physical*4096,slot*8388608+(physical+1)*4096);
   assert.equal(f.u16(b,4),2);assert.equal(f.u16(b,6),eggFixture.sum(b));assert.deepEqual(b.slice(8,136),a.slice(8,136));
   for(let i=0;i<30;i++){assert.deepEqual(b.slice(136+i*78,136+i*78+63),a.slice(136+i*63,136+(i+1)*63));assert.ok(b.slice(136+i*78+63,136+(i+1)*78).every(v=>v===0));}
  }
  assert.equal(hash(withEggs),inputHash,'Native and old-tool egg input preserved');
 }
 const stale=eggFixture.eggs(native,{stamp:0x3b06,key:7}),staleHash=hash(stale);
 assert.equal(api.detectStartSaveVersion(stale),'0.59.6');
 assert.ok(inspect(stale).slots.every(s=>s.valid&&s.eggStale));
 assert.equal(api.inspectStartUpdate(stale,'0.59.6',target).compatibility.status,'convert','Same-version X still needs stale egg repair');
 const fixed=await api.migrateStartSave(stale,{from:'0.59.6',target});
 assert.ok(inspect(fixed.bytes).slots.every(s=>s.valid&&!s.eggStale&&s.versionStamp===0x3b06));
 assert.equal(api.inspectStartUpdate(fixed.bytes,'0.59.6',target).compatibility.status,'compatible');
 for(const slot of [0,1])for(const [a,b] of [[0,88*4096],[90*4096,8388608]])assert.deepEqual(fixed.bytes.subarray(slot*8388608+a,slot*8388608+b),stale.subarray(slot*8388608+a,slot*8388608+b),'Repair changes only egg blocks, not native keys/counters/EV-IV data');
 assert.deepEqual(fixed.bytes.slice(-16),stale.slice(-16));assert.equal(hash(stale),staleHash);
 const one=await convert(stale,{to:'X',storageLayout:2,selection:1});assert.deepEqual(one.bytes.slice(0,8388608),stale.slice(0,8388608));
 assert.deepEqual((await convert(fixed.bytes,{to:'X',storageLayout:2})).bytes,fixed.bytes,'Already repaired X remains a raw no-op');
 for(const edit of [b=>b[88*4096+136]^=1,b=>b.fill(255,88*4096,89*4096),b=>f.put16(b,88*4096+4,99)]){
  const invalid=crypt.decode(stale);edit(invalid);await reject(crypt.encode(invalid,7),'START_FORMAT_EGG');
 }
 console.log('PASS: X 3000 boxed records/120 egg records, all seven keys, native/legacy egg checksums, same-format repair, active-egg rejection, integrity/EV-IV/raw ownership and format boundaries.');
})().catch(e=>{console.error(e);process.exitCode=1;});
