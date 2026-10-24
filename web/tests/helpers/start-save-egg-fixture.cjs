// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic native egg blocks, including alignment bytes and the active SB1 link.
const f=require('./start-save-format-fixtures.cjs'),crypt=require('./start-save-keyed-fixture.cjs');
function sum(b,aligned=true){const size=136+30*(f.u16(b,4)===1?63:78),end=aligned?Math.ceil(size/4)*4:size;let total=0x4547;for(let i=16;i<end;i++)total+=b[i]+((i-16)&255);return total&65535;}
function eggs(bytes,{aligned=true,key=6,stamp}={}){
 const plain=crypt.decode(bytes),stride=plain.length>=16777216?8388608:f.slotBytes;
 for(const slot of [0,1]){
  const base=slot*stride;if(base>=plain.length)continue;
  for(const physical of [88,89]){
   const b=plain.subarray(base+physical*4096,base+(physical+1)*4096);b.fill(0);
   f.put32(b,0,0x58424745);f.put16(b,4,1);f.put32(b,8,100+slot*2+physical);
   for(let i=16;i<2028;i++)b[i]=(i*13+physical+slot)&255;
   f.put16(b,6,sum(b,aligned));
  }
  for(let physical=0;physical<10;physical++){
   const b=plain.subarray(base+physical*4096,base+(physical+1)*4096);
   if(f.u32(b,4088)!==0x08012025||f.u16(b,4084)!==1)continue;
   f.put32(b,0x43c,0x31424745);b[0x444]=slot;b[0x446]=30;f.seal(b,0,1,f.u32(b,4092),f.mainSizes[1]);
  }
  if(stamp!==undefined){const p=plain.subarray(base+10*4096,base+11*4096);f.put16(p,0x245,stamp);f.seal(p,0,0x40,f.u32(p,4092),4080);}
 }
 return crypt.encode(plain,key);
}
module.exports={eggs,sum};
