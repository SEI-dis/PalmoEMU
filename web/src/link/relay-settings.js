// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
export const CELIO_RELAY_ORIGIN='wss://celio-server.up.railway.app';
export const CELIO_SOCKET_PATH='/socket.io/?EIO=4&transport=websocket';
export const CELIO_RELAY=CELIO_RELAY_ORIGIN+CELIO_SOCKET_PATH;
export const relayPreferenceKey='palmo-celio-relay';

// A server setting is an origin, never an arbitrary WebSocket path/query. Do
// not accept URL parser repairs (backslashes, whitespace, credentials, dot
// segments, numeric host shorthands), or silently strip meaningful input.
export function relayOrigin(value){
  const fail=()=>{throw Error(tr('中継サーバーは wss:// で始まるホスト名を入力してください。'));};
  if(typeof value!=='string'||!value||value.length>300||/[\s\\%#@]/.test(value))return fail();
  let url;try{url=new URL(value);}catch{return fail();}
  if(url.protocol!=='wss:'||url.username||url.password||url.hash||url.search||url.port==='0'||!['','/'].includes(url.pathname))return fail();
  const host=url.hostname;
  if(host.length>253||!host.includes('.')||host.endsWith('.')||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||/^\d+(\.\d+)*$/.test(host)||host.includes(':')||!host.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))return fail();
  // Verify the original authority too: new URL() normalizes paths and hosts.
  if(!/^wss:\/\/[a-z0-9.-]+(?::\d{1,5})?\/?$/i.test(value))return fail();
  return url.origin;
}
export function relayURL(value){return relayOrigin(value)+CELIO_SOCKET_PATH;}
export function readRelayOrigin(storage){
  try{return relayOrigin((storage??globalThis.localStorage).getItem(relayPreferenceKey)||CELIO_RELAY_ORIGIN);}catch{return CELIO_RELAY_ORIGIN;}
}
export function saveRelayOrigin(value,storage){
  const origin=relayOrigin(value);
  try{storage??=globalThis.localStorage;if(origin===CELIO_RELAY_ORIGIN)storage.removeItem(relayPreferenceKey);else storage.setItem(relayPreferenceKey,origin);}
  catch{throw Error(tr('中継サーバーの設定を保存できませんでした。'));}
  return origin;
}
export function validateRelayURL(value,{loopback=false}={}){
  // Local protocol fixtures remain possible without permitting plaintext on
  // deployed pages. A user-entered setting never goes through this exception.
  if(loopback&&typeof value==='string'&&/^ws:\/\/127\.0\.0\.1:\d{1,5}\/socket\.io\/\?EIO=4&transport=websocket$/.test(value)){
    try{if(new URL(value).port)return value;}catch{}
  }
  if(typeof value!=='string'||!value.endsWith(CELIO_SOCKET_PATH))throw Error(tr('対応していない中継サーバーです。'));
  return relayURL(value.slice(0,-CELIO_SOCKET_PATH.length));
}
