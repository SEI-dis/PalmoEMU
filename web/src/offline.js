// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from './i18n/index.js';
import {development3DS} from './development.js';
let registration;
export function setupOffline(){
 if(development3DS||!('serviceWorker' in navigator)||!isSecureContext)return Promise.resolve(null);
 registration??=(async()=>{
  const base=new URL('../',import.meta.url),scope=base.pathname,existing=await navigator.serviceWorker.getRegistration(scope);
  // An installed offline app need not wait for a registration network check.
  // The update manager performs its own bounded launch-time check.
  if(existing?.active&&existing.scope===base.href)return existing;
  await navigator.serviceWorker.register(new URL('../sw.js',import.meta.url),{scope,updateViaCache:'none'});return navigator.serviceWorker.ready;
 })();return registration;
}
export async function offlineStatus(download=false,onProgress=()=>{}){const reg=await setupOffline();if(!reg)throw new Error(tr('この環境ではオフライン保存を使えません。対応ブラウザでHTTPSのサイトを開いてください。'));return new Promise((resolve,reject)=>{const channel=new MessageChannel();let timer;const reset=()=>{clearTimeout(timer);timer=setTimeout(()=>{channel.port1.close();reject(new Error(tr('保存が時間内に終わりませんでした。もう一度お試しください。')));},60000);};reset();channel.port1.onmessage=e=>{reset();if(e.data.done){clearTimeout(timer);channel.port1.close();e.data.error?reject(new Error(tr(e.data.error))):resolve(e.data);}else onProgress(e.data);};reg.active.postMessage({type:download?'download':'status'},[channel.port2]);});}
