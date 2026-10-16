// SPDX-License-Identifier: AGPL-3.0-or-later
// Files stay local. A fresh button gesture opens the native save/share UI.
import {tr} from '../i18n/index.js';
import {bytesLabel} from '../shared.js';
import {guardUpdateTask} from '../updates/update-activity.js';

const safeName=name=>String(name||'PalmoEMU').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/[. ]+$/,'').slice(0,200)||'PalmoEMU';
const mimeType=name=>/\.json$/i.test(name)?'application/json':/\.png$/i.test(name)?'image/png':'application/octet-stream';
const isIOS=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
export function createFileExport({host=document.body}={}){
 let active=null;
 function dispose(){active?.close();}
 // Independent dialog: opening export must not dispose a parent backup plan.
 const exportFile=guardUpdateTask((bytes,name,{type}={})=>{
  if(active)return Promise.resolve('cancelled');
  name=safeName(name);let file=new File([bytes],name,{type:type||bytes?.type||mimeType(name)});bytes=null;
  let url=null,busy=false,closed=false,outcome='cancelled',resolve;
  const result=new Promise(done=>{resolve=done;}),dialog=document.createElement('dialog');dialog.className='file-export';dialog.setAttribute('aria-label',tr('ファイルを書き出す'));
  dialog.innerHTML=tr('<div class="sheet-head"><h2>ファイルを書き出す</h2></div><p class="sheet-note" data-export-name></p><div class="stack"><button class="primary" data-export-save>保存</button><button class="secondary" data-export-share>共有</button></div><p class="sheet-note" data-export-status role="status" aria-live="polite"></p><button class="text-button wide-button" data-export-close>閉じる</button>');
  const find=s=>dialog.querySelector(s),save=find('[data-export-save]'),share=find('[data-export-share]'),close=find('[data-export-close]'),status=find('[data-export-status]');
  const label=find('[data-export-name]');label.textContent=name+' · '+bytesLabel(file.size);label.style.overflowWrap='anywhere';
  const canShare=()=>{try{return typeof navigator.share==='function'&&navigator.canShare?.({files:[file]})===true;}catch{return false;}};
  share.hidden=!canShare();
  function cleanup(){if(!closed||busy)return;if(url)URL.revokeObjectURL(url);url=null;file=null;dialog.remove();if(active?.dialog===dialog)active=null;resolve(outcome);}
  function finish(){if(closed)return;closed=true;if(dialog.open)dialog.close();cleanup();}
  active={dialog,close:finish};close.onclick=finish;
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(!busy)finish();});dialog.addEventListener('close',()=>{if(!closed){closed=true;cleanup();}});
  function controls(value){busy=value;save.disabled=share.disabled=close.disabled=value;}
  async function nativeShare(){await navigator.share({files:[file]});return 'shared';}
  async function saveFile(){
   if(isIOS()&&canShare())return nativeShare();
   if(typeof window.showSaveFilePicker==='function'){
    const extension=/\.[a-z0-9]{1,15}$/i.exec(name)?.[0],options={suggestedName:name};if(extension)options.types=[{accept:{[file.type]:[extension]}}];
    const handle=await window.showSaveFilePicker(options);if(closed)return 'cancelled';
    let writer;try{status.textContent=tr('保存中…');writer=await handle.createWritable();await writer.write(file);await writer.close();return 'saved';}catch(error){try{await writer?.abort();}catch{}throw error;}
   }
   url??=URL.createObjectURL(file);const link=document.createElement('a');link.href=url;link.download=name;link.target='_blank';link.rel='noopener';link.hidden=true;dialog.append(link);try{link.click();}finally{link.remove();}return 'download';
  }
  async function perform(action){
   if(busy||closed)return;controls(true);status.removeAttribute('role');status.textContent=tr('書き出し先を選んでください。');
   try{
    // Call before the first await so the picker/share retains this tap's activation.
    const value=await action();if(closed)return;outcome=value;
    status.textContent=value==='saved'?tr('保存しました。'):value==='shared'?tr('共有しました。'):value==='download'?tr('ダウンロードを開始しました。'):tr('キャンセルしました。');
   }catch(error){if(!closed){status.textContent=error?.name==='AbortError'?tr('キャンセルしました。'):tr('書き出せませんでした。もう一度お試しください。');status.setAttribute('role',error?.name==='AbortError'?'status':'alert');}}
   finally{controls(false);cleanup();}
  }
  save.onclick=()=>perform(saveFile);share.onclick=()=>perform(nativeShare);host.append(dialog);
  try{dialog.showModal();}catch(error){finish();throw error;}
  return result;
 });
 exportFile.close=dispose;exportFile.dispose=dispose;
 return exportFile;
}
