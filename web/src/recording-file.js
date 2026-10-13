// SPDX-License-Identifier: AGPL-3.0-or-later
// A separate local file for each recording; no remote storage or telemetry.
let lastStamp='',sequence=0;
export function recordingName(name,date=new Date()){
 const pad=value=>String(value).padStart(2,'0');
 const stamp=`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
 sequence=stamp===lastStamp?sequence+1:1;lastStamp=stamp;
 const base=String(name||'PalmoEMU').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/[. ]+$/,'').slice(0,140)||'PalmoEMU';
 return `${base}_${stamp}${sequence>1?'-'+sequence:''}`;
}

export async function saveRecording(file,url,onWriting=()=>{}){
 // iOS may open a Blob download in the app's own browsing context. The native
 // sheet offers Save Video / Save to Files without replacing the running game.
 const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
 if(ios&&typeof navigator.share==='function'&&navigator.canShare?.({files:[file]})===true){
  try{await navigator.share({files:[file]});return 'shared';}
  catch(error){if(error?.name==='AbortError')return 'cancelled';throw error;}
 }
 if(typeof window.showSaveFilePicker==='function'){
  let handle;
  try{handle=await window.showSaveFilePicker({suggestedName:file.name,types:[{accept:{[file.type]:[file.type==='video/mp4'?'.mp4':'.webm']}}]});}
  catch(error){if(error?.name==='AbortError')return 'cancelled';throw error;}
  let writer;
  try{onWriting();writer=await handle.createWritable();await writer.write(file);await writer.close();return 'saved';}
  catch(error){try{await writer?.abort();}catch{}throw error;}
 }
 // Reuse the preview URL. A fixed revoke timer can expire while a browser's
 // download prompt is still open; explicit preview disposal owns its lifetime.
 const anchor=document.createElement('a');anchor.href=url;anchor.download=file.name;anchor.target='_blank';anchor.rel='noopener';anchor.hidden=true;document.body.append(anchor);
 try{anchor.click();return 'download';}finally{anchor.remove();}
}
