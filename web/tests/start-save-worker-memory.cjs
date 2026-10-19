// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated synthetic ROM/save fixtures; workers identify but never execute ROMs.
const assert=require('node:assert/strict');
const runtime=require('./browser-runtime.cjs'),{fixture35,fakeROM,hash}=require('./helpers/start-save-fixtures.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[],fixture=fixture35({second:true});
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/__start-memory-save',route=>route.fulfill({body:Buffer.from(fixture),contentType:'application/octet-stream'}));
  await context.route('**/src/start-save/worker.js',async route=>{
   const response=await route.fetch();
   // Some WebKit builds cannot persist Blobs. In that case keep real array
   // records and also exercise Blob normalization through this read adapter.
   const probe=`const romReads=[];let blobReads=0,forceBlob=false;
const originalGet=IDBObjectStore.prototype.get,readResult=Object.getOwnPropertyDescriptor(IDBRequest.prototype,'result').get,originalArrayBuffer=Blob.prototype.arrayBuffer,originalPost=self.postMessage.bind(self);
self.addEventListener('message',event=>{forceBlob=event.data.__memoryBlobRead===true;});
IDBObjectStore.prototype.get=function(key){const request=originalGet.call(this,key);if(this.name==='roms'){romReads.push(key);if(forceBlob)Object.defineProperty(request,'result',{get(){const value=readResult.call(request);return value instanceof Uint8Array?new Blob([value]):value;}});}return request;};
Blob.prototype.arrayBuffer=function(){blobReads++;return originalArrayBuffer.call(this);};
self.postMessage=(data,transfer)=>{if(data.type==='done')data={...data,memory:{romReads,blobReads,transferSizes:(transfer||[]).map(buffer=>buffer.byteLength),separate:!data.bytes||data.bytes.buffer!==data.original.buffer}};return originalPost(data,transfer);};
`;
   await route.fulfill({response,body:probe+await response.text()});
  });
  await page.goto(base);await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy')&&localStorage.getItem('manic-settings')!==null);
  const result=await page.evaluate(async({oldROM,newROM})=>{
   const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),{startSaveTask}=await import('./src/start-save/client.js');
   const oldBytes=new Uint8Array(oldROM),newBytes=new Uint8Array(newROM),sourceId=await hash(oldBytes),targetId=await hash(newBytes);
   const source={id:sourceId,name:'START source',system:'gba',coreKey:'mgba',size:oldBytes.length},target={id:targetId,name:'START target',system:'gba',coreKey:'mgba',size:newBytes.length};
   await db.addGame(source,oldBytes);await db.addGame(target,newBytes);
   const bytes=new Uint8Array(await(await fetch('./__start-memory-save')).arrayBuffer()),digest=await hash(bytes),save={bytes,hash:digest,at:123};await db.put('saves',sourceId,save);
   const results=[];let blobStorage=true;
   const storeROM=async(id,bytes,blob)=>{
    if(blob&&blobStorage)try{return await db.put('roms',id,new Blob([bytes]));}catch(error){if(error.name!=='UnknownError')throw error;blobStorage=false;}
    await db.put('roms',id,bytes);
   };
   for(const mode of ['bytes','blob']){
    await storeROM(sourceId,oldBytes,mode==='blob');await storeROM(targetId,newBytes,mode==='blob');
    const transport={__memoryBlobRead:mode==='blob'&&!blobStorage};
    const same=await startSaveTask({action:'inspect',id:sourceId,targetId:sourceId,...transport});
    const inspection=await startSaveTask({action:'inspect',id:sourceId,targetId,targetProfile:{version:'0.49.0',minimumSaveVersion:'0.36.2'},...transport});
    const request={id:sourceId,targetId,from:'0.35.0',hash:inspection.hash,at:inspection.at,...transport};
    const classification=await startSaveTask({action:'classify',...request});
    const converted=await startSaveTask({action:'convert',...request});
    const originalHash=await hash(converted.original),convertedHash=await hash(converted.bytes);
    converted.original[0]^=1;
    results.push({mode,same,inspection,classification,conversion:converted.memory,originalHash,convertedHash,independent:convertedHash===await hash(converted.bytes),persisted:await hash((await db.get('saves',sourceId)).bytes)});
   }
   // Previous-update records can contain a subarray. Do not transfer unrelated
   // backing-buffer bytes; the exported original stays compact and independent.
   const padded=new Uint8Array(bytes.length+32).fill(0xac);padded.set(bytes,16);
   await db.put('coverCatalogs',db.romUpdateMetadataPrefix+targetId,{sourceId,targetId,sourceName:source.name,system:'gba',coreKey:'mgba',save:{...save,bytes:padded.subarray(16,-16)}});
   const previous=await startSaveTask({action:'convert',id:targetId,previous:true,targetId,from:'0.35.0',hash:digest,at:save.at,__memoryBlobRead:!blobStorage});
   const backupBefore=await hash((await db.get('coverCatalogs',db.romUpdateMetadataPrefix+targetId)).save.bytes);
   previous.original.fill(0);
   const backupPreserved=backupBefore===await hash((await db.get('coverCatalogs',db.romUpdateMetadataPrefix+targetId)).save.bytes);
   // Every worker checks the current stored ROM. A prior known profile or a
   // caller-supplied verified profile cannot authorize replacement bytes.
   await storeROM(targetId,new Uint8Array(192),true);
   const request={id:sourceId,targetId,from:'0.35.0',hash:digest,at:save.at,targetProfile:{version:'0.42.3'},__memoryBlobRead:!blobStorage};
   const changed=await startSaveTask({action:'classify',...request});let rejected=false;
   try{await startSaveTask({action:'convert',...request,allowUnverified:true});}catch{rejected=true;}
   await storeROM(targetId,newBytes,true);
   const restored=await startSaveTask({action:'classify',...request});
   return {sourceId,targetId,blobStorage,results,previous:{memory:previous.memory,byteLength:previous.original.byteLength,bufferLength:previous.original.buffer.byteLength},backupPreserved,changed,rejected,restored,persisted:await hash((await db.get('saves',sourceId)).bytes),targetUntouched:!await db.has('saves',targetId)};
  },{oldROM:[...fakeROM(2749620783)],newROM:[...fakeROM(47924504)]});
  let convertedHash;
  for(const row of result.results){
   const blob=row.mode==='blob';
   assert.deepEqual(row.same.memory.romReads,[result.sourceId],'Same source/target is read once within the worker');assert.equal(row.same.memory.blobReads,blob?1:0);
   assert.equal(row.same.identity.version,'0.35.0');assert.equal(row.same.version,'0.35.0');
   assert.deepEqual(row.inspection.memory.romReads,[result.targetId,result.sourceId]);assert.equal(row.inspection.memory.blobReads,blob?2:0);
   assert.equal(row.inspection.compatibility.to,'0.42.3','Stored ROM overrides the supplied profile');assert.equal(row.inspection.validationError,null);
   assert.deepEqual(row.classification.memory.romReads,[result.targetId]);assert.equal(row.classification.compatibility.status,'convert');
   assert.deepEqual(row.conversion.romReads,[result.targetId]);assert.deepEqual(row.conversion.transferSizes,[fixture.length,fixture.length]);assert.equal(row.conversion.separate,true);
   assert.equal(row.originalHash,hash(fixture));assert.equal(row.persisted,hash(fixture));assert.equal(row.independent,true);
   if(convertedHash)assert.equal(row.convertedHash,convertedHash,'Blob and legacy array ROMs produce identical output');convertedHash=row.convertedHash;
  }
  assert.deepEqual(result.previous.memory.transferSizes,[fixture.length,fixture.length]);assert.equal(result.previous.byteLength,fixture.length);assert.equal(result.previous.bufferLength,fixture.length);assert.equal(result.backupPreserved,true);
  assert.equal(result.changed.targetReady,false);assert.equal(result.rejected,true);assert.equal(result.restored.targetReady,true,'No profile is cached across workers');
  assert.equal(result.persisted,hash(fixture));assert.equal(result.targetUntouched,true);assert.deepEqual(errors,[]);
  await context.close();console.log('PASS '+kind+': START Blob/legacy profile reads ('+(result.blobStorage?'persisted Blob':'array storage fallback + synthetic Blob read adapter')+'), per-worker deduplication, transferred independent saves, compact previous backups, forged-profile refusal and immutable DB originals');
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
