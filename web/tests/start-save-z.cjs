// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored records/flash only; no supplied ROM, save, or converter output.
const assert=require('node:assert/strict'),f=require('./helpers/start-save-format-fixtures.cjs'),crypt=require('./helpers/start-save-keyed-fixture.cjs');
const {hash}=require('./helpers/start-save-fixtures.cjs');
(async()=>{
 const {convertFormatSave:convert,inspectFormatSave:inspect}=await import('../src/start-save/format-l.js');
 const api=await import('../src/start-save/migration.js'),{startSaveCompatibility:compat}=await import('../src/start-save/compatibility.js');
 const target={version:'0.62.0',minimumSaveVersion:'0.36.2',saveFormat:'Z'};
 const original=f.old49({second:true}),before=hash(original.bytes);
 const y=await convert(original.bytes,{to:'Y',storageLayout:2}),z=await convert(y.bytes,{to:'Z',storageLayout:2});
 assert.equal(hash(original.bytes),before);assert.equal(z.report.recordsVerified,6000);
 assert.ok(inspect(y.bytes).slots.every(s=>s.valid&&s.format==='Y'&&s.boxes===50&&s.versionStamp===0x3b06));
 assert.ok(inspect(z.bytes).slots.every(s=>s.valid&&s.format==='Z'&&s.boxes===100&&s.versionStamp===0x3d00));
 for(const slot of [0,1]){
  const a=f.newLayout(y.bytes,slot,'Y',crypt.decode),b=f.newLayout(z.bytes,slot,'Z',crypt.decode);
  for(let box=0;box<100;box++)for(let pos=0;pos<30;pos++)assert.deepEqual(b.readRecord(box,pos),box<50?a.readRecord(box,pos):new Uint8Array(78));
 }
 assert.equal(api.detectStartSaveVersion(z.bytes),'0.61.0');
 assert.equal(compat('0.59.5',target).status,'convert');assert.equal(compat('0.60.0',target).status,'convert');
 assert.equal(compat('0.61.0',target).status,'compatible');assert.equal(compat('0.62.0',{...target,version:'0.61.0'}).status,'downgrade');
 assert.equal(compat('0.62.0',{...target,version:'0.63.1'}).status,'compatible');
 assert.equal(compat('0.61.0',{version:'0.62.0',minimumSaveVersion:null}).status,'unknown');
 const p=crypt.decode(z.bytes),stride=8388608;
 // Populate all 51-100 boxes, including nonzero bytes on species-zero records,
 // and distinct names/wallpapers in both adventures using authored page maps.
 for(const slot of [0,1]){
  const base=slot*stride,p0=p.subarray(base+10*4096,base+11*4096);
  for(let page=0;page<29;page++){
   const sec=p.subarray(base+(218+page)*4096,base+(219+page)*4096);sec.fill(0);p0[4012+page]=186+page;
   for(let i=0;i<52;i++){const global=page*52+i;if(global>=1500)break;const at=i*78;sec.set(f.record(50+Math.floor(global/30),global%30,{seed:slot*13,empty:global===1499}),at);sec.fill((global+17)%255+1,at+58,at+78);}
   if(page===28)for(let i=0;i<500;i++)sec[3432+i]=(i*19+slot+1)&255;
   f.seal(sec,0,0x40+32+page,7,4080);
  }
  f.put16(p0,0x245,0x3e00);f.seal(p0,0,0x40,7,4080);
 }
 const native=crypt.encode(p,16),nativeHash=hash(native),info=inspect(native);
 assert.ok(info.slots.every(s=>s.valid&&s.format==='Z'&&s.mons===2998));
 assert.equal(hash((await api.migrateStartSave(native,{from:'0.62.0',target})).bytes),nativeHash,'Every native byte, 100 boxes, names/wallpapers, RTC and both adventures stays unchanged');
 await assert.rejects(convert(native,{to:'Y',storageLayout:2}),{code:'START_FORMAT_DOWNGRADE'});
 const reject=async(raw,code)=>{const snapshot=hash(raw);await assert.rejects(convert(raw,{to:'Z',storageLayout:2}),{code});assert.equal(hash(raw),snapshot);};
 for(const edit of [b=>b[10*4096+4012]=185,b=>b[10*4096+4013]=b[10*4096+4012],b=>b[10*4096+4011]=0]){
  const b=p.slice();edit(b);f.seal(b.subarray(10*4096,11*4096),0,0x40,7,4080);await reject(crypt.encode(b,16),edit.toString().includes('4011')?'START_FORMAT_NEW_MAP':'START_FORMAT_PAGE_MAP');
 }
 let bad=p.slice();bad[218*4096+400]^=1;await reject(crypt.encode(bad,16),'START_FORMAT_AUTH');
 bad=crypt.decode(y.bytes);bad[218*4096]=1;await reject(crypt.encode(bad,7),'START_FORMAT_STORAGE_CONFLICT');
 const one=await convert(y.bytes,{to:'Z',selection:1,storageLayout:2});assert.equal(hash(one.bytes.subarray(0,stride)),hash(y.bytes.subarray(0,stride)));
 assert.deepEqual(z.bytes.slice(-16),original.bytes.slice(-16));
 // Party/daycare high-bit ownership and its two raw sectors survive conversion.
 const pooled=crypt.decode(y.bytes),body=f.newLayout(y.bytes,0,'Y',crypt.decode).sb1;
 f.put32(body,0x448,0x314c5053);f.put16(body,0x44c,3);body[0x450]=1;body[0x451]=2;body[0x452]=1;
 const block=pooled.subarray(93*4096,94*4096);block.fill(0);f.put32(block,0,0x424c5053);f.put16(block,4,1);f.put16(block,8,3);f.put16(block,10,2);
 const poolSum=(at,size)=>{let sum=0x5350;for(let i=0;i<size;i++)sum+=block[at+i]+(i&255);return sum&65535;};
 for(const [i,owner]of [0x38,0x2f80].entries()){
  const pid=0x12345670+i;f.put32(body,owner,pid);f.put32(body,owner+4,0x6789);
  const at=16+i*32;f.put32(block,at,pid);for(let k=0;k<12;k++)f.put16(block,at+4+k*2,300+i+k);
  f.put16(block,at+28,poolSum(at,28));f.put16(block,at+30,0x6789);
 }
 f.put16(block,6,poolSum(16,64));f.seal(block,0,0x70,7,4080);
 for(let bank=0;bank<2;bank++){let offset=0;for(let id=1;id<5;id++){
  const sec=pooled.subarray((bank*5+id)*4096,(bank*5+id+1)*4096);sec.set(body.subarray(offset,offset+f.mainSizes[id]));offset+=f.mainSizes[id];f.seal(sec,0,id,bank===1?7:6,f.mainSizes[id]);
 }}
 const poolInput=crypt.encode(pooled,8),poolOutput=await convert(poolInput,{to:'Z',storageLayout:2});
 assert.equal(hash(poolOutput.bytes.subarray(92*4096,94*4096)),hash(poolInput.subarray(92*4096,94*4096)));
 assert.equal(hash(f.newLayout(poolOutput.bytes,0,'Z',crypt.decode).sb1),hash(body));
 const emptyPoolEntry=pooled.slice(),emptyBlock=emptyPoolEntry.subarray(93*4096,94*4096);emptyBlock.fill(0,48,80);
 let emptySum=0x5350;for(let i=0;i<64;i++)emptySum+=emptyBlock[16+i]+i;
 f.put16(emptyBlock,6,emptySum&65535);f.seal(emptyBlock,0,0x70,7,4080);
 assert.ok(inspect(crypt.encode(emptyPoolEntry,8)).slots.every(s=>s.valid),'Empty pool entries are valid even inside the declared count');
 bad=pooled.slice();bad[93*4096+16+4]^=1;f.seal(bad.subarray(93*4096,94*4096),0,0x70,7,4080);await reject(crypt.encode(bad,8),'START_FORMAT_POOL');
 const eggs=require('./helpers/start-save-egg-fixture.cjs').eggs(native,{stamp:0x3e00,key:16});
 assert.ok(inspect(eggs).slots.every(s=>s.valid&&s.eggStale));
 const repaired=await convert(eggs,{to:'Z',storageLayout:2});
 for(const slot of [0,1])for(const [a,b]of [[0,88*4096],[90*4096,stride]])assert.equal(hash(repaired.bytes.subarray(slot*stride+a,slot*stride+b)),hash(eggs.subarray(slot*stride+a,slot*stride+b)));
 assert.ok(inspect(repaired.bytes).slots.every(s=>s.valid&&!s.eggStale&&s.boxes===100));
 // The independent codec exercises each newly supplied key on sparse saves.
 const sparse=(await convert(f.old49({dense:false,metadata:false,rtc:false}).bytes,{to:'Y'})).bytes,plain=crypt.decode(sparse);
 for(let index=8;index<=16;index++)assert.ok(inspect(crypt.encode(plain,index)).slots[0].valid,'Key '+index);
 console.log('PASS: Y/Z boundary, 6000 record verification, both adventures, all 100-box pages/metadata, new keys, unknown/corrupt pages, no downgrade and raw ownership.');
})().catch(e=>{console.error(e);process.exitCode=1;});
