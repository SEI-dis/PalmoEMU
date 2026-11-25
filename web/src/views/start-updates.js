// SPDX-License-Identifier: AGPL-3.0-or-later
// Original notification and handoff to the existing ROM update dialog.
import {tr,locale} from '../i18n/index.js';
import {escapeHTML as esc} from '../shared.js';
import {createStartUpdateService,startUpdateGames,startUpdateCandidates,compareStartVersions,startDistributionURL,startChangelogURL,startUpdateStorageKey} from '../library/start-updates.js';

export function createStartUpdatesView(api){
 const $=selector=>document.querySelector(selector);
 const service=createStartUpdateService({onChange:()=>{renderNotice();renderStatus();}});
 let screen=null,retryTimer;
 function notificationGames(state){
  if(!api.active()||!state.enabled||!state.release||state.failed||state.stale||state.status==='offline'||state.dismissed===state.release.version+':'+state.release.sha)return [];
  return startUpdateCandidates(api.games(),state.release);
 }
 function renderNotice(){
  const library=$('#library'),importEntry=$('#import-update-rom');
  if(!library&&!importEntry)return;
  const games=notificationGames(service.snapshot());
  if(importEntry){importEntry.querySelector('[data-start-hint]').hidden=!games.length;return;}
  const byId=new Map(games.map(game=>[game.id,game]));
  for(const options of library.querySelectorAll('[data-details]')){
   const card=options.closest('.game-card'),game=byId.get(options.dataset.details);
   let button=card.querySelector('[data-start-open]');
   if(!game){button?.remove();continue;}
   if(!button){
    button=document.createElement('button');button.type='button';button.className='game-update-link';button.dataset.startOpen='';
    button.textContent=tr('更新あり');button.setAttribute('aria-haspopup','dialog');card.append(button);
   }
   button.setAttribute('aria-label',tr('更新あり')+' · '+game.name);
   button.onclick=()=>open(game);
  }
 }
 function renderStatus(){
  clearTimeout(retryTimer);
  if(!screen?.isConnected)return;
  const state=service.snapshot(),status=screen.querySelector('[data-start-status]'),release=state.release;
  const selectedId=$('#start-update-game').value;
  const current=startUpdateGames(api.games(),selectedId).find(item=>item.game.id===selectedId)?.version;
  const comparison=release?compareStartVersions(current,release.version):null;
  const known=!state.stale&&!state.failed&&state.status==='ready'&&comparison!==null;
  const available=known&&comparison<0,summary=screen.querySelector('[data-start-summary]');
  screen.querySelector('[data-start-handoff]').hidden=!available;
  summary.hidden=!known;summary.classList.toggle('has-update',available);
  summary.querySelector('strong').textContent=available?tr('新しいバージョンがあります'):comparison===0?tr('最新の状態です。'):tr('新しい更新はありません。');
  summary.querySelector('p').textContent=available?`v${current} → v${release.version}`:`v${current}`;
  status.textContent=state.status==='checking'?tr('更新を確認中…'):state.status==='offline'?tr('オフラインです。接続後に確認できます。'):state.status==='error'?tr('更新を確認できませんでした。時間をおいて再試行してください。'):state.stale?tr('更新情報を確認してください。'):tr('更新情報を確認しました。');
  status.hidden=known||(state.status==='ready'&&!state.stale&&screen.dataset.manual!=='true');
  screen.querySelector('[data-start-version]').textContent=release?(state.stale||state.failed?tr`前回確認したバージョン：v${release.version}`:tr`最新バージョン：v${release.version}`):tr('最新バージョンは未確認です。');
  screen.querySelector('[data-start-version]').hidden=known;
  const check=screen.querySelector('[data-start-check]'),remaining=state.retryAt-Date.now();
  const waiting=remaining>0&&state.status!=='checking'&&state.status!=='offline';
  check.disabled=waiting||state.status==='checking'||state.status==='offline';
  check.textContent=waiting?tr`再確認は${new Date(state.retryAt).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit',second:'2-digit'})}から`:tr('更新を確認');
  if(waiting)retryTimer=setTimeout(renderStatus,remaining);
  screen.querySelector('[data-start-auto]').checked=state.enabled;
  screen.querySelector('[data-start-dismiss]').hidden=!available||!notificationGames(state).some(game=>game.id===selectedId);
 }
 function open(game,{onBack=null,selectedId=game?.id}={}){
  const games=startUpdateGames(api.games(),game?.id);
  const selected=selectedId?games.find(item=>item.game.id===selectedId):games[0];
  if(!selected){if(game)api.toast(tr('元のゲームが見つかりません。'));return;}
  api.sheet(tr('PokemonStartの更新'),`<div id="start-update-dialog">
   <div class="start-update-summary" data-start-summary role="status" hidden><strong></strong><p></p></div>
   <p class="sheet-note" data-start-version></p><p class="sheet-note" data-start-status role="status"></p>
   <div class="settings-group" ${games.length===1?'hidden':''}><label class="row"><span>${tr('更新するゲーム')}</span><select id="start-update-game" aria-label="${esc(tr('更新するゲーム'))}">${games.map(item=>`<option value="${esc(item.game.id)}" ${item===selected?'selected':''}>${esc(item.game.name)}</option>`).join('')}</select></label></div>
   <div data-start-handoff hidden><p class="sheet-note">${tr('配布ページで新版のROMを用意してください。')}</p>
    <div class="start-update-links"><a href="${startDistributionURL}" target="_blank" rel="noopener noreferrer">${tr('配布ページ')}</a><a href="${startChangelogURL}" target="_blank" rel="noopener noreferrer">${tr('変更内容')}</a></div>
    <button id="start-update-rom" class="primary wide-button">${tr('ROMの更新に進む')}</button></div>
   <details class="update-check-options"><summary>${tr('更新の確認設定')}</summary><div class="settings-group"><label class="row"><span>${tr('更新を自動で確認')}</span><input type="checkbox" data-start-auto></label></div><button class="text-button wide-button" data-start-dismiss hidden>${tr('この通知を閉じる')}</button></details>
   <button class="text-button wide-button" data-start-check>${tr('更新を確認')}</button></div>`,false,{root:!onBack,onBack});
  screen=$('#start-update-dialog');renderStatus();
  $('#start-update-game').onchange=renderStatus;
  screen.querySelector('[data-start-dismiss]').onclick=()=>{service.dismiss();screen.querySelector('.update-check-options summary').focus();};
  screen.querySelector('[data-start-auto]').onchange=event=>{service.setEnabled(event.target.checked);if(event.target.checked)void service.check();};
  screen.querySelector('[data-start-check]').onclick=async()=>{screen.dataset.manual='true';await service.check({force:true});renderStatus();};
  $('#start-update-rom').onclick=()=>{
   const chosen=api.games().find(item=>item.id===$('#start-update-game').value);
   if(!chosen){api.toast(tr('元のゲームが見つかりません。'));return;}
   if(onBack&&chosen.id===game?.id){onBack();return;}
   api.updateROM(chosen,{onBack:()=>open(game,{onBack,selectedId:chosen.id})});
  };
  if(service.snapshot().enabled)void service.check();
 }
 function refresh(){
  renderNotice();renderStatus();
  if(api.active()&&(screen?.isConnected||(!$('#sheet')?.open&&startUpdateGames(api.games()).length)))void service.check();
 }
 function listen(){
  window.addEventListener('online',refresh);window.addEventListener('offline',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('storage',event=>{if(event.key===startUpdateStorageKey){renderNotice();renderStatus();}});
  setInterval(refresh,3600000);refresh();
 }
 return {renderNotice,refresh,open,listen};
}
