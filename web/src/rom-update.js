// SPDX-License-Identifier: AGPL-3.0-or-later
// Copy only battery saves between ROM versions. Format/size validation cannot
// prove compatibility of the game's own data. Old ROMs and states stay intact.
import {tr} from './i18n/index.js';
import {coreFor,saveKey,supportsGame} from './core-registry.js';
import {hash} from './shared.js';
import * as db from './storage.js';

async function sourceSave(id){
 const game=await db.get('library',id);if(!game)throw Error(tr('元のゲームが見つかりません。'));
 const core=coreFor(game),save=await db.get('saves',saveKey(game));
 if(!save?.bytes?.length)throw Error(tr('先に元のゲームでセーブしてください。ステートは引き継げません。'));
 const bytes=new Uint8Array(save.bytes);if(bytes.length>core.maxSave)throw Error(tr('元のセーブの容量が対応範囲を超えています。'));
 const digest=await hash(bytes);if(save.hash&&save.hash!==digest)throw Error(tr('元のセーブを確認できませんでした。引き継ぎを中止します。'));
 return {game,save:{...save,bytes,hash:digest},digest};
}
export async function prepareROMUpdate(sourceId,target){
 const {game,save,digest}=await sourceSave(sourceId),core=coreFor(game);
 if(target.id===game.id)throw Error(tr('同じROMです。更新するファイルを選んでください。'));
 if(target.system!==game.system)throw Error(tr('元のゲームと同じ機種のROMを選んでください。'));
 if(!supportsGame(core,target))throw Error(tr('現在のコアは新版のROM容量に対応していません。'));
 return {sourceId:game.id,sourceName:game.name,sourceCore:core.key,sourceHash:digest,sourceAt:save.at,targetId:target.id,targetSize:target.size};
}
// Called inside the import worker after it has re-hashed the selected file.
export async function finishROMUpdate(plan,game,rom){
 if(!plan||game.id!==plan.targetId||game.size!==plan.targetSize)throw Error(tr('選択したROMが変わりました。やり直してください。'));
 if(!navigator.locks)throw Error(tr('保存を保護するため、最新版のブラウザを使用してください。'));
 const ids=[plan.sourceId,game.id].sort();
 const next=i=>i===ids.length?commit():navigator.locks.request('local-game:'+ids[i],{ifAvailable:true},lock=>{if(!lock)throw Error(tr('対象のゲームはプレイ中です。終了してから引き継いでください。'));return next(i+1);});
 async function commit(){
  const {game:source,save,digest}=await sourceSave(plan.sourceId);
  if(coreFor(source).key!==plan.sourceCore||digest!==plan.sourceHash||save.at!==plan.sourceAt)throw Error(tr('元のセーブまたはコアが変わりました。内容を確認してやり直してください。'));
  if(source.id===game.id||source.system!==game.system||!supportsGame(coreFor(source),game))throw Error(tr('更新するROMを確認してください。'));
  return db.commitROMUpdate({source,game,rom,save});
 }
 return next(0);
}
export async function readROMUpdateBackup(game){
 const record=await db.get('coverCatalogs',db.romUpdateMetadataPrefix+game.id);
 if(!record?.save?.bytes?.length)throw Error(tr('更新前のセーブが見つかりません。'));
 if(await hash(record.save.bytes)!==record.save.hash)throw Error(tr('更新前のセーブを確認できませんでした。'));
 return record;
}
