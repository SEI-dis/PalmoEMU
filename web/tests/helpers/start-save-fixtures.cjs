// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic authored data only, no ROM or save from a game.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const sector=4096,payload=4080,slotBytes=3*1048576,signature=0x08012025,lens=[0xf24,0xff0,0xff0,0xff0,0xd98,...Array(8).fill(0xff0),0x450];
const dv=bytes=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),put16=(b,o,n)=>dv(b).setUint16(o,n,true),put32=(b,o,n)=>dv(b).setUint32(o,n>>>0,true);
function sum(bytes,off,size){let n=0;for(let i=0;i<size;i+=4)n=(n+dv(bytes).getUint32(off+i,true))>>>0;return ((n&65535)+(n>>>16))&65535;}
function seal(bytes,physical,id,counter=2,size=lens[id]){const o=physical*sector;put16(bytes,o+4084,id);put16(bytes,o+4086,sum(bytes,o,size));put32(bytes,o+4088,signature);put32(bytes,o+4092,counter);}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const crypt=Uint8Array.from({length:sector},(_,i)=>{let x=(Math.imul(i,0x9e3779b1)+0x504b5354)>>>0;x^=x>>>15;x=Math.imul(x,0x2c1b3c6d)>>>0;x^=x>>>12;x=Math.imul(x,0x297a2d39)>>>0;x^=x>>>15;return x>>>24;});
function trainer(bytes,offset,char=187){bytes.fill(255,offset,offset+7);bytes[offset]=char;bytes[offset+9]=4;put16(bytes,offset+10,1234);put16(bytes,offset+12,5678);put16(bytes,offset+14,42);bytes[offset+16]=23;}
function common(bytes,offset){bytes.set([91,92,93,94,95,96,97,98],offset+12);bytes.set([8,9,0,0,254,0,32,0],offset+0x1c);bytes[offset+0x34]=1;const party=offset+0x38;bytes[party]=7;put16(bytes,party+32,1);put16(bytes,party+44,1);put32(bytes,offset+0x290,123456);bytes[offset+0x300]=0xa6;}
function fixture35({second=false,rtc=true,stamp=0,secondStamp=stamp,boxes=50,encrypted=true}={}){
 const bytes=new Uint8Array(2*slotBytes+(rtc?16:0)).fill(255);
 for(let which=0;which<(second?2:1);which++){
  const offset=which*slotBytes,local=new Uint8Array(32*sector);
  for(let bank=0;bank<2;bank++){
   const base=bank*5;trainer(local,base*sector,187+which);common(local,(base+1)*sector);
   put32(local,(base+2)*sector+0x410,0x4c454853);put32(local,(base+2)*sector+0x414,2);local.fill(255,(base+2)*sector+0x418,(base+2)*sector+0x429);local[(base+2)*sector+0x418]=10;
   for(let id=0;id<5;id++)seal(local,base+id,id);
  }
  const page=10*sector;local[page+0xfe3]=boxes===50?0x58:0;local.fill(255,page+0xfe4,page+0xfe9);
  // Persistent variable 0x50EF maps to page zero's byte 0x245.
  put16(local,page+0x245,which?secondStamp:stamp);
  for(let i=0;i<14;i++)local[page+743+i]=0xa0+i; // future 0x5140..0x5146
  const mon=page+3371;local[mon]=11;put16(local,mon+28,1);put16(local,mon+30,1);local[mon+39]=1;local[mon+50]=0x7e;
  seal(local,10,0x40,2,payload);
  if(encrypted)for(let physical=0;physical<=10;physical++)for(let i=0;i<sector;i++)local[physical*sector+i]^=crypt[i];
  bytes.set(local,offset);bytes[offset+0x120000]=0xa7+which;
 }
 if(rtc)bytes.set(Uint8Array.from({length:16},(_,i)=>0xe0+i),2*slotBytes);
 return bytes;
}
function fixture22({mixed=false}={}){
 const bytes=new Uint8Array(131088);
 for(let bank=0;bank<2;bank++){
  const base=bank*14;trainer(bytes,base*sector,187+bank);common(bytes,(base+1)*sector);
  for(let id=0;id<14;id++)seal(bytes,base+id,id,bank?2:1);
 }
 if(mixed)put32(bytes,(14+5)*sector+4092,9);
 bytes.set(Uint8Array.from({length:16},(_,i)=>i+1),131072);return bytes;
}
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;}return (crc^0xffffffff)>>>0;}
function fakeROM(target){
 // Solve a 32-bit CRC suffix on zero-filled synthetic bytes; no game data.
 const bytes=new Uint8Array(256),base=crc32(bytes),vectors=[],masks=[];
 for(let bit=0;bit<32;bit++){
  bytes[252+(bit>>>3)]^=1<<(bit&7);let value=(crc32(bytes)^base)>>>0,mask=(1<<bit)>>>0;bytes[252+(bit>>>3)]^=1<<(bit&7);
  for(let p=31;p>=0;p--)if((value>>>p)&1){if(vectors[p]){value=(value^vectors[p])>>>0;mask=(mask^masks[p])>>>0;}else{vectors[p]=value;masks[p]=mask;break;}}
 }
 let value=(target^base)>>>0,mask=0;for(let p=31;p>=0;p--)if((value>>>p)&1){value=(value^vectors[p])>>>0;mask=(mask^masks[p])>>>0;}
 assert.equal(value,0);put32(bytes,252,mask);assert.equal(crc32(bytes),target);return bytes;
}
module.exports={fixture35,fixture22,fakeROM,crc32,hash,put16,put32,seal,sector,slotBytes};
