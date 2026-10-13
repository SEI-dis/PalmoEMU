// SPDX-License-Identifier: AGPL-3.0-or-later
// Original generated cartridge only; no user ROM/save or BIOS. ARM9 displays
// firmware language and ARM7 microphone SPI readings from the real core.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 for(const [directory,defaultLanguage] of [['nds',0],['melonds',1]]){
  const create=require('../cores/'+directory+'/core.js'),wasmBinary=fs.readFileSync(path.join(__dirname,'../cores',directory,'core.wasm'));
  const rom=require('./nds-options-cartridge.cjs')();
  async function withCore(language,check){
   // The app creates a fresh module for every launch. DeSmuME does not support
   // reinitializing all of its native globals after retro_deinit in one module.
   const m=await create({wasmBinary,print:()=>{},printErr:()=>{}});
   const put=(bytes,fn)=>{const p=m._malloc(bytes.length);try{m.HEAPU8.set(bytes,p);return fn(p,bytes.length);}finally{m._free(p);}};
   const run=(count=12)=>{for(let i=0;i<count;i++)m._web_frame(0);};
   const pixel=screen=>[...m.HEAPU8.slice(m._web_pixels()+screen*256*192*4,m._web_pixels()+screen*256*192*4+4)];
   const expectLanguage=expected=>{run();const rgba=pixel(0),lower=(expected+1)*32;assert.ok(rgba[0]>=lower&&rgba[0]<=lower+7,directory+': ARM9 language '+expected+', pixel '+rgba);assert.deepEqual(rgba.slice(1),[0,0,255]);};
   const expectQuiet=()=>{run();const [r,g,b,a]=pixel(1);assert.ok(r===0&&g===0&&b>=248&&a===255,directory+': microphone should be quiet, pixel '+pixel(1));};
   const expectNoise=()=>{let detected=false;for(let i=0;i<24;i++){run(1);const [r,g,b,a]=pixel(1);if(r===0&&g>=248&&b===0&&a===255)detected=true;}assert.ok(detected,directory+': ARM7 must receive simulated microphone samples');};
   try{
    assert.equal(typeof m._web_set_language,'function');assert.equal(typeof m._web_blow,'function');m._web_blow(1);m._web_blow(0);
    assert.equal(m._web_set_language(language),1);assert.equal(m._web_set_language(-2),0);assert.equal(m._web_set_language(6),0);
    assert.equal(put(rom,m._web_load),1);expectLanguage(language<0?defaultLanguage:language);expectQuiet();
    await check({m,put,run,expectLanguage,expectQuiet,expectNoise});
   }finally{m._web_close();}
  }
  for(const language of [-1,0,1,2,3,4,5])await withCore(language,({m,expectLanguage})=>{
   const expected=language<0?defaultLanguage:language;assert.equal(m._web_set_language((expected+1)%6),0,'Refuse live firmware replacement');m._web_reset();expectLanguage(expected);
  });
  await withCore(2,({m,put,expectLanguage,expectQuiet,expectNoise})=>{
   const battery=new Uint8Array(8192).fill(0x36);assert.equal(put(battery,m._web_save_import),1);
   const expectBattery=()=>{assert.equal(m._web_save_export(),battery.length);assert.deepEqual(m.HEAPU8.slice(m._web_save_data(),m._web_save_data()+battery.length),battery);};
   const size=m._web_state_export();assert.ok(size>0);const state=m.HEAPU8.slice(m._web_state_data(),m._web_state_data()+size);
   m._web_blow(1);expectNoise();m._web_blow(0);expectQuiet();expectBattery();
   m._web_blow(1);expectNoise();const noisySize=m._web_state_export(),noisyState=m.HEAPU8.slice(m._web_state_data(),m._web_state_data()+noisySize);assert.ok(noisySize>0);
   m._web_blow(0);assert.equal(put(noisyState,m._web_state_import),1);expectQuiet();expectBattery();
   m._web_blow(1);expectNoise();assert.equal(put(state,m._web_state_import),1);expectQuiet();expectLanguage(2);expectBattery();
   m._web_blow(1);expectNoise();assert.equal(put(new Uint8Array([1,2,3]),m._web_state_import),0);expectQuiet();expectBattery();
   m._web_blow(1);expectNoise();m._web_reset();expectQuiet();expectLanguage(2);expectBattery();
   m._web_blow(1);m._web_close();m._web_blow(1);m._web_blow(0);
  });
  await withCore(-1,()=>{});
  console.log('PASS: NDS six firmware languages/defaults, live-change refusal, ARM7 microphone samples, stop/reset/state/close and save retention: '+directory);
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
