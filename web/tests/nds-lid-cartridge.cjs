// SPDX-License-Identifier: AGPL-3.0-or-later
// Original ARM7 program: read KEYXY bit 7 (hinge), expose it in shared RAM.
// The original ARM9 fixture shows blue=open / green=closed on the lower LCD.
module.exports=function ndsLidCartridge(){
 const rom=require('./nds-options-cartridge.cjs')(),words=[0xe59f0010,0xe59f1010,0xe1d020b0,0xe2022080,0xe5812000,0xeafffffb,0x04000136,0x02001008];
 rom.writeUInt32LE(words.length*4,0x3c);words.forEach((word,i)=>rom.writeUInt32LE(word,0x400+i*4));return rom;
};
