// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored 68000 programs only. No game ROMs, BIOS files, or user saves.
const assert=require('node:assert/strict'),path=require('node:path');
const {md}=require('./cartridges.cjs');
function cartridge(build){
 const rom=new Uint8Array(4*1024*1024),view=new DataView(rom.buffer);rom.set(md());
 view.setUint32(0x1a4,rom.length-1);rom.set(Buffer.from('RA'),0x1b0);
 view.setUint16(0x1b2,0xf820);view.setUint32(0x1b4,0x200001);view.setUint32(0x1b8,0x203fff);
 rom[0x200001]=0x27;const words=[0x46fc,0x2700];
 const emit=(...values)=>words.push(...values);
 const write=(address,value)=>emit(0x13fc,value,address>>>16,address&0xffff);
 const read=address=>emit(0x1039,address>>>16,address&0xffff);
 const store=address=>emit(0x13c0,address>>>16,address&0xffff);
 build({emit,write,read,store});emit(0x60fe);
 words.forEach((word,i)=>view.setUint16(0x200+i*2,word));return rom;
}
function sramBit(){return cartridge(({write,read,store})=>{
 write(0xa130f1,3);write(0x200001,0x5a);
 write(0xa130f1,2);read(0x200001); // Write-protect bit alone must not map SRAM.
 write(0xa130f1,1);store(0x200003);write(0x200005,0x66);
});}
function bankBoundary(){return cartridge(({write,read,store})=>{
 write(0xa130f1,1);write(0x200001,0x5a);
 write(0xa130ff,1); // Last valid register (bank 7).
 write(0xa13101,0); // Invalid bank 8 must not clear cartridge_inserted.
 write(0x200003,0x66);read(0x200001);store(0x200005);
});}
function invalidFM(){return cartridge(({write})=>{
 write(0xa130f1,1);write(0xa11100,1); // Own the Z80 bus before YM2612 access.
 for(const register of [0x33,0x43,0x53,0x63,0x73,0x83,0x93,0xa3,0xb3]){
  write(0xa04002,register);write(0xa04003,0xff); // nonexistent channel 6
 }
 write(0xa04002,0xb2);write(0xa04003,0xc0); // valid channel remains usable
 write(0x200001,0x77);write(0x200003,0x66);
});}
function input(m,bytes,fn){const p=m._malloc(bytes.length);assert.ok(p);try{m.HEAPU8.set(bytes,p);return fn(p,bytes.length);}finally{m._free(p);}}
function load(m,rom){assert.equal(input(m,rom,(p,n)=>m._web_load(p,n)),1);}
function frames(m,n=3){for(let i=0;i<n;i++)m._web_frame(0);}
function save(m){const n=m._web_save_export();assert.equal(n,65536);return m.HEAPU8.slice(m._web_save_data(),m._web_save_data()+n);}
function oddBytes(m){const bytes=save(m);return [bytes[1],bytes[3],bytes[5]];}
function state(m){const n=m._web_state_export();assert.ok(n>0);return m.HEAPU8.slice(m._web_state_data(),m._web_state_data()+n);}
async function create(file){return require(path.resolve(file))({locateFile:()=>path.resolve(path.dirname(file),'core.wasm'),print:()=>{},printErr:()=>{}});}
async function check(candidateFile,baselineFile){
 const m=await create(candidateFile),old=baselineFile?await create(baselineFile):null;
 try{
  load(m,sramBit());frames(m);assert.deepEqual(oddBytes(m),[0x5a,0x27,0x66],'SRAM enable uses bit 0');
  load(m,bankBoundary());frames(m);assert.deepEqual(oddBytes(m),[0x5a,0x66,0x5a],'invalid bank 8 must not corrupt cartridge state');
  load(m,invalidFM());frames(m);assert.deepEqual(oddBytes(m).slice(0,2),[0x77,0x66],'invalid FM registers must not stop the core');
  console.log('PASS: ClownMDEmu SRAM bit, bank boundary, invalid FM registers');
  const rom=cartridge(()=>{});load(m,rom);frames(m);
  const source=old||m;if(old){load(old,rom);frames(old);}
  const battery=save(source);for(let i=0;i<battery.length;i++)battery[i]=(i*37+0x5a)&255;
  assert.equal(input(source,battery,(p,n)=>source._web_save_import(p,n)),1);
  const previous=state(source);load(m,rom);
  assert.equal(input(m,previous,(p,n)=>m._web_state_import(p,n)),1,'previous state must be accepted');
  assert.deepEqual(state(m),previous,'state bytes round-trip unchanged');
  assert.deepEqual(save(m),battery,'SRAM survives previous-state load');frames(m);
  assert.deepEqual(save(m),battery,'SRAM survives resumed execution');
  load(m,rom);assert.equal(input(m,battery,(p,n)=>m._web_save_import(p,n)),1);assert.deepEqual(save(m),battery);
  assert.equal(input(m,battery.subarray(1),(p,n)=>m._web_save_import(p,n)),0);assert.deepEqual(save(m),battery,'bad-sized save leaves existing data unchanged');
  assert.equal(input(m,previous.subarray(1),(p,n)=>m._web_state_import(p,n)),0);assert.deepEqual(save(m),battery,'bad-sized state leaves existing data unchanged');
  if(old){
   load(old,sramBit());frames(old);assert.equal(save(old)[3],0x5a,'baseline reproduces SRAM mapping bug');
   load(old,bankBoundary());frames(old);assert.notEqual(save(old)[3],0x66,'baseline reproduces bank-8 corruption');
   console.log('PASS: old binary reproduces both bus defects; old save/state preserved');
  }else console.log('PASS: save/state round-trip and invalid-size preservation');
 }finally{m._web_close();old?._web_close();}
}
if(require.main===module)check(process.argv[2]||path.join(__dirname,'../cores/md/core.js'),process.argv[3]).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={check};
