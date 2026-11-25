// SPDX-License-Identifier: AGPL-3.0-or-later
// Local image selection adapts ManicEMU's GameInfoCoverView to the browser.
// Copyright © 2026 Manic EMU. Original view by Daiuno. Modified 2026-10-16.
import {tr} from '../i18n/index.js';
import {escapeHTML as esc} from '../shared.js';
import {action} from '../components/rows.js';
import {openImageCrop} from '../components/image-crop-dialog.js';
import * as db from '../storage/storage.js';

export function createCoverDialog(api){
 const $=selector=>document.querySelector(selector);
 function edit(game,source){
  const returning=typeof source==='string'?'cover-adjust':'cover-local';
  return openImageCrop(api,source,{title:tr('カバーを調整'),saveError:tr('カバーを保存できませんでした。もう一度お試しください。'),
   onCancel:()=>{open(game);$('[data-action='+returning+']')?.focus({preventScroll:true});},
   persist:async cover=>{const updated=await db.setGameCover(game.id,{cover,coverSource:'custom',coverTitle:null,coverUrl:null});if(!updated)throw Error(tr('ゲームが見つかりません。'));return updated;},
   onSaved:async(updated,alive)=>{Object.assign(game,updated);if(alive)api.showGame(game);await api.refresh();}
  });
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
