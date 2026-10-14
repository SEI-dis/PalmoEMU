// SPDX-License-Identifier: AGPL-3.0-or-later
import '../i18n/page.js';
import {tr} from '../i18n/index.js';
import {afterControllerActivation} from './controller-activation.js';
const status=document.querySelector('#update-status'),button=document.querySelector('#apply-update');let registration,applying=false,checking=false,failed=false;
const watched=new WeakSet();
function show(){
 const installing=registration?.installing?.state!=='redundant'&&registration?.installing,waiting=registration?.waiting?.state!=='redundant'&&registration?.waiting;
 button.disabled=applying||checking||!!installing||(!waiting&&!failed);if(applying)return;
 status.textContent=checking?tr('更新を確認中…'):installing?tr('ダウンロード中…'):waiting?tr('更新できます。'):failed?tr('更新できませんでした。接続を確認し、もう一度お試しください。'):registration?.active?tr('最新の状態です。'):tr('更新を確認中…');
}
function watch(){
 const worker=registration?.installing;if(worker&&!watched.has(worker)){watched.add(worker);worker.addEventListener('statechange',()=>{if(worker.state==='redundant')failed=true;show();});}show();
}
async function check(){
 if(checking||applying)return;checking=true;failed=false;show();
 try{
  if(!registration){registration=await navigator.serviceWorker.register(new URL('../../sw.js',import.meta.url),{scope:new URL('../../',import.meta.url).pathname,updateViaCache:'none'});registration.addEventListener('updatefound',watch);watch();}
  await registration.update();watch();
 }catch{failed=true;}
 finally{checking=false;show();}
}
await check();
let stopActivationWait;
navigator.serviceWorker?.addEventListener('controllerchange',()=>{if(applying&&!stopActivationWait)stopActivationWait=afterControllerActivation(()=>location.replace(new URL('../../index.html',import.meta.url)));});
button.onclick=()=>{if(applying||checking)return;if(!registration?.waiting){if(failed)void check();else show();return;}button.disabled=true;applying=true;const channel=new MessageChannel();const timeout=setTimeout(()=>{channel.port1.close();applying=false;button.disabled=!registration.waiting;status.textContent=tr('更新を確認できませんでした。もう一度お試しください。');},15000);channel.port1.onmessage=event=>{clearTimeout(timeout);channel.port1.close();if(event.data.error){applying=false;button.disabled=!registration.waiting;status.textContent=tr(event.data.error);}};registration.waiting.postMessage({type:'activate-update'},[channel.port2]);};
