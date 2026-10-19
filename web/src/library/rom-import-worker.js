// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr,setWorkerLanguage} from '../i18n/index.js';
import {hash} from '../shared.js';
import {largeFileIdentity} from '../core/development.js';
import * as db from '../storage/storage.js';
import {listROMZip,extractROMZip} from './rom-zip.js';
import {finishROMUpdate} from './rom-update.js';
import {supportsROMSize} from '../core/rom-capacity.js';
import {storeROMData} from './rom-storage.js';
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
  if(!supportsROMSize(system,file.size))throw Error(tr('このROM容量には対応していません。'));
  progress('reading',0,file.size);
  const bytes=system==='3ds'?null:unpacked||await read(file);
  if(bytes&&!supportsROMSize(system,bytes.byteLength))throw Error(tr('このROM容量には対応していません。'));
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
  // The update path rechecks the same authoritative bytes before choosing a
  // storage representation. Ordinary imports reuse the immutable input File.
  if(updatePlan)await finishROMUpdate(updatePlan,game,system==='3ds'?file:bytes,({index,total})=>progress('migrating',index,total));
  else if(system==='3ds')await db.addGame(game,file);
  else await storeROMData(system,bytes,rom=>db.addGame(game,rom),unpacked?undefined:file);
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
