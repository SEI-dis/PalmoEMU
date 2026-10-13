// SPDX-License-Identifier: AGPL-3.0-or-later
// Original ARM9/ARM7 fixture; reuses the synthetic header in nds-cartridge.cjs.
// Encodes the direct-boot firmware language in the top backdrop's red channel.
// Both pinned cores copy firmware user settings to 0x027FFC80; language is +0x64.
// ARM7 reads microphone samples through SPI; ARM9 shows blue for silence and
// green for noise. No test-only emulator export is used to observe either input.
module.exports=function ndsOptionsCartridge(){
 const rom=require('./nds-cartridge.cjs')(),words=[],pool=[];
 const emit=word=>words.push(word>>>0),constant=(reg,value)=>{pool.push({at:words.length,reg,value});emit(0);};
 constant(0,0x04000304);constant(1,0x820f);emit(0xe1c010b0); // Power both displays.
 constant(0,0x04000000);constant(1,0x10000);emit(0xe5801000);
 constant(0,0x04001000);emit(0xe5801000);
 const loop=words.length;
 constant(0,0x027ffce4);emit(0xe5d01000);emit(0xe2011007); // LDRB; AND language, 7.
 emit(0xe2811001);emit(0xe1a01101); // Red = (language + 1) * 4 in RGB555.
 constant(0,0x05000000);emit(0xe1c010b0);
 constant(0,0x02001008);emit(0xe5901000);emit(0xe3510000);emit(0x03a01b1f);emit(0x13a01e3e);
 constant(0,0x05000400);emit(0xe1c010b0);emit(0xea000000|((loop-words.length-2)&0xffffff));
 for(const {at,reg,value} of pool){words[at]=(0xe59f0000|(reg<<12)|((words.length-at-2)*4))>>>0;emit(value);}
 // melonDS treats an entry point below the secure area differently. This is an
 // original unencrypted homebrew entry point, shared by the two core tests.
 rom.write('LPTE',12);rom.writeUInt32LE(0x8000,0x20);rom.writeUInt32LE(words.length*4,0x2c);
 words.forEach((word,i)=>rom.writeUInt32LE(word,0x8000+i*4));
 const arm7=[],constants=[],e=word=>arm7.push(word>>>0),l=(reg,value)=>{constants.push({at:arm7.length,reg,value});e(0);};
 const branch=(target,condition=0xe)=>e((condition<<28)|0x0a000000|((target-arm7.length-2)&0xffffff));
 const wait=()=>{const at=arm7.length;e(0xe1d040b0);e(0xe3140080);branch(at,1);};
 l(0,0x040001c0);l(1,0x040001c2);l(2,0x02001008);l(3,0x8a00);e(0xe1c030b0);
 const bucket=arm7.length;e(0xe3a05000);e(0xe3a06080); // Aggregate 128 samples.
 const sample=arm7.length;e(0xe3a030e0);e(0xe5c13000);wait(); // AUX channel command.
 e(0xe3a03000);e(0xe5c13000);wait();e(0xe5d14000); // Read high conversion byte.
 e(0xe3540040);e(0x13a05001); // Both cores' neutral high sample is 0x40.
 e(0xe2566001);branch(sample,1);e(0xe5825000);branch(bucket);
 for(const {at,reg,value} of constants){arm7[at]=(0xe59f0000|(reg<<12)|((arm7.length-at-2)*4))>>>0;e(value);}
 rom.writeUInt32LE(arm7.length*4,0x3c);arm7.forEach((word,i)=>rom.writeUInt32LE(word,0x400+i*4));return rom;
};
