/* Port of SettingsAdventureCardView (Daiuno, Copyright © 2026 Manic EMU).
   Modified for Web 2026-10-13: local profile, original app icon and version-grouped
   game rankings. See sources/manicemu-ui/README.md. */
// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr,locale} from '../i18n/index.js';
import {escapeHTML as esc,icon} from '../shared.js';
import {guardUpdateTask} from '../update-activity.js';
import {trainerAvatarSource} from '../trainer-profile.js';
import {editTrainerAvatar} from './trainer-avatar.js';
import {fitInputDialog} from './input-dialog.js';

function duration(milliseconds){
 const minutes=Math.floor(Math.max(0,milliseconds)/60000);
 return minutes>=60?tr`${Math.floor(minutes/60)}時間${minutes%60}分`:tr`${minutes}分`;
}
export function createTrainerCard(api){
 const defaultName=()=>tr('かけだしトレーナー');
 const rows=games=>`<ol class="trainer-games">${games.map(game=>`<li><span>${esc(game.name)}</span><small>${duration(game.playDuration)}</small></li>`).join('')}</ol>`;
 function html(){
  const {profile,total,rankings}=api.trainer();
  const date=profile?.joinedAt?new Date(profile.joinedAt):null;
  return tr`<section class="trainer-card" aria-labelledby="trainer-title"><h2 id="trainer-title">トレーナーカード</h2><div class="trainer-summary"><div class="trainer-fields"><button id="trainer-nickname" class="trainer-field" aria-label="ニックネームを変更"><span><small>ニックネーム</small><strong>${esc(profile?.nickname||defaultName())}</strong></span>${icon('pencil')}</button><div class="trainer-field"><span><small>プレイ時間</small><strong id="trainer-total">${duration(total)}</strong></span></div><div class="trainer-field"><span><small>参加日</small><time id="trainer-joined" ${date?`datetime="${date.toISOString()}"`:''}>${date?esc(date.toLocaleDateString(locale())):'—'}</time></span></div></div><button id="trainer-avatar-change" class="trainer-avatar-button" aria-label="アイコンを変更"><img class="trainer-avatar" src="${esc(trainerAvatarSource(profile?.avatar))}" alt="">${icon('pencil')}</button></div>${rankings.length?tr`<div class="trainer-ranking"><h3>よく遊ぶゲーム</h3>${rows(rankings.slice(0,5))}${rankings.length>5?tr`<button id="trainer-all" class="trainer-more">すべて見る ${icon('chevron')}</button>`:''}</div>`:''}</section>`;
 }
 function editNickname(){
  const profile=api.trainer().profile;
  api.sheet(tr('ニックネーム'),tr`<form id="trainer-name-form"><label class="trainer-name-label" for="trainer-name">ニックネーム</label><input class="trainer-name-input" id="trainer-name" type="text" maxlength="30" autocomplete="nickname" value="${esc(profile?.nickname||defaultName())}" placeholder="${esc(defaultName())}"><div class="sheet-actions"><button type="button" class="secondary" id="trainer-name-cancel">キャンセル</button><button type="submit" class="primary">保存</button></div></form>`);
  const form=document.querySelector('#trainer-name-form'),input=form.querySelector('input');
  api.onClose(fitInputDialog(form.closest('dialog')));
  form.querySelector('#trainer-name-cancel').onclick=()=>api.closeSheet();
  form.onsubmit=event=>{event.preventDefault();void guardUpdateTask(async()=>{
   const controls=[...form.querySelectorAll('button,input'),document.querySelector('#close-sheet')];for(const control of controls)control.disabled=true;
   try{const value=input.value.trim();await api.saveNickname(value===defaultName()?'':value);for(const control of controls)control.disabled=false;api.closeSheet();api.render();document.querySelector('#trainer-nickname')?.focus({preventScroll:true});}
   catch(error){for(const control of controls)control.disabled=false;api.error(error);}
  })();};
  input.focus({preventScroll:true});input.select();
 }
 function bind(root){
  root.querySelector('#trainer-nickname').onclick=editNickname;
  root.querySelector('#trainer-avatar-change').onclick=()=>editTrainerAvatar(api);
  const more=root.querySelector('#trainer-all');if(more)more.onclick=()=>api.sheet(tr('プレイ記録'),rows(api.trainer().rankings));
 }
 return {html,bind};
}
