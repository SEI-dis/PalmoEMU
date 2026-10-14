/* SaveStateListView Web port. Copyright © 2025–2026 Manic EMU.
   Created by Daiuno. Modified 2026-10-13. See sources/manicemu-ui/README.md. */
// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr,locale} from '../i18n/index.js';
import * as db from '../storage/storage.js';
import {escapeHTML as esc,hash} from '../shared.js';
import {saveKey,coreFor,compatibleState} from '../core/core-registry.js';
import {stateRow} from '../components/manic-ui.js';
import {exportState,inspectState,importState} from '../storage/state-transfer.js';
import {guardUpdateTask} from '../updates/update-activity.js';
export function createStateDialogs(api){
 const {runtime,sheet,closeSheet,setPause,persist,launch,showGameMenu,toast,error,download}=api;
 const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
 let transferBusy=false;
 const transfer=guardUpdateTask(async task=>{
  if(transferBusy)return;transferBusy=true;
  const controls=$$('#sheet button,#sheet input').map(control=>[control,control.disabled]);controls.forEach(([control])=>control.disabled=true);
  const dialog=$('#sheet'),cancel=e=>e.preventDefault();dialog.addEventListener('cancel',cancel);
  try{return await task();}catch(e){error(e);return false;}
  finally{transferBusy=false;controls.forEach(([control,disabled])=>control.disabled=disabled);dialog.removeEventListener('cancel',cancel);}
 });
// SaveStateListView: manual/automatic segments and thumbnail rows. Editing is
// separate from Continue, and deletion requires a confirmed selection.
async function showStates(mode=null,editing=false,{interrupted=false,game=runtime.current}={}){
 if(!game||runtime.link||runtime.busy||transferBusy)return;
 const manual=await db.stateEntries(saveKey(game)),automatic=(await db.get('recoveries',saveKey(game))||[]).map((value,i)=>({key:String(i),value}));
 mode??=manual.length||!automatic.length?'manual':'auto';editing=editing&&(mode==='auto'?automatic:manual).length>0;
 const entries=mode==='auto'?automatic:manual;entries.sort((a,b)=>b.value.at-a.value.at);const selected=new Set();
 const note=interrupted?tr('<p class="sheet-note">自動保存した状態から再開できます。</p>'):'';
 const footer=interrupted?tr('<div class="state-footer"><button class="secondary wide-button" id="continue-save">通常どおり起動</button></div>'):'';
 sheet(interrupted?tr('前回のプレイを復旧'):tr('セーブステート'),tr`${note}<div class="segmented" role="group" aria-label="保存の種類"><button data-state-mode="manual" aria-pressed="${mode==='manual'}">手動</button><button data-state-mode="auto" aria-pressed="${mode==='auto'}">自動</button></div><div class="state-scroll"><div class="settings-group save-entries">${entries.map(({value},i)=>stateRow(value,i,{editing,automatic:mode==='auto',compatible:compatibleState(coreFor(game).id,value)})).join('')||tr('<p class="empty-states">セーブステートはありません。</p>')}</div>${editing&&mode==='manual'?tr('<div class="state-edit-tools"><button id="select-all-states">すべて選択</button><button class="danger" id="delete-selected-states" disabled>削除</button></div>'):''}${mode==='auto'?tr`<details class="save-details"><summary>保存状況</summary><p id="protection-status">${esc($('#save-status').dataset.detail||tr('未保存'))}</p></details>`:''}</div>${footer}`,true);$('#sheet').classList.add('states-view');
 if(mode==='manual'&&entries.length){$('#sheet-tools').innerHTML=`<button class="nav-text" id="edit-states">${editing?tr('完了'):tr('編集')}</button>`;$('#edit-states').onclick=()=>showStates(mode,!editing,{interrupted,game});}
 if(mode==='auto'&&entries.length){$('#sheet-tools').innerHTML=`<button class="nav-text" id="export-states">${editing?tr('完了'):tr('書き出す')}</button>`;$('#export-states').onclick=()=>showStates(mode,!editing,{interrupted,game});}
 if(mode==='manual'){
  const tools=document.createElement('div');tools.className='stack';tools.innerHTML=tr`<button class="secondary wide-button" id="state-import-open" ${game.romMissing?'disabled':''}>ステートを取り込む</button><input type="file" id="state-import-file" hidden><p class="sheet-note">PalmoEMUから書き出したステートを新しい手動保存として追加します。現在の保存は残り、自動では再開しません。</p>${game.romMissing?tr('<p class="sheet-note">ステートを取り込むには、先に同じROMを追加してください。</p>'):''}`;$('.state-scroll').append(tools);
  $('#state-import-open').onclick=()=>$('#state-import-file').click();
  $('#state-import-file').onchange=async event=>{
   const file=event.target.files[0];event.target.value='';if(!file)return;
   const target={...game,coreKey:coreFor(game).key},activeEngine=runtime.engine,activeGame=activeEngine?runtime.current:null;
   const assertCurrent=()=>{if(runtime.engine!==activeEngine||runtime.link||coreFor(game).key!==target.coreKey||activeEngine&&(!runtime.current||runtime.current.id!==target.id||coreFor(runtime.current).key!==target.coreKey))throw Error(tr('ゲームやコアが変更されました。ファイルを選び直してください。'));};
   const result=await transfer(async()=>{const plan=await inspectState(file,target);assertCurrent();const saved=await importState(plan,target,{activeGame,assertCurrent});assertCurrent();return saved;});
   if(result){await showStates('manual',false,{interrupted,game});toast(tr('新しい手動保存として追加しました。'));}
  };
 }
 $$('[data-state-mode]').forEach(b=>b.onclick=()=>showStates(b.dataset.stateMode,false,{interrupted,game}));if($('#continue-save'))$('#continue-save').onclick=closeSheet;
 $$('[data-slot-load]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{if(!runtime.engine){if(await launch(game,{skipRecovery:true})===false){b.disabled=false;if($('#sheet').classList.contains('states-view'))closeSheet({dismiss:true});return;}setPause(true);}if(game.id!==runtime.current?.id||runtime.link)throw new Error(tr('ゲームの状態が変わりました。'));const state=entries[Number(b.dataset.slotLoad)].value;await persist({checkpoint:true,reason:'before-state'});await runtime.invalidateHistory?.();await runtime.protection.restoreState(runtime.engine,state);if(mode==='auto')await persist({checkpoint:true,reason:'recovery'});closeSheet();toast(tr('再開しました。'));}catch(e){error(e);b.disabled=false;}});
 if(!editing)return;
 if(mode==='auto'){const tools=document.createElement('div');tools.className='state-edit-tools';$('.save-entries').after(tools);}
 const exportButton=document.createElement('button');exportButton.id='export-selected-state';exportButton.textContent=tr('書き出す');exportButton.disabled=true;$('.state-edit-tools').insertBefore(exportButton,$('#delete-selected-states'));
 exportButton.onclick=()=>transfer(async()=>{if(selected.size!==1)return;const record=entries[[...selected][0]].value,result=await exportState(game,record);download(new TextEncoder().encode(result.text+'\n'),game.name+'-'+result.at+'.palmstate');toast(tr('ステートを書き出しました。'));});
 const update=()=>{const count=selected.size;exportButton.disabled=count!==1;if(mode==='auto')return;$('#delete-selected-states').disabled=!count;$('#delete-selected-states').textContent=count?tr`削除（${count}）`:tr('削除');$('#select-all-states').textContent=count===entries.length?tr('選択を解除'):tr('すべて選択');};
 $$('[data-state-select]').forEach(box=>box.onchange=()=>{const i=Number(box.dataset.stateSelect);if(mode==='auto'){selected.clear();$$('[data-state-select]').forEach(other=>{if(other!==box)other.checked=false;});}if(box.checked)selected.add(i);else selected.delete(i);update();});
 if(mode==='auto')return; // Automatic recovery records can be shared, never deleted.
 $('#select-all-states').onclick=()=>{const all=selected.size===entries.length;selected.clear();$$('[data-state-select]').forEach((box,i)=>{box.checked=!all;if(!all)selected.add(i);});update();};
 $('#delete-selected-states').onclick=()=>{
  const records=[...selected].map(i=>entries[i]);if(!records.length)return;
  sheet(tr('セーブステートを削除'),tr`<p class="sheet-note">選択した${records.length}件を削除します。ゲーム内セーブは残ります。</p>${records.length===1?`<div class="state-confirm">${records[0].value.image?tr`<img src="${esc(records[0].value.image)}" alt="削除する保存画面">`:''}<small>${new Date(records[0].value.at).toLocaleString(locale())}</small></div>`:''}<div class="sheet-actions"><button class="secondary" id="cancel-state-delete">キャンセル</button><button class="secondary danger" id="confirm-state-delete">削除</button></div>`,true);
  $('#cancel-state-delete').onclick=()=>showStates('manual',true,{interrupted,game});$('#confirm-state-delete').onclick=async()=>{const button=$('#confirm-state-delete');button.disabled=true;try{if(runtime.current&&game.id!==runtime.current.id)throw new Error(tr('ゲームが変更されました。'));await db.removeStates(saveKey(game),records.map(r=>r.key));await showStates('manual',false,{interrupted,game});toast(tr('削除しました。'));}catch(e){error(e);button.disabled=false;}};
 };
}
function confirmStateSave(quick=false){
 if(runtime.busy)return;
 const game=runtime.current,image=runtime.engine.screenshot();
 sheet(tr('セーブステートを保存'),tr`<p class="sheet-note">現在の状態を保存します。以前の保存も残ります。</p><div class="state-confirm"><img src="${image}" alt="現在の画面"></div><div class="sheet-actions"><button class="secondary" id="cancel-state-save">キャンセル</button><button class="primary" id="confirm-state-save">保存</button></div>`,true);
 $('#cancel-state-save').onclick=()=>quick?closeSheet():showGameMenu();$('#confirm-state-save').onclick=async()=>{const button=$('#confirm-state-save');button.disabled=true;try{if(game!==runtime.current)throw new Error(tr('ゲームが変更されました。'));const captured=runtime.engine.checkpoint?await runtime.engine.checkpoint():null;if(captured?.stateError)throw Error(captured.stateError);const bytes=new Uint8Array(captured?captured.state:await runtime.engine.state()),save=captured?captured.save:await runtime.engine.save(),at=Date.now();await db.put('states',saveKey(runtime.current)+':'+crypto.randomUUID(),{bytes,hash:await hash(bytes),save,saveHash:save?.length?await hash(save):null,image,at,coreId:runtime.protection.coreId});toast(tr('保存しました。'));if(quick)closeSheet();else await showStates('manual');}catch(e){error(e);button.disabled=false;}};
}
$('#quick-save').onclick=()=>{if(!runtime.engine||runtime.link||$('#sheet').open)return;setPause(true);confirmStateSave(true);};
let quickLoading=false;
$('#quick-load').onclick=()=>{if(!$('#sheet').open)showQuickLoad();};
async function showQuickLoad(){
 if(!runtime.engine||runtime.link||runtime.busy||quickLoading)return;
 quickLoading=true;setPause(true);
 try{
  const game=runtime.current,entries=await db.stateEntries(saveKey(game));
  entries.sort((a,b)=>b.value.at-a.value.at);
  const state=entries.find(e=>runtime.protection.compatible(e.value))?.value;
  if(!state){await showStates();return;}
  sheet(tr('この状態から再開しますか？'),tr`<div class="state-confirm">${state.image?tr`<img src="${state.image}" alt="読み込む画面">`:''}<small>${new Date(state.at).toLocaleString(locale())}</small></div><p class="sheet-note">読み込み前の状態も復旧用に残ります。</p><div class="sheet-actions"><button class="secondary" id="cancel-quick-load">キャンセル</button><button class="primary" id="confirm-quick-load">再開</button></div>`,true);
  $('#cancel-quick-load').onclick=closeSheet;
  $('#confirm-quick-load').onclick=async()=>{
   const button=$('#confirm-quick-load');button.disabled=true;
   try{if(game!==runtime.current||runtime.link)throw new Error(tr('ゲームの状態が変わりました。'));await persist({checkpoint:true,reason:'before-state'});await runtime.invalidateHistory?.();await runtime.protection.restoreState(runtime.engine,state);closeSheet();toast(tr('保存した状態から再開しました。'));}catch(e){error(e);button.disabled=false;}
  };
 }catch(e){error(e);}finally{quickLoading=false;}
}
 return {showStates,confirmStateSave,showQuickLoad};
}
