// SPDX-License-Identifier: AGPL-3.0-or-later
// Local archive of this isolated core's save directories. Never contains ROMs or keys.
import {tr} from '../i18n/index.js';
const signature=new TextEncoder().encode('LP3SAVE\0'),limit=128*1048576;
const roots=['/user/Azahar/sdmc','/user/Azahar/nand'];
const validPath=p=>typeof p==='string'&&p.length<512&&/^\/user\/Azahar\/(sdmc|nand)\//.test(p)&&!p.slice(1).split('/').some(x=>!x||x==='.'||x==='..'||x.includes('\\')||x.includes('\0'));
export function packSave(FS){
 const files=[];let total=0;
 const walk=p=>{let names;try{names=FS.readdir(p);}catch(e){if(e.errno===44||e.code==='ENOENT')return;throw e;}for(const name of names.sort()){
  if(name==='.'||name==='..')continue;const target=p+'/'+name,stat=FS.lstat(target);
  if(FS.isDir(stat.mode))walk(target);else if(FS.isFile(stat.mode)&&validPath(target)){
   total+=stat.size;if(total>limit||files.length>=2048)throw Error(tr('3DSのセーブ容量が上限を超えています。'));
   files.push({path:target,bytes:FS.readFile(target)});
  }
 }};walk('/user/Azahar/sdmc');walk('/user/Azahar/nand');
 if(!files.length)return null;
 const metadata=new TextEncoder().encode(JSON.stringify(files.map(f=>[f.path,f.bytes.length])));
 if(12+metadata.length+total>limit)throw Error(tr('3DSのセーブ容量が上限を超えています。'));
 const result=new Uint8Array(12+metadata.length+total);result.set(signature);
 new DataView(result.buffer).setUint32(8,metadata.length,true);result.set(metadata,12);
 let offset=12+metadata.length;for(const file of files){result.set(file.bytes,offset);offset+=file.bytes.length;}
 return result;
}
export function unpackSave(FS,bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length<14||bytes.length>limit||!signature.every((b,i)=>bytes[i]===b))throw Error(tr('PalmoEMUの3DSセーブファイルを選んでください。'));
 const size=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(8,true);
 if(size>1048576||12+size>bytes.length)throw Error(tr('セーブファイルが破損しています。'));
 let entries;try{entries=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(12,12+size)));}catch{throw Error(tr('セーブファイルが破損しています。'));}
 if(!Array.isArray(entries)||entries.length>2048)throw Error(tr('セーブ形式が一致しません。'));
 let offset=12+size;const seen=new Set(),validated=[];
 for(const entry of entries){
  if(!Array.isArray(entry)||entry.length!==2)throw Error(tr('セーブ形式が一致しません。'));
  const [name,length]=entry;if(!validPath(name)||seen.has(name)||!Number.isSafeInteger(length)||length<0||offset+length>bytes.length)throw Error(tr('セーブ形式が一致しません。'));
  seen.add(name);validated.push({name,bytes:bytes.subarray(offset,offset+length)});offset+=length;
 }
 if(offset!==bytes.length)throw Error(tr('セーブファイルが破損しています。'));
 // Reject file/directory conflicts and symlinks before any modification.
 for(const {name} of validated){
  const parts=name.split('/');let target='';
  for(let i=1;i<parts.length;i++){
   target+='/'+parts[i];if(i<parts.length-1&&seen.has(target))throw Error(tr('セーブ形式が一致しません。'));
   let stat;try{stat=FS.lstat(target);}catch(e){if(e.errno===44||e.code==='ENOENT')continue;throw e;}
   if(i<parts.length-1?!FS.isDir(stat.mode):!FS.isFile(stat.mode))throw Error(tr('セーブの保存先を確認してください。'));
  }
 }
 const existing=[];
 function walk(path){
  let names;try{names=FS.readdir(path);}catch(e){if(e.errno===44||e.code==='ENOENT')return;throw e;}
  for(const name of names){if(name==='.'||name==='..')continue;const target=path+'/'+name,stat=FS.lstat(target);
   if(FS.isDir(stat.mode))walk(target);else if(FS.isFile(stat.mode))existing.push({name:target,bytes:FS.readFile(target)});
   else throw Error(tr('セーブの保存先を確認してください。'));
  }
 }
 roots.forEach(walk);
 const oldPaths=new Set(existing.map(f=>f.name)),written=[];
 try{
  for(const file of validated){FS.mkdirTree(file.name.slice(0,file.name.lastIndexOf('/')));written.push(file.name);FS.writeFile(file.name,file.bytes);}
  for(const file of existing)if(!seen.has(file.name))FS.unlink(file.name);
 }catch(error){
  // Keep the running core's previous files if a write fails; IndexedDB is untouched.
  for(const name of written)if(!oldPaths.has(name)){try{FS.unlink(name);}catch{}}
  for(const file of existing)FS.writeFile(file.name,file.bytes);
  throw error;
 }
}
