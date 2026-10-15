// SPDX-License-Identifier: AGPL-3.0-or-later
// Primitive, allowlisted failure metadata only. Never retain modules or buffers.
import {tr} from '../i18n/index.js';

const operations=new Set(['copy-in','rom-load','save-import','state-import','cheat-name','cheat-code']);
const reasons=new Set(['malloc-null','malloc-exception','native-init']);
const sizes=['up-to-4MiB','up-to-16MiB','up-to-32MiB','up-to-64MiB','up-to-128MiB','up-to-512MiB','over-512MiB'];
const importStages=new Set(['starting','reading','checking','saving','unpacking','migrating']);
const field=(value,key)=>{try{return value?.[key];}catch{return undefined;}};
const byteCount=value=>Number.isSafeInteger(value)&&value>=0&&value<=0x100000000?value:null;
const sizeClass=value=>sizes.includes(value)?value:'unknown';

export function romSizeClass(bytes){
 if(!Number.isSafeInteger(bytes)||bytes<=0)return 'unknown';
 const index=[4,16,32,64,128,512].findIndex(limit=>bytes<=limit*1048576);
 return sizes[index<0?6:index];
}
export function wasmMemoryBytes(module){
 return byteCount(field(field(field(module,'HEAPU8'),'buffer'),'byteLength'));
}
export function safeAllocation(value){
 const operation=field(value,'operation'),reason=field(value,'reason');
 if(!operations.has(operation)||!reasons.has(reason)||reason==='native-init'&&operation!=='rom-load')return;
 return {operation,reason,
  // The native bridge reports a failed initialization, not which allocation
  // failed. ROM input length must never be presented as that requested size.
  requestedBytes:reason==='native-init'?null:byteCount(field(value,'requestedBytes')),
  memoryBytesBefore:byteCount(field(value,'memoryBytesBefore')),romSizeClass:sizeClass(field(value,'romSizeClass'))};
}
export function safeImportContext(value){
 const stage=field(value,'stage');if(!importStages.has(stage))return;
 return {stage,romSizeClass:sizeClass(field(value,'romSizeClass'))};
}
function attach(error,key,value){
 try{if(value)Object.defineProperty(error,key,{value:Object.freeze(value),configurable:true});}catch{}
 return error;
}
export const withAllocation=(error,details)=>attach(error,'allocation',safeAllocation(details));
export const withImportContext=(error,details)=>attach(error,'importContext',safeImportContext(details));
export function allocateCoreMemory(module,requestedBytes,operation='copy-in',romClass='unknown'){
 const details={operation,requestedBytes,memoryBytesBefore:wasmMemoryBytes(module),romSizeClass:romClass};
 let pointer;
 try{pointer=module._malloc(requestedBytes);}
 catch(error){throw withAllocation(error,{...details,reason:'malloc-exception'});}
 if(!pointer)throw withAllocation(new Error(tr('メモリを確保できませんでした。')),{...details,reason:'malloc-null'});
 return pointer;
}
