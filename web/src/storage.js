// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from './i18n/index.js';
import {retainArchive,retainHistory} from './save-history.js';
import {guardUpdateTask} from './update-activity.js';
import {coreRegistry,supportsGame,coreFor,saveKey} from './core-registry.js';
import {withSkinChoice,withoutSkinChoice} from './skin-selection.js';
import {sanitizeGamePreferences} from './game-preferences.js';
const stores=['library','roms','saves','states','backups','archives','recoveries','sessions','skins','coverCatalogs'];
const database=new Promise((resolve,reject)=>{
 const r=indexedDB.open('manicemu-web',5);let blocked=false;
 r.onupgradeneeded=()=>{for(const s of stores)if(!r.result.objectStoreNames.contains(s))r.result.createObjectStore(s);};
 r.onblocked=()=>{blocked=true;reject(new Error(tr('保存機能の更新が必要です。このアプリのほかのタブを閉じ、このページを開き直してください。サイトデータは削除しないでください。')));};
 r.onsuccess=()=>{if(blocked){r.result.close();return;}r.result.onversionchange=()=>r.result.close();resolve(r.result);};r.onerror=()=>reject(r.error);
});
function write(db,names){try{return db.transaction(names,'readwrite',{durability:'strict'});}catch(e){if(e instanceof TypeError)return db.transaction(names,'readwrite');throw e;}}
async function get(store,key){const db=await database;return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function has(store,key){const db=await database;return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).count(key);r.onsuccess=()=>resolve(r.result>0);r.onerror=()=>reject(r.error);});}
async function all(store){const db=await database;return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
// A gallery keeps metadata only; image bytes are loaded for visible previews.
export async function skinCatalog(){const db=await database;return new Promise((resolve,reject)=>{
 const tx=db.transaction('skins'),request=tx.objectStore('skins').openCursor(),rows=[];
 request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const {id,name,system,importedAt}=cursor.value;rows.push({id,name,system,importedAt});cursor.continue();};
 tx.oncomplete=()=>resolve(rows);tx.onabort=()=>reject(tx.error||new Error(tr('スキンの一覧を開けませんでした。')));
});}
async function put(store,key,data){const db=await database;return new Promise((resolve,reject)=>{const tx=write(db,store);tx.objectStore(store).put(data,key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error(tr('保存が中断されました。')));tx.onerror=()=>{};});}
async function remove(store,key){const db=await database;return new Promise((resolve,reject)=>{const tx=write(db,store);tx.objectStore(store).delete(key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}
// Commit a confirmed selection of this game's manual states as one operation.
async function removeStates(id,keys){
 if(!keys.length||keys.some(key=>typeof key!=='string'||!key.startsWith(id+':')))throw new Error(tr('削除するステートを確認してください。'));
 const db=await database;return new Promise((resolve,reject)=>{const tx=write(db,'states');for(const key of new Set(keys))tx.objectStore('states').delete(key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error(tr('削除できませんでした。')));});
}
async function addGame(game,bytes){const db=await database;return new Promise((resolve,reject)=>{
 const tx=write(db,['library','roms']);let failure;
 tx.oncomplete=resolve;tx.onabort=()=>reject(failure||tx.error||new Error(tr('ゲームの保存が中断されました。')));tx.onerror=()=>{};
 const abort=e=>{failure=e;tx.abort();};
 try{
  // Preserve existing metadata when repairing a missing ROM or importing in
  // two tabs. A synchronous clone/quota error must roll back both stores.
  const library=tx.objectStore('library'),request=library.get(game.id);
  request.onsuccess=()=>{try{if(!request.result)library.put(game,game.id);else if(request.result.romMissing){const restored={...request.result};delete restored.romMissing;delete restored.romDetachedAt;library.put(restored,game.id);}}catch(e){abort(e);}};
  tx.objectStore('roms').put(bytes,game.id);
 }catch(e){abort(e);}
});}
// Update only artwork, atomically. A delayed download must neither resurrect a
// deleted game nor replace a hand-picked cover or newer game metadata.
async function setGameCover(id,cover,{onlyMissing=false}={}){const db=await database;return new Promise((resolve,reject)=>{
 const tx=write(db,'library'),store=tx.objectStore('library'),request=store.get(id);let result=null;
 request.onsuccess=()=>{const game=request.result;if(!game||(onlyMissing&&game.cover&&game.coverSource!=='screenshot'))return;Object.assign(game,{cover:cover.cover,coverSource:cover.coverSource,coverTitle:cover.coverTitle||'',coverUrl:cover.coverUrl||''});store.put(game,id);result=game;};
 tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error||new Error(tr('カバーを保存できませんでした。')));tx.onerror=()=>{};
});}
// Change only the skin field; do not overwrite newer names, favorites or cheats.
async function setGameSkin(id,skinId,orientation){const db=await database;return new Promise((resolve,reject)=>{
 const tx=write(db,['library']),store=tx.objectStore('library'),request=store.get(id);let failure,result;
 request.onsuccess=()=>{const game=request.result;if(!game){failure=new Error(tr('ゲームが見つかりません。'));tx.abort();return;}try{result=orientation===undefined?skinId:withSkinChoice(game.skinId,orientation,skinId);}catch(e){failure=e;tx.abort();return;}if(result)game.skinId=result;else delete game.skinId;store.put(game,id);};
 tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||new Error(tr('スキン設定を保存できませんでした。')));tx.onerror=()=>{};
});}
// Preserve ROM/save data and other game metadata when editing control positions.
async function setGameControls(id,layout){const db=await database;return new Promise((resolve,reject)=>{
 const tx=write(db,['library']),store=tx.objectStore('library'),request=store.get(id);let failure;
 request.onsuccess=()=>{const game=request.result;if(!game){failure=new Error(tr('ゲームが見つかりません。'));tx.abort();return;}if(layout===null)delete game.controlLayout;else game.controlLayout=layout;store.put(game,id);};
 tx.oncomplete=resolve;tx.onabort=()=>reject(failure||tx.error||new Error(tr('ボタンの設定を保存できませんでした。')));tx.onerror=()=>{};
});}
// Merge one shortcut position into the latest layout; never replace unrelated edits.
async function setGameCameraPosition(id,orientation,{x,y},fallbackLayout){
 if(!['portrait','landscape'].includes(orientation)||!Number.isFinite(x)||!Number.isFinite(y))throw new TypeError('Invalid screenshot button position');
 const db=await database;return new Promise((resolve,reject)=>{
  const tx=write(db,'library'),store=tx.objectStore('library'),request=store.get(id);let failure,result;
  tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||new Error(tr('ボタンの設定を保存できませんでした。')));tx.onerror=()=>{};
  request.onsuccess=()=>{try{
   const game=request.result;if(!game)throw new Error(tr('ゲームが見つかりません。'));
   result=structuredClone(game.controlLayout??fallbackLayout??{});
   result[orientation]={...result[orientation],'player-camera':{...result[orientation]?.['player-camera'],x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y))}};
   game.controlLayout=result;store.put(game,id);
  }catch(e){failure=e;tx.abort();}};
 });
}
export const setGameCameraPositionWithActivity=guardUpdateTask(setGameCameraPosition);
export {setGameCameraPositionWithActivity as setGameCameraPosition};
// Patch only per-game preferences; concurrent cover/name edits remain intact.
async function setGamePreferences(id,preferences){const db=await database;return new Promise((resolve,reject)=>{
 const tx=write(db,'library'),store=tx.objectStore('library'),request=store.get(id);let failure,result;
 tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||Error(tr('ゲームの設定を保存できませんでした。')));tx.onerror=()=>{};
 request.onsuccess=()=>{try{const game=request.result;if(!game)throw Error(tr('ゲームが見つかりません。'));result=preferences===null?null:sanitizeGamePreferences(preferences);if(result===null)delete game.preferences;else game.preferences=result;store.put(game,id);}catch(e){failure=e;tx.abort();}};
});}
function libraryIds(ids){
 if(!Array.isArray(ids)||!ids.length||Array.from(ids).some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id)))throw Error(tr('対象のゲームを選び直してください。'));
 return [...new Set(ids)];
}
// Read and patch all selected rows in one transaction. Never write a stale card
// snapshot over an independently updated cover, name, settings or play time.
async function setGamesLibraryMetadata(ids,patch){
 ids=libraryIds(ids);
 if(!patch||Object.getPrototypeOf(patch)!==Object.prototype||!Object.keys(patch).length||Object.keys(patch).some(key=>!['category','favorite'].includes(key))||Object.hasOwn(patch,'category')&&!['','playing','completed','backlog'].includes(patch.category)||Object.hasOwn(patch,'favorite')&&typeof patch.favorite!=='boolean')throw Error(tr('分類またはお気に入りの設定が正しくありません。'));
 return patchLibrary(ids,{...patch},tr('ゲームの分類を保存できませんでした。'));
}
async function setGameDetails(id,patch){
 const ids=libraryIds([id]);
 if(!patch||Object.getPrototypeOf(patch)!==Object.prototype||!Object.keys(patch).length||Object.keys(patch).some(key=>!['name','lastPlayed','playDuration'].includes(key))||Object.hasOwn(patch,'name')&&(typeof patch.name!=='string'||!patch.name.trim()||patch.name.trim().length>120)||['lastPlayed','playDuration'].some(key=>Object.hasOwn(patch,key)&&(!Number.isFinite(patch[key])||patch[key]<0)))throw Error(tr('ゲーム名またはプレイ情報が正しくありません。'));
 const changes={...patch};if(Object.hasOwn(changes,'name'))changes.name=changes.name.trim();
 return (await patchLibrary(ids,changes,tr('ゲームの情報を保存できませんでした。')))[0];
}
async function setGameCheats(id,coreKey,next){
 const ids=libraryIds([id]);
 if(!Array.isArray(next)||next.length>100||Array.from(next).some(item=>!item||Object.getPrototypeOf(item)!==Object.prototype||Object.keys(item).some(key=>!['name','code','type','enabled'].includes(key))||typeof item.name!=='string'||item.name.length>120||typeof item.code!=='string'||item.code.length>16384||!Number.isInteger(item.type)||item.type<0||item.type>4||typeof item.enabled!=='boolean'))throw Error(tr('チート設定が正しくありません。'));
 const cheats=next.map(item=>({...item}));
 return (await patchLibrary(ids,game=>{
  const cores=coreRegistry[game.system],core=cores?.find(item=>item.key===coreKey);
  if(!core?.cheats||!supportsGame(core,game))throw Error(tr('このゲームで使用できるチート用コアではありません。'));
  return cores[0].key===coreKey?{cheats}:{coreCheats:{...game.coreCheats,[coreKey]:cheats}};
 },tr('チート設定を保存できませんでした。')))[0];
}
async function patchLibrary(ids,changes,message){
 const db=await database;
 return new Promise((resolve,reject)=>{
  const tx=write(db,'library'),store=tx.objectStore('library'),result=new Array(ids.length);let pending=ids.length,failure;
  const abort=e=>{failure=e;try{tx.abort();}catch{}};
  tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||Error(message));tx.onerror=()=>{};
  for(const [i,id] of ids.entries()){
   const request=store.get(id);request.onsuccess=()=>{try{
    const game=request.result;if(!game||game.id!==id)throw Error(tr('ゲーム一覧が変わりました。対象を選び直してください。'));result[i]=game;
    if(--pending)return;
    for(const row of result){for(const [field,value] of Object.entries(typeof changes==='function'?changes(row):changes)){if(field==='category'&&value==='')delete row.category;else row[field]=value;}store.put(row,row.id);}
   }catch(e){abort(e);}};
  }
 });
}
// Deleted skins cannot leave game-specific overrides pointing to missing artwork.
async function removeSkin(id){const db=await database;return new Promise((resolve,reject)=>{
 const tx=write(db,['skins','library']);tx.objectStore('skins').delete(id);
 const request=tx.objectStore('library').openCursor();request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const game=cursor.value,next=withoutSkinChoice(game.skinId,id);if(next!==game.skinId){if(next)game.skinId=next;else delete game.skinId;cursor.update(game);}cursor.continue();};
 tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error(tr('スキンを削除できませんでした。')));tx.onerror=()=>{};
});}
async function removeGame(id){return removeGames([id]);}
async function removeGames(ids){
 ids=libraryIds(ids).sort();
 if(!navigator.locks)throw Error(tr('保存を保護するため、最新版のブラウザを使用してください。'));
 // Acquire every lock before touching IndexedDB. If a later game is active,
 // unwinding releases earlier locks without deleting any selected data.
 const next=i=>i===ids.length?deleteGames(ids):navigator.locks.request('local-game:'+ids[i],{ifAvailable:true},lock=>{if(!lock)throw Error(tr('選択したゲームは別のタブでプレイ中です。終了してから削除してください。'));return next(i+1);});
 return next(0);
}
async function setGameCore(id,key){
 if(!navigator.locks)throw Error(tr('最新版のブラウザを使用してください。'));
 return navigator.locks.request('local-game:'+id,{ifAvailable:true},async lock=>{
  if(!lock)throw Error(tr('このゲームはプレイ中です。終了してからコアを変更してください。'));
  const db=await database;return new Promise((resolve,reject)=>{
   const tx=write(db,'library'),store=tx.objectStore('library'),request=store.get(id);let result,failure;
   request.onsuccess=()=>{const game=request.result,core=coreRegistry[game?.system]?.find(c=>c.key===key);if(!game||!core||!supportsGame(core,game)){failure=Error(tr('このゲームで選択できるコアではありません。'));tx.abort();return;}result={...game,coreKey:key};store.put(result,id);};
   tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||Error(tr('コアを変更できませんでした。')));tx.onerror=()=>{};
  });
 });
}
async function deleteGames(ids){const db=await database;return new Promise((resolve,reject)=>{
 const tx=write(db,['library','roms','saves','states','backups','archives','recoveries','sessions','coverCatalogs']);let pending=ids.length,failure;
 const abort=e=>{failure=e;try{tx.abort();}catch{}};
 tx.oncomplete=()=>resolve(ids.length);tx.onabort=()=>reject(failure||tx.error||Error(tr('削除が中断されました。元のゲームと保存データは残っています。')));tx.onerror=()=>{};
 for(const id of ids){const request=tx.objectStore('library').get(id);request.onsuccess=()=>{try{
  if(!request.result||request.result.id!==id)throw Error(tr('ゲーム一覧が変わりました。対象を選び直してください。'));
  if(--pending)return;
  for(const selected of ids){
   tx.objectStore('coverCatalogs').delete(romUpdateMetadataPrefix+selected);
   for(const name of ['library','roms','saves','backups','archives','recoveries','sessions']){const store=tx.objectStore(name);store.delete(selected);if(name!=='library'&&name!=='roms')store.delete(IDBKeyRange.bound(selected+'@',selected+'@\uffff'));}
   const states=tx.objectStore('states');states.delete(IDBKeyRange.bound(selected+':',selected+':\uffff'));states.delete(IDBKeyRange.bound(selected+'@',selected+'@\uffff'));
  }
 }catch(e){abort(e);}};}
});}
const equal=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((v,i)=>v===b[i]);
// Save, retained generations and crash marker commit together, or none do.
// No asynchronous hashing/network calls are allowed inside this transaction.
async function commitProtection(id,sessionId,save,recovery,clean=false){
 return commitProtectionBatch([{id,sessionId,save,recovery,clean}]);
}
async function commitProtectionBatch(entries){
 const db=await database;return new Promise((resolve,reject)=>{
  const tx=write(db,['saves','backups','archives','recoveries','sessions']);let failure;
  const abort=e=>{failure=e;try{tx.abort();}catch{}};
  // A synchronous put()/clone failure inside onsuccess must abort the entire
  // save too, preserving both the previous save and its recovery generations.
  const safely=callback=>()=>{try{callback();}catch(e){abort(e);}};
  tx.oncomplete=resolve;tx.onabort=()=>reject(failure||tx.error||new Error(tr('保存が中断されました。以前の保存データは残っています。')));tx.onerror=()=>{};
  for(const {id,sessionId,save,recovery,clean=false} of entries){
  const sessions=tx.objectStore('sessions'),request=sessions.get(id);
  request.onsuccess=safely(()=>{
   const session=request.result;
   if(!session||session.id!==sessionId)throw new Error(tr('別のタブで保存中のため、このタブでの保存を中止しました。'));
   if(save?.bytes?.length){
    const saves=tx.objectStore('saves'),old=saves.get(id);
    old.onsuccess=safely(()=>{
     if(old.result?.bytes?.length&&!equal(new Uint8Array(old.result.bytes),new Uint8Array(save.bytes))){
      const history=tx.objectStore('backups'),r=history.get(id);
      r.onsuccess=safely(()=>history.put(retainHistory([old.result,...(r.result||[])],5),id));
     }
     saves.put(save,id);
     const archives=tx.objectStore('archives'),request=archives.get(id);request.onsuccess=safely(()=>{const previous=request.result||[],next=retainArchive(previous,save);if(next!==previous)archives.put(next,id);});
    });
   }
   if(recovery){const store=tx.objectStore('recoveries'),r=store.get(id);r.onsuccess=safely(()=>store.put(retainHistory([recovery,...(r.result||[])],5),id));}
   sessions.put({...session,dirty:!clean,checkedAt:Date.now()},id);
  });
  }
 });
}

async function stateEntries(id){const db=await database;return new Promise((resolve,reject)=>{const list=[],r=db.transaction('states').objectStore('states').openCursor(IDBKeyRange.bound(id+':',id+':\uffff'));r.onsuccess=()=>{const c=r.result;if(!c){resolve(list);return;}list.push({key:c.key,value:c.value});c.continue();};r.onerror=()=>reject(r.error);});}

// Private metadata keys share the existing catalog store to avoid a disruptive
// database upgrade while another tab is playing. No catalog API enumerates it.
export const backupMetadataPrefix='\u0001palmo-backup:';
const backupStores=['saves','states','backups','archives','recoveries'];
async function readBackupData({summary=false}={}){const db=await database;return new Promise((resolve,reject)=>{
 const tx=db.transaction(['library',...backupStores]),result={games:[],records:[]};let bytes=0,failure;
 for(const name of ['library',...backupStores]){const request=tx.objectStore(name).openCursor();request.onsuccess=()=>{try{const c=request.result;if(!c)return;
  const project=(value,fields)=>Object.fromEntries(fields.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
  if(name==='library')result.games.push(summary?project(c.value,['id','system','size','name','romMissing']):{category:'',favorite:false,...project(c.value,['id','system','size','preferences','coreKey','cheats','coreCheats','controlLayout','category','favorite'])});else{const rows=Array.isArray(c.value)?c.value:[c.value],values=rows.map(item=>project(item,summary?['at']:['bytes','hash','at','coreId','save','saveHash']));result.records.push({store:name,key:c.key,value:Array.isArray(c.value)?values:values[0]});for(const item of values)bytes+=(item.bytes?.byteLength||0)+(item.save?.byteLength||0);}
  if(!summary&&(result.games.length>1000||result.records.length>10000||bytes>128*1048576)){failure=Error(tr('バックアップの上限（128 MiB／1000ゲーム／10000件）を超えています。個別に書き出してから整理してください。'));tx.abort();return;}c.continue();}catch(e){failure=Error(tr('バックアップ用の保存データを読めませんでした。'));tx.abort();}};}
 tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||Error(tr('バックアップ用のデータを読めませんでした。')));
});}
// Caller holds the selected local-game locks and validates all incoming bytes.
// Capture the actual previous values and replace data in the same transaction.
// ROM payloads are never read; count() only confirms each library entry exists.
async function restoreBackupData({games,records,settings,previousSettings,cleanGame,cleanRecord,maxBytes}){const db=await database;return new Promise((resolve,reject)=>{
 const tx=write(db,['library','roms',...backupStores,'coverCatalogs']),catalog=tx.objectStore('coverCatalogs'),ids=new Set(games.map(g=>g.id));
 let failure,pending=games.length*2+backupStores.length,previousBytes=0;const before={games:[],records:[]},remove=[];
 const abort=e=>{failure=e;try{tx.abort();}catch{}};
 const belongs=key=>typeof key==='string'&&ids.has(key.split(/[@:]/,1)[0]);
 const done=()=>{if(--pending)return;try{
  // Latest one only. Previous snapshot replacement is atomic with the restore.
  catalog.delete(IDBKeyRange.bound(backupMetadataPrefix,backupMetadataPrefix+'\uffff'));
  const meta={settings:previousSettings,games:before.games,count:before.records.length,at:Date.now()};
  catalog.put(meta,backupMetadataPrefix+'snapshot');
  before.records.forEach((record,i)=>catalog.put(record,backupMetadataPrefix+'record:'+i));
  if(settings!==undefined)catalog.put({settings},backupMetadataPrefix+'pending');
  for(const [store,key] of remove)tx.objectStore(store).delete(key);
  for(const record of records)tx.objectStore(record.store).put(record.value,record.key);
 }catch(e){abort(e);}};
 for(const incoming of games){
  const r=tx.objectStore('library').get(incoming.id);r.onsuccess=()=>{try{
   const game=r.result;if(!game||game.system!==incoming.system||game.size!==incoming.size)throw Error(tr('ゲーム一覧が変わりました。ファイルを選び直してください。'));
   before.games.push(cleanGame(game));
   for(const field of ['preferences','coreKey','cheats','coreCheats','controlLayout']){if(Object.hasOwn(incoming,field))game[field]=incoming[field];else delete game[field];}
   // Older portable backups did not include library organization. Preserve it
   // unless the archive explicitly supplies a value (including false/empty).
   if(Object.hasOwn(incoming,'category')){if(incoming.category)game.category=incoming.category;else delete game.category;}
   if(Object.hasOwn(incoming,'favorite'))game.favorite=incoming.favorite;
   tx.objectStore('library').put(game,game.id);done();
  }catch(e){abort(e);}};
  const check=tx.objectStore('roms').count(incoming.id);check.onsuccess=()=>{if(check.result){done();return;}const local=tx.objectStore('library').get(incoming.id);local.onsuccess=()=>{if(local.result?.romMissing===true)done();else abort(Error(tr('対象のROMがありません。先にROMを追加してください。')));};};
 }
 for(const name of backupStores){const r=tx.objectStore(name).openCursor();r.onsuccess=()=>{try{const c=r.result;if(!c){done();return;}if(belongs(c.key)){
   const record=cleanRecord({store:name,key:c.key,value:c.value});before.records.push(record);remove.push([name,c.key]);
   for(const item of Array.isArray(record.value)?record.value:[record.value])previousBytes+=(item.bytes?.byteLength||0)+(item.save?.byteLength||0);
   if(previousBytes>maxBytes||before.records.length>10000)throw Error(tr('復元前のデータが退避上限を超えています。個別に書き出してから整理してください。'));
  }c.continue();}catch(e){abort(e);}};}
 tx.oncomplete=()=>resolve({games:games.length,records:records.length});tx.onabort=()=>reject(failure||tx.error||Error(tr('復元が中断されました。元のデータは変更していません。')));tx.onerror=()=>{};
});}
async function readPreviousBackup(){const db=await database;return new Promise((resolve,reject)=>{
 const tx=db.transaction('coverCatalogs'),store=tx.objectStore('coverCatalogs'),r=store.get(backupMetadataPrefix+'snapshot');let result=null,failure;
 r.onsuccess=()=>{if(!r.result)return;if(!Number.isInteger(r.result.count)||r.result.count<0||r.result.count>10000){failure=Error(tr('復元前のバックアップ情報が正しくありません。'));tx.abort();return;}result={...r.result,records:[]};for(let i=0;i<result.count;i++){const q=store.get(backupMetadataPrefix+'record:'+i);q.onsuccess=()=>{result.records[i]=q.result;};}};
 tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||Error(tr('復元前のバックアップを読めませんでした。')));
});}

// New imports use add(), never put(): collisions cannot replace a saved state.
// The caller holds this game's local-game lock (or its active play session).
async function addImportedState(game,key,record){
 if(typeof key!=='string'||!key.startsWith(saveKey(game)+':'))throw Error(tr('ステートの保存先が正しくありません。'));
 const db=await database;return new Promise((resolve,reject)=>{
  const tx=write(db,['library','roms','states']);let failure,pending=2;
  const abort=e=>{failure=e;try{tx.abort();}catch{}};
  const done=()=>{if(--pending)return;try{tx.objectStore('states').add(record,key);}catch(e){abort(e);}};
  const current=tx.objectStore('library').get(game.id);current.onsuccess=()=>{try{const fresh=current.result;if(!fresh||fresh.system!==game.system||fresh.size!==game.size||coreFor(fresh).key!==coreFor(game).key)throw Error(tr('ゲームの設定が変わりました。ファイルを選び直してください。'));done();}catch(e){abort(e);}};
  const rom=tx.objectStore('roms').count(game.id);rom.onsuccess=()=>rom.result?done():abort(Error(tr('先に同じROMを追加してください。')));
  tx.oncomplete=resolve;tx.onabort=()=>reject(failure||tx.error||Error(tr('ステートを追加できませんでした。')));tx.onerror=()=>{};
 });
}
async function detachGameROM(id){
 libraryIds([id]);if(!navigator.locks)throw Error(tr('最新版のブラウザを使用してください。'));
 return navigator.locks.request('local-game:'+id,{ifAvailable:true},async lock=>{
  if(!lock)throw Error(tr('このゲームはプレイ中です。終了してから操作してください。'));
  const db=await database;return new Promise((resolve,reject)=>{
   const tx=write(db,['library','roms']),store=tx.objectStore('library'),r=store.get(id);let result,failure;
   r.onsuccess=()=>{if(!r.result){failure=Error(tr('ゲームが見つかりません。'));tx.abort();return;}result={...r.result,romMissing:true,romDetachedAt:Date.now()};store.put(result,id);tx.objectStore('roms').delete(id);};
   tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||Error(tr('ROMを取り外せませんでした。')));tx.onerror=()=>{};
  });
 });
}
export const romUpdateMetadataPrefix='\u0001palmo-rom-update:';
// Both game locks are held by the caller. Check the exact source bytes again
// inside the transaction; a concurrent save import must never be silently lost.
// New ROM, copied save and a permanent pre-update snapshot commit together.
async function commitGameROMUpdate({source,game,rom,save}){
 if(source.id===game.id||source.system!==game.system||!save?.bytes?.length)throw Error(tr('更新するROMとセーブを確認してください。'));
 const db=await database;return new Promise((resolve,reject)=>{
  const names=['library','roms','saves','states','backups','archives','recoveries','sessions','coverCatalogs'],tx=write(db,names);
  let failure,pending=3+6*3,existing,result;
  const abort=e=>{failure=e;try{tx.abort();}catch{}};
  const done=()=>{if(--pending)return;try{
   result={...(existing||game),coreKey:coreFor(source).key,romUpdate:{previousId:source.id,previousName:source.name,at:Date.now(),coreKey:coreFor(source).key}};
   delete result.romMissing;delete result.romDetachedAt;
   tx.objectStore('library').put(result,result.id);tx.objectStore('roms').put(rom,result.id);
   tx.objectStore('saves').add({...save},saveKey(result));
   tx.objectStore('coverCatalogs').add({sourceId:source.id,targetId:result.id,sourceName:source.name,system:source.system,coreKey:coreFor(source).key,save,at:result.romUpdate.at},romUpdateMetadataPrefix+result.id);
  }catch(e){abort(e);}};
  const previous=tx.objectStore('library').get(source.id);previous.onsuccess=()=>{try{const row=previous.result;if(!row||row.system!==source.system||row.size!==source.size||coreFor(row).key!==coreFor(source).key)throw Error(tr('元のゲームの設定が変わりました。やり直してください。'));done();}catch(e){abort(e);}};
  const saved=tx.objectStore('saves').get(saveKey(source));saved.onsuccess=()=>{if(saved.result?.at!==save.at||!equal(new Uint8Array(saved.result?.bytes||[]),new Uint8Array(save.bytes))){abort(Error(tr('元のセーブが変わりました。内容を確認してやり直してください。')));return;}done();};
  const target=tx.objectStore('library').get(game.id);target.onsuccess=()=>{existing=target.result;if(existing&&(existing.system!==game.system||existing.size!==game.size)){abort(Error(tr('追加先のゲーム情報が一致しません。')));return;}done();};
  for(const name of ['saves','states','backups','archives','recoveries','sessions'])for(const range of [game.id,IDBKeyRange.bound(game.id+'@',game.id+'@\uffff'),IDBKeyRange.bound(game.id+':',game.id+':\uffff')]){
   const r=tx.objectStore(name).count(range);r.onsuccess=()=>{if(r.result){abort(Error(tr('新版には保存データがあります。上書きを避けるため引き継ぎを中止しました。')));return;}done();};
  }
  tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||Error(tr('引き継ぎが中断されました。元のデータは残っています。')));tx.onerror=()=>{};
 });
}

// Keep storage work inside the update barrier, including waits for IndexedDB/locks.
const hasWithActivity=guardUpdateTask(has);
const getWithActivity=guardUpdateTask(get);
const allWithActivity=guardUpdateTask(all);
const putWithActivity=guardUpdateTask(put);
const removeWithActivity=guardUpdateTask(remove);
const removeStatesWithActivity=guardUpdateTask(removeStates);
const addGameWithActivity=guardUpdateTask(addGame);
const setGameCoverWithActivity=guardUpdateTask(setGameCover);
const setGameSkinWithActivity=guardUpdateTask(setGameSkin);
const setGameControlsWithActivity=guardUpdateTask(setGameControls);
const setGamesLibraryMetadataWithActivity=guardUpdateTask(setGamesLibraryMetadata),removeGamesWithActivity=guardUpdateTask(removeGames),setGameDetailsWithActivity=guardUpdateTask(setGameDetails),setGameCheatsWithActivity=guardUpdateTask(setGameCheats);
export {setGamesLibraryMetadataWithActivity as setGamesLibraryMetadata,removeGamesWithActivity as removeGames,setGameDetailsWithActivity as setGameDetails,setGameCheatsWithActivity as setGameCheats};
export const setGamePreferencesWithActivity=guardUpdateTask(setGamePreferences);
export {setGamePreferencesWithActivity as setGamePreferences};
const readBackupDataWithActivity=guardUpdateTask(readBackupData),restoreBackupDataWithActivity=guardUpdateTask(restoreBackupData),readPreviousBackupWithActivity=guardUpdateTask(readPreviousBackup);
export {readBackupDataWithActivity as readBackupData,restoreBackupDataWithActivity as restoreBackupData,readPreviousBackupWithActivity as readPreviousBackup};
const removeSkinWithActivity=guardUpdateTask(removeSkin);
const removeGameWithActivity=guardUpdateTask(removeGame);
const setGameCoreWithActivity=guardUpdateTask(setGameCore);
const commitProtectionBatchWithActivity=guardUpdateTask(commitProtectionBatch);
const commitProtectionWithActivity=guardUpdateTask(commitProtection);
const stateEntriesWithActivity=guardUpdateTask(stateEntries);
export const addState=guardUpdateTask(addImportedState);
export const detachROM=guardUpdateTask(detachGameROM);
export const commitROMUpdate=guardUpdateTask(commitGameROMUpdate);
export {hasWithActivity as has, commitProtectionBatchWithActivity as commitProtectionBatch, getWithActivity as get, allWithActivity as all, putWithActivity as put, removeWithActivity as remove, removeStatesWithActivity as removeStates, addGameWithActivity as addGame, setGameCoverWithActivity as setGameCover, setGameSkinWithActivity as setGameSkin, setGameControlsWithActivity as setGameControls, removeSkinWithActivity as removeSkin, removeGameWithActivity as removeGame, setGameCoreWithActivity as setGameCore, commitProtectionWithActivity as commitProtection, stateEntriesWithActivity as stateEntries};
