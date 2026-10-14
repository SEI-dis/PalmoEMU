// SPDX-License-Identifier: AGPL-3.0-or-later
// Only the existing atomic transaction runs here. Capture, hashing, session
// ownership and recovery from uncertain transport outcomes stay with the page.
import * as db from './storage.js';
import {setWorkerLanguage} from '../i18n/index.js';
let initialized=false,queue=Promise.resolve();
self.onmessage=({data})=>{
 queue=queue.catch(()=>{}).then(async()=>{
  if(!data||data.version!==1)throw new TypeError('Invalid save worker protocol');
  if(data.type==='init'&&data.id===0&&!initialized){
   try{
    await setWorkerLanguage(data.language);
    // Importing storage only starts open(); this read proves DB initialization
    // is finished before the page may dispatch a save.
    await db.has('sessions','\u0000palmo-save-worker-ready');
    initialized=true;self.postMessage({version:1,type:'ready',id:0});
   }catch(error){self.postMessage({version:1,type:'init-error',id:0,name:error.name,message:error.message});}
   return;
  }
  if(!initialized||data.type!=='commit'||!Number.isSafeInteger(data.id)||data.id<1||!data.entry)throw new TypeError('Invalid save worker request');
  try{
   await setWorkerLanguage(data.language);
   await db.commitProtectionBatch([data.entry]);
  }catch(error){
   // storage rejects only before a transaction starts or after tx.onabort.
   self.postMessage({version:1,type:'error',id:data.id,outcome:'not-committed',name:error.name||'Error',message:error.message||String(error)});return;
  }
  // Do not include the snapshot in the reply: callers retain their own bytes.
  self.postMessage({version:1,type:'done',id:data.id});
 });
 // Invalid protocol is a transport failure, never a claimed transaction abort.
 queue.catch(error=>{setTimeout(()=>{throw error;});});
};
