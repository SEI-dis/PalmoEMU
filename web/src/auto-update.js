// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from './i18n/index.js';
import {setupOffline} from './offline.js';
import {updateTasksPending} from './update-activity.js';

// Every app page holds a shared version lock. The waiting worker can take the
// exclusive lock only after every known page has agreed and frozen its UI.
export async function startAutoUpdates(canUpdate,onUpdated=()=>{},onDeferred=()=>{}){
 if(!navigator.serviceWorker||!navigator.locks||!isSecureContext)return;
 const name='local-play-version:'+new URL('../',import.meta.url).pathname;
 let releaseLease,lease,registration,prepared=null,lastInput=Date.now(),checking=false,lastCheck=0,indicatorTimer,reloading=false;
 let staging=null,deferred=null,stageTimer,updateCheck=null,launchCheck=false;
 const noticeKey='local-play-updated:'+new URL('../',import.meta.url).pathname;
 const pickers=new Set();
 const indicator=document.createElement('dialog');indicator.className='update-progress';
 indicator.innerHTML='<span class="update-spinner" aria-hidden="true"></span><div class="update-copy"><strong hidden></strong><span role="status"></span><button type="button" hidden></button></div>';
 const title=indicator.querySelector('strong'),status=indicator.querySelector('[role=status]'),continueButton=indicator.querySelector('button');
 title.textContent=tr('アプリの更新');continueButton.textContent=tr('今は続ける');
 continueButton.onclick=()=>closeStage(true);
 indicator.addEventListener('cancel',event=>{event.preventDefault();if(staging&&!prepared&&indicator.dataset.phase==='waiting')closeStage(true);});document.body.append(indicator);
 function acquire(){
  if(releaseLease)return Promise.resolve();
  return new Promise((resolve,reject)=>{lease=navigator.locks.request(name,{mode:'shared'},()=>new Promise(release=>{releaseLease=release;resolve();}));lease.catch(reject);});
 }
 function release(){releaseLease?.();releaseLease=null;}
 function freeze(label=tr('更新中…'),delay=0,{update=false,canContinue=false,phase='startup'}={}){
  clearTimeout(indicatorTimer);document.documentElement.dataset.updating='true';indicator.toggleAttribute('data-delayed',!!delay);
  title.hidden=!update;continueButton.hidden=!canContinue;indicator.dataset.phase=phase;
  indicator.setAttribute('aria-label',update?tr('アプリの更新'):label);status.textContent=label;if(!indicator.open)indicator.showModal();
  if(delay)indicatorTimer=setTimeout(()=>indicator.removeAttribute('data-delayed'),delay);
 }
 function unfreeze(){clearTimeout(indicatorTimer);indicator.close();indicator.removeAttribute('data-delayed');delete document.documentElement.dataset.updating;}
 function safe(){return navigator.onLine&&!updateTasksPending()&&!pickers.size&&canUpdate()&&![...document.querySelectorAll('dialog[open]')].some(dialog=>dialog!==indicator)&&!document.activeElement?.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=file]),textarea,select,[contenteditable="true"]');}
 function ready(){return !prepared&&!launchCheck&&registration?.waiting!==deferred&&(staging||Date.now()-lastInput>=2000)&&safe();}
 function candidate(){const worker=registration?.waiting||registration?.installing;return registration?.active&&worker&&!['redundant','activated'].includes(worker.state)?worker:null;}
 function closeStage(defer=false,notify=false){
  if(prepared)return;
  if(defer)deferred=staging;staging=null;clearTimeout(stageTimer);unfreeze();lastInput=Date.now();
  if(notify)onDeferred(tr('更新を完了できませんでした。現在のバージョンで続けられます。'));
 }
 function stageLabel(){return registration?.waiting===staging?tr('更新中…'):tr('ダウンロード中…');}
 function showStage(){
  freeze(stageLabel(),0,{update:true,phase:registration?.waiting===staging?'ready':'downloading'});
  clearTimeout(stageTimer);stageTimer=setTimeout(()=>closeStage(true,true),60000);
 }
 function refresh(){
  if(prepared||launchCheck)return;
  const worker=candidate();
  if(staging&&(!navigator.onLine||worker!==staging)){const failed=!navigator.onLine||staging.state==='redundant';closeStage(false,failed);}
  if(!staging&&worker!==deferred&&worker&&!document.hidden&&safe()){staging=worker;showStage();}
  if(staging&&registration?.waiting===staging&&indicator.dataset.phase==='downloading')showStage();
  void tryApply();
 }
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
 // Capture before the app's handlers. Download staging keeps its shared lock
 // and can be dismissed; only the two-phase prepare releases that lock.
 const inputs=['click','pointerdown','keydown','input','change','drop','submit'];
 for(const type of inputs)window.addEventListener(type,event=>{
  if(prepared||launchCheck||(staging&&!indicator.contains(event.target))){event.preventDefault();event.stopImmediatePropagation();return;}
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
  prepared=null;lastInput=Date.now();
  if(staging&&candidate()===staging&&navigator.onLine){showStage();freeze(tr('ほかのタブの操作が終わると更新します。'),0,{update:true,canContinue:true,phase:'waiting'});}
  else closeStage();
 }
 navigator.serviceWorker.addEventListener('message',event=>{
  const {type,token}=event.data||{},port=event.ports[0];
  if(!port||event.source!==registration?.waiting)return;
  if(type==='local-play-update-probe'){port.postMessage({ready:ready()});port.close();return;}
  if(type!=='local-play-update-prepare')return;
  if(!ready()){port.postMessage({ready:false});port.close();return;}
  prepared={token,port,controller:navigator.serviceWorker.controller,timer:null};clearTimeout(stageTimer);freeze(tr('更新中…'),0,{update:true,phase:'applying'});release();
  prepared.timer=setTimeout(()=>cancel(token).catch(()=>location.reload()),15000);
  port.onmessage=message=>{if(message.data?.type==='cancel')cancel(token).catch(()=>location.reload());};
  port.postMessage({ready:true});
 });
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(prepared)reloadUpdated();});
 async function tryApply(){
  const worker=registration?.waiting;if(!worker||checking||document.hidden||!ready())return;
  checking=true;const channel=new MessageChannel();
  const applied=await new Promise(resolve=>{const timer=setTimeout(()=>resolve(false),10000);channel.port1.onmessage=event=>{clearTimeout(timer);resolve(event.data?.applied===true);};try{worker.postMessage({type:'auto-update'},[channel.port2]);}catch{clearTimeout(timer);resolve(false);}});
  channel.port1.close();checking=false;
  if(!applied&&staging===worker&&!prepared)freeze(tr('ほかのタブの操作が終わると更新します。'),0,{update:true,canContinue:true,phase:'waiting'});
 }
 function check(force=false){
  if(updateCheck)return updateCheck;
  if(document.hidden||!navigator.onLine||(!force&&Date.now()-lastCheck<60000))return Promise.resolve();
  lastCheck=Date.now();
  updateCheck=Promise.resolve().then(()=>registration.update()).catch(()=>{}).finally(()=>{updateCheck=null;refresh();});
  return updateCheck;
 }
 function watch(){registration.installing?.addEventListener('statechange',refresh);refresh();}
 // A quick Play click shares the in-flight startup check, with an 800 ms cap.
 // Return before applying an update: the caller must release its task guard
 // and launch flag before the existing coordinator can prepare this page.
 async function beforeLaunch(){
  if(prepared||staging||launchCheck)return false;
  if(!navigator.onLine)return true;
  launchCheck=true;freeze(tr('準備中…'),300);let timer;
  try{await Promise.race([check(),new Promise(resolve=>{timer=setTimeout(resolve,800);})]);}
  finally{clearTimeout(timer);launchCheck=false;unfreeze();}
  const worker=candidate();return !worker||worker===deferred||!navigator.onLine;
 }
 registration.addEventListener('updatefound',watch);watch();
 setInterval(refresh,500);setInterval(check,300000);
 window.addEventListener('focus',()=>check());document.addEventListener('visibilitychange',()=>check());
 window.addEventListener('online',()=>check(true));
 window.addEventListener('offline',refresh);
 void check(true);
 return {beforeLaunch,refresh};
}
