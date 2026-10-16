// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr,locale} from '../i18n/index.js';
import {inspectBackup,restoreBackup,prepareBackupExport,createBackupPart,backupErrorMessage,releaseBackupPlan,hasPreviousBackup} from '../storage/backup.js';
import {readBackupData} from '../storage/storage.js';
import {escapeHTML as esc,bytesLabel} from '../shared.js';
import {row} from '../components/rows.js';

export function createBackupView({sheet,download,settings,onClose=()=>{},onRestored=()=>location.reload()}){
 const $=s=>document.querySelector(s);let busy=false,open=false,epoch=0,plan=null,exportPlan=null,inventoryReady=Promise.resolve(),restored=null,exporting=false,releaseBusy=null;
 const filename=kind=>'PalmoEMU-'+kind+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
 const status=message=>{const node=$('#backup-status');if(open&&node){node.textContent=message;node.setAttribute('role','status');node.style.overflowWrap='anywhere';}};
 const release=()=>{releaseBackupPlan(plan);releaseBackupPlan(exportPlan);plan=null;exportPlan=null;};
 function cleanup(){releaseBusy?.();releaseBusy=null;busy=false;open=false;epoch++;release();if(exporting)download.close?.();exporting=false;if(restored){const result=restored;restored=null;onRestored(result);}}
 function refresh(){const result=restored;restored=null;onRestored(result);}
 async function send(result,kind){
  const part=result.archive.part,name=filename(kind+(part?'-'+part.id.slice(0,8)+'-'+part.index+'-of-'+part.count:''));let bytes=new TextEncoder().encode(result.text+'\n');result=null;
  exporting=true;try{const task=download(bytes,name);bytes=null;return await task;}finally{exporting=false;}
 }
 const outcomeText=value=>value==='saved'?tr('保存しました。'):value==='shared'?tr('共有しました。'):value==='download'?tr('ダウンロードを開始しました。'):tr('キャンセルしました。');
 async function exportFiles(previous=false){
  const current=epoch;if(!previous)await inventoryReady;if(!open||current!==epoch)return;
  const gameIds=[...document.querySelectorAll('[data-backup-export-game]:checked')].map(box=>box.dataset.backupExportGame),all=document.querySelectorAll('[data-backup-export-game]').length===gameIds.length;
  releaseBackupPlan(exportPlan);exportPlan=null;$('#backup-parts').replaceChildren();
  const prepared=await prepareBackupExport(settings,{previous,...(!previous?{gameIds:all?undefined:gameIds,latestOnly:$('#backup-latest').checked}:{})});
  if(!open||current!==epoch){releaseBackupPlan(prepared);return;}exportPlan=prepared;
  if(!prepared){status(tr('復元前のバックアップはまだありません。'));return;}
  const kind=previous?'before-restore':'backup',container=$('#backup-parts');
  if(prepared.parts.length===1){try{const outcome=await send(await createBackupPart(prepared,1),kind);if(current===epoch)status(outcomeText(outcome));}finally{releaseBackupPlan(prepared);if(exportPlan===prepared)exportPlan=null;}return;}
  status(tr`${prepared.parts.length}個のファイルに分けます。すべて保存してください。`);
  for(const part of prepared.parts){
   const button=document.createElement('button');button.className='secondary wide-button';button.textContent=tr`ファイル ${part.index} / ${prepared.parts.length}`;button.dataset.backupPart=String(part.index);
   button.onclick=()=>run(tr('バックアップを作成しています…'),async()=>{
    const outcome=await send(await createBackupPart(prepared,part.index),kind);if(current!==epoch)return;
    if(['saved','shared','download'].includes(outcome)){button.dataset.exported='true';button.textContent=tr`ファイル ${part.index} / ${prepared.parts.length}：${outcomeText(outcome)}`;}
    status(outcomeText(outcome));
   });container.append(button);
  }
 }
 async function run(message,task){
  if(busy||!open)return;busy=true;status(message);const current=epoch;
  const buttons=[...$('#backup-view').querySelectorAll('button,input')].map(button=>[button,button.disabled]);buttons.forEach(([button])=>button.disabled=true);
  const close=$('#close-sheet'),wasDisabled=close?.disabled;if(close)close.disabled=true;
  const dialog=$('#sheet'),cancel=e=>e.preventDefault();dialog?.addEventListener('cancel',cancel);
  const unlock=()=>{buttons.forEach(([button,disabled])=>{if(button.isConnected)button.disabled=disabled;});if(close)close.disabled=wasDisabled;dialog?.removeEventListener('cancel',cancel);};releaseBusy=unlock;
  try{await task();}catch(error){if(open&&current===epoch){status(backupErrorMessage(error,error.name==='QuotaExceededError'?tr('保存容量が足りません。セーブを書き出してから保存容量を確認してください。'):error instanceof DOMException?tr('保存機能でエラーが起きました。ページを開き直してください。'):error.message||tr('バックアップ操作に失敗しました。')));$('#backup-status')?.setAttribute('role','alert');}}
  finally{if(releaseBusy===unlock){busy=false;unlock();releaseBusy=null;}else dialog?.removeEventListener('cancel',cancel);}
 }
 function frame(mode){
  release();epoch++;const node=$('#backup-view');node.innerHTML=tr`<div class="segmented"><button id="backup-mode-save" aria-pressed="${mode==='save'}">保存</button><button id="backup-mode-restore" aria-pressed="${mode==='restore'}">復元</button></div><div id="backup-content"></div><p class="sheet-note" id="backup-status" role="status" aria-live="polite"></p><div id="backup-parts" class="stack"></div>`;
  $('#backup-mode-save').onclick=()=>showStage('save');$('#backup-mode-restore').onclick=()=>showStage('restore');
 }
 async function previousButton(container,current){
  if(!await hasPreviousBackup()||!open||current!==epoch||!container.isConnected)return;
  const button=document.createElement('button');button.id='backup-previous';button.className='secondary wide-button';button.textContent=tr('復元前のデータを保存');button.onclick=()=>run(tr('復元前のデータを読み込んでいます…'),()=>exportFiles(true));container.append(button);
 }
 function showStage(mode){
  if(busy)return;frame(mode);const current=epoch,content=$('#backup-content');
  if(mode==='save'){
   content.innerHTML=tr`<p class="sheet-note">セーブ・ステート・設定・プレイ記録をファイルに保存します。</p><details id="backup-export-options"><summary>保存する内容</summary><div class="settings-group">${row(tr('最新のゲーム内セーブだけ'),'<input type="checkbox" id="backup-latest">','save')}</div><p class="sheet-note">オンにするとステートと保存履歴を除きます。</p><div id="backup-export-games"></div></details><button class="primary wide-button" id="backup-export">保存する</button><p class="sheet-note">先にゲームを終了してください。ROM・カバー・スキン・診断記録は含みません。</p>`;
   const exportGames=$('#backup-export-games'),button=$('#backup-export');button.disabled=true;
   inventoryReady=readBackupData({summary:true,inventoryOnly:true}).then(data=>{if(!open||current!==epoch)return;exportGames.innerHTML='<div class="settings-group">'+data.games.map(game=>row(esc(game.name||game.system.toUpperCase()),`<input type="checkbox" data-backup-export-game="${esc(game.id)}" checked>`,'game')).join('')+'</div>';button.disabled=false;});
   inventoryReady.catch(error=>{if(current===epoch){status(backupErrorMessage(error));$('#backup-status')?.setAttribute('role','alert');}});
   button.onclick=()=>run(tr('バックアップを作成しています…'),()=>exportFiles());
   content.onchange=()=>{releaseBackupPlan(exportPlan);exportPlan=null;$('#backup-parts').replaceChildren();status('');};
  }else{
   content.innerHTML=tr('<p class="sheet-note">ファイルを選ぶと、復元する内容を確認できます。</p><label class="primary wide-button" for="backup-import">ファイルを選ぶ</label><input type="file" id="backup-import" hidden><div id="backup-preview"></div><div id="backup-previous-slot" class="stack"></div>');
   previousButton($('#backup-previous-slot'),current).catch(()=>{});
   $('#backup-import').onchange=event=>{const file=event.target.files[0];event.target.value='';if(file)run(tr('ファイルを検証しています…'),async()=>{
    releaseBackupPlan(plan);plan=null;$('#backup-preview').replaceChildren();const inspected=await inspectBackup(file);if(!open||current!==epoch){releaseBackupPlan(inspected);return;}plan=inspected;preview();status(tr('復元する内容を確認してください。'));
   });};
  }
 }
 function preview(){
  const date=at=>at?new Date(at).toLocaleString(locale()):tr('保存なし'),preview=$('#backup-preview');
  preview.innerHTML=tr`<p class="sheet-note">${esc(new Date(plan.createdAt).toLocaleString(locale()))} · ${plan.matched}ゲーム · ${bytesLabel(plan.bytes)}</p>${plan.part?tr`<p class="sheet-note">分割ファイル ${plan.part.index} / ${plan.part.count}。すべて順に復元してください。</p>`:''}${plan.missing?tr`<p class="sheet-note">未登録の${plan.missing}ゲームは復元しません。</p>`:''}
   ${plan.games.length?tr('<button class="secondary" id="backup-select-all">選択を解除</button>'):''}<div class="settings-group">${plan.games.map(game=>row(`<span class="value">${esc(game.name)}<small>${tr`現在：${esc(date(game.currentAt))}`}<br>${tr`ファイル：${esc(date(game.backupAt))}`}${game.currentAt>game.backupAt?tr('<br>現在の保存のほうが新しくなっています。'):''}${game.romMissing?tr('<br>ROMを追加するとプレイできます。'):''}</small></span>`,`<input type="checkbox" data-backup-game="${game.id}" checked>`,'game')).join('')}</div>
   <details><summary>設定とトレーナーカード</summary><div class="settings-group">${row(tr('共通設定も復元する'),'<input type="checkbox" id="backup-settings">','settings')}${plan.hasProfile?row(tr('トレーナーカードも復元する'),'<input type="checkbox" id="backup-profile">','game'):''}</div></details>
   <p class="sheet-note">${plan.merge?tr('ファイルにある項目だけを復元します。それ以外は残ります。'):tr('選んだゲームの保存データを置き換えます。')}</p><p class="sheet-note">復元前のデータを端末に残します。すべてのタブで対象のゲームを終了してください。</p><details><summary>復元について</summary><p class="sheet-note">共通設定やカードも復元する場合は、ほかのゲームも終了してください。プレイ時間を重複加算しません。復元前のデータは1世代分を保持します。スキンはこの端末の設定を使います。</p></details><button class="primary wide-button" id="backup-confirm">復元する</button>`;
  const boxes=()=>[...preview.querySelectorAll('[data-backup-game]')],selection=()=>boxes().filter(box=>box.checked).map(box=>box.dataset.backupGame);
  const update=()=>{const count=selection().length;$('#backup-confirm').disabled=!count&&!$('#backup-settings').checked&&!$('#backup-profile')?.checked;if($('#backup-select-all'))$('#backup-select-all').textContent=count===plan.games.length?tr('選択を解除'):tr('すべて選択');};
  boxes().forEach(box=>box.onchange=update);$('#backup-settings').onchange=update;if($('#backup-profile'))$('#backup-profile').onchange=update;
  if($('#backup-select-all'))$('#backup-select-all').onclick=()=>{const checked=selection().length!==plan.games.length;boxes().forEach(box=>box.checked=checked);update();};update();
  $('#backup-confirm').onclick=()=>run(tr('復元しています…'),async()=>{
   const part=plan.part,result=await restoreBackup(plan,{settings,gameIds:selection(),includeSettings:$('#backup-settings').checked,includeProfile:!!$('#backup-profile')?.checked});plan=null;restored=result;
   if(!open){refresh();return;}const current=epoch;$('#backup-content').innerHTML=tr`<p class="sheet-note">${result.games}ゲームのデータを復元しました。</p><button class="primary wide-button" id="backup-reload">再読み込みして続ける</button>${part?tr('<button class="secondary wide-button" id="backup-next">次のファイルを復元</button>'):''}<div id="backup-previous-slot" class="stack"></div>`;
   $('#backup-mode-save').hidden=$('#backup-mode-restore').hidden=true;status('');$('#backup-reload').onclick=refresh;if($('#backup-next'))$('#backup-next').onclick=()=>showStage('restore');previousButton($('#backup-previous-slot'),current).catch(()=>{});
  });
 }
 function showBackup(){
  sheet(tr('まとめてバックアップ'),'<div id="backup-view"></div>');open=true;busy=false;onClose(cleanup);showStage('save');
 }
 showBackup.cleanup=cleanup;
 return showBackup;
}
