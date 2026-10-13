// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
import {row} from '../components/rows.js';
import {touchInputDefaults} from '../dpad-input.js';
export function touchOptionsMarkup(settings){
 const value=key=>settings[key]??touchInputDefaults[key];
 const select=(key,choices)=>`<select data-touch-option="${key}">${choices.map(([id,label])=>`<option value="${id}" ${value(key)===id?'selected':''}>${label}</option>`).join('')}</select>`;
 return tr`<p class="sheet-note">標準スキンの画面ボタンに適用します。読み込んだスキンは元の操作範囲を使います。下のボタンで試せます。</p><div class="settings-group">
 ${row(tr('十字キーの方向'),select('touchDpadMode',[['eight',tr('8方向')],['four',tr('4方向')]]),'game')}
 ${row(tr('中央の遊び'),select('touchDpadDeadZone',[[0,tr('なし')],[.06,tr('小さめ')],[.12,tr('標準')],[.18,tr('大きめ')],[.24,tr('最大')]]),'game')}
 ${row(tr('斜めの入りやすさ'),select('touchDpadDiagonal',[[.35,tr('入りやすい')],[.6,tr('標準')],[.85,tr('入りにくい')]]),'game')}
 ${row(tr('押せる範囲を広げる'),select('touchHitSlop',[[0,tr('標準')],[8,tr('少し広い')],[16,tr('広い')],[24,tr('とても広い')]]),'game')}
 </div><button class="secondary" id="touch-options-reset">タッチの感度を初期設定に戻す</button>`;
}
export function mountTouchOptions({container,settings,applySettings,render}){
 const diagonal=container.querySelector('[data-touch-option=touchDpadDiagonal]');diagonal.disabled=settings.touchDpadMode==='four';
 for(const select of container.querySelectorAll('[data-touch-option]')){
  select.setAttribute('aria-label',select.closest('.row')?.querySelector('span')?.textContent||'');
  select.onchange=()=>{const key=select.dataset.touchOption;settings[key]=key==='touchDpadMode'?select.value:Number(select.value);applySettings();render();};
 }
 container.querySelector('#touch-options-reset').onclick=()=>{Object.assign(settings,touchInputDefaults);applySettings();render();};
}
