// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored scanline program. No game code, user ROMs or saves.
const assert=require('node:assert/strict'),path=require('node:path');
function scanlineTrace(){
 const bytes=new Uint8Array(1024),view=new DataView(bytes.buffer),code=[],labels=new Map(),fixups=[];
 bytes[0xb2]=0x96;view.setUint32(0,0xea00003e,true);
 const word=value=>code.push(value>>>0),label=name=>labels.set(name,code.length);
 const branch=(condition,target)=>{fixups.push({at:code.length,target,condition});word(0);};
 const literal=(reg,target)=>{fixups.push({at:code.length,target,reg});word(0);};
 literal(4,'status');literal(5,'vram');literal(7,'control');literal(1,'green');
 word(0xe1c510b0);word(0xe3a00b01);word(0xe3800003);word(0xe1c700b0);
 label('visible');word(0xe1d430b0);word(0xe3130002);branch(1,'visible');
 label('blank');word(0xe1d430b0);word(0xe3130002);branch(0,'blank');
 // OBJ affine BIOS call with a zero-sized input: safe, and one DEBUG trace
 // per scanline in an unconfigured mGBA logger, as in raster-effect handlers.
 word(0xe3a00000);word(0xe3a01000);word(0xe3a02000);word(0xef0f0000);branch(14,'visible');
 label('status');word(0x04000004);label('vram');word(0x06000000);label('control');word(0x04000000);label('green');word(0x03e0);
 for(const fix of fixups){const offset=(labels.get(fix.target)-fix.at-2)*4;code[fix.at]=fix.reg===undefined?((fix.condition<<28)|0x0a000000|((offset>>2)&0xffffff))>>>0:(0xe59f0000|(fix.reg<<12)|offset)>>>0;}
 code.forEach((value,i)=>view.setUint32(0x100+i*4,value,true));return bytes;
}
module.exports={scanlineTrace};
if(require.main===module)(async()=>{
 const create=require(process.env.MGBA_CORE_PATH?path.resolve(process.env.MGBA_CORE_PATH):'../cores/mgba/mgba.js');
 const output=[],m=await create({print:value=>output.push(value),printErr:value=>output.push(value)});
 const load=bytes=>{const ptr=m._malloc(bytes.length);m.HEAPU8.set(bytes,ptr);try{assert.equal(m._web_load(ptr,bytes.length),1);}finally{m._free(ptr);}};
 try{
  for(let run=0;run<2;run++){
   load(scanlineTrace());for(let i=0;i<30;i++){m._web_frame(0);m._web_audio_read();}
   const pixel=m.HEAPU8.slice(m._web_rgba_pixels(),m._web_rgba_pixels()+4);assert.ok(pixel[1]>200&&pixel[0]===0&&pixel[2]===0,'BIOS polling program still renders the authored green pixel');
   assert.ok(output.length<=8,`Raster processing must not flood the browser console (${output.length} messages)`);
   const length=m._web_state_export();assert.ok(length>0);assert.equal(m._web_state_import(m._web_state_data(),length),1);m._web_reset();
  }
  // The logger also covers an independent second instance and GB shutdown.
  m._web_select(1);load(require('./mgba-save-completion.cjs').keySaveGB());for(let i=0;i<30;i++)m._web_frame(1);
  assert.ok(output.length<=16,'Secondary GB core cannot re-enable native trace logging');
 }finally{m._web_select(1);m._web_close();m._web_select(0);m._web_close();}
 console.log('PASS: scanline BIOS/DMA logging remains bounded across load/reset/state and independent GB cores.');
})().catch(error=>{console.error(error);process.exitCode=1;});
