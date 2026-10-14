// SPDX-License-Identifier: AGPL-3.0-or-later
// Copy only battery saves between ROM versions. Format/size validation cannot
// prove compatibility of the game's own data. Old ROMs and states stay intact.
import {tr} from './i18n/index.js';
import {coreFor,saveKey,supportsGame} from './core-registry.js';
import {hash} from './shared.js';
import * as db from './storage.js';
import {isStartName} from './start-save/version.js';

export async function sourceSave(id){
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
export async function finishROMUpdate(plan,game,rom,onProgress){
 if(!plan||game.id!==plan.targetId||game.size!==plan.targetSize)throw Error(tr('選択したROMが変わりました。やり直してください。'));
 if(!navigator.locks)throw Error(tr('保存を保護するため、最新版のブラウザを使用してください。'));
 const ids=[plan.sourceId,game.id].sort();
 const next=i=>i===ids.length?commit():navigator.locks.request('local-game:'+ids[i],{ifAvailable:true},lock=>{if(!lock)throw Error(tr('対象のゲームはプレイ中です。終了してから引き継いでください。'));return next(i+1);});
 async function commit(){
  const {game:source,save,digest}=await sourceSave(plan.sourceId);
  if(coreFor(source).key!==plan.sourceCore||digest!==plan.sourceHash||save.at!==plan.sourceAt)throw Error(tr('元のセーブまたはコアが変わりました。内容を確認してやり直してください。'));
  if(source.id===game.id||source.system!==game.system||!supportsGame(coreFor(source),game))throw Error(tr('更新するROMを確認してください。'));
  let targetSave=save,migration;
  if(source.system==='gba'&&coreFor(source).key==='mgba'){
   const {identifyStartROM,migrateStartSave,inspectStartUpdate,START_MIGRATION_VERSION}=await import('./start-save/migration.js');
   const {canApplyStartMigration}=await import('./start-save/compatibility.js'),target=identifyStartROM(rom);
   const operation=plan.startCopy||plan.startMigration;
   // Recheck the actual selected bytes at commit time. A stale/generic UI must
   // not bypass migration by sending a plain copy plan for PokemonStart.
   if(target||operation||isStartName(source.filename,source.name,game.filename,game.name)){
    if(!target||!operation||!!plan.startCopy===!!plan.startMigration)throw Error(tr('セーブの互換性を確認できませんでした。内容を確認してやり直してください。'));
    const compatibility=inspectStartUpdate(save.bytes,operation.from,target);
    const status=compatibility.compatibility.status;
    if(plan.startCopy){
     if(status!=='compatible'&&!(status==='unknown'&&operation.allowUnverified===true&&canApplyStartMigration(target)))throw Error(tr('セーブの互換性を確認できませんでした。内容を確認してやり直してください。'));
    }else{
     if(!canApplyStartMigration(target))throw Error(tr('このROMへのセーブ変換には未対応です。元のデータは変更していません。'));
     if(status==='compatible')throw Error(tr('このセーブは変換せずに引き継げます。'));
     if(status==='unknown'&&operation.allowUnverified!==true)throw Error(tr('変換の必要性が未確認です。内容を確認してください。'));
     const converted=await migrateStartSave(save.bytes,{from:operation.from,onProgress});
     targetSave={bytes:converted.bytes,hash:await hash(converted.bytes),at:Date.now()};
     migration={kind:'start',from:operation.from,to:target.version,...(target.version!==START_MIGRATION_VERSION?{via:START_MIGRATION_VERSION}:{})};
    }
   }
  }else if(plan.startCopy||plan.startMigration){
   throw Error(tr('この変換はGBAのPokemonStart用です。mGBAコアを選択してください。'));
  }
  return db.commitROMUpdate({source,game,rom,save,targetSave,migration});
 }
 return next(0);
}
export async function readROMUpdateBackup(game){
 const record=await db.get('coverCatalogs',db.romUpdateMetadataPrefix+game.id);
 if(!record?.save?.bytes?.length)throw Error(tr('更新前のセーブが見つかりません。'));
 if(await hash(record.save.bytes)!==record.save.hash)throw Error(tr('更新前のセーブを確認できませんでした。'));
 return record;
}
