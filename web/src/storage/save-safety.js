// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
import * as db from './storage.js';
import {saveKey,coreFor,compatibleState} from '../core/core-registry.js';
import {hash} from '../shared.js';
import {assertHistoryRecord} from './save-history.js';
import {createSaveWriter} from './save-writer.js';
import {guardUpdateTask} from '../updates/update-activity.js';
const AUTO_SAVE_MS=120000,MAX_RETRY_MS=600000;
const retryDelay=failures=>Math.min(MAX_RETRY_MS,AUTO_SAVE_MS*2**Math.min(3,failures-1));
const interrupted=()=>new Error(tr('保存が中断されました。以前の保存データは残っています。'));
export class SaveProtection {
 constructor(onStatus,{useWorker=true,clock=()=>performance.now()}={}){this.onStatus=onStatus;this.useWorker=useWorker;this.clock=clock;this.lastClock=0;this.pendingSaves=0;this.queue=Promise.resolve();this.stateAt=0;this.openGeneration=0;this.accepting=false;}
 now(){let value;try{value=this.clock();}catch{}if(Number.isFinite(value)&&value>=0)this.lastClock=Math.max(this.lastClock,Math.min(value,Number.MAX_SAFE_INTEGER-MAX_RETRY_MS));return this.lastClock;}
 deferAutomatic(error,checkpoint,recovery){
  const now=this.now();
  this.autoFailures=error&&!error.saveCommitted?Math.min(4,this.autoFailures+1):0;
  this.nextAutoAt=now+(this.autoFailures?retryDelay(this.autoFailures):AUTO_SAVE_MS);
  if(recovery){this.stateFailures=0;this.nextStateAt=now+AUTO_SAVE_MS;}
  else if(checkpoint&&error){this.stateFailures=Math.min(4,this.stateFailures+1);this.nextStateAt=now+retryDelay(this.stateFailures);}
 }
 async open(game,coreId){
  if(this.opening||this.game||this.closeTask)throw interrupted();
  if(!navigator.locks)throw new Error(tr('このブラウザは保存に必要な機能に対応していません。最新版を使用してください。'));
  this.opening=true;let finishOpening;this.openingTask=new Promise(resolve=>{finishOpening=resolve;});
  try{
  await new Promise((resolve,reject)=>{
   this.lockTask=navigator.locks.request('local-game:'+game.id,{ifAvailable:true},async lock=>{
    if(!lock){reject(new Error(tr('このゲームは別のタブで開いています。そちらを終了してから開いてください。')));return;}
    await new Promise(done=>{this.release=done;resolve();});
   });this.lockTask.catch(reject);
  });
   const fresh=await db.get('library',game.id);if(fresh&&coreFor(fresh).key!==coreFor(game).key)throw Error(tr('コア設定が変更されました。ゲームを開き直してください。'));
   if(fresh?.romMissing)throw Error(tr('ROMが取り外されています。同じROMを追加してください。'));
   this.game=game;this.storageKey=saveKey(game);this.coreId=coreId;this.id=crypto.randomUUID();this.stateAt=0;
   const previous=await db.get('sessions',this.storageKey);
   const recoveries=await db.get('recoveries',this.storageKey)||[];
   await db.put('sessions',this.storageKey,{id:this.id,dirty:true,startedAt:Date.now(),coreId});
   const save=await db.get('saves',this.storageKey);
   this.writer=createSaveWriter({useWorker:this.useWorker});this.openGeneration++;this.accepting=!this.closeTask;
   this.autoFailures=this.stateFailures=0;this.nextAutoAt=this.nextStateAt=this.now()+AUTO_SAVE_MS;
   this.status={at:save?.at||0,stateAt:recoveries[0]?.at||0};this.onStatus(this.status);
   return {save,interrupted:!!previous?.dirty,recoveries};
  }catch(e){this.accepting=false;await this.writer?.close();this.writer=null;this.release?.();this.release=null;await this.lockTask?.catch(()=>{});this.lockTask=null;this.game=null;this.id=null;throw e;}
  finally{this.opening=false;finishOpening();this.openingTask=null;}
 }
 beginFence(sessionId){
  if(this.fence)return;
  const fence={sessionId};
  // A failed fencing attempt must keep updates blocked even after the save's
  // promise rejects. Only a completed transaction releases this activity hold.
  fence.activity=guardUpdateTask(()=>new Promise(resolve=>{fence.releaseActivity=resolve;}))();
  this.fence=fence;
 }
 async resolveFence(){
  const fence=this.fence;if(!fence)return;
  const nextId=await db.rotateSaveSession(this.storageKey,fence.sessionId);
  this.id=nextId;this.fence=null;fence.releaseActivity();
 }
 save(core,{checkpoint=false,clean=false,reason='auto',resetRecovery=false,automatic=false}={}){
  if(!this.accepting||!this.game)return Promise.reject(interrupted());
  // The app polls cheaply; capture/serialize only when due, and never queue
  // another automatic snapshot behind a save that is still in progress.
  if(automatic){const now=this.now();if(this.pendingSaves||now<this.nextAutoAt)return Promise.resolve({skipped:true});checkpoint=checkpoint&&now>=this.nextStateAt;}
  this.pendingSaves++;
  const generation=this.openGeneration,coreId=this.coreId,storageKey=this.storageKey;
  const next=guardUpdateTask(()=>this.queue.catch(()=>{}).then(async()=>{
   if(this.openGeneration!==generation)throw interrupted();
   this.onStatus({...this.status,busy:true});
   try{
    // Obtain the current owner only after any earlier ambiguous commit has
    // been fenced. Already queued saves remain valid within this open session.
    await this.resolveFence();const session=this.id;
    const captured=checkpoint&&core.checkpoint?await core.checkpoint():null;
    const raw=captured?captured.save:await core.save(),bytes=raw?.length?new Uint8Array(raw):null,at=Date.now();
    let state=null,stateError=null;
    if(checkpoint){try{if(captured?.stateError)throw Error(captured.stateError);state=new Uint8Array(captured?captured.state:await core.state());if(!state.length)throw new Error(tr('中断状態を取得できませんでした。'));}catch(e){stateError=e;}}
    const save=bytes?{bytes,at,hash:await hash(bytes),coreId,reason}:null;
    if(resetRecovery&&!save)throw new Error(tr('保存データがありません。'));
    let recovery=null;
    if(state){let image;try{image=core.screenshot?.();}catch{}recovery={bytes:state,hash:await hash(state),save:bytes,saveHash:save?.hash||null,at,coreId,sessionId:session,image};}
    // An unsupported oversized checkpoint must not block the game's ordinary
    // battery save, nor replace a previously usable recovery record.
    if(recovery){try{assertHistoryRecord(recovery);}catch(e){stateError=e;recovery=null;}}
    try{
     try{await this.writer.commit({id:storageKey,sessionId:session,save,recovery,clean:clean&&!stateError,resetRecovery});}
     catch(error){
      // An acknowledged quota abort committed nothing. Retry only the same
      // captured battery data, keeping existing recovery/history generations.
      // Uncertain transport outcomes must still be fenced, never replayed.
      if(error.name!=='QuotaExceededError'||error.saveOutcomeUnknown||!recovery||!save)throw error;
      await this.writer.commit({id:storageKey,sessionId:session,save,recovery:null,clean:false,resetRecovery});
      stateError=error;recovery=null;
     }
    }
    catch(error){
     if(error.saveOutcomeUnknown){
      this.beginFence(session);
      try{await this.resolveFence();}catch(fenceError){error.fenceError=fenceError;}
     }
     // Never resend an ambiguous snapshot: it may already have committed.
     throw error;
    }
    if(recovery)this.stateAt=at;else if(resetRecovery)this.stateAt=0;
    this.status={at:save?at:this.status?.at||0,stateAt:recovery?at:resetRecovery?0:this.status?.stateAt||0};
    if(stateError){
     if(!save)throw stateError;
     const partial=new Error(tr('ゲーム内セーブは保存しましたが、中断状態の保存に失敗しました：')+stateError.message,{cause:stateError});
     partial.name=stateError.name||'Error';partial.saveCommitted=true;throw partial;
    }
    this.deferAutomatic(null,checkpoint,recovery);
    this.onStatus(this.status);
    return {save,recovery};
   }catch(e){this.deferAutomatic(e,checkpoint,null);this.onStatus({...this.status,error:e.name==='QuotaExceededError'&&!e.saveCommitted?tr('容量不足で保存できません。セーブを書き出してください。'):e.message});throw e;}
  }))().finally(()=>{this.pendingSaves--;});this.queue=next;return next;
 }
 async verify(record){if(!record?.bytes?.length)throw new Error(tr('保存データがありません。'));if(record.hash&&await hash(new Uint8Array(record.bytes))!==record.hash)throw new Error(tr('保存データに破損が見つかりました。別のバックアップを選んでください。'));return new Uint8Array(record.bytes);}
 compatible(record){return compatibleState(this.coreId,record);}
 async restoreState(core,record){
  if(!this.compatible(record))throw new Error(tr('このステートは現在のコアで読み込めません。ゲーム内セーブから再開してください。'));
  const bytes=await this.verify(record);
  if(record.save&&record.saveHash&&await hash(new Uint8Array(record.save))!==record.saveHash)throw new Error(tr('復旧用のセーブに破損が見つかりました。'));
  await core.loadState(bytes);if(record.save?.length&&!core.stateIncludesSave)await core.restore(new Uint8Array(record.save));
  await core.restorePreview?.(record.image);
 }
 close(){
  if(this.closeTask)return this.closeTask;
  this.accepting=false;
  const task=guardUpdateTask(async()=>{
  await this.openingTask;this.accepting=false;
  await this.queue.catch(()=>{});
  // A rejection alone never authorizes releasing an unresolved old writer.
  // If this retry fails, retain the game, session, lock and activity hold.
  await this.resolveFence();await this.writer?.close();this.writer=null;
  this.release?.();this.release=null;this.id=null;this.game=null;this.openGeneration++;
  // Resolving the callback only requests release. Wait for Web Locks to finish
  // releasing it before allowing an awaited close/open cycle to continue.
  await this.lockTask?.catch(()=>{});this.lockTask=null;
  this.queue=Promise.resolve();
  })();
  this.closeTask=task.finally(()=>{this.closeTask=null;});return this.closeTask;
 }
}
