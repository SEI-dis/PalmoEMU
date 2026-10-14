// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
import {setupOffline} from './offline.js';
import {updateTasksPending} from './update-activity.js';
import {afterControllerActivation} from './controller-activation.js';

// Every app page holds a shared version lock. The waiting worker can take the
// exclusive lock only after every known page has agreed and frozen its UI.
export async function startAutoUpdates(canUpdate,onUpdated=()=>{},onDeferred=()=>{},{beforeReload=()=>{},onContinue=()=>{}}={}){
 if(!navigator.serviceWorker||!navigator.locks||!isSecureContext)return;
 const name='local-play-version:'+new URL('../../',import.meta.url).pathname;
 let releaseLease,lease,registration,prepared=null,lastInput=Date.now(),checking=false,lastCheck=0,indicatorTimer,reloading=false;
 let staging=null,deferred=false,stageTimer,updateCheck=null,launchCheck=false,failed=false,missingCandidateAt=null,restorePending=false;
 const noticeKey='local-play-updated:'+new URL('../../',import.meta.url).pathname;
 const pickers=new Set();
 const indicator=document.createElement('dialog');indicator.className='update-progress';
 indicator.innerHTML='<span class="update-spinner" aria-hidden="true"></span><div class="update-copy"><strong hidden></strong><span role="status"></span><a class="primary update-manual" hidden></a><button type="button" hidden></button></div>';
 const title=indicator.querySelector('strong'),status=indicator.querySelector('[role=status]'),continueButton=indicator.querySelector('button'),manual=indicator.querySelector('a');
 manual.textContent=tr('手動で更新');manual.href=new URL('../../update.html',import.meta.url).href;
 manual.onclick=event=>{if(updateTasksPending()||pickers.size||!canUpdate()){event.preventDefault();closeStage(true);}else beforeReload();};
 title.textContent=tr('アプリの更新');continueButton.textContent=tr('今は続ける');
 continueButton.onclick=()=>closeStage(true);
 indicator.addEventListener('cancel',event=>{event.preventDefault();if(!prepared&&!continueButton.hidden)closeStage(true);});document.body.append(indicator);
 function acquire(){
  if(releaseLease)return Promise.resolve();
  return new Promise((resolve,reject)=>{lease=navigator.locks.request(name,{mode:'shared'},()=>new Promise(release=>{releaseLease=release;resolve();}));lease.catch(reject);});
 }
 function release(){releaseLease?.();releaseLease=null;}
 function freeze(label=tr('更新中…'),delay=0,{update=false,canContinue=false,phase='startup'}={}){
  clearTimeout(indicatorTimer);document.documentElement.dataset.updating='true';indicator.toggleAttribute('data-delayed',!!delay);
  title.hidden=!update;continueButton.hidden=!canContinue;continueButton.textContent=phase==='failed'?tr('あとで'):tr('今は続ける');manual.hidden=phase!=='failed';indicator.dataset.phase=phase;
  indicator.setAttribute('aria-label',update?tr('アプリの更新'):label);status.textContent=label;if(!indicator.open)indicator.showModal();
  if(delay)indicatorTimer=setTimeout(()=>indicator.removeAttribute('data-delayed'),delay);
 }
 function unfreeze(){clearTimeout(indicatorTimer);indicator.close();indicator.removeAttribute('data-delayed');delete document.documentElement.dataset.updating;}
 function safe(){return navigator.onLine&&!updateTasksPending()&&!pickers.size&&canUpdate()&&![...document.querySelectorAll('dialog[open]')].some(dialog=>dialog!==indicator)&&!document.activeElement?.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=file]),textarea,select,[contenteditable="true"]');}
 function ready(){return !prepared&&!failed&&!launchCheck&&!deferred&&(staging||Date.now()-lastInput>=2000)&&safe();}
 function candidate(){return registration?.active?[registration.waiting,registration.installing].find(worker=>worker&&!['redundant','activated'].includes(worker.state))||null:null;}
 function closeStage(defer=false){
  if(prepared)return;
  // Respect Continue for this visit, including a replacement worker whose
  // registration attributes have not reached this page yet. Reload retries.
  if(defer)deferred=true;staging=null;failed=false;missingCandidateAt=null;clearTimeout(stageTimer);unfreeze();lastInput=Date.now();
  if(defer)setTimeout(onContinue,0);
 }
 function showFailure(reason){
  const detail={name:reason==='offline'?'NetworkError':'Error',reason,phase:indicator.dataset.phase,worker:staging?.state,online:navigator.onLine};
  closeStage();failed=true;freeze(tr('更新できませんでした。'),0,{update:true,canContinue:true,phase:'failed'});onDeferred(detail);
 }
 function stageLabel(){return registration?.waiting===staging?tr('準備中…'):tr('ダウンロード中…');}
 function showStage(){
  freeze(stageLabel(),0,{update:true,phase:registration?.waiting===staging?'ready':'downloading'});
  // A slow download or another busy tab is not an installation failure.
  // Let the user leave a long wait, but keep applying automatically if they stay.
  clearTimeout(stageTimer);stageTimer=setTimeout(()=>{if(staging&&!prepared)continueButton.hidden=false;},60000);
 }
 function refresh(){
  if(prepared||launchCheck)return;
  // A failed attempt is not a permanent opt-out. The browser may finish or
  // retry installation after reconnecting or on the next update check.
  // Only the user's Continue/Later choice defers updates for this visit.
  if(failed){
   if(deferred||document.hidden||!safe()||!candidate())return;
   failed=false;
  }
  // A restored page may need a new worker/build, but gameplay, unsaved clips
  // and in-flight file operations still own their in-memory state.
  if(restorePending){if(!document.hidden&&safe()){restorePending=false;beforeReload();location.reload();}return;}
  const worker=candidate();
  // Registration attributes and worker state are delivered in separate tasks.
  // Retain the version lease and recheck before declaring a missing successor.
  if(navigator.onLine&&staging?.state==='redundant'&&!worker){missingCandidateAt??=performance.now();if(performance.now()-missingCandidateAt<750)return;}
  else missingCandidateAt=null;
  if(staging&&(!navigator.onLine||worker!==staging)){
   // A newer candidate can replace a waiting worker. Continue with it instead
   // of reporting the superseded worker as a failed installation.
   const reason=!navigator.onLine?'offline':staging.state==='redundant'&&!worker?'worker-redundant':null;
   if(reason){showFailure(reason);return;}closeStage();
  }
  if(!staging&&!deferred&&worker&&!document.hidden&&safe()){staging=worker;showStage();}
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
  afterControllerActivation(()=>{
   try{sessionStorage.setItem(noticeKey,JSON.stringify({from:build,at:Date.now()}));}catch{}
   beforeReload();
   location.reload();
  });
 }
 // Capture before the app's handlers. Download staging keeps its shared lock
 // and can be dismissed; only the two-phase prepare releases that lock.
 const inputs=['click','pointerdown','keydown','input','change','drop','submit'];
 for(const type of inputs)window.addEventListener(type,event=>{
  if(prepared||launchCheck||((staging||failed)&&!indicator.contains(event.target))){event.preventDefault();event.stopImmediatePropagation();return;}
  lastInput=Date.now();
  // Some native file pickers return without firing change or cancel. A new
  // gesture in this page proves the native picker has closed; focus alone does
  // not, since some browsers keep focus while their picker remains open.
  if(pickers.size&&['pointerdown','keydown'].includes(type))pickers.clear();
  if(event.target?.matches?.('input[type=file]')){if(type==='click')pickers.add(event.target);if(type==='change')pickers.delete(event.target);}
 },{capture:true});
 window.addEventListener('cancel',event=>{if(event.target?.matches?.('input[type=file]'))pickers.delete(event.target);},{capture:true});
 window.addEventListener('pageshow',event=>{if(event.persisted){restorePending=true;refresh();}});
 async function cancel(token){
  if(prepared?.token!==token)return;
  // Once skipWaiting has been requested, the page must remain prepared until
  // the new controller arrives. Resuming now could start a game on old code.
  if(prepared.committed||prepared.cancelling)return;
  const old=prepared;old.cancelling=true;clearTimeout(old.timer);old.port.close();old.worker.removeEventListener('statechange',old.checkWorker);
  await acquire();
  if(navigator.serviceWorker.controller!==old.controller||old.controller?.state==='redundant'){reloadUpdated();return;}
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
  const worker=event.source,checkWorker=()=>{if(prepared?.token===token&&prepared.committed&&worker.state==='redundant')reloadUpdated();};
  prepared={token,port,worker,checkWorker,controller:navigator.serviceWorker.controller,timer:null};worker.addEventListener('statechange',checkWorker);clearTimeout(stageTimer);freeze(tr('更新中…'),0,{update:true,phase:'applying'});
  prepared.timer=setTimeout(()=>cancel(token).catch(()=>location.reload()),15000);
  port.onmessage=message=>{if(prepared?.token!==token)return;if(message.data?.type==='commit'){prepared.committed=true;clearTimeout(prepared.timer);checkWorker();}else if(message.data?.type==='abort'){prepared.committed=false;cancel(token).catch(()=>location.reload());}else if(message.data?.type==='cancel')cancel(token).catch(()=>location.reload());};
  const preparing=prepared,releasedLease=lease;release();
  // Resolving the callback is not confirmation that the browser released its
  // shared lock. Reply only after the LockManager request has completed.
  void(async()=>{
   try{
    await releasedLease;
    if(prepared!==preparing||preparing.cancelling||registration.waiting!==worker||worker.state==='redundant'){
     try{port.postMessage({ready:false});}catch{}
     await cancel(token);return;
    }
    port.postMessage({ready:true});
   }catch{
    try{port.postMessage({ready:false});}catch{}
    try{await cancel(token);}catch{location.reload();}
   }
  })();
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
  if(prepared||staging||failed||launchCheck||restorePending)return false;
  if(!navigator.onLine||deferred)return true;
  launchCheck=true;freeze(tr('準備中…'),300);let timer;
  try{await Promise.race([check(),new Promise(resolve=>{timer=setTimeout(resolve,800);})]);}
  finally{clearTimeout(timer);launchCheck=false;unfreeze();}
  const worker=candidate();return !worker||deferred||!navigator.onLine;
 }
 registration.addEventListener('updatefound',watch);watch();
 setInterval(refresh,500);setInterval(check,300000);
 window.addEventListener('focus',()=>check());document.addEventListener('visibilitychange',()=>check());
 window.addEventListener('online',()=>check(true));
 window.addEventListener('offline',refresh);
 void check(true);
 return {beforeLaunch,refresh};
}
