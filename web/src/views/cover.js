// SPDX-License-Identifier: AGPL-3.0-or-later
// Local image selection adapts ManicEMU's GameInfoCoverView to the browser.
// Copyright © 2026 Manic EMU. Original view by Daiuno. Modified 2026-10-16.
import {tr} from '../i18n/index.js';
import {guardUpdateTask} from '../updates/update-activity.js';
import {escapeHTML as esc} from '../shared.js';
import {action} from '../components/rows.js';
import {mountCoverCrop} from '../components/cover-crop.js';
import * as db from '../storage/storage.js';

const maxImageBytes=16*1048576;
const invalidImage=message=>Object.assign(Error(message),{coverImageError:true});
function storedImage(value){
 // Re-edit only stored local pixels; never request a remote image or retain a
 // second full-size original. Legacy covers that cannot be decoded stay intact.
 if(typeof value!=='string'||value.length>Math.ceil(maxImageBytes*4/3)+128)throw invalidImage(tr('この画像は再調整できません。画像を選び直してください。'));
 const match=/^data:(image\/(?:png|jpeg|webp));base64,([a-z\d+/=\r\n]+)$/i.exec(value);
 if(!match)throw invalidImage(tr('この画像は再調整できません。画像を選び直してください。'));
 try{return new Blob([Uint8Array.from(atob(match[2]),letter=>letter.charCodeAt(0))],{type:match[1].toLowerCase()});}
 catch{throw invalidImage(tr('この画像は再調整できません。画像を選び直してください。'));}
}

export function createCoverDialog(api){
 const $=selector=>document.querySelector(selector);
 async function edit(game,source){
  api.sheet(tr('カバーを調整'),tr('<div class="cover-crop-editor"><p class="sheet-note">ドラッグで位置を、ピンチやスライダーで大きさを調整します。</p><canvas id="cover-crop-canvas" class="cover-crop-stage" width="1" height="1" tabindex="0" role="img" aria-label="カバーの表示範囲。矢印キーで画像を移動" hidden></canvas><label class="cover-crop-zoom" hidden><span>拡大</span><input id="cover-crop-zoom" type="range" min="100" max="400" step="1" value="100" aria-label="カバーの拡大率"></label><p id="cover-crop-status" class="sheet-note" role="status" aria-live="polite">画像を読み込んでいます…</p><div class="sheet-actions"><button id="cover-crop-cancel" class="secondary">キャンセル</button><button id="cover-crop-save" class="primary" disabled>保存</button></div></div>'));
  const canvas=$('#cover-crop-canvas'),slider=$('#cover-crop-zoom'),status=$('#cover-crop-status'),save=$('#cover-crop-save'),cancel=$('#cover-crop-cancel'),close=$('#close-sheet'),dialog=$('#sheet');
  let alive=true,busy=false,bitmap=null,editor=null,releaseUpdate,unlock=null;
  void guardUpdateTask(()=>new Promise(resolve=>{releaseUpdate=resolve;}))();
  api.onClose?.(()=>{if(!alive)return;alive=false;editor?.dispose();editor=null;bitmap?.close();bitmap=null;source=null;unlock?.();unlock=null;releaseUpdate();});
  cancel.onclick=()=>{if(!busy)open(game);};
  save.onclick=guardUpdateTask(async()=>{
   if(!alive||busy||!editor)return;busy=true;editor.setDisabled(true);save.disabled=cancel.disabled=true;
   const wasDisabled=close.disabled,preventCancel=event=>event.preventDefault();close.disabled=true;dialog.addEventListener('cancel',preventCancel);
   unlock=()=>{close.disabled=wasDisabled;dialog.removeEventListener('cancel',preventCancel);};
   let updated;
   try{
    status.textContent=tr('保存中…');status.setAttribute('role','status');
    const cover=editor.toDataURL();updated=await db.setGameCover(game.id,{cover,coverSource:'custom',coverTitle:null,coverUrl:null});
    if(!updated)throw Error(tr('ゲームが見つかりません。'));
   }catch(error){
    if(alive){status.textContent=error.name==='QuotaExceededError'?tr('保存容量が足りません。セーブを書き出してから保存容量を確認してください。'):tr('カバーを保存できませんでした。もう一度お試しください。');status.setAttribute('role','alert');}
   }finally{
    busy=false;unlock?.();unlock=null;if(alive){editor?.setDisabled(false);save.disabled=cancel.disabled=false;}
   }
   if(!updated)return;
   Object.assign(game,updated);
   if(alive)api.showGame(game);
   // The cover transaction already committed. A library redraw failure does
   // not masquerade as a failed save or roll back newer game metadata.
   try{await api.refresh();}catch(error){api.error(error);}
  });
  try{
   if(typeof source==='string')source=storedImage(source);
   if(!(source instanceof Blob)||source.size>maxImageBytes||!/^image\/(png|jpeg|webp)$/.test(source.type))throw invalidImage(tr('16MB以下のPNG・JPEG・WebP画像を選んでください。'));
   const decoded=await createImageBitmap(source);source=null;
   if(!alive){decoded.close();return;}
   bitmap=decoded;
   if(!bitmap.width||!bitmap.height||bitmap.width>8192||bitmap.height>8192)throw invalidImage(tr('画像のサイズが大きすぎます。'));
   canvas.hidden=false;slider.parentElement.hidden=false;editor=mountCoverCrop(canvas,slider,bitmap);status.textContent='';save.disabled=false;
  }catch(error){
   if(alive){editor?.dispose();editor=null;bitmap?.close();bitmap=null;canvas.hidden=true;slider.parentElement.hidden=true;status.textContent=error.coverImageError?error.message:tr('画像を読み込めませんでした。別の画像を選んでください。');status.setAttribute('role','alert');}
  }finally{source=null;}
 }
 function open(game){
  api.sheet(tr('カバー変更'),tr`${game.cover?tr`<img class="cover-preview" src="${esc(game.cover)}" alt="現在のカバー">`:''}<div class="settings-group">${action(tr('画像を選ぶ'),'cover-local','image')}${game.cover?action(tr('表示位置を調整'),'cover-adjust','image'):''}</div><p class="sheet-note">利用する権利のある画像を選んでください。画像はこのブラウザ内に保存します。</p>`,false,{onBack:()=>api.showGame(game)});
  $('#sheet').classList.add('native-menu');const input=$('#cover-input');let alive=true;
  api.onClose?.(()=>{alive=false;input.onchange=null;input.value='';});
  $('[data-action=cover-local]').onclick=()=>{
   if(!alive)return;input.value='';input.onchange=event=>{const file=event.target.files[0];input.value='';if(alive&&file)void edit(game,file).catch(api.error);};input.click();
  };
  if(game.cover)$('[data-action=cover-adjust]').onclick=()=>{void edit(game,game.cover).catch(api.error);};
 }
 return {open};
}
