// SPDX-License-Identifier: AGPL-3.0-or-later
import {language,tr} from './i18n/index.js';
export function startSaveTask(options,onProgress){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./start-save-worker.js',import.meta.url),{type:'module'});
  const finish=(fn,value)=>{worker.terminate();fn(value);};
  worker.onmessage=({data})=>{
   if(data.type==='progress')onProgress?.(data);
   else if(data.type==='done')finish(resolve,data);
   else if(data.type==='error')finish(reject,new Error(data.message));
  };
  worker.onerror=event=>{event.preventDefault();finish(reject,new Error(event.message||tr('セーブを変換できませんでした。元のデータは残っています。')));};
  worker.onmessageerror=()=>finish(reject,new Error(tr('セーブを変換できませんでした。元のデータは残っています。')));
  try{worker.postMessage({...options,language});}catch(error){finish(reject,error);}
 });
}
