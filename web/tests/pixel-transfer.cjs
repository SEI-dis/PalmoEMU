// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic WASM memory, authored cartridges and deterministic clocks; no user files.
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const {createPixelTransfer,choosePixelTransfer}=await import('../src/rendering/pixel-transfer.js');
 function module({rowCost=.002,packedCost=.001,corrupt=false}={}){
  const memory=new WebAssembly.Memory({initial:8}),width=240,height=160,raw=16384,packed=256000;
  const m={memory,time:0,loads:0,closes:0,frees:0,get HEAPU8(){return new Uint8Array(memory.buffer);},
   _malloc:()=>1024,_free:p=>{assert.equal(p,1024);m.frees++;},
   _web_load:(p,n)=>{assert.equal(n,8192);assert.equal(new DataView(memory.buffer).getUint32(p,true),0xeafffffe);assert.equal(m.HEAPU8[p+0xb2],0x96);m.loads++;return 1;},
   _web_close:()=>m.closes++,_web_width:()=>width,_web_height:()=>height,
   _web_pixels:()=>{m.time+=rowCost;return raw;},
   _web_rgba_pixels:()=>{m.time+=packedCost;const source=new Uint32Array(memory.buffer,raw,256*height),target=new Uint32Array(memory.buffer,packed,width*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++)target[y*width+x]=source[y*256+x]|0xff000000;if(corrupt)target[1]^=1;return packed;},
   _web_frame:()=>{throw Error('Calibration must never execute a frame');}
  };return m;
 }
 for(const [cost,want]of [[.001,'packed'],[.004,'rows'],[.0019,'rows']]){
  const m=module({packedCost:cost}),choice=choosePixelTransfer(m,{now:()=>m.time});
  assert.equal(choice.mode,want);assert.equal(choice.measured,true);
  assert.equal(m.loads,1);assert.equal(m.closes,1);assert.equal(m.frees,1);
 }
 const invalid=module({corrupt:true});assert.equal(choosePixelTransfer(invalid).measured,false);assert.equal(invalid.closes,1);assert.equal(invalid.frees,1);
 const coarse=module();assert.equal(choosePixelTransfer(coarse,{now:()=>0}).measured,false);assert.equal(coarse.closes,1);
 const slow=module();let time=0;assert.equal(choosePixelTransfer(slow,{now:()=>time+=5,budgetMs:1}).measured,false);assert.equal(slow.closes,1);
 const hidden=module();assert.equal(choosePixelTransfer(hidden,{isVisible:()=>false}).measured,false);assert.equal(hidden.loads,0);
 const interrupted=module();let checks=0;assert.equal(choosePixelTransfer(interrupted,{now:()=>interrupted.time,isVisible:()=>++checks<4}).measured,false);assert.equal(interrupted.closes,1);
 const legacy=module();delete legacy._web_rgba_pixels;assert.equal(choosePixelTransfer(legacy).mode,'rows');assert.equal(legacy.loads,0);
 for(const mode of ['rows','packed']){
  const m=module(),pixels=new Uint32Array(m.memory.buffer,16384,256*160);
  for(let i=0;i<pixels.length;i++)pixels[i]=i*431&0xffffff;
  const original=pixels.slice(),transfer=createPixelTransfer(m,240,160,mode),target=new Uint8Array(240*160*4);
  const verify=()=>{transfer.copy(target);const got=new Uint32Array(target.buffer),current=new Uint32Array(m.memory.buffer,16384,256*160);for(let y=0;y<160;y++)for(let x=0;x<240;x++)assert.equal(got[y*240+x],(current[y*256+x]|0xff000000)>>>0);};
  verify();assert.deepEqual(pixels,original,'Copy cannot mutate renderer pixels');
  m.memory.grow(1);new Uint32Array(m.memory.buffer,16384,256*160)[255*2+2]=0x123456;verify();
  if(mode==='packed'){m._web_rgba_pixels=()=>{throw Error('Packed unavailable');};verify();assert.equal(transfer.mode,'rows');}
  transfer.dispose();target.fill(17);assert.equal(transfer.copy(target),false);assert.ok(target.every(v=>v===17));
 }
 // Confirm the real bridge accepts and closes the calibration cartridge, then
 // both transfer paths work at GBA and GB/GBC dimensions on the same instance.
 const create=require(process.env.MGBA_CORE_PATH?path.resolve(process.env.MGBA_CORE_PATH):'../cores/mgba/mgba.js');
 const real=await create({print:()=>{},printErr:()=>{}}),frame=real._web_frame;let calibrationFrames=0;
 real._web_frame=()=>{calibrationFrames++;throw Error('Calibration must not run an emulated frame');};
 const choice=choosePixelTransfer(real);
 assert.ok(['rows','packed'].includes(choice.mode));assert.equal(calibrationFrames,0);assert.equal(real._web_platform(),-1,'Calibration closes its core');real._web_frame=frame;
 try{
  const cartridges=require('./cartridges.cjs');
  for(const [kind,rom]of [['gba',require('./link.cjs').cartridge(31,992)],['gb',cartridges.gb()],['gbc',cartridges.gbc()]]){
   const p=real._malloc(rom.length);assert.ok(p);try{real.HEAPU8.set(rom,p);assert.equal(real._web_load(p,rom.length),1);}finally{real._free(p);}
   for(let i=0;i<2;i++){real._web_frame(0);real._web_audio_read();}
   const w=real._web_width(),h=real._web_height();assert.deepEqual([w,h],kind==='gba'?[240,160]:[160,144]);
   const row=createPixelTransfer(real,w,h,'rows'),pack=createPixelTransfer(real,w,h,'packed'),a=new Uint8Array(w*h*4),b=new Uint8Array(a.length);
   try{row.copy(a);pack.copy(b);assert.equal(pack.mode,'packed');assert.deepEqual(a,b,kind+' transfer paths match');for(let i=3;i<a.length;i+=4)assert.equal(a[i],255);}finally{row.dispose();pack.dispose();}
   real._web_close();
  }
 }finally{real._web_close();}
 console.log('PASS: synthetic-only choice, speed margin, mismatch/timer/visibility fallback, cleanup, frame identity, memory growth and disposal.');
 console.log('PASS: real mGBA calibration cleanup and identical GBA/GB/GBC transfer pixels.',choice);
})().catch(error=>{console.error(error);process.exitCode=1;});
