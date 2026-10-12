// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored cartridge only. Positive cases substitute its hash in an isolated
// test response; production's exact-ROM allowlist is never changed on disk.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const kind=process.env.BROWSER_ENGINE||'chromium',runtime=require('./browser-runtime.cjs');
const offset=0x10d3a36,rom=Buffer.alloc(64*1024*1024);
rom.set(require('./core-upgrade.cjs').flash(95,true));rom.writeUInt16LE(0x2000,offset);
const digest=b=>crypto.createHash('sha256').update(b).digest('hex'),id=digest(rom);
const source=fs.readFileSync(path.join(__dirname,'../src/mgba-compatibility.js'),'utf8');
const pinned='74bfec1e57712f505a303fd1a0ad3e8977b05b86ff12c17952af16553249ce8a';
assert.equal(source.split(pinned).length,2);
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 const fixture=path.join(os.tmpdir(),'palmo-compatibility-'+crypto.randomUUID()+'.gba');
 try{
  fs.writeFileSync(fixture,rom);
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';
  for(const accepted of [false,true]){
   const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[],unexpected=[];
   page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>{
    const r=route.request(),url=new URL(r.url());
    if(r.method()!=='GET'||url.origin!==new URL(base).origin){unexpected.push(r.method()+' '+url.pathname);return route.abort();}
    if(accepted&&url.pathname.endsWith('/src/mgba-compatibility.js'))return route.fulfill({contentType:'text/javascript',body:source.replace(pinned,id)});
    return route.continue();
   });
   await page.goto(base);
   await page.evaluate(async offset=>{
    const {MGBACore}=await import('./src/mgba.js'),load=MGBACore.prototype.load;
    MGBACore.prototype.load=async function(bytes){
     const create=window.createMGBA;window.observedLoads=[];
     window.createMGBA=async options=>{
      const m=await create(options),raw=m._web_load,frame=m._web_frame;let frames=0;
      m._web_frame=keys=>{frames++;return frame(keys);};
      m._web_load=(p,n)=>{observedLoads.push({byte:m.HEAPU8[p+offset],frames});return raw(p,n);};
      return m;
     };
     try{await load.call(this,bytes);window.testCore=this;}finally{window.createMGBA=create;}
    };
   },offset);
   await page.locator('#rom-input').setInputFiles(fixture);
   await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
   const result=await page.evaluate(async id=>{
    testCore.pause(true);const db=await import('./src/storage.js'),stored=await db.get('roms',id);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',stored)),b=>b.toString(16).padStart(2,'0')).join('');
    return {id:(await db.all('library'))[0].id,hash,compatibility:testCore.compatibility,loads:observedLoads};
   },id);
   assert.equal(result.id,id);assert.equal(result.hash,id,'Stored original and save identity stay unchanged');
   assert.equal(result.compatibility,accepted?'expanded-save-detection-v040':null);
   assert.deepEqual(result.loads,accepted?[{byte:0,frames:0},{byte:1,frames:0}]:[{byte:0,frames:0}]);
   if(accepted){
    const checks=await page.evaluate(async({id,offset})=>{
     const {loadCompatibleMGBA}=await import('./src/mgba-compatibility.js'),db=await import('./src/storage.js'),original=await db.get('roms',id);
     // Unknown/future revisions keep the same size and target instruction.
     const revised=original.slice();revised[revised.length-1]^=1;
     const changedInstruction=original.slice();changedInstruction[offset]=1;
     // Mock the core protocol to check capability gates, growth, failures and
     // cleanup without distributing or recreating a commercial ROM.
     async function probe(bytes,limit,{missing=false,failAt=0,grow=false}={}){
      let heap=new Uint8Array(bytes.length+16),freed=0;const loads=[];
      const m={get HEAPU8(){return heap;},_malloc:()=>8,_free:()=>freed++,
       _web_load(p,n){loads.push(heap[p+offset]);if(grow){const next=new Uint8Array(heap.length+32);next.set(heap);heap=next;}return loads.length===failAt?0:1;}};
      if(!missing)m._web_save_limit=()=>limit;
      let correction=null,error=false;try{correction=await loadCompatibleMGBA(m,bytes);}catch{error=true;}
      return {correction,error,loads,freed,originalByte:bytes[offset]};
     }
     const gates=[];
     for(const limit of [131072,1048576,6291455,NaN,Infinity,undefined])gates.push(await probe(original,limit,{missing:limit===undefined}));
     const modified=[await probe(revised,6291456),await probe(changedInstruction,6291456),await probe(original.subarray(0,8192),6291456)];
     const growth=await probe(original,6291456,{grow:true});
     const failures=[await probe(original,6291456,{failAt:1}),await probe(original,6291456,{failAt:2})];
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
     return {gates,modified,growth,failures,saveBytes:restored.length,saveEqual:restored.every((b,i)=>b===oldSave[i])&&reloaded.every((b,i)=>b===oldSave[i]),compatibility:testCore.compatibility};
    },{id,offset});
    for(const gate of checks.gates)assert.deepEqual(gate,{correction:null,error:false,loads:[0],freed:1,originalByte:0});
    for(const [i,entry]of checks.modified.entries()){assert.equal(entry.correction,null);assert.equal(entry.error,false);assert.equal(entry.loads.length,1);assert.equal(entry.freed,1);if(i===1)assert.equal(entry.loads[0],1);}
    assert.deepEqual(checks.growth,{correction:'expanded-save-detection-v040',error:false,loads:[0,1],freed:1,originalByte:0});
    for(const entry of checks.failures){assert.equal(entry.error,true);assert.equal(entry.freed,1);assert.equal(entry.originalByte,0);}
    assert.equal(checks.saveBytes,6291456);assert.ok(checks.saveEqual);assert.equal(checks.compatibility,'expanded-save-detection-v040');
   }
   assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);await context.close();
  }
  console.log('PASS: exact-hash scope, future-ROM exclusion, capability gates, memory growth/cleanup, original ROM/save identity, pre-correction and new states, 6MiB save retention and no uploads. '+kind);
 }finally{try{await browser.close();}finally{if(fs.existsSync(fixture))fs.unlinkSync(fixture);}}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
