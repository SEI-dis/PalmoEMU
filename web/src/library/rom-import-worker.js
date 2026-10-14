// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr,setWorkerLanguage} from '../i18n/index.js';
import {hash} from '../shared.js';
import {largeFileIdentity} from '../core/development.js';
import * as db from '../storage/storage.js';
import {listROMZip,extractROMZip} from './rom-zip.js';
import {finishROMUpdate} from './rom-update.js';
const progress=(phase,loaded,total,name)=>self.postMessage({type:'progress',phase,loaded,total,name});
function read(file){return new Promise((resolve,reject)=>{
 const reader=new FileReader();
 reader.onprogress=e=>progress('reading',e.loaded,file.size);
 reader.onload=()=>resolve(new Uint8Array(reader.result));
 reader.onerror=()=>reject(reader.error||new Error(tr('ファイルを読み込めませんでした。')));
 reader.onabort=()=>reject(new Error(tr('ファイルの読み込みが中断されました。')));
 reader.readAsArrayBuffer(file);
});}
async function storeROM(file,system,unpacked,{inspectOnly=false,updatePlan,expectedId}={}){
  progress('reading',0,file.size);
  const bytes=system==='3ds'?null:unpacked||await read(file);
  progress('checking');
  const id=system==='3ds'?await largeFileIdentity(file):await hash(bytes);
  const game={id,name:file.name.replace(/\.[^.]+$/,''),filename:file.name,system,size:file.size,added:Date.now(),lastPlayed:0,favorite:false};
  if(expectedId&&id!==expectedId)throw Error(tr('取り外したものと同じROMを選んでください。'));
  if(inspectOnly){
   const startROM=system==='gba'?(await import('../start-save/migration.js')).identifyStartROM(bytes):null;
   return {id,game,startROM};
  }
  if(!updatePlan&&await db.get('library',id)&&await db.has('roms',id))return {id,added:false};
  progress('saving');
  // NDS files can reach 512 MiB. Blob storage avoids the serialized-value
  // limit in Chromium. Some WebKit builds reject Blob persistence; those can
  // still store the original bytes. Failed transactions leave neither record.
  // ZIP entries carry metadata and bytes, not a second immutable File copy.
  // Delay the NDS Blob copy until hashing and the duplicate check are complete.
  const store=rom=>updatePlan?finishROMUpdate(updatePlan,game,rom,({index,total})=>progress('migrating',index,total)):db.addGame(game,rom);
  try{await store(system==='nds'?(unpacked?new Blob([bytes],{type:'application/octet-stream'}):file.slice()):system==='3ds'?file:bytes);}
  catch(error){
   if(system!=='nds'||error.name!=='UnknownError')throw error;
   await store(bytes);
  }
  return {id,added:true};
}
self.onmessage=async({data:{file,system,language,...options}})=>{
 let addedCount=0,duplicateCount=0;
 try{
  await setWorkerLanguage(language);
  if(/\.zip$/i.test(file.name)){
   if(options.inspectOnly||options.updatePlan||options.expectedId)throw Error(tr('ZIPを解凍し、ROMファイルを選んでください。'));
   progress('unpacking',0,file.size);
   const entries=await listROMZip(file);
   for(const entry of entries){
    progress('unpacking',0,entry.length,entry.filename);
    const extracted=await extractROMZip(file,entry,(loaded,total)=>progress('unpacking',loaded,total,entry.filename));
    const result=await storeROM(extracted,extracted.system,extracted.bytes);
    if(result.added)addedCount++;else duplicateCount++;
   }
   self.postMessage({type:'done',addedCount,duplicateCount});
  }else self.postMessage({type:'done',...await storeROM(file,system,undefined,options)});
 }catch(error){self.postMessage({type:'error',name:error.name||'Error',message:error.message||tr('ゲームを追加できませんでした。'),addedCount,duplicateCount});}
};
