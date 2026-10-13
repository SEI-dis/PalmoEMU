/* Ported from ManicEMU GameOption / SaveStateListView / ASListPage.
   Copyright © 2026 Manic EMU. Created by Daiuno.
   Modified for Web on 2026-10-08. See sources/manicemu-ui/README.md. */
// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr,locale} from './i18n/index.js';
import {escapeHTML as esc,icon} from './shared.js';

// GameOption.defaultGroupAndSort, filtered by the current scene/core just as
// availableOptions does upstream. Empty groups are not rendered.
export const gameOptionGroups=[
 ['cover','skins','category'],
 ['stateList','importSave','shareSave','saveData'],
 ['switchCore'],
 ['cheatCode','manual','cartridge'],
 ['saveState','quickLoadState','volume','volumeLevel','fastForward','preservePitch','shaders','screenShot',
  'rewindEnabled','rewind','haptic','controllerSetting','deadZone','swapScreen','frameLimit','hideControls','cameraButton','screenScaling','showFps','netplay','fullScreen','reload','quit'],
 ['gameOptionSort','gameShortcut'],
 ['copyLink'],
 ['delete']
];
export const gameShortcuts=[['exit',tr('終了'),'power'],['restart',tr('再起動'),'reload'],['newState',tr('セーブ'),'save'],['quickLoad',tr('クイックロード'),'history']];
export function orderedOptionGroups(order=[]){
 const known=new Set(gameOptionGroups.flat()),seen=new Set(),groups=[];
 for(const group of Array.isArray(order)?order:[]){if(!Array.isArray(group))continue;const ids=group.filter(id=>known.has(id)&&!seen.has(id)&&seen.add(id));if(ids.length)groups.push(ids);}
 for(const group of gameOptionGroups){const missing=group.filter(id=>!seen.has(id));if(missing.length)groups.push(missing);}
 return groups;
}
export const groupedOptions=(cells,order)=>orderedOptionGroups(order).map(group=>group.filter(id=>cells[id]).map(id=>`<div class="native-option" data-menu-option="${id}">${cells[id]}</div>`).join('')).filter(Boolean).map(rows=>`<div class="settings-group">${rows}</div>`).join('');

export {nativeAction,nativeSelect,nativeToggle} from './components/rows.js';
export function gamePlaySummary(game){
 if(!game.lastPlayed)return tr('未プレイ。冒険を始めましょう');
 const elapsed=Math.max(0,Date.now()-game.lastPlayed),minutes=Math.floor((game.playDuration||0)/60000);
 const ago=elapsed<60000?tr('たった今'):elapsed<3600000?tr`${Math.floor(elapsed/60000)}分前`:elapsed<86400000?tr`${Math.floor(elapsed/3600000)}時間前`:elapsed<2592000000?tr`${Math.floor(elapsed/86400000)}日前`:tr`${Math.floor(elapsed/2592000000)}ヶ月前`;
 return tr`${ago}プレイ${game.playDuration==null?'':tr` · 合計${minutes>=60?tr`${Math.floor(minutes/60)}時間`:''}${minutes%60}分`}`;
}
// GameInfoDetailView's pinned title/subtitle/play/safe-mode block.
export function gameInfoHero(game){
 const play=game.romMissing?tr`<button class="game-info-play" data-action="restoreROM">${icon('import')}<span>ROMを追加</span></button>`:tr`<button class="game-info-play" data-action="play">${icon('play')}<span>プレイ</span></button><button class="game-info-safe" data-action="safeMode">セーフモード ${icon('arrowUpRight')}</button>`;
 return tr`<header class="game-info-hero"><div class="game-info-title"><h2>${esc(game.name)}</h2><button data-action="rename" aria-label="名前を変更">${icon('pencil')}</button></div><p class="game-info-subtitle">${icon('starCircle')}<span>${gamePlaySummary(game)}</span></p>${play}</header>`;
}
export const stateDate=at=>{const date=new Date(at);return `<time datetime="${date.toISOString()}">${esc(date.toLocaleDateString(locale()))}<span>${esc(date.toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}))}</span></time>`;};

// SaveStateListView.getSaveStatesSection: thumbnail, title, date, then either
// a small Continue button or an edit-mode checkbox. No Save action in the list.
export function stateRow(state,index,{editing=false,compatible=true,automatic=false}={}){
 const title=tr`セーブ ${index+1}`;
 return `<article class="save-entry">${state.image?tr`<img class="save-thumb" src="${esc(state.image)}" alt="${title}の画面">`:`<div class="save-thumb save-empty">${icon('image')}</div>`}<div class="save-caption"><strong>${title}</strong>${stateDate(state.at)}${compatible?'':tr('<small class="danger">非対応のコア</small>')}</div>${editing?tr`<input type="checkbox" data-state-select="${index}" aria-label="${title}を選択">`:tr`<button class="state-continue" data-slot-load="${index}" ${automatic?`data-recover="${index}"`:''} aria-label="${title}から続ける" ${compatible?'':'disabled'}>${icon('play')}<span>続ける</span></button>`}</article>`;
}
