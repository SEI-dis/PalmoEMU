// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr,setWorkerLanguage} from './i18n/index.js';
import {hash} from './shared.js';
import {largeFileIdentity} from './development.js';
import * as db from './storage.js';
const progress=(phase,loaded,total)=>self.postMessage({type:'progress',phase,loaded,total});
function read(file){return new Promise((resolve,reject)=>{
 const reader=new FileReader();
 reader.onprogress=e=>progress('reading',e.loaded,file.size);
 reader.onload=()=>resolve(new Uint8Array(reader.result));
 reader.onerror=()=>reject(reader.error||new Error(tr('ファイルを読み込めませんでした。')));
 reader.onabort=()=>reject(new Error(tr('ファイルの読み込みが中断されました。')));
 reader.readAsArrayBuffer(file);
});}
self.onmessage=async({data:{file,system,language}})=>{setWorkerLanguage(language);
 try{
  progress('reading',0,file.size);
  const bytes=system==='3ds'?null:await read(file);
  progress('checking');
  const id=system==='3ds'?await largeFileIdentity(file):await hash(bytes);
  if(await db.get('library',id)&&await db.has('roms',id)){self.postMessage({type:'done',id,added:false});return;}
  const game={id,name:file.name.replace(/\.[^.]+$/,''),filename:file.name,system,size:file.size,added:Date.now(),lastPlayed:0,favorite:false};
  progress('saving');
  // NDS files can reach 512 MiB. Blob storage avoids the serialized-value
  // limit in Chromium. Some WebKit builds reject Blob persistence; those can
  // still store the original bytes. Failed transactions leave neither record.
  try{await db.addGame(game,system==='nds'?file.slice():system==='3ds'?file:bytes);}
  catch(error){
   if(system!=='nds'||error.name!=='UnknownError')throw error;
   await db.addGame(game,bytes);
  }
  self.postMessage({type:'done',id,added:true});
 }catch(error){self.postMessage({type:'error',name:error.name||'Error',message:error.message||tr('ゲームを追加できませんでした。')});}
};
