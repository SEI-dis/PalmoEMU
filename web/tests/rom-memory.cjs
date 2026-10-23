// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored cartridge and disposable storage only; never uses private ROMs/saves.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');
  const result=await page.evaluate(async()=>{
   const {loadCompatibleMGBA}=await import('./src/core/mgba-compatibility.js');
   const {copyROMToHeap,romReadChunkBytes}=await import('./src/core/rom-input.js');
   const {importROM}=await import('./src/library/rom-import.js');
   const {prepareROMUpdate,readROMUpdateBackup}=await import('./src/library/rom-update.js');
   const {storeROMData}=await import('./src/library/rom-storage.js');
   const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js');
   const check=(ok,message)=>{if(!ok)throw Error(message);};
   const rom=new Uint8Array(64*1048576),v=new DataView(rom.buffer);rom[0xb2]=0x96;v.setUint32(0,0xea00003e,true);
   [0xe59f001c,0xe3a01003,0xe3811b01,0xe1c010b0,0xe59f0010,0xe1d010b0,0xe59f000c,0xe1c010b0,0xeafffffe,0x04000000,0x0a000000,0x06000000].forEach((n,i)=>v.setUint32(0x100+i*4,n,true));v.setUint16(0x2000000,0x03e0,true);
   const file=new File([rom],'Authored64.gba'),sourceId=(await importROM(file,'gba')).id;
   let stored=await db.get('roms',sourceId);const blobPersistence=stored instanceof Blob;check(blobPersistence||stored instanceof Uint8Array,'Blob persistence or legacy fallback');
   check(await hash(stored instanceof Blob?new Uint8Array(await stored.arrayBuffer()):stored)===sourceId,'Stored ROM identity preserved');
   const originalArrayBuffer=Blob.prototype.arrayBuffer,reads=[];
   Blob.prototype.arrayBuffer=function(){reads.push(this.size);if(this.size>romReadChunkBytes)throw Error('Whole ROM read during core load');return originalArrayBuffer.call(this);};
   const m=await createMGBA({print:()=>{},printErr:()=>{}});
   const pixels=()=>{for(let i=0;i<10;i++){m._web_frame(0);m._web_audio_read();}return [...m.HEAPU8.slice(m._web_pixels(),m._web_pixels()+4)];};
   let chunkPixel,legacyPixel,heap;
   try{await loadCompatibleMGBA(m,blobPersistence?stored:file);chunkPixel=pixels();heap=m.HEAPU8.byteLength;m._web_close();await loadCompatibleMGBA(m,rom);legacyPixel=pixels();}
   finally{m._web_close();Blob.prototype.arrayBuffer=originalArrayBuffer;}
   check(JSON.stringify(chunkPixel)===JSON.stringify(legacyPixel)&&chunkPixel[1]>200,'Blob and legacy ROM render the same second bank');
   check(reads.length===16&&Math.max(...reads)===romReadChunkBytes,'Only sixteen bounded reads');
   // A failed/aborted read frees its allocation without passing ownership to C.
   for(const mode of ['read-error','short-read','cancel']){
    let frees=0,loads=0,cancelled=false;
    const input=new Blob([new Uint8Array(100)]);
    input.slice=()=>({arrayBuffer:async()=>{if(mode==='read-error')throw Error('read failed');if(mode==='cancel')cancelled=true;return new ArrayBuffer(mode==='short-read'?1:100);}});
    const fake={HEAPU8:new Uint8Array(200),_malloc:()=>8,_free:()=>frees++,_web_load_owned:()=>++loads,_web_gba_save_capacity:()=>0};
    let failed=false;try{await loadCompatibleMGBA(fake,input,{cancelled:()=>cancelled});}catch(e){failed=true;if(mode==='cancel')check(e.name==='AbortError','Cancellation stays distinct');}
    check(failed&&frees===1&&loads===0,'Failed read must free once before native load: '+mode);
   }
   // Close the actual adapter while an asynchronous Blob read is pending.
   const {MGBACore}=await import('./src/core/mgba.js'),closing=new MGBACore(document.createElement('canvas'));
   let entered,release,romPointer,romFrees=0,nativeLoads=0;
   const reading=new Promise(resolve=>entered=resolve),input=new Blob([new Uint8Array(100)]);
   input.slice=()=>({arrayBuffer:()=>{entered();return new Promise(resolve=>release=()=>resolve(new ArrayBuffer(100)));}});
   const malloc=m._malloc,free=m._free,owned=m._web_load_owned,factory=window.createMGBA;
   m._malloc=size=>{const pointer=malloc(size);if(size===100)romPointer=pointer;return pointer;};
   m._free=pointer=>{if(pointer===romPointer)romFrees++;return free(pointer);};
   m._web_load_owned=(...args)=>{nativeLoads++;return owned(...args);};window.createMGBA=async()=>m;
   try{
    const loading=closing.load(input).then(()=>null,error=>error.name);await reading;closing.close();release();
    check(await loading==='AbortError'&&romFrees===1&&nativeLoads===0&&!closing.m&&!closing.nativeModule,'Closing adapter frees pending ROM without resurrecting it');
   }finally{window.createMGBA=factory;m._malloc=malloc;m._free=free;m._web_load_owned=owned;closing.close();}
   // Awaiting a chunk can invalidate a WASM heap view (e.g. a shared core grows).
   const small=new Blob([new Uint8Array([1,2,3,4])]),growing={HEAPU8:new Uint8Array(20)};
   small.slice=()=>({arrayBuffer:async()=>{growing.HEAPU8=new Uint8Array(40);return new Uint8Array([1,2,3,4]).buffer;}});
   await copyROMToHeap(growing,8,small);check(growing.HEAPU8[11]===4,'Reacquire heap after awaited read');
   let allocations=0;try{await loadCompatibleMGBA({_malloc:()=>{allocations++;return 1;}},new Blob([file,file,new Uint8Array(1)]));}catch{}
   check(allocations===0,'Above 128 MiB is rejected before allocation');
   // Blob failures retry the exact bytes; quota/write errors never retry.
   for(const name of ['UnknownError','QuotaExceededError']){
    const game={id:'failure-'+name,name,system:'gba',size:rom.length,added:1};let attempts=0;
    const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,...args){if(this.name==='roms'){attempts++;if(value instanceof Blob)throw new DOMException('injected',name);}return put.call(this,value,...args);};
    let failed=false;try{await storeROMData('gba',rom,data=>db.addGame(game,data));}catch{failed=true;}finally{IDBObjectStore.prototype.put=put;}
    if(name==='UnknownError'){check(!failed&&attempts===2,'Known Blob failure retries once');check((await db.get('roms',game.id)) instanceof Uint8Array,'Fallback stays readable');}
    else check(failed&&attempts===1&&!await db.has('library',game.id)&&!await db.has('roms',game.id),'Quota failure rolls back without retry');
   }
   const save={bytes:new Uint8Array([7,8,9]),at:10,hash:await hash(new Uint8Array([7,8,9]))};await db.put('saves',sourceId,save);await db.put('states',sourceId+':manual',{bytes:new Uint8Array([19]),at:9});
   rom[rom.length-1]=42;const newer=new File([rom],'Authored64-v2.gba'),target=(await importROM(newer,'gba',null,{inspectOnly:true})).game,plan=await prepareROMUpdate(sourceId,target);
   await importROM(newer,'gba',null,{updatePlan:plan});
   stored=await db.get('roms',target.id);check((stored instanceof Blob)===blobPersistence&&await hash(stored instanceof Blob?new Uint8Array(await stored.arrayBuffer()):stored)===target.id,'Updated ROM Blob matches rechecked bytes');
   check((await db.get('saves',sourceId)).hash===save.hash&&(await db.get('saves',target.id)).hash===save.hash,'Source and copied save preserved');
   check((await readROMUpdateBackup(target)).save.hash===save.hash&&(await db.get('states',sourceId+':manual')).bytes[0]===19,'Original backup and state preserved');
   check(!await db.has('states',target.id+':manual'),'States never migrate to new ROM');
   return {blobPersistence,reads:reads.length,maximumRead:Math.max(...reads),heap,chunkPixel};
  });
  assert.equal(result.maximumRead,4*1048576);assert.ok(result.heap<112*1048576);
  console.log('PASS: large-ROM Blob import/update, bounded read, identical legacy rendering, failure/cancel cleanup, atomic fallback, originals retained; '+JSON.stringify(result));
  await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
