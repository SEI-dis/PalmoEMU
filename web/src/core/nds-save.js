// SPDX-License-Identifier: AGPL-3.0-or-later
// Ported format handling from ManicEMU NDSSaveConverter.swift (Daiuno, 2026).
// Modified 2026-10-13: validate the complete footer and return a separate buffer;
// never rewrite the selected file or an existing stored save.
import {tr} from '../i18n/index.js';
const text=new TextEncoder().encode('|<--Snip above here to create a raw sav by excluding this DeSmuME savedata footer:');
const cookie=new TextEncoder().encode('|-DESMUME SAVE-|');
const matches=(bytes,offset,pattern)=>offset>=0&&pattern.every((v,i)=>bytes[offset+i]===v);
export function normalizeNDSSave(input,{requireDSV=false,maxBytes=64*1048576}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 const wrapped=matches(bytes,bytes.length-cookie.length,cookie);
 if(!wrapped){if(requireDSV)throw Error(tr('DSVの形式が正しくありません。'));return bytes;}
 const end=bytes.length-122;
 if(!matches(bytes,end,text)||end<=0||end>maxBytes)throw Error(tr('DSVの形式が正しくありません。'));
 const view=new DataView(bytes.buffer,bytes.byteOffset+bytes.length-40,24);
 const size=view.getUint32(0,true),padded=view.getUint32(4,true),version=view.getUint32(20,true);
 if(version!==0||padded!==end||size>padded||!size)throw Error(tr('DSVの形式が正しくありません。'));
 return bytes.slice(0,padded);
}
