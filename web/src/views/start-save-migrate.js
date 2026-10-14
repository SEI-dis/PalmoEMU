// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
import {escapeHTML as esc} from '../shared.js';
import {guardUpdateTask} from '../update-activity.js';
import {START_SOURCE_VERSIONS} from '../start-save/migration.js';
import {startSaveTask} from '../start-save/client.js';

export function createStartSaveDialog(api){
 const $=selector=>document.querySelector(selector);
 let busy=false;
 const bind=(selector,action)=>$(selector).onclick=guardUpdateTask(async()=>{if(busy)return;try{await action();}catch(error){if($('#start-save-status'))$('#start-save-status').textContent=error.message;api.error(error);}});
 async function work(action){
  busy=true;const close=$('#close-sheet'),controls=[...$('#sheet-body').querySelectorAll('button,input,select')],disabled=controls.map(x=>x.disabled);close.disabled=true;controls.forEach(x=>x.disabled=true);
  try{return await action();}finally{busy=false;close.disabled=false;controls.forEach((x,i)=>x.disabled=disabled[i]);}
 }
 async function open(game,{previous=!!game.romUpdate,onBack=()=>api.showGame(game),apply,target,targetProfile,onCopy}={}){
  const task=options=>startSaveTask({id:game.id,previous,targetId:target?.id,targetProfile,...options});
  api.sheet(tr('セーブデータを変換'),tr`<p class="sheet-note" id="start-save-status" role="status">セーブを確認中…</p><div id="start-save-options" hidden></div><button id="start-save-back" class="secondary wide-button">戻る</button>`);
  bind('#start-save-back',onBack);
  let inspected;
  try{inspected=await work(()=>task({action:'inspect'}));}
  catch(error){$('#start-save-status').textContent=error.message;return;}
  if(inspected.compatibility.status==='compatible'&&!inspected.validationError&&onCopy){await onCopy(inspected,true);return;}
  const direct=!!(target&&inspected.targetReady&&api.applySave),canApply=direct||!!apply;
  const targetVersion=inspected.compatibility.to,blockedTarget=!!(target||targetProfile)&&!inspected.targetReady;
  let compatibility=inspected.compatibility,validationError=inspected.validationError;
  const options=$('#start-save-options');options.hidden=false;
  options.innerHTML=tr`<p class="sheet-note">${esc(inspected.name)} → PokemonStart ${esc(targetVersion||'?')}</p><p id="start-save-note" class="sheet-note"></p><p class="sheet-note">旧版は残します。適用前のセーブはバックアップに残ります。</p><div id="start-version-required"></div><label id="start-save-unverified-row" class="row" hidden><input id="start-save-unverified" type="checkbox"><span>変換の必要性が未確認であることを理解して変換する</span></label><button id="start-save-apply" class="primary wide-button">${canApply?tr('セーブデータを変換して更新'):tr('変換セーブを書き出す')}</button><button id="start-save-copy" class="secondary wide-button" hidden>変換せずに引き継ぐ</button><details id="start-save-details" class="sheet-note"><summary>詳細</summary>${game.romUpdate&&!apply?tr`<label class="row"><span>使用するセーブ</span><select id="start-save-source"><option value="current">現在のセーブ</option><option value="previous">更新前のバックアップ</option></select></label>`:''}<label id="start-version-field" class="row"><span>元のゲームのバージョン</span><select id="start-save-version"><option value="">選択してください</option>${START_SOURCE_VERSIONS.map(({version})=>`<option value="${esc(version)}">${esc(version)}</option>`).join('')}</select></label><p class="sheet-note">${previous?tr('更新前に保存したセーブを使用します。'):tr('このゲームの現在のセーブを使用します。')}</p><button id="start-save-export" class="secondary wide-button">変換セーブを書き出す</button></details>`;
  if(inspected.version&&!START_SOURCE_VERSIONS.some(entry=>entry.version===inspected.version))$('#start-save-version').add(new Option(inspected.version,inspected.version));
  $('#start-save-version').value=inspected.version||'';
  const update=()=>{
   const from=$('#start-save-version').value,compatible=compatibility.status==='compatible',unknown=compatibility.status==='unknown',valid=!!from&&!validationError;
   if(!from||unknown||validationError)$('#start-version-required').append($('#start-version-field'));
   const allowed=valid&&!blockedTarget&&START_SOURCE_VERSIONS.some(entry=>entry.version===from)&&(!unknown||$('#start-save-unverified').checked);
   $('#start-save-apply').disabled=compatible?(!onCopy||!valid):!allowed;$('#start-save-export').disabled=compatible||!allowed;
   $('#start-save-apply').textContent=compatible?tr('変換せずに引き継ぐ'):canApply?tr('セーブデータを変換して更新'):tr('変換セーブを書き出す');
   $('#start-save-unverified-row').hidden=!unknown||!valid;
   $('#start-save-copy').hidden=!onCopy||!unknown||!valid||blockedTarget;
   $('#start-save-note').textContent=compatible?tr('このセーブは変換せずに引き継げます。'):unknown?tr('この組み合わせで変換が必要かは未確認です。元のバージョンと作者の案内を確認してください。'):tr('この旧版のセーブは、そのままでは新版で続きから遊べないため、変換して更新します。');
   $('#start-save-status').textContent=validationError||(blockedTarget?tr('このROMへのセーブ変換には未対応です。元のデータは変更していません。'):from?`${from} → ${targetVersion}`:tr('移行元のバージョンを選択してください。'));
  };
  update();$('#start-save-unverified').onchange=update;
  $('#start-save-version').onchange=guardUpdateTask(async()=>{
   if(busy)return;$('#start-save-unverified').checked=false;validationError=null;compatibility={status:'unknown'};
   const from=$('#start-save-version').value;
   if(from)try{const result=await work(()=>task({action:'classify',from,hash:inspected.hash,at:inspected.at}));compatibility=result.compatibility;}
   catch(error){validationError=error.message;}
   update();
  });
  if($('#start-save-source')){
   $('#start-save-source').value=previous?'previous':'current';
   $('#start-save-source').onchange=guardUpdateTask(event=>open(game,{previous:event.target.value==='previous',onBack,apply,target,targetProfile,onCopy}));
  }
  const convert=()=>startSaveTask({action:'convert',id:game.id,previous,targetId:target?.id,targetProfile,from:$('#start-save-version').value,hash:inspected.hash,at:inspected.at,allowUnverified:$('#start-save-unverified').checked},progress=>{
   if(progress?.total)$('#start-save-status').textContent=tr('セーブを変換中…')+` ${progress.index} / ${progress.total}`;
  });
  const exportResult=async()=>{
   $('#start-save-status').textContent=tr('セーブを変換中…');
   const result=await work(convert);showResult(result,()=>open(game,{previous,onBack,apply,target,targetProfile,onCopy}),direct?target:null);
  };
  bind('#start-save-export',exportResult);
  bind('#start-save-copy',()=>onCopy({...inspected,version:$('#start-save-version').value},false));
  bind('#start-save-apply',async()=>{
   if(compatibility.status==='compatible')return onCopy?.({...inspected,version:$('#start-save-version').value},true);
   if(!canApply)return exportResult();
   const from=$('#start-save-version').value;if(!from)return;
   $('#start-save-status').textContent=tr('セーブを変換中…');
   await work(async()=>{if(direct){const result=await convert();await api.applySave(target,result.bytes);}else await apply(from,progress=>{
    if(progress.phase==='migrating'&&progress.total)$('#start-save-status').textContent=tr('セーブを変換中…')+` ${progress.loaded} / ${progress.total}`;
   },{allowUnverified:$('#start-save-unverified').checked});});
  });
 }
 function showResult(result,onBack,target){
  api.sheet(tr('セーブの変換が完了しました'),tr`<button id="start-save-download" class="primary wide-button">変換セーブを保存</button><button id="start-save-original" class="secondary wide-button">元セーブを書き出す</button>${target?tr`<button id="start-save-target" class="secondary wide-button">新版のゲーム詳細へ</button>`:''}<button id="start-save-back" class="secondary wide-button">戻る</button>`);
  bind('#start-save-download',()=>api.download(result.bytes,result.name+'-'+result.report.to+'.sav'));
  bind('#start-save-original',()=>api.download(result.original,result.name+'-original.sav'));
  if(target)bind('#start-save-target',()=>api.showGame(target));bind('#start-save-back',onBack);
 }
 return {open};
}
