// SPDX-License-Identifier: AGPL-3.0-or-later
// Original bounded ZIP importer. Reads local Blob slices only, never paths or URLs.
import {tr} from '../i18n/index.js';
import {detectSystem} from '../shared.js';
export const maxROMZipSize=576*1048576;
const maxExpanded=512*1048576,maxEntries=256,maxDirectory=2*1048576;
const crcTable=Uint32Array.from({length:256},(_,value)=>{for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);return value>>>0;});
const broken=()=>new Error(tr('ZIPが壊れているか、対応していない形式です。'));
const view=bytes=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
const read=async(file,start,end)=>new Uint8Array(await file.slice(start,end).arrayBuffer());
export async function listROMZip(file){
 if(file.size<22||file.size>maxROMZipSize)throw new Error(tr('ZIPは576 MiB以下のファイルを選んでください。'));
 const tailStart=Math.max(0,file.size-65557),tail=await read(file,tailStart,file.size),v=view(tail);let end=-1;
 for(let i=tail.length-22;i>=0;i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===tail.length){end=i;break;}
 if(end<0||v.getUint16(end+4,true)||v.getUint16(end+6,true))throw broken();
 const count=v.getUint16(end+10,true),size=v.getUint32(end+12,true),start=v.getUint32(end+16,true);
 if(!count||count>maxEntries||count!==v.getUint16(end+8,true)||size>maxDirectory||start+size!==tailStart+end)throw broken();
 const directory=await read(file,start,start+size),d=view(directory),decoder=new TextDecoder('utf-8',{fatal:true});
 const entries=[],ranges=[],seen=new Set();let pos=0,total=0,totalPacked=0;
 for(let i=0;i<count;i++){
  if(pos+46>size||d.getUint32(pos,true)!==0x02014b50)throw broken();
  const flags=d.getUint16(pos+8,true),method=d.getUint16(pos+10,true),crc=d.getUint32(pos+16,true),packed=d.getUint32(pos+20,true),length=d.getUint32(pos+24,true),n=d.getUint16(pos+28,true),extra=d.getUint16(pos+30,true),comment=d.getUint16(pos+32,true),disk=d.getUint16(pos+34,true),attributes=d.getUint32(pos+38,true),local=d.getUint32(pos+42,true);
  if(pos+46+n+extra+comment>size||disk||[packed,length,local].includes(0xffffffff))throw broken();
  const nameBytes=directory.slice(pos+46,pos+46+n);let name;
  try{name=decoder.decode(nameBytes);}catch{throw new Error(tr('ZIP内のファイル名を読み込めません。解凍してからゲームを追加してください。'));}
  pos+=46+n+extra+comment;
  if(!name||/[\\:\u0000-\u001f]/.test(name)||name.startsWith('/')||name.split('/').includes('..')||seen.has(name.toLowerCase()))throw broken();
  seen.add(name.toLowerCase());
  // Hidden metadata, documents, patches and nested archives are not extracted.
  if(name.endsWith('/')||name.split('/').some(part=>part.startsWith('.')||part==='__MACOSX'))continue;
  const system=detectSystem(name);if(!system||system==='3ds')continue;
  if(flags&~0x080e||![0,8].includes(method)||(attributes>>>16&0xf000)===0xa000)throw broken();
  if(!length||length>(system==='nds'?512:64)*1048576||(total+=length)>maxExpanded)throw new Error(tr('ZIP内のゲームが大きすぎます。解凍後の合計は512 MiBまでです。'));
  if(!packed||(method===0&&packed!==length)||local+30>start)throw broken();
  const header=await read(file,local,local+30),h=view(header);
  if(h.getUint32(0,true)!==0x04034b50||h.getUint16(6,true)!==flags||h.getUint16(8,true)!==method||h.getUint16(26,true)!==n)throw broken();
  const offset=local+30+n+h.getUint16(28,true);
  if(offset+packed>start)throw broken();
  // Include the local header and extra field: an overlapping extra field can
  // otherwise make many distinct names refer to the same compressed stream.
  // Bound input work as well as expanded output, including empty deflate blocks.
  const dataEnd=offset+packed;
  if((totalPacked+=packed)>maxROMZipSize||ranges.some(range=>local<range.end&&dataEnd>range.start))throw broken();
  ranges.push({start:local,end:dataEnd});
  const localName=await read(file,local+30,local+30+n);
  if(!localName.every((byte,index)=>byte===nameBytes[index]))throw broken();
  entries.push({name,filename:name.split('/').pop(),system,offset,packed,length,method,crc});
 }
 if(pos!==size)throw broken();
 if(!entries.length)throw new Error(tr('ZIP内に対応するゲームが見つかりません。'));
 return entries;
}
export async function extractROMZip(file,entry,onProgress=()=>{}){
 let stream=file.slice(entry.offset,entry.offset+entry.packed).stream();
 if(entry.method===8)try{stream=stream.pipeThrough(new DecompressionStream('deflate-raw'));}catch{throw new Error(tr('このブラウザではZIPを解凍できません。解凍してからゲームを追加してください。'));}
 const reader=stream.getReader(),bytes=new Uint8Array(entry.length);let offset=0,crc=0xffffffff,lastProgress=0;
 try{
  for(;;){
   const {value,done}=await reader.read();if(done)break;
   if(offset+value.length>entry.length)throw broken();
   bytes.set(value,offset);offset+=value.length;
   for(const byte of value)crc=(crc>>>8)^crcTable[(crc^byte)&255];
   if(offset-lastProgress>=1048576){onProgress(offset,entry.length);lastProgress=offset;}
  }
 }catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 if(offset!==entry.length||((crc^0xffffffff)>>>0)!==entry.crc)throw broken();
 onProgress(offset,entry.length);
 // Keep only one expanded byte buffer until its identity/duplicate check has
 // finished. The worker creates a Blob only if a new NDS ROM needs storing.
 return {bytes,name:entry.filename,size:bytes.length,system:entry.system};
}
