// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
import {diagnostics} from '../diagnostics.js';
import {escapeHTML as esc} from '../shared.js';
export function createDiagnosticsView({sheet,download,toast}){
 return function showDiagnostics(){
  const snapshot=diagnostics.snapshot(),reports=diagnostics.list(),persistent=diagnostics.persistenceAvailable();
  sheet(tr('診断レポート'),tr`<p class="sheet-note">エラーの種類・使用コア・アプリの状態を、直近5件まで端末内に記録します。ROM・セーブ・ゲーム名は含めず、自動送信もしません。</p>
   <div class="settings-group"><label class="row"><span>エラーを端末に記録</span><input id="diagnostics-enabled" type="checkbox" ${diagnostics.isEnabled()?'checked':''}></label></div>
   <p class="sheet-note" id="diagnostics-count" role="status">${reports.length?tr`記録：${reports.length}件`:tr('エラーの記録はありません。現在の環境情報は書き出せます。')}</p>
   ${persistent?'':tr('<p class="sheet-note" role="status">診断記録を端末に保存できないため、このタブ内だけで保持しています。</p>')}
   <div class="stack"><button class="primary" id="diagnostics-export">診断ファイルを書き出す</button><button class="secondary" id="diagnostics-clear" ${reports.length?'':'disabled'}>診断記録を削除</button></div>
   <details class="diagnostics-details"><summary>書き出す内容を確認</summary><pre id="diagnostics-preview">${esc(JSON.stringify(snapshot,null,2))}</pre></details>
   <p class="sheet-note">ブラウザごと強制終了した瞬間の詳細は取得できません。前回のプレイが正常終了していなかった場合は、次回プレイ開始時にその事実を記録します。</p>`);
  const find=selector=>document.querySelector(selector);
  find('#diagnostics-enabled').onchange=e=>diagnostics.setEnabled(e.target.checked);
  find('#diagnostics-export').onclick=()=>{
   const data=diagnostics.snapshot();
   download(new TextEncoder().encode(JSON.stringify(data,null,2)+'\n'),'PalmoEMU-diagnostics-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
   toast(tr('診断ファイルを書き出しました。'));
  };
  find('#diagnostics-clear').onclick=()=>{diagnostics.clear();showDiagnostics();toast(tr('診断記録を削除しました。'));};
 };
}
