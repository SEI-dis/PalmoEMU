// SPDX-License-Identifier: AGPL-3.0-or-later
// Browser library components; behavior references are listed in NOTICES.md.
import {tr} from '../i18n/index.js';
import {systems,escapeHTML as esc,icon} from '../shared.js';
import {libraryCategories,librarySorts,libraryDisplay,categoryOf,categoryLabel,visibleGames,groupGames} from '../library.js';
import {guardUpdateTask} from '../update-activity.js';
import * as db from '../storage.js';

const displayKey='palmo-library-view-v1';
export function createLibraryView(api){
 const $=selector=>document.querySelector(selector);
 let saved;try{saved=JSON.parse(localStorage.getItem(displayKey));}catch{}
 const state={system:'all',category:'all',query:'',favorites:false,...libraryDisplay(saved)};
 let selecting=false,busy=false;
 const selected=new Set();
 const shown=()=>visibleGames(api.games(),state);
 const quickStart=game=>api.quickStart?.()===true&&!game.romMissing;
 const options=(values,current)=>values.map(([value,label])=>`<option value="${esc(value)}" ${current===value?'selected':''}>${esc(label)}</option>`).join('');
 function saveDisplay(){try{localStorage.setItem(displayKey,JSON.stringify(libraryDisplay(state)));}catch{api.toast(tr('表示設定はこのタブ内でのみ保持されます。'));}}
 function clearSelection(){selected.clear();}
 function leave(){selecting=false;clearSelection();}
 function reset(){leave();Object.assign(state,{system:'all',category:'all',query:'',favorites:false});}
 function changeFilter(key,value){state[key]=value;clearSelection();renderListing();}
 function render(){
  const hasGames=api.games().length>0;if(!hasGames)leave();
  $('#content').innerHTML=`${hasGames?tr`<div class="library-toolbar">
   <div class="library-search-row"><label class="search">${icon('search')}<input id="search" placeholder="ゲームを検索" aria-label="ゲームを検索" value="${esc(state.query)}"></label><button class="favorite-filter ${state.favorites?'selected':''}" id="favorites" aria-label="お気に入りだけを表示" aria-pressed="${state.favorites}">${icon('heart')}</button><button class="secondary library-select" id="library-select" aria-pressed="${selecting}">${selecting?tr('完了'):tr('選択')}</button></div>
   <div class="library-filter-row"><select id="system-filter" aria-label="機種で絞り込み">${options([['all',tr('すべての機種')],...Object.entries(systems).map(([id,s])=>[id,s.short])],state.system)}</select><select id="category-filter" aria-label="分類で絞り込み">${options([['all',tr('すべての分類')],...libraryCategories],state.category)}</select><button class="library-sort" id="library-sort" aria-label="並べ替えと表示方法" aria-haspopup="dialog">${icon('layers')}<span>${librarySorts.find(([id])=>id===state.sort)[1]}</span></button></div>
  </div><div id="library-selection" class="library-selection" ${selecting?'':'hidden'} aria-label="選択したゲームの操作"><div class="library-selection-head"><strong id="library-selected-count" role="status" aria-live="polite"></strong><button id="library-select-all">すべて選択</button></div><div class="library-batch-actions"><button class="secondary" id="library-category">${icon('folder')}分類</button><button class="secondary" id="library-favorite">${icon('heart')}お気に入り</button><button class="secondary danger" id="library-delete">${icon('trash')}削除</button></div></div>`:''}<div id="library" class="library"></div>`;
  if(hasGames){
   $('#search').oninput=e=>changeFilter('query',e.target.value);
   $('#system-filter').onchange=e=>changeFilter('system',e.target.value);
   $('#category-filter').onchange=e=>changeFilter('category',e.target.value);
   $('#favorites').onclick=()=>{state.favorites=!state.favorites;clearSelection();render();$('#favorites').focus();};
   $('#library-select').onclick=()=>{selecting=!selecting;clearSelection();render();$('#library-select').focus();};
   $('#library-sort').onclick=showDisplay;
   $('#library-select-all').onclick=()=>{const games=shown();if(games.every(game=>selected.has(game.id)))clearSelection();else for(const game of games)selected.add(game.id);renderListing();};
   $('#library-category').onclick=()=>showCategory([...selected]);
   $('#library-favorite').onclick=showFavorites;
   $('#library-delete').onclick=showDelete;
  }
  renderListing();
 }
 function selectionSummary(games){
  const ids=new Set(games.map(game=>game.id));for(const id of selected)if(!ids.has(id))selected.delete(id);
  if(!$('#library-selected-count'))return;
  $('#library-selected-count').textContent=tr`${selected.size}件を選択`;
  $('#library-select-all').textContent=games.length&&games.every(game=>selected.has(game.id))?tr('選択を解除'):tr('すべて選択');
  $('#library-select-all').disabled=!games.length;
  for(const id of ['category','favorite','delete'])$('#library-'+id).disabled=!selected.size||busy;
 }
 function card(game){
  const system=systems[game.system],isSelected=selected.has(game.id),quick=!selecting&&quickStart(game);
  const label=quick?`${esc(tr('プレイ'))} · ${esc(game.name)}`:`${esc(game.name)}${selecting?tr('を選択'):tr('の設定を開く')}`;
  return `<article class="game-card ${selecting?'is-selectable':''} ${isSelected?'is-selected':''}"><button class="game-launch" data-game="${esc(game.id)}" aria-label="${label}" ${selecting?`aria-pressed="${isSelected}"`:quick?'':'aria-haspopup="dialog"'}><div class="cover ${game.cover?'':'empty-cover'}" style="--system-color:${system.color}"><img src="${esc(game.cover||'assets/controller.svg')}" alt=""><span class="badge">${game.romMissing?tr('ROM未追加'):game.size===67108864&&game.system==='gba'?'64 MB':system.short}</span>${game.favorite?`<span class="heart-mark">${icon('heart')}</span>`:''}${selecting?`<span class="library-check" aria-hidden="true">${isSelected?icon('check'):''}</span>`:''}</div><h3 class="game-name">${esc(game.name)}</h3>${categoryOf(game)?`<span class="game-category">${categoryLabel(game)}</span>`:''}</button>${selecting?'':tr`<button class="game-options" data-details="${esc(game.id)}" aria-label="${esc(game.name)}のメニュー" aria-haspopup="dialog">${icon('more')}</button>`}</article>`;
 }
 function renderListing(){
  const games=shown();selectionSummary(games);
  if(!games.length){const exists=api.games().length>0;$('#library').innerHTML=tr`<div class="empty-library"><img src="assets/${exists?'empty':'icon'}.svg" class="${exists?'':'app-icon'}" alt=""><h2>${exists?tr('ゲームが見つかりません'):tr('ゲームを追加しましょう')}</h2><p>${exists?tr('検索や絞り込み条件を変更してください。'):tr('お気に入りのゲームを、いつでもここから。<br>端末内のROMを選んでライブラリに追加できます。')}</p><button class="primary" id="add-first">${icon('plus')}ゲームを追加</button></div>`;$('#add-first').onclick=api.add;return;}
  $('#library').innerHTML=groupGames(games,state.group,systems).map(([label,items])=>`<section class="system-section"><h2 class="section-title"><span>${esc(label)}</span><span class="count">${items.length}</span>${icon('chevron')}</h2><div class="game-grid">${items.map(card).join('')}</div></section>`).join('');
  $('#library').querySelectorAll('[data-game],[data-details]').forEach(button=>button.onclick=()=>{
   const id=button.dataset.game||button.dataset.details;
   if(selecting){if(selected.has(id))selected.delete(id);else selected.add(id);renderListing();[...$('#library').querySelectorAll('[data-game]')].find(el=>el.dataset.game===id)?.focus({preventScroll:true});}
   else {const game=api.games().find(game=>game.id===id);if(game)return button.dataset.game&&quickStart(game)?api.startGame(game):api.showGame(game);}
  });
 }
 function showDisplay(){
  api.sheet(tr('並べ替えと表示方法'),tr`<div class="settings-group"><label class="row"><span>並べ替え</span><select id="library-sort-choice">${options(librarySorts,state.sort)}</select></label><label class="row"><span>グループ</span><select id="library-group-choice">${options([['system',tr('機種ごと')],['category',tr('分類ごと')],['none',tr('まとめて表示')]],state.group)}</select></label></div><button class="primary wide-button" id="library-display-done">完了</button>`);
  const apply=()=>{state.sort=$('#library-sort-choice').value;state.group=$('#library-group-choice').value;saveDisplay();render();};
  $('#library-sort-choice').onchange=apply;$('#library-group-choice').onchange=apply;
  $('#library-display-done').onclick=()=>api.closeSheet();
 }
 function cancelButton(){return tr('<button class="secondary wide-button" id="library-cancel">キャンセル</button>');}
 function bindCancel(){$('#library-cancel').onclick=()=>api.closeSheet();}
 // Keep the modal and its close button in place during a write; failed batch
 // writes keep the selection so the user can retry without selecting again.
 function perform(task,after){return guardUpdateTask(async()=>{
  if(busy)return;busy=true;const controls=[...$('#sheet').querySelectorAll('button,select')],previous=controls.map(el=>el.disabled);for(const el of controls)el.disabled=true;
  try{await task();for(let i=0;i<controls.length;i++)controls[i].disabled=previous[i];await after();}
  catch(error){for(let i=0;i<controls.length;i++)controls[i].disabled=previous[i];api.error(error);}
  finally{busy=false;}
 });}
 async function finish(message){clearSelection();await api.refresh();api.closeSheet();api.toast(message);}
 function showCategory(ids,game){
  const games=api.games().filter(item=>ids.includes(item.id)),same=games.length&&games.every(item=>categoryOf(item)===categoryOf(games[0])),current=same?categoryOf(games[0]):null;
  api.sheet(game?tr('分類を変更'):tr`${ids.length}件の分類を変更`,`<div class="settings-group library-category-choices">${libraryCategories.map(([id,label])=>`<button class="row" data-library-category="${id}" aria-pressed="${current===id}">${icon('folder')}<span>${label}</span>${current===id?icon('check'):''}</button>`).join('')}</div>${cancelButton()}`);bindCancel();
  $('#sheet-body').querySelectorAll('[data-library-category]').forEach(button=>button.onclick=perform(async()=>{
   const updated=await db.setGamesLibraryMetadata(ids,{category:button.dataset.libraryCategory});
   if(game){delete game.category;Object.assign(game,updated[0]);}
  },()=>finish(tr('分類を変更しました。'))));
 }
 function showFavorites(){
  const ids=[...selected];api.sheet(tr`${ids.length}件のお気に入り`,tr`<div class="settings-group"><button class="row" id="library-favorite-add">${icon('heart')}<span>お気に入りに追加</span></button><button class="row" id="library-favorite-remove">${icon('heart')}<span>お気に入りから外す</span></button></div>${cancelButton()}`);bindCancel();
  for(const [id,favorite] of [['add',true],['remove',false]])$('#library-favorite-'+id).onclick=perform(()=>db.setGamesLibraryMetadata(ids,{favorite}),()=>finish(tr('お気に入りを変更しました。')));
 }
 function showDelete(){
  const ids=[...selected],games=api.games().filter(game=>selected.has(game.id));
  api.sheet(tr`${ids.length}件のゲームを削除`,tr`<p class="sheet-note">選択したゲームと、このブラウザ内のセーブ・ステートを削除します。この操作は取り消せません。端末の元ファイルは残ります。</p><ul class="library-delete-list">${games.map(game=>`<li>${esc(game.name)}</li>`).join('')}</ul><div class="sheet-actions"><button class="secondary" id="library-cancel">キャンセル</button><button class="primary" id="library-delete-confirm">${ids.length}件を削除</button></div>`);bindCancel();
  $('#library-delete-confirm').onclick=perform(()=>db.removeGames(ids),()=>finish(tr`${ids.length}件のゲームを削除しました。`));
 }
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&selecting&&!$('#sheet').open){leave();render();$('#library-select')?.focus();}});
 return {render,reset,leave,get selecting(){return selecting;},showCategory:game=>showCategory([game.id],game)};
}
