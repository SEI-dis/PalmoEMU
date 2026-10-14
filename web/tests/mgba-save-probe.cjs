// SPDX-License-Identifier: AGPL-3.0-or-later
// Structural matching must follow relocated control flow and refuse ambiguity.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {buildFixture,word,literal,branchLink}=require('./helpers/mgba-save-probe-fixture.cjs');
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
(async()=>{
 const {findExtendedSaveProbe:find}=await import('../src/core/mgba-save-probe.js');
 const expected=f=>({offset:f.offset,requiredSaveBytes:6291456});
 const baseline=buildFixture(),before=digest(baseline.bytes);assert.deepEqual(find(baseline.bytes),expected(baseline));assert.equal(digest(baseline.bytes),before);
 // Function order, positive/negative BL distances and literal pool placement
 // differ; the ROM version, overall digest and code addresses are irrelevant.
 for(const layout of [
  {helper:0x23002,caller:0x18002,reader:0x28002,trampoline:0x29002,helperPool:0x23200,callerPool:0x18180,readerPool:0x28200},
  {helper:0x32000,caller:0x38000,reader:0x24000,trampoline:0x26000,helperPool:0x321c0,callerPool:0x38100,readerPool:0x24200,veneer:true}
 ]){const f=buildFixture(layout);f.bytes[0x100000]=0xa5;f.bytes[f.bytes.length-1]=0x3c;assert.deepEqual(find(f.bytes),expected(f),'Relocated helper/caller/literals/reader');}
 const revised=baseline.bytes.slice();for(const position of [0x90,0x300000,0x1000000,revised.length-1])revised[position]^=0x5a;assert.deepEqual(find(revised),expected(baseline),'Unrelated ROM changes keep the structural correction');
 const backed=new Uint8Array(baseline.bytes.length+14);backed.set(baseline.bytes,7);assert.deepEqual(find(backed.subarray(7,-7)),expected(baseline),'Offsets refer to the supplied view');
 const negative=(label,mutate)=>{const bytes=baseline.bytes.slice();mutate(bytes);assert.equal(find(bytes),null,label);};
 negative('Near-match comparison instruction',bytes=>word(bytes,baseline.helper+48,0x4290));
 negative('Already changed equality result',bytes=>word(bytes,baseline.offset,0x2001));
 negative('Broken branch-link encoding',bytes=>word(bytes,baseline.calls[0]+2,0x4700));
 negative('One caller uses another helper',bytes=>branchLink(bytes,baseline.calls[1],baseline.trampoline));
 negative('Reader pointer outside the cartridge',bytes=>literal(bytes,baseline.readerLiteral,0x02000001));
 negative('Reader pointer uses ARM instead of Thumb',bytes=>literal(bytes,baseline.readerLiteral,0x08000000+baseline.reader));
 negative('Trampoline no longer calls the reader register',bytes=>word(bytes,baseline.trampoline,0x4730));
 negative('Reader uses another memory space',bytes=>literal(bytes,baseline.readerPool,0x05000204));
 negative('Flash descriptor is outside GBA RAM',bytes=>literal(bytes,baseline.readerPool+8,0x08000000));
 negative('Reader paths use different flash descriptors',bytes=>{
  const instruction=baseline.reader+118,pool=baseline.readerPool+12;
  word(bytes,instruction,0x4800|((pool-((instruction+4)&~3))/4));literal(bytes,pool,0x03007474);
 });
 negative('Reader branch escapes the ROM',bytes=>{word(bytes,baseline.reader+48,0xf400);word(bytes,baseline.reader+50,0xf800);});
 negative('Reader flash access is only a near match',bytes=>word(bytes,baseline.reader+128,0x22d0));
 negative('Reader skips the actual read',bytes=>word(bytes,baseline.reader+56,0xe02a));
 negative('Reader returns before copying data',bytes=>word(bytes,baseline.reader+56,0x4770));
 negative('RAM copy loop no longer copies bytes',bytes=>word(bytes,baseline.copy+14,0x7810));
 negative('Copied read routine has the wrong source',bytes=>literal(bytes,baseline.readerPool+12,0x08000000+baseline.copy+3));
 negative('Copied read routine has the wrong end',bytes=>literal(bytes,baseline.readerPool+16,0x08000000+baseline.reader+3));
 negative('Bank selector uses another command',bytes=>word(bytes,baseline.bankSwitch+28,0x22b1));
 negative('Bank selector writes outside flash',bytes=>literal(bytes,baseline.bankPool+8,0x0d005555));
 negative('Read dispatch does not call RAM routine',bytes=>word(bytes,baseline.readBytes,0x4770));
 negative('Wrong caller signature',bytes=>literal(bytes,baseline.callerLiterals[1],0x31534348));
 negative('Wrong PKSP header',bytes=>bytes[0x2000000]^=1);
 negative('Wrong ICS1 header',bytes=>bytes[0x2000004]^=1);
 negative('Invalid cartridge header',bytes=>bytes[0xb2]=0);
 negative('Second direct caller shares comparator',bytes=>branchLink(bytes,0x9000,baseline.helper));
 negative('External tail branch shares comparator',bytes=>word(bytes,baseline.helper-0x80,0xe03e));
 negative('External conditional branch shares comparator',bytes=>word(bytes,baseline.helper-0x80,0xd03e));
 negative('Comparator referenced through a function pointer',bytes=>literal(bytes,0x9000,0x08000000+baseline.helper+1));
 negative('Two otherwise valid probes',bytes=>buildFixture({bytes,helper:0x14000,caller:0x15000,reader:0x16000,trampoline:0x17000}));
 for(const value of [null,baseline.bytes.buffer,new Uint8Array(16),baseline.bytes.subarray(0,0x2000007),new Uint8Array(64*1048576+1)])assert.equal(find(value),null,'Invalid type/size');
 assert.equal(digest(baseline.bytes),before,'Matcher and mutation cases leave the original fixture unchanged');
 console.log('PASS: structural probe relocation, arbitrary ROM revisions, view offsets, strict near-match/call/reader/signature checks, ambiguity/referral refusal and input preservation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
