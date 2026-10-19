// SPDX-License-Identifier: AGPL-3.0-or-later
// Conversion and ROM identification run off the UI thread. This worker never writes.
import {tr,setWorkerLanguage} from '../i18n/index.js';
import {sourceSave,readROMUpdateBackup} from '../library/rom-update.js';
import {coreFor} from '../core/core-registry.js';
import * as db from '../storage/storage.js';
import {identifyStartROM,migrateStartSave,inspectStartUpdate,detectStartSaveVersion} from './migration.js';
import {startVersionFromName} from './version.js';
import {START_MIGRATION_VERSION,canApplyStartMigration} from './compatibility.js';

async function readSource(id,previous){
 const game=await db.get('library',id);
 if(!game||game.system!=='gba'||coreFor(game).key!=='mgba')throw Error(tr('この変換はGBAのPokemonStart用です。mGBAコアを選択してください。'));
 if(!previous)return {...await sourceSave(id),sourceId:id,name:game.name};
 const record=await readROMUpdateBackup(game);
 if(record.system!=='gba'||record.coreKey!=='mgba')throw Error(tr('この変換はGBAのPokemonStart用です。mGBAコアを選択してください。'));
 return {game,sourceId:record.sourceId,name:record.sourceName,save:record.save,digest:record.save.hash};
}
// Return metadata only, so a full ROM buffer cannot remain in the conversion
// handler's scope while the asynchronous save migration runs.
async function readROMProfile(id){
 const rom=await db.get('roms',id);
 return {present:!!rom,identity:rom?identifyStartROM(rom instanceof Blob?new Uint8Array(await rom.arrayBuffer()):rom):null};
}
self.onmessage=async({data})=>{
 try{
  await setWorkerLanguage(data.language);
  const source=await readSource(data.id,data.previous),{save,digest,sourceId,name}=source;
  // Cache only the small profile within this request, never the ROM buffer.
  // Inspecting a current save against its own ROM needs one database read/scan.
  const profiles=new Map();
  const storedProfile=async id=>{
   if(!profiles.has(id)){
    profiles.set(id,await readROMProfile(id));
   }
   return profiles.get(id);
  };
  let targetProfile=data.targetProfile;
  if(data.targetId){const {present,identity}=await storedProfile(data.targetId);targetProfile=present?(identity||{version:null,unverified:true}):(targetProfile||{version:null,unverified:true});}
  if(data.action==='inspect'){
   const {identity}=await storedProfile(sourceId);
   const sourceGame=await db.get('library',sourceId);
   let savedVersion=null;try{savedVersion=detectStartSaveVersion(save.bytes);}catch{}
   const version=savedVersion||identity?.version||startVersionFromName(sourceGame?.filename,name);
   let compatibility={status:'unknown',from:version,to:typeof targetProfile==='string'?targetProfile:targetProfile?.version||START_MIGRATION_VERSION},validationError=null;
   if(version)try{compatibility=inspectStartUpdate(save.bytes,version,targetProfile).compatibility;}catch(error){validationError=error.message;}
   self.postMessage({type:'done',name,identity,version,compatibility,validationError,targetReady:canApplyStartMigration(targetProfile,version||undefined),hash:digest,at:save.at});return;
  }
  if(!['classify','convert'].includes(data.action))throw Error('Unknown START migration action');
  if(data.hash!==digest||data.at!==save.at)throw Error(tr('元のセーブが変わりました。内容を確認してやり直してください。'));
  const compatibility=inspectStartUpdate(save.bytes,data.from,targetProfile).compatibility;
  if(data.action==='classify'){self.postMessage({type:'done',compatibility,targetReady:canApplyStartMigration(targetProfile,data.from)});return;}
  if(compatibility.status==='downgrade')throw Error(tr('このセーブは更新先ROMより新しいため、引き継げません。元のデータは変更していません。'));
  if(!canApplyStartMigration(targetProfile,data.from))throw Error(tr('このROMへのセーブ変換には未対応です。元のデータは変更していません。'));
  if(compatibility.status==='compatible')throw Error(tr('このセーブは変換せずに引き継げます。'));
  if(compatibility.status==='unknown'&&data.allowUnverified!==true)throw Error(tr('変換の必要性が未確認です。内容を確認してください。'));
  const result=await migrateStartSave(save.bytes,{from:data.from,target:targetProfile,onProgress:({index,total})=>self.postMessage({type:'progress',index,total})});
  // Both buffers are private to this one-shot worker. Transfer them together;
  // database records are unaffected and no retry needs the detached snapshots.
  const original=save.bytes instanceof Uint8Array&&save.bytes.byteOffset===0&&save.bytes.byteLength===save.bytes.buffer.byteLength?save.bytes:new Uint8Array(save.bytes);
  self.postMessage({type:'done',name,bytes:result.bytes,original,report:result.report},[result.bytes.buffer,original.buffer]);
 }catch(error){self.postMessage({type:'error',message:error.message||tr('セーブを変換できませんでした。元のデータは残っています。')});}
};
