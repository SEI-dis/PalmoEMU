// SPDX-License-Identifier: AGPL-3.0-or-later
// Generated ARM9/7 only. Optional NDS_OLD_CORE_ROOT enables old/new state ABI
// verification using a retained previous release's two core directories.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const rom=require('./nds-lid-cartridge.cjs')();
async function instance(directory,root=path.join(__dirname,'../cores')){
 const folder=path.resolve(root,directory),m=await require(path.join(folder,'core.js'))({wasmBinary:fs.readFileSync(path.join(folder,'core.wasm')),print:()=>{},printErr:()=>{}});
 const put=(bytes,fn)=>{const p=m._malloc(bytes.length);try{m.HEAPU8.set(bytes,p);return fn(p,bytes.length);}finally{m._free(p);}};
 assert.equal(put(rom,m._web_load),1);
 const run=(count=40)=>{for(let i=0;i<count;i++)m._web_frame(0);};
 const expect=closed=>{run();const at=m._web_pixels()+256*192*4,rgba=[...m.HEAPU8.slice(at,at+4)];assert.ok(rgba[0]===0&&rgba[3]===255&&(closed?rgba[1]>=248&&rgba[2]===0:rgba[1]===0&&rgba[2]>=248),directory+': ARM7 hinge '+closed+' pixel '+rgba);if(m._web_get_lid)assert.equal(m._web_get_lid(),Number(closed));};
 const state=()=>{const size=m._web_state_export();assert.ok(size>0);return m.HEAPU8.slice(m._web_state_data(),m._web_state_data()+size);};
 return {m,put,run,expect,state};
}
(async()=>{
 for(const directory of ['nds','melonds']){
  const {m,put,run,expect,state}=await instance(directory);
  try{
   expect(false);const battery=new Uint8Array(8192).fill(0x62);assert.equal(put(battery,m._web_save_import),1);
   const open=state();assert.equal(m._web_set_lid(1),1);expect(true);const closed=state();assert.equal(open.length,closed.length,'No ABI size change');
   assert.equal(m._web_set_lid(1),1);expect(true);assert.equal(m._web_set_lid(0),1);expect(false);
   // DeSmuME's 30-frame switch debounce must not lose a fast second request.
   m._web_set_lid(1);run(1);m._web_set_lid(0);expect(false);m._web_set_lid(1);expect(true);
   // melonDS 0.9.3 does not serialize KeyInput: physical lid position remains
   // current on state restore. DeSmuME stores it in the existing state format.
   assert.equal(put(open,m._web_state_import),1);expect(directory==='melonds');assert.equal(put(closed,m._web_state_import),1);expect(true);
   assert.equal(put(new Uint8Array([1,2,3]),m._web_state_import),0);expect(true);
   assert.equal(m._web_save_export(),battery.length);assert.deepEqual(m.HEAPU8.slice(m._web_save_data(),m._web_save_data()+battery.length),battery);
   if(process.env.NDS_OLD_CORE_ROOT){
    const previous=await instance(directory,process.env.NDS_OLD_CORE_ROOT);
    try{previous.expect(false);const oldState=previous.state();assert.equal(oldState.length,open.length);assert.equal(put(oldState,m._web_state_import),1);expect(directory==='melonds');assert.equal(previous.put(closed,previous.m._web_state_import),1);previous.expect(directory==='nds');assert.equal(previous.put(open,previous.m._web_state_import),1);previous.expect(false);}finally{previous.m._web_close();}
   }
   m._web_set_lid(1);expect(true);m._web_reset();expect(false);m._web_close();assert.equal(m._web_get_lid(),0);assert.equal(m._web_set_lid(1),0);
   console.log('PASS: '+directory+' actual ARM7 hinge, idempotence, fast switch, reset/state/save/close'+(process.env.NDS_OLD_CORE_ROOT?', previous release state ABI':''));
  }finally{m._web_close();}
 }
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
