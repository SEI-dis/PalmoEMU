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
 const range=fixture({stamp:0x2f01,rangeGate:true}),rangeHash=hash(range.bytes);
 assert.deepEqual(read(range.bytes),{version:'0.47.1',minimumSaveVersion:'0.36.2'});
 const unknownRange={version:'0.47.1',minimumSaveVersion:null};
 const rejectRange=(label,mutate)=>{const b=range.bytes.slice();mutate(b);assert.deepEqual(read(b),unknownRange,label);};
 for(const at of [range.lower+4,range.lower+6,range.upper+2,range.upper+4,range.upper+6,range.gate+26,range.gate+48,range.gate+80])rejectRange('Changed range semantics '+at,b=>word(b,at,0x46c0));
 rejectRange('Upper bound must match ROM writer',b=>literal(b,range.upper+0x20,0x2f00));
 rejectRange('Unknown getter register',b=>word(b,range.trampoline+2,0x4718));
 rejectRange('Failure and success must rejoin',b=>word(b,range.gate+82,0xe000));
 rejectRange('Lower and upper bounds conflict',b=>literal(b,range.lower+0x20,0x2f01));
 assert.equal(hash(range.bytes),rangeHash,'Range inspection is immutable');
 const current=fixture({stamp:0x3000,minimum:0x2402,rangeGate:true,writer:0x16000,gate:0x12000,trampoline:0x20000}),currentHash=hash(current.bytes);
 assert.deepEqual(read(current.bytes),{version:'0.48.0',minimumSaveVersion:'0.36.2'},'A newer target retains its own native bounds, independent of the converter output');
 assert.equal(hash(current.bytes),currentHash);
 // Whole minor releases may synthesize the upper bound rather than load it.
 const shifted=fixture({stamp:0x3000,rangeGate:true,upperImmediate:true}),shiftedHash=hash(shifted.bytes);
 const expectedShifted={version:'0.48.0',minimumSaveVersion:'0.36.2'},unknownShifted={version:'0.48.0',minimumSaveVersion:null};
 assert.deepEqual(read(shifted.bytes),expectedShifted,'MOVS r3,#0xc0; LSLS r3,r3,#6 equals the literal 0.48 bound');
 const alternate=shifted.bytes.slice();word(alternate,shifted.upper,0x2360);word(alternate,shifted.upper+2,0x01db);
 assert.deepEqual(read(alternate),expectedShifted,'A different immediate/shift pair with the same value is also valid');
 const rejectShifted=(label,mutate)=>{const b=shifted.bytes.slice();mutate(b);assert.deepEqual(read(b),unknownShifted,label);};
 for(const [label,offset,op]of [
  ['Constant loaded into wrong register',0,0x22c0],['Shift reads wrong register',2,0x0193],
  ['Shift writes wrong register',2,0x019a],['Right shift is not left shift',2,0x099b],
  ['Changed shift cannot equal the writer stamp',2,0x015b],['Overflowing constant is not a version',2,0x079b],
  ['Upper comparison reads wrong register',4,0x4282],['Upper result changes semantics',6,0x4140],
  ['Upper predicate must return',10,0x46c0]
 ])rejectShifted(label,b=>word(b,shifted.upper+offset,op));
 assert.equal(hash(shifted.bytes),shiftedHash,'Immediate constant inspection is immutable');
 const bothShifted=fixture({stamp:0x3000,minimum:0x2401,rangeGate:true,upperImmediate:true,lowerImmediate:true});
 assert.deepEqual(read(bothShifted.bytes),{version:'0.48.0',minimumSaveVersion:'0.36.1'},'Lower bounds also follow actual constant semantics');
 const rejectLower=(label,offset,op)=>{const b=bothShifted.bytes.slice();word(b,bothShifted.lower+offset,op);assert.deepEqual(read(b),unknownShifted,label);};
 for(const [label,offset,op]of [
  ['Lower predicate initializes its result',0,0x2301],['Lower constant register',2,0x2390],
  ['Lower shift reads wrong register',4,0x019a],['Lower shift writes wrong register',4,0x0193],
  ['Lower comparison reads wrong register',6,0x4283],['Lower predicate must return',12,0x46c0]
 ])rejectLower(label,offset,op);
 const highMinimum=fixture({stamp:0x3000,minimum:0x2b00,rangeGate:true,upperImmediate:true});
 assert.deepEqual(read(highMinimum.bytes),{version:'0.48.0',minimumSaveVersion:'0.43.0'},'Immediate upper constants never relax a raised minimum');
 // A new native layout gate must be identified separately from the version
 // lower bound. The migration guard stamp 0x31ff is not that lower bound.
 const l=fixture({stamp:0x3200,rangeGate:true,upperImmediate:true,lFormat:true}),lHash=hash(l.bytes),lExpected={version:'0.50.0',minimumSaveVersion:'0.36.2',saveFormat:'L'};
 assert.deepEqual(read(l.bytes),lExpected);
 const relocatedL=fixture({stamp:0x3201,minimum:0x2600,rangeGate:true,lFormat:true,writer:0x16000,gate:0x12000,trampoline:0x20000});
 assert.deepEqual(read(relocatedL.bytes),{version:'0.50.1',minimumSaveVersion:'0.38.0',saveFormat:'L'},'The layout evidence and actual bounds may relocate');
 const unknownL={version:'0.50.0',minimumSaveVersion:null};
 const rejectL=(label,mutate)=>{const bytes=l.bytes.slice();mutate(bytes);assert.deepEqual(read(bytes),unknownL,label);};
 for(const at of [l.gate-20,l.gate-16,l.gate-8,l.gate+20,l.gate+48,l.gate+54,l.gate+84,l.lowerBody,l.upperBody,
  l.formatGuard+8,l.formatGuard+12,l.formatGuard+16,l.formatGuard+18,l.formatLoader+0x18,l.formatLoader+0x22,l.formatLoader+0xa4,l.formatLoader+0xaa,l.formatInit+6,l.formatInit+12])rejectL('Changed L guard semantics '+at,b=>word(b,at,0x46c0));
 rejectL('The format failure must return to the same menu',b=>word(b,l.gate-2,0xe000));
 rejectL('Version upper and writer must agree',b=>word(b,l.upper,0x23c4));
 rejectL('Format cache identity must match',b=>literal(b,l.formatGuard+0x84,0x45484354));
 rejectL('Format cache must reside in RAM',b=>literal(b,l.formatGuard+0x80,0x080310e0));
 rejectL('Old-format loader must inspect the old magic',b=>literal(b,l.formatLoader+0x104,0x4c454854));
 rejectL('New-format loader must inspect SHL2',b=>literal(b,l.formatLoader+0x108,0x324c4854));
 rejectL('Loader must read a RAM save pointer',b=>literal(b,l.formatLoader+0x100,0x09005048));
 rejectL('Old-format flag and menu cache must agree',b=>literal(b,l.formatLoader+0xe0,0x020310e4));
 rejectL('Initialization must clear the old-format flag',b=>literal(b,l.formatInit+0x84,0x02031187));
 rejectL('New-format loading must use the same initializer',b=>branchLink(b,l.formatLoader+0xb0,l.formatInit+2));
 rejectL('Old-format rejection must return without clearing its flag',b=>word(b,l.formatLoader+0xac,0xe000));
 assert.equal(hash(l.bytes),lHash,'L format inspection is immutable');
 const w=fixture({stamp:0x3501,rangeGate:true,wFormat:true,writer:0x16000,gate:0x12000,trampoline:0x20000}),wHash=hash(w.bytes);
 assert.deepEqual(read(w.bytes),{version:'0.53.1',minimumSaveVersion:'0.36.2',saveFormat:'W'});
 const futureW=fixture({stamp:0x3602,minimum:0x3500,rangeGate:true,wFormat:true});
 assert.deepEqual(read(futureW.bytes),{version:'0.54.2',minimumSaveVersion:'0.53.0',saveFormat:'W'},'W compatibility follows native bounds, not a fixed release');
 for(const at of [w.formatLoader+0x16,w.formatLoader+0x1e,w.formatLoader+0x2c,w.formatLoader+0x32,w.formatLoader+0xc4,w.formatLoader+0xcc,w.formatInit+6,w.gate-16]){
  const bytes=w.bytes.slice();word(bytes,at,0x46c0);assert.deepEqual(read(bytes),{version:'0.53.1',minimumSaveVersion:null},'Changed W control flow must fail closed');
 }
 for(const [at,value] of [[w.formatLoader+0x104,0xb3bab7ae],[w.formatLoader+0x108,0xcdb3b7ae],[w.formatLoader+0x10c,0x334c4854],[w.formatLoader+0x110,0x020310e4]]){
  const bytes=w.bytes.slice();literal(bytes,at,value);assert.deepEqual(read(bytes),{version:'0.53.1',minimumSaveVersion:null},'W layout and cache evidence must agree');
 }
 const invertedW=w.bytes.slice();word(invertedW,w.formatLoader+0x32,0xd11d);assert.deepEqual(read(invertedW),{version:'0.53.1',minimumSaveVersion:null},'Inverted W acceptance branch must fail closed');
 assert.equal(hash(w.bytes),wHash);
 console.log('PASS: native START version/minimum-save discovery, relocation, future revision/boundary changes, strict code/header validation and ambiguity refusal.');
})().catch(error=>{console.error(error);process.exitCode=1;});
