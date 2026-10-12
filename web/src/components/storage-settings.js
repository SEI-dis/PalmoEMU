// Storage section extracted from the ManicEMU-derived settings view.
// Copyright © 2025 Manic EMU / Daiuno. Web adaptation 2026-10-12.
// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
import {bytesLabel} from '../shared.js';
import {row} from './rows.js';
export function createStorageSettings(api){
 const {settings,sheet,bindSettings}=api;
 const $=selector=>document.querySelector(selector);
function showStorage(){
 const storage=navigator.storage;
 sheet(tr('保存容量'),tr`<p class="sheet-note" id="storage-usage">容量を確認中…</p><div class="settings-group">${row(tr('セーブを端末に自動保存'),`<input data-setting="autosave" type="checkbox" ${settings.autosave?'checked':''}>`,'save')}</div><p class="sheet-note">自動ステートをオンにした場合も、セーブを一緒に保存します。</p><button class="secondary" id="persistent" aria-describedby="persistent-status" disabled>保存データを保護</button><p class="sheet-note" id="persistent-status" role="status" aria-live="polite">保護状態を確認中…</p><p class="sheet-note">空き容量不足による自動削除を防ぐ設定です。手動でのサイトデータ削除や端末故障に備え、セーブはファイルにも書き出してください。</p>`);
 bindSettings($('#sheet-body'));
 const button=$('#persistent'),status=$('#persistent-status'),usage=$('#storage-usage');
 const supported=typeof storage?.persist==='function';let pending=false,waitTimer;
 api.onClose(()=>clearTimeout(waitTimer));
 const render=(message,state,disabled=!supported)=>{
  if(!button.isConnected)return;
  status.textContent=message;status.dataset.state=state;
  button.disabled=disabled;button.textContent=state==='granted'?tr('保護済み'):state==='pending'?tr('確認中…'):tr('保存データを保護');
 };
 const ready=()=>render(supported?tr('自動削除からの保護は無効です。'):tr('このブラウザでは保護を設定できません。'),supported?'inactive':'unsupported');
 button.onclick=async()=>{
  if(pending||!supported||button.disabled)return;
  pending=true;render(tr('ブラウザに確認しています…'),'pending',true);
  waitTimer=setTimeout(()=>render(tr('ブラウザの応答を待っています。確認画面が出ている場合は選択してください。'),'pending',true),10000);
  try{
   // Call directly from the click handler, preserving user activation where needed.
   const granted=await storage.persist();
   render(granted?tr('自動削除から保護されています。'):tr('ブラウザが保護を許可しませんでした。'),granted?'granted':'denied',granted);
  }catch{render(tr('保護を設定できませんでした。もう一度お試しください。'),'error',false);}
  finally{pending=false;clearTimeout(waitTimer);}
 };
 (async()=>{
  try{
   const stat=await storage?.estimate?.();
   if(usage.isConnected)usage.textContent=stat?tr`使用量： ${bytesLabel(stat.usage||0)}\n保存上限（目安）： ${bytesLabel(stat.quota||0)}`:tr('保存容量を取得できません。');
  }catch{if(usage.isConnected)usage.textContent=tr('保存容量を取得できません。');}
 })();
 (async()=>{
  if(typeof storage?.persisted!=='function'){if(supported)render(tr('現在の保護状態を確認できません。'),'unknown',false);else ready();return;}
  let timer;
  try{
   const granted=await Promise.race([storage.persisted(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Storage status timed out')),5000);})]);
   if(granted)render(tr('自動削除から保護されています。'),'granted',true);else ready();
  }catch{if(supported)render(tr('保護状態を確認できませんでした。'),'unknown',false);else ready();}
  finally{clearTimeout(timer);}
 })();
}
 return showStorage;
}
