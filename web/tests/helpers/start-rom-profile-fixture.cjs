// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored Thumb instructions and cartridge markers, without game ROM data.
const assert=require('node:assert/strict');
const {word,literal,branchLink}=require('./mgba-save-probe-fixture.cjs');
function fixture({stamp=0x2a05,minimum=0x2402,writer=0x4000,gate=0x8000,trampoline=0x2000,immediate=false,rangeGate=false,upperImmediate=false,lowerImmediate=false,bytes}={}){
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
  return {bytes,writer,gate,trampoline,lower,upper,lowerBody,upperBody};
 }
 load(gate,3,gate+0x80,0x0806dd5d);load(gate+2,0,gate+0x84,0x50ef);branchLink(bytes,gate+4,trampoline);load(gate+8,3,gate+0x88,minimum-1);
 for(const [offset,op]of [[10,0x4298],[12,0xd900],[16,0x2301],[18,0x4699],[20,0x2300],[22,0x4698]])word(bytes,gate+offset,op);
 branch(gate+14,gate-0x80);branch(gate+24,gate-0x80);
 return {bytes,writer,gate,trampoline};
}
module.exports={fixture,word,literal,branchLink};
