// SPDX-License-Identifier: AGPL-3.0-or-later
// Independently authored test codec from the documented uint32 sector format.
// No game data; production code is not imported. BigInt implements arithmetic
// and the MAC state independently from the production rolling-word transform.
const f=require('./start-save-format-fixtures.cjs');
const keys=[0xcf0a5e2e,0x2b1db2eb,0x35bf48d2,0x557d0a65,0xfaf25c60,0xeea1554f,0x446b6578];
const u=x=>BigInt.asUintN(32,x),n=x=>Number(u(x)),mul=(a,b)=>n(BigInt(a)*BigInt(b));
function mix(seed,counter,j){let x=(seed^mul(counter,0x85ebca6b))>>>0;x=(x+mul(j,0x9e3779b1))>>>0;x=mul((x^(x>>>16))>>>0,0x7feb352d);x=mul((x^(x>>>15))>>>0,0x846ca68b);return (x^(x>>>16))>>>0;}
const rot=(x,k)=>u((x<<BigInt(k))|(x>>BigInt(32-k)));
function mac(b,index){
 const seed=BigInt(keys[index-1]),secret=0xe4ee25b3n,v=[seed,secret,0x6c796765n^seed,0x74656462n^secret];
 const pair=(a,b,k)=>{v[a]=u(v[a]+v[b]);v[b]=rot(v[b],k)^v[a];};
 const round=()=>{pair(0,1,5);v[0]=rot(v[0],16);pair(2,3,8);pair(0,3,7);pair(2,1,13);v[2]=rot(v[2],16);};
 const absorb=x=>{v[3]^=x;round();round();v[0]^=x;};
 for(let at=0;at<4080;at+=4)absorb(BigInt(f.u32(b,at)));
 absorb(BigInt(f.u16(b,4084)|(index<<16)));absorb(BigInt(f.u32(b,4092)));absorb(0xf8000000n);
 v[2]^=255n;for(let i=0;i<4;i++)round();return n(v[1]^v[3]);
}
function transform(b,index,dir){
 const id=f.u16(b,4084),counter=f.u32(b,4092),span=(f.mainSizes[id]||4080)/4;
 const r=Array.from({length:span},(_,j)=>mix(keys[index-1],counter,j));
 for(let j=0;j<1020;j++){
  let k=j<span?(r[j]-r[(j+1)%span])>>>0:mix(keys[index-1],counter,1024+j);
  const h=index>=3?0x17f90000:0x18f90000;
  if(id===2&&j===260)k=h;else if(id===2&&j===span-1)k=(k-h+r[260]-r[261])>>>0;
  f.put32(b,j*4,n(BigInt(f.u32(b,j*4))+BigInt(dir)*BigInt(k)));
 }
}
function decode(bytes){const plain=f.decode(bytes);for(let at=0;at+4096<=plain.length;at+=4096){const b=plain.subarray(at,at+4096);if(f.u32(b,4088)!==0x08012025)continue;const index=f.u32(b,4080)&255;if(index){if(!keys[index-1])throw Error('Unknown fixture key');transform(b,index,-1);f.put32(b,4080,0);}}return plain;}
function encode(plain,index=6){
 const bytes=plain.slice();for(let at=0;at+4096<=bytes.length;at+=4096){const b=bytes.subarray(at,at+4096);if(f.u32(b,4088)!==0x08012025)continue;
  const check=mix(keys[index-1],f.u32(b,4092),(0xa17f0001^f.u16(b,4084)^(f.u16(b,4086)<<16))>>>0)>>>24,digest=mac(b,index);
  transform(b,index,1);f.put32(b,4080,(digest&0xffff0000)|(check<<8)|index);
 }return f.encode(bytes);
}
module.exports={decode,encode};
