// SPDX-License-Identifier: AGPL-3.0-or-later
// Recognize the extended-flash capability test by its Thumb control flow and
// read ABI, not a game version, filename, digest or absolute code address.
const romBase=0x08000000;
export function findExtendedSaveProbe(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<0x02000008||bytes.length>64*1048576||bytes[0xb2]!==0x96)return null;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const u16=p=>p>=0&&p+2<=bytes.length?view.getUint16(p,true):-1;
 const u32=p=>p>=0&&p+4<=bytes.length?view.getUint32(p,true):-1;
 // The extended cartridge header and the signature checked by the function.
 if(u32(0x02000000)!==0x50534b50||u32(0x02000004)!==0x31534349)return null;
 const words=(p,values)=>values.every((word,i)=>word===null||u16(p+i*2)===word);
 const literal=(p,reg)=>{const op=u16(p);return (op&0xff00)===(0x4800|reg<<8)?u32(((p+4)&~3)+(op&255)*4):-1;};
 const pointer=value=>value>=romBase&&value<romBase+bytes.length?value-romBase:-1;
 const ram=value=>(value>=0x02000000&&value+4<=0x02040000)||(value>=0x03000000&&value+4<=0x03008000);
 const bl=p=>{
  const hi=u16(p),lo=u16(p+2);if((hi&0xf800)!==0xf000||(lo&0xf800)!==0xf800)return -1;
  let displacement=((hi&0x7ff)<<12)|((lo&0x7ff)<<1);if(displacement&0x400000)displacement-=0x800000;
  const target=p+4+displacement;return target>=0&&target+2<=bytes.length?target:-1;
 };
 function bankSwitch(p){
  // Some builds reach the extended bank selector through a Thumb veneer.
  if((u16(p)&0xff00)===0x4900&&u16(p+2)===0x4708){const destination=literal(p,1);if(!(destination&1))return false;p=pointer(destination&~1);}
  if(p<0)return false;
  return ram(literal(p,3))&&literal(p+4,3)===0x534c5432&&
   words(p+2,[0x681a,null,0x429a,0xd102,0x3030,0x0600,0x0e00,0x22aa,0x2155,null,0x701a,null,0x7011,0x22b0,0x701a,0x23e0,0x051b,0x7018,0x4770])&&
   literal(p+20,3)===0x0e005555&&literal(p+24,2)===0x0e002aaa;
 }
 function flashReader(p){
  // Sector, offset, destination and count survive the bank switch. Verify the
  // 128 KiB bank path and the eventual read from the GBA flash address space.
  const flashInfo=literal(p+28,0),copyPointer=literal(p+56,3),copy=pointer(copyPointer&~1);
  if(!ram(flashInfo)||!(copyPointer&1)||copy<0||copy+36!==p||literal(p+64,0)!==romBase+p+1||literal(p+66,1)!==copyPointer)return false;
  // The read loop copied to RAM must perform a bounded byte-for-byte copy.
  if(!words(copy,[0xb510,0x1c04,0x1e53,0x2a00,0xd008,0x2201,0x4252,0x7820,0x7008,0x3401,0x3101,0x3b01,0x4293,0xd1f8,0xbc10,0xbc01,0x4700]))return false;
  return literal(p+118,0)===flashInfo&&words(p,[0xb5f0,0xb0a0,0x1c0d,0x1c16,0x1c1f,0x0403,0x0c1c])&&
   literal(p+14,2)===0x04000204&&literal(p+18,1)===0xfffc&&
   words(p+16,[0x8810,null,0x4008,0x2103,0x4308,0x8010,null,0x6800,0x6801,0x2080,0x0280,0x4281,0xd106,0x0d18,0x0600,0x0e00])&&
   bankSwitch(bl(p+48))&&words(p+52,[0x200f,0x4004,null,0x2001,0x4043,0x466a,null,null,0x1a40,0x03c0,0xe010])&&
   words(p+96,[0x8818,0x8010,0x3302,0x3202,0x1e48,0x0400,0x0c01,0x2900,0xd1f6])&&
   words(p+114,[0x466b,0x3301,null,0x6800,0x7a00,0x4084,0x1c20,0x22e0,0x0512,0x18a9,0x1840,0x1c31,0x1c3a])&&
   bl(p+140)>=0&&u16(bl(p+140))===0x4718&&words(p+144,[0xb020,0xbcf0,0xbc01,0x4700]);
 }
 function comparator(p){
  // Two 16-byte reads into distinct stack buffers, then exactly 16 byte
  // comparisons. Only the all-equal result (mov r0,0) is eligible to change.
  if(!words(p,[0xb570,0x000e,0xb088,null,0x2310,0x466a,0x2100,0xac04,null,null,0x2310,0x0022,0x2100,0x0030,null,null,
   0x2300,0xe002,0x3301,0x2b10,0xd007,0x466a,0x5cd1,0x5ce2,0x4291,0xd0f7,0x2001,0xb008,0xbd70,0x2000,0xe7fb]))return false;
  const readCall=bl(p+16),readerPointer=literal(p+6,5),reader=pointer(readerPointer&~1);
  return readCall>=0&&bl(p+28)===readCall&&u16(readCall)===0x4728&&(readerPointer&1)===1&&reader>=0&&flashReader(reader);
 }
 function gate(p){
  if(literal(p,2)!==0x0a000004||literal(p+2,3)!==0x31534349)return null;
  // Signature failure remains failure. Four specific sector pairs must all
  // call the same comparator; their branches must return to this gate's exit.
  if(!words(p+4,[0x6812,0xb510,0x429a,0xd001,0x2000,0xbd10,0x2120,0x2000,null,null,0x2800,0xd0f7,
   0x2120,0x2010,null,null,0x2800,0xd0f1,0x21bc,0x2000,0x0089,null,null,0x2800,0xd0ea,
   0x21bc,0x2010,0x0089,null,null,0x1e43,0x4198,0xe7e3]))return null;
  const calls=[p+20,p+32,p+46,p+60],helper=bl(calls[0]);
  if(helper<0||calls.some(call=>bl(call)!==helper)||!comparator(helper))return null;
  return {offset:helper+58,helper,calls};
 }
 let match=null;
 for(let p=0xc0;p+70<=bytes.length;p+=2){
  // Cheap prefilter before decoding branches or resolving literal pools.
  if(bytes[p+1]!==0x4a||bytes[p+3]!==0x4b||u16(p+4)!==0x6812)continue;
  const candidate=gate(p);if(!candidate)continue;
  if(match)return null; // Never choose arbitrarily between multiple probes.
  match=candidate;
 }
 if(!match)return null;
 const calls=new Set(match.calls),thumbPointer=romBase+match.helper+1;
 // Also reject nearby Thumb tail calls / conditional branches to the helper.
 for(let p=Math.max(0xc0,match.helper-2050);p<=Math.min(bytes.length-2,match.helper+2044);p+=2){
  const op=u16(p);let displacement=null;
  if((op&0xf800)===0xe000){displacement=(op&0x7ff)<<1;if(displacement&0x800)displacement-=0x1000;}
  else if((op&0xf000)===0xd000&&(op&0x0f00)<0x0e00){displacement=(op&255)<<1;if(displacement&0x100)displacement-=0x200;}
  if(displacement!==null&&p+4+displacement===match.helper)return null;
 }
 // Do not change a comparator shared with other direct callers or referenced
 // through a function pointer. Unknown uses must remain untouched.
 for(let p=0xc0;p+4<=bytes.length;p+=2){
  if((u16(p)&0xf800)===0xf000&&bl(p)===match.helper&&!calls.has(p))return null;
  if(u32(p)===thumbPointer)return null;
 }
 return {offset:match.offset,requiredSaveBytes:6*1048576};
}
