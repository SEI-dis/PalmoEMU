// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),path=require('node:path');
const create=require(process.env.MGBA_CORE_PATH?path.resolve(process.env.MGBA_CORE_PATH):'../cores/mgba/mgba.js');
const {flash}=require('./core-upgrade.cjs');
const MiB=1048576;
function cartridge(){
 const rom=new Uint8Array(128*MiB),view=new DataView(rom.buffer),code=[],fixups=[];
 rom[0xb2]=0x96;rom.set(Buffer.from('AXVE'),0xac);view.setUint32(0,0xea00003e,true);
 const emit=v=>code.push(v>>>0),ldr=(r,value)=>{fixups.push({at:code.length,r,value});emit(0);};
 ldr(0,0x04000000);ldr(1,0x403);emit(0xe1c010b0);
 ldr(0,0x0b7fff00);for(const n of [0xb128,0x5a0e,3,0xfffc]){ldr(1,n);emit(0xe1c010b0);}
 ldr(0,0x0a001000);ldr(2,0x06000000);const loop=code.length;emit(0xe1d010b0);emit(0xe1c210b0);emit(0xea000000|((loop-code.length-2)&0xffffff));
 for(const f of fixups){code[f.at]=0xe59f0000|(f.r<<12)|((code.length-f.at)*4-8);code.push(f.value);}
 code.forEach((v,i)=>view.setUint32(0x100+i*4,v,true));view.setUint16(96*MiB+0x1000,0x03e0,true);return rom;
}
(async()=>{
 const m=await create({print:()=>{},printErr:()=>{}});
 const load=bytes=>{const p=m._malloc(bytes.length);assert.ok(p);m.HEAPU8.set(bytes,p);assert.equal(m._web_load_owned(p,bytes.length),1);};
 const frames=()=>{for(let n=0;n<30;n++){m._web_frame(0);m._web_audio_read();}};
 const save=()=>{const n=m._web_save_export();return m.HEAPU8.slice(m._web_save_data(),m._web_save_data()+n);};
 const input=(bytes,fn)=>{const p=m._malloc(bytes.length);assert.ok(p);m.HEAPU8.set(bytes,p);try{return fn(p,bytes.length);}finally{m._free(p);}};
 try{
  const rom=cartridge();load(rom);frames();const heap=m.HEAPU8.length;
  assert.ok(heap<210*MiB,'128 MiB RTC ROM must not allocate a second cartridge');
  const green=()=>{const p=m._web_pixels();assert.ok(m.HEAPU8[p]<10&&m.HEAPU8[p+1]>200,'Bank 3 at 96 MiB must be visible');};green();
  const n=m._web_state_export(),state=m.HEAPU8.slice(m._web_state_data(),m._web_state_data()+n);m._web_reset();assert.equal(input(state,(p,n)=>m._web_state_import(p,n)),1);frames();green();
  for(let repeat=0;repeat<3;repeat++){m._web_close();load(rom);frames();green();assert.equal(m.HEAPU8.length,heap,'Ownership does not leak over unload/reset/reload');}
  m._web_close();load(flash(255,true));frames();const battery=save();assert.equal(battery.length,16*MiB);assert.equal(battery[255*65536],0x3c);assert.equal(battery[0],0x5a);
  const size=m._web_state_export();assert.ok(size>32*MiB&&size<48*MiB,'16 MiB flash plus 16 MiB RAM state must fit the bridge');
  const checkpoint=m.HEAPU8.slice(m._web_state_data(),m._web_state_data()+size);m._web_reset();assert.equal(input(checkpoint,(p,n)=>m._web_state_import(p,n)),1);assert.deepEqual(save(),battery);
  assert.equal(input(battery,(p,n)=>m._web_save_import(p,n)),1);assert.deepEqual(save(),battery);
  for(const length of [6*MiB+17,16*MiB-1,16*MiB+17])assert.equal(input(new Uint8Array(length),(p,n)=>m._web_save_import(p,n)),0);
  console.log(`PASS: 128 MiB RTC ROM / bank 3 / reset-state / repeated ownership; heap ${heap/MiB} MiB; 16 MiB flash and ${size} byte states.`);
 }finally{m._web_close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
