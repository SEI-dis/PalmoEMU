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
import {gameOptionGroups,gameShortcuts} from '../components/manic-ui.js';
import {guardUpdateTask} from '../updates/update-activity.js';

export const backupLimits=Object.freeze({file:192*1048576,bytes:128*1048576,games:1000,records:10000});
const format='PalmoEMU-save-backup',version=1,settingsKey='manic-settings',pendingKey=db.backupMetadataPrefix+'pending';
const dataStores=['saves','states','backups','archives','recoveries'],gameFields=['id','system','size','preferences','coreKey','cheats','coreCheats','controlLayout','category','favorite'];
const validId=id=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id),validHash=validId;
const plain=x=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const fail=message=>{throw Error(message||tr('バックアップの形式が正しくありません。'));};
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
 for(const key of ['autosave','recovery','quickStart'])if(typeof value[key]==='boolean')result[key]=value[key];
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
function cleanGame(game,importing=false){
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
 return result;
}
function recordCore(record,games){
 if(!dataStores.includes(record.store)||typeof record.key!=='string'||record.key.length>180)fail();
 const [slot,...tail]=record.key.split(':');if(tail.length>1||(record.store==='states'?tail.length!==1||!/^[a-zA-Z0-9_-]{1,80}$/.test(tail[0]||''):tail.length!==0))fail(tr('保存先の形式が正しくありません。'));
 const parts=slot.split('@'),game=games.get(parts.shift());if(!game)fail(tr('ゲームに対応しない保存データがあります。'));
 if(parts[0]==='link-2p'){if(!['gba','gb','gbc'].includes(game.system))fail(tr('2Pセーブの機種が正しくありません。'));parts.shift();}
 if(parts.length>1)fail();const core=parts.length?coreRegistry[game.system].find(c=>c.key===parts[0]):coreRegistry[game.system][0];if(!core)fail(tr('未対応の保存用コアです。'));return core;
}
function rawBytes(value){if(value instanceof Uint8Array)return value;if(value instanceof ArrayBuffer)return new Uint8Array(value);fail(tr('保存データを読めませんでした。'));}
function cleanRecord(record){
 const item=value=>{
  const result={bytes:rawBytes(value.bytes),hash:value.hash||null,at:value.at||0,coreId:value.coreId||'mgba-rom64-link-v1'};
  if(record.store==='states'||record.store==='recoveries'){result.save=value.save?rawBytes(value.save):null;result.saveHash=value.saveHash||null;}return result;
 };return {store:record.store,key:record.key,value:Array.isArray(record.value)?record.value.map(item):item(record.value)};
}
function base64(bytes){let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);}
function unbase64(text,budget){
 if(typeof text!=='string'||text.length%4||text.length>Math.ceil(backupLimits.bytes/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(text))fail(tr('保存データの符号化が正しくありません。'));
 const size=text.length/4*3-(text.endsWith('==')?2:text.endsWith('=')?1:0);budget.total+=size;if(size<1||budget.total>backupLimits.bytes)fail(tr('バックアップ内のデータは合計128 MiBまでです。'));
 const binary=atob(text),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));if(base64(bytes)!==text)fail();return bytes;
}
async function encodeData(data,settings){
 if(data.games.length>backupLimits.games||data.records.length>backupLimits.records)fail(tr('バックアップの件数上限を超えています。'));
 const games=data.games.map(g=>cleanGame(g)),byId=new Map(games.map(g=>[g.id,g])),records=[];let total=0;
 for(const entry of data.records){
  if(!byId.has(String(entry.key).split(/[@:]/,1)[0]))continue;
  const record=cleanRecord(entry),core=recordCore(record,byId),items=Array.isArray(record.value)?record.value:[record.value],output=[];
  for(const item of items){
   total+=item.bytes.length+(item.save?.length||0);if(total>backupLimits.bytes)fail(tr('バックアップ内のデータは合計128 MiBまでです。'));
   const digest=await hash(item.bytes);if(item.hash&&item.hash!==digest)fail(tr('保存データの検証に失敗しました。元のデータは変更していません。'));
   if(!compatibleState(core.id,item))fail(tr('このバージョンで読めないコアの保存データが含まれています。'));
   const out={...item,bytes:base64(item.bytes),hash:digest};
   if(Object.hasOwn(item,'save')){out.save=item.save?.length?base64(item.save):null;out.saveHash=out.save?await hash(item.save):null;if(item.saveHash&&item.saveHash!==out.saveHash)fail(tr('ステート内のセーブが破損しています。'));}output.push(out);
  }records.push({...record,value:Array.isArray(record.value)?output:output[0]});
 }
 const archive={format,version,createdAt:Date.now(),settings:sanitizeBackupSettings(settings),games,records};
 const text=JSON.stringify(archive);checkFileSize(text);
 return {archive,text,summary:{games:games.length,records:records.length,bytes:total}};
}
async function create(settings){return encodeData(await db.readBackupData(),settings);}
async function inspect(input){
 if(input instanceof Blob){if(input.size>backupLimits.file)fail(tr('バックアップファイルは192 MiBまでです。'));input=await input.text();}
 if(typeof input!=='string')fail(tr('JSON形式のバックアップを選んでください。'));checkFileSize(input);
 let archive;try{archive=JSON.parse(input);}catch{fail(tr('JSON形式のバックアップを選んでください。'));}
 keys(archive,['format','version','createdAt','settings','games','records']);if(archive.format!==format||archive.version!==version||!validTime(archive.createdAt))fail(tr('未対応のバックアップ形式・バージョンです。'));
 if(!Array.isArray(archive.games)||archive.games.length>backupLimits.games||!Array.isArray(archive.records)||archive.records.length>backupLimits.records)fail(tr('バックアップの件数上限を超えています。'));
 const settings=strict(archive.settings,sanitizeBackupSettings(archive.settings)),games=archive.games.map(g=>cleanGame(g,true)),byId=new Map(games.map(g=>[g.id,g]));if(byId.size!==games.length)fail(tr('ゲームが重複しています。'));
 const records=[],seen=new Set(),budget={total:0};
 for(const record of archive.records){
  keys(record,['store','key','value']);const core=recordCore(record,byId),token=record.store+':'+record.key;if(seen.has(token))fail(tr('保存先が重複しています。'));seen.add(token);
  const history=['backups','archives','recoveries'].includes(record.store);if(history&&(!Array.isArray(record.value)||record.value.length>(record.store==='archives'?10:5))||!history&&Array.isArray(record.value))fail(tr('保存履歴の形式が正しくありません。'));
  const output=[];for(const item of history?record.value:[record.value]){
   const state=['states','recoveries'].includes(record.store);keys(item,state?['bytes','hash','save','saveHash','at','coreId']:['bytes','hash','at','coreId']);
   if(!validTime(item.at)||!validHash(item.hash)||typeof item.coreId!=='string'||!compatibleState(core.id,item))fail(tr('保存データの日時・ハッシュ・コアが正しくありません。'));
   const bytes=unbase64(item.bytes,budget);if(!state&&bytes.length>core.maxSave)fail(tr('セーブのサイズがコアの上限を超えています。'));if(await hash(bytes)!==item.hash)fail(tr('保存データのハッシュが一致しません。'));
   const value={...item,bytes};if(state){if(item.save===null&&item.saveHash===null)value.save=null;else{if(!validHash(item.saveHash))fail();value.save=unbase64(item.save,budget);if(value.save.length>core.maxSave||await hash(value.save)!==item.saveHash)fail(tr('ステート内のセーブの検証に失敗しました。'));}}output.push(value);
  }records.push({...record,value:history?output:output[0]});
 }
 const local=await db.readBackupData({summary:true}),localMap=new Map(local.games.map(g=>[g.id,g])),matched=[],missing=[];
 for(const game of games){const target=localMap.get(game.id);if(target&&(target.system!==game.system||target.size!==game.size))fail(tr('同じ識別子のゲーム情報が一致しません。'));if(target&&(target.romMissing===true||await db.has('roms',game.id)))matched.push(game);else missing.push(game);}
 const byGame=list=>{const result=new Map();for(const record of list){const id=record.key.split(/[@:]/,1)[0],row=result.get(id)||{at:0,count:0};for(const value of Array.isArray(record.value)?record.value:[record.value])row.at=Math.max(row.at,value.at||0);row.count++;result.set(id,row);}return result;};
 const current=byGame(local.records),incoming=byGame(records),rows=matched.map(game=>Object.freeze({id:game.id,name:localMap.get(game.id).name||game.system.toUpperCase(),system:game.system,currentAt:current.get(game.id)?.at||0,backupAt:incoming.get(game.id)?.at||0,records:incoming.get(game.id)?.count||0,romMissing:localMap.get(game.id).romMissing===true}));
 const plan=Object.freeze({matched:matched.length,missing:missing.length,records:records.length,bytes:budget.total,createdAt:archive.createdAt,games:Object.freeze(rows)});
 const ids=new Set(matched.map(game=>game.id));plans.set(plan,{games:matched,records:records.filter(r=>ids.has(r.key.split(/[@:]/,1)[0])),settings});return plan;
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
async function restore(plan,{settings={},gameIds,includeSettings=false}={}){
 const data=plans.get(plan);if(!data)fail(tr('ファイルを選び直してください。'));
 if(typeof includeSettings!=='boolean'||gameIds!==undefined&&(!Array.isArray(gameIds)||gameIds.some(id=>!data.games.some(game=>game.id===id))))fail(tr('復元するゲームを選び直してください。'));
 const ids=new Set(gameIds===undefined?data.games.map(game=>game.id):gameIds),selected={games:data.games.filter(game=>ids.has(game.id)),records:data.records.filter(record=>ids.has(record.key.split(/[@:]/,1)[0]))};
 if(!ids.size&&!includeSettings)fail(tr('復元するゲームか共通設定を選んでください。'));
 return withLocks(async()=>{
  if(await db.get('coverCatalogs',pendingKey))fail(tr('前回の設定の復元を完了してからやり直してください。'));
  // Probe the actual browser persistence before starting a data replacement.
  let old=null;try{old=localStorage.getItem(settingsKey);}catch(e){if(includeSettings)throw e;}
  if(includeSettings){localStorage.setItem(settingsKey,old??'{}');if(old===null)localStorage.removeItem(settingsKey);}
  let previousSettings=settings;try{previousSettings=JSON.parse(old)||settings;}catch{}
  await db.restoreBackupData({...selected,settings:includeSettings?data.settings:undefined,previousSettings:sanitizeBackupSettings(previousSettings),cleanGame,cleanRecord,maxBytes:backupLimits.bytes});
  plans.delete(plan);if(includeSettings)await applyPending();return {games:selected.games.length,records:selected.records.length,settings:includeSettings?data.settings:null};
 },includeSettings?undefined:[...ids]);
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
export const createBackup=guardUpdateTask(create),inspectBackup=guardUpdateTask(inspect),restoreBackup=guardUpdateTask(restore),applyPendingBackupSettings=guardUpdateTask(applyPending),previousBackup=guardUpdateTask(previous);
