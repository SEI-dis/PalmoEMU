// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared local image editor adapted from the Web port of ManicEMU's GameInfoCoverView.
// Copyright © 2026 Manic EMU. Original view by Daiuno. Modified 2026-11-25.
import {tr} from '../i18n/index.js';
import {guardUpdateTask} from '../updates/update-activity.js';
import {mountCoverCrop} from './cover-crop.js';

const maxImageBytes=16*1048576;
const invalidImage=message=>Object.assign(Error(message),{cropImageError:true});
function storedImage(value){
 // Re-edit only stored local pixels; never request a remote image or retain a
 // second full-size original. Legacy images that cannot be decoded stay intact.
 if(typeof value!=='string'||value.length>Math.ceil(maxImageBytes*4/3)+128)throw invalidImage(tr('この画像は再調整できません。画像を選び直してください。'));
 const match=/^data:(image\/(?:png|jpeg|webp));base64,([a-z\d+/=\r\n]+)$/i.exec(value);
 if(!match)throw invalidImage(tr('この画像は再調整できません。画像を選び直してください。'));
 try{return new Blob([Uint8Array.from(atob(match[2]),letter=>letter.charCodeAt(0))],{type:match[1].toLowerCase()});}
 catch{throw invalidImage(tr('この画像は再調整できません。画像を選び直してください。'));}
}

export async function openImageCrop(api,source,{title,avatar=false,onCancel,persist,onSaved,saveError}){
  const $=selector=>document.querySelector(selector);
  api.sheet(title,tr('<div class="cover-crop-editor"><p class="sheet-note">ドラッグで位置を、ピンチやスライダーで大きさを調整します。</p><canvas id="cover-crop-canvas" class="cover-crop-stage" width="1" height="1" tabindex="0" role="img" aria-label="画像の表示範囲。矢印キーで画像を移動" hidden></canvas><label class="cover-crop-zoom" hidden><span>拡大</span><input id="cover-crop-zoom" type="range" min="100" max="400" step="1" value="100"></label><p id="cover-crop-status" class="sheet-note" role="status" aria-live="polite">画像を読み込んでいます…</p><div class="sheet-actions"><button id="cover-crop-cancel" class="secondary">キャンセル</button><button id="cover-crop-save" class="primary" disabled>保存</button></div></div>'),false,{confirmation:true,onBack:onCancel});
  const canvas=$('#cover-crop-canvas'),slider=$('#cover-crop-zoom'),status=$('#cover-crop-status'),save=$('#cover-crop-save'),cancel=$('#cover-crop-cancel'),close=$('#close-sheet'),dialog=$('#sheet');
  canvas.classList.toggle('round-crop',avatar);
  let alive=true,busy=false,bitmap=null,editor=null,releaseUpdate,unlock=null;
  void guardUpdateTask(()=>new Promise(resolve=>{releaseUpdate=resolve;}))();
  // Returning from a native picker can move focus while the bitmap decodes.
  // Give the image initial focus unless the user has navigated in the meantime.
  const initialFocus=new AbortController(),keepFocus=()=>initialFocus.abort();
  for(const type of ['keydown','pointerdown'])dialog.addEventListener(type,keepFocus,{capture:true,signal:initialFocus.signal});
  api.onClose?.(()=>{if(!alive)return;alive=false;keepFocus();editor?.dispose();editor=null;bitmap?.close();bitmap=null;source=null;unlock?.();unlock=null;releaseUpdate();});
  cancel.onclick=()=>{if(!busy)onCancel();};
  save.onclick=guardUpdateTask(async()=>{
   if(!alive||busy||!editor)return;busy=true;editor.setDisabled(true);save.disabled=cancel.disabled=true;
   const wasDisabled=close.disabled,preventCancel=event=>event.preventDefault();close.disabled=true;dialog.addEventListener('cancel',preventCancel);
   unlock=()=>{close.disabled=wasDisabled;dialog.removeEventListener('cancel',preventCancel);};
   let updated;
   try{
    status.textContent=tr('保存中…');status.setAttribute('role','status');
    updated=await persist(editor.toDataURL(avatar?{size:256,type:'image/png'}:undefined));
   }catch(error){
    if(alive){status.textContent=error.name==='QuotaExceededError'?tr('保存容量が足りません。セーブを書き出してから保存容量を確認してください。'):saveError;status.setAttribute('role','alert');}return;
   }finally{
    busy=false;unlock?.();unlock=null;if(alive){editor?.setDisabled(false);save.disabled=cancel.disabled=false;}
   }
   // The write committed. Report any later redraw error separately.
   try{await onSaved(updated,alive);}catch(error){api.error(error);}
  });
  try{
   if(typeof source==='string')source=storedImage(source);
   if(!(source instanceof Blob)||source.size>maxImageBytes||!/^image\/(png|jpeg|webp)$/.test(source.type))throw invalidImage(tr('16MB以下のPNG・JPEG・WebP画像を選んでください。'));
   const decoded=await createImageBitmap(source);source=null;
   if(!alive){decoded.close();return;}
   bitmap=decoded;
   if(!bitmap.width||!bitmap.height||bitmap.width>8192||bitmap.height>8192)throw invalidImage(tr('画像のサイズが大きすぎます。'));
   canvas.hidden=false;slider.parentElement.hidden=false;editor=mountCoverCrop(canvas,slider,bitmap);status.textContent='';save.disabled=false;
   const focused=document.activeElement,focusedDialog=focused?.closest('dialog[open]');
   if(!initialFocus.signal.aborted&&!focused?.classList.contains('controller-focus')&&(!focusedDialog||focusedDialog===dialog))canvas.focus({preventScroll:true});
  }catch(error){
   if(alive){editor?.dispose();editor=null;bitmap?.close();bitmap=null;canvas.hidden=true;slider.parentElement.hidden=true;status.textContent=error.cropImageError?error.message:tr('画像を読み込めませんでした。別の画像を選んでください。');status.setAttribute('role','alert');}
  }finally{keepFocus();source=null;}
 }
