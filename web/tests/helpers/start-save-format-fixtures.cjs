// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored flash layouts and records; no game ROM/save or converter output.
const assert=require('node:assert/strict');
const {fixture35,put16,put32,seal,sector,slotBytes}=require('./start-save-fixtures.cjs');
const payload=4080,signature=0x08012025,mainSizes=[0xf24,payload,payload,payload,0xd98],p0Records=3371;
const view=bytes=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=(bytes,offset)=>view(bytes).getUint16(offset,true),u32=(bytes,offset)=>view(bytes).getUint32(offset,true);
const key=Uint8Array.from({length:sector},(_,i)=>{let x=(Math.imul(i,0x9e3779b1)+0x504b5354)>>>0;x^=x>>>15;x=Math.imul(x,0x2c1b3c6d)>>>0;x^=x>>>12;x=Math.imul(x,0x297a2d39)>>>0;x^=x>>>15;return x>>>24;});
function decode(bytes){const out=bytes.slice();for(let offset=0;offset+sector<=out.length;offset+=sector){if(u32(out,offset+4088)===signature)continue;const page=out.slice(offset,offset+sector);for(let i=0;i<sector;i++)page[i]^=key[i];if(u32(page,4088)===signature)out.set(page,offset);}return out;}
function encode(bytes){const out=bytes.slice();for(let offset=0;offset+sector<=out.length;offset+=sector)if(u32(out,offset+4088)===signature)for(let i=0;i<sector;i++)out[offset+i]^=key[i];return out;}
function record(box,pos,{seed=0,empty=false,high=(box+pos)%2===0,level=[0,1,127][pos%3]}={}){
 const id=box*30+pos+seed,bytes=new Uint8Array(58);
 put32(bytes,0,0x12340000+id);put32(bytes,4,0x98760000+id);for(let i=8;i<28;i++)bytes[i]=(id*7+i*3)&255;
 bytes[16]=0x85|(high?0x40:0);put16(bytes,28,empty?0:id%1505+1);put16(bytes,30,0xfc00|id%869);put32(bytes,32,1000+id);
 bytes[36]=91;bytes[37]=id&255;bytes[38]=0x5a;
 let moves=0n;for(let i=0;i<4;i++)moves|=BigInt((id+i*17)%1006)<<BigInt(i*10);for(let i=0;i<5;i++)bytes[39+i]=Number(moves>>BigInt(i*8)&255n);
 for(let i=44;i<58;i++)bytes[i]=(id+i*5)&255;put16(bytes,52,0xa580|level);return bytes;
}
function expectedL(record58){const out=new Uint8Array(60);out.set(record58);if(u16(record58,28)&&record58[16]&0x40){const level=(u16(record58,52)&127)+127;out[16]&=0xbf;put16(out,52,(u16(record58,52)&0xff80)|(level&127));put16(out,58,(level>>>7)<<8);}return out;}
function oldPosition(box,pos){
 if(box>=19&&box<22)return {area:'region',offset:0xb10+(box-19)*1740+pos*58};
 if(box>=22&&box<24)return {area:'sb1',offset:0x18e8+(box-22)*1740+pos*58};
 if(box===24)return {area:'trainer',offset:0xf8+pos*58};
 const compressed=(box<19?box:box-6)*30+pos;
 if(compressed>=990)return {area:'page',page:17+Math.floor((compressed-990)/70),offset:(compressed-990)%70*58};
 if(compressed<12)return {area:'page',page:0,offset:p0Records+compressed*58};
 return {area:'page',page:1+Math.floor((compressed-12)/70),offset:(compressed-12)%70*58};
}
function old49({second=false,rtc=true,encrypted=true,dense=true,counter=7,records,metadata=true}={}){
 let bytes=fixture35({second,rtc,stamp:0x3100,encrypted:false});const slots=[];
 for(let slot=0;slot<(second?2:1);slot++){
  const start=slot*slotBytes,sections=mainSizes.map((_,i)=>bytes.slice(start+i*sector,start+i*sector+payload));
  const sb1=new Uint8Array(mainSizes.slice(1).reduce((a,b)=>a+b,0));let at=0;for(let i=1;i<5;i++){sb1.set(sections[i].subarray(0,mainSizes[i]),at);at+=mainSizes[i];}
  const pages=new Map(),getPage=index=>{if(!pages.has(index))pages.set(index,new Uint8Array(payload));return pages.get(index);};
  const p0=getPage(0);p0.set(bytes.subarray(start+10*sector,start+10*sector+p0Records));
  p0.set([21,22,23,24],0);p0.set([31,32,33],4);p0.set([41,42,43],4+0x98);put16(p0,0x243,0x3000);put16(p0,0x245,0x3100);
  const region=new Uint8Array(payload*2);region.set([71,72,73,74]);region.set([81,82,83],region.length-3);
  const boxes=Array.from({length:50},()=>Array.from({length:30},()=>new Uint8Array(58)));
  const choices=records|| (dense?Array.from({length:1500},(_,i)=>[Math.floor(i/30),i%30]):[[0,0]]);
  for(const [box,pos,options={}]of choices){const value=record(box,pos,{seed:slot*11,...options}),loc=oldPosition(box,pos);boxes[box][pos]=value;if(loc.area==='page')getPage(loc.page).set(value,loc.offset);else if(loc.area==='region')region.set(value,loc.offset);else if(loc.area==='sb1')sb1.set(value,loc.offset);else sections[0].set(value,loc.offset);}
  // A species-zero record still owns its other 56 bytes and must not be erased.
  if(dense){boxes[49][29]=record(49,29,{empty:true,high:true,level:127});const loc=oldPosition(49,29);getPage(loc.page).set(boxes[49][29],loc.offset);}
  getPage(15).set(region.subarray(0,payload));getPage(16).set(region.subarray(payload));
  const meta=new Uint8Array(110);if(metadata){for(let i=0;i<meta.length;i++)meta[i]=(i*3+7)&255;getPage(21).set(meta,2900);}
  if(pages.has(21)){getPage(21)[3010]=0x59;getPage(21).fill(255,3011,3025);}
  p0[4067]=0x58;p0.fill(255,4068,4073);p0[4073]=0;
  for(let i=17;i<22;i++)if(pages.has(i))p0[4068+i-17]=8+i-17;
  put32(sb1,0x1400,0x4c454853);put32(sb1,0x1404,counter);sb1.fill(255,0x1408,0x1408+17);
  for(const [id,page]of pages){const physical=id<17?10+id:40+id-17;if(id<17)sb1[0x1408+id]=physical;const sealed=new Uint8Array(sector);sealed.set(page);seal(sealed,0,0x40+id,counter,payload);bytes.set(sealed,start+physical*sector);}
  at=0;for(let i=1;i<5;i++){sections[i].set(sb1.subarray(at,at+mainSizes[i]));at+=mainSizes[i];}
  for(let bank=0;bank<2;bank++)for(let id=0;id<5;id++){const page=new Uint8Array(sector);page.set(sections[id]);seal(page,0,id,counter,mainSizes[id]);bytes.set(page,start+(bank*5+id)*sector);}
  slots.push({boxes,sections:sections.map(x=>x.slice()),region:region.slice(),p0Prefix:p0.slice(0,p0Records),metadata:meta,counter});
 }
 if(encrypted)bytes=encode(bytes);return {bytes,slots};
}
function changePage(bytes,slot,physical,mutate,{reseal=true}={}){const out=decode(bytes),offset=slot*slotBytes+physical*sector,page=out.slice(offset,offset+sector);mutate(page);if(reseal){const id=u16(page,4084);seal(page,0,id,u32(page,4092),id<5?mainSizes[id]:payload);}out.set(page,offset);return encode(out);}
function newLayout(bytes,slot=0,format='L',decoder=decode){
 const decoded=decoder(bytes),start=slot*(bytes.length>=16777216?8388608:slotBytes);let bank;
 for(let candidate=0;candidate<2;candidate++)if(u32(decoded,start+candidate*5*sector+4088)===signature){
  const count=u32(decoded,start+candidate*5*sector+4092),previous=bank===undefined?null:u32(decoded,start+bank*5*sector+4092);
  if(previous===null||count!==previous&&((count-previous)>>>0)<0x80000000)bank=candidate;
 }
 assert.notEqual(bank,undefined,'Converted layout has a main bank');const sections=mainSizes.map((_,i)=>decoded.slice(start+(bank*5+i)*sector,start+(bank*5+i)*sector+payload));
 const sb1=new Uint8Array(mainSizes.slice(1).reduce((a,b)=>a+b,0));let at=0;for(let i=1;i<5;i++){sb1.set(sections[i].subarray(0,mainSizes[i]),at);at+=mainSizes[i];}
 const x=format==='X',wide=format==='W',recordBytes=x?78:wide?63:60,perPage=x?52:wide?64:68,extFirst=x?780:wide?960:1020,p0Count=x?8:11;
 assert.equal(u32(sb1,0x1400),x?0x344c4853:wide?0x334c4853:0x324c4853,format+' shelf signature');
 const readPhysical=physical=>decoded.slice(start+physical*sector,start+physical*sector+payload),p0=readPhysical(sb1[0x1408]);
 const page=index=>{const physical=index<18?sb1[0x1408+index]:p0[(x?3996:wide?4065:4032)+index-18];return physical===255?new Uint8Array(payload):readPhysical(index<18?physical:32+physical);};
 const readRecord=(box,pos)=>{const global=box*30+pos;let index,offset;if(global>=extFirst){index=18+Math.floor((global-extFirst)/perPage);offset=(global-extFirst)%perPage*recordBytes;}else if(global<p0Count){index=0;offset=p0Records+global*recordBytes;}else{index=1+Math.floor((global-p0Count)/perPage);offset=(global-p0Count)%perPage*recordBytes;}return page(index).slice(offset,offset+recordBytes);};
 return {decoded,sections,sb1,p0,page,readRecord,counter:u32(decoded,start+bank*5*sector+4092),bank};
}
module.exports={old49,record,expectedL,oldPosition,newLayout,changePage,decode,encode,u16,u32,put16,put32,seal,sector,payload,slotBytes,mainSizes};
