/* Port of ManicEMU GameInfoView, GameInfoNavigationView and GameInfoDetailView.
   Copyright © 2026 Manic EMU. Original views by Daiuno.
   Modified for Web 2026-10-16. See sources/manicemu-ui/README.md. */
// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
import {guardUpdateTask} from '../updates/update-activity.js';
import {systems,escapeHTML as esc,icon,bytesLabel,hash} from '../shared.js';
import {coreRegistry,coreFor,saveKey,supportsGame} from '../core/core-registry.js';
import * as db from '../storage/storage.js';
import {gameInfoHero,groupedOptions,nativeAction,orderedOptionGroups,gameShortcuts} from '../components/manic-ui.js';
import {createCoverDialog} from './cover.js';
import {createROMUpdateDialog} from './rom-update.js';
import {createSaveRescueView} from './save-rescue.js';
import {categoryLabel} from '../library/library.js';

export function createGameInfo(api){
 const coverDialog=createCoverDialog({...api,showGame:show});
 const romDialog=createROMUpdateDialog({...api,showGame:show});
 const saveRescue=createSaveRescueView({...api,showGame:show,exportSave});
 const $=s=>document.querySelector(s);
 const nativeSheet=(title,html,options)=>{api.sheet(title,html,false,options);$('#sheet').classList.add('native-menu');};
 const bind=handlers=>$('#sheet-body').querySelectorAll('[data-action]').forEach(b=>b.onclick=guardUpdateTask(()=>{try{return Promise.resolve(handlers[b.dataset.action]?.()).catch(api.error);}catch(error){api.error(error);}}));
 async function update(game,changes){const fresh=Object.hasOwn(changes,'favorite')?(await db.setGamesLibraryMetadata([game.id],changes))[0]:await db.setGameDetails(game.id,changes);for(const key of Object.keys(game))delete game[key];Object.assign(game,fresh);await api.refresh();}
 function info(game){
  nativeSheet(tr('ゲーム情報'),tr`<div class="settings-group">${nativeAction(tr('ゲーム機'),'', 'game',systems[game.system].name)}${nativeAction(tr('コア'),'','core',coreFor(game).name)}${nativeAction(tr('ROM容量'),'','folder',bytesLabel(game.size))}</div><p class="sheet-note"><a href="licenses.html">クレジット・ライセンス・対応ソース</a></p>`);
 }
 function rename(game){
  nativeSheet(tr('名前を変更'),tr`<input class="text-input" id="new-name" value="${esc(game.name)}" maxlength="120" aria-label="ゲーム名"><div class="sheet-actions"><button class="secondary" data-action="back">キャンセル</button><button class="primary" id="save-name">保存</button></div>`,{confirmation:true});
  bind({back:()=>show(game)});const input=$('#new-name'),save=$('#save-name');
  const changed=()=>input.value.trim()!==''&&input.value.trim()!==game.name;
  input.oninput=()=>{save.disabled=!changed();};input.oninput();
  save.onclick=async()=>{if(!changed())return;save.disabled=true;try{await update(game,{name:input.value.trim()});show(game);}catch(e){save.disabled=!changed();api.error(e);}};
 }
 function remove(game){
  nativeSheet(tr('ゲームを削除'),tr`<p class="sheet-note">「${esc(game.name)}」と、このブラウザ内のセーブ・ステートを削除します。端末の元ファイルは残ります。</p><div class="sheet-actions"><button class="secondary" data-action="back">キャンセル</button><button class="destructive" id="confirm-delete">削除する</button></div>`,{confirmation:true});
  bind({back:()=>show(game)});$('#confirm-delete').onclick=async()=>{try{await db.removeGame(game.id);api.closeSheet({dismiss:true});await api.refresh();}catch(e){api.error(e);}};
 }
 function safeMode(game){
  nativeSheet(tr('セーフモード'),tr`<p class="sheet-note">チートを無効にし、自動ステートを復旧せず、ゲーム内セーブから起動します。設定や保存データは保持されます。</p><div class="sheet-actions"><button class="secondary" data-action="back">キャンセル</button><button class="primary" data-action="start">プレイ</button></div>`,{confirmation:true});
  bind({back:()=>show(game),start:()=>{api.closeSheet({dismiss:true});return api.launch(game,{safeMode:true});}});
 }
 async function exportSave(game){const record=await db.get('saves',saveKey(game));if(!record?.bytes?.length)throw Error(tr('保存されたゲーム内セーブがありません。'));if(record.hash&&await hash(new Uint8Array(record.bytes))!==record.hash){await saveRescue.open(game);return;}api.download(record.bytes,game.name+'.'+coreFor(game).saveExtension);}
 function chooseCore(game){
  const selected=coreFor(game);
  nativeSheet(tr('コアを変更'),tr`<div class="settings-group">${coreRegistry[game.system].map(core=>`<button class="row native-row" data-core="${core.key}" ${supportsGame(core,game)?'':'disabled'}>${icon('core')}<span class="native-label">${esc(core.name)}${supportsGame(core,game)?'':tr`<small>このROM容量には未対応</small>`}</span>${selected.key===core.key?icon('check'):''}</button>`).join('')}</div><p class="sheet-note">セーブとステートはコアごとに保存します。元のコアに戻すと、以前の続きから遊べます。</p>`);
  $('#sheet-body').querySelectorAll('[data-core]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const updated=await db.setGameCore(game.id,button.dataset.core);Object.assign(game,updated);await api.refresh();show(game);}catch(e){button.disabled=false;api.error(e);}});
 }
 async function copyLink(game){const url=new URL(location.href);url.search='';url.hash='game='+game.id;await navigator.clipboard.writeText(url.href);api.toast(tr('このブラウザで開ける起動リンクをコピーしました。'));}

 function sortOptions(game,cells){
  const groups=orderedOptionGroups(api.settings().menuOrder);
  const defaultOrder=JSON.stringify(orderedOptionGroups());
  const label=id=>{
   const element=document.createElement('div');
   element.innerHTML=cells[id];
   const title=element.querySelector('.native-label')||element.querySelector('.row > span');
   return esc(title?.firstChild?.textContent||id);
  };
  const groupMarkup=groups.map((group,g)=>{
   const ids=group.filter(id=>cells[id]);
   if(!ids.length)return '';
   const rows=ids.map((id,i)=>tr`<div class="option-reorder" data-order-id="${id}"><span class="order-grip" aria-hidden="true">${icon('grip')}</span><span class="order-label">${label(id)}</span><button data-move="-1" data-option="${id}" aria-label="${label(id)}を上へ" ${i===0?'disabled':''}>${icon('arrowUp')}</button><button data-move="1" data-option="${id}" aria-label="${label(id)}を下へ" ${i===ids.length-1?'disabled':''}>${icon('arrowDown')}</button></div>`).join('');
   return `<div class="settings-group" data-order-group="${g}">${rows}</div>`;
  }).join('');
  nativeSheet(tr('機能順序設定'),tr`<p class="sheet-note">グループ内の表示順を変更します。プレイ中のメニューにも反映されます。</p>${groupMarkup}<button class="text-button wide-button" data-action="reset">標準に戻す</button>`);
  const panel=$('#sheet-body'),reset=panel.querySelector('[data-action="reset"]');
  reset.hidden=JSON.stringify(groups)===defaultOrder;
  function saveGroup(container){
   const rows=[...container.querySelectorAll(':scope > [data-order-id]')];
   const visible=rows.map(row=>row.dataset.orderId);
   const index=Number(container.dataset.orderGroup);
   // Options unavailable for this game retain their slots in the shared order.
   let next=0;
   groups[index]=groups[index].map(id=>cells[id]?visible[next++]:id);
   api.settings().menuOrder=groups;
   api.saveSettings();
   rows.forEach((row,i)=>{
    row.querySelector('[data-move="-1"]').disabled=i===0;
    row.querySelector('[data-move="1"]').disabled=i===rows.length-1;
   });
   reset.hidden=JSON.stringify(groups)===defaultOrder;
  }
  for(const button of panel.querySelectorAll('[data-move]'))button.onclick=()=>{
   const row=button.closest('.option-reorder'),up=button.dataset.move==='-1';
   const adjacent=up?row.previousElementSibling:row.nextElementSibling;
   if(!adjacent)return;
   const scroll=panel.scrollTop;
   if(up)adjacent.before(row);else adjacent.after(row);
   saveGroup(row.parentElement);
   (button.disabled?row.querySelector('button:enabled'):button)?.focus({preventScroll:true});
   panel.scrollTop=scroll;
  };
  let open=true,disposeDrag;
  api.onClose(()=>{open=false;disposeDrag?.();});
  import('./menu-drag.js').then(({enableMenuDrag})=>{
   if(open)disposeDrag=enableMenuDrag(panel.querySelectorAll('[data-order-group]'),panel,saveGroup);
  }).catch(()=>{/* The arrow controls remain available when drag cannot be loaded. */});
  bind({reset:()=>{delete api.settings().menuOrder;api.saveSettings();sortOptions(game,cells);}});
 }
 function shortcuts(game){
  const selected=api.settings().gameShortcuts||gameShortcuts.map(([id])=>id);
  nativeSheet(tr('ゲームショートカット'),tr`<p class="sheet-note">プレイ中のメニュー上部に表示する操作を選びます。</p><div class="settings-group">${gameShortcuts.map(([id,label,ic])=>`<label class="row native-row">${icon(ic)}<span class="native-label">${label}</span><input type="checkbox" data-shortcut-choice="${id}" ${selected.includes(id)?'checked':''}></label>`).join('')}</div>`);
  $('#sheet-body').querySelectorAll('[data-shortcut-choice]').forEach(b=>b.onchange=()=>{api.settings().gameShortcuts=[...$('#sheet-body').querySelectorAll('[data-shortcut-choice]:checked')].map(el=>el.dataset.shortcutChoice);api.saveSettings();});
 }
 function show(game){
  const scrollTop=api.beginGame?.(game)||0;
  const cells={
   cover:nativeAction(tr('カバー変更'),'cover','image'),skins:nativeAction(tr('スキン設定'),'gameSkin','shirt'),category:nativeAction(tr('分類を変更'),'category','folder',categoryLabel(game)),
   stateList:nativeAction(tr('セーブステートを確認'),'states','state'),
   saveData:nativeAction(tr('ゲーム内セーブ・保存履歴'),'saveData','folder'),
   cheatCode:coreFor(game).cheats?nativeAction(tr('チートコード'),'cheats','code'):'',
   switchCore:nativeAction(tr('コアを変更'),'switchCore','core',coreFor(game).name),
   ...api.controlCells(game),gameOptionSort:nativeAction(tr('機能順序設定'),'optionOrder','layers'),gameShortcut:nativeAction(tr('ゲームショートカット'),'shortcuts','shortcuts'),
   copyLink:nativeAction(tr('起動リンクをコピー'),'copyLink','link')
  };
  const romActions=`<div class="settings-group">${nativeAction(tr('ROMを更新'),'updateROM','reload')}${game.romMissing?'':nativeAction(tr('ROMだけ取り外す'),'detachROM','folder')}${game.romUpdate?nativeAction(tr('前のバージョン'),'previousROM','history')+nativeAction(tr('更新前のセーブを書き出す'),'exportPrevious','saveExport'):''}</div>`;
  api.sheet(game.name,gameInfoHero(game)+tr`<div class="native-options" aria-label="ゲームの設定">${api.preferenceSummary?.(game,{hideDefaults:true})||''}${romActions}${groupedOptions(cells,api.settings().menuOrder)}<div class="settings-group destructive-group"><div class="native-option" data-menu-option="delete">${nativeAction(tr('ゲームを削除'),'delete','trash','','danger')}</div></div></div>`,false,{root:true});
  $('#sheet').classList.add('native-menu','game-info');$('#sheet-cover').src=game.cover||'assets/controller.svg';$('#sheet-cover').hidden=false;
  $('#sheet-tools').innerHTML=tr`<button class="sheet-tool" id="game-info-button" aria-label="ゲーム情報">${icon('info')}</button><button class="sheet-tool" id="game-favorite-button" aria-label="${game.favorite?tr('お気に入りから外す'):tr('お気に入りに追加')}" aria-pressed="${!!game.favorite}">${icon('starCircle')}</button>`;
  $('#game-info-button').onclick=()=>info(game);$('#game-favorite-button').onclick=guardUpdateTask(async()=>{try{await update(game,{favorite:!game.favorite});show(game);}catch(e){api.error(e);}});
  api.bindSettings($('#sheet-body'));
  bind({updateROM:()=>romDialog.open(game),restoreROM:()=>romDialog.open(game,{reattach:true}),detachROM:()=>romDialog.detach(game),previousROM:()=>romDialog.previous(game),exportPrevious:()=>romDialog.exportPrevious(game),category:()=>api.showCategory(game),resetPreferences:()=>api.resetPreferences?.(game),switchCore:()=>chooseCore(game),play:()=>{api.closeSheet({dismiss:true});return api.launch(game);},safeMode:()=>safeMode(game),rename:()=>rename(game),cover:()=>coverDialog.open(game),gameSkin:()=>api.showSkins(game.system,game),states:()=>api.showStates(game),saveData:()=>saveRescue.open(game),cheats:()=>api.showCheats(game),controllers:api.showControllers,optionOrder:()=>sortOptions(game,cells),shortcuts:()=>shortcuts(game),copyLink:()=>copyLink(game),delete:()=>remove(game)});
  $('.native-options').scrollTop=scrollTop;
 }
 return {show,updateROM:romDialog.open,showSaveData:saveRescue.open};
}
