// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
import {diagnostics} from '../diagnostics.js';
import {performanceDiagnostics} from '../runtime/performance.js';
import {escapeHTML as esc} from '../shared.js';
export function createDiagnosticsView({sheet,download,toast,settings={},applySettings=()=>{}}){
 return function showDiagnostics(){
  const snapshot=diagnostics.snapshot(),reports=diagnostics.list(),persistent=diagnostics.persistenceAvailable();
  const measured=performanceDiagnostics.snapshot();
  sheet(tr('診断レポート'),tr`<p class="sheet-note">診断情報は端末内だけに記録し、自動送信しません。ROM・セーブ・ゲーム名は含みません。</p>
   <div class="settings-group"><label class="row"><span>エラーを端末に記録</span><input id="diagnostics-enabled" type="checkbox" ${diagnostics.isEnabled()?'checked':''}></label></div>
   <p class="sheet-note" id="diagnostics-count" role="status">${reports.length?tr`記録：${reports.length}件`:tr('エラーの記録はありません。現在の環境情報は書き出せます。')}</p>
   ${persistent?'':tr('<p class="sheet-note" role="status">診断記録を端末に保存できないため、このタブ内だけで保持しています。</p>')}
   <div class="stack"><button class="primary" id="diagnostics-export">診断ファイルを書き出す</button><button class="destructive" id="diagnostics-clear" ${reports.length?'':'disabled'}>診断記録を削除</button></div>
   <div class="label">動作の計測</div>
   <div class="settings-group"><label class="row"><span>プレイ中の動作を計測</span><input id="performance-enabled" type="checkbox" ${settings.measurePerformance===true?'checked':''}></label></div>
   <p class="sheet-note">オンにしてプレイしたあと、この画面で結果を確認できます。</p>
   ${measured.frames?tr`<div class="settings-group"><div class="row"><span>描画の間隔（95%点）</span><span>${measured.frameInterval.p95Ms} ms</span></div><div class="row"><span>描画処理（95%点）</span><span>${measured.drawing.p95Ms} ms</span></div><div class="row"><span>描画が遅れた回数</span><span>${measured.delayedFrames}</span></div><div class="row"><span>音声供給が遅れた回数</span><span>${measured.audio.gaps}</span></div><div class="row"><span>保存処理（95%点）</span><span>${measured.saving.p95Ms} ms</span></div></div>`:tr('<p class="sheet-note">まだ計測結果がありません。</p>')}
   <button class="destructive wide-button" id="performance-clear">計測結果を消去</button>
   <details class="diagnostics-details"><summary>書き出す内容を確認</summary><pre id="diagnostics-preview">${esc(JSON.stringify(snapshot,null,2))}</pre></details>
   <details class="diagnostics-details"><summary>記録・計測について</summary><p class="sheet-note">エラーの種類・使用コア・アプリの状態を、直近5件まで記録します。</p><p class="sheet-note">計測値はこのタブ内だけに保持し、診断ファイルにも含めます。映像や音声の内容は記録しません。</p><p class="sheet-note">95%点は、直近最大256回のうち95%が収まる時間です。音声供給の遅れは音切れの目安で、実際に聞こえた音を測るものではありません。</p><p class="sheet-note">ブラウザごと強制終了した瞬間の詳細は取得できません。前回のプレイが正常終了していなかった場合は、次回プレイ開始時にその事実を記録します。</p></details>`);
  const find=selector=>document.querySelector(selector);
  find('#diagnostics-enabled').onchange=e=>diagnostics.setEnabled(e.target.checked);
  find('#performance-enabled').onchange=e=>{settings.measurePerformance=e.target.checked;applySettings();showDiagnostics();};
  find('#performance-clear').onclick=()=>{performanceDiagnostics.reset();showDiagnostics();};
  find('#diagnostics-export').onclick=()=>{
   const data=diagnostics.snapshot();
   download(new TextEncoder().encode(JSON.stringify(data,null,2)+'\n'),'PalmoEMU-diagnostics-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
  };
  find('#diagnostics-clear').onclick=()=>{diagnostics.clear();showDiagnostics();toast(tr('診断記録を削除しました。'));};
 };
}
