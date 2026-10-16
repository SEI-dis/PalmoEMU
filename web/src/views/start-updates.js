// SPDX-License-Identifier: AGPL-3.0-or-later
// Original notification and handoff to the existing ROM update dialog.
import {tr} from '../i18n/index.js';
import {escapeHTML as esc,icon} from '../shared.js';
import {createStartUpdateService,startUpdateGames,needsStartUpdate,compareStartVersions,startDistributionURL,startChangelogURL,startUpdateStorageKey} from '../library/start-updates.js';

export function createStartUpdatesView(api){
 const $=selector=>document.querySelector(selector);
 const service=createStartUpdateService({onChange:()=>{renderNotice();renderStatus();}});
 let host=null,screen=null;
 function renderNotice(nextHost=host){
  host=nextHost;document.querySelector('#start-update-notice')?.remove();
  const state=service.snapshot();
  if(!host?.isConnected||!api.active()||!state.enabled||state.failed||state.stale||!needsStartUpdate(api.games(),state.release)||state.dismissed===state.release.version+':'+state.release.sha)return;
  const notice=document.createElement('aside');notice.id='start-update-notice';notice.className='start-update-notice';
  notice.innerHTML=`<span>${icon('reload')}</span><div><strong>${tr('PokemonStartの更新があります')}</strong><small>${esc('v'+state.release.version)}</small></div><button class="secondary" data-start-open>${tr('確認')}</button><button class="start-update-dismiss" aria-label="${esc(tr('この通知を閉じる'))}">${icon('close')}</button>`;
  notice.querySelector('[data-start-open]').onclick=()=>open();notice.querySelector('.start-update-dismiss').onclick=()=>service.dismiss();host.prepend(notice);
 }
 function renderStatus(){
  if(!screen?.isConnected)return;
  const state=service.snapshot(),status=screen.querySelector('[data-start-status]'),release=state.release;
  const current=startUpdateGames(api.games()).find(item=>item.game.id===$('#start-update-game').value)?.version;
  const known=!!release&&!state.stale&&!state.failed&&state.status==='ready'&&compareStartVersions(current,release.version)!==null;
  const available=known&&compareStartVersions(current,release.version)<0,summary=screen.querySelector('[data-start-summary]');
  summary.hidden=!known;summary.classList.toggle('has-update',available);
  summary.querySelector('strong').textContent=available?tr('新しいバージョンがあります'):tr('新しい更新はありません。');
  summary.querySelector('p').textContent=available?`v${current} → v${release.version}`:`v${current}`;
  status.textContent=state.status==='checking'?tr('更新を確認中…'):state.status==='offline'?tr('オフラインです。接続後に確認できます。'):state.status==='error'?tr('更新を確認できませんでした。時間をおいて再試行してください。'):state.stale?tr('更新情報を確認してください。'):tr('更新情報を確認しました。');
  status.hidden=state.status==='ready'&&!state.stale&&screen.dataset.manual!=='true';
  screen.querySelector('[data-start-version]').textContent=release?(state.stale||state.failed?tr`前回確認したバージョン：v${release.version}`:tr`最新バージョン：v${release.version}`):tr('最新バージョンは未確認です。');
  screen.querySelector('[data-start-version]').hidden=known;
  const check=screen.querySelector('[data-start-check]');check.disabled=state.status==='checking'||state.status==='offline';
  screen.querySelector('[data-start-auto]').checked=state.enabled;
 }
 function open(game,{onBack=()=>api.closeSheet()}={}){
  const games=startUpdateGames(api.games());if(!games.length)return;
  const selected=games.find(item=>item.game.id===game?.id)||games[0];
  api.sheet(tr('PokemonStartの更新'),`<div id="start-update-dialog"><div class="start-update-summary" data-start-summary hidden><strong></strong><p></p></div><p class="sheet-note" data-start-version></p><p class="sheet-note" data-start-status role="status"></p><div class="settings-group"><label class="row"><span>${tr('更新するゲーム')}</span><select id="start-update-game" aria-label="${esc(tr('更新するゲーム'))}">${games.map(item=>`<option value="${esc(item.game.id)}" ${item===selected?'selected':''}>${esc(item.game.name)}</option>`).join('')}</select></label></div><p class="sheet-note">${tr('新しいROMを用意して「ROMを更新」を押してください。')}</p><div class="start-update-links"><a href="${startDistributionURL}" target="_blank" rel="noopener noreferrer">${tr('配布ページ')}</a><a href="${startChangelogURL}" target="_blank" rel="noopener noreferrer">${tr('変更内容')}</a></div><button id="start-update-rom" class="primary wide-button">${tr('ROMを更新')}</button><div class="settings-group"><label class="row"><span>${tr('更新を自動で確認')}</span><input type="checkbox" data-start-auto></label></div><p class="sheet-note">${tr('新しいバージョンが出たらお知らせします。')}</p><button class="secondary wide-button" data-start-check>${tr('更新を確認')}</button><button class="secondary wide-button" id="start-update-back">${tr('戻る')}</button></div>`);
  screen=$('#start-update-dialog');renderStatus();
  $('#start-update-game').onchange=renderStatus;
  screen.querySelector('[data-start-auto]').onchange=event=>{service.setEnabled(event.target.checked);if(event.target.checked)void service.check();};
  screen.querySelector('[data-start-check]').onclick=async()=>{screen.dataset.manual='true';await service.check({force:true});renderStatus();};
  $('#start-update-back').onclick=onBack;
  $('#start-update-rom').onclick=()=>{const chosen=api.games().find(item=>item.id===$('#start-update-game').value);if(chosen)api.updateROM(chosen,{onBack:()=>open(chosen,{onBack})});};
  if(service.snapshot().enabled)void service.check();
 }
 function refresh(){renderNotice();renderStatus();if(api.active()&&(!$('#sheet')?.open||screen?.isConnected)&&startUpdateGames(api.games()).length)void service.check();}
 function listen(){
  window.addEventListener('online',refresh);window.addEventListener('offline',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('storage',event=>{if(event.key===startUpdateStorageKey){renderNotice();renderStatus();}});
  setInterval(refresh,3600000);refresh();
 }
 return {renderNotice,refresh,open,listen};
}
