// SPDX-License-Identifier: AGPL-3.0-or-later
// Long-lived battery snapshots complement up to five recent recovery generations.
// Interval/retention follows mGBA Celio Web; this storage implementation is original.
import {tr} from '../i18n/index.js';
export const archiveInterval=5*60*1000,archiveLimit=10;
// IndexedDB may reject a single serialized value well before the origin quota
// is full. Histories are arrays in the existing schema; keep each below that
// limit, including paired saves, screenshot strings and serialization overhead.
export const historyByteLimit=96*1048576;
export function historyRecordBytes(record){
 const size=value=>ArrayBuffer.isView(value)?value.buffer.byteLength:value?.byteLength||0;
 return size(record.bytes)+size(record.save)+(typeof record.image==='string'?record.image.length*2:0)+4096;
}
export function assertHistoryRecord(record){
 if(historyRecordBytes(record)>historyByteLimit)throw new RangeError(tr('保存データ1件の上限（96 MiB）を超えています。'));
}
export function retainHistory(history,count){
 const retained=[];let bytes=0;
 for(const record of history.slice(0,count)){
  // Keep one indivisible battery save even if it exceeds the history budget.
  // Otherwise a large existing save could block every later ordinary save.
  // Automatic checkpoints separately reject an oversized individual record.
  const size=historyRecordBytes(record);if(retained.length&&bytes+size>historyByteLimit)break;
  retained.push(record);bytes+=size;
 }
 return retained;
}
export function retainArchive(history,save){
 const previous=history[0];
 if(previous&&(save.at<previous.at+archiveInterval||previous.hash&&previous.hash===save.hash))return history;
 return retainHistory([save,...history],archiveLimit);
}
