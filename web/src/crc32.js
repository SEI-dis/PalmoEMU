// SPDX-License-Identifier: AGPL-3.0-or-later
// CRC-32/ISO-HDLC, used by ZIP and PokemonStart's ROM identifiers.
const table=new Uint32Array(256);
for(let i=0;i<table.length;i++){
 let value=i;
 for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);
 table[i]=value;
}

// Pass the checksum returned for the preceding chunks to continue a stream.
export function crc32(bytes,previous=0){
 let crc=previous^0xffffffff;
 for(let i=0;i<bytes.length;i++)crc=(crc>>>8)^table[(crc^bytes[i])&255];
 return (crc^0xffffffff)>>>0;
}
