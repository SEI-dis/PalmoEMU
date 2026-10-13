// SPDX-License-Identifier: AGPL-3.0-or-later
// Original generated GBA/GB cartridges exercise the API; no user ROM or save.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const corePath=process.env.MGBA_CORE_PATH?path.resolve(process.env.MGBA_CORE_PATH):path.join(__dirname,'../cores/mgba/mgba.js');
 const createMGBA=require(corePath);
 const m=await createMGBA({wasmBinary:fs.readFileSync(path.join(path.dirname(corePath),'mgba.wasm'))});
 assert.equal(m._web_rtc_set(0,0),0,'No core');assert.equal(m._web_rumble_enable(1),0);
 const rom=new Uint8Array(8192);new DataView(rom.buffer).setUint32(0,0xeafffffe,true);rom[0xb2]=0x96;
 const p=m._malloc(rom.length);m.HEAPU8.set(rom,p);
 try{
  assert.equal(m._web_load(p,rom.length),1);assert.equal(m._web_rtc_mode(),0);assert.equal(m._web_rtc_offset(),0);assert.equal(m._web_rumble_strength(),0);
  for(const seconds of [-315576000,-86400,0,3600,315576000]){assert.equal(m._web_rtc_set(1,seconds),1);assert.equal(m._web_rtc_mode(),1);assert.equal(m._web_rtc_offset(),seconds);}
  assert.equal(m._web_rtc_set(1,12345),1);
  for(const [mode,seconds]of [[2,0],[-1,0],[1,Infinity],[1,NaN],[1,.5],[1,315576001]]){assert.equal(m._web_rtc_set(mode,seconds),0);assert.equal(m._web_rtc_offset(),12345,'Invalid input preserves clock');}
  const stateLength=m._web_state_export();assert.ok(stateLength>0);const state=m.HEAPU8.slice(m._web_state_data(),m._web_state_data()+stateLength);
  assert.equal(m._web_rtc_set(0,0),1);assert.equal(m._web_rtc_mode(),0);assert.equal(m._web_rtc_offset(),0);
  const s=m._malloc(state.length);try{m.HEAPU8.set(state,s);assert.equal(m._web_state_import(s,state.length),1);}finally{m._free(s);}
  assert.equal(m._web_rtc_mode(),1);assert.equal(m._web_rtc_offset(),12345,'Existing RTC state metadata carries the offset');
  assert.equal(m._web_rumble_enable(1),1);assert.equal(m._web_rumble_enable(2),0);assert.equal(m._web_rumble_enable(0),1);assert.equal(m._web_rumble_strength(),0);
  m._web_reset();assert.equal(m._web_rtc_set(0,0),1);m._web_close();assert.equal(m._web_rtc_offset(),0);assert.equal(m._web_rumble_strength(),0);
  // Original MBC5-rumble program switches its motor on once, then loops.
  // Preference changes must not erase that persistent cartridge state.
  const gb=new Uint8Array(32768);gb.set([0xc3,0x50,0x01],0x100);gb.set([0xce,0xed,0x66,0x66],0x104);gb[0x147]=0x1e;gb[0x149]=2;gb.set([0x3e,0x08,0xea,0x00,0x40,0x18,0xfe],0x150);
  const g=m._malloc(gb.length);try{m.HEAPU8.set(gb,g);assert.equal(m._web_load(g,gb.length),1);}finally{m._free(g);}
  for(let i=0;i<3;i++)m._web_frame(0);assert.equal(m._web_rumble_strength(),0,'Off by default');
  assert.equal(m._web_rumble_enable(1),1);m._web_frame(0);assert.ok(m._web_rumble_strength()>.99,'A running cartridge motor reaches the peripheral');
  assert.equal(m._web_rumble_enable(0),1);m._web_frame(0);assert.equal(m._web_rumble_strength(),0);
  assert.equal(m._web_rumble_enable(1),1);m._web_frame(0);assert.ok(m._web_rumble_strength()>.99,'Re-enabling preserves the cartridge motor state');
  m._web_close();assert.equal(m._web_rumble_strength(),0);
  console.log('PASS: bounded clock modes, invalid-input preservation, RTC state metadata and rumble lifecycle API.');
 }finally{m._free(p);m._web_close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
