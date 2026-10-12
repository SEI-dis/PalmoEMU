// SPDX-License-Identifier: AGPL-3.0-or-later
// Keep large file copies and hashing away from the UI thread. No ROM bytes are
// posted back to the page; the worker commits them before reporting success.
import {tr,language} from './i18n/index.js';
export function importROM(file,system,onProgress){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./rom-import-worker.js',import.meta.url),{type:'module'});
  const finish=(fn,value)=>{worker.terminate();fn(value);};
  worker.onerror=event=>{event.preventDefault();finish(reject,new Error(event.message||tr('ゲームを追加できませんでした。もう一度お試しください。')));};
  worker.onmessage=({data})=>{
   if(data.type==='progress')onProgress?.(data);
   else if(data.type==='done')finish(resolve,data);
   else if(data.type==='error'){const error=new Error(data.message);error.name=data.name;finish(reject,error);}
  };
  worker.onmessageerror=()=>finish(reject,new Error(tr('ゲームの追加処理を読み取れませんでした。')));
  try{worker.postMessage({file,system,language});}catch(error){finish(reject,error);}
 });
}
