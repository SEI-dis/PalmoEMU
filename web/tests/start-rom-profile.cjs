// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fixture,word,literal,branchLink}=require('./helpers/start-rom-profile-fixture.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
(async()=>{
 const {readStartROMProfile:read,isStartROMFamily:isFamily}=await import('../src/start-save/rom-profile.js');
 const baseline=fixture(),before=hash(baseline.bytes),expected={version:'0.42.5',minimumSaveVersion:'0.36.2'};
 assert.equal(isFamily(baseline.bytes),true);
 assert.deepEqual(read(baseline.bytes),expected);
 for(const options of [{stamp:0x2b01,minimum:0x2600,writer:0x16000,gate:0x12000,trampoline:0x20000},{stamp:0x2900,immediate:true}]){
  const f=fixture(options);assert.deepEqual(read(f.bytes),{version:`0.${options.stamp>>>8}.${options.stamp&255}`,minimumSaveVersion:options.minimum?'0.38.0':'0.36.2'});
 }
 const view=new Uint8Array(baseline.bytes.length+10);view.set(baseline.bytes,5);assert.deepEqual(read(view.subarray(5,-5)),expected);
 const negative=(label,mutate,expectedResult=null)=>{const bytes=baseline.bytes.slice();mutate(bytes);assert.deepEqual(read(bytes),expectedResult,label);};
 for(const at of [0xa0,0xac,0xb2,0x2000000])negative('Marker mismatch',bytes=>{bytes[at]^=1;assert.equal(isFamily(bytes),false);});
 const changedWriter=baseline.bytes.slice();word(changedWriter,baseline.writer,0x4770);assert.equal(read(changedWriter),null);assert.equal(isFamily(changedWriter),true,'Unknown native code must retain family identity for safe routing');
 negative('Wrong version variable',bytes=>literal(bytes,baseline.writer+0x84,0x50ee));
 negative('Wrong setter',bytes=>literal(bytes,baseline.writer+0x88,0x0806dd7b));
 negative('Setter call changed',bytes=>word(bytes,baseline.writer+8,0x4770));
 negative('Trampoline calls wrong register',bytes=>word(bytes,baseline.trampoline,0x4720));
 negative('Ambiguous writers',bytes=>fixture({bytes,writer:0x10000,gate:0x14000,trampoline:0x18000}));
 const unclassified={version:'0.42.5',minimumSaveVersion:null};
 negative('Comparison semantics changed',bytes=>word(bytes,baseline.gate+12,0xd800),unclassified);
 negative('Failure no longer disables Continue',bytes=>word(bytes,baseline.gate+20,0x2301),unclassified);
 negative('Wrong getter',bytes=>literal(bytes,baseline.gate+0x80,0x0806dd5f),unclassified);
 negative('Minimum newer than target',bytes=>literal(bytes,baseline.gate+0x88,0x2b00),unclassified);
 negative('Gate jump paths disagree',bytes=>word(bytes,baseline.gate+24,0xe000),unclassified);
 for(const value of [null,new ArrayBuffer(32),new Uint8Array(100),new Uint8Array(64*1048576+1)]){assert.equal(read(value),null);assert.equal(isFamily(value),false);}
 assert.equal(hash(baseline.bytes),before,'ROM inspection is immutable');
 console.log('PASS: native START version/minimum-save discovery, relocation, future revision/boundary changes, strict code/header validation and ambiguity refusal.');
})().catch(error=>{console.error(error);process.exitCode=1;});
