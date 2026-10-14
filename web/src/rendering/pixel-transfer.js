// SPDX-License-Identifier: MPL-2.0 OR AGPL-3.0-or-later
// Adapted from liru55 and contributors, pm-start/mgba-celio-web web/app.js,
// 23235bc6db1b67009808c0dc7e1f25131eb75e7a, choosePixelTransfer/drawFrame.
// https://github.com/pm-start/mgba-celio-web/blob/23235bc6db1b67009808c0dc7e1f25131eb75e7a/web/app.js#L720
// Modified 2026-10-13: synthetic cartridge/frame only, bounded startup sampling,
// equality check, and transferable cached views that survive WASM memory growth.
// MPL-covered adaptation additionally offered under AGPL-3.0-or-later for this
// combined application under MPL section 3.3; see ../../MPL_SECONDARY_LICENSE.md.

export function createPixelTransfer(m,width,height,preferred='rows'){
 let mode=preferred==='packed'&&typeof m._web_rgba_pixels==='function'?'packed':'rows';
 let memory,base=-1,rows,packed,disposed=false;
 const clear=()=>{memory=null;base=-1;rows=packed=null;};
 function copy(target){
  if(disposed)return false;
  let pointer;
  if(mode==='packed'){
   try{pointer=m._web_rgba_pixels();}catch{mode='rows';clear();}
  }
  if(mode==='rows')pointer=m._web_pixels();
  // A C call can grow memory. Acquire the current heap after that call.
  const heap=m.HEAPU8;
  if(memory!==heap.buffer||base!==pointer){
   clear();memory=heap.buffer;base=pointer;
   if(mode==='packed')packed=new Uint8Array(memory,pointer,width*height*4);
   else rows=Array.from({length:height},(_,y)=>new Uint8Array(memory,pointer+y*256*4,width*4));
  }
  if(mode==='packed')target.set(packed);
  else{
   for(let y=0;y<height;y++)target.set(rows[y],y*width*4);
   for(let i=3;i<width*height*4;i+=4)target[i]=255;
  }
  return true;
 }
 return {copy,get mode(){return mode;},dispose(){disposed=true;clear();m=null;}};
}

// Call only before loading the user's cartridge. No emulated frame, user ROM,
// save, state, storage, or network operation participates in calibration.
export function choosePixelTransfer(m,{now=()=>performance.now(),budgetMs=16,isVisible=()=>!globalThis.document?.hidden}={}){
 const fallback={mode:'rows',measured:false};
 const required=['_malloc','_free','_web_load','_web_close','_web_width','_web_height','_web_pixels','_web_rgba_pixels'];
 if(!isVisible()||required.some(name=>typeof m[name]!=='function'))return fallback;
 let pointer=0,loaded=false,rows,packed;
 try{
  const rom=new Uint8Array(8192);
  new DataView(rom.buffer).setUint32(0,0xeafffffe,true);rom[0xb2]=0x96;
  pointer=m._malloc(rom.length);if(!pointer)return fallback;
  m.HEAPU8.set(rom,pointer);loaded=true;
  if(!m._web_load(pointer,rom.length))return fallback;
  const width=m._web_width(),height=m._web_height();
  if(width!==240||height!==160)return fallback;
  const pixelPointer=m._web_pixels(),source=new Uint32Array(m.HEAPU8.buffer,pixelPointer,256*height);
  for(let i=0;i<source.length;i++)source[i]=(Math.imul(i,17833)^0x5a1739)&0xffffff;
  rows=createPixelTransfer(m,width,height,'rows');packed=createPixelTransfer(m,width,height,'packed');
  const a=new Uint8Array(width*height*4),b=new Uint8Array(a.length);
  rows.copy(a);packed.copy(b);
  if(packed.mode!=='packed'||a.some((value,i)=>value!==b[i]))return fallback;
  const start=now(),budget=Math.max(1,Math.min(24,Number(budgetMs)||16));
  if(!Number.isFinite(start))return fallback;
  const expired=()=>{const time=now();return !isVisible()||!Number.isFinite(time)||time<start||time-start>=budget;};
  for(let i=0;i<4;i++){if(expired())return fallback;rows.copy(a);packed.copy(b);}
  const timings={rows:[],packed:[]};
  for(let round=0;round<3;round++){
   // Alternate order so that warm-up or thermal drift does not favour one path.
   for(const name of round%2?['packed','rows']:['rows','packed']){
    const transfer=name==='rows'?rows:packed,target=name==='rows'?a:b;
    if(expired())return fallback;
    const before=now();
    for(let n=0;n<16;n++){transfer.copy(target);if(n%4===3&&expired())return fallback;}
    const elapsed=now()-before;
    // Coarsened/unstable clocks cannot justify switching the fixed fallback.
    if(!Number.isFinite(elapsed)||elapsed<=0)return fallback;
    timings[name].push(elapsed/16);
   }
  }
  if(packed.mode!=='packed')return fallback;
  const rowTime=Math.min(...timings.rows),packedTime=Math.min(...timings.packed);
  return {mode:packedTime<rowTime*.9?'packed':'rows',measured:true,rowMilliseconds:rowTime,packedMilliseconds:packedTime};
 }catch{return fallback;}
 finally{
  rows?.dispose();packed?.dispose();
  if(loaded)try{m._web_close();}catch{}
  if(pointer)try{m._free(pointer);}catch{}
 }
}
