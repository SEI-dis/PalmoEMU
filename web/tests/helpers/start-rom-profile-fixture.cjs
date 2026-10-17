// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored Thumb instructions and cartridge markers, without game ROM data.
const assert=require('node:assert/strict');
const {word,literal,branchLink}=require('./mgba-save-probe-fixture.cjs');
function fixture({stamp=0x2a05,minimum=0x2402,writer=0x4000,gate=0x8000,trampoline=0x2000,immediate=false,rangeGate=false,upperImmediate=false,lowerImmediate=false,lFormat=false,wFormat=false,bytes}={}){
 bytes=bytes||new Uint8Array(0x2000008);
 const text=(at,value)=>bytes.set(Buffer.from(value),at);
 text(0xa0,'POKEMONSTART');text(0xac,'PKSJ');bytes[0xb2]=0x96;text(0x2000000,'PKSPICS1');
 const load=(at,reg,pool,value)=>{const delta=pool-((at+4)&~3);assert.ok(delta>=0&&delta<=1020&&delta%4===0);word(bytes,at,0x4800|(reg<<8)|(delta>>2));literal(bytes,pool,value);};
 const constant=(at,reg,pool,value,immediate)=>{
  if(!immediate){load(at,reg,pool,value);return at+2;}
  assert.equal(value%64,0);assert.ok(value>=0&&value/64<=255);
  word(bytes,at,0x2000|(reg<<8)|(value>>6));word(bytes,at+2,0x0180|(reg<<3)|reg);return at+4;
 };
 const branch=(at,target)=>{const delta=(target-at-4)/2;assert.ok(Number.isInteger(delta)&&delta>=-1024&&delta<=1023);word(bytes,at,0xe000|(delta&0x7ff));};
 word(bytes,trampoline,0x4718);
 if(immediate){
  assert.equal(stamp%64,0);assert.ok(stamp/64<=255);word(bytes,writer,0x2100|(stamp>>6));word(bytes,writer+2,0xb510);word(bytes,writer+4,0x0189);
  load(writer+6,0,writer+0x80,0x50ef);load(writer+8,3,writer+0x84,0x0806dd79);branchLink(bytes,writer+10,trampoline);word(bytes,writer+14,0xbd10);
 }else{
  word(bytes,writer,0xb510);load(writer+2,1,writer+0x80,stamp);load(writer+4,0,writer+0x84,0x50ef);load(writer+6,3,writer+0x88,0x0806dd79);
  branchLink(bytes,writer+8,trampoline);word(bytes,writer+12,0xbd10);
 }
 if(rangeGate){
  const lower=gate+0x100,upper=gate+0x140,getter=trampoline+2;
  word(bytes,getter,0x4738);load(gate,0,gate+0x80,0x50ef);load(gate+2,7,gate+0x84,0x0806dd5d);
  branchLink(bytes,gate+4,getter);branchLink(bytes,gate+8,lower);
  [0x4682,0x2800,0xd005,0x2300,0x9305,0x3301,0x469a,0x2500].forEach((op,i)=>word(bytes,gate+12+i*2,op));
  branch(gate+28,gate-0x80);load(gate+30,0,gate+0x80,0x50ef);branchLink(bytes,gate+32,getter);branchLink(bytes,gate+36,upper);
  [0x9005,0x2800,0xd010,0x2301,0x2500,0x9305].forEach((op,i)=>word(bytes,gate+40+i*2,op));
  branch(gate+52,gate-0x80);word(bytes,gate+80,0x4682);branch(gate+82,gate-0x80);
  word(bytes,lower,0x2300);const lowerBody=constant(lower+2,2,lower+0x20,minimum-1,lowerImmediate);
  [0x4282,0x415b,0x0018,0x4770].forEach((op,i)=>word(bytes,lowerBody+i*2,op));
  const upperBody=constant(upper,3,upper+0x20,stamp,upperImmediate);
  [0x4283,0x4180,0x4240,0x4770].forEach((op,i)=>word(bytes,upperBody+i*2,op));
  if(lFormat||wFormat){
   const formatGuard=gate+0x200,formatLoader=gate+0x400,formatInit=gate+0x600,cache=0x020310e0;
   const ops=(at,values)=>values.forEach((op,i)=>{if(op!==null)word(bytes,at+i*2,op);});
   // Authored instructions model the separate layout guard before version
   // bounds. No code or ROM data is extracted from a supplied cartridge.
   word(bytes,getter,0x4728);load(gate+2,5,gate+0x84,0x0806dd5d);
   branchLink(bytes,gate-24,formatGuard);ops(gate-20,[0x4683,0x2800,0xd006,0x2301,0x9307,0x2300,0x2600,0x469b,0x9305]);branch(gate-2,gate-0x80);
   ops(gate+12,[0x9005,0x2800,0xd005,0x2300,0x9307,0x3301,0x9305,0x2600]);
   ops(gate+40,[0x4683,0x2800,0xd012,0x2300,0x9307,0x3301,0x469b,0x2600]);branch(gate+56,gate-0x80);
   ops(gate+84,[0x9007,0x9005]);branch(gate+88,gate-0x80);
   load(formatGuard,3,formatGuard+0x80,cache);load(formatGuard+2,2,formatGuard+0x84,0x45484353);
   ops(formatGuard+4,[0x6819,0x2000,0x4291,0xd103,0x22a7,0x5c98,0x1e43,0x4198,0x4770]);
   ops(formatLoader,[0xb5f0,0x46d6,0x464f,0x4646,0x25a0,null,0xb5c0,0x681c,0x016d,0x5963,null,0xb096,0x4293,0xd100,null,null,0x42b3]);
   load(formatLoader+0x0a,3,formatLoader+0x100,0x03005048);load(formatLoader+0x14,2,formatLoader+0x104,0x4c454853);load(formatLoader+0x1e,6,formatLoader+0x108,0x324c4853);
   branch(formatLoader+0x1c,formatLoader+0xa0);word(bytes,formatLoader+0x22,0xd000|((0xb0-0x26)/2));
   ops(formatLoader+0x48,[0xb016,0xbc1c,0x4690,0x4699,0x46a2,0xbdf0]);
   branchLink(bytes,formatLoader+0xa0,formatInit);ops(formatLoader+0xa4,[0x23a7,0x2101,null,0x54d1]);load(formatLoader+0xa8,2,formatLoader+0xe0,cache);branch(formatLoader+0xac,formatLoader+0x48);
   branchLink(bytes,formatLoader+0xb0,formatInit);
   ops(formatInit,[0x2100,null,null,0x7019,0x3301,0x4293,0xd1fb,null,null,0x21ff,0x601a]);
   load(formatInit+2,3,formatInit+0x80,cache);load(formatInit+4,2,formatInit+0x84,cache+0xa8);load(formatInit+14,3,formatInit+0x80,cache);load(formatInit+16,2,formatInit+0x88,0x45484353);
   if(wFormat){
    bytes.fill(0,formatLoader,formatLoader+0x200);
    ops(formatLoader,[0xb5f0,0x4646,0x46d6,0x464f,0xb5c0,0x26a0,null,0x681c,0x0176,0x59a3,null,0x189a,0xb096,0x2a00,0xd100,null,null,0x189d,0x426a,0x4155,0x2d00,0xd000,null,null,0x42bb]);
    load(formatLoader+0x0c,3,formatLoader+0x100,0x03005048);
    load(formatLoader+0x14,2,formatLoader+0x104,0xb3bab7ad);load(formatLoader+0x20,2,formatLoader+0x108,0xcdb3b7ad);load(formatLoader+0x2e,7,formatLoader+0x10c,0x334c4853);
    branch(formatLoader+0x1e,formatLoader+0xc0);branch(formatLoader+0x2c,formatLoader+0xc0);
    word(bytes,formatLoader+0x32,0xd000|((0x70-0x36)/2));branchLink(bytes,formatLoader+0x34,formatInit);branchLink(bytes,formatLoader+0x70,formatInit);
    ops(formatLoader+0x56,[0xb016,0xbc1c,0x4690,0x4699,0x46a2,0xbdf0]);
    branchLink(bytes,formatLoader+0xc0,formatInit);ops(formatLoader+0xc4,[0x23a7,0x2101,null,0x54d1]);load(formatLoader+0xc8,2,formatLoader+0x110,cache);branch(formatLoader+0xcc,formatLoader+0x56);
   }
   return {bytes,writer,gate,trampoline,lower,upper,lowerBody,upperBody,formatGuard,formatLoader,formatInit};
  }
  return {bytes,writer,gate,trampoline,lower,upper,lowerBody,upperBody};
 }
 load(gate,3,gate+0x80,0x0806dd5d);load(gate+2,0,gate+0x84,0x50ef);branchLink(bytes,gate+4,trampoline);load(gate+8,3,gate+0x88,minimum-1);
 for(const [offset,op]of [[10,0x4298],[12,0xd900],[16,0x2301],[18,0x4699],[20,0x2300],[22,0x4698]])word(bytes,gate+offset,op);
 branch(gate+14,gate-0x80);branch(gate+24,gate-0x80);
 return {bytes,writer,gate,trampoline};
}
module.exports={fixture,word,literal,branchLink};
