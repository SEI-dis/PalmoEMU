// SPDX-License-Identifier: AGPL-3.0-or-later
// Extended-cartridge hardware signature, not a filename or game version.
// The Celio fork defaults to 2x CPU execution. Keep ordinary GBA cartridges
// at hardware speed, and allow an explicit user choice to override either.
import {mgbaMaxROMBytes} from './rom-capacity.js';
export function hasExtendedGBACartridgeHeader(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<0x02000008||bytes.length>mgbaMaxROMBytes||bytes[3]!==0xea||bytes[0xb2]!==0x96)return false;
  // Match the pinned native GBAIsROM raw-cartridge checks, including its
  // GBAIsBIOS exclusion. Otherwise a GB file containing probe-like data could
  // receive GBA-only defaults or correction before native platform detection.
  let bios=true;
  for(let p=0;p<28;p+=4)if(bytes[p+3]!==0xea||bytes[p+2]!==0){bios=false;break;}
  if(bios)return false;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  return view.getUint32(0x02000000,true)===0x50534b50&&view.getUint32(0x02000004,true)===0x31534349;
}
export function recommendedGBACPUClock(bytes){return hasExtendedGBACartridgeHeader(bytes)?2:1;}
export function resolveGBACPUClock(preference,recommended=1){
  return [1,2,4,8].includes(preference)?preference:recommended===2?2:1;
}
