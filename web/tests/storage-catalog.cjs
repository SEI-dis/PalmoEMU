// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic bytes in an isolated IndexedDB. No ROM is executed by this test.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});try{
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'privacy.html');
 const result=await page.evaluate(async()=>{
  const db=await import('./src/storage/storage.js'),{saveCatalogPrefix}=await import('./src/storage/save-catalog.js'),{hash}=await import('./src/shared.js'),{exportState}=await import('./src/storage/state-transfer.js'),{prepareBackupExport,createBackupPart,releaseBackupPlan}=await import('./src/storage/backup.js');
  const a={id:'a'.repeat(64),name:'Synthetic A',system:'gba',size:4},b={...a,id:'b'.repeat(64),name:'Synthetic B'},coreId='mgba-rom64-save6-v2';
  const record=async(at,byte=at)=>{const bytes=new Uint8Array(1024).fill(byte),save=new Uint8Array([byte]);return {bytes,save,hash:await hash(bytes),saveHash:await hash(save),at,coreId,image:'data:image/png;base64,c3ludGhldGlj'};};
  const one=await record(1),two=await record(2),three=await record(3),key=a.id+':one';
  await db.addGame(a,new Uint8Array([1,2,3,4]));await db.addGame(b,new Uint8Array([4,3,2,1]));
  await db.put('states',key,one);await db.put('states',b.id+':other',two);await db.put('recoveries',a.id,[two,one]);await db.put('saves',a.id,{bytes:one.save,hash:one.saveHash,at:1,coreId});
  const opened=indexedDB.open('manicemu-web',5),connection=await new Promise((resolve,reject)=>{opened.onsuccess=()=>resolve(opened.result);opened.onerror=()=>reject(opened.error);});
  const legacy=(store,operation,key,value)=>new Promise((resolve,reject)=>{const tx=connection.transaction(store,'readwrite'),target=tx.objectStore(store);operation==='delete'?target.delete(key):target.put(value,key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  const reads=[],original={};for(const method of ['get','getAll','openCursor']){original[method]=IDBObjectStore.prototype[method];IDBObjectStore.prototype[method]=function(key,...args){reads.push({store:this.name,method,key:typeof key==='string'?key:null});return original[method].call(this,key,...args);};}
  const binaryReads=()=>reads.filter(read=>['states','saves','backups','archives','recoveries','roms'].includes(read.store));
  const first=await db.stateCatalog(a.id),light=first.manual.length===1&&first.automatic.length===2&&!('bytes'in first.manual[0].value)&&!('save'in first.manual[0].value)&&first.manual[0].value.byteLength===1025&&binaryReads().length===0;
  reads.length=0;await db.stateCatalog(a.id,{mode:'manual'});const manualOnly=binaryReads().length===0;
  reads.length=0;const chosen=await db.readStateSelection(a,first.manual[0]),oneSelected=chosen.hash===one.hash&&binaryReads().length===1&&binaryReads()[0].key===key;
  // Reordering an automatic array must keep the chosen generation, not its old index.
  await db.put('recoveries',a.id,[three,two,one]);const recovery=await db.readStateSelection(a,first.automatic[1]);
  const reordered=recovery.at===1;
  // An old/other tab can add or remove keys without our companion metadata.
  await legacy('states','put',a.id+':legacy',three);await legacy('coverCatalogs','delete',saveCatalogPrefix+'states:'+b.id+':other');
  reads.length=0;const migrated=await db.stateCatalog(a.id,{mode:'manual'}),firstBackfill=binaryReads().map(read=>read.key);
  reads.length=0;await db.stateCatalog(a.id,{mode:'manual'});const repeatReads=binaryReads().length;
  await legacy('states','delete',a.id+':legacy');const pruned=(await db.stateCatalog(a.id,{mode:'manual'})).manual.length===1;
  // Legacy overwrite is rejected; reopening repairs its old metadata.
  await legacy('states','put',key,two);let stale=false;try{await db.readStateSelection(a,first.manual[0]);}catch{stale=true;}
  const refreshed=await db.stateCatalog(a.id,{mode:'manual'}),fresh=(await db.readStateSelection(a,refreshed.manual[0])).at===2;
  // Changed payload with unchanged metadata still goes through hash validation.
  await legacy('states','put',key,{...two,bytes:new Uint8Array(1024).fill(77)});let integrity=false;try{await exportState(a,await db.readStateSelection(a,refreshed.manual[0]));}catch{integrity=true;}
  await db.put('states',key,two);
  reads.length=0;const inventory=await db.readBackupData({summary:true,inventoryOnly:true});const inventoryOnly=inventory.games.length===2&&inventory.records.length===0&&reads.every(read=>read.store==='library');
  reads.length=0;const summary=await db.readBackupData({summary:true,gameIds:[a.id]});const scoped=summary.games.length===1&&summary.records.every(row=>row.key.startsWith(a.id))&&binaryReads().length===0;
  // Failed companion writes abort original data too. Optional read-side repair
  // may fall back to readonly when storage is full.
  const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){if(this.name==='coverCatalogs'&&String(key).startsWith(saveCatalogPrefix))throw new DOMException('Synthetic catalog quota','QuotaExceededError');return put.call(this,value,key);};
  let aborted=false;try{await db.put('states',key,three);}catch{aborted=true;}
  const fallback=await db.stateCatalog(b.id,{mode:'manual'});IDBObjectStore.prototype.put=put;
  const atomic=aborted&&(await db.get('states',key)).at===2&&fallback.manual.length===1;
  // The ordinary protection writer updates save/recovery metadata atomically.
  await db.put('sessions',a.id,{id:'catalog-session'});await db.commitProtectionBatch([{id:a.id,sessionId:'catalog-session',save:{bytes:three.save,hash:three.saveHash,at:3,coreId},recovery:three}]);
  reads.length=0;const protection=await db.readBackupData({summary:true,gameIds:[a.id]});const indexedProtection=protection.records.find(row=>row.store==='saves').value.at===3&&binaryReads().length===0;
  // Restore/remove must delete obsolete metadata while preserving other games.
  await db.restoreBackupData({games:[a],records:[{store:'states',key:a.id+':restored',value:three}],cleanGame:value=>value,cleanRecord:value=>value});
  reads.length=0;const restored=await db.stateCatalog(a.id);const restoreIndexed=restored.manual.length===1&&restored.manual[0].key===a.id+':restored'&&restored.automatic.length===0&&binaryReads().length===0;
  await db.removeStates(a.id,[a.id+':restored']);const removed=(await db.stateCatalog(a.id)).manual.length===0&&(await db.stateCatalog(b.id)).manual.length===1;
  // A pre-catalog tab can overwrite an existing key. Backup generation checks
  // must inspect original records, including array order, rather than cached rows.
  const c={...a,id:'c'.repeat(64),name:'Legacy export'},d={...a,id:'d'.repeat(64),name:'Legacy split restore'};
  await db.addGame(c,new Uint8Array([1,2,3,4]));await db.addGame(d,new Uint8Array([1,2,3,4]));
  const battery=async byte=>{const bytes=new Uint8Array([byte]);return {bytes,hash:await hash(bytes),at:byte*100,coreId};};
  const r11=await battery(11),r22=await battery(22),r33=await battery(33),r44=await battery(44);
  await db.put('backups',c.id,[r22,r11]);const oldPlan=await prepareBackupExport({},{gameIds:[c.id],partBytes:1});
  await legacy('backups','put',c.id,[r33,r22,r11]);let oldExportRejected=false;
  try{await createBackupPart(oldPlan,1);}catch{oldExportRejected=true;}finally{releaseBackupPlan(oldPlan);}
  const freshPlan=await prepareBackupExport({},{gameIds:[c.id],partBytes:1}),exported=[];
  for(const part of freshPlan.parts){const file=await createBackupPart(freshPlan,part.index);exported.push(...file.archive.records.filter(row=>row.store==='backups').flatMap(row=>row.value.map(value=>atob(value.bytes).charCodeAt(0))));}
  releaseBackupPlan(freshPlan);const legacyExport=oldExportRejected&&JSON.stringify(exported)===JSON.stringify([33,22,11]);
  // New play between split files needs a fresh rollback baseline even when an
  // old tab updated the payload without updating the optional catalog.
  await db.put('saves',d.id,r11);const part={id:'f'.repeat(64),count:2};
  await db.restoreBackupData({games:[d],records:[{store:'saves',key:d.id,value:r22}],cleanGame:value=>value,cleanRecord:value=>value,merge:true,part:{...part,index:1}});
  await legacy('saves','put',d.id,r33);
  await db.restoreBackupData({games:[d],records:[{store:'saves',key:d.id,value:r44}],cleanGame:value=>value,cleanRecord:value=>value,merge:true,part:{...part,index:2}});
  const previous=await db.readPreviousBackup(),legacySplitRestore=previous.records.find(row=>row.store==='saves'&&row.key===d.id).value.bytes[0]===33&&(await db.get('saves',d.id)).bytes[0]===44;
  await db.trainerCard();reads.length=0;const writes=[];IDBObjectStore.prototype.put=function(value,key){writes.push({store:this.name,key});return put.call(this,value,key);};await db.trainerCard();IDBObjectStore.prototype.put=put;
  const trainerStable=writes.length===0&&reads.filter(read=>read.store==='coverCatalogs'&&read.method==='get').length===1;
  for(const [method,fn]of Object.entries(original))IDBObjectStore.prototype[method]=fn;connection.close();
  return {light,manualOnly,oneSelected,reordered,backfill:migrated.manual.length===2&&firstBackfill.length===1&&firstBackfill[0]===a.id+':legacy'&&repeatReads===0,pruned,stale,fresh,integrity,inventoryOnly,scoped,atomic,indexedProtection,restoreIndexed,removed,legacyExport,legacySplitRestore,trainerStable};
 });
 for(const [name,value]of Object.entries(result))assert.equal(value,true,name);assert.deepEqual(errors,[]);
 await context.close();console.log(`PASS ${kind}: lightweight/scoped save catalogs, legacy repair, fresh legacy export/split-restore generations, selected generation/hash checks, atomic writes/restore/remove, inventory-only reads, stable trainer refresh`);
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
