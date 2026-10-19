// SPDX-License-Identifier: AGPL-3.0-or-later
import {standardGBAROMBytes} from '../core/rom-capacity.js';

// Keep existing byte records readable. New large cartridges use immutable Blob
// storage so loading can read bounded chunks instead of materializing the ROM.
export async function storeROMData(system,bytes,store,file){
 const useBlob=system==='nds'||system==='gba'&&bytes.byteLength>standardGBAROMBytes;
 const payload=useBlob?(file instanceof Blob?file.slice():new Blob([bytes],{type:'application/octet-stream'})):bytes;
 try{return await store(payload);}
 catch(error){
  // Some WebKit builds cannot persist Blobs. The failed transaction is atomic;
  // retry its original bytes only for that known serialization failure.
  if(!useBlob||error.name!=='UnknownError')throw error;
  return store(bytes);
 }
}
