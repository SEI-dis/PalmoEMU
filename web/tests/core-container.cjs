const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const cart=require('./cartridges.cjs');
(async()=>{for(const system of ['nes','snes','md']){
 const create=require('../cores/'+system+'/core.js'),m=await create({locateFile:()=>path.join(__dirname,'../cores/',system,'core.wasm')}),b=cart[system](),p=m._malloc(b.length);m.HEAPU8.set(b,p);assert.equal(m._web_load(p,b.length),1,system+' load');m._free(p);
 for(let f=0;f<90;f++)m._web_frame(0);
 const pixels=m.HEAPU8.subarray(m._web_pixels(),m._web_pixels()+m._web_width()*m._web_height()*4);assert.ok(pixels.some((v,i)=>i%4===3&&v===255),system+' video callback');assert.ok(m._web_audio_read()>0,system+' audio callback');
 const n=m._web_state_export(),s=m.HEAPU8.slice(m._web_state_data(),m._web_state_data()+n);assert.ok(n>0,system+' state');m._web_frame(8);let q=m._malloc(n);m.HEAPU8.set(s,q);assert.equal(m._web_state_import(q,n),1);m._free(q);
 console.log('PASS',system,'size',m._web_width(),m._web_height(),'audio',m._web_audio_read(),'state',n,'save',m._web_save_export(),'fps',m._web_fps());m._web_close();
}})().catch(e=>{console.error(e);process.exitCode=1;});
