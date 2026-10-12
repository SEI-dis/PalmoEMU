// SPDX-License-Identifier: AGPL-3.0-or-later
// Local image selection adapts ManicEMU's GameInfoCoverView to the browser.
// Copyright © 2026 Manic EMU. Original view by Daiuno. Modified 2026-10-09.
import {tr} from '../i18n/index.js';
import {guardUpdateTask} from '../update-activity.js';
import {escapeHTML as esc} from '../shared.js';
import {action} from '../components/rows.js';
import * as db from '../storage.js';

export function createCoverDialog(api){
 const $=s=>document.querySelector(s);
 async function save(game,cover){const updated=await db.setGameCover(game.id,cover);if(!updated)throw Error(tr('ゲームが見つかりません。'));Object.assign(game,updated);await api.refresh();api.showGame(game);}
 function pickLocal(game){
  const input=$('#cover-input');
  input.onchange=guardUpdateTask(async()=>{const file=input.files[0];if(!file)return;
   try{
    if(file.size>16*1048576||!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error(tr('16MB以下のPNG・JPEG・WebP画像を選んでください。'));
    const bitmap=await createImageBitmap(file);
    try{
     if(!bitmap.width||!bitmap.height||bitmap.width>8192||bitmap.height>8192)throw Error(tr('画像のサイズが大きすぎます。'));
     const scale=Math.min(1,512/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
     canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
     canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
     await save(game,{cover:canvas.toDataURL('image/webp',.85),coverSource:'custom',coverTitle:null,coverUrl:null});
    }finally{bitmap.close();}
   }catch(e){api.error(e);}finally{input.value='';}
  });
  input.click();
 }
 function open(game){
  api.sheet(tr('カバー変更'),tr`${game.cover?tr`<img class="cover-preview" src="${esc(game.cover)}" alt="現在のカバー">`:''}<div class="settings-group">${action(tr('画像を選ぶ'),'cover-local','image')}</div><p class="sheet-note">利用する権利のある画像を選んでください。画像はこのブラウザ内に保存します。</p><button class="secondary wide-button" id="cover-back">戻る</button>`);
  $('#sheet').classList.add('native-menu');
  $('[data-action=cover-local]').onclick=()=>pickLocal(game);$('#cover-back').onclick=()=>api.showGame(game);
 }
 return {open};
}
