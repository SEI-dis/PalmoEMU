// SPDX-License-Identifier: AGPL-3.0-or-later
// Recovery is available before loading a ROM. Never repair a failed hash by
// replacing it, and never pass a damaged save to an emulator for normalization.
import {tr} from '../i18n/index.js';
import {hash} from '../shared.js';
import {coreFor,saveKey,compatibleState} from '../core/core-registry.js';
import {guardUpdateTask} from '../updates/update-activity.js';
import * as db from './storage.js';
const plans=new WeakMap();
const sources=['backups','archives','recoveries'];
function bytesOf(value){
 if(value instanceof Uint8Array)return value;
 if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
 if(value instanceof ArrayBuffer)return new Uint8Array(value);
 if(Array.isArray(value)&&value.every(n=>Number.isInteger(n)&&n>=0&&n<=255))return new Uint8Array(value);
 return null;
}
function battery(record,paired=false){return paired?{bytes:record?.save,hash:record?.saveHash,at:record?.at,coreId:record?.coreId}:record;}
async function integrity(record,game){
 const bytes=bytesOf(record?.bytes),actual=bytes?.length?await hash(bytes):null;
 const usable=!!bytes?.length&&bytes.length<=coreFor(game).maxSave&&compatibleState(coreFor(game).id,record);
 return {bytes:bytes?.length||0,at:record?.at||0,actual,stored:record?.hash??null,status:!bytes?.length?'missing':!usable?'unsupported':!record.hash?'unverified':actual===record.hash?'valid':'damaged'};
}
const signature=value=>JSON.stringify([value.bytes,value.at,value.actual,value.stored,value.status]);
async function sourceRecord(game,source){
 if(source.store==='states'){
  if(typeof source.key!=='string'||!source.key.startsWith(saveKey(game)+':'))throw Error(tr('保存履歴を選び直してください。'));
  return battery(await db.get('states',source.key),true);
 }
 if(!sources.includes(source.store)||!Number.isInteger(source.index)||source.index<0)throw Error(tr('保存履歴を選び直してください。'));
 const list=await db.get(source.store,saveKey(game));return battery(list?.[source.index],source.store==='recoveries');
}
async function inspect(game){
 game=await db.get('library',game.id);if(!game)throw Error(tr('ゲームが見つかりません。'));
 const current=await integrity(await db.get('saves',saveKey(game)),game),entries=[];
 // One bounded history array at a time; discard state/image bytes immediately
 // after inspecting paired battery data. Plans retain metadata, never states.
 for(const store of sources){const list=await db.get(store,saveKey(game));if(!Array.isArray(list))continue;
  for(let index=0;index<list.length;index++){const row=await integrity(battery(list[index],store==='recoveries'),game);if(row.bytes)entries.push(Object.freeze({...row,store,index}));}
 }
 // Manual states can be large and numerous. Enumerate keys first, then load
 // one state at a time and retain only its battery integrity metadata.
 for(const key of await db.saveRescueStateKeys(saveKey(game))){const row=await integrity(battery(await db.get('states',key),true),game);if(row.bytes)entries.push(Object.freeze({...row,store:'states',key}));}
 const originals=await db.saveRescueOriginals(game.id,coreFor(game).key);
 const plan=Object.freeze({gameId:game.id,current:Object.freeze(current),entries:Object.freeze(entries),originals:Object.freeze(originals)});
 plans.set(plan,{game,current,entries});return plan;
}
async function fresh(plan){
 const detail=plans.get(plan);if(!detail)throw Error(tr('保存履歴を選び直してください。'));
 const game=await db.get('library',detail.game.id);
 if(!game||game.system!==detail.game.system||game.size!==detail.game.size||coreFor(game).key!==coreFor(detail.game).key)throw Error(tr('ゲームの設定が変わりました。保存履歴を開き直してください。'));
 return {...detail,game};
}
async function exportOriginal(plan,key){
 const {game}=await fresh(plan);let record;
 if(key){if(!plan.originals.some(item=>item.key===key))throw Error(tr('保存履歴を選び直してください。'));record=(await db.get('coverCatalogs',key))?.save;}
 else record=await db.get('saves',saveKey(game));
 const bytes=bytesOf(record?.bytes);if(!bytes?.length)throw Error(tr('保存されたゲーム内セーブがありません。'));
 // Intentional raw export: retain exactly what is stored, including damage.
 return {bytes:bytes.slice(),name:game.name+'-original-'+(record.at||Date.now())+'.'+coreFor(game).saveExtension};
}
async function restore(plan,index){
 const detail=await fresh(plan),source=detail.entries[index];if(!source||source.status!=='valid')throw Error(tr('整合性を確認できた保存履歴を選んでください。'));
 if(!navigator.locks)throw Error(tr('最新版のブラウザを使用してください。'));
 return navigator.locks.request('local-game:'+detail.game.id,{ifAvailable:true},async lock=>{
  if(!lock)throw Error(tr('このゲームはプレイ中です。終了してから操作してください。'));
  const {game}=await fresh(plan),original=await db.get('saves',saveKey(game)),current=await integrity(original,game);
  if(signature(current)!==signature(detail.current))throw Error(tr('現在のセーブが変わりました。保存履歴を開き直してください。'));
  const record=await sourceRecord(game,source),checked=await integrity(record,game);
  if(checked.status!=='valid'||signature(checked)!==signature(source))throw Error(tr('保存履歴が変わりました。開き直して選び直してください。'));
  await db.commitSaveRescue({game,original,source,record,save:{bytes:bytesOf(record.bytes).slice(),hash:checked.actual,at:Date.now(),coreId:coreFor(game).id,reason:'history-rescue'}});
  return game;
 });
}
// Running cores and history exports share the same fresh, verified selection.
// This reads only; the caller's existing save transaction owns any restoration.
async function readHistory(plan,index){
 const {game,entries}=await fresh(plan),source=entries[index];
 if(source?.status!=='valid')throw Error(tr('整合性を確認できた保存履歴を選んでください。'));
 const record=await sourceRecord(game,source),checked=await integrity(record,game);
 if(checked.status!=='valid'||signature(checked)!==signature(source))throw Error(tr('保存履歴が変わりました。開き直して選び直してください。'));
 return {bytes:bytesOf(record.bytes).slice(),name:game.name+'-backup-'+record.at+'.'+coreFor(game).saveExtension};
}
export const inspectSaveRescue=guardUpdateTask(inspect),exportRescueOriginal=guardUpdateTask(exportOriginal),restoreSaveHistory=guardUpdateTask(restore),readSaveHistory=guardUpdateTask(readHistory);
