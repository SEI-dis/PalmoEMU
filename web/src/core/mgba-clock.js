// SPDX-License-Identifier: AGPL-3.0-or-later
// Extended-cartridge hardware signature, not a filename or game version.
// The Celio fork defaults to 2x CPU execution. Keep ordinary GBA cartridges
// at hardware speed, and allow an explicit user choice to override either.
export function recommendedGBACPUClock(bytes){
  if(!(bytes instanceof Uint8Array)||bytes.length<0x02000008||bytes.length>64*1048576||bytes[0xb2]!==0x96)return 1;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  return view.getUint32(0x02000000,true)===0x50534b50&&view.getUint32(0x02000004,true)===0x31534349?2:1;
}
export function resolveGBACPUClock(preference,recommended=1){
  return [1,2,4,8].includes(preference)?preference:recommended===2?2:1;
}
