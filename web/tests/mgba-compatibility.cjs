// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored cartridge only. Production recognition/loader sources are used
// unchanged: correction follows structure even when code and ROM bytes move.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const kind=process.env.BROWSER_ENGINE||'chromium',runtime=require('./browser-runtime.cjs');
const {buildFixture,word}=require('./helpers/mgba-save-probe-fixture.cjs');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const cases=[{name:'recognized structure',accepted:true},
 {name:'relocated structure and revised ROM',accepted:true,layout:{helper:0x23002,caller:0x18002,reader:0x28002,trampoline:0x29002,helperPool:0x23200,callerPool:0x18180,readerPool:0x28200}},
 {name:'unrecognized near-match structure',accepted:false}];
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 const fixture=path.join(os.tmpdir(),'palmo-compatibility-'+crypto.randomUUID()+'.gba');
 try{
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';
  for(const {accepted,name,layout} of cases){
   const assembled=buildFixture(layout),rom=assembled.bytes,{offset}=assembled,otherOffset=0x1230;
   if(layout){rom[0x300000]^=0x5a;rom[rom.length-1]^=0xa5;}
   if(!accepted)word(rom,assembled.helper+48,0x4290);
   const id=digest(rom);fs.writeFileSync(fixture,rom);
   const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[],unexpected=[];
   page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>{
    const r=route.request(),url=new URL(r.url());
    if(r.method()!=='GET'||url.origin!==new URL(base).origin){unexpected.push(r.method()+' '+url.pathname);return route.abort();}
    return route.continue();
   });
   await page.goto(base);
   await page.evaluate(async({offset,otherOffset})=>{
    const {MGBACore}=await import('./src/core/mgba.js'),load=MGBACore.prototype.load;
    MGBACore.prototype.load=async function(bytes){
     const create=window.createMGBA;window.observedLoads=[];
     window.createMGBA=async options=>{
      const m=await create(options),raw=m._web_load,owned=m._web_load_owned,frame=m._web_frame;let frames=0;
      m._web_frame=keys=>{frames++;return frame(keys);};
      m._web_load=(p,n)=>{observedLoads.push({n,byte:m.HEAPU8[p+offset],otherByte:m.HEAPU8[p+otherOffset],frames});return raw(p,n);};
      m._web_load_owned=(p,n)=>{observedLoads.push({n,byte:m.HEAPU8[p+offset],otherByte:m.HEAPU8[p+otherOffset],frames});return owned(p,n);};
      return m;
     };
     try{await load.call(this,bytes);window.testCore=this;}finally{window.createMGBA=create;}
    };
   },{offset,otherOffset});
   await page.locator('#rom-input').setInputFiles(fixture);
   await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
   const result=await page.evaluate(async id=>{
    testCore.pause(true);const db=await import('./src/storage/storage.js'),stored=await db.get('roms',id);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',stored)),b=>b.toString(16).padStart(2,'0')).join('');
    return {id:(await db.all('library'))[0].id,hash,compatibility:testCore.compatibility,loads:observedLoads};
   },id);
   assert.equal(result.id,id);assert.equal(result.hash,id,'Stored original and save identity stay unchanged');
   assert.equal(result.compatibility,accepted?'expanded-save-detection':null);
   assert.ok(result.loads.filter(l=>l.n===8192).every(l=>l.frames===0),'Calibration executes no game frames');
   assert.deepEqual(result.loads.filter(l=>l.n===rom.length).map(({byte,otherByte,frames})=>({byte,otherByte,frames})),[{byte:accepted?1:0,otherByte:0,frames:0}],'One transferred load, before any frame');
   if(accepted&&!layout){
    const checks=await page.evaluate(async({id,offset,otherOffset})=>{
     const {loadCompatibleMGBA}=await import('./src/core/mgba-compatibility.js'),db=await import('./src/storage/storage.js'),original=await db.get('roms',id);
     // An unrelated ROM change remains eligible; changed probe instructions
     // or a cartridge without the extended header remain untouched.
     const revised=original.slice();revised[revised.length-1]^=1;
     const changedInstruction=original.slice();changedInstruction[offset]=1;
     // Mock the core protocol to check capability gates, growth, failures and
     // cleanup without distributing or recreating a commercial ROM.
     async function probe(bytes,limit,{missing=false,failAt=0,grow=false,owned=false}={}){
      let heap=new Uint8Array(bytes.length+16),freed=0;const loads=[],otherLoads=[];
      const m={get HEAPU8(){return heap;},_malloc:()=>8,_free:()=>freed++,
       _web_load(p,n){loads.push(heap[p+offset]);otherLoads.push(heap[p+otherOffset]);if(grow){const next=new Uint8Array(heap.length+32);next.set(heap);heap=next;}return loads.length===failAt?0:1;}};
      if(!missing)m._web_save_limit=()=>limit;
      if(owned){m._web_gba_save_capacity=()=>limit;m._web_load_owned=(p,n)=>{try{return m._web_load(p,n);}finally{freed++;}};}
      let correction=null,error=false;try{correction=await loadCompatibleMGBA(m,bytes);}catch{error=true;}
      return {correction,error,loads,otherLoads,freed,originalByte:bytes[offset]};
     }
     const gates=[];
     for(const limit of [131072,1048576,6291455,NaN,Infinity,undefined])gates.push(await probe(original,limit,{missing:limit===undefined}));
     const modified=[await probe(revised,6291456),await probe(changedInstruction,6291456),await probe(original.subarray(0,8192),6291456)];
     const growth=await probe(original,6291456,{grow:true});
     const failures=[await probe(original,6291456,{failAt:1}),await probe(original,6291456,{failAt:2})];
     const transfers=[];
     for(const limit of [131072,6291455,NaN,Infinity,6291456])transfers.push(await probe(original,limit,{owned:true,grow:true}));
     const transferFailure=await probe(original,6291456,{owned:true,failAt:1});
     // -1 is the native allocation-failure result. The owned loader already
     // consumed its ROM pointer; the browser must report memory pressure and
     // must not free it again (or treat a negative result as success).
     let ownedFrees=0,callerFrees=0,ownedLoads=0,allocationMessage=null;
     const allocationCore={HEAPU8:new Uint8Array(8208),_malloc:()=>8,_free:()=>callerFrees++,
      _web_gba_save_capacity:()=>6291456,_web_load_owned(){ownedLoads++;ownedFrees++;return -1;}};
     try{await loadCompatibleMGBA(allocationCore,original.subarray(0,8192));}catch(error){allocationMessage=error.message;}
     const ownedAllocationFailure={message:allocationMessage,ownedFrees,callerFrees,ownedLoads};
     // Import an actual pre-correction snapshot into the corrected core, then
     // round-trip a new snapshot and an unchanged 6MiB battery save.
     const old=await createMGBA({print:()=>{},printErr:()=>{}});
     const put=(m,b,fn)=>{const p=m._malloc(b.length);try{m.HEAPU8.set(b,p);return fn(p,b.length);}finally{m._free(p);}};
     put(old,original,(p,n)=>old._web_load(p,n));
     for(let i=0;i<30;i++){old._web_frame(0);old._web_audio_read();}
     const n=old._web_state_export(),oldState=old.HEAPU8.slice(old._web_state_data(),old._web_state_data()+n);
     const bytesSave=old._web_save_export(),oldSave=old.HEAPU8.slice(old._web_save_data(),old._web_save_data()+bytesSave);old._web_close();
     testCore.loadState(oldState);const restored=testCore.save(),checkpoint=testCore.state();testCore.reset();testCore.loadState(checkpoint);
     testCore.restore(oldSave);const reloaded=testCore.save();
     return {gates,modified,growth,failures,transfers,transferFailure,ownedAllocationFailure,saveBytes:restored.length,saveEqual:restored.every((b,i)=>b===oldSave[i])&&reloaded.every((b,i)=>b===oldSave[i]),compatibility:testCore.compatibility};
    },{id,offset,otherOffset});
    for(const gate of checks.gates)assert.deepEqual(gate,{correction:null,error:false,loads:[0],otherLoads:[0],freed:1,originalByte:0});
    for(const [i,entry]of checks.modified.entries()){assert.equal(entry.correction,i===0?'expanded-save-detection':null);assert.equal(entry.error,false);assert.equal(entry.loads.length,i===0?2:1);assert.equal(entry.freed,1);if(i===1)assert.equal(entry.loads[0],1);}
    assert.deepEqual(checks.growth,{correction:'expanded-save-detection',error:false,loads:[0,1],otherLoads:[0,0],freed:1,originalByte:0});
    for(const entry of checks.failures){assert.equal(entry.error,true);assert.equal(entry.freed,1);assert.equal(entry.originalByte,0);assert.ok(entry.otherLoads.every(byte=>byte===0),'Unrelated ROM bytes are never patched');}
    for(const [i,entry]of checks.transfers.entries())assert.deepEqual(entry,{correction:i===4?'expanded-save-detection':null,error:false,loads:[i===4?1:0],otherLoads:[0],freed:1,originalByte:0},'Transferred load checks compiled capacity and frees exactly once');
    assert.deepEqual(checks.transferFailure,{correction:null,error:true,loads:[1],otherLoads:[0],freed:1,originalByte:0});
    assert.deepEqual(checks.ownedAllocationFailure,{message:'メモリを確保できませんでした。',ownedFrees:1,callerFrees:0,ownedLoads:1},'Native allocation failure reports memory pressure without retrying or double-freeing the owned ROM');
    assert.equal(checks.saveBytes,6291456);assert.ok(checks.saveEqual);assert.equal(checks.compatibility,'expanded-save-detection');
   }
   assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);await context.close();console.log('PASS: '+name+' / original-ROM preservation. '+kind);
  }
  console.log('PASS: production structural recognition without source substitution, relocation/revision tolerance, capability gates, memory growth/cleanup, original ROM/save identity, old/new states, 6MiB saves and no uploads. '+kind);
 }finally{try{await browser.close();}finally{if(fs.existsSync(fixture))fs.unlinkSync(fixture);}}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
