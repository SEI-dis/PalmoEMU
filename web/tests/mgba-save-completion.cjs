// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored programs only. No user ROM/save, browser profile or network access.
const assert=require('node:assert/strict'),path=require('node:path');
function keySaveGB({color=false}={}){
 const rom=new Uint8Array(32768);rom.set([0xc3,0x50,0x01],0x100);rom.set([0xce,0xed,0x66,0x66],0x104);
 rom[0x143]=color?0x80:0;rom[0x147]=3;rom[0x149]=2;
 // Enable MBC1 RAM; select JOYP buttons; repeatedly write SRAM while A is held.
 rom.set([0xf3,0x31,0xfe,0xff,0x3e,0x0a,0xea,0,0,0x3e,0x10,0xe0,0,
  0xf0,0,0xcb,0x47,0x20,0xfa,0x04,0x78,0xea,1,0xa0,0x3e,0x71,0xea,0,0xa0,0x18,0xee],0x150);
 let checksum=0;for(let i=0x134;i<0x14d;i++)checksum=(checksum-rom[i]-1)&255;rom[0x14d]=checksum;
 return rom;
}
module.exports={keySaveGB};
if(require.main===module)(async()=>{
 const create=require(process.env.MGBA_CORE_PATH?path.resolve(process.env.MGBA_CORE_PATH):'../cores/mgba/mgba.js');
 const m=await create({print:()=>{},printErr:()=>{}});
 const input=(bytes,fn)=>{const p=m._malloc(bytes.length);assert.ok(p);try{m.HEAPU8.set(bytes,p);return fn(p,bytes.length);}finally{m._free(p);}};
 const frame=(count,keys=0)=>{for(let i=0;i<count;i++){m._web_frame(keys);m._web_audio_read();}};
 const load=bytes=>assert.equal(input(bytes,m._web_load),1);
 const save=()=>{const n=m._web_save_export();return m.HEAPU8.slice(m._web_save_data(),m._web_save_data()+n);};
 const state=()=>{const n=m._web_state_export();assert.ok(n);return m.HEAPU8.slice(m._web_state_data(),m._web_state_data()+n);};
 try{
  for(const color of [false,true]){
   load(keySaveGB({color}));frame(30);assert.equal(m._web_save_revision(),0,'Idle RAM is not a save');
   frame(30,1);assert.equal(m._web_save_revision(),0,'Continuous game writes are not complete');assert.equal(m._web_save_pending(),1);
   const pending=state();frame(5);assert.equal(m._web_save_revision(),0,'No completion before native quiet threshold');
   frame(25);assert.equal(m._web_save_revision(),1,'One settled change without a VFile');assert.equal(m._web_save_pending(),0);assert.equal(save()[0],0x71);
   frame(50);assert.equal(m._web_save_revision(),1,'No repeated idle notifications');
   assert.equal(input(pending,m._web_state_import),1);frame(40);assert.equal(m._web_save_revision(),0,'Restoring a pending state does not manufacture a game-save event');
   frame(10,1);frame(25);assert.equal(m._web_save_revision(),1,'Subsequent writes still emit after state restore');
   const bytes=save();bytes[0]=0x35;assert.equal(input(bytes,m._web_save_import),1);frame(40);
   assert.equal(m._web_save_revision(),0,'Battery import is not a game-save event');assert.equal(save()[0],0x35);
   frame(10,1);frame(25);assert.equal(m._web_save_revision(),1,'Memory VFile uses native settled callback');assert.equal(save()[0],0x71);
   m._web_reset();frame(30);assert.equal(m._web_save_revision(),0,'Reset discards pending notifications');
   const oldClean=state();frame(1,1);frame(25);assert.equal(m._web_save_revision(),1);
   assert.equal(input(oldClean,m._web_state_import),1);frame(1,1);frame(25);
   assert.equal(m._web_save_revision(),1,'Rewinding the frame counter must not suppress a real write at the same frame age');
  }
  const {flash}=require('./core-upgrade.cjs');load(flash(95,true));frame(30);
  assert.equal(m._web_save_revision(),1,'6 MiB GBA flash completes once without a VFile');assert.equal(m._web_save_pending(),0);
  const full=save();assert.equal(full.length,6*1048576);assert.equal(full[95*65536],0x3c);assert.equal(full[0],0x5a);
  assert.equal(input(full,m._web_save_import),1);frame(40);assert.equal(m._web_save_revision(),0,'GBA import suppresses old dirty data');assert.deepEqual(save(),full);
  load(flash(95,true));assert.equal(input(full,m._web_save_import),1);frame(30);assert.equal(m._web_save_revision(),1,'Startup import must not suppress real first-frame flash writes');
  m._web_select(0);load(keySaveGB());frame(5,1);frame(25);assert.equal(m._web_save_revision(),1);
  m._web_select(1);load(keySaveGB());frame(30);assert.equal(m._web_save_revision(),0,'Second core has independent counter');
  frame(5,1);frame(25);assert.equal(m._web_save_revision(),1);m._web_close();
  m._web_select(0);assert.equal(m._web_save_revision(),1,'Closing second core preserves first counter');
 }finally{m._web_select(1);m._web_close();m._web_select(0);m._web_close();}
 console.log('PASS: native GB/GBC/GBA settled save revision, continuous-write hold, 6 MiB flash, import/state/reset suppression and independent core counters.');
})().catch(e=>{console.error(e);process.exitCode=1;});
