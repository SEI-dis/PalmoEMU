// SPDX-License-Identifier: AGPL-3.0-or-later
// Original portable Web backup. Design references: ManicEMU FilesSyncPolicy,
// FilesSyncRecord / FilesSyncManager (Daiuno, 2026), and Delta Sync documentation.
// Explicit exclusions, batched commits and retained prior versions; no cloud API.
import {tr} from '../i18n/index.js';
import * as db from './storage.js';
import {hash} from '../shared.js';
import {coreRegistry,compatibleState,supportsGame} from '../core/core-registry.js';
import {sanitizeGamePreferences} from '../library/game-preferences.js';
import {sanitizeInputControls} from '../input/input-controls.js';
import {playRecord,validTrainerAvatar} from '../library/trainer-profile.js';
import {retainHistory,assertHistoryRecord} from './save-history.js';
import {gameOptionGroups,gameShortcuts} from '../components/manic-ui.js';
import {guardUpdateTask} from '../updates/update-activity.js';

export const backupLimits=Object.freeze({file:192*1048576,bytes:128*1048576,games:1000,records:10000});
const format='PalmoEMU-save-backup',version=2,settingsKey='manic-settings',pendingKey=db.backupMetadataPrefix+'pending';
const dataStores=['saves','states','backups','archives','recoveries','rom-updates'],gameFields=['id','system','size','preferences','coreKey','cheats','coreCheats','controlLayout','category','favorite','added','lastPlayed','updatedAt','playDuration','romUpdate'];
const validId=id=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id),validHash=validId;
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const fail=message=>{throw Error(message||tr('バックアップの形式が正しくありません。'));};
// Private UI context only: never add ROM names/identities to Error.message,
// stack, cause or enumerable fields that might reach diagnostic records.
const failureGames=new WeakMap();
const recordGame=record=>typeof record?.key==='string'?record.key.split(/[@:]/,1)[0]:null;
function gameFailure(error,id){
 if(error&&typeof error==='object'&&validId(id)&&!failureGames.has(error))failureGames.set(error,{id});
 return error;
}
function checkGame(id,check){try{return check();}catch(error){throw gameFailure(error,id);}}
const backupTask=task=>guardUpdateTask(async(...args)=>{
 try{return await task(...args);}catch(error){
  const target=error&&typeof error==='object'&&failureGames.get(error);
  if(target){try{const game=await db.get('library',target.id);target.name=typeof game?.name==='string'?game.name.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,120):'';}catch{/* Keep the identifier when local metadata cannot be read. */}}
  throw error;
 }
});
export function backupErrorMessage(error,message=error?.message||tr('バックアップ操作に失敗しました。')){
 const target=error&&typeof error==='object'&&failureGames.get(error);
 if(!target)return message;
 // Full identity disambiguates same-named games, including matching prefixes.
 const label=target.name?tr`「${target.name}」（${target.id}）`:tr`ゲーム ${target.id}`;
 return tr`${label}：${message}`;
}
const keys=(value,allowed)=>{if(!plain(value)||Object.keys(value).some(key=>!allowed.includes(key)))fail();};
function canonical(value){let nodes=0;function sort(x,depth=0){if(depth>12||++nodes>65536)fail(tr('設定データが複雑すぎます。'));return Array.isArray(x)?x.map(v=>sort(v,depth+1)):plain(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k],depth+1)])):x;}return JSON.stringify(sort(value));}
const strict=(value,clean)=>{if(canonical(value)!==canonical(clean))fail(tr('未対応または不正な設定が含まれています。'));return clean;};
const validTime=n=>Number.isSafeInteger(n)&&n>=0&&n<=8640000000000000;
function checkFileSize(text){if(text.length>backupLimits.file||new Blob([text]).size>backupLimits.file)fail(tr('バックアップファイルは192 MiBまでです。'));}
function layout(value){
 if(!plain(value))return {};const result={};
 for(const direction of ['portrait','landscape'])if(plain(value[direction])){
  const entries={};for(const [id,item] of Object.entries(value[direction]).slice(0,64)){
   if(!/^(?:screen(?:-(?:main|sub))?|dpad|[abclrxysz]+(?:\+[abclrxysz]+)*|start|select|quick-save|quick-load|player-menu|player-camera|boost)$/.test(id)||!plain(item))continue;
   const clean={};for(const key of ['x','y','opacity','scale'])if(Number.isFinite(item[key])&&item[key]>=0&&item[key]<=(key==='scale'?2:1))clean[key]=item[key];
   entries[id]=clean;
  }result[direction]=entries;
 }return result;
}
export function sanitizeBackupSettings(value){
 const result=sanitizeGamePreferences(value);if(!plain(value))return result;
 if(['dark','light','auto'].includes(value.theme))result.theme=value.theme;
 for(const key of ['autosave','recovery','quickStart','keepScreenAwake','measurePerformance'])if(typeof value[key]==='boolean')result[key]=value[key];
 if(value.inputControls)result.inputControls=sanitizeInputControls(value.inputControls);
 if(plain(value.controlLayouts))result.controlLayouts=Object.fromEntries(Object.keys(coreRegistry).filter(s=>plain(value.controlLayouts[s])).map(s=>[s,layout(value.controlLayouts[s])]));
 if(Array.isArray(value.menuOrder)){const allowed=new Set(gameOptionGroups.flat());result.menuOrder=value.menuOrder.filter(Array.isArray).slice(0,32).map(g=>[...new Set(g.filter(id=>allowed.has(id)))].slice(0,64));}
 if(Array.isArray(value.gameShortcuts))result.gameShortcuts=[...new Set(value.gameShortcuts.filter(id=>gameShortcuts.some(([key])=>id===key)))];
 return result;
}
function cheats(value){
 if(!Array.isArray(value)||value.length>100)fail(tr('チート設定が正しくありません。'));
 return value.map(item=>{keys(item,['name','code','type','enabled']);if(typeof item.name!=='string'||item.name.length>120||typeof item.code!=='string'||item.code.length>16384||!Number.isInteger(item.type)||item.type<0||item.type>4||typeof item.enabled!=='boolean')fail(tr('チート設定が正しくありません。'));return {...item};});
}
function cleanGame(game,importing=false){return checkGame(game?.id,()=>validateGame(game,importing));}
function validateGame(game,importing=false){
 if(importing)keys(game,gameFields);
 if(!validId(game.id)||!Object.hasOwn(coreRegistry,game.system)||!Number.isSafeInteger(game.size)||game.size<1)fail(tr('ゲームの識別情報が正しくありません。'));
 const result={id:game.id,system:game.system,size:game.size};
 // New exports explicitly retain empty/false values. Missing fields on an old
 // import stay absent so restore can preserve the current library metadata.
 if(Object.hasOwn(game,'category')){if(!['','playing','completed','backlog'].includes(game.category))fail(tr('ゲームの分類が正しくありません。'));result.category=game.category;}else if(!importing)result.category='';
 if(Object.hasOwn(game,'favorite')){if(typeof game.favorite!=='boolean')fail(tr('お気に入り設定が正しくありません。'));result.favorite=game.favorite;}else if(!importing)result.favorite=false;
 if(game.preferences!=null)result.preferences=importing?strict(game.preferences,sanitizeGamePreferences(game.preferences)):sanitizeGamePreferences(game.preferences);
 if(game.coreKey!=null){const core=coreRegistry[game.system].find(c=>c.key===game.coreKey);if(!core||!supportsGame(core,game))fail(tr('未対応のコア設定が含まれています。'));result.coreKey=game.coreKey;}
 if(game.cheats!=null)result.cheats=cheats(game.cheats);
 if(game.coreCheats!=null){if(!plain(game.coreCheats))fail();result.coreCheats={};for(const [key,list] of Object.entries(game.coreCheats)){if(!coreRegistry[game.system].some(c=>c.key===key&&c.cheats))fail(tr('未対応のチート用コアです。'));result.coreCheats[key]=cheats(list);}}
 if(game.controlLayout!=null)result.controlLayout=importing?strict(game.controlLayout,layout(game.controlLayout)):layout(game.controlLayout);
 for(const key of ['added','lastPlayed','updatedAt','playDuration'])if(Object.hasOwn(game,key)){if(!validTime(game[key]))fail(tr('プレイ記録が正しくありません。'));result[key]=game[key];}
 if(game.romUpdate!=null){
  const link=game.romUpdate;keys(link,['previousId','previousName','at','coreKey','migration']);if(!validId(link.previousId)||link.previousId===game.id||typeof link.previousName!=='string'||link.previousName.length>1024||!validTime(link.at)||!coreRegistry[game.system].some(core=>core.key===link.coreKey))fail(tr('ROMの更新記録が正しくありません。'));
  result.romUpdate={...link};if(link.migration){keys(link.migration,['kind','from','to','via']);if(link.migration.kind!=='start'||['from','to','via'].some(key=>Object.hasOwn(link.migration,key)&&!/^\d{1,4}\.\d{1,4}(?:\.\d{1,4})?$/.test(link.migration[key])))fail(tr('ROMの更新記録が正しくありません。'));}
 }
 return result;
}
function cleanProfile(value){
 if(value==null)return null;keys(value,['nickname','joinedAt','joinSource','avatar']);
 if(typeof value.nickname!=='string'||Array.from(value.nickname).length>30||!validTime(value.joinedAt)||!['first-use','estimated','recorded'].includes(value.joinSource)||Object.hasOwn(value,'avatar')&&value.avatar!==''&&!validTrainerAvatar(value.avatar))fail(tr('トレーナーカードの形式が正しくありません。'));
 return {...value};
}
function cleanPlayRecords(records=[]){
 if(!Array.isArray(records)||records.length>backupLimits.records)fail(tr('プレイ記録の件数上限を超えています。'));
 const seen=new Set();return records.map(record=>checkGame(record?.id,()=>{
  keys(record,['id','system','name','added','lastPlayed','updatedAt','playDuration','previousIds']);
  if(!validId(record.id)||seen.has(record.id)||!Object.hasOwn(coreRegistry,record.system)||typeof record.name!=='string'||record.name.length>120||['added','lastPlayed','updatedAt','playDuration'].some(key=>!validTime(record[key]))||!Array.isArray(record.previousIds)||record.previousIds.length>backupLimits.games||record.previousIds.some(id=>!validId(id)||id===record.id)||new Set(record.previousIds).size!==record.previousIds.length)fail(tr('プレイ記録が正しくありません。'));
  seen.add(record.id);return {...record,previousIds:[...record.previousIds]};
 }));
}
function selectedPlayRecords(data,ids,all=false){
 const records=new Map((data.playRecords||[]).map(record=>[record.id,record]));
 for(const game of data.games)records.set(game.id,playRecord(game,records.get(game.id)));
 if(!all){const include=new Set(ids),pending=[...ids];while(pending.length){for(const id of records.get(pending.pop())?.previousIds||[])if(!include.has(id)){include.add(id);pending.push(id);}}for(const id of records.keys())if(!include.has(id))records.delete(id);}
 return cleanPlayRecords([...records.values()].sort((a,b)=>a.id.localeCompare(b.id)));
}
function recordCore(record,games){
 if(!dataStores.includes(record.store)||typeof record.key!=='string'||record.key.length>180)fail();
 const [slot,...tail]=record.key.split(':');if(tail.length>1||(record.store==='states'?tail.length!==1||!/^[a-zA-Z0-9_-]{1,80}$/.test(tail[0]||''):tail.length!==0))fail(tr('保存先の形式が正しくありません。'));
 const parts=slot.split('@'),game=games.get(parts.shift());if(!game)fail(tr('ゲームに対応しない保存データがあります。'));
 if(parts[0]==='link-2p'){if(!['gba','gb','gbc'].includes(game.system))fail(tr('2Pセーブの機種が正しくありません。'));parts.shift();}
 if(parts.length>1)fail();const core=parts.length?coreRegistry[game.system].find(c=>c.key===parts[0]):coreRegistry[game.system][0];if(!core)fail(tr('未対応の保存用コアです。'));
 if(record.store==='rom-updates'&&(!game.romUpdate||game.romUpdate.coreKey!==core.key||record.key!==game.id+'@'+core.key))fail(tr('ROMの更新記録が正しくありません。'));return core;
}
function rawBytes(value){if(value instanceof Uint8Array)return value;if(value instanceof ArrayBuffer)return new Uint8Array(value);fail(tr('保存データを読めませんでした。'));}
function cleanRecord(record){return checkGame(recordGame(record),()=>{
 const item=value=>{
  const result={bytes:rawBytes(value.bytes),hash:value.hash||null,at:value.at||0,coreId:value.coreId||'mgba-rom64-link-v1'};
  if(record.store==='states'||record.store==='recoveries'){result.save=value.save?rawBytes(value.save):null;result.saveHash=value.saveHash||null;}return result;
 };return {store:record.store,key:record.key,value:Array.isArray(record.value)?record.value.map(item):item(record.value)};
});}
function base64(bytes){let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);}
function unbase64(text,budget){
 if(typeof text!=='string'||text.length%4||text.length>Math.ceil(backupLimits.bytes/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(text))fail(tr('保存データの符号化が正しくありません。'));
 const size=text.length/4*3-(text.endsWith('==')?2:text.endsWith('=')?1:0);budget.total+=size;if(size<1||budget.total>backupLimits.bytes)fail(tr('バックアップ内のデータは合計128 MiBまでです。'));
 const binary=atob(text),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));if(base64(bytes)!==text)fail();return bytes;
}
async function encodeData(data,settings,{part,latestOnly=false}={}){
 if(data.games.length>backupLimits.games||data.records.length>backupLimits.records)fail(tr('バックアップの件数上限を超えています。'));
 const games=data.games.map(g=>cleanGame(g)),byId=new Map(games.map(g=>[g.id,g])),records=[];let total=0;
 for(const entry of data.records){
  if(!byId.has(String(entry.key).split(/[@:]/,1)[0]))continue;
  try{
  const record=cleanRecord(entry),core=recordCore(record,byId),items=Array.isArray(record.value)?record.value:[record.value],output=[];
  for(const item of items){
   total+=item.bytes.length+(item.save?.length||0);if(total>backupLimits.bytes)fail(tr('バックアップ内のデータは合計128 MiBまでです。'));
   const digest=await hash(item.bytes);if(item.hash&&item.hash!==digest)fail(tr('保存データの検証に失敗しました。元のデータは変更していません。'));
   if(!compatibleState(core.id,item))fail(tr('このバージョンで読めないコアの保存データが含まれています。'));
   const out={...item,bytes:base64(item.bytes),hash:digest};
   if(Object.hasOwn(item,'save')){out.save=item.save?.length?base64(item.save):null;out.saveHash=out.save?await hash(item.save):null;if(item.saveHash&&item.saveHash!==out.saveHash)fail(tr('ステート内のセーブが破損しています。'));}output.push(out);
  }records.push({...record,value:Array.isArray(record.value)?output:output[0]});
  }catch(error){throw gameFailure(error,recordGame(entry));}
 }
 const archive={format,version,createdAt:Date.now(),settings:sanitizeBackupSettings(settings),games,records,profile:cleanProfile(data.profile),playRecords:cleanPlayRecords(data.playRecords||[]),...(part?{part}:{}),...(latestOnly?{latestOnly:true}:{})};
 const text=JSON.stringify(archive);checkFileSize(text);
 return {archive,text,summary:{games:games.length,records:records.length,bytes:total}};
}
async function create(settings,{gameIds,latestOnly=false}={}){
 const data=await db.readBackupData({gameIds,latestOnly});data.playRecords=selectedPlayRecords(data,new Set(data.games.map(game=>game.id)),gameIds===undefined);return encodeData(data,settings,{latestOnly});
}
const exports=new WeakMap(),signature=data=>JSON.stringify({games:[...data.games].sort((a,b)=>a.id.localeCompare(b.id)),records:[...data.records].sort((a,b)=>(a.store+':'+a.key).localeCompare(b.store+':'+b.key)),profile:data.profile||null,playRecords:[...(data.playRecords||[])].sort((a,b)=>a.id.localeCompare(b.id)),at:data.at||0});
function changedGame(before,after){
 for(const field of ['games','records','playRecords']){
  const key=row=>field==='records'?row.store+':'+row.key:row.id,previous=new Map((before[field]||[]).map(row=>[key(row),row])),current=new Map((after[field]||[]).map(row=>[key(row),row]));
  for(const token of new Set([...previous.keys(),...current.keys()]))if(JSON.stringify(previous.get(token))!==JSON.stringify(current.get(token))){const row=current.get(token)||previous.get(token);return field==='records'?recordGame(row):row.id;}
 }
 return null; // Shared settings/profile changes have no single game owner.
}
async function prepareExport(settings,{gameIds,latestOnly=false,partBytes=64*1048576,previous=false}={}){
 if(!Number.isSafeInteger(partBytes)||partBytes<1||partBytes>backupLimits.bytes||typeof latestOnly!=='boolean'||typeof previous!=='boolean'||gameIds!==undefined&&(!Array.isArray(gameIds)||gameIds.some(id=>!validId(id))||new Set(gameIds).size!==gameIds.length))fail(tr('書き出すゲームを選び直してください。'));
 const data=previous?await db.readPreviousBackup({summary:true}):await db.readBackupData({summary:true,gameIds,latestOnly});if(!data)return null;
 if(gameIds?.some(id=>!data.games.some(game=>game.id===id)))fail(tr('ゲーム一覧が変わりました。やり直してください。'));
 if(data.games.length>backupLimits.games||data.records.length>backupLimits.records)fail(tr('バックアップの件数上限を超えています。'));
 const byId=new Map(data.games.map(game=>[game.id,cleanGame(game)]));
 const parts=[];let chunk={records:[],bytes:0};
 for(const record of [...data.records].sort((a,b)=>(a.store+':'+a.key).localeCompare(b.store+':'+b.key))){
  try{const core=recordCore(record,byId);
  for(const [index,item] of (Array.isArray(record.value)?record.value:[record.value]).entries()){
   if(!compatibleState(core.id,item))fail(tr('このバージョンで読めないコアの保存データが含まれています。'));
   if(!Number.isSafeInteger(item.byteLength)||item.byteLength<1||item.byteLength>backupLimits.bytes)fail(tr('1件の保存データがバックアップの上限を超えています。'));
   if(chunk.records.length&&chunk.bytes+item.byteLength>partBytes){parts.push(chunk);chunk={records:[],bytes:0};}
   // An indivisible state/save may exceed the preferred 64 MiB target, but
   // never the format's hard bound. Individual payloads are never truncated.
   let selection=chunk.records.find(row=>row.store===record.store&&row.key===record.key);if(!selection){selection={store:record.store,key:record.key,indices:[]};chunk.records.push(selection);}selection.indices.push(index);chunk.bytes+=item.byteLength;
  }
  }catch(error){throw gameFailure(error,recordGame(record));}
 }
 if(chunk.records.length||!parts.length)parts.push(chunk);
 const id=await hash(crypto.getRandomValues(new Uint8Array(32))),plan=Object.freeze({id,games:data.games.length,records:data.records.length,bytes:parts.reduce((sum,part)=>sum+part.bytes,0),parts:Object.freeze(parts.map((part,index)=>Object.freeze({index:index+1,bytes:part.bytes,records:part.records.length}))),previous});
 exports.set(plan,{data,fingerprint:signature(data),settings:previous?data.settings:sanitizeBackupSettings(settings),parts,gameIds,latestOnly,previous,playRecords:previous?cleanPlayRecords(data.playRecords):selectedPlayRecords(data,new Set(data.games.map(game=>game.id)),gameIds===undefined)});return plan;
}
async function createPart(plan,index){
 const prepared=exports.get(plan),selected=prepared?.parts[index-1];if(!selected||!Number.isInteger(index))fail(tr('書き出し内容を選び直してください。'));
 return withLocks(async()=>{
  const {gameIds,latestOnly,previous}=prepared,current=previous?await db.readPreviousBackup({summary:true}):await db.readBackupData({summary:true,gameIds,latestOnly});
  if(!current||signature(current)!==prepared.fingerprint)checkGame(current?changedGame(prepared.data,current):null,()=>fail(tr('保存データが変わりました。書き出し内容を選び直してください。')));
  const data=previous?await db.readPreviousBackup({selectedRecords:selected.records}):await db.readBackupData({gameIds,latestOnly,selectedRecords:selected.records});
  data.playRecords=prepared.playRecords;
  return encodeData(data,prepared.settings,{latestOnly,part:plan.parts.length>1?{id:plan.id,index,count:plan.parts.length}:undefined});
 },prepared.data.games.map(game=>game.id));
}
async function inspect(input){
 if(input instanceof Blob){if(input.size>backupLimits.file)fail(tr('バックアップファイルは192 MiBまでです。'));input=await input.text();}
 if(typeof input!=='string')fail(tr('JSON形式のバックアップを選んでください。'));checkFileSize(input);
 let archive;try{archive=JSON.parse(input);}catch{fail(tr('JSON形式のバックアップを選んでください。'));}
 keys(archive,['format','version','createdAt','settings','games','records','profile','playRecords','part','latestOnly']);if(archive.format!==format||![1,version].includes(archive.version)||!validTime(archive.createdAt))fail(tr('未対応のバックアップ形式・バージョンです。'));
 const profile=cleanProfile(archive.profile),playRecords=cleanPlayRecords(archive.playRecords),part=archive.part;
 if(archive.latestOnly!==undefined&&archive.latestOnly!==true)fail();
 if(part){keys(part,['id','index','count']);if(!validId(part.id)||!Number.isSafeInteger(part.index)||!Number.isSafeInteger(part.count)||part.index<1||part.index>part.count||part.count>backupLimits.records)fail(tr('分割バックアップの情報が正しくありません。'));}
 if(!Array.isArray(archive.games)||archive.games.length>backupLimits.games||!Array.isArray(archive.records)||archive.records.length>backupLimits.records)fail(tr('バックアップの件数上限を超えています。'));
 const settings=strict(archive.settings,sanitizeBackupSettings(archive.settings)),games=archive.games.map(g=>cleanGame(g,true)),byId=new Map(games.map(g=>[g.id,g]));if(byId.size!==games.length)checkGame(games.find((game,index)=>games.findIndex(other=>other.id===game.id)!==index)?.id,()=>fail(tr('ゲームが重複しています。')));
 const records=[],seen=new Set(),budget={total:0};
 for(const record of archive.records){
  try{
  keys(record,['store','key','value']);const core=recordCore(record,byId),token=record.store+':'+record.key;if(seen.has(token))fail(tr('保存先が重複しています。'));seen.add(token);
  const history=['backups','archives','recoveries'].includes(record.store);if(history&&(!Array.isArray(record.value)||record.value.length>(record.store==='archives'?10:5))||!history&&Array.isArray(record.value))fail(tr('保存履歴の形式が正しくありません。'));
  const output=[];for(const item of history?record.value:[record.value]){
   const state=['states','recoveries'].includes(record.store);keys(item,state?['bytes','hash','save','saveHash','at','coreId']:['bytes','hash','at','coreId']);
   if(!validTime(item.at)||!validHash(item.hash)||typeof item.coreId!=='string'||!compatibleState(core.id,item))fail(tr('保存データの日時・ハッシュ・コアが正しくありません。'));
   const bytes=unbase64(item.bytes,budget);if(!state&&bytes.length>core.maxSave)fail(tr('セーブのサイズがコアの上限を超えています。'));if(await hash(bytes)!==item.hash)fail(tr('保存データのハッシュが一致しません。'));
   const value={...item,bytes};if(state){if(item.save===null&&item.saveHash===null)value.save=null;else{if(!validHash(item.saveHash))fail();value.save=unbase64(item.save,budget);if(value.save.length>core.maxSave||await hash(value.save)!==item.saveHash)fail(tr('ステート内のセーブの検証に失敗しました。'));}}output.push(value);
  }
  if(history){output.forEach(assertHistoryRecord);if(retainHistory(output,record.store==='archives'?10:5).length!==output.length)fail(tr('保存履歴の形式が正しくありません。'));}
  records.push({...record,value:history?output:output[0]});
  }catch(error){throw gameFailure(error,recordGame(record));}
 }
 const local=await db.readBackupData({summary:true}),localMap=new Map(local.games.map(g=>[g.id,g])),matched=[],missing=[];
 for(const game of games){const target=localMap.get(game.id);if(target&&(target.system!==game.system||target.size!==game.size))checkGame(game.id,()=>fail(tr('同じ識別子のゲーム情報が一致しません。')));if(target&&(target.romMissing===true||await db.has('roms',game.id)))matched.push(game);else missing.push(game);}
 const byGame=list=>{const result=new Map();for(const record of list){const id=record.key.split(/[@:]/,1)[0],row=result.get(id)||{at:0,count:0};for(const value of Array.isArray(record.value)?record.value:[record.value])row.at=Math.max(row.at,value.at||0);row.count++;result.set(id,row);}return result;};
 const current=byGame(local.records),incoming=byGame(records),rows=matched.map(game=>Object.freeze({id:game.id,name:localMap.get(game.id).name||game.system.toUpperCase(),system:game.system,currentAt:current.get(game.id)?.at||0,backupAt:incoming.get(game.id)?.at||0,records:incoming.get(game.id)?.count||0,romMissing:localMap.get(game.id).romMissing===true}));
 if(archive.latestOnly&&records.some(record=>record.store!=='saves'))fail();
 const plan=Object.freeze({matched:matched.length,missing:missing.length,records:records.length,bytes:budget.total,createdAt:archive.createdAt,games:Object.freeze(rows),hasProfile:!!profile,playRecords:playRecords.length,part:part?Object.freeze({...part}):null,merge:!!part||!!archive.latestOnly});
 const ids=new Set(matched.map(game=>game.id));plans.set(plan,{games:matched,records:records.filter(r=>ids.has(r.key.split(/[@:]/,1)[0])),settings,profile,playRecords,part,merge:plan.merge});return plan;
}
const plans=new WeakMap();
async function withLocks(callback,gameIds){
 if(!navigator.locks)fail(tr('復元にはWeb Locks対応の最新版ブラウザが必要です。'));
 return navigator.locks.request('palmo-backup-restore',{ifAvailable:true},async lock=>{
  if(!lock)fail(tr('別のタブで復元中です。完了してからやり直してください。'));
  const names=[...new Set((gameIds||(await db.all('library')).map(g=>g.id)).map(id=>'local-game:'+id))].sort();
  const next=i=>i===names.length?callback():navigator.locks.request(names[i],{ifAvailable:true},gameLock=>{if(!gameLock)fail(tr('別のタブでプレイ中です。終了してからやり直してください。'));return next(i+1);});return next(0);
 });
}
async function restore(plan,{settings={},gameIds,includeSettings=false,includeProfile=false}={}){
 const data=plans.get(plan);if(!data)fail(tr('ファイルを選び直してください。'));
 if(typeof includeSettings!=='boolean'||typeof includeProfile!=='boolean'||includeProfile&&!data.profile||gameIds!==undefined&&(!Array.isArray(gameIds)||gameIds.some(id=>!data.games.some(game=>game.id===id))))fail(tr('復元するゲームを選び直してください。'));
 const ids=new Set(gameIds===undefined?data.games.map(game=>game.id):gameIds),selected={games:data.games.filter(game=>ids.has(game.id)),records:data.records.filter(record=>ids.has(record.key.split(/[@:]/,1)[0]))};
 if(!ids.size&&!includeSettings&&!includeProfile)fail(tr('復元するゲームか共通設定を選んでください。'));
 return withLocks(async()=>{
  if(await db.get('coverCatalogs',pendingKey))fail(tr('前回の設定の復元を完了してからやり直してください。'));
  // Probe the actual browser persistence before starting a data replacement.
  let old=null;try{old=localStorage.getItem(settingsKey);}catch(e){if(includeSettings)throw e;}
  if(includeSettings){localStorage.setItem(settingsKey,old??'{}');if(old===null)localStorage.removeItem(settingsKey);}
  let previousSettings=settings;try{previousSettings=JSON.parse(old)||settings;}catch{}
  const playRecords=selectedPlayRecords({...data,games:selected.games},ids,includeProfile);
  await db.restoreBackupData({...selected,settings:includeSettings?data.settings:undefined,profile:includeProfile?data.profile:undefined,playRecords,previousSettings:sanitizeBackupSettings(previousSettings),cleanGame,cleanRecord,maxBytes:backupLimits.bytes,merge:data.merge,part:data.part});
  plans.delete(plan);if(includeSettings)await applyPending();return {games:selected.games.length,records:selected.records.length,settings:includeSettings?data.settings:null};
 },includeSettings||includeProfile?undefined:[...ids]);
}
async function applyPending(){
 const pending=await db.get('coverCatalogs',pendingKey);if(!pending)return false;
 const settings=strict(pending.settings,sanitizeBackupSettings(pending.settings));
 // Skin files/selections are not portable backup data. Keep existing choices
 // on this device instead of silently pointing them at absent imported assets.
 try{let current={};try{current=JSON.parse(localStorage.getItem(settingsKey)||'{}');}catch{}localStorage.setItem(settingsKey,JSON.stringify({...settings,...(plain(current.skins)?{skins:current.skins}:{})}));}catch{fail(tr('セーブの復元は保存済みですが、設定を保存できません。ページを開き直して設定の復元を完了してください。'));}
 await db.remove('coverCatalogs',pendingKey);return true;
}
async function previous(){const data=await db.readPreviousBackup();return data?encodeData(data,data.settings):null;}
export const createBackup=backupTask(create),inspectBackup=backupTask(inspect),restoreBackup=backupTask(restore),applyPendingBackupSettings=backupTask(applyPending),previousBackup=backupTask(previous),prepareBackupExport=backupTask(prepareExport),createBackupPart=backupTask(createPart);
