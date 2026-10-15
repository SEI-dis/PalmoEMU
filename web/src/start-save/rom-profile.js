// SPDX-License-Identifier: AGPL-3.0-or-later
// Read the native save-version writer and Continue-menu compatibility gate.
// The supplied migration source's analysis/extract-compat.py documents the
// 0x50EF variable and VarSet ABI. Addresses of the compiled routines may move.
// No ROM is executed or changed, and a filename is never identification proof.
const versionVariable=0x50ef,varGet=0x0806dd5d,varSet=0x0806dd79;
const stampVersion=stamp=>`0.${stamp>>>8}.${stamp&255}`;
export function isStartROMFamily(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<0x2000008||bytes.length>64*1048576)return false;
 const text=(at,value)=>[...value].every((char,i)=>bytes[at+i]===char.charCodeAt(0));
 return text(0xa0,'POKEMONSTART')&&text(0xac,'PKSJ')&&bytes[0xb2]===0x96&&text(0x2000000,'PKSPICS1');
}
export function readStartROMProfile(bytes){
 if(!isStartROMFamily(bytes))return null;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const u16=p=>p>=0&&p+2<=bytes.length?view.getUint16(p,true):-1;
 const u32=p=>p>=0&&p+4<=bytes.length?view.getUint32(p,true):-1;
 const words=(p,values)=>values.every((word,i)=>word===null||u16(p+i*2)===word);
 const literal=(p,reg)=>{const op=u16(p);return (op&0xff00)===(0x4800|reg<<8)?u32(((p+4)&~3)+(op&255)*4):-1;};
 const constant=(p,reg)=>{
  if(p<0||(p&1))return null;
  const value=literal(p,reg);if(value>=0)return {value,next:p+2};
  // Equivalent Thumb constant construction; the following CMP replaces flags.
  const move=u16(p),shift=u16(p+2);
  if((move&0xff00)!==(0x2000|reg<<8)||(shift&0xf800)!==0||
   (shift&7)!==reg||((shift>>>3)&7)!==reg)return null;
  const shifted=(move&255)*2**((shift>>>6)&31);
  return shifted<=0xffff?{value:shifted,next:p+4}:null;
 };
 const bl=p=>{
  const hi=u16(p),lo=u16(p+2);if((hi&0xf800)!==0xf000||(lo&0xf800)!==0xf800)return -1;
  let distance=((hi&0x7ff)<<12)|((lo&0x7ff)<<1);if(distance&0x400000)distance-=0x800000;
  const target=p+4+distance;return target>=0&&target+2<=bytes.length?target:-1;
 };
 const tail=p=>{const op=u16(p);if((op&0xf800)!==0xe000)return -1;let distance=(op&0x7ff)<<1;if(distance&0x800)distance-=0x1000;const target=p+4+distance;return target>=0xc0&&target<bytes.length?target:-1;};
 const registerCall=p=>{const target=bl(p);return target>=0&&u16(target)===0x4718;}; // bx r3
 const validStamp=value=>Number.isInteger(value)&&value>=0x2300&&value<=0xffff;
 let stamp=null,writerCount=0,minimum=null,gateCount=0,maximumAccepted=null;
 for(let p=0xc0;p+26<=bytes.length;p+=2){
  let candidate=-1;
  // Patch releases load the complete stamp from a literal pool.
  if(bytes[p]===0x10&&bytes[p+1]===0xb5&&words(p,[0xb510,null,null,null,null,null,0xbd10])&&
   literal(p+4,0)===versionVariable&&literal(p+6,3)===varSet&&registerCall(p+8))candidate=literal(p+2,1);
  // Releases ending in .0 can construct the same value with mov/lsl.
  else if(bytes[p+1]===0x21&&words(p+2,[0xb510,0x0189,null,null,null,null,0xbd10])&&
   literal(p+6,0)===versionVariable&&literal(p+8,3)===varSet&&registerCall(p+10))candidate=bytes[p]<<6;
  if(validStamp(candidate)){stamp=candidate;writerCount++;}
  // VarGet(0x50EF) <= maximumOldStamp sets the old-save notice (r9=1)
  // and removes Continue (r8=0). Both paths return to the same menu code.
  if(bytes[p+1]===0x4b&&literal(p,3)===varGet&&literal(p+2,0)===versionVariable&&registerCall(p+4)&&
   words(p+10,[0x4298,0xd900,null,0x2301,0x4699,0x2300,0x4698])&&tail(p+14)>=0&&tail(p+14)===tail(p+24)){
   const maximum=literal(p+8,3);if(validStamp(maximum)&&maximum<0xffff){minimum=maximum+1;gateCount++;}
  }
  // Newer menus delegate both bounds to small predicates. Validate the calls,
  // unsigned comparisons, disabled-Continue branches and common return path;
  // accepting a version number alone would miss a changed compatibility rule.
  if(bytes[p+1]===0x48&&literal(p,0)===versionVariable&&literal(p+2,7)===varGet&&u16(bl(p+4))===0x4738&&
   words(p+12,[0x4682,0x2800,0xd005,0x2300,0x9305,0x3301,0x469a,0x2500])&&
   literal(p+30,0)===versionVariable&&bl(p+32)===bl(p+4)&&
   words(p+40,[0x9005,0x2800,0xd010,0x2301,0x2500,0x9305])&&u16(p+80)===0x4682&&
   tail(p+28)>=0&&tail(p+28)===tail(p+52)&&tail(p+28)===tail(p+82)){
   const lower=bl(p+8),upper=bl(p+36);
   // lower: maxOld >= saved; upper: saved > current (unsigned Thumb).
   const maximum=constant(lower+2,2),current=constant(upper,3);
   if(u16(lower)===0x2300&&maximum&&words(maximum.next,[0x4282,0x415b,0x0018,0x4770])&&
    current&&words(current.next,[0x4283,0x4180,0x4240,0x4770])){
    if(validStamp(maximum.value)&&validStamp(current.value)&&maximum.value<current.value){minimum=maximum.value+1;maximumAccepted=current.value;gateCount++;}
   }
  }
 }
 if(writerCount!==1)return null;
 // A changed or ambiguous gate must not silently grant compatibility.
 return {version:stampVersion(stamp),minimumSaveVersion:gateCount===1&&minimum<=stamp&&(maximumAccepted===null||maximumAccepted===stamp)?stampVersion(minimum):null};
}
