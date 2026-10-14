// SPDX-License-Identifier: AGPL-3.0-or-later
// Keep large history clones off the rendering thread. The existing storage
// transaction and record format remain the authority for every save.
import * as db from './storage.js';
import {tr,language} from '../i18n/index.js';
import {guardUpdateTask} from '../updates/update-activity.js';

function snapshotBytes(entry){
 const buffers=new Set();let bytes=0;
 for(const value of [entry.save?.bytes,entry.recovery?.bytes,entry.recovery?.save]){
  const buffer=ArrayBuffer.isView(value)?value.buffer:value;
  if(buffer&&!buffers.has(buffer)){buffers.add(buffer);bytes+=buffer.byteLength||buffer.length||0;}
 }
 return bytes+(typeof entry.recovery?.image==='string'?entry.recovery.image.length*2:0);
}
const unavailable=()=>new Error(tr('保存が中断されました。以前の保存データは残っています。'));

// Time spent hidden or suspended must not turn a healthy write into an unknown
// outcome. Give it a fresh bounded interval after returning to the foreground.
function foregroundTimeout(callback,ms,visibility,lifecycle){
 let timer=null,disposed=false,armed=0;
 const clear=()=>{clearTimeout(timer);timer=null;};
 function arm(){
  clear();if(disposed||visibility?.hidden)return;
  armed=performance.now();timer=setTimeout(()=>{
   if(visibility?.hidden)return arm();
   if(performance.now()-armed>ms+Math.max(1000,ms*.25))return arm();
   callback();
  },ms);
 }
 visibility?.addEventListener('visibilitychange',arm);
 visibility?.addEventListener('resume',arm);
 lifecycle?.addEventListener('pageshow',arm);
 arm();
 return()=>{disposed=true;clear();visibility?.removeEventListener('visibilitychange',arm);visibility?.removeEventListener('resume',arm);lifecycle?.removeEventListener('pageshow',arm);};
}

export function createSaveWriter({useWorker=true,createWorker=()=>new Worker(new URL('./save-worker.js',import.meta.url),{type:'module'}),readyTimeoutMs=5000,timeoutMs=30000,visibility=globalThis.document,lifecycle=globalThis.window}={}){
 let worker=null,ready=false,mainOnly=!useWorker,closing=false,pending=null,serial=0,queue=Promise.resolve(),closed;
 const retired=new Map();
 function stop(){
  ready=false;const old=worker;worker=null;
  if(old){old.onmessage=old.onerror=old.onmessageerror=null;old.terminate();}
 }
 function settle(error){
  const task=pending;if(!task)return;pending=null;task.cancelTimer();
  if(error)task.reject(error);else task.resolve();
 }
 function transportFailure(error=unavailable()){
  const sent=pending?.kind==='commit';
  if(sent){
   const {id,sessionId}=pending.identity;
   if(!retired.has(id))retired.set(id,new Set());retired.get(id).add(sessionId);
   error.saveOutcomeUnknown=true;
  }
  mainOnly=true;stop();
  settle(error);
 }
 function receive(source,data){
  if(worker!==source||!pending)return;
  const task=pending;
  // A duplicate acknowledgment from an older completed job cannot acknowledge
  // or fail a newer snapshot. Unknown/future IDs are a broken transport.
  if(data?.version===1&&Number.isSafeInteger(data.id)&&data.id>=0&&data.id<task.id)return;
  if(!data||data.version!==1||data.id!==task.id)return transportFailure();
  if(task.kind==='init'){
   if(data.type==='ready'){ready=true;settle();}
   else transportFailure();
  }else if(data.type==='done')settle();
  else if(data.type==='error'&&data.outcome==='not-committed'&&typeof data.name==='string'&&typeof data.message==='string'){
   const error=new Error(data.message);error.name=data.name;error.saveOutcomeUnknown=false;settle(error);
  }else transportFailure();
 }
 function request(kind,id,message){
  return new Promise((resolve,reject)=>{
   pending={kind,id,resolve,reject,identity:message.entry?{id:message.entry.id,sessionId:message.entry.sessionId}:null,cancelTimer:foregroundTimeout(()=>transportFailure(),kind==='init'?readyTimeoutMs:timeoutMs,visibility,lifecycle)};
   try{worker.postMessage(message);}catch(error){
    // A synchronous clone/post failure did not dispatch this entry. Do not
    // retry it automatically, but no session fence is required for this job.
    mainOnly=true;stop();error.saveOutcomeUnknown=false;settle(error);
   }
  });
 }
 async function prepare(){
  if(ready)return true;if(mainOnly)return false;
  try{
   const source=createWorker();worker=source;
   source.onmessage=event=>receive(source,event.data);
   source.onerror=event=>{event.preventDefault?.();if(worker===source)transportFailure();};
   source.onmessageerror=()=>{if(worker===source)transportFailure();};
   await request('init',0,{version:1,type:'init',id:0,language});
   return true;
  }catch{mainOnly=true;stop();return false;}
 }
 const commit=guardUpdateTask(entry=>{
  if(closing)return Promise.reject(unavailable());
  const next=queue.catch(()=>{}).then(async()=>{
   // Even a caller that queued multiple writes must fence an uncertain session
   // before another snapshot can reach storage. Never replay old queued work.
   if(retired.get(entry.id)?.has(entry.sessionId)){
    const error=unavailable();error.saveOutcomeUnknown=true;error.saveSessionRetired=true;throw error;
   }
   if(mainOnly||snapshotBytes(entry)<1048576||!await prepare())return db.commitProtectionBatch([entry]);
   await request('commit',++serial,{version:1,type:'commit',id:serial,entry,language});
  });
  queue=next;return next;
 });
 return {commit,close(){
  if(!closed){closing=true;closed=queue.catch(()=>{}).then(()=>{stop();});}
  return closed;
 }};
}
