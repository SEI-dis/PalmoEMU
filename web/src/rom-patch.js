// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from './i18n/index.js';
export async function applyROMPatch(rom,patch,{signal}={}){
 if(!rom.size||!patch.size||rom.size>64*1048576||patch.size>64*1048576)throw Error(tr('ROMとパッチはそれぞれ64 MiB以下のファイルを選んでください。'));
 const buffers=await Promise.all([rom.arrayBuffer(),patch.arrayBuffer()]);if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./patch-worker.js',import.meta.url));
  const finish=(error,bytes)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(bytes);};
  const abort=()=>finish(new DOMException('Aborted','AbortError')),timer=setTimeout(()=>finish(Error(tr('パッチ処理が時間内に完了しませんでした。'))),60000);
  signal?.addEventListener('abort',abort,{once:true});worker.onerror=()=>finish(Error(tr('パッチを適用できませんでした。')));
  worker.onmessage=({data})=>finish(data.error?Error(data.error==='source'?tr('パッチに必要なROMと一致しません。'):tr('パッチが壊れているか、未対応の形式です。')):null,data.bytes);
  worker.postMessage({rom:buffers[0],patch:buffers[1]},buffers);
 });
}
