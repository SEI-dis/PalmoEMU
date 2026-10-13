// SPDX-License-Identifier: AGPL-3.0-or-later
// ManicEMU GameOption/PlayViewController interaction adapted for local Web cores.
// Modified 2026-10-13: bounded simulated blowing and boot-time firmware language.
import {tr} from '../i18n/index.js';
import {languages} from '../i18n/languages.js';
import {nativeSelect} from '../manic-ui.js';
export function showNDSOptions({sheet,closeSheet,engine,settings,applySettings,toast}){
 const choices=[['default',tr('コアの初期設定')],...['ja','en','fr','de','it','es'].map(code=>[code,code==='it'?'Italiano':languages.find(item=>item.code===code).name])];
 const unavailable=!!engine&&(!engine.canBlow||!engine.supportsNDSLanguage);
 sheet(tr('DSの操作と本体言語'),tr`<div class="settings-group">${nativeSelect(tr('DS本体の言語'),'ndsLanguage','game',choices,settings.ndsLanguage||'default')}</div><p class="sheet-note">ゲームを終了し、開き直すと反映されます。ステートを読み込むと、保存時の状態に戻ります。</p><button class="secondary" id="nds-blow" ${engine?.canBlow?'':'disabled'}>息を吹く（5秒）</button><p class="sheet-note">ゲームに戻って5秒間、息の入力を送ります。実際のマイクは使いません。一時停止すると止まります。</p>${!engine?tr('<p class="sheet-note">息の入力はプレイ中に使えます。</p>'):unavailable?tr('<p class="sheet-note">このコアでは追加のDS操作を利用できません。ページを更新してください。</p>'):''}`,!!engine);
 const dialog=document.querySelector('#sheet');dialog.classList.add('native-menu');
 const select=dialog.querySelector('[data-setting=ndsLanguage]');select.disabled=!!engine&&!engine.supportsNDSLanguage;
 select.onchange=()=>{settings.ndsLanguage=select.value;const value=select.closest('.native-select')?.querySelector('.native-value');if(value)value.textContent=select.selectedOptions[0].textContent;applySettings();};
 dialog.querySelector('#nds-blow').onclick=()=>{closeSheet();if(engine?.blow())toast?.(tr('5秒間、息を吹きます。'));};
}
