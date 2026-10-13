// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored Thumb instructions and cartridge markers, without game ROM data.
const assert=require('node:assert/strict');
const {word,literal,branchLink}=require('./mgba-save-probe-fixture.cjs');
function fixture({stamp=0x2a05,minimum=0x2402,writer=0x4000,gate=0x8000,trampoline=0x2000,immediate=false,bytes}={}){
 bytes=bytes||new Uint8Array(0x2000008);
 const text=(at,value)=>bytes.set(Buffer.from(value),at);
 text(0xa0,'POKEMONSTART');text(0xac,'PKSJ');bytes[0xb2]=0x96;text(0x2000000,'PKSPICS1');
 const load=(at,reg,pool,value)=>{const delta=pool-((at+4)&~3);assert.ok(delta>=0&&delta<=1020&&delta%4===0);word(bytes,at,0x4800|(reg<<8)|(delta>>2));literal(bytes,pool,value);};
 const branch=(at,target)=>{const delta=(target-at-4)/2;assert.ok(Number.isInteger(delta)&&delta>=-1024&&delta<=1023);word(bytes,at,0xe000|(delta&0x7ff));};
 word(bytes,trampoline,0x4718);
 if(immediate){
  assert.equal(stamp%64,0);assert.ok(stamp/64<=255);word(bytes,writer,0x2100|(stamp>>6));word(bytes,writer+2,0xb510);word(bytes,writer+4,0x0189);
  load(writer+6,0,writer+0x80,0x50ef);load(writer+8,3,writer+0x84,0x0806dd79);branchLink(bytes,writer+10,trampoline);word(bytes,writer+14,0xbd10);
 }else{
  word(bytes,writer,0xb510);load(writer+2,1,writer+0x80,stamp);load(writer+4,0,writer+0x84,0x50ef);load(writer+6,3,writer+0x88,0x0806dd79);
  branchLink(bytes,writer+8,trampoline);word(bytes,writer+12,0xbd10);
 }
 load(gate,3,gate+0x80,0x0806dd5d);load(gate+2,0,gate+0x84,0x50ef);branchLink(bytes,gate+4,trampoline);load(gate+8,3,gate+0x88,minimum-1);
 for(const [offset,op]of [[10,0x4298],[12,0xd900],[16,0x2301],[18,0x4699],[20,0x2300],[22,0x4698]])word(bytes,gate+offset,op);
 branch(gate+14,gate-0x80);branch(gate+24,gate-0x80);
 return {bytes,writer,gate,trampoline};
}
module.exports={fixture,word,literal,branchLink};
