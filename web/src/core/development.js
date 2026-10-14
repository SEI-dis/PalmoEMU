// SPDX-License-Identifier: AGPL-3.0-or-later
export const development3DS=globalThis.__LOCAL_PLAY_DEV_3DS__===true&&
 typeof location!=='undefined'&&['127.0.0.1','localhost','[::1]'].includes(location.hostname);
export const dualScreen=system=>system==='nds'||system==='3ds';
// Bounded-memory content identity. This is an internal chunked ID, not a ROM SHA-256.
export async function largeFileIdentity(file){
 const chunk=8*1048576,hashes=[];
 for(let offset=0;offset<file.size;offset+=chunk){
  const data=await file.slice(offset,offset+chunk).arrayBuffer();
  hashes.push(new Uint8Array(await crypto.subtle.digest('SHA-256',data)));
 }
 const all=new Uint8Array(8+hashes.length*32);new DataView(all.buffer).setBigUint64(0,BigInt(file.size),true);
 hashes.forEach((h,i)=>all.set(h,8+i*32));
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',all));
 return '3ds-v1-'+Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
}
