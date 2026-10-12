// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr,locale} from '../i18n/index.js';
import {createBackup,inspectBackup,restoreBackup,previousBackup} from '../backup.js';
import {escapeHTML as esc,bytesLabel} from '../shared.js';
export function createBackupView({sheet,download,toast,settings,onRestored=()=>location.reload()}){
 const $=s=>document.querySelector(s);let busy=false,plan=null;
 const filename=kind=>'PalmoEMU-'+kind+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
 const send=(result,kind)=>download(new TextEncoder().encode(result.text+'\n'),filename(kind));
 async function run(message,task){
  if(busy)return;busy=true;const status=$('#backup-status');status.textContent=message;
  const buttons=[...$('#sheet-body').querySelectorAll('button,input')];buttons.forEach(b=>b.disabled=true);
  const close=$('#close-sheet'),wasDisabled=close?.disabled;if(close)close.disabled=true;
  const dialog=$('#sheet'),cancel=e=>e.preventDefault();dialog?.addEventListener('cancel',cancel);
  try{await task();}catch(e){status.textContent=e.name==='QuotaExceededError'?tr('保存容量が足りないため、操作を完了できませんでした。大切なセーブを書き出してから保存容量を確認してください。'):e instanceof DOMException?tr('ブラウザの保存機能でエラーが起きました。ページを開き直してからやり直してください。'):e.message||tr('バックアップ操作に失敗しました。');status.setAttribute('role','alert');}
  finally{busy=false;buttons.forEach(b=>b.disabled=false);if(close)close.disabled=wasDisabled;dialog?.removeEventListener('cancel',cancel);}
 }
 function showBackup(){
  plan=null;sheet(tr('まとめてバックアップ'),tr`<p class="sheet-note">全ゲームのセーブ・手動ステート・自動保存履歴と、共通／ゲーム別の設定を1つのファイルに保存します。ROM、カバー、スキン、診断記録は含みません。</p>
   <div class="stack"><button class="primary" id="backup-export">バックアップを書き出す</button><label class="secondary wide-button" for="backup-import">バックアップを選んで復元</label><input type="file" id="backup-import" hidden></div>
   <p class="sheet-note" id="backup-status" role="status" aria-live="polite">保存データは合計128 MiB、ファイルは192 MiBまで。最新のセーブを含めるには、先にゲームを終了してください。</p>
   <div id="backup-preview"></div><div class="stack"><button class="secondary" id="backup-previous">復元前のバックアップを書き出す</button></div>
   <p class="sheet-note">復元は同じROMがあるゲームだけに適用します。復元前のデータと設定を端末内に1世代残し、次回の復元時に置き換えます。スキンの選択・画像は別途設定してください。</p>`);
  $('#backup-export').onclick=()=>run(tr('バックアップを作成しています…'),async()=>{const result=await createBackup(settings);send(result,'backup');$('#backup-status').textContent=tr`${result.summary.games}ゲーム・${result.summary.records}件を書き出しました。`;toast(tr('バックアップを書き出しました。'));});
  $('#backup-previous').onclick=()=>run(tr('復元前のデータを読み込んでいます…'),async()=>{const result=await previousBackup();if(!result){$('#backup-status').textContent=tr('復元前のバックアップはまだありません。');return;}send(result,'before-restore');$('#backup-status').textContent=tr('復元前のバックアップを書き出しました。');});
  $('#backup-import').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file)run(tr('ファイルと保存データを検証しています…'),async()=>{
   plan=null;$('#backup-preview').replaceChildren();plan=await inspectBackup(file);
   $('#backup-status').textContent=tr('検証が完了しました。まだデータは変更していません。');
   $('#backup-preview').innerHTML=tr`<div class="settings-group"><p class="sheet-note">作成日：${esc(new Date(plan.createdAt).toLocaleString(locale()))}<br>一致するゲーム：${plan.matched}件<br>ROM未追加：${plan.missing}件（復元しません）<br>ファイル内の保存項目：${plan.records}件・${bytesLabel(plan.bytes)}</p></div><p class="sheet-note">一致するゲームのセーブ・ステート・設定と共通設定を置き換えます。現在の内容は復元前バックアップに残ります。すべてのタブでゲームを終了してください。</p><button class="primary wide-button" id="backup-confirm">この内容で復元する</button>`;
   $('#backup-confirm').onclick=()=>run(tr('復元前のデータを保護し、まとめて復元しています…'),async()=>{const result=await restoreBackup(plan,{settings});$('#backup-status').textContent=tr`${result.games}ゲームのデータと設定を復元しました。`;toast(tr('バックアップを復元しました。'));await onRestored(result);});
  });};
 }
 return showBackup;
}
