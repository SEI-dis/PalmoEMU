// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';

export function showCoreLoadFailure({sheet}){
 // A blocked integrity check and an interrupted download both surface as a
 // loader error. Offer recovery without claiming a newer release is available.
 sheet(tr('コアを読み込めませんでした。'),tr`<p class="sheet-note">通信状態を確認して、もう一度お試しください。改善しない場合はアプリを更新してください。</p><p class="sheet-note">セーブデータは変更していません。</p><button id="retry-core-load" class="primary wide-button">再読み込み</button><a id="core-load-update" class="secondary wide-button" href="update.html">アプリの更新</a>`);
 // Reload also clears failed module imports cached by the browser. Never do
 // this automatically; startup has already released the save lock and core.
 document.querySelector('#retry-core-load').onclick=()=>location.reload();
}
