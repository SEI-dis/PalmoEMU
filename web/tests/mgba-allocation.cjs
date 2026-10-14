// SPDX-License-Identifier: AGPL-3.0-or-later
// Inject browser heap-growth refusal into an authored ROM's initialization.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const corePath=path.resolve(process.env.MGBA_CORE_PATH||path.join(__dirname,'../cores/mgba/mgba.js'));
const create=require(corePath),{gba64}=require('./core.cjs');
(async()=>{
 const module=await WebAssembly.compile(fs.readFileSync(corePath.replace(/\.js$/,'.wasm')));
 let allowGrowth=true,refused=0;
 const m=await create({print(){},printErr(){},instantiateWasm(imports,receive){
  // Locate the named JS resize function rather than relying on its minified
  // WASM import key, which can change when the bridge is rebuilt.
  let hooked=false;
  for(const namespace of Object.values(imports))for(const [key,value]of Object.entries(namespace)){
   if(typeof value==='function'&&/emscripten_resize_heap/.test(value.name)){
    namespace[key]=size=>{if(!allowGrowth&&size>80*1048576){refused++;return false;}return value(size);};hooked=true;
   }
  }
  assert.ok(hooked,'Heap growth import found');
  WebAssembly.instantiate(module,imports).then(instance=>receive(instance,module));return {};
 }});
 const rom=gba64();
 const load=()=>{const p=m._malloc(rom.length);assert.ok(p,'ROM input allocation');m.HEAPU8.set(rom,p);return m._web_load_owned(p,rom.length);};
 allowGrowth=false;
 for(let i=0;i<3;i++){
  assert.equal(load(),-1,'Missing extended RAM must reject startup');
  assert.ok(refused>0,'The browser actually refused memory growth');
  assert.equal(m._web_platform(),-1,'Rejected machine is destroyed');
  const before=m.HEAPU8.slice(0,256);m._web_frame(0);assert.deepEqual(m.HEAPU8.slice(0,256),before,'No CPU executes after failed allocation');
  m._web_close();
 }
 allowGrowth=true;assert.equal(load(),1,'A fresh load can retry after memory becomes available');
 for(let i=0;i<10;i++){m._web_frame(0);m._web_audio_read();}
 const pixels=m.HEAPU8.subarray(m._web_pixels(),m._web_pixels()+4);assert.ok(pixels[1]>200&&pixels[0]<10&&pixels[2]<10);
 m._web_close();console.log('PASS: refused startup allocations reject before execution, consume ROM once, close safely and allow later retry.');
})().catch(error=>{console.error(error);process.exitCode=1;});
