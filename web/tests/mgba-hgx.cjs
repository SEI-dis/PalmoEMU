// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored ARM programs exercise the public Web bridge. No user ROM/save data.
const assert=require('node:assert/strict'),path=require('node:path');

function cartridge({hgx=true,compressed=false,invalid=false,flip=0,ramPalette=false,descriptor=0x02000000}={}){
 const rom=new Uint8Array(32768),v=new DataView(rom.buffer),code=[],literals=[];
 const u16=(a,n)=>v.setUint16(a,n,true),u32=(a,n)=>v.setUint32(a,n>>>0,true);
 const word=n=>code.push(n>>>0);
 const load=(reg,value)=>{literals.push({index:code.length,reg,value});word(0);};
 const write=(address,value,half=false)=>{load(0,address);load(1,value);word(half?0xe1c010b0:0xe5801000);};
 u32(0,0xea00003e);rom[0xb2]=0x96;
 if(hgx){rom.set([72,71,88],0xb5);u32(0xb8,0x040003e0);}
 write(0x04000000,0x0100,true); // mode 0, BG0
 write(0x04000008,0x0100,true); // screen map at VRAM + 0x800
 write(0x05000002,0x03e0,true); // native green tile
 for(let row=0;row<8;row++)write(0x06000000+row*4,0x11111111);
 write(0x02000000,0x32584748);write(0x02000004,1);write(0x02000008,0x08004000);
 write(0x02000502,0x7c00,true);write(0x040003e0,descriptor);
 word(0xeafffffe);
 for(const literal of literals){const at=code.length*4,delta=at-literal.index*4-8;
  assert.ok(delta>=0&&delta<4096);code[literal.index]=(0xe59f0000|(literal.reg<<12)|delta)>>>0;word(literal.value);}
 code.forEach((n,i)=>u32(0x100+i*4,n));
 rom.fill(0x11,0x2000,0x2020);rom[0x2003]=0x21; // rightmost pixel uses blue
 u16(0x2102,0x001f);u16(0x2104,0x7c00);
 u32(0x2200,0x2010); // BIOS LZ77, 32 output bytes, literal blocks
 for(let g=0;g<4;g++)rom.set(rom.slice(0x2000+g*8,0x2008+g*8),0x2205+g*9);
 for(let i=0;i<1024;i++){
  u32(0x4000+i*12,(invalid?0x0bfffffc:(compressed?0x08002200:0x08002000))|flip);
  u32(0x4004+i*12,ramPalette?0x02000500:0x08002100);
  u32(0x4008+i*12,compressed?0x80000000:0);
 }
 let checksum=-0x19;for(let i=0xa0;i<=0xbc;i++)checksum-=rom[i];rom[0xbd]=checksum&255;
 return rom;
}
module.exports={cartridge};
if(require.main===module)(async()=>{
 const create=require(process.env.MGBA_CORE_PATH?path.resolve(process.env.MGBA_CORE_PATH):'../cores/mgba/mgba.js');
 const make=()=>create({print:()=>{},printErr:()=>{}}),m=await make();
 const input=(core,bytes,fn)=>{const p=core._malloc(bytes.length);assert.ok(p);try{core.HEAPU8.set(bytes,p);return fn(p,bytes.length);}finally{core._free(p);}};
 const load=(core,rom)=>assert.equal(input(core,rom,core._web_load),1);
 const frames=core=>{for(let i=0;i<4;i++){core._web_frame(0);core._web_audio_read();}};
 const pixel=core=>[...core.HEAPU8.slice(core._web_rgba_pixels(),core._web_rgba_pixels()+3)];
 const color=(core,expected,label)=>assert.deepEqual(pixel(core),expected,label);
 try{
  for(const [options,expected,label] of [
   [{hgx:false},[0,255,0],'ordinary ROM retains native VRAM'],
   [{},[255,0,0],'HGX raw tile and palette'],
   [{flip:1},[0,0,255],'HGX horizontal flip'],
   [{ramPalette:true},[0,0,255],'HGX live RAM palette'],
   [{compressed:true},[255,0,0],'HGX LZ77 resource'],
   [{invalid:true},[0,255,0],'unsafe raw reference falls back'],
   [{compressed:true,invalid:true},[0,255,0],'unsafe compressed reference falls back'],
   [{descriptor:0x0203fff0},[0,255,0],'truncated descriptor falls back']
  ]){load(m,cartridge(options));frames(m);color(m,expected,label);console.log('PASS: '+label);}
  const rom=cartridge({compressed:true});load(m,rom);frames(m);
  const n=m._web_state_export();assert.ok(n);const state=m.HEAPU8.slice(m._web_state_data(),m._web_state_data()+n);
  const fresh=await make();try{load(fresh,rom);assert.equal(input(fresh,state,fresh._web_state_import),1);frames(fresh);
   color(fresh,[255,0,0],'HGX descriptor and LZ77 cache rebuild after state transfer');
  }finally{fresh._web_close();}
  console.log('PASS: HGX state restoration in a fresh WASM module');
  load(m,cartridge({hgx:false}));frames(m);color(m,[0,255,0],'normal load after HGX releases extension state');
  console.log('PASS: return to ordinary ROM after HGX');
 }finally{m._web_close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
