// SPDX-License-Identifier: AGPL-3.0-or-later
// Pass an extracted previous release cores/ directory. No user data is read.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const baselineRoot=process.argv[2]||process.env.NDS_BASELINE_ROOT;assert.ok(baselineRoot,'Pass <previous-cores-directory> or NDS_BASELINE_ROOT; this explicit upgrade check is not part of CI.');
 for(const [directory,language] of [['nds',0],['melonds',1]]){
  const make=async root=>require(path.resolve(root,directory,'core.js'))({wasmBinary:fs.readFileSync(path.resolve(root,directory,'core.wasm')),print:()=>{},printErr:()=>{}});
  const previous=await make(baselineRoot),current=await make(path.join(__dirname,'../cores')),rom=require('./nds-options-cartridge.cjs')();
  const put=(m,bytes,fn)=>{const p=m._malloc(bytes.length);try{m.HEAPU8.set(bytes,p);return fn(p,bytes.length);}finally{m._free(p);}};
  const state=m=>{const n=m._web_state_export();assert.ok(n>0);return m.HEAPU8.slice(m._web_state_data(),m._web_state_data()+n);};
  const battery=m=>{const n=m._web_save_export();return m.HEAPU8.slice(m._web_save_data(),m._web_save_data()+n);};
  const inspect=m=>{for(let i=0;i<12;i++)m._web_frame(0);const [r,g,b,a]=m.HEAPU8.slice(m._web_pixels(),m._web_pixels()+4);assert.ok(r>=(language+1)*32&&r<=(language+1)*32+7&&g===0&&b===0&&a===255,'State preserves the original firmware language');};
  try{
   assert.equal(put(previous,rom,previous._web_load),1);inspect(previous);
   const save=new Uint8Array(8192).fill(0x5a);assert.equal(put(previous,save,previous._web_save_import),1);assert.deepEqual(battery(previous),save);
   const oldState=state(previous),oldSave=battery(previous);assert.equal(current._web_set_language(5),1);assert.equal(put(current,rom,current._web_load),1);
   assert.equal(put(current,oldSave,current._web_save_import),1);assert.deepEqual(battery(current),oldSave);assert.equal(put(current,oldState,current._web_state_import),1);inspect(current);assert.deepEqual(battery(current),oldSave);
   const newState=state(current);assert.equal(put(previous,newState,previous._web_state_import),1);inspect(previous);assert.deepEqual(battery(previous),oldSave);
   console.log('PASS: previous/current NDS battery and bidirectional state compatibility: '+directory);
  }finally{previous._web_close();current._web_close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
