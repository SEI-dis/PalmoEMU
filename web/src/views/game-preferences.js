// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
import {hasGamePreferences} from '../library/game-preferences.js';
import {escapeHTML as esc} from '../shared.js';
export function gamePreferenceSummary(game){return tr`<div class="game-preferences-summary"><span>映像・音量・操作：<strong id="game-preferences-mode">${hasGamePreferences(game)?tr('このゲームの設定'):tr('共通設定を使用')}</strong></span><button class="secondary" data-action="resetPreferences" ${hasGamePreferences(game)?'':'disabled'}>共通設定に戻す</button></div>`;}
export function confirmPreferenceReset({game,sheet,reset,back,error}){
 sheet(tr('共通設定に戻しますか？'),tr`<p class="sheet-note">「${esc(game.name)}」の速度・音量・映像・操作の個別設定を解除します。スキン・ボタン配置・セーブはそのままです。</p><div class="sheet-actions"><button class="secondary" id="preferences-cancel">キャンセル</button><button class="primary" id="preferences-reset">共通設定に戻す</button></div>`,false,{confirmation:true,onBack:back});
 document.querySelector('#preferences-cancel').onclick=back;
 document.querySelector('#preferences-reset').onclick=async e=>{e.target.disabled=true;try{await reset(game);back();}catch(value){error(value);e.target.disabled=false;}};
}
