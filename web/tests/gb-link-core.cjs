// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored SM83 cartridges and generated RAM only. No user ROM/save or network.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

function cartridge({color=false,fast=false,transfers=3,externalOnly=false,idle=false,doubleSpeed=false}={}){
 const rom=new Uint8Array(32768);rom.set([0xc3,0x50,0x01],0x100);rom.set([0xce,0xed,0x66,0x66],0x104);
 rom.set(Buffer.from('PALMO GB LINK'),0x134);rom[0x143]=color?0x80:0;rom[0x147]=3;rom[0x149]=2;
 const code=[],labels=new Map(),jumps=[];
 const emit=(...bytes)=>code.push(...bytes),label=name=>labels.set(name,code.length),jump=(opcode,name)=>{emit(opcode,0);jumps.push([code.length-1,name]);};
 const store=address=>emit(0xea,address&255,address>>8),load=address=>emit(0xfa,address&255,address>>8);
 emit(0xf3,0x31,0xfe,0xff,0x3e,0x0a);store(0x0000); // DI; SP; enable independent MBC1 RAM.
 if(color&&doubleSpeed)emit(0x3e,1,0xe0,0x4d,0x10,0x00); // CGB KEY1 + STOP switches CPU speed.
 if(!idle)for(let i=0;i<transfers;i++){
  emit(0xaf,0xe0,0x0f);load(0xa001);emit(0xc6,i,0xe0,0x01); // Clear IF; load outgoing SB.
  load(0xa000);if(i&1)emit(0xee,1);emit(0xe6,1); // Alternate the internal-clock player.
  if(externalOnly)emit(0xaf);
  jump(0x28,'external'+i);
  emit(0x06,64);label('delay'+i);emit(0x05);jump(0x20,'delay'+i);
  emit(0x0e,fast?0x83:0x81);jump(0x18,'start'+i);
  label('external'+i);emit(0x0e,0x80);
  label('start'+i);emit(0xf0,0x04);store(0xa010+i*2); // DIV before the transfer.
  emit(0x79,0xe0,0x02);label('wait'+i);emit(0xf0,0x02,0xcb,0x7f);jump(0x20,'wait'+i);
  emit(0xf0,0x04);store(0xa011+i*2);
  emit(0xf0,0x01);store(0xa002+i*2);emit(0xf0,0x0f);store(0xa003+i*2);
  emit(0xf0,0x02);store(0xa030+i);emit(0x3e,0x90+i);store(0xa020+i);
  emit(0x06,0);label('settle'+i);emit(0x05);jump(0x20,'settle'+i);
 }
 emit(0x3e,0x5c);store(0xa040);label('forever');jump(0x18,'forever');
 for(const [at,name]of jumps){const distance=labels.get(name)-at-1;assert.ok(distance>=-128&&distance<128);code[at]=distance&255;}
 rom.set(code,0x150);let checksum=0;for(let i=0x134;i<0x14d;i++)checksum=(checksum-rom[i]-1)&255;rom[0x14d]=checksum;
 return rom;
}
module.exports={cartridge};
if(require.main===module)(async()=>{
 const corePath=process.env.MGBA_CORE_PATH?path.resolve(process.env.MGBA_CORE_PATH):path.join(__dirname,'../cores/mgba/mgba.js');
 const createMGBA=require(corePath),wasmBinary=fs.readFileSync(path.join(path.dirname(corePath),'mgba.wasm'));
 const make=()=>createMGBA({wasmBinary});
 const input=(m,bytes,fn)=>{const p=m._malloc(bytes.length);assert.ok(p);try{m.HEAPU8.set(bytes,p);return fn(p,bytes.length);}finally{m._free(p);}};
 const select=(m,i)=>assert.equal(m._web_select(i),1);
 const save=m=>{const n=m._web_save_export();assert.equal(n,8192);return m.HEAPU8.slice(m._web_save_data(),m._web_save_data()+n);};
 const state=m=>{const n=m._web_state_export();assert.ok(n>0);return m.HEAPU8.slice(m._web_state_data(),m._web_state_data()+n);};
 const seed=(role,byte)=>{const bytes=new Uint8Array(8192);bytes[0]=role;bytes[1]=byte;return bytes;};
 async function run(options){
  const m=await make(),roms=[0,1].map(i=>cartridge({...options,doubleSpeed:options.doubleSpeed||options.mixedSpeed&&i===1})),backups=[],beforeSaves=[];
  try{
   for(let i=0;i<2;i++){
    select(m,i);assert.equal(input(m,roms[i],m._web_load),1);assert.equal(m._web_platform(),1);
    assert.equal(input(m,seed(i===0?1:0,i===0?0x31:0xa7),m._web_save_import),1);
    assert.equal(m._web_rtc_set(1,i===0?3600:-7200),1);
    beforeSaves.push(save(m));backups.push(state(m));
   }
   select(m,0);assert.equal(m._web_rtc_offset(),3600,'Loading 2P does not reset 1P RTC');
   const start=[0,1].map(i=>{select(m,i);return m._web_frame_count();});
   assert.equal(m._web_gb_link_start(),1);
   for(let frame=0;frame<12;frame++)assert.equal(m._web_gb_link_frame(0,0),1,'Both native cores make bounded synchronized progress');
   const received=[0,1].map(i=>{select(m,i);const frame=m._web_frame_count();assert.ok(frame>=start[i]+12);return save(m);});
   if(options.externalOnly){
    assert.equal(m._web_gb_link_busy(),1,'Both external-clock CPUs wait without manufacturing data');
    assert.deepEqual(received.map(s=>s[0x40]),[0,0]);
   }else{
    assert.equal(m._web_gb_link_busy(),0);
    for(let player=0;player<2;player++){
     const bytes=received[player];assert.equal(bytes[0x40],0x5c);
     for(let i=0;i<3;i++){
      assert.equal(bytes[2+i*2],(player===0?0xa7:0x31)+i,'Serial receives the peer byte, including after the clock owner changes');
      assert.equal(bytes[3+i*2]&8,8,'The native SIO interrupt is raised');
      assert.equal(bytes[0x30+i]&128,0,'The native transfer-enable bit clears');
      assert.equal(bytes[0x20+i],0x90+i);
      if(player===(i&1)){
       const ticks=(bytes[0x11+i*2]-bytes[0x10+i*2])&255;
       if(options.fast)assert.ok(ticks<=3,'CGB fast serial uses the fast clock');
       else assert.ok(ticks>=15&&ticks<=20,'Standard serial consumes approximately 4096 CPU cycles');
      }
     }
    }
   }
   m._web_gb_link_stop();
   // Completed sessions keep the ordinary mGBA save/state format. Load each
   // player's state into a fresh, single-core module with no cable attached.
   if(!options.externalOnly)for(let i=0;i<2;i++){
    select(m,i);const snapshot=state(m),fresh=await make();
    try{assert.equal(input(fresh,roms[i],fresh._web_load),1);assert.equal(input(fresh,snapshot,fresh._web_state_import),1);assert.deepEqual(save(fresh),received[i]);assert.equal(fresh._web_rtc_offset(),i===0?3600:-7200);fresh._web_frame(0);}
    finally{fresh._web_close();}
   }
   // The same pre-link backups also restore an interrupted external-clock
   // transfer; neither player receives the other cartridge's RAM or RTC.
   for(let i=0;i<2;i++){select(m,i);assert.equal(input(m,backups[i],m._web_state_import),1);assert.deepEqual(save(m),beforeSaves[i]);assert.equal(m._web_rtc_offset(),i===0?3600:-7200);}
   assert.equal(m._web_gb_link_start(),1,'A cancelled pair can reconnect');m._web_gb_link_stop();
   select(m,1);m._web_close();select(m,0);assert.deepEqual(save(m),beforeSaves[0],'Closing 2P leaves 1P intact');m._web_frame(0);
  }finally{m._web_gb_link_stop();select(m,1);m._web_close();select(m,0);m._web_close();}
 }
 await run({color:false});await run({color:true});await run({color:true,fast:true});await run({color:true,doubleSpeed:true});await run({color:true,mixedSpeed:true,fast:true});await run({color:true,externalOnly:true});
 console.log('PASS: authored GB/GBC CPUs exchange bytes both ways, change clock owner, raise native SIO IRQs, respect standard/fast timing, cancel/reconnect and retain independent native save/state/RTC formats.');
})().catch(error=>{console.error(error);process.exitCode=1;});
