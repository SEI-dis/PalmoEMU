// SPDX-License-Identifier: AGPL-3.0-or-later
// Derived metadata shares the existing catalog store. Save payloads remain in
// their original stores and every current writer updates both atomically.
export const saveCatalogPrefix='\u0001palmo-save-catalog-v1:';
export const indexedSaveStores=new Set(['saves','states','backups','archives','recoveries']);
const romUpdatePrefix='\u0001palmo-rom-update:';
const bytes=value=>value?.byteLength||0;
export function saveSummary(value){
 const item=record=>({at:record?.at,hash:record?.hash,coreId:record?.coreId,saveHash:record?.saveHash,byteLength:bytes(record?.bytes)+bytes(record?.save),stateBytes:bytes(record?.bytes),saveBytes:bytes(record?.save),...(typeof record?.image==='string'?{image:record.image}:{})});
 return Array.isArray(value)?value.map(item):item(value);
}
export function sameSaveSummary(record,summary){
 const current=saveSummary(record);
 return ['at','hash','coreId','saveHash','byteLength','stateBytes','saveBytes'].every(key=>current[key]===summary?.[key]);
}
const keyFor=(store,key)=>saveCatalogPrefix+store+':'+key;
function rangeFor(store,range){
 const prefix=keyFor(store,'');
 if(range===undefined)return IDBKeyRange.bound(prefix,prefix+'\uffff');
 if(typeof range==='string')return keyFor(store,range);
 if(range.lower!==undefined&&range.upper!==undefined)return IDBKeyRange.bound(prefix+range.lower,prefix+range.upper,range.lowerOpen,range.upperOpen);
 return range.lower!==undefined?IDBKeyRange.bound(prefix+range.lower,prefix+'\uffff',range.lowerOpen):IDBKeyRange.bound(prefix,prefix+range.upper,false,range.upperOpen);
}
function indexed(store,key){return indexedSaveStores.has(store)||store==='coverCatalogs'&&typeof key==='string'&&key.startsWith(romUpdatePrefix);}
function summaryRow(store,key,value){return store==='coverCatalogs'?{store:'rom-updates',key:value.targetId+'@'+value.coreKey,value:saveSummary(value.save)}:{store,key,value:saveSummary(value)};}
const transactionStores=new WeakMap();
// Use this wrapper only for writes. Native requests and failure/abort behavior
// are preserved; cursor mutations must also go through put/delete below.
export function saveStore(tx,name){
 let stores=transactionStores.get(tx);if(!stores){stores=new Map();transactionStores.set(tx,stores);}if(stores.has(name))return stores.get(name);
 const native=tx.objectStore(name),catalog=tx.objectStore('coverCatalogs');
 const safely=action=>{try{return action();}catch(error){try{tx.abort();}catch{}throw error;}};
 const store=new Proxy(native,{get(target,property){
  if(property==='put'||property==='add')return(value,key)=>safely(()=>{const request=target[property](value,key);if(indexed(name,key))catalog.put(summaryRow(name,key,value),keyFor(name,key));return request;});
  if(property==='delete')return key=>safely(()=>{const request=target.delete(key);if(indexedSaveStores.has(name)||indexed(name,key))catalog.delete(rangeFor(name,key));return request;});
  const value=Reflect.get(target,property,target);return typeof value==='function'?value.bind(target):value;
 }});stores.set(name,store);return store;
}
// Key-only reconciliation discovers legacy/new unindexed records without
// cloning every state. Only missing metadata requires a one-time payload read.
// An actual operation rechecks the chosen record, including legacy overwrites.
export function readSaveCatalog(tx,name,range,append){
 const source=tx.objectStore(name),catalog=tx.objectStore('coverCatalogs'),indexedRange=rangeFor(name,range);
 const safely=callback=>()=>{try{callback();}catch{try{tx.abort();}catch{}}};
 const keys=source.getAllKeys(range),summaries=catalog.getAll(indexedRange);let pending=2;
 const finish=()=>{if(--pending)return;const rows=new Map(summaries.result.map(row=>[name==='coverCatalogs'?romUpdatePrefix+row.key.split('@')[0]:row.key,row])),actual=new Set(keys.result);
  if(tx.mode==='readwrite')for(const key of rows.keys())if(!actual.has(key))catalog.delete(keyFor(name,key));
  for(const key of keys.result){const known=rows.get(key);if(known){append(known);continue;}
   const request=source.get(key);request.onsuccess=safely(()=>{if(request.result===undefined)return;const row=summaryRow(name,key,request.result);if(tx.mode==='readwrite')catalog.put(row,keyFor(name,key));append(row);});
  }
 };
 keys.onsuccess=safely(finish);summaries.onsuccess=safely(finish);
}
