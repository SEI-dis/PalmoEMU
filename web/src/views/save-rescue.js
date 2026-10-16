// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr,locale} from '../i18n/index.js';
import {escapeHTML as esc,bytesLabel,icon} from '../shared.js';
import {inspectSaveRescue,exportRescueOriginal,restoreSaveHistory} from '../storage/save-rescue.js';
export function createSaveRescueView(api){
 const $=selector=>document.querySelector(selector);let busy=false;
 const date=at=>at?new Date(at).toLocaleString(locale()):tr('日時なし');
 const kind=store=>store==='backups'?tr('最近の保存'):store==='archives'?tr('5分ごとの保存'):store==='states'?tr('手動ステートのセーブ'):tr('自動ステートのセーブ');
 const status=value=>value==='valid'?tr('確認済み'):value==='damaged'?tr('破損が見つかりました'):value==='unverified'?tr('整合性の記録なし'):value==='missing'?tr('保存なし'):tr('このコアでは復元できません');
 async function run(task){
  if(busy)return;busy=true;
  const buttons=[...$('#sheet').querySelectorAll('button')].map(button=>[button,button.disabled]);buttons.forEach(([button])=>button.disabled=true);
  const dialog=$('#sheet'),cancel=e=>e.preventDefault();dialog.addEventListener('cancel',cancel);
  try{await task();}catch(e){const message=$('#save-rescue-status');if(message){message.textContent=e.name==='QuotaExceededError'?tr('元のセーブを退避する容量が不足しています。書き出してから保存容量を確認してください。'):e.message;message.setAttribute('role','alert');}else api.error(e);}
  finally{busy=false;buttons.forEach(([button,disabled])=>{if(button.isConnected)button.disabled=disabled;});dialog.removeEventListener('cancel',cancel);}
 }
 async function send(plan,key){const file=await exportRescueOriginal(plan,key);await api.download(file.bytes,file.name);}
 async function open(game,{startupError=false}={}){
  const plan=await inspectSaveRescue(game);
  api.sheet(tr('ゲーム内セーブ・保存履歴'),tr`<p class="sheet-note">${esc(game.name)}</p>
   ${startupError?tr('<p class="sheet-note" role="alert">現在のセーブに破損が見つかり、起動を中止しました。正常な履歴を選んで復元できます。</p>'):''}
   <div class="settings-group">${api.importSave?tr`<button class="text-button text-action" id="save-rescue-import">${icon('saveImport')}<span>読み込む</span></button>`:''}<p class="sheet-note">現在のセーブ：${status(plan.current.status)}<br>${esc(date(plan.current.at))}${plan.current.bytes?' · '+bytesLabel(plan.current.bytes):''}</p>${plan.current.bytes?tr`<button class="text-button text-action" id="save-rescue-export">${icon('saveExport')}<span>現在のセーブをそのまま書き出す</span></button>`:''}</div>
   <p class="sheet-note">復元する前に、現在のセーブを元のまま端末内に退避します。破損したデータも書き出せます。</p>
   <h3>${tr('保存履歴')}</h3><div class="stack">${plan.entries.map((entry,index)=>`<div class="settings-group"><p class="sheet-note">${kind(entry.store)} · ${esc(date(entry.at))}<br>${status(entry.status)} · ${bytesLabel(entry.bytes)}</p><button class="secondary" data-rescue-restore="${index}" ${entry.status==='valid'?'':'disabled'}>${tr('このセーブを復元')}</button></div>`).join('')||tr('<p class="sheet-note">保存履歴はありません。</p>')}</div>
   ${plan.originals.length?tr`<h3>退避した元データ</h3><div class="stack">${plan.originals.map((entry,index)=>`<button class="text-button text-action" data-rescue-original="${index}">${icon('saveExport')}<span>${esc(date(entry.at))} · ${tr('書き出す')}</span></button>`).join('')}</div>`:''}
   <p class="sheet-note" id="save-rescue-status" role="status" aria-live="polite"></p>`,false,{onBack:()=>api.showGame(game)});
  if($('#save-rescue-import'))$('#save-rescue-import').onclick=()=>api.importSave(game);
  if($('#save-rescue-export'))$('#save-rescue-export').onclick=()=>run(()=>api.exportSave&&['valid','unverified'].includes(plan.current.status)?api.exportSave(game):send(plan));
  document.querySelectorAll('[data-rescue-original]').forEach(button=>button.onclick=()=>run(()=>send(plan,plan.originals[Number(button.dataset.rescueOriginal)].key)));
  document.querySelectorAll('[data-rescue-restore]').forEach(button=>button.onclick=()=>confirm(game,plan,Number(button.dataset.rescueRestore)));
 }
 function confirm(game,plan,index){
  const entry=plan.entries[index];if(entry?.status!=='valid')return;
  api.sheet(tr('セーブを復元'),tr`<p class="sheet-note">${esc(date(entry.at))}のゲーム内セーブに戻します。現在のセーブは「退避した元データ」に残します。ステートや他の保存履歴は変更しません。</p><p class="sheet-note" id="save-rescue-status" role="status" aria-live="polite"></p><div class="sheet-actions"><button class="secondary" id="save-rescue-cancel">キャンセル</button><button class="primary" id="save-rescue-confirm">復元する</button></div>`,false,{onBack:()=>run(()=>open(game)),confirmation:true});
  $('#save-rescue-cancel').onclick=()=>run(()=>open(game));
  $('#save-rescue-confirm').onclick=()=>run(async()=>{await restoreSaveHistory(plan,index);await api.refresh?.();api.toast(tr('セーブを復元しました。'));await open(game);});
 }
 return {open};
}
