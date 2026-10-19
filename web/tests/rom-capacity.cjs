// SPDX-License-Identifier: AGPL-3.0-or-later
// Capacity boundaries use metadata, not large allocations or user cartridges.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createStaticServer}=require('../scripts/serve.cjs');
const runtime=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium';
const MiB=1048576;
function vlv(value){const bytes=[];for(;;){const byte=value&127;value=Math.floor(value/128);if(!value){bytes.push(byte|128);return bytes;}bytes.push(byte);value--;}}
function patchTarget(type,size){
 // BPS reads the four source bytes, then repeats those bytes via TargetCopy.
 // UPS permits a larger zero-filled target with no XOR records. Both record
 // streams are structurally valid; checksum validation happens after preflight.
 const records=type==='BPS1'?[...vlv(0),...vlv(12),...(size>4?[...vlv((size-5)*4+3),...vlv(0)]:[])]:[];
 return new Uint8Array([...Buffer.from(type),...vlv(4),...vlv(size),...records,...new Uint8Array(12)]);
}
function directoryROM(system,size){
 const name=Buffer.from('synthetic.'+system),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22),packed=Buffer.from([0]);
 local.writeUInt32LE(0x04034b50);local.writeUInt16LE(8,8);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(size,22);local.writeUInt16LE(name.length,26);
 central.writeUInt32LE(0x02014b50);central.writeUInt16LE(8,10);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(size,24);central.writeUInt16LE(name.length,28);
 const payload=Buffer.concat([local,name,packed]),directory=Buffer.concat([central,name]);
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(payload.length,16);
 return new Blob([payload,directory,end]);
}
(async()=>{
 const capacity=await import('../src/core/rom-capacity.js');
 const {standardGBAROMBytes,mgbaMaxROMBytes,futureGBAROMBytes,maxROMBytes,supportsROMSize,isROMSizeSupported,patchMaxROMBytes,patchMaxFileBytes,maxROMZipSize,maxROMZipExpandedSize}=capacity;
 assert.equal(standardGBAROMBytes,32*MiB);assert.equal(mgbaMaxROMBytes,64*MiB);assert.equal(futureGBAROMBytes,128*MiB);
 assert.equal(supportsROMSize('gba',futureGBAROMBytes),false,'128 MiB is a review target, never an enabled capacity');
 for(const [system,limit]of Object.entries({gba:64,gb:64,gbc:64,nes:64,snes:64,md:64,nds:512,'3ds':4096})){
  assert.equal(maxROMBytes(system),limit*MiB);
  for(const size of [1,limit*MiB])assert.equal(supportsROMSize(system,size),true);
  for(const size of [0,-1,1.5,NaN,Infinity,limit*MiB+1])assert.equal(supportsROMSize(system,size),false);
 }
 for(const system of ['unknown','toString','__proto__',undefined])assert.equal(supportsROMSize(system,1),false);
 assert.equal(isROMSizeSupported(1,Infinity),false);
 const {coreRegistry,supportsGame,saveKey,compatibleState}=await import('../src/core/core-registry.js');
 const [mgba,vba]=coreRegistry.gba;
 assert.equal(mgba.maxRom,mgbaMaxROMBytes);assert.equal(vba.maxRom,standardGBAROMBytes);
 assert.equal(supportsGame(mgba,{size:mgbaMaxROMBytes}),true);assert.equal(supportsGame(mgba,{size:futureGBAROMBytes}),false);
 assert.equal(supportsGame(vba,{size:standardGBAROMBytes}),true);assert.equal(supportsGame(vba,{size:standardGBAROMBytes+1}),false);
 assert.equal(mgba.id,'mgba-rom64-save6-v2');assert.equal(mgba.maxSave,6*MiB+16);
 assert.equal(saveKey({id:'synthetic',system:'gba'}),'synthetic');assert.equal(saveKey({id:'synthetic',system:'gba',coreKey:'vba-next'}),'synthetic@vba-next');
 assert.equal(compatibleState(mgba.id,{coreId:'mgba-rom64-link-v1'}),true);
 // This is a source/build-policy synchronization gate, not evidence that an
 // unreviewed replacement native binary supports a larger cartridge mapping.
 const policy=JSON.parse(fs.readFileSync(path.join(__dirname,'../sources/mgba-web-port/upstream.json'),'utf8'));
 assert.equal(policy.reviewedMaxRomBytes,mgbaMaxROMBytes,'Deployed JS capacity must match the reviewed native build policy');
 const bridge=fs.readFileSync(path.join(__dirname,'../sources/mgba-web-port/bridge.c'),'utf8');
 for(const name of ['web_load','web_load_owned']){
  const guard=bridge.match(new RegExp('int '+name+'\\([^)]*\\)\\s*\\{\\s*if \\([^\\n]*size > (\\d+) \\* 1024 \\* 1024'));
  assert.ok(guard,name+' must retain a capacity guard before allocation/read');assert.equal(Number(guard[1])*MiB,mgbaMaxROMBytes,name+' capacity agrees with JS/build policy');
 }
 assert.equal(patchMaxROMBytes,64*MiB);assert.equal(patchMaxFileBytes,64*MiB);
 assert.equal(maxROMZipSize,576*MiB);assert.equal(maxROMZipExpandedSize,512*MiB);
 const {importROM}=await import('../src/library/rom-import.js');
 const originalWorker=globalThis.Worker;let workers=0,stopped=0;
 globalThis.Worker=class {constructor(){workers++;}postMessage(){queueMicrotask(()=>this.onmessage({data:{type:'done'}}));}terminate(){stopped++;}};
 try{
  for(const size of [0,-1,NaN,mgbaMaxROMBytes+1,futureGBAROMBytes])await assert.rejects(importROM({name:'synthetic.gba',size},'gba'),/このROM容量/);
  await assert.rejects(importROM({name:'synthetic.zip',size:maxROMZipSize+1}),/ZIP/);
  assert.equal(workers,0,'Changing a UI limit cannot bypass admission or create a Worker for an oversized ROM');
  for(const size of [standardGBAROMBytes,mgbaMaxROMBytes])await importROM({name:'synthetic.gba',size},'gba');
  assert.equal(workers,2);assert.equal(stopped,2,'Current supported boundaries still reach the worker');
 }finally{if(originalWorker===undefined)delete globalThis.Worker;else globalThis.Worker=originalWorker;}
 const {listROMZip,extractROMZip}=await import('../src/library/rom-zip.js');
 assert.equal((await listROMZip(directoryROM('gba',mgbaMaxROMBytes)))[0].length,mgbaMaxROMBytes);
 assert.equal((await listROMZip(directoryROM('nds',512*MiB)))[0].length,512*MiB);
 for(const size of [mgbaMaxROMBytes+1,futureGBAROMBytes])await assert.rejects(listROMZip(directoryROM('gba',size)),/ZIP内のゲームが大きすぎ/);
 let reads=0;const unreadable={slice(){reads++;throw Error('Unexpected input read');},arrayBuffer(){reads++;throw Error('Unexpected input read');}};
 await assert.rejects(extractROMZip(unreadable,{system:'gba',length:futureGBAROMBytes}),/ZIP/);assert.equal(reads,0,'Oversized ZIP entry is refused before slicing or output allocation');
 const {applyROMPatch}=await import('../src/library/rom-patch.js');
 for(const [rom,patch]of [[futureGBAROMBytes,1],[1,patchMaxFileBytes+1]])await assert.rejects(applyROMPatch({...unreadable,size:rom},{...unreadable,size:patch}),/64 MiB/);
 assert.equal(reads,0,'Oversized patch inputs are refused before ArrayBuffer copies');
 // Execute the actual worker preflight without allocating its output or calling
 // the upstream parser. A missing target bound must not pass just because the
 // fixture's deliberately omitted checksum would reject it at a later stage.
 const patchScope={importScripts(){},self:{},TextDecoder,IPS:'IPS',BPS:'BPS',UPS:'UPS'};vm.createContext(patchScope);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/library/patch-worker.js'),'utf8'),patchScope);
 for(const type of ['BPS1','UPS1']){
  for(const size of [4,patchMaxROMBytes])assert.equal(patchScope.preflight(patchTarget(type,size),4,capacity),type.slice(0,3));
  for(const size of [patchMaxROMBytes+1,futureGBAROMBytes])assert.throws(()=>patchScope.preflight(patchTarget(type,size),4,capacity),/invalid/);
  assert.equal(patchScope.preflight(patchTarget(type,futureGBAROMBytes),4,{...capacity,patchMaxROMBytes:futureGBAROMBytes}),type.slice(0,3),'Counterfactual budget proves the fixture reaches the capacity check');
 }
 const server=createStaticServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port+'/privacy.html');
  const result=await page.evaluate(async targetPatches=>{
   const {applyROMPatch}=await import('./src/library/rom-patch.js'),{mgbaMaxROMBytes,futureGBAROMBytes}=await import('./src/core/rom-capacity.js');
   const rom=new File([new Uint8Array([1,2,3,4])],'synthetic.gba'),ips=new File([new Uint8Array([80,65,84,67,72,0,0,1,0,2,9,8,69,79,70])],'synthetic.ips');
   const patched=await applyROMPatch(rom,ips),errors=[];
   for(const bytes of targetPatches){
    try{await applyROMPatch(rom,new File([new Uint8Array(bytes)],'synthetic.patch'));errors.push(null);}catch(error){errors.push(error.message);}
   }
   const workerErrors=[];
   for(const size of [mgbaMaxROMBytes+1,futureGBAROMBytes]){
    workerErrors.push(await new Promise((resolve,reject)=>{
     const worker=new Worker(new URL('./src/library/rom-import-worker.js',location.href),{type:'module'}),timer=setTimeout(()=>{worker.terminate();reject(Error('Import guard timeout'));},10000);
     const finish=value=>{clearTimeout(timer);worker.terminate();resolve(value);};
     worker.onerror=event=>finish(event.message);
     worker.onmessage=({data})=>{if(data.type==='error')finish(data.message);else if(data.type==='done')finish(null);};
     worker.postMessage({file:{name:'synthetic.gba',size},system:'gba',language:'ja'});
    }));
   }
   return {patched:Array.from(patched),errors,workerErrors};
  },['BPS1','UPS1'].map(type=>Array.from(patchTarget(type,futureGBAROMBytes))));
  assert.deepEqual(result.patched,[1,9,8,4],'Classic patch Worker imports the shared contract and preserves IPS output');
  assert.equal(result.errors.length,2);for(const error of result.errors)assert.match(error,/パッチが壊れているか/,'128 MiB BPS/UPS target is rejected');
  for(const error of result.workerErrors)assert.match(error,/このROM容量には対応していません/,'Direct Worker entry rejects unsupported size before trying FileReader');
  await context.close();
 }finally{try{if(browser)await browser.close();}finally{await new Promise(resolve=>server.close(resolve));}}
 console.log('PASS: '+kind+' reviewed 64 MiB / VBA 32 MiB contract, native-policy synchronization, pre-read import/ZIP/patch guards and disabled 128 MiB targets.');
})().catch(error=>{console.error(error);process.exitCode=1;});
