// SPDX-License-Identifier: AGPL-3.0-or-later
// Original bounded ZIP reader using the browser's DEFLATE implementation.
import {tr} from '../i18n/index.js';
const MAX=100*1024*1024;
export async function readSkinZip(buffer){
 const bytes=new Uint8Array(buffer),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length>40*1024*1024||bytes.length<22)throw new Error(tr('このスキンは読み込めません。ZIP形式で40MB以下のファイルに対応しています。'));
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===bytes.length){end=i;break;}
 if(end<0||v.getUint16(end+4,true)||v.getUint16(end+6,true))throw new Error(tr('このスキンの圧縮形式には対応していません。'));
 const count=v.getUint16(end+10,true),start=v.getUint32(end+16,true),size=v.getUint32(end+12,true);
 if(!count||count>256||start+size>end)throw new Error(tr('ファイル数が多すぎるか、スキンの構造が正しくありません。'));
 const entries=[],seen=new Set(),decoder=new TextDecoder('utf-8',{fatal:true});let pos=start,total=0;
 for(let i=0;i<count;i++){
  if(pos+46>end||v.getUint32(pos,true)!==0x02014b50)throw new Error(tr('スキンのファイル一覧が壊れています。'));
  const flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true),crc=v.getUint32(pos+16,true),packed=v.getUint32(pos+20,true),length=v.getUint32(pos+24,true),n=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true),local=v.getUint32(pos+42,true);
  if(pos+46+n+extra+comment>start+size)throw new Error(tr('スキンのファイル一覧が壊れています。'));
  const name=decoder.decode(bytes.subarray(pos+46,pos+46+n));pos+=46+n+extra+comment;
  if(!name||name.includes('\\')||name.includes(':')||name.startsWith('/')||name.split('/').includes('..')||seen.has(name.toLowerCase()))throw new Error(tr('読み込めないファイル名が含まれています。'));seen.add(name.toLowerCase());
  if(flags&1||![0,8].includes(method)||length>MAX||(total+=length)>MAX)throw new Error(tr('容量が大きすぎるか、暗号化・圧縮の形式に対応していません。'));
  if(name.endsWith('/')||name.startsWith('__MACOSX/')||name.split('/').pop().startsWith('.'))continue;
  // Unreferenced files remain bounded, inert bytes. Only validated local images
  // are decoded by the importer; scripts and external URLs are never executed.
  if(local+30>start||v.getUint32(local,true)!==0x04034b50)throw new Error(tr('ZIPが壊れています。'));
  const offset=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
  if(offset+packed>start)throw new Error(tr('スキンの圧縮データが壊れています。'));
  entries.push({name,method,crc,length,data:bytes.slice(offset,offset+packed)});
 }
 if(pos!==start+size)throw new Error(tr('スキンのファイル一覧が壊れています。'));
 const files=new Map();
 for(const entry of entries){
  let data=entry.data;
  if(entry.method===8){
   let stream;try{stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}catch{throw new Error(tr('このスキンを解凍できません。最新版のブラウザを使用してください。'));}
   const reader=stream.getReader(),chunks=[];let length=0;
   try{for(;;){const {value,done}=await reader.read();if(done)break;if((length+=value.length)>entry.length)throw new Error(tr('解凍後のファイルサイズが正しくありません。'));chunks.push(value);}}catch(e){await reader.cancel();throw e;}
   data=new Uint8Array(length);let p=0;for(const chunk of chunks){data.set(chunk,p);p+=chunk.length;}
  }
  if(data.length!==entry.length||crc32(data)!==entry.crc)throw new Error(tr('スキンに破損が見つかりました。'));
  files.set(entry.name,data);
 }
 return files;
}
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
