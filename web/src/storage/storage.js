// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
import {retainArchive,retainHistory} from './save-history.js';
import {guardUpdateTask} from '../updates/update-activity.js';
import {coreRegistry,supportsGame,coreFor,saveKey} from '../core/core-registry.js';
import {withSkinChoice,withoutSkinChoice} from '../skins/skin-selection.js';
import {sanitizeGamePreferences} from '../library/game-preferences.js';
import {trainerProfileKey,playRecordPrefix,playRecord,initialTrainerProfile,validTrainerAvatar} from '../library/trainer-profile.js';
import {inheritedROMCover,repairROMUpdateCovers} from '../library/rom-update-artwork.js';
const stores=['library','roms','saves','states','backups','archives','recoveries','sessions','skins','coverCatalogs'];
const database=new Promise((resolve,reject)=>{
 const r=indexedDB.open('manicemu-web',5);let blocked=false;
 r.onupgradeneeded=event=>{for(const s of stores)if(!r.result.objectStoreNames.contains(s))r.result.createObjectStore(s);if(event.oldVersion===0)r.transaction.objectStore('coverCatalogs').put(initialTrainerProfile([],{fresh:true}),trainerProfileKey);};
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
// Statistics contain metadata only. Merge each ROM's own cumulative duration,
// never copy a previous ROM's time into a new ROM's counter.
function rememberPlayRecord(tx,game,{restore=false}={}){
 const store=tx.objectStore('coverCatalogs'),request=store.get(playRecordPrefix+game.id);
 request.onsuccess=()=>{try{
  const record=playRecord(game,request.result);if(JSON.stringify(record)!==JSON.stringify(request.result))store.put(record,playRecordPrefix+game.id);
  if(restore&&record.playDuration>(game.playDuration||0)){game.playDuration=record.playDuration;tx.objectStore('library').put(game,game.id);}
 }catch{tx.abort();}};
}
async function readTrainerCard(readOnly=false){const db=await database;return new Promise((resolve,reject)=>{
 const tx=readOnly?db.transaction(['library','coverCatalogs']):write(db,['library','coverCatalogs']),store=tx.objectStore('coverCatalogs');let profile,games,records,pending=3,failure;
 const done=()=>{if(--pending)return;try{
  if(!profile){profile=initialTrainerProfile(games);if(!readOnly)store.put(profile,trainerProfileKey);}
  if(!readOnly){for(const game of repairROMUpdateCovers(games))tx.objectStore('library').put(game,game.id);for(const game of games)rememberPlayRecord(tx,game,{restore:true});}
 }catch(e){failure=e;tx.abort();}};
 const p=store.get(trainerProfileKey);p.onsuccess=()=>{profile=p.result;done();};
 const g=tx.objectStore('library').getAll();g.onsuccess=()=>{games=g.result;done();};
 // Do not read the large immutable save snapshots kept under another prefix.
 const r=store.getAll(IDBKeyRange.bound(playRecordPrefix,playRecordPrefix+'\uffff'));r.onsuccess=()=>{records=r.result;done();};
 tx.oncomplete=()=>resolve({profile,games,records});tx.onabort=()=>reject(failure||tx.error||Error(tr('プレイ記録を保存できませんでした。')));tx.onerror=()=>{};
}).catch(error=>{if(readOnly)throw error;return readTrainerCard(true);});}
async function setTrainerNickname(nickname){
 if(typeof nickname!=='string'||Array.from(nickname.trim()).length>30)throw Error(tr('ニックネームは30文字以内で入力してください。'));
 return patchTrainerProfile({nickname:nickname.trim()});
}
async function setTrainerAvatar(avatar){
 if(avatar!==''&&!validTrainerAvatar(avatar))throw Error(tr('画像の変換に失敗しました。'));
 return patchTrainerProfile({avatar});
}
async function patchTrainerProfile(patch){
 const db=await database;return new Promise((resolve,reject)=>{
  const tx=write(db,'coverCatalogs'),store=tx.objectStore('coverCatalogs');let profile,failure;
  const request=store.get(trainerProfileKey);request.onsuccess=()=>{try{profile={...(request.result||initialTrainerProfile([])),...patch};store.put(profile,trainerProfileKey);}catch(e){failure=e;tx.abort();}};
  tx.oncomplete=()=>resolve(profile);tx.onabort=()=>reject(failure||tx.error||Error(tr('保存できませんでした。もう一度お試しください。')));tx.onerror=()=>{};
 });
}
// Commit a confirmed selection of this game's manual states as one operation.
async function removeStates(id,keys){
 if(!keys.length||keys.some(key=>typeof key!=='string'||!key.startsWith(id+':')))throw new Error(tr('削除するステートを確認してください。'));
 const db=await database;return new Promise((resolve,reject)=>{const tx=write(db,'states');for(const key of new Set(keys))tx.objectStore('states').delete(key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error(tr('削除できませんでした。')));});
}
async function addGame(game,bytes){const db=await database;return new Promise((resolve,reject)=>{
 const tx=write(db,['library','roms','coverCatalogs']);let failure;
 tx.oncomplete=resolve;tx.onabort=()=>reject(failure||tx.error||new Error(tr('ゲームの保存が中断されました。')));tx.onerror=()=>{};
 const abort=e=>{failure=e;tx.abort();};
 try{
  // Preserve existing metadata when repairing a missing ROM or importing in
  // two tabs. A synchronous clone/quota error must roll back both stores.
  const library=tx.objectStore('library'),request=library.get(game.id);
  request.onsuccess=()=>{try{if(!request.result){library.put(game,game.id);rememberPlayRecord(tx,game,{restore:true});}else if(request.result.romMissing){const restored={...request.result};delete restored.romMissing;delete restored.romDetachedAt;library.put(restored,game.id);}}catch(e){abort(e);}};
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
  const tx=write(db,['library','coverCatalogs']),store=tx.objectStore('library'),result=new Array(ids.length);let pending=ids.length,failure;
  const abort=e=>{failure=e;try{tx.abort();}catch{}};
  tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||Error(message));tx.onerror=()=>{};
  for(const [i,id] of ids.entries()){
   const request=store.get(id);request.onsuccess=()=>{try{
    const game=request.result;if(!game||game.id!==id)throw Error(tr('ゲーム一覧が変わりました。対象を選び直してください。'));result[i]=game;
    if(--pending)return;
    for(const row of result){for(const [field,value] of Object.entries(typeof changes==='function'?changes(row):changes)){if(field==='category'&&value==='')delete row.category;else row[field]=value;}store.put(row,row.id);rememberPlayRecord(tx,row,{restore:true});}
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
  rememberPlayRecord(tx,request.result);
  if(--pending)return;
  for(const selected of ids){
   tx.objectStore('coverCatalogs').delete(romUpdateMetadataPrefix+selected);
   tx.objectStore('coverCatalogs').delete(IDBKeyRange.bound(saveRescuePrefix+selected+':',saveRescuePrefix+selected+':\uffff'));
   for(const name of ['library','roms','saves','backups','archives','recoveries','sessions']){const store=tx.objectStore(name);store.delete(selected);if(name!=='library'&&name!=='roms')store.delete(IDBKeyRange.bound(selected+'@',selected+'@\uffff'));}
   const states=tx.objectStore('states');states.delete(IDBKeyRange.bound(selected+':',selected+':\uffff'));states.delete(IDBKeyRange.bound(selected+'@',selected+'@\uffff'));
  }
 }catch(e){abort(e);}};}
});}
// Compare the visible byte ranges without copying large battery saves. Keep
// exact comparison even when stored hashes agree: hashes are metadata, not trust.
function byteView(value){
 if(value instanceof Uint8Array)return value;
 if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
 if(value instanceof ArrayBuffer)return new Uint8Array(value);
 // Preserve the legacy numeric-array representation when reading old records.
 return Array.isArray(value)?new Uint8Array(value):null;
}
function equal(a,b){
 a=byteView(a);b=byteView(b);if(!a||!b||a.length!==b.length)return false;
 for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;
 return true;
}
// Save, retained generations and crash marker commit together, or none do.
// No asynchronous hashing/network calls are allowed inside this transaction.
async function commitProtection(id,sessionId,save,recovery,clean=false){
 return commitProtectionBatch([{id,sessionId,save,recovery,clean}]);
}
// Serialize with every save transaction on the sessions store. Once this
// commits, a delayed write carrying the old owner can no longer commit.
async function rotateSaveSession(id,expectedSessionId){
 const db=await database;return new Promise((resolve,reject)=>{
  const tx=write(db,'sessions'),store=tx.objectStore('sessions'),request=store.get(id);let failure,nextId;
  tx.oncomplete=()=>resolve(nextId);
  tx.onabort=()=>reject(failure||tx.error||new Error(tr('保存が中断されました。以前の保存データは残っています。')));tx.onerror=()=>{};
  request.onsuccess=()=>{try{
   const session=request.result;
   if(!session||session.id!==expectedSessionId)throw new Error(tr('別のタブで保存中のため、このタブでの保存を中止しました。'));
   nextId=crypto.randomUUID();store.put({...session,id:nextId,dirty:true,checkedAt:Date.now()},id);
  }catch(e){failure=e;try{tx.abort();}catch{}}};
 });
}
async function commitProtectionBatch(entries){
 const db=await database;return new Promise((resolve,reject)=>{
  const tx=write(db,['saves','backups','archives','recoveries','sessions']);let failure;
  const abort=e=>{failure=e;try{tx.abort();}catch{}};
  // A synchronous put()/clone failure inside onsuccess must abort the entire
  // save too, preserving both the previous save and its recovery generations.
  const safely=callback=>()=>{try{callback();}catch(e){abort(e);}};
  tx.oncomplete=resolve;tx.onabort=()=>reject(failure||tx.error||new Error(tr('保存が中断されました。以前の保存データは残っています。')));tx.onerror=()=>{};
  for(const {id,sessionId,save,recovery,clean=false,resetRecovery=false} of entries){
  const sessions=tx.objectStore('sessions'),request=sessions.get(id);
  request.onsuccess=safely(()=>{
   const session=request.result;
   if(!session||session.id!==sessionId)throw new Error(tr('別のタブで保存中のため、このタブでの保存を中止しました。'));
   // Imported battery data supersedes automatic checkpoints paired with the
   // previous save. Clear them only with the successful save transaction;
   // manual states, battery backups and archives remain available explicitly.
   if(resetRecovery){if(!byteView(save?.bytes)?.length)throw new Error(tr('保存データがありません。'));tx.objectStore('recoveries').delete(id);}
   if(byteView(save?.bytes)?.length){
    const saves=tx.objectStore('saves'),old=saves.get(id);
    old.onsuccess=safely(()=>{
     if(byteView(old.result?.bytes)?.length&&!equal(old.result.bytes,save.bytes)){
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
async function stateKeys(id){const db=await database;return new Promise((resolve,reject)=>{const r=db.transaction('states').objectStore('states').getAllKeys(IDBKeyRange.bound(id+':',id+':\uffff'));r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}

// Private metadata keys share the existing catalog store to avoid a disruptive
// database upgrade while another tab is playing. No catalog API enumerates it.
export const backupMetadataPrefix='\u0001palmo-backup:';
const backupStores=['saves','states','backups','archives','recoveries'];
async function readBackupData({summary=false,gameIds,latestOnly=false,selectedRecords}={}){const db=await database;return new Promise((resolve,reject)=>{
 const tx=db.transaction(['library',...backupStores,'coverCatalogs']),result={games:[],records:[],playRecords:[]},ids=gameIds&&new Set(gameIds),selected=selectedRecords&&new Map(selectedRecords.map(r=>[r.store+':'+r.key,r]));let bytes=0,failure;
 const project=(value,fields)=>Object.fromEntries(fields.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
 const abort=e=>{failure=e;try{tx.abort();}catch{}};
 const append=(name,key,value)=>{
  const id=String(key).split(/[@:]/,1)[0],selection=selected?.get(name+':'+key);
  if(ids&&!ids.has(id)||name!=='library'&&(latestOnly&&name!=='saves'||selected&&!selection))return;
  if(name==='library')result.games.push({category:'',favorite:false,...project(value,['id','system','size','preferences','coreKey','cheats','coreCheats','controlLayout','category','favorite','added','lastPlayed','updatedAt','playDuration','romUpdate',...(summary?['name','romMissing']:[])])});
  else {
   const rows=Array.isArray(value)?value:[value],values=rows.flatMap((item,index)=>selection&&!selection.indices.includes(index)?[]:[summary?{...project(item,['at','hash','coreId','saveHash']),byteLength:(item.bytes?.byteLength||0)+(item.save?.byteLength||0)}:project(item,['bytes','hash','at','coreId','save','saveHash'])]);
   result.records.push({store:name,key,value:Array.isArray(value)?values:values[0]});for(const item of values)bytes+=(item.bytes?.byteLength||0)+(item.save?.byteLength||0);
  }
  if(result.games.length>1000||result.records.length>10000||!summary&&bytes>128*1048576)throw Error(tr('バックアップを分割して書き出してください。'));
 };
 for(const name of ['library',...backupStores]){
  if(name!=='library'&&selected){
   // Export only the requested part. Do not clone unrelated saves or states.
   for(const entry of selectedRecords.filter(record=>record.store===name)){const r=tx.objectStore(name).get(entry.key);r.onsuccess=()=>{try{if(r.result===undefined)throw Error(tr('保存データが変わりました。書き出し内容を選び直してください。'));append(name,entry.key,r.result);}catch(e){abort(e);}};}
  }else if(!(latestOnly&&name!=='library'&&name!=='saves')){
   const request=tx.objectStore(name).openCursor();request.onsuccess=()=>{try{const c=request.result;if(!c)return;append(name,c.key,c.value);c.continue();}catch(e){abort(e);}};
  }
 }
 const catalog=tx.objectStore('coverCatalogs'),profile=catalog.get(trainerProfileKey);profile.onsuccess=()=>{if(profile.result)result.profile=profile.result;};
 const records=catalog.getAll(IDBKeyRange.bound(playRecordPrefix,playRecordPrefix+'\uffff'));records.onsuccess=()=>{result.playRecords=records.result;};
 if(!latestOnly){
  if(selected){for(const entry of selectedRecords.filter(record=>record.store==='rom-updates')){const r=catalog.get(romUpdateMetadataPrefix+entry.key.split('@')[0]);r.onsuccess=()=>{try{if(!r.result)throw Error(tr('保存データが変わりました。書き出し内容を選び直してください。'));append('rom-updates',entry.key,r.result.save);}catch(e){abort(e);}};}}
  else {const updates=catalog.openCursor(IDBKeyRange.bound(romUpdateMetadataPrefix,romUpdateMetadataPrefix+'\uffff'));updates.onsuccess=()=>{try{const c=updates.result;if(!c)return;const item=c.value;append('rom-updates',item.targetId+'@'+item.coreKey,item.save);c.continue();}catch(e){abort(e);}};}
 }
 tx.oncomplete=()=>{const games=new Set(result.games.map(game=>game.id));result.records=result.records.filter(record=>games.has(record.key.split(/[@:]/,1)[0]));resolve(result);};tx.onabort=()=>reject(failure||tx.error||Error(tr('バックアップ用のデータを読めませんでした。')));
});}
// Caller holds the selected local-game locks and validates all incoming bytes.
// Capture the actual previous values and replace data in the same transaction.
// ROM payloads are never read; count() only confirms each library entry exists.
function backupRecordSummary(record){
 const project=item=>({at:item.at,hash:item.hash,coreId:item.coreId,saveHash:item.saveHash,byteLength:item.byteLength??((item.bytes?.byteLength||0)+(item.save?.byteLength||0))});
 return {store:record.store,key:record.key,value:Array.isArray(record.value)?record.value.map(project):project(record.value)};
}
function backupGameSummary(game){
 const fields=['id','system','size','preferences','coreKey','cheats','coreCheats','controlLayout','category','favorite','added','lastPlayed','updatedAt','playDuration','romUpdate'];
 return {category:'',favorite:false,...Object.fromEntries(fields.filter(key=>Object.hasOwn(game,key)).map(key=>[key,game[key]]))};
}
function backupSnapshotSignature(data,ids){
 return JSON.stringify({games:data.games.filter(game=>ids.has(game.id)).map(backupGameSummary).sort((a,b)=>a.id.localeCompare(b.id)),records:data.records.filter(record=>ids.has(record.key.split(/[@:]/,1)[0])).map(backupRecordSummary).sort((a,b)=>(a.store+':'+a.key).localeCompare(b.store+':'+b.key))});
}
function backupMetadataSignature(data){
 const value={settings:data.settings,profile:data.profile||null,playRecords:[...(data.playRecords||[])].sort((a,b)=>a.id.localeCompare(b.id))};
 return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
}
function mergeBackupHistory(name,current,incoming){
 const limit=name==='archives'?10:5,seen=new Set();
 const history=[...incoming,...(Array.isArray(current)?current:[])].sort((a,b)=>(b.at||0)-(a.at||0)).filter(item=>{const key=[item.hash,item.saveHash,item.at,item.coreId].join(':');if(seen.has(key))return false;seen.add(key);return true;});
 return retainHistory(history,limit);
}
async function restoreBackupData({games,records,settings,profile,playRecords=[],previousSettings,cleanGame,cleanRecord,merge=false,part}){
 // The caller keeps game/restore locks during this preflight and the transaction.
 // If play or edits happened since an unfinished split restore, protect that
 // newer data as a fresh baseline rather than retaining a stale rollback copy.
 const partId=part?.id,prior=partId?await get('coverCatalogs',backupMetadataPrefix+'snapshot'):null;
 let continuePart=!!(part&&prior&&prior.partId===partId&&prior.expected&&!prior.complete&&prior.partCount===part.count);
 if(continuePart){const ids=new Set(games.map(game=>game.id).filter(id=>prior.games.some(game=>game.id===id))),current=await readBackupData({summary:true,gameIds:[...ids]});continuePart=backupSnapshotSignature(current,ids)===backupSnapshotSignature(prior.expected,ids)&&backupMetadataSignature({...current,settings:previousSettings})===backupMetadataSignature(prior.expected);}
 const db=await database;return new Promise((resolve,reject)=>{
 const tx=write(db,['library','roms',...backupStores,'coverCatalogs']),catalog=tx.objectStore('coverCatalogs'),ids=new Set(games.map(g=>g.id));let failure;
 const abort=e=>{failure=e;try{tx.abort();}catch{}};
 const snapshot=catalog.get(backupMetadataPrefix+'snapshot');snapshot.onsuccess=()=>{try{
  const continuing=continuePart&&snapshot.result?.at===prior.at&&Array.isArray(snapshot.result.entries);
  const before=continuing?snapshot.result:{settings:previousSettings,games:[],playRecords:[],entries:[],at:Date.now(),...(partId?{partId,partCount:part.count,completedParts:[]}:{})};
  if(!continuing)catalog.delete(IDBKeyRange.bound(backupMetadataPrefix,backupMetadataPrefix+'\uffff'));
  const protectedIds=new Set(before.games.map(game=>game.id)),newIds=new Set([...ids].filter(id=>!protectedIds.has(id))),updatedGames=new Map(),merged=new Set(),incoming=new Map(records.map(record=>[record.store+':'+record.key,record]));let pending=games.length*2+backupStores.length+3,currentRecords=[],currentProfile=null;
  const expectedGames=new Map((before.expected?.games||[]).map(game=>[game.id,game])),expectedRecords=new Map((before.expected?.records||[]).filter(record=>!ids.has(record.key.split(/[@:]/,1)[0])).map(record=>[record.store+':'+record.key,record]));
  const done=()=>{if(--pending)return;try{
   if(before.entries.length>10000)throw Error(tr('復元前のデータの件数上限を超えています。'));
   before.count=before.entries.length;
   if(settings!==undefined)catalog.put({settings},backupMetadataPrefix+'pending');
   if(profile!==undefined)catalog.put(profile,trainerProfileKey);
   const previousRecords=new Map(currentRecords.map(record=>[record.id,record]));
   for(const record of playRecords){
    const existing=previousRecords.get(record.id);if(existing&&existing.system!==record.system)throw Error(tr('プレイ記録の機種が一致しません。'));
    const next=playRecord(record,existing);previousRecords.set(record.id,next);catalog.put(next,playRecordPrefix+record.id);
   }
   for(const game of updatedGames.values()){
    // Same-ROM counters are maxima, never sums. Re-importing any part is idempotent.
    const remembered=previousRecords.get(game.id);if(remembered?.system===game.system){for(const field of ['playDuration','lastPlayed'])if(remembered[field]||Object.hasOwn(game,field))game[field]=Math.max(game[field]||0,remembered[field]||0);}
    tx.objectStore('library').put(game,game.id);expectedGames.set(game.id,backupGameSummary(game));
   }
   for(const record of records)if(!merged.has(record.store+':'+record.key)){
    if(record.store==='rom-updates'){const game=updatedGames.get(record.key.split('@')[0]),link=game.romUpdate;catalog.put({sourceId:link.previousId,targetId:game.id,sourceName:link.previousName,system:game.system,coreKey:link.coreKey,save:record.value,at:link.at},romUpdateMetadataPrefix+game.id);}
    else tx.objectStore(record.store).put(record.value,record.key);
    expectedRecords.set(record.store+':'+record.key,backupRecordSummary(record));
   }
   if(part){before.completedParts=[...new Set([...before.completedParts,part.index])];before.complete=before.completedParts.length===part.count;before.expected={games:[...expectedGames.values()],records:[...expectedRecords.values()],settings:settings===undefined?previousSettings:settings,profile:profile===undefined?currentProfile:profile,playRecords:[...previousRecords.values()]};}
   catalog.put(before,backupMetadataPrefix+'snapshot');
  }catch(e){abort(e);}};
  const p=catalog.get(trainerProfileKey);p.onsuccess=()=>{currentProfile=p.result||null;if(!continuing&&p.result)before.profile=p.result;done();};
  const stats=catalog.getAll(IDBKeyRange.bound(playRecordPrefix,playRecordPrefix+'\uffff'));stats.onsuccess=()=>{currentRecords=stats.result;if(!continuing)before.playRecords=currentRecords;done();};
  const updates=catalog.openCursor(IDBKeyRange.bound(romUpdateMetadataPrefix,romUpdateMetadataPrefix+'\uffff'));updates.onsuccess=()=>{try{const c=updates.result;if(!c){done();return;}const value=c.value;if(ids.has(value.targetId)){if(newIds.has(value.targetId)){const key=backupMetadataPrefix+'record:'+before.entries.length;catalog.put(cleanRecord({store:'rom-updates',key:value.targetId+'@'+value.coreKey,value:value.save}),key);before.entries.push({key,store:'rom-updates',recordKey:value.targetId+'@'+value.coreKey});}if(!merge&&games.some(game=>game.id===value.targetId&&game.romUpdate))c.delete();else{const record={store:'rom-updates',key:value.targetId+'@'+value.coreKey,value:value.save};expectedRecords.set(record.store+':'+record.key,backupRecordSummary(record));}}c.continue();}catch(e){abort(e);}};
  for(const entry of games){
   const r=tx.objectStore('library').get(entry.id);r.onsuccess=()=>{try{
    const game=r.result;if(!game||game.system!==entry.system||game.size!==entry.size)throw Error(tr('ゲーム一覧が変わりました。ファイルを選び直してください。'));
    if(newIds.has(game.id))before.games.push(cleanGame(game));
    for(const field of ['preferences','coreKey','cheats','coreCheats','controlLayout']){if(Object.hasOwn(entry,field))game[field]=entry[field];else delete game[field];}
    if(Object.hasOwn(entry,'category')){if(entry.category)game.category=entry.category;else delete game.category;}
    if(Object.hasOwn(entry,'favorite'))game.favorite=entry.favorite;
    for(const field of ['playDuration','lastPlayed','updatedAt'])if(Object.hasOwn(entry,field))game[field]=Math.max(game[field]||0,entry[field]);
    if(entry.added)game.added=game.added?Math.min(game.added,entry.added):entry.added;
    if(entry.romUpdate)game.romUpdate=entry.romUpdate;
    updatedGames.set(game.id,game);done();
   }catch(e){abort(e);}};
   const check=tx.objectStore('roms').count(entry.id);check.onsuccess=()=>{if(check.result){done();return;}const local=tx.objectStore('library').get(entry.id);local.onsuccess=()=>{if(local.result?.romMissing===true)done();else abort(Error(tr('対象のROMがありません。先にROMを追加してください。')));};};
  }
  for(const name of backupStores){const r=tx.objectStore(name).openCursor();r.onsuccess=()=>{try{
   const c=r.result;if(!c){done();return;}const id=String(c.key).split(/[@:]/,1)[0];
   if(ids.has(id)){
    // Write each prior record straight to IndexedDB instead of accumulating
    // all selected games' buffers in JS memory. Transaction abort restores it.
    if(newIds.has(id)){const key=backupMetadataPrefix+'record:'+before.entries.length;catalog.put(cleanRecord({store:name,key:c.key,value:c.value}),key);before.entries.push({key,store:name,recordKey:c.key});}
    if(!merge)c.delete();
    else {const token=name+':'+c.key,entry=incoming.get(token);let value=c.value;if(entry&&Array.isArray(entry.value)){value=mergeBackupHistory(name,c.value,entry.value);c.update(value);merged.add(token);}expectedRecords.set(token,backupRecordSummary({store:name,key:c.key,value}));}
   }c.continue();
  }catch(e){abort(e);}};}
 }catch(e){abort(e);}};
 tx.oncomplete=()=>resolve({games:games.length,records:records.length});tx.onabort=()=>reject(failure||tx.error||Error(tr('復元が中断されました。元のデータは変更していません。')));tx.onerror=()=>{};
});}
async function readPreviousBackup({summary=false,selectedRecords}={}){const db=await database;return new Promise((resolve,reject)=>{
 const tx=db.transaction('coverCatalogs'),store=tx.objectStore('coverCatalogs'),r=store.get(backupMetadataPrefix+'snapshot'),selected=selectedRecords&&new Map(selectedRecords.map(record=>[record.store+':'+record.key,record]));let result=null,failure,bytes=0;
 r.onsuccess=()=>{if(!r.result)return;if(!Number.isInteger(r.result.count)||r.result.count<0||r.result.count>10000){failure=Error(tr('復元前のバックアップ情報が正しくありません。'));tx.abort();return;}result={...r.result,records:[]};
  const entries=r.result.entries||Array.from({length:r.result.count},(_,i)=>backupMetadataPrefix+'record:'+i);
  for(const entry of entries){if(selected&&typeof entry==='object'&&!selected.has(entry.store+':'+entry.recordKey))continue;const q=store.get(typeof entry==='object'?entry.key:entry);q.onsuccess=()=>{try{const record=q.result;if(!record)throw Error(tr('復元前のバックアップ情報が正しくありません。'));const choice=selected?.get(record.store+':'+record.key);if(selected&&!choice)return;
   const values=(Array.isArray(record.value)?record.value:[record.value]).flatMap((item,index)=>choice&&!choice.indices.includes(index)?[]:[summary?{at:item.at,hash:item.hash,coreId:item.coreId,saveHash:item.saveHash,byteLength:(item.bytes?.byteLength||0)+(item.save?.byteLength||0)}:item]);
   for(const item of values)bytes+=(item.bytes?.byteLength||0)+(item.save?.byteLength||0);if(bytes>128*1048576)throw Error(tr('復元前のデータが大きいため、分割して書き出してください。'));
   result.records.push({...record,value:Array.isArray(record.value)?values:values[0]});
  }catch(e){failure=e;tx.abort();}};}
 };
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
export const saveRescuePrefix='\u0001palmo-save-rescue:';
async function readSaveRescueOriginals(id,coreKey){
 libraryIds([id]);const db=await database;
 return new Promise((resolve,reject)=>{const rows=[],tx=db.transaction('coverCatalogs'),request=tx.objectStore('coverCatalogs').openCursor(IDBKeyRange.bound(saveRescuePrefix+id+':',saveRescuePrefix+id+':\uffff'));
  request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const value=cursor.value;if(value.coreKey===coreKey)rows.push({key:cursor.key,at:value.at,saveAt:value.save?.at||0,bytes:byteView(value.save?.bytes)?.length||0});cursor.continue();};
  tx.oncomplete=()=>resolve(rows.sort((a,b)=>b.at-a.at));tx.onabort=()=>reject(tx.error||Error(tr('保存履歴を開けませんでした。')));
 });
}
// The caller holds this game's Web Lock and has verified the selected history.
// Check exact bytes again inside the transaction. A damaged original is stored
// unchanged under a separate, immutable key before replacing the current save.
async function commitSaveRescue({game,original,source,record,save}){
 libraryIds([game.id]);if(!['backups','archives','recoveries','states'].includes(source.store)||(source.store==='states'?(typeof source.key!=='string'||!source.key.startsWith(saveKey(game)+':')):(!Number.isInteger(source.index)||source.index<0))||!save?.bytes?.length||save.bytes.length>coreFor(game).maxSave)throw Error(tr('保存履歴を選び直してください。'));
 const same=(a,b)=>!a&&!b||!!a&&!!b&&a.at===b.at&&a.hash===b.hash&&a.coreId===b.coreId&&(equal(a.bytes,b.bytes)||!a.bytes&&!b.bytes);
 const db=await database;return new Promise((resolve,reject)=>{
  const tx=write(db,['library','saves',source.store,'sessions','coverCatalogs']),key=saveKey(game);let pending=3,failure;
  const abort=error=>{failure=error;try{tx.abort();}catch{}};
  const done=()=>{if(--pending)return;try{
   if(original!==undefined)tx.objectStore('coverCatalogs').add({gameId:game.id,coreKey:coreFor(game).key,at:Date.now(),save:original},saveRescuePrefix+game.id+':'+crypto.randomUUID());
   tx.objectStore('saves').put(save,key);
   // Fence any delayed writer; keep all histories intact for explicit recovery.
   tx.objectStore('sessions').put({id:crypto.randomUUID(),dirty:false,checkedAt:Date.now(),coreId:coreFor(game).id},key);
  }catch(e){abort(e);}};
  const gameRequest=tx.objectStore('library').get(game.id);gameRequest.onsuccess=()=>{try{const fresh=gameRequest.result;if(!fresh||fresh.system!==game.system||fresh.size!==game.size||coreFor(fresh).key!==coreFor(game).key)throw Error(tr('ゲームの設定が変わりました。保存履歴を開き直してください。'));done();}catch(e){abort(e);}};
  const saved=tx.objectStore('saves').get(key);saved.onsuccess=()=>{if(!same(saved.result,original)){abort(Error(tr('現在のセーブが変わりました。保存履歴を開き直してください。')));return;}done();};
  const history=tx.objectStore(source.store).get(source.store==='states'?source.key:key);history.onsuccess=()=>{const entry=source.store==='states'?history.result:history.result?.[source.index],actual=['recoveries','states'].includes(source.store)?{bytes:entry?.save,hash:entry?.saveHash,at:entry?.at,coreId:entry?.coreId}:entry;if(!same(actual,record)){abort(Error(tr('保存履歴が変わりました。開き直して選び直してください。')));return;}done();};
  tx.oncomplete=resolve;tx.onabort=()=>reject(failure||tx.error||Error(tr('復元を完了できませんでした。元のセーブは残っています。')));tx.onerror=()=>{};
 });
}
// Both game locks are held by the caller. Check the exact source bytes again
// inside the transaction; a concurrent save import must never be silently lost.
// New ROM, copied save and a permanent pre-update snapshot commit together.
async function commitGameROMUpdate({source,game,rom,save,targetSave=save,migration}){
 if(source.id===game.id||source.system!==game.system||!save?.bytes?.length)throw Error(tr('更新するROMとセーブを確認してください。'));
 const db=await database;return new Promise((resolve,reject)=>{
  const names=['library','roms','saves','states','backups','archives','recoveries','sessions','coverCatalogs'],tx=write(db,names);
  let failure,pending=3+6*3,existing,result,freshSource;
  const abort=e=>{failure=e;try{tx.abort();}catch{}};
  const done=()=>{if(--pending)return;try{
   result={...(existing||game),coreKey:coreFor(source).key,romUpdate:{previousId:source.id,previousName:source.name,at:Date.now(),coreKey:coreFor(source).key}};
   Object.assign(result,inheritedROMCover(result,freshSource));
   delete result.romMissing;delete result.romDetachedAt;
   if(!targetSave?.bytes?.length||targetSave.bytes.length>coreFor(result).maxSave)throw Error(tr('セーブファイルのサイズを確認してください。'));
   if(migration)result.romUpdate.migration=migration;
   tx.objectStore('library').put(result,result.id);tx.objectStore('roms').put(rom,result.id);rememberPlayRecord(tx,result,{restore:true});
   tx.objectStore('saves').add({...targetSave},saveKey(result));
   tx.objectStore('coverCatalogs').add({sourceId:source.id,targetId:result.id,sourceName:source.name,system:source.system,coreKey:coreFor(source).key,save,at:result.romUpdate.at},romUpdateMetadataPrefix+result.id);
  }catch(e){abort(e);}};
  const previous=tx.objectStore('library').get(source.id);previous.onsuccess=()=>{try{const row=previous.result;if(!row||row.system!==source.system||row.size!==source.size||coreFor(row).key!==coreFor(source).key)throw Error(tr('元のゲームの設定が変わりました。やり直してください。'));freshSource=row;rememberPlayRecord(tx,row);done();}catch(e){abort(e);}};
  const saved=tx.objectStore('saves').get(saveKey(source));saved.onsuccess=()=>{if(saved.result?.at!==save.at||!equal(saved.result?.bytes,save.bytes)){abort(Error(tr('元のセーブが変わりました。内容を確認してやり直してください。')));return;}done();};
  const target=tx.objectStore('library').get(game.id);target.onsuccess=()=>{existing=target.result;if(existing&&(existing.system!==game.system||existing.size!==game.size)){abort(Error(tr('追加先のゲーム情報が一致しません。')));return;}done();};
  for(const name of ['saves','states','backups','archives','recoveries','sessions'])for(const range of [game.id,IDBKeyRange.bound(game.id+'@',game.id+'@\uffff'),IDBKeyRange.bound(game.id+':',game.id+':\uffff')]){
   const r=tx.objectStore(name).count(range);r.onsuccess=()=>{if(r.result){abort(Error(tr('新版には保存データがあります。上書きを避けるため引き継ぎを中止しました。')));return;}done();};
  }
  tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||Error(tr('引き継ぎが中断されました。元のデータは残っています。')));tx.onerror=()=>{};
 });
}

// Keep storage work inside the update barrier, including waits for IndexedDB/locks.
export const trainerCard=guardUpdateTask(readTrainerCard),saveTrainerNickname=guardUpdateTask(setTrainerNickname),saveTrainerAvatar=guardUpdateTask(setTrainerAvatar);
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
export const commitSaveRescueWithActivity=guardUpdateTask(commitSaveRescue),saveRescueOriginals=guardUpdateTask(readSaveRescueOriginals);
export const saveRescueStateKeys=guardUpdateTask(stateKeys);
export {commitSaveRescueWithActivity as commitSaveRescue};
export const rotateSaveSessionWithActivity=guardUpdateTask(rotateSaveSession);
export {rotateSaveSessionWithActivity as rotateSaveSession};
export {hasWithActivity as has, commitProtectionBatchWithActivity as commitProtectionBatch, getWithActivity as get, allWithActivity as all, putWithActivity as put, removeWithActivity as remove, removeStatesWithActivity as removeStates, addGameWithActivity as addGame, setGameCoverWithActivity as setGameCover, setGameSkinWithActivity as setGameSkin, setGameControlsWithActivity as setGameControls, removeSkinWithActivity as removeSkin, removeGameWithActivity as removeGame, setGameCoreWithActivity as setGameCore, commitProtectionWithActivity as commitProtection, stateEntriesWithActivity as stateEntries};
