// SPDX-License-Identifier: AGPL-3.0-or-later
// Original portable state envelope. The select/import/share interaction follows
// ManicEMU SaveStateListView (Daiuno, 2026); native savestate bytes are not assumed
// interchangeable with Web cores. ROMs and screenshots are never included.
import {tr} from './i18n/index.js';
import * as db from './storage.js';
import {hash} from './shared.js';
import {coreFor,saveKey,compatibleState,supportsGame} from './core-registry.js';
import {guardUpdateTask} from './update-activity.js';

export const stateTransferLimits=Object.freeze({file:192*1048576,bytes:128*1048576});
const format='PalmoEMU-save-state',version=1,plans=new WeakMap();
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const time=value=>Number.isSafeInteger(value)&&value>=0&&value<=8640000000000000;
const fail=message=>{throw Error(message||tr('ステートファイルの形式が正しくありません。'));};
function fields(value,names){if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==names.length||names.some(name=>!Object.hasOwn(value,name)))fail();}
function target(game){
 if(!game||!digest(game.id)||!Number.isSafeInteger(game.size)||game.size<1)fail(tr('ゲームの識別情報が正しくありません。'));
 const core=coreFor(game);if(!supportsGame(core,game))fail(tr('このコアではゲームを開けません。'));return core;
}
function binary(value){if(value instanceof Uint8Array)return value;if(value instanceof ArrayBuffer)return new Uint8Array(value);fail(tr('保存データを読めませんでした。'));}
function base64(bytes){let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);}
function decode(text,budget){
 if(typeof text!=='string'||!text.length||text.length%4||text.length>Math.ceil(stateTransferLimits.bytes/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(text))fail(tr('保存データの符号化が正しくありません。'));
 const size=text.length/4*3-(text.endsWith('==')?2:text.endsWith('=')?1:0);budget.total+=size;
 if(size<1||budget.total>stateTransferLimits.bytes)fail(tr('ステート内のデータは合計128 MiBまでです。'));
 const bytes=Uint8Array.from(atob(text),c=>c.charCodeAt(0));if(base64(bytes)!==text)fail();return bytes;
}
async function verify(record,core){
 if(!record.bytes.length||record.bytes.length+(record.save?.length||0)>stateTransferLimits.bytes)fail(tr('ステート内のデータは合計128 MiBまでです。'));
 if(!time(record.at)||!digest(record.hash)||typeof record.coreId!=='string'||!compatibleState(core.id,record))fail(tr('ステートの日時・ハッシュ・コアが正しくありません。'));
 if(await hash(record.bytes)!==record.hash)fail(tr('ステートのハッシュが一致しません。'));
 if(record.save===null){if(record.saveHash!==null)fail(tr('ステート内のセーブの検証に失敗しました。'));}
 else if(!record.save.length||record.save.length>core.maxSave||!digest(record.saveHash)||await hash(record.save)!==record.saveHash)fail(tr('ステート内のセーブの検証に失敗しました。'));
}
async function create(game,value){
 const core=target(game),bytes=binary(value.bytes),save=value.save?binary(value.save):null;
 const record={bytes,hash:value.hash||await hash(bytes),save:save?.length?save:null,saveHash:save?.length?(value.saveHash||await hash(save)):null,at:value.at,coreId:value.coreId||'mgba-rom64-link-v1'};
 if(value.saveHash&&!record.save)fail(tr('ステート内のセーブの検証に失敗しました。'));
 await verify(record,core);
 const envelope={format,version,createdAt:Date.now(),rom:{sha256:game.id,system:game.system,size:game.size},core:{key:core.key,format:record.coreId},state:{bytes:base64(record.bytes),hash:record.hash,save:record.save?base64(record.save):null,saveHash:record.saveHash,at:record.at}};
 const text=JSON.stringify(envelope);if(new Blob([text]).size>stateTransferLimits.file)fail(tr('ステートファイルは192 MiBまでです。'));
 return {text,at:record.at};
}
async function inspect(input,game){
 const core=target(game);
 if(input instanceof Blob){if(input.size>stateTransferLimits.file)fail(tr('ステートファイルは192 MiBまでです。'));input=await input.text();}
 if(typeof input!=='string'||input.length>stateTransferLimits.file||new Blob([input]).size>stateTransferLimits.file)fail(tr('ステートファイルは192 MiBまでです。'));
 let envelope;try{envelope=JSON.parse(input);}catch{fail(tr('PalmoEMUから書き出したステートを選んでください。他のアプリのステートは取り込めません。'));}
 fields(envelope,['format','version','createdAt','rom','core','state']);
 if(envelope.format!==format||envelope.version!==version||!time(envelope.createdAt))fail(tr('PalmoEMUから書き出したステートを選んでください。他のアプリのステートは取り込めません。'));
 fields(envelope.rom,['sha256','system','size']);fields(envelope.core,['key','format']);fields(envelope.state,['bytes','hash','save','saveHash','at']);
 if(envelope.rom.sha256!==game.id||envelope.rom.system!==game.system||envelope.rom.size!==game.size)fail(tr('別のROMのステートです。同じROMのゲームを選んでください。'));
 if(envelope.core.key!==core.key||typeof envelope.core.format!=='string'||!compatibleState(core.id,{coreId:envelope.core.format}))fail(tr('このコアでは読み込めないステートです。書き出したときと同じコアを選んでください。'));
 const budget={total:0},source=envelope.state,record={bytes:decode(source.bytes,budget),hash:source.hash,save:source.save===null?null:decode(source.save,budget),saveHash:source.saveHash,at:source.at,coreId:envelope.core.format};
 await verify(record,core);
 const plan=Object.freeze({gameId:game.id,coreKey:core.key,coreId:record.coreId,at:record.at,bytes:budget.total,embeddedSave:record.save!==null});
 plans.set(plan,{record,game:{id:game.id,system:game.system,size:game.size,coreKey:core.key}});return plan;
}
async function restore(plan,game,{activeGame=null,assertCurrent=()=>{}}={}){
 const data=plans.get(plan),core=target(game);
 if(!data||data.game.id!==game.id||data.game.system!==game.system||data.game.size!==game.size||data.game.coreKey!==core.key)fail(tr('ゲームやコアが変更されました。ファイルを選び直してください。'));
 const add=async()=>{assertCurrent();const key=saveKey(data.game)+':'+crypto.randomUUID();await db.addState(data.game,key,data.record);plans.delete(plan);return {key,at:data.record.at};};
 if(activeGame){if(activeGame.id!==game.id||activeGame.system!==game.system||activeGame.size!==game.size||target(activeGame).key!==core.key)fail(tr('ゲームの状態が変わりました。'));return add();}
 if(!navigator.locks)fail(tr('取り込みにはWeb Locks対応の最新版ブラウザが必要です。'));
 return navigator.locks.request('local-game:'+game.id,{ifAvailable:true},lock=>{if(!lock)fail(tr('別のタブでプレイ中です。終了してからやり直してください。'));return add();});
}
export const exportState=guardUpdateTask(create),inspectState=guardUpdateTask(inspect),importState=guardUpdateTask(restore);
