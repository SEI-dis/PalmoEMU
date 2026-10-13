// SPDX-License-Identifier: AGPL-3.0-or-later
// Independently assembled Thumb routines beside an authored flash cartridge.
// No instructions or data are copied from a user's or commercial ROM.
const assert=require('node:assert/strict'),{flash}=require('../core-upgrade.cjs');
const romBase=0x08000000;
function word(bytes,at,value){new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).setUint16(at,value,true);}
function literal(bytes,at,value){new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).setUint32(at,value>>>0,true);}
function branchLink(bytes,at,target){
 const distance=target-at-4;assert.ok(distance%2===0);assert.ok(distance>=-0x400000&&distance<0x400000);
 word(bytes,at,0xf000|((distance>>12)&0x7ff));word(bytes,at+2,0xf800|((distance>>1)&0x7ff));
}
function assembler(bytes,start){
 let at=start;const labels=new Map(),branches=[];
 const emit=value=>{word(bytes,at,value);at+=2;};
 return {emit,get at(){return at;},label:name=>labels.set(name,at),
  mov:(reg,value)=>emit(0x2000|(reg<<8)|value),cmp:(reg,value)=>emit(0x2800|(reg<<8)|value),
  ldr(reg,pool,value){const displacement=pool-((at+4)&~3);assert.ok(displacement>=0&&displacement<=1020&&displacement%4===0);emit(0x4800|(reg<<8)|(displacement>>2));literal(bytes,pool,value);},
  bl(target){branchLink(bytes,at,target);at+=4;},
  branch(label,condition=null){branches.push({at,label,condition});emit(0);},
  pad(target){while(at<target)emit(0x46c0);assert.equal(at,target);},
  finish(){for(const {at:position,label,condition}of branches){const displacement=(labels.get(label)-position-4)/2;assert.ok(Number.isInteger(displacement));word(bytes,position,condition===null?0xe000|(displacement&0x7ff):0xd000|(condition<<8)|(displacement&255));}}
 };
}
function buildFixture({helper=0x4000,caller=0x5000,reader=0x6000,trampoline=0x7000,helperPool=helper+0x80,callerPool=caller+0x80,readerPool=reader+0x100,veneer=false,size=64*1048576,bytes}={}){
 if(!bytes){bytes=new Uint8Array(size);bytes.set(flash(95,true));}
 literal(bytes,0x2000000,0x50534b50);literal(bytes,0x2000004,0x31534349);
 const a=assembler(bytes,helper),readerLiteral=helperPool,calls=[];
 a.emit(0xb570);a.emit(0x000e);a.emit(0xb088); // push r4-r6/lr; preserve sector; allocate two buffers
 a.ldr(5,readerLiteral,romBase+reader+1);a.mov(3,16);a.emit(0x466a);a.mov(1,0);a.emit(0xac04);a.bl(trampoline);
 a.mov(3,16);a.emit(0x0022);a.mov(1,0);a.emit(0x0030);a.bl(trampoline);
 a.mov(3,0);a.branch('compare');a.label('next');a.emit(0x3301);a.cmp(3,16);a.branch('equal',0);
 a.label('compare');a.emit(0x466a);a.emit(0x5cd1);a.emit(0x5ce2);a.emit(0x4291);a.branch('next',0);
 a.mov(0,1);a.label('return');a.emit(0xb008);a.emit(0xbd70);a.label('equal');const offset=a.at;a.mov(0,0);a.branch('return');a.finish();
 const b=assembler(bytes,caller),callerLiterals=[callerPool,callerPool+4];
 b.ldr(2,callerLiterals[0],0x0a000004);b.ldr(3,callerLiterals[1],0x31534349);b.emit(0x6812);b.emit(0xb510);b.emit(0x429a);b.branch('check',0);
 b.label('fail');b.mov(0,0);b.label('return');b.emit(0xbd10);b.label('check');
 for(const [index,left,right]of [[0,0,32],[1,16,32],[2,0,188],[3,16,188]]){
  b.mov(1,right);b.mov(0,left);if(index>=2)b.emit(0x0089);calls.push(b.at);b.bl(helper);
  if(index<3){b.cmp(0,0);b.branch('fail',0);}
 }
 b.emit(0x1e43);b.emit(0x4198);b.branch('return');b.finish();
 const copy=reader-36,d=assembler(bytes,copy);
 d.emit(0xb510);d.emit(0x1c04);d.emit(0x1e53);d.cmp(2,0);d.branch('return',0);d.mov(2,1);d.emit(0x4252);d.label('byte');
 for(const op of [0x7820,0x7008,0x3401,0x3101,0x3b01,0x4293])d.emit(op);
 d.branch('byte',1);d.label('return');for(const op of [0xbc10,0xbc01,0x4700])d.emit(op);d.pad(reader);d.finish();
 const c=assembler(bytes,reader),bankSwitch=trampoline+0x20,readBytes=trampoline+0x100,bankVeneer=trampoline+0x120,flashInfo=0x03007470;
 for(const op of [0xb5f0,0xb0a0,0x1c0d,0x1c16,0x1c1f,0x0403,0x0c1c])c.emit(op);
 c.ldr(2,readerPool,0x04000204);c.emit(0x8810);c.ldr(1,readerPool+4,0xfffc);
 for(const op of [0x4008,0x2103,0x4308,0x8010])c.emit(op);
 c.ldr(0,readerPool+8,flashInfo);
 for(const op of [0x6800,0x6801,0x2080,0x0280,0x4281])c.emit(op);
 c.branch('read',1);for(const op of [0x0d18,0x0600,0x0e00])c.emit(op);c.bl(veneer?bankVeneer:bankSwitch);c.mov(0,15);c.emit(0x4004);c.label('read');
 c.ldr(3,readerPool+12,romBase+copy+1);c.mov(0,1);c.emit(0x4043);c.emit(0x466a);c.ldr(0,readerPool+16,romBase+reader+1);c.ldr(1,readerPool+12,romBase+copy+1);
 c.emit(0x1a40);c.emit(0x03c0);c.branch('count');c.pad(reader+96);c.label('halfword');
 for(const op of [0x8818,0x8010,0x3302,0x3202,0x1e48,0x0400])c.emit(op);
 c.label('count');c.emit(0x0c01);c.cmp(1,0);c.branch('halfword',1);
 c.emit(0x466b);c.emit(0x3301);c.ldr(0,readerPool+8,flashInfo);
 for(const op of [0x6800,0x7a00,0x4084,0x1c20,0x22e0,0x0512,0x18a9,0x1840,0x1c31,0x1c3a])c.emit(op);
 c.bl(readBytes);for(const op of [0xb020,0xbcf0,0xbc01,0x4700])c.emit(op);c.finish();
 const bankPool=(trampoline+0x83)&~3,e=assembler(bytes,bankSwitch);
 e.ldr(3,bankPool,0x03007400);e.emit(0x681a);e.ldr(3,bankPool+4,0x534c5432);e.emit(0x429a);e.branch('bank',1);
 e.emit(0x3030);e.emit(0x0600);e.emit(0x0e00);e.label('bank');e.mov(2,0xaa);e.mov(1,0x55);e.ldr(3,bankPool+8,0x0e005555);e.emit(0x701a);
 e.ldr(2,bankPool+12,0x0e002aaa);for(const op of [0x7011,0x22b0,0x701a,0x23e0,0x051b,0x7018,0x4770])e.emit(op);e.finish();
 if(veneer){const v=assembler(bytes,bankVeneer);v.ldr(1,(bankVeneer+11)&~3,romBase+bankSwitch+1);v.emit(0x4708);}
 word(bytes,trampoline,0x4728);word(bytes,readBytes,0x4718);
 return {bytes,offset,helper,caller,reader,trampoline,readerLiteral,callerLiterals,readerPool,calls,copy,bankSwitch,bankVeneer,bankPool,readBytes};
}
module.exports={buildFixture,word,literal,branchLink};
