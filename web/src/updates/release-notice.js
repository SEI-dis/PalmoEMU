// SPDX-License-Identifier: AGPL-3.0-or-later
// Release text is generated from release-notes.json with the installed HTML.
// Keep only the acknowledged app version; never read or transmit game data.
import {tr,localizeDocument} from '../i18n/index.js';
import {updateTasksPending} from './update-activity.js';

const scope=new URL('../../',import.meta.url).pathname;
const key='palmo-release-seen:'+scope;
const valid=value=>typeof value==='string'&&/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(value);
function compare(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2];}

export function createReleaseNotice({sheet,closeSheet,onClose,canShow}){
 let legacy=false,memory=null,version,template,pending=false,trying=false,timer;
 // Capture before startup writes defaults, including on the first visit.
 try{legacy=localStorage.getItem('manic-settings')!==null;}catch{}
 function seen(){
  let value=memory;
  for(const name of ['localStorage','sessionStorage'])try{
   const stored=globalThis[name].getItem(key);
   if(valid(stored)&&(!value||compare(stored,value)>0))value=stored;
  }catch{/* Storage denial must not prevent starting the app. */}
  return value;
 }
 function remember(){
  const previous=seen();memory=previous&&compare(previous,version)>0?previous:version;
  for(const name of ['localStorage','sessionStorage'])try{globalThis[name].setItem(key,memory);}catch{}
 }
 function stop(){pending=false;clearInterval(timer);window.removeEventListener('storage',retry);document.removeEventListener('visibilitychange',retry);}
 function safe(){return !document.hidden&&canShow()&&!updateTasksPending()&&!document.querySelector('dialog[open]')&&!document.activeElement?.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]),textarea,select,[contenteditable="true"]');}
 async function show(){
  const previous=seen();if(previous&&compare(previous,version)>=0){stop();return;}
  if(!pending||!safe())return;
  const content=template.content.cloneNode(true);localizeDocument(content);
  await new Promise(resolve=>{
   sheet(tr('更新しました'),'');
   const dialog=document.querySelector('#sheet'),body=document.querySelector('#sheet-body');
   dialog.classList.add('release-notice');body.replaceChildren(content);
   const done=document.createElement('button');done.id='release-notice-done';done.className='primary wide-button';done.textContent=tr('閉じる');body.append(done);
   onClose(()=>{remember();stop();dialog.classList.remove('release-notice');resolve();});
   done.onclick=()=>closeSheet({dismiss:true});
   body.querySelector('#release-notice-details').addEventListener('click',()=>closeSheet({dismiss:true}));
   done.focus({preventScroll:true});
  });
 }
 async function attempt(){
  if(!pending||trying||!safe())return;
  trying=true;
  try{
   if(navigator.locks)await navigator.locks.request('palmo-release-notice:'+scope,{ifAvailable:true},lock=>lock?show():undefined);
   else await show();
  }catch{/* The completion notice must never block access to local saves. */}
  finally{trying=false;}
 }
 function retry(){void attempt();}
 return {
  async start({updated=false,existing=false}={}){
   template=document.querySelector('#latest-update-notes');version=template?.dataset.version;
   if(!valid(version)||version!==document.querySelector('meta[name=app-version]')?.content||!template.content.querySelector('li')||!template.content.querySelector('#release-notice-details'))return;
   const previous=seen();
   if(previous&&compare(previous,version)>=0)return;
   if(!previous&&!legacy&&!updated&&!existing){remember();return;}
   pending=true;timer=setInterval(retry,500);window.addEventListener('storage',retry);document.addEventListener('visibilitychange',retry);
   await attempt();
  }
 };
}
