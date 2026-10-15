// SPDX-License-Identifier: AGPL-3.0-or-later
// Keep large file copies and hashing away from the UI thread. No ROM bytes are
// posted back to the page; the worker commits them before reporting success.
import {tr,language} from '../i18n/index.js';
import {runWorkerTask} from '../workers/task.js';
import {romSizeClass,withImportContext} from '../runtime/memory-diagnostics.js';
export function importROM(file,system,onProgress,options={}){
 let stage='starting';
 // A ZIP's compressed size is not the size of its contained ROM(s).
 const romClass=/\.zip$/i.test(file.name)?'unknown':romSizeClass(file.size);
 return runWorkerTask(
  ()=>new Worker(new URL('./rom-import-worker.js',import.meta.url),{type:'module'}),
  {file,system,language,...options},
  {
   onProgress:data=>{stage=data.phase;onProgress?.(data);},
   errorMessage:()=>tr('ゲームを追加できませんでした。もう一度お試しください。'),
   messageError:()=>tr('ゲームの追加処理を読み取れませんでした。'),
   mapError:data=>Object.assign(new Error(data.message),{name:data.name,addedCount:data.addedCount||0,duplicateCount:data.duplicateCount||0}),
  },
 ).catch(error=>{throw withImportContext(error,{stage,romSizeClass:romClass});});
}
