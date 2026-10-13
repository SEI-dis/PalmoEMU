// SettingsListView / SettingItem port: Daiuno, Copyright 2025 Manic EMU.
// SPDX-License-Identifier: AGPL-3.0-or-later
import {filterStrengthControl} from '../components/filter-strength.js';
import {tr} from '../i18n/index.js';
import {languageSetting,bindLanguageSetting} from '../components/language-setting.js';
import {row,action,detail,settingsGroup,switchControl} from '../components/rows.js';
import {escapeHTML as esc,icon} from '../shared.js';
import {supportsHaptics,hapticNote} from '../haptics.js';
import {videoFilters} from '../video.js';
import {createStorageSettings} from '../components/storage-settings.js';
export function videoFilterNote(filter){return tr`<p class="sheet-note" id="video-filter-note" ${filter==='edge4x'?'':'hidden'}>輪郭補正4倍は、元の色を保ちながら斜めの線や角を細かく整えます。処理負荷が増えるため、動作が重い場合は2倍やピクセルに戻してください。</p>`;}
export function createSettingsView(api){
 const {settings,applySettings,bindSettings,bindActions,sheet,showSkins,showOffline}=api;
 const showStorage=createStorageSettings(api);
 const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
// SettingsListView / SettingItem port: Daiuno, Copyright 2025 Manic EMU, AGPL-3.0-or-later.
function renderSettings(){
 const appearance=tr`<div class="appearance-control" role="group" aria-label="外観">${
  [['dark',tr('ダーク')],['light',tr('ライト')],['auto',tr('自動')]].map(([value,label])=>
   `<button data-theme-choice="${value}" aria-pressed="${settings.theme===value}">${label}</button>`).join('')
 }</div>`;
 const general=settingsGroup(tr('一般'),[
  languageSetting(),
  row(tr('外観'),appearance,'image'),
  detail(tr('自動ステート保存'),tr('約20秒ごとに保存（最大5回分）'),switchControl('recovery',settings.recovery),'save'),
  action(tr('スキン'),'skins','game')
 ]);
 const advanced=settingsGroup(tr('詳細'),[
  action(tr('コントローラー・キーボード'),'controllers','game'),
  action(tr('映像とフレームレート'),'video','image'),
  action(tr('音量と速度'),'audio','volume'),
  detail(tr('タッチの振動'),hapticNote(),switchControl('haptics',supportsHaptics()&&settings.haptics,{disabled:!supportsHaptics()}),'game'),
  action(tr('セーブと保存容量'),'storage','save'),
  action(tr('まとめてバックアップ'),'backup','save')
 ]);
 const support=settingsGroup(tr('サポート'),[
  action(tr('オフラインで使う'),'offline','import'),
  action(tr('保存・復旧の使い方'),'saveHelp','save'),
  action(tr('クラッシュ診断'),'diagnostics','info')
 ]);
 const links=settingsGroup(tr('その他'),[
  ['update.html',tr('アプリの更新'),'import'],
  ['privacy.html',tr('プライバシーと利用条件'),'folder'],
  ['licenses.html',tr('クレジット・ライセンス'),'folder']
 ].map(([href,label,ic])=>`<a class="row" href="${href}">${icon(ic)}<span>${label}</span>${icon('chevron')}</a>`));
 // Describe the loaded distribution, including while offline or an update waits.
 const version=$('meta[name=app-version]').content,build=$('meta[name=app-build]').content;
 $('#content').innerHTML=tr`<div class="page settings-page"><h1>設定</h1><p class="sheet-note">ゲームで変更した項目には、そのゲームの個別設定を使います。</p>${general}${advanced}${support}${links}<p class="settings-footer" title="ビルド ${esc(build)}">PalmoEMU · ${esc(version)} (${esc(build.slice(0,8))})</p></div>`;
 bindSettings($('#content'));bindActions($('#content'),{controllers:showControllers,skins:()=>showSkins(),storage:showStorage,offline:showOffline,video:showVideoSettings,audio:showAudioSettings,saveHelp:showSaveHelp,diagnostics:api.showDiagnostics,backup:api.showBackup});
 $$('[data-theme-choice]').forEach(b=>b.onclick=()=>{settings.theme=b.dataset.themeChoice;applySettings();renderSettings();});
 bindLanguageSetting($('#content'),{canChange:api.canChangeLanguage,onError:api.toast});
}
function showVideoSettings(){sheet(tr('映像とフレームレート'),tr`<div class="settings-group">${row(tr('映像フィルター'),tr`<select aria-label="映像フィルター" aria-describedby="video-filter-note" data-setting="filter">${videoFilters.map(([v,t])=>`<option value="${v}" ${settings.filter===v?'selected':''}>${t}</option>`).join('')}</select>`,'image')}${filterStrengthControl(settings)}${row(tr('画面ボタン'),`<input data-setting="touchControls" type="checkbox" ${settings.touchControls?'checked':''}>`,'game')}${row(tr('スクリーンショットボタン'),`<input data-setting="showCamera" type="checkbox" ${settings.showCamera!==false?'checked':''}>`,'camera')}${row(tr('FPS表示'),`<input data-setting="showFps" type="checkbox" ${settings.showFps?'checked':''}>`,'bolt')}</div><p class="sheet-note">通常は約60fpsで動作します。速度は端末の性能によって変わります。フィルターは見た目を調整する機能で、ゲーム内部の解像度は変わりません。</p>${videoFilterNote(settings.filter)}`);bindSettings($('#sheet-body'));}
function showAudioSettings(){sheet(tr('音量と速度'),tr`<div class="settings-group">${row(tr('音量'),tr`<input aria-label="音量" data-setting="volume" type="range" min="0" max="1" step=".05" value="${settings.volume}">`,'volume')}${row(tr('プレイ速度'),`<select data-setting="speed">${[1,2,3,4,5].map(n=>tr`<option value="${n}" ${settings.speed===n?'selected':''}>${n}倍</option>`).join('')}</select>`,'bolt')}</div><p class="sheet-note">倍速中も音の高さを保ちます。テンポはプレイ速度に合わせて速くなります。</p><p class="sheet-note">速度ボタンかTabキーで、1〜5倍を順に切り替えます。通信中は1倍速です。</p>`);bindSettings($('#sheet-body'));}
function showSaveHelp(){sheet(tr('保存・復旧の使い方'),tr`<p class="sheet-note"><strong>ゲーム内セーブ</strong>：ゲームの「レポート」などで保存した内容です。自動保存では約10秒ごとに端末へ保存し、変更前の内容を最大5回分、さらに5分間隔で最大10回分残します。レポート操作を自動で行う機能ではありません。</p><p class="sheet-note"><strong>ステート</strong>：プレイ中の状態を丸ごと保存したものです。自動保存をオンにすると約20秒ごとに保存し、最大5回分を残します。保存する数はデータの大きさによって変わります。異常終了後の復旧に使えます。通信中は保存しません。</p><p class="sheet-note">手動のステート保存は毎回新しく追加されます。「セーブステート」の手動／自動から再開できます。削除は「編集」で選んでから行います。</p><p class="sheet-note">端末の故障やサイトデータの削除に備え、大切なセーブはファイルにも書き出してください。強制終了の直前まで復旧できるとは限りません。</p>`);}
function showControllers(){return api.showInputControls();}

 return {renderSettings,showVideoSettings,showAudioSettings,showSaveHelp,showControllers,showStorage};
}
