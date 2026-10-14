// SPDX-License-Identifier: AGPL-3.0-or-later
// Original browser implementation; behavioral references: ManicEMU (Manic EMU,
// Max and contributors), Game.supportRewind / updateRewind, and
// RetroArch state_manager (Hans-Kristian Arntzen, Daniel De Matteis, Alfred
// Agrell). See SOURCES.json. No upstream runtime code or assets are copied.
import {tr} from '../i18n/index.js';
const MiB=1048576;
export const REWIND_LIMITS=Object.freeze({maxBytes:8*MiB,maxSeconds:10,intervalMs:500});
export function supportsRewind(system,coreKey='mgba'){
 return ['gb','gbc'].includes(system)?['mgba','jgenesis'].includes(coreKey):system==='gba'&&['mgba','vba-next'].includes(coreKey);
}
const thenable=value=>value&&typeof value.then==='function';

// Lifecycle contract: beforeRestore must pause input/emulation, block new
// persistent saves and await any existing save queue. afterRestore releases
// that lock. It may call pause() safely. dispose() must finish before core.close.
// frame() belongs in beforeFrame; snapshots never request screenshots or write
// storage. The cap covers retained snapshot data, not the core's transient
// serialization allocation. An oversized state disables recording once.
export function createRewind({core,system,coreKey='mgba',enabled=false,beforeRestore=()=>{},afterRestore=()=>{},onChange=()=>{},onError=()=>{},isBlocked=()=>false,maxBytes=REWIND_LIMITS.maxBytes,maxSeconds=REWIND_LIMITS.maxSeconds,intervalMs=REWIND_LIMITS.intervalMs}={}){
 const supported=supportsRewind(system,coreKey)&&['state','loadState','save','restore'].every(key=>typeof core?.[key]==='function');
 maxBytes=Math.max(1,Math.min(REWIND_LIMITS.maxBytes,Math.floor(Number(maxBytes)||REWIND_LIMITS.maxBytes)));
 maxSeconds=Math.max(.5,Math.min(REWIND_LIMITS.maxSeconds,Number(maxSeconds)||REWIND_LIMITS.maxSeconds));
 intervalMs=Math.max(100,Math.min(1000,Number(intervalMs)||REWIND_LIMITS.intervalMs));
 const maxCount=Math.ceil(maxSeconds*1000/intervalMs)+1;
 let records=[],bytes=0,timeline=0,lastSample=-Infinity,lastFrames=core?.frameCount?.()||0,lastClock=null;
 let active=!!enabled&&supported,paused=false,disposed=false,busy=false,epoch=0,reason='',captureTask=null,restoreTask=null;
 const status=()=>({supported,enabled:active,paused,busy,count:records.length,bytes,seconds:records.length?Math.max(0,(timeline-records[0].at)/1000):0,reason});
 // UI callbacks are observers; an exception in them must not damage emulation.
 const notify=()=>{try{onChange(status());}catch{}};
 const report=error=>{try{onError(error);}catch{}};
 const reset=()=>{epoch++;records=[];bytes=0;timeline=0;lastSample=-Infinity;lastFrames=core?.frameCount?.()||0;lastClock=null;};
 const fail=error=>{active=false;reason=error.message||tr('巻き戻しを停止しました。');reset();notify();report(error);};
 const blocked=()=>{try{return !!isBlocked();}catch{return true;}};
 const copy=(raw,optional=false)=>{
  if(optional&&(raw==null||raw.byteLength===0))return null;
  if(!(raw instanceof Uint8Array)||!raw.byteLength)throw Error(tr('巻き戻し用の状態を取得できませんでした。'));
  return raw;
 };
 function snapshot(){
  // All allowlisted adapters serialize synchronously on this JS thread. An
  // optional checkpoint is the only allowed asynchronous capture path: its
  // state/save pair must come from one worker transaction.
  const pack=value=>{
   if(value.stateError)throw Error(value.stateError);
   const state=copy(value.state),save=core.stateIncludesSave?null:copy(value.save,true);
   const size=state.byteLength+(save?.byteLength||0);
   // Reserve another whole snapshot for transactional restore/rollback. The
   // history and rollback together must fit, even with a growing flash save.
   if(size*2>maxBytes)throw Error(tr('巻き戻しの状態が安全に使えるメモリ上限（8 MiB）を超えるため、記録を停止しました。'));
   // Copy borrowed views too: a core may reuse its serialization buffer later.
   return {state:state.slice(),save:save?.slice()||null,size};
  };
  if(typeof core.checkpoint==='function'){
   const value=core.checkpoint();return thenable(value)?value.then(pack):pack(value);
  }
  const state=core.state(),save=core.stateIncludesSave?null:core.save();
  if(thenable(state)||thenable(save)){
   Promise.resolve(state).catch(()=>{});Promise.resolve(save).catch(()=>{});
   throw Error(tr('このコアでは巻き戻し用の状態を同時に取得できません。'));
  }
  return pack({state,save});
 }
 function dropFirst(){bytes-=records.shift().size;}
 function add(record,at){
  const reserve=()=>Math.max(record.size,...records.map(item=>item.size));
  while(records.length&&(bytes+record.size+reserve()>maxBytes||records.length>=maxCount||at-records[0].at>maxSeconds*1000))dropFirst();
  records.push({...record,at});bytes+=record.size;lastSample=at;notify();
 }
 function advance(now){
  const frames=core.frameCount?.();
  if(Number.isFinite(frames)){
   timeline+=Math.max(0,frames-lastFrames)*1000/(Number(core.fps)||60);lastFrames=frames;
  }else{if(lastClock!==null)timeline+=Math.max(0,now-lastClock);lastClock=now;}
 }
 function frame(now=performance.now()){
  if(!active||disposed||paused||busy||captureTask||core.paused||core.closed)return Promise.resolve(false);
  if(blocked()){reset();notify();return Promise.resolve(false);}
  advance(now);
  while(records.length&&timeline-records[0].at>maxSeconds*1000)dropFirst();
  if(timeline-lastSample+0.001<intervalMs)return Promise.resolve(false);
  const version=epoch,at=timeline;
  try{
   const captured=snapshot();
   if(!thenable(captured)){add(captured,at);return Promise.resolve(true);}
   captureTask=Promise.resolve(captured).then(record=>{
    if(disposed||version!==epoch||!active||blocked())return false;
    add(record,at);return true;
   }).catch(error=>{if(!disposed&&version===epoch)fail(error);return false;}).finally(()=>{captureTask=null;});
   return captureTask;
  }catch(error){fail(error);return Promise.resolve(false);}
 }
 async function apply(record){
  await core.loadState(record.state);
  // Importing battery RAM after an inclusive state would destroy flash-bank
  // state (and in jgenesis rebuild the whole machine). Match SaveProtection.
  if(record.save&&!core.stateIncludesSave)await core.restore(record.save);
 }
 function rewind(seconds=3){
  if(!active||!supported||disposed||busy||blocked())return Promise.resolve(false);
  busy=true;notify();
  const version=epoch;
  restoreTask=(async()=>{
   let entered=false,rollback=null,mutated=false,result=false,restoredSeconds=0,errorValue=null;
   try{
    await captureTask;
    if(disposed||version!==epoch||!active||blocked())return false;
    const target=timeline-Math.max(.1,Number(seconds)||3)*1000;
    // Choose the oldest available point inside the requested interval, never
    // silently rewind farther than the UI's "up to 3 seconds" promise.
    const record=records.find(item=>item.at>=target&&item.at<timeline);
    if(!record||timeline-record.at<1)return false;
    entered=true;await beforeRestore();
    if(disposed||version!==epoch||!active||blocked())return false;
    rollback=await snapshot();
    // Reserve space for the recovery copy inside the same RAM budget. Keep the
    // selected state even when it lies near the oldest edge of the ring.
    for(let i=0;bytes+rollback.size>maxBytes&&i<records.length;){
     if(records[i]===record){i++;continue;}bytes-=records[i].size;records.splice(i,1);
    }
    if(bytes+rollback.size>maxBytes)throw Error(tr('巻き戻しを安全に復元するためのメモリが足りません。'));
    mutated=true;await apply(record);
    restoredSeconds=(timeline-record.at)/1000;timeline=record.at;
    records=records.filter(item=>item.at<=record.at);bytes=records.reduce((sum,item)=>sum+item.size,0);
    lastSample=timeline;lastFrames=core.frameCount?.()||0;lastClock=null;result=true;
    return true;
   }catch(error){
    errorValue=error;
    if(mutated&&rollback){try{await apply(rollback);}catch(rollbackError){errorValue=new AggregateError([error,rollbackError],tr('巻き戻しの復元に失敗しました。ゲームを一時停止しました。'));errorValue.rewindFatal=true;}}
    fail(errorValue);return false;
   }finally{
    rollback=null;
    if(entered){try{await afterRestore({restored:result,seconds:restoredSeconds,error:errorValue,fatal:!!errorValue?.rewindFatal});}catch(error){fail(error);}}
    busy=false;restoreTask=null;notify();
   }
  })();
  return restoreTask;
 }
 return {
  get status(){return status();},frame,rewind,
  setEnabled(value){if(disposed)return;active=!!value&&supported;reason='';reset();notify();},
  // Do not wait for restoreTask here: before/afterRestore may call pause().
  pause(value=true){paused=!!value;lastClock=null;notify();return captureTask||Promise.resolve();},
  clear(){reset();notify();return captureTask||Promise.resolve();},
  async dispose(){disposed=true;active=false;reset();await captureTask;await restoreTask;notify();}
 };
}
