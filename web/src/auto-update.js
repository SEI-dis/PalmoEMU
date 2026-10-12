// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from './i18n/index.js';
import {setupOffline} from './offline.js';
import {updateTasksPending} from './update-activity.js';

// Every app page holds a shared version lock. The waiting worker can take the
// exclusive lock only after every known page has agreed and frozen its UI.
export async function startAutoUpdates(canUpdate,onUpdated=()=>{}){
 if(!navigator.serviceWorker||!navigator.locks||!isSecureContext)return;
 const name='local-play-version:'+new URL('../',import.meta.url).pathname;
 let releaseLease,lease,registration,prepared=null,lastInput=Date.now(),checking=false,lastCheck=0,indicatorTimer,reloading=false;
 const noticeKey='local-play-updated:'+new URL('../',import.meta.url).pathname;
 const pickers=new Set();
 const indicator=document.createElement('dialog');indicator.className='update-progress';
 indicator.innerHTML='<span class="update-spinner" aria-hidden="true"></span><span role="status"></span>';
 indicator.addEventListener('cancel',event=>event.preventDefault());document.body.append(indicator);
 function acquire(){
  if(releaseLease)return Promise.resolve();
  return new Promise((resolve,reject)=>{lease=navigator.locks.request(name,{mode:'shared'},()=>new Promise(release=>{releaseLease=release;resolve();}));lease.catch(reject);});
 }
 function release(){releaseLease?.();releaseLease=null;}
 function freeze(label=tr('更新中…'),delay=0){
  clearTimeout(indicatorTimer);document.documentElement.dataset.updating='true';indicator.toggleAttribute('data-delayed',!!delay);
  indicator.setAttribute('aria-label',label);indicator.lastElementChild.textContent=label;if(!indicator.open)indicator.showModal();
  if(delay)indicatorTimer=setTimeout(()=>indicator.removeAttribute('data-delayed'),delay);
 }
 function unfreeze(){clearTimeout(indicatorTimer);indicator.close();indicator.removeAttribute('data-delayed');delete document.documentElement.dataset.updating;}
 function ready(){return navigator.onLine&&!prepared&&!updateTasksPending()&&!pickers.size&&Date.now()-lastInput>=2000&&canUpdate()&&!document.querySelector('dialog[open]')&&!document.activeElement?.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=file]),textarea,select,[contenteditable="true"]');}
 // Keep startup modal protection, but avoid flashing a notice for a fast start.
 freeze(tr('準備中…'),300);
 try{await acquire();}catch{unfreeze();return;}
 let registrationTimer;
 try{registration=await Promise.race([setupOffline(),new Promise(resolve=>{registrationTimer=setTimeout(()=>resolve(null),5000);})]);}
 catch{unfreeze();return;}
 finally{clearTimeout(registrationTimer);}
 if(!registration){unfreeze();return;}
 // A new tab can finish loading old HTML while activation is in progress.
 // Check the HTML build after acquiring the lock, before enabling any actions.
 const build=document.querySelector('meta[name=app-build]')?.content;
 const currentBuild=await new Promise(resolve=>{
  const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve(null);},3000);
  channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data?.version);};
  registration?.active?.postMessage({type:'app-version'},[channel.port2]);
 });
 if(build&&currentBuild&&build!==currentBuild){release();location.reload();return false;}
 unfreeze();
 try{
  const notice=JSON.parse(sessionStorage.getItem(noticeKey));sessionStorage.removeItem(noticeKey);
  if(build&&build===currentBuild&&notice?.from!==build&&Date.now()-notice?.at>=0&&Date.now()-notice.at<300000)onUpdated();
 }catch{/* Notification storage must never block offline startup. */}
 if(!build||!currentBuild)return; // Unknown/older versions stay on the manual path.
 function reloadUpdated(){
  if(reloading)return;reloading=true;
  try{sessionStorage.setItem(noticeKey,JSON.stringify({from:build,at:Date.now()}));}catch{}
  location.reload();
 }
 // Capture before the app's handlers so a prepared page cannot start new work.
 const inputs=['click','pointerdown','keydown','input','change','drop','submit'];
 for(const type of inputs)window.addEventListener(type,event=>{
  if(prepared){event.preventDefault();event.stopImmediatePropagation();return;}
  lastInput=Date.now();
  if(event.target?.matches?.('input[type=file]')){if(type==='click')pickers.add(event.target);if(type==='change')pickers.delete(event.target);}
 },{capture:true});
 window.addEventListener('cancel',event=>{if(event.target?.matches?.('input[type=file]'))pickers.delete(event.target);},{capture:true});
 window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
 async function cancel(token){
  if(prepared?.token!==token)return;
  const old=prepared;clearTimeout(old.timer);old.port.close();
  await acquire();
  if(navigator.serviceWorker.controller!==old.controller){reloadUpdated();return;}
  prepared=null;lastInput=Date.now();unfreeze();
 }
 navigator.serviceWorker.addEventListener('message',event=>{
  const {type,token}=event.data||{},port=event.ports[0];
  if(!port||event.source!==registration?.waiting)return;
  if(type==='local-play-update-probe'){port.postMessage({ready:ready()});port.close();return;}
  if(type!=='local-play-update-prepare')return;
  if(!ready()){port.postMessage({ready:false});port.close();return;}
  prepared={token,port,controller:navigator.serviceWorker.controller,timer:null};freeze();release();
  prepared.timer=setTimeout(()=>cancel(token).catch(()=>location.reload()),15000);
  port.onmessage=message=>{if(message.data?.type==='cancel')cancel(token).catch(()=>location.reload());};
  port.postMessage({ready:true});
 });
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(prepared)reloadUpdated();});
 async function tryApply(){
  const worker=registration?.waiting;if(!worker||checking||document.hidden||!ready())return;
  checking=true;const channel=new MessageChannel();
  await new Promise(resolve=>{const timer=setTimeout(resolve,10000);channel.port1.onmessage=()=>{clearTimeout(timer);resolve();};worker.postMessage({type:'auto-update'},[channel.port2]);});
  channel.port1.close();checking=false;
 }
 async function check(force=false){
  if(document.hidden||!navigator.onLine||(!force&&Date.now()-lastCheck<60000))return;
  lastCheck=Date.now();try{await registration?.update();}catch{/* Keep the current offline version. */}
  tryApply();
 }
 registration.addEventListener('updatefound',()=>{registration.installing?.addEventListener('statechange',tryApply);});
 setInterval(tryApply,3000);setInterval(check,300000);
 window.addEventListener('focus',()=>check());document.addEventListener('visibilitychange',()=>check());
 window.addEventListener('online',()=>check(true));
 tryApply();
}
