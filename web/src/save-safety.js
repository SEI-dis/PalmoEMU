// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from './i18n/index.js';
import * as db from './storage.js';
import {saveKey,coreFor,compatibleState} from './core-registry.js';
import {hash} from './shared.js';
export class SaveProtection {
 constructor(onStatus){this.onStatus=onStatus;this.queue=Promise.resolve();this.stateAt=0;}
 async open(game,coreId){
  if(!navigator.locks)throw new Error(tr('このブラウザは保存に必要な機能に対応していません。最新版を使用してください。'));
  await new Promise((resolve,reject)=>{
   this.lockTask=navigator.locks.request('local-game:'+game.id,{ifAvailable:true},async lock=>{
    if(!lock){reject(new Error(tr('このゲームは別のタブで開いています。そちらを終了してから開いてください。')));return;}
    await new Promise(done=>{this.release=done;resolve();});
   });this.lockTask.catch(reject);
  });
  try{
   const fresh=await db.get('library',game.id);if(fresh&&coreFor(fresh).key!==coreFor(game).key)throw Error(tr('コア設定が変更されました。ゲームを開き直してください。'));
   this.game=game;this.storageKey=saveKey(game);this.coreId=coreId;this.id=crypto.randomUUID();this.stateAt=0;
   const previous=await db.get('sessions',this.storageKey);
   const recoveries=await db.get('recoveries',this.storageKey)||[];
   await db.put('sessions',this.storageKey,{id:this.id,dirty:true,startedAt:Date.now(),coreId});
   const save=await db.get('saves',this.storageKey);
   this.status={at:save?.at||0,stateAt:recoveries[0]?.at||0};this.onStatus(this.status);
   return {save,interrupted:!!previous?.dirty,recoveries};
  }catch(e){this.release?.();this.release=null;await this.lockTask?.catch(()=>{});this.lockTask=null;throw e;}
 }
 save(core,{checkpoint=false,clean=false,reason='auto'}={}){
  const game=this.game,session=this.id,coreId=this.coreId,storageKey=this.storageKey;
  const next=this.queue.catch(()=>{}).then(async()=>{
   if(!game||this.id!==session)return;
   this.onStatus({...this.status,busy:true});
   try{
    const captured=checkpoint&&core.checkpoint?await core.checkpoint():null;
    const raw=captured?captured.save:await core.save(),bytes=raw?.length?new Uint8Array(raw):null,at=Date.now();
    let state=null,stateError=null;
    if(checkpoint){try{if(captured?.stateError)throw Error(captured.stateError);state=new Uint8Array(captured?captured.state:await core.state());if(!state.length)throw new Error(tr('中断状態を取得できませんでした。'));}catch(e){stateError=e;}}
    const save=bytes?{bytes,at,hash:await hash(bytes),coreId,reason}:null;
    let recovery=null;
    if(state){let image;try{image=core.screenshot?.();}catch{}recovery={bytes:state,hash:await hash(state),save:bytes,saveHash:save?.hash||null,at,coreId,sessionId:session,image};}
    await db.commitProtection(storageKey,session,save,recovery,clean&&!stateError);
    if(recovery)this.stateAt=at;
    this.status={at:save?at:this.status?.at||0,stateAt:recovery?at:this.status?.stateAt||0};
    if(stateError)throw new Error(tr('ゲーム内セーブは保存しましたが、中断状態の保存に失敗しました：')+stateError.message);
    this.onStatus(this.status);
    return {save,recovery};
   }catch(e){this.onStatus({...this.status,error:e.name==='QuotaExceededError'?tr('容量不足で保存できません。セーブを書き出してください。'):e.message});throw e;}
  });this.queue=next;return next;
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
 async close(){
  await this.queue.catch(()=>{});this.release?.();this.release=null;this.id=null;this.game=null;
  // Resolving the callback only requests release. Wait for Web Locks to finish
  // releasing it before allowing an awaited close/open cycle to continue.
  await this.lockTask?.catch(()=>{});this.lockTask=null;
 }
}
