// SPDX-License-Identifier: AGPL-3.0-or-later
// Bound the temporary JS buffer when an immutable ROM is stored as a Blob.
import {tr} from '../i18n/index.js';

export const romReadChunkBytes=4*1048576;
export const romByteLength=input=>input instanceof Blob?input.size:input instanceof Uint8Array?input.byteLength:input instanceof ArrayBuffer?input.byteLength:0;
export function checkROMLoadCancelled(cancelled){if(cancelled?.())throw new DOMException('Core closed during loading','AbortError');}
export async function copyROMToHeap(module,pointer,input,{cancelled}={}){
 checkROMLoadCancelled(cancelled);
 if(!(input instanceof Blob)){
  module.HEAPU8.set(input instanceof ArrayBuffer?new Uint8Array(input):input,pointer);return;
 }
 for(let offset=0;offset<input.size;offset+=romReadChunkBytes){
  checkROMLoadCancelled(cancelled);
  const length=Math.min(romReadChunkBytes,input.size-offset);
  const chunk=await input.slice(offset,offset+length).arrayBuffer();
  checkROMLoadCancelled(cancelled);
  if(chunk.byteLength!==length)throw Error(tr('ファイルを読み込めませんでした。'));
  // A shared native module may grow while this Blob read is pending.
  module.HEAPU8.set(new Uint8Array(chunk),pointer+offset);
 }
}
