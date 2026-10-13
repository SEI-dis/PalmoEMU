// SPDX-License-Identifier: AGPL-3.0-or-later
// Conversion and ROM identification run off the UI thread. This worker never writes.
import {tr,setWorkerLanguage} from './i18n/index.js';
import {sourceSave,readROMUpdateBackup} from './rom-update.js';
import {coreFor} from './core-registry.js';
import * as db from './storage.js';
import {identifyStartROM,migrateStartSave,inspectStartUpdate,detectStartSaveVersion} from './start-save-migration.js';
import {startVersionFromName} from './start-save-version.js';
import {START_MIGRATION_VERSION,canApplyStartMigration} from './start-save-compatibility.js';

async function readSource(id,previous){
 const game=await db.get('library',id);
 if(!game||game.system!=='gba'||coreFor(game).key!=='mgba')throw Error(tr('この変換はGBAのPokemonStart用です。mGBAコアを選択してください。'));
 if(!previous)return {...await sourceSave(id),sourceId:id,name:game.name};
 const record=await readROMUpdateBackup(game);
 if(record.system!=='gba'||record.coreKey!=='mgba')throw Error(tr('この変換はGBAのPokemonStart用です。mGBAコアを選択してください。'));
 return {game,sourceId:record.sourceId,name:record.sourceName,save:record.save,digest:record.save.hash};
}
self.onmessage=async({data})=>{
 try{
  await setWorkerLanguage(data.language);
  const source=await readSource(data.id,data.previous),{save,digest,sourceId,name}=source;
  let targetProfile=data.targetProfile||START_MIGRATION_VERSION;
  if(data.targetId){const targetROM=await db.get('roms',data.targetId);targetProfile=(targetROM?identifyStartROM(targetROM instanceof Blob?new Uint8Array(await targetROM.arrayBuffer()):targetROM):null)||{version:null,unverified:true};}
  if(data.action==='inspect'){
   const rom=await db.get('roms',sourceId),bytes=rom instanceof Blob?new Uint8Array(await rom.arrayBuffer()):rom;
   const identity=bytes?identifyStartROM(bytes):null;
   const sourceGame=await db.get('library',sourceId);
   let savedVersion=null;try{savedVersion=detectStartSaveVersion(save.bytes);}catch{}
   const version=savedVersion||identity?.version||startVersionFromName(sourceGame?.filename,name);
   let compatibility={status:'unknown',from:version,to:typeof targetProfile==='string'?targetProfile:targetProfile.version},validationError=null;
   if(version)try{compatibility=inspectStartUpdate(save.bytes,version,targetProfile).compatibility;}catch(error){validationError=error.message;}
   self.postMessage({type:'done',name,identity,version,compatibility,validationError,targetReady:canApplyStartMigration(targetProfile),hash:digest,at:save.at});return;
  }
  if(!['classify','convert'].includes(data.action))throw Error('Unknown START migration action');
  if(data.hash!==digest||data.at!==save.at)throw Error(tr('元のセーブが変わりました。内容を確認してやり直してください。'));
  const compatibility=inspectStartUpdate(save.bytes,data.from,targetProfile).compatibility;
  if(data.action==='classify'){self.postMessage({type:'done',compatibility});return;}
  if(!canApplyStartMigration(targetProfile))throw Error(tr('このROMへのセーブ変換には未対応です。元のデータは変更していません。'));
  if(compatibility.status==='compatible')throw Error(tr('このセーブは変換せずに引き継げます。'));
  if(compatibility.status==='unknown'&&data.allowUnverified!==true)throw Error(tr('変換の必要性が未確認です。内容を確認してください。'));
  const result=await migrateStartSave(save.bytes,{from:data.from,onProgress:({index,total})=>self.postMessage({type:'progress',index,total})});
  self.postMessage({type:'done',name,bytes:result.bytes,original:new Uint8Array(save.bytes),report:result.report});
 }catch(error){self.postMessage({type:'error',message:error.message||tr('セーブを変換できませんでした。元のデータは残っています。')});}
};
