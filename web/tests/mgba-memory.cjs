// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored cartridges only; no user ROM/save or browser profile is accessed.
const assert=require('node:assert/strict'),path=require('node:path');
const create=require(process.env.MGBA_CORE_PATH?path.resolve(process.env.MGBA_CORE_PATH):'../cores/mgba/mgba.js');
const {gba64}=require('./core.cjs');
const mib=1048576;
(async()=>{
 const rom=gba64();
 async function measure(owned){
  const m=await create({print:()=>{},printErr:()=>{}});
  const load=bytes=>{
   const p=m._malloc(bytes.length);assert.ok(p);m.HEAPU8.set(bytes,p);
   if(owned)return m._web_load_owned(p,bytes.length);
   try{return m._web_load(p,bytes.length);}finally{m._free(p);}
  };
  assert.equal(load(rom),1);
  const heap=m.HEAPU8.byteLength;
  for(let i=0;i<10;i++){m._web_frame(0);m._web_audio_read();}
  const pixel=[...m.HEAPU8.slice(m._web_pixels(),m._web_pixels()+4)];
  assert.ok(pixel[1]>200&&pixel[0]<10&&pixel[2]<10,'Second ROM bank renders green');
  if(owned){
   // Failed transfers must consume their allocation too. Repeated invalid
   // and valid 64 MiB loads fit the same heap after explicit close.
   const invalid=new Uint8Array(rom.length);
   for(let i=0;i<4;i++){
    m._web_close();assert.equal(load(invalid),0);assert.equal(load(rom),1);
    assert.equal(m.HEAPU8.byteLength,heap,'Load/failure/close does not accumulate ROM allocations');
   }
   m._web_close();
   const p=m._malloc(1024);assert.equal(m._web_load_owned(p,0),0);
   assert.equal(m._web_load_owned(0,rom.length),0);
   const n=m._malloc(1024);assert.equal(n,p,'Rejected zero-size transfer frees ownership');m._free(n);
  }
  m._web_close();m._web_close();return {heap,pixel};
 }
 const copying=await measure(false),owned=await measure(true);
 assert.deepEqual(owned.pixel,copying.pixel,'Original copying ABI preserves output');
 assert.ok(owned.heap<112*mib,'64 MiB cartridge load stays below 112 MiB WASM capacity');
 assert.ok(copying.heap-owned.heap>=48*mib,'Transfer removes at least 48 MiB of heap growth');
 console.log(`PASS: copying ${copying.heap/mib} MiB -> transferred ${owned.heap/mib} MiB WASM capacity; repeated failure/reload, ownership and identical rendering.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
