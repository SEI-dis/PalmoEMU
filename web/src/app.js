/* Adapted from ManicEMU. Copyright © 2024–2026 Manic EMU.
   Created by Aoshuang Lee / Max / Daiuno. Modified for Web on 2026-10-08. See NOTICES.md. */
// SPDX-License-Identifier: AGPL-3.0-or-later
// UI port based on ManicEMU's GamesNavigationView, GameListView and HomeTabBar.
import './i18n/page.js';
import {showROMPatch} from './views/rom-patch.js';
import {showGBAOptions} from './views/gba-options.js';
import {showNDSOptions} from './views/nds-options.js';
import {normalizeNDSSave} from './core/nds-save.js';
import {createUINavigation} from './components/ui-navigation.js';
import {tr,locale} from './i18n/index.js';
import {dualScreen} from './core/development.js';
import {diagnostics} from './diagnostics.js';
import {createScreenAwake} from './runtime/screen-awake.js';
import {performanceDiagnostics} from './runtime/performance.js';
const screenAwake=createScreenAwake();
import {createInputControls} from './input/input-controls.js';
import {createInputControlsView} from './views/input-controls.js';
import {holdStartupInputs} from './input/startup-input.js';
import {applyPendingBackupSettings} from './storage/backup.js';
import {createBackupView} from './views/backup.js';
import {createFileExport} from './components/file-export.js';
import {coverThumbnail} from './library/cover-thumbnail.js';
import {createRewindSession,supportsRewind} from './core/rewind-session.js';
import {createGamePreferences,hasGamePreferences} from './library/game-preferences.js';
import {gamePreferenceSummary,confirmPreferenceReset} from './views/game-preferences.js';
import {createDiagnosticsView} from './views/diagnostics.js';
import {importROM} from './library/rom-import.js';
import {maxROMZipSize} from './library/rom-zip.js';
import {createImportProgress} from './library/import-progress.js';
import {systems,detectSystem,escapeHTML as esc,icon,bytesLabel} from './shared.js';
import * as db from './storage/storage.js';
import {createCore} from './core/core-factory.js';
import {prepareGameAudio} from './core/audio-activation.js';
import {showCoreLoadFailure} from './views/core-load-failure.js';
import {coreFor,saveKey,cheatsFor,linkModes} from './core/core-registry.js';
import {videoFilters} from './rendering/video.js';
import {setupOffline,offlineStatus} from './updates/offline.js';
import {offlineGamePlan} from './updates/offline-plan.js';
import {startAutoUpdates} from './updates/auto-update.js';
import {createLaunchContinuation} from './updates/launch-continuation.js';
import {createReleaseNotice} from './updates/release-notice.js';
import {guardUpdateTask} from './updates/update-activity.js';
let appReady=false,autoUpdates,updateCompleted=false;
const launchContinuation=createLaunchContinuation();
import {supportsHaptics,tapHaptic,stopHaptics} from './input/haptics.js';
import {createLinkControls} from './link/link-controls.js';
import {SaveProtection} from './storage/save-safety.js';
import {applyPausedSave} from './storage/apply-save.js';
import {loadSkinPair,releaseSkin} from './skins/skins.js';
import {skinOrientation} from './skins/skin-selection.js';
import {chooseRepresentation} from './skins/skin-format.js';
import {mountSkinScreens} from './skins/skin-screens.js';
import {mountSkinInputs} from './skins/skin-inputs.js';
import {createSkinPointers} from './skins/skin-pointers.js';
import {builtinDpadDirections,touchInputDefaults} from './input/dpad-input.js';
import {configureBuiltinTouchTargets} from './input/touch-targets.js';
import {guardPlayerGestures} from './input/player-gestures.js';
import {builtinLayout} from './skins/skin-art.js';
import {screenBounds} from './skins/control-layout.js';
import {ndsDisplayLayout} from './skins/nds-skin.js';
import {cameraLayout,cameraBackgroundSize,bindCameraButton} from './capture/camera-button.js';
import {createScreenshotPreview} from './capture/screenshot-preview.js';
import {createCaptureControls} from './capture/capture-controls.js';
import {clamp,normalizedPosition} from './skins/control-layout.js';
import {createSkinSettings} from './views/skins.js';
import {createStateDialogs} from './views/states.js';
import {groupedOptions,gameShortcuts,nativeAction,nativeSelect,nativeToggle} from './components/manic-ui.js';
import {createGameInfo} from './views/game-info.js';
import {createSaveRescueView} from './views/save-rescue.js';
import {readSaveHistory} from './storage/save-rescue.js';
import {createLibraryView} from './views/library.js';
import {createStartUpdatesView} from './views/start-updates.js';
import {floatingPanel} from './components/floating-panel.js';
import {row,action} from './components/rows.js';
import {filterStrengthControl} from './components/filter-strength.js';
import {createSettingsView,videoFilterNote} from './views/settings.js';
import {trainerStats} from './library/trainer-profile.js';
let link=null,linkMessage='',linkStarting=false,linkSaveBlocked=false,exiting=false,exitStage=null,pauseSaveTask=null,sheetBack=null,sheetCleanup=()=>{};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let library=[],tab=tabFromHash(),engine=null,current=null,skinPair=null,paused=false,toastTimer,saveLock=null,launching=false,importing=false,dialogResume=false;
let trainer={profile:null,total:0,rankings:[]};
const finishStartupInputs=holdStartupInputs();
const releaseNotice=createReleaseNotice({sheet,closeSheet,onClose:cleanup=>{sheetCleanup=cleanup;},canShow:()=>!launchContinuation.pending&&!libraryView.selecting&&!engine&&!launching&&!importing&&!exiting&&!saveLock&&!link&&!linkStarting});
try{await applyPendingBackupSettings();}catch(e){diagnostics.record(e,'startup');const message=document.createElement('p');message.textContent=e.message||tr('保存データを開けませんでした。');$('#content').replaceChildren(message);const retry=document.createElement('button');retry.className='primary';retry.textContent=tr('再読み込みして復元を完了');retry.onclick=()=>location.reload();$('#content').append(retry);throw e;}
let savedSettings={};try{savedSettings=JSON.parse(localStorage.getItem('manic-settings')||'{}');}catch{}
// Pitch preservation is standard playback behavior; legacy preferences are ignored.
delete savedSettings?.preservePitch;
let settingsGame=null,gameMenuReturn=null;
const preferences=createGamePreferences({theme:'dark',volume:.7,speed:1,autosave:true,recovery:true,quickStart:false,keepScreenAwake:true,measurePerformance:false,haptics:true,filter:'pixel',showFps:false,touchControls:true,showCamera:true,rewindEnabled:false,...touchInputDefaults,...savedSettings},{getGame:()=>current||settingsGame,saveGame:(id,value)=>db.setGamePreferences(id,value),onError:error});
const settings=preferences.settings;delete settings.autoCovers;
diagnostics.setContext(()=>{
 const core=current?coreFor(current):null;
 return {phase:exiting?'exiting':importing?'importing':launching?'launching':engine?(paused?'paused':'playing'):'idle',
  system:current?.system,core:core?.key,coreId:core?.id,link:link?(link.kind==='room'?'online':link.kind||'online'):'none',
  speed:settings.speed,filter:settings.filter,romMiB:current?current.size/1048576:undefined,memoryMiB:engine?.m?.HEAPU8?.byteLength/1048576};
});
const exportFile=createFileExport();
const showBackup=createBackupView({sheet,download,toast,settings:preferences.global,onClose:cleanup=>{sheetCleanup=cleanup;}});
const showDiagnostics=createDiagnosticsView({sheet,download,toast,settings,applySettings});
const {renderSettings,showVideoSettings,showAudioSettings,showSaveHelp,showControllers,showStorage}=createSettingsView({
 canChangeLanguage:()=>!engine&&!launching&&!importing&&!exiting,
 trainer:()=>trainer,saveNickname:async value=>{trainer.profile=await db.saveTrainerNickname(value);},saveAvatar:async value=>{trainer.profile=await db.saveTrainerAvatar(value);},closeSheet,error,
 settings,applySettings,bindSettings,bindActions,sheet,toast,showSkins,showOffline,showDiagnostics,showBackup,showInputControls:()=>{if(engine)setPause(true);showInputControls();},onClose:cleanup=>{sheetCleanup=cleanup;}
});
const runtime={get busy(){return rewindSession.busy;},invalidateHistory:()=>rewindSession.clear(),get engine(){return engine;},get current(){return current;},get link(){return link;},get protection(){return protection;},set cleanup(value){sheetCleanup=value;}};
const skinSettings=createSkinSettings({runtime,settings,setPause,sheet,applySettings,layoutSkin,reloadSkins,refresh,toast,error,controlLayout,playerSize,frameStyle});
const rewindSession=createRewindSession({getState:()=>({paused,linked:!!link||linkStarting,exiting,hidden:document.hidden}),setPause,waitForSaves:()=>protection.queue,toast,error});
const keybits={a:0,b:1,select:2,start:3,right:4,left:5,up:6,down:7,r:8,r1:8,l:9,l1:9,x:10,y:11,c:12,z:13};
const pressed=new Map(),skinPointers=createSkinPointers();
const inputControls=createInputControls({settings,keybits,pressed,updateKeys,
 getState:()=>({system:current?.system||settingsGame?.system||'gba',active:!!engine,paused:paused||rewindSession.busy,linked:!!link||linkStarting,deadZone:settings.deadZone??.4}),
 action:kind=>{if(launching||exiting||rewindSession.busy)return;const actions={menu:showGameMenu,save:()=>{setPause(true);confirmStateSave(true);},load:showQuickLoad,speed:cycleSpeed,rewind:rewindNow};void guardUpdateTask(()=>Promise.resolve(actions[kind]?.()).catch(error))();},
 unlockAudio:()=>!paused&&!launching&&!exiting&&!exitStage?engine?.unlockAudio():undefined,saveSettings:applySettings,
 ignoreEvent:event=>{if($('#sheet').open||event.target.closest?.('#link-panel,#screenshot-preview,#capture-menu,#recording-preview'))return true;if(event.code==='Escape'&&captureControls.menuVisible){event.preventDefault();captureControls.hide();return true;}if(event.code==='Escape'&&screenshotPreview.visible){event.preventDefault();screenshotPreview.hide();return true;}if(event.code==='Escape'&&linkPanel.visible){event.preventDefault();linkPanel.hide({focus:true});return true;}if(event.code==='Tab'&&linkPanel.visible)return true;return ['Enter','Space'].includes(event.code)&&!!event.target.closest?.('button,a');}
});
const showInputControls=createInputControlsView({controls:inputControls,settings,applySettings:()=>{applySettings();layoutSkin();},sheet,onClose:cleanup=>{sheetCleanup=cleanup;},getSystem:()=>current?.system||settingsGame?.system||'gba',isPlaying:()=>!!engine});
createUINavigation({active:()=>!importing&&!launching&&!exiting&&(!engine||paused),capturing:()=>inputControls.isCapturing(),release:()=>inputControls.release(),back:()=>{if($('#sheet').open)$('#close-sheet').click();else if(tab!=='games'){$('[data-tab=games]').click();}}});
// Suppress callouts on the whole player, including status text and empty space.
// Keep native selection, copy and paste in room numbers and other text fields.
for(const type of ['contextmenu','selectstart','dragstart'])document.addEventListener(type,e=>{
 const target=e.target instanceof Element?e.target:e.target.parentElement;
 if(!target||target.closest('input,textarea,select')||target.isContentEditable)return;
 if(target.closest('button,[role="button"],a.row,a.primary,a.secondary,summary,#player,.edit-preview'))e.preventDefault();
},{capture:true});
guardPlayerGestures($('#player'));
let saveImportTarget=null,applyingSave=false,playRunAt=0;
let dpadViews=[];
const linkPanel=floatingPanel($('#link-panel'),{handle:$('#link-panel-drag'),trigger:$('#player-link'),close:$('#link-panel-close'),onInteract:release});
const linkControls=createLinkControls({
 state:{get engine(){return engine;},set engine(v){if(engine!==v)void captureControls.stop('core-change');engine=v;for(const core of v?.cores||[v])if(core)core.onAudioState=updateAudioButton;updateAudioButton();},get current(){return current;},get protection(){return protection;},
 get link(){return link;},set link(v){link=v;},get starting(){return linkStarting;},set starting(v){linkStarting=v;if(v){void rewindSession.clear();release();}},
 get message(){return linkMessage;},set message(v){linkMessage=v;},get blocked(){return linkSaveBlocked;},set blocked(v){linkSaveBlocked=v;}},
 setPause,release,applySettings,updateLinkButton,panel:linkPanel,toast,error,exitGame,download
});
$('#player-link').innerHTML=icon('wifi');$('#link-panel-icon').innerHTML=icon('wifi');$('#link-panel-close').innerHTML=icon('close');
$('#player-link').onclick=()=>linkPanel.visible?linkPanel.hide():showLink();
function toast(text){const el=$('#toast');($('#sheet').open?$('#sheet'):document.body).append(el);el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3500);}
function error(e){diagnostics.record(e,'handled');console.error(e);toast(e?.name==='QuotaExceededError'&&!e.saveCommitted?tr('保存容量が不足しています。セーブをファイルに書き出してください。'):e.message||String(e));}
function audioTarget(){return engine?.cores?.[engine.view]||engine;}
function updateAudioButton(){
 const target=audioTarget();$('#enable-audio').hidden=!engine||paused||launching||exiting||document.hidden||settings.muted||!settings.volume||!['pending','blocked'].includes(target?.audioState);
}
$('#enable-audio').onclick=()=>{const target=audioTarget();if(!paused&&!launching&&!exiting)void target?.unlockAudio({retry:true});};
// Touch activation is available on release. A pending browser resume must not
// swallow a later real gesture, but timers/synthetic input must not queue retries.
function retryGameAudio(event){
 if(!event.isTrusted||event.repeat||paused||launching||exiting||exitStage||document.hidden||settings.muted||!settings.volume||$('#sheet').open||event.target?.closest?.('#enable-audio'))return;
 const target=audioTarget();if(['pending','blocked'].includes(target?.audioState))void target.unlockAudio({retry:true});
}
$('#player').addEventListener('pointerup',retryGameAudio);
document.addEventListener('keydown',retryGameAudio);
function syncRuntime(){
 updateAudioButton();
 const active=!!engine&&!paused&&!exiting&&!launching&&!document.hidden;
 screenAwake.set({active,allow:settings.keepScreenAwake!==false});
 const fps=current?.system==='nds'&&coreFor(current).renderLimit&&settings.ndsPowerSave!==false?30:Math.min(60,(engine?.fps||60)*(settings.speed||1));
 performanceDiagnostics.configure({enable:settings.measurePerformance===true,running:active,engine,fps});
}
function applySettings(){syncRuntime();$$('#quick-actions button').forEach(b=>b.disabled=!!link);document.documentElement.dataset.theme=settings.theme==='auto'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):settings.theme;$('#screen').className=settings.filter==='smooth'?'smooth':settings.filter==='scanlines'?'scanlines':'';engine?.setVolume(settings.muted?0:settings.volume);updateAudioButton();$('#screen').dataset.scaling=settings.screenScaling||'fit';engine?.setSpeed(link?1:settings.speed);engine?.setPreservePitch?.(true);updateSpeedButton();updateLinkButton();engine?.setFilter?.(settings.filter);engine?.video?.setStrength(settings.filterStrength??.5);engine?.videos?.forEach(video=>video.setStrength(settings.filterStrength??.5));$$('[data-filter-strength]').forEach(el=>el.hidden=!['lcd','crt'].includes(settings.filter));engine?.setCartridgeOptions?.(settings);engine?.setNDSOptions?.(settings);engine?.setRenderLimit?.(settings.ndsPowerSave!==false);$('#fps-meter').hidden=!settings.showFps;rewindSession.configure(settings.rewindEnabled);guardUpdateTask(()=>preferences.save())().catch(()=>{});}
function bindActions(root,handlers){root.querySelectorAll('[data-action]').forEach(el=>el.onclick=guardUpdateTask(()=>{try{return Promise.resolve(!rewindSession.busy?handlers[el.dataset.action]?.():undefined).catch(error);}catch(e){error(e);}}));}
function sheet(title,html,resume=false,{root=false,onBack=null,confirmation=false}={}){
 captureControls.hide();
 const dialog=$('#sheet');if(gameMenuReturn&&dialog.open&&dialog.classList.contains('game-info'))gameMenuReturn.scrollTop=$('.native-options')?.scrollTop||0;
 sheetCleanup();sheetCleanup=()=>{};if(dialog.open)dialog.close();
 dialog.classList.remove('port-menu','states-view','save-data','native-menu','game-info');$('#sheet-cover').hidden=true;$('#sheet-cover').removeAttribute('src');$('#sheet-tools').replaceChildren();$('#close-sheet').removeAttribute('data-action');sheetBack=onBack||(!root&&!engine&&!launching&&gameMenuReturn?()=>gameInfo.show(gameMenuReturn.game):null);
 const close=$('#close-sheet'),back=!!sheetBack&&!confirmation;close.hidden=confirmation;close.classList.toggle('sheet-back',back);close.setAttribute('aria-label',back?tr('戻る'):tr('閉じる'));close.innerHTML=back?`${icon('back')}<span>${esc(tr('戻る'))}</span>`:icon('close');
 linkPanel.hide();dialogResume=resume;$('#sheet-title').textContent=title;$('#sheet-body').innerHTML=html;dialog.showModal();dialog.scrollTop=0;
}
function menuTools(tools,handlers){$('#sheet-tools').innerHTML=tools.map(([id,label,ic])=>`<button class="sheet-tool ${id==='exit'?'danger':''}" data-shortcut="${id}" data-action="${id}" aria-label="${label}" title="${label}">${icon(ic)}</button>`).join('');$$('[data-shortcut]').forEach(b=>b.onclick=guardUpdateTask(()=>{try{return Promise.resolve(!rewindSession.busy?handlers[b.dataset.shortcut]():undefined).catch(error);}catch(e){error(e);}}));}
function closeSheet({dismiss=false}={}){
 if(rewindSession.busy||$('#close-sheet').disabled)return;
 if(!dismiss&&!launching&&sheetBack){try{Promise.resolve(sheetBack()).catch(error);}catch(e){error(e);}return;}
 // A child sheet replaces the DOM, but its owning GameInfoView stays active.
 // Only explicit Play/Delete or closing the ROM menu dismisses that context.
 if(!dismiss&&!engine&&!launching&&gameMenuReturn&&$('#sheet').open&&!$('#sheet').classList.contains('game-info')){gameInfo.show(gameMenuReturn.game);return;}
 gameMenuReturn=null;if(!engine)settingsGame=null;const resume=dialogResume;dialogResume=false;$('#sheet').close();disposeSheet();if(resume&&engine)setPause(false);
}
function disposeSheet(){
 sheetBack=null;
 const cleanup=sheetCleanup;sheetCleanup=()=>{};cleanup();
 $('#sheet-body').replaceChildren();$('#sheet-tools').replaceChildren();$('#sheet-cover').removeAttribute('src');$('#sheet-cover').hidden=true;
}
function showCoreKeyboard({hint,maxLength,password}){
 return new Promise(resolve=>{
  const resume=!paused;setPause(true);let settled=false;
  sheet(tr('文字入力'),tr`<form id="core-keyboard"><label for="core-text">${esc(hint||tr('文字を入力してください'))}</label><input id="core-text" type="${password?'password':'text'}" maxlength="${Math.max(1,Math.min(256,maxLength||32))}" autocomplete="off"><button class="primary" type="submit">決定</button></form>`,resume);
  sheetCleanup=()=>{if(!settled){settled=true;resolve(null);}};
  $('#core-keyboard').onsubmit=e=>{e.preventDefault();settled=true;resolve($('#core-text').value);closeSheet();};
  $('#core-text').focus();
 });
}
$('#close-sheet').innerHTML=icon('close');$('#close-sheet').onclick=closeSheet;
// File input cancellation bubbles; it is not a request to dismiss the sheet.
$('#sheet').addEventListener('cancel',e=>{if(e.target!==e.currentTarget)return;e.preventDefault();closeSheet();});
// A modal dialog paints above all ordinary z-index layers, including body toasts.
$('#sheet').addEventListener('close',()=>{if(!$('#sheet').open)document.body.append($('#toast'));});
$('#sheet').addEventListener('click',e=>{if(e.target===$('#sheet')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeSheet();}});
$('#history').innerHTML=icon('history');$('#history').onclick=showHistory;
$('#player-menu').innerHTML=icon('more');$('#player-menu').onclick=showGameMenu;
function tabFromHash(){return location.hash==='#settings'?'settings':location.hash==='#imports'?'imports':'games';}
function setTab(id){
 tab=id;
 // Keep the selected tab when returning from a separate settings page.
 const url=new URL(location.href);url.hash=id==='games'?'':id;
 history.replaceState(history.state,'',url);
}
for(const [id,ic,label] of [['games','game',tr('ゲーム')],['imports','import',tr('インポート')],['settings','settings',tr('設定')]]){const b=$(`[data-tab="${id}"]`);b.innerHTML=icon(ic)+`<span>${label}</span>`;b.onclick=()=>{libraryView.leave();setTab(id);render();window.scrollTo(0,0);};}
async function refresh(){const data=await db.trainerCard();library=data.games;trainer={profile:data.profile,...trainerStats(data.records,library)};render();}
function render(){if(engine)return;settingsGame=gameMenuReturn?.game||null;$$('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false');});if(tab==='games')renderGames();else if(tab==='imports')renderImports();else renderSettings();startUpdates.renderNotice(tab==='settings'?null:$('#content'));startUpdates.refresh();}
const libraryView=createLibraryView({games:()=>library,showGame:showDetails,quickStart:()=>settings.quickStart===true,startGame:game=>guardUpdateTask(()=>launch(game).catch(error))(),add:()=>$('#rom-input').click(),sheet,closeSheet,refresh,toast,error});
const startUpdates=createStartUpdatesView({games:()=>library,active:()=>appReady&&!engine&&!launching&&!importing&&!exiting&&!document.hidden,sheet,closeSheet,updateROM:(game,options)=>gameInfo.updateROM(game,options)});
function renderGames(){libraryView.render();}
// ManicEMU ImportServiceListView and its motto, file, service and footer cells.
// Copyright © 2025–2026 Manic EMU. Daiuno / Max. Ported 2026-10-09.
// Local Files, skin settings and game-specific save import; original Web artwork.
function renderImports(){
 $('#content').innerHTML=tr`<section class="page import-page" aria-label="インポート"><header class="import-hero"><img src="assets/icon.svg" alt=""></header>
  <button class="import-file" id="choose-rom"><span class="import-file-icon">${icon('folder')}</span><span><strong>ROMを追加</strong></span></button>
  <div class="import-services"><button class="import-service" id="import-saves" ${library.length?'':'disabled'}><span class="import-service-icon save-service">${icon('saveImport')}</span><strong>セーブデータ</strong>${library.length?'':tr('<small>先にゲームを追加</small>')}</button><button class="import-service" id="import-skins"><span class="import-service-icon skin-service">${icon('image')}</span><strong>スキン</strong></button><button class="import-service" id="import-update-rom" ${library.length?'':'disabled'}><span class="import-service-icon">${icon('reload')}</span><strong>ROMを更新</strong>${library.length?'':tr('<small>先にゲームを追加</small>')}</button><button class="import-service" id="import-patch"><span class="import-service-icon">${icon('code')}</span><strong>ROMパッチ</strong></button></div>
  <div class="import-drop"><span class="import-drop-icon">${icon('import')}</span><span><strong>ドラッグ＆ドロップ</strong><small>ROMをこの画面にドロップ</small></span></div>
  <details class="import-formats"><summary>対応する形式</summary><p class="sheet-note">${Object.values(systems).map(s=>`${s.short}：${s.ext.map(ext=>'.'+ext).join(' / ')}`).join('<br>')}</p><p class="sheet-note">ZIPも追加できます。ROMとセーブは端末内に保存します。利用する権利のあるROMを使用してください。</p></details></section>`;
 $('#choose-rom').onclick=()=>$('#rom-input').click();
 $('#import-patch').onclick=()=>showROMPatch({sheet,onClose:fn=>{sheetCleanup=fn;},download,error});
 $('#import-skins').onclick=()=>showSkins();
 $('#import-update-rom').onclick=showROMUpdatePicker;
 $('#import-saves').onclick=()=>{
  sheet(tr('セーブデータ'),tr('<p class="sheet-note">読み込み先のゲームを選んでください。</p><div class="settings-group">')+library.map(game=>`<button class="row" data-import-save="${esc(game.id)}">${icon('game')}<span>${esc(game.name)}</span>${icon('chevron')}</button>`).join('')+'</div>');
  $$('[data-import-save]').forEach(button=>button.onclick=()=>{const game=library.find(game=>game.id===button.dataset.importSave);if(game)chooseSaveImport(game);});
 };
}

function showROMUpdatePicker(){
 if(!library.length)return;
 if(library.length===1){gameInfo.updateROM(library[0],{onBack:()=>closeSheet({dismiss:true})});return;}
 sheet(tr('ROMを更新'),tr('<p class="sheet-note">更新するゲームを選んでください。</p><div class="settings-group">')+library.map(game=>`<button class="row" data-update-rom="${esc(game.id)}">${icon('game')}<span>${esc(game.name)}</span>${icon('chevron')}</button>`).join('')+'</div>');
 $$('[data-update-rom]').forEach(button=>button.onclick=()=>{const game=library.find(game=>game.id===button.dataset.updateRom);if(game)gameInfo.updateROM(game,{onBack:showROMUpdatePicker});});
}

function bindSettings(root){root.querySelectorAll('[data-setting]').forEach(el=>el.onchange=()=>{settings[el.dataset.setting]=el.type==='checkbox'?(el.dataset.invert?!el.checked:el.checked):['volume','speed','hapticStrength','deadZone','filterStrength'].includes(el.dataset.setting)?Number(el.value):el.value;if(el.dataset.setting==='hapticStrength')settings.haptics=!!settings.hapticStrength;const value=el.closest('.native-select')?.querySelector('.native-value');if(value)value.textContent=el.selectedOptions[0].textContent;applySettings();const scope=$('#game-preferences-mode'),game=current||settingsGame;if(scope&&game){scope.textContent=hasGamePreferences(game)?tr('このゲームの設定'):tr('共通設定を使用');const reset=$('[data-action=resetPreferences]');if(reset)reset.disabled=!hasGamePreferences(game);}if(['haptics','hapticStrength'].includes(el.dataset.setting)){if(settings.haptics)tapHaptic(settings);else stopHaptics();}if($('#video-filter-note'))$('#video-filter-note').hidden=settings.filter!=='edge4x';if(['touchControls','showFps','ndsSwapScreens','showCamera'].includes(el.dataset.setting))layoutSkin();});}
async function importFiles(files){
 if(!files.length)return;
 if(importing){toast(tr('追加が終わるまでお待ちください。'));return;}
 importing=true;let count=0,duplicates=0,failure,progress,unattempted=0;const skipped=[];
 try{
  progress=createImportProgress();
  for(const [index,file] of files.entries()){
   const system=detectSystem(file.name),archive=/\.zip$/i.test(file.name);
   if(!system&&!archive){skipped.push(tr`${file.name}: 未対応の形式です。`);continue;}
   const maxMiB=archive?maxROMZipSize/1048576:system==='3ds'?4096:system==='nds'?512:64;
   if(file.size>maxMiB*1048576||!file.size){skipped.push(tr`${file.name}: 空のファイル、または${maxMiB}MBを超えるファイルは追加できません。`);continue;}
   progress.start(file,index+1,files.length);
   try{
    const result=await importROM(file,system,progress.update);
    count+=result.addedCount??(result.added?1:0);duplicates+=result.duplicateCount??(result.added?0:1);
   }catch(e){
    count+=e.addedCount||0;duplicates+=e.duplicateCount||0;diagnostics.record(e,'import');
    skipped.push(`${file.name}: ${e.message||tr('追加できませんでした。')}`);
    // A bad file does not stop unrelated imports. Storage-wide failures cannot
    // be fixed by trying the next file; retain committed games and stop safely.
    if(['QuotaExceededError','InvalidStateError','UnknownError','SecurityError'].includes(e.name)){unattempted=files.length-index-1;break;}
   }
  }
 }catch(e){count+=e.addedCount||0;duplicates+=e.duplicateCount||0;diagnostics.record(e,'import');failure=e;}
 finally{progress?.close();importing=false;$('#rom-input').value='';}
 try{if(count){setTab('games');libraryView.reset();await refresh();}}catch(e){failure??=e;}
 const result=[count?tr`${count}本のゲームを追加しました。`:'',duplicates?tr`${duplicates}本は追加済みです。`:''].filter(Boolean).join(' ');
 if(failure){diagnostics.record(failure,'import');skipped.push(failure.message||tr('追加できませんでした。'));}
 if(skipped.length){
  sheet(tr('ゲームの追加結果'),`${result?`<p class="sheet-note">${esc(result)}</p>`:''}<ul class="import-results">${skipped.map(message=>`<li>${esc(message)}</li>`).join('')}</ul>${unattempted?tr`<p class="sheet-note">残り${unattempted}件は追加していません。保存容量などを確認して、もう一度お試しください。</p>`:''}<button class="primary wide-button" id="import-results-close">${tr('閉じる')}</button>`);
  $('#import-results-close').onclick=()=>closeSheet({dismiss:true});
 }else if(result)toast(result);
}
$('#rom-input').onchange=guardUpdateTask(e=>importFiles([...e.target.files]));
document.body.dataset.dropLabel=tr('ROMをドロップして追加');
let dragDepth=0;window.addEventListener('dragenter',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dragDepth++;document.body.classList.add('drop-active');}});window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('dragleave',()=>{if(--dragDepth<=0)document.body.classList.remove('drop-active');});window.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;document.body.classList.remove('drop-active');if(!engine)importFiles([...e.dataTransfer.files]);});
function menuControlCells(game=current){return {
 swapScreen:dualScreen(game?.system)?nativeToggle(tr('画面切り替え'),'ndsSwapScreens','layers',!!settings.ndsSwapScreens):'',
 frameLimit:game?.system==='nds'&&coreFor(game).renderLimit?nativeToggle(tr('省電力モード'),'ndsPowerSave','bolt',settings.ndsPowerSave!==false,{detail:tr('描画を約30fpsに抑えて負荷を軽減')}):'',
 volume:nativeToggle(tr('音量'),'muted','volume',!settings.muted,{invert:true}),
 volumeLevel:row(tr('音量レベル'),tr`<input aria-label="音量レベル" data-setting="volume" type="range" min="0" max="1" step=".05" value="${settings.volume}">`,'volume'),
 fastForward:nativeSelect(tr('プレイ速度'),'speed','fast',[[1,tr('通常速度')],...[2,3,4,5].map(n=>[n,n+tr('倍速')])],settings.speed),
 shaders:nativeSelect(tr('映像フィルター'),'filter','image',videoFilters,settings.filter)+filterStrengthControl(settings)+videoFilterNote(settings.filter),
 haptic:supportsHaptics()?nativeSelect(tr('タッチの振動'),'hapticStrength','haptic',[[0,tr('オフ')],[8,tr('弱振動')],[20,tr('強振動')]],settings.haptics?(settings.hapticStrength||8):0):nativeAction(tr('タッチの振動'),null,'haptic',tr('このブラウザでは非対応')),
 controllerSetting:nativeAction(tr('コントローラー・キーボード'),'controllers','game'),
 rewindEnabled:game&&supportsRewind(game.system,coreFor(game).key)?nativeToggle(tr('巻き戻しを記録'),'rewindEnabled','history',!!settings.rewindEnabled,{detail:tr('最大10秒・記録用メモリ8 MiBまで。通信中は停止')}):'',
 rewind:engine&&supportsRewind(current.system,coreFor(current).key)?nativeAction(tr('最大3秒戻す'),'rewind','history'):'',
 deadZone:nativeSelect(tr('デッドゾーン'),'deadZone','joystick',[[.1,'10%'],[.2,'20%'],[.3,'30%'],[.4,'40%'],[.5,'50%']],settings.deadZone??.4),
 cameraButton:nativeToggle(tr('スクリーンショットボタン'),'showCamera','camera',settings.showCamera!==false),
 hideControls:nativeToggle(tr('画面ボタン'),'touchControls','game',!!settings.touchControls),
 screenScaling:nativeSelect(tr('画面スケーリング'),'screenScaling','expand',[['fit',tr('アスペクト比を維持')],['stretch',tr('引き伸ばし')],['fill',tr('画面を埋める')]],settings.screenScaling||'fit')
};}
const gameInfo=createGameInfo({sheet,closeSheet,launch,refresh,error,toast,download,showSkins,showControllers,showCheats,showCategory:game=>libraryView.showCategory(game),
 showStartUpdates:(game,options)=>startUpdates.open(game,options),
 showStates:game=>showStates(null,false,{game}),importSave:game=>chooseSaveImport(game),applySave:applyGameSave,
 onClose:cleanup=>{sheetCleanup=cleanup;},beginGame:game=>{settingsGame=game;if(gameMenuReturn?.game.id!==game.id)gameMenuReturn={game,scrollTop:0};else gameMenuReturn.game=game;return gameMenuReturn.scrollTop;},preferenceSummary:gamePreferenceSummary,resetPreferences:game=>resetGamePreferences(game,()=>gameInfo.show(game)),settings:()=>settings,saveSettings:applySettings,controlCells:menuControlCells,bindSettings});
// ManicEMU Game.handleTapAction's normal selection route. Core startup belongs
// to GameInfoDetailView's explicit Play action (or an explicit state resume).
function showDetails(game){gameInfo.show(game);}
function resetGamePreferences(game,back){confirmPreferenceReset({game,sheet,error,back,reset:async game=>{await preferences.reset(game);applySettings();if(engine)layoutSkin();}});}
function showHistory(){const games=library.filter(g=>g.lastPlayed).sort((a,b)=>b.lastPlayed-a.lastPlayed);sheet(tr('プレイ履歴'),games.length?`<div class="settings-group">${games.slice(0,15).map(g=>action(esc(g.name),g.id,'chevron')).join('')}</div>`:tr('<p class="sheet-note">まだプレイしたゲームはありません。</p>'));bindActions($('#sheet-body'),Object.fromEntries(games.map(g=>[g.id,()=>showDetails(g)])));}
function controlLayout(system,game){return game?.controlLayout??settings.controlLayouts?.[system]??{};}
// WebKit can retain a stale computed dvh height on the hidden player. Use the
// current viewport for library previews, and actual bounds during gameplay.
function playerSize(){const stage=$('#player'),style=getComputedStyle(stage);return {width:(stage.clientWidth||window.innerWidth)-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),height:(stage.clientHeight||window.innerHeight)-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)};}
function showSkins(system,game){return guardUpdateTask(()=>skinSettings.showSkins(system,game,skinOrientation(playerSize())))();}
const protection=new SaveProtection(status=>{
 const el=$('#save-status');el.hidden=!engine;
 el.classList.toggle('save-error',!!status.error);
 const at=status.stateAt||status.at,time=at?new Date(at).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit',hour12:false}):'';
 el.textContent=status.error?tr('保存失敗'):status.busy?tr('保存中…'):at?tr('保存済み ')+time:tr('未保存');
 const details=[status.stateAt?tr('再開用データ：')+new Date(status.stateAt).toLocaleString(locale()):'',status.at?tr('ゲーム内セーブ：')+new Date(status.at).toLocaleString(locale()):''].filter(Boolean).join(' ／ ');
 el.dataset.detail=status.error?tr('保存失敗：')+status.error:status.busy?tr('保存中…'):details||tr('まだ保存されていません');el.title=el.dataset.detail;el.setAttribute('aria-label',el.dataset.detail);
 const note=$('#protection-status');if(note)note.textContent=el.dataset.detail;
});
const stateDialogs=createStateDialogs({runtime,sheet,closeSheet,setPause,persist,launch,showGameMenu,toast,error,download,onClose:cleanup=>{sheetCleanup=cleanup;}});
function setLaunching(value){
 launching=value;
 // The loading status remains accessible; controls cannot enter a half-loaded
 // core through touch, keyboard focus or the previous skin's controls.
 for(const child of $('#player').children)if(child.id!=='loading')child.inert=value;
 if(value)$('#player').setAttribute('aria-busy','true');else $('#player').removeAttribute('aria-busy');
}
async function launch(game,{safeMode=false,skipRecovery=false}={}){
 if(engine||launching||applyingSave)return false;
 // Reserve audio within the Play gesture, before update, IndexedDB or core awaits.
 const preparedAudio=prepareGameAudio();launchContinuation.clear();setLaunching(true);
 try{if(await autoUpdates?.beforeLaunch?.()===false){launchContinuation.remember(game,{safeMode,skipRecovery});setLaunching(false);preparedAudio.close();setTimeout(()=>autoUpdates?.refresh(),0);return false;}}catch(error){preparedAudio.close();setLaunching(false);throw error;}
 gameMenuReturn=null;sheetBack=null;current=game;paused=false;$('#resume-game').hidden=true;$('#save-status').hidden=true;$('#fps-meter').hidden=true;$('#loading').hidden=false;$('#loading').textContent=tr('コアを読み込んでいます…');$('#player').hidden=false;
 try{
  await preferences.flush();const stored=await db.get('library',game.id);if(!stored)throw new Error(tr('ゲームが見つかりません。'));current=game=stored;settingsGame=null;
  const bytes=await db.get('roms',game.id);if(!bytes)throw new Error(tr('ROMが見つかりません。もう一度追加してください。'));
  const previous=await protection.open(game,coreFor(game).id);
  // The game lock now protects this baseline from another tab's final write.
  const lockedGame=await db.get('library',game.id);if(!lockedGame)throw new Error(tr('ゲームが見つかりません。'));game.playDuration=lockedGame.playDuration||0;
  if(previous.interrupted)diagnostics.record(null,'previous-session');
  await reloadSkins(false);$('#screen').replaceChildren();
  engine=createCore($('#screen'),game);engine.setVolume(settings.muted?0:settings.volume);engine.onAudioState=updateAudioButton;engine.adoptAudio?.(preparedAudio);
  engine.onKeyboard=showCoreKeyboard;engine.onError=e=>{diagnostics.record(e,'core');setPause(true);void rewindSession.clear({halt:true});error(e);};engine.unlockAudio()?.catch?.(()=>{});engine.setCartridgeOptions?.(settings);engine.setNDSOptions?.(settings);await engine.load(bytes,game,systems[game.system]);
  // Hold emulation while restoring saves without stopping the audio session
  // acquired by Play. Restarting it after these awaits may need another tap.
  engine.pause(true,{preserveAudio:!paused&&!document.hidden});
  if(previous.save?.bytes)await engine.restore(await protection.verify(previous.save));
  engine.pause(false);
  engine.setCheats?.(safeMode||!coreFor(game).cheats?[]:cheatsFor(game));game.lastPlayed=Date.now();await db.setGameDetails(game.id,{lastPlayed:game.lastPlayed});paused=false;playRunAt=Date.now();$('#resume-game').hidden=true;rewindSession.attach(engine,{...game,coreKey:coreFor(game).key});applySettings();layoutSkin();$('#loading').hidden=true;$('#save-status').hidden=false;engine.unlockAudio()?.catch?.(()=>{});startPadPoll();
  if(!safeMode&&!skipRecovery&&previous.interrupted&&previous.recoveries.some(r=>protection.compatible(r))){setPause(true);await showRecovery(true);}
 }catch(e){
  diagnostics.record(e,'startup');
  // A failed native cleanup must not strand the loading UI or prevent the
  // save writer from closing. Protection keeps its own fence/lock if closing
  // fails; never force-release it or replace the original startup error.
  for(const cleanup of [()=>rewindSession.dispose(),()=>clearImportedSkin(),()=>releaseSkin(),()=>engine?.close(),()=>protection.close()]){
   try{await cleanup();}catch(cleanupError){diagnostics.record(cleanupError,'startup');}
  }
  skinPair=null;engine=null;current=null;settingsGame=null;$('#player').hidden=true;$('#loading').hidden=true;
  if(e.code==='SAVE_INTEGRITY_FAILED'){await gameInfo.showSaveData(game,{startupError:true});return false;}
  if(e.code==='CORE_LOAD_FAILED'){showCoreLoadFailure({sheet});return false;}
  throw e;
 }finally{preparedAudio.close();setLaunching(false);if(engine&&document.hidden)setPause(true,'background');syncRuntime();}
}
function frameStyle(frame,map){return `left:${frame.x/map.width*100}%;top:${frame.y/map.height*100}%;width:${frame.width/map.width*100}%;height:${frame.height/map.height*100}%;`;}
let layoutFrame=null,lastLayoutSize='',skinScreenCleanup=()=>{},skinInputs=null;
let cameraPlacement=null,cameraBinding=null;
function clearImportedSkin(){skinScreenCleanup();skinScreenCleanup=()=>{};skinInputs?.destroy();skinInputs=null;$('#skin .imported-art')?.remove();}
function scheduleSkinLayout(){if(layoutFrame!==null)return;layoutFrame=requestAnimationFrame(()=>{layoutFrame=null;layoutSkin(false);});}
async function reloadSkins(draw=true){
 const game=current;if(!game)return;
 const pair=await loadSkinPair(game.system,game.skinId,settings.skins?.[game.system]);
 if(pair&&current===game){skinPair=pair;if(draw)layoutSkin();}
}
function layoutSkin(force=true){if(!current||!skinPair||!engine)return;
 const stage=$('#player'),{width,height}=playerSize(),orientation=skinOrientation({width,height}),skinData=skinPair[orientation],builtin=skinData.id.startsWith('builtin:'),padding=getComputedStyle(stage),sizeKey=[skinData.id,width,height,padding.paddingLeft,padding.paddingTop,padding.paddingRight,padding.paddingBottom].join(':');
 // ResizeObserver, viewport and window can report the same resize. Do not
 // rebuild held buttons or generate the SVG again when geometry is unchanged.
 if(!force&&sizeKey===lastLayoutSize)return;lastLayoutSize=sizeKey;cameraBinding?.cancel();cameraPlacement=null;release();configureBuiltinTouchTargets($('#touch-controls'),null);clearImportedSkin();
 stage.dataset.skinId=skinData.id;stage.dataset.skinDirection=orientation;stage.dataset.system=current.system;stage.dataset.builtin=String(builtin);stage.dataset.displayOnly=String(!settings.touchControls);$('#quick-actions').hidden=!builtin||!settings.touchControls;$('#boost').hidden=!settings.touchControls;
 const landscape=width>height;
 let rep=builtin?builtinLayout(skinData,width,height,controlLayout(current.system,current)[landscape?'landscape':'portrait'],current.system==='gba'?48:32):chooseRepresentation(skinData,width,height);
 if(!settings.touchControls&&dualScreen(current.system))rep=ndsDisplayLayout(width,height,controlLayout(current.system,current)[landscape?'landscape':'portrait']);
 else if(!settings.touchControls){const aspect=['gb','gbc'].includes(current.system)?160/144:current.system==='gba'?1.5:4/3,sw=Math.min(width,height*aspect),customScreen=builtin&&controlLayout(current.system,current)[landscape?'landscape':'portrait']?.screen;rep={mappingSize:{width,height},assets:{},items:[],wide:customScreen?rep.wide:undefined,screens:[{outputFrame:customScreen?{...rep.screens[0].outputFrame}:{x:(width-sw)/2,y:(height-sw/aspect)/2,width:sw,height:sw/aspect}}]};}
 rep=cameraLayout(rep,controlLayout(current.system,current)[landscape?'landscape':'portrait'],width,height,{enabled:settings.showCamera!==false,hitSlop:builtin?(settings.touchHitSlop||0):0,fallbackBoost:settings.touchControls});$('#player-camera').hidden=settings.showCamera===false;
 engine?.setLayout?.(rep.wide??landscape,!!settings.ndsSwapScreens,rep);stage.dataset.wide=String(rep.wide??landscape);stage.style.setProperty('--skin-side',(rep.side||130)+'px');
 const imported=!builtin&&settings.touchControls;
 $('#boost').hidden=!settings.touchControls||(imported&&rep.items.some(item=>Array.isArray(item.inputs)&&item.inputs.some(key=>key==='toggleFastForward'||/^fastForward/.test(key))));
 const map=rep.mappingSize,ratio=Math.min(width/map.width,height/map.height);const skin=$('#skin');skin.style.width=map.width*ratio+'px';skin.style.height=map.height*ratio+'px';skin.style.backgroundImage=rep.assets.resizable?`url("${skinData.images[rep.assets.resizable]}")`:"none";skin.style.backgroundSize=cameraBackgroundSize(rep);$('#screen').style.cssText=frameStyle(screenBounds(rep),map)+`border-radius:${skinData.screenRadius||0}px;`;
 if(imported){
  skin.style.backgroundImage='none';$('#screen').style.cssText='left:0;top:0;width:100%;height:100%;';
  skinScreenCleanup=mountSkinScreens($('#screen'),engine,rep,current.system,{swap:!!settings.ndsSwapScreens,ratio});
  const art=document.createElement('div');art.className='imported-art';art.style.cssText=frameStyle(rep.artFrame||{x:0,y:0,...map},map);art.style.backgroundImage=rep.assets.resizable?`url("${skinData.images[rep.assets.resizable]}")`:'none';skin.append(art);
 }
 for(const id of ['quick-load','quick-save','player-menu','boost','player-camera'])$('#'+id).removeAttribute('style');
 const skinRect=skin.getBoundingClientRect(),stageRect=stage.getBoundingClientRect();
 const camera=rep.actions?.find(a=>a.id==='player-camera');if(camera)cameraPlacement={game:current,orientation,map:{...map},frame:{...camera.frame},ratio,left:skinRect.left-stageRect.left,top:skinRect.top-stageRect.top};
 for(const id of ['fps-meter','save-status']){
  const badge=$('#'+id);badge.removeAttribute('style');
  if(builtin&&settings.touchControls){const maxWidth=dualScreen(current.system)?(skinRect.width-30)/2:rep.wide?rep.side*ratio-20:(skinRect.width-30)/2;badge.style.top=skinRect.top-stageRect.top+8+'px';badge.style.maxWidth=Math.max(1,maxWidth)+'px';if(id==='fps-meter')badge.style.left=skinRect.left-stageRect.left+10+'px';else badge.style.right=stageRect.right-skinRect.right+10+'px';}
 }
 for(const a of rep.actions||[]){const f=a.frame;$('#'+a.id).style.cssText=`left:${skinRect.left-stageRect.left+f.x*ratio}px;top:${skinRect.top-stageRect.top+f.y*ratio}px;width:${f.width*ratio}px;height:${f.height*ratio}px;right:auto;bottom:auto;min-width:0;padding:0;opacity:${a.opacity??1};`;}
 if(imported){dpadViews=[];skinInputs=mountSkinInputs($('#touch-controls'),rep,skinData.images,{keybits,pressed,updateKeys,action:skinAction,engine,ratio,swap:!!settings.ndsSwapScreens,selected:command=>({volume:settings.muted,reverseScreens:settings.ndsSwapScreens,toggleControlls:!settings.touchControls})[command],paused:()=>paused,haptic:()=>{tapHaptic(settings);}});return;}
 $('#touch-controls').innerHTML=rep.items.map((item,i)=>{const pad=!Array.isArray(item.inputs),inputs=pad?['dpad']:item.inputs;return `<button class="skin-button${pad?' dpad':''}" data-item="${i}" aria-label="${pad?tr('十字キー'):esc(item.label||inputs.join('+').toUpperCase())}" style='${frameStyle(item.frame,map)}opacity:${item.opacity??1};background-image:url("${skinData.images[item.asset?.normal]||''}")'>${pad?['up','down','left','right'].map(d=>`<span class="dpad-direction${item.asset?.normal?'':' baked'}" data-direction="${d}" aria-hidden="true" hidden></span>`).join(''):''}</button>`;}).join('');
 dpadViews=$$('.dpad-direction').map(el=>{const inputs=rep.items[Number(el.parentElement.dataset.item)].inputs,key=keybits[inputs[el.dataset.direction]];return {el,mask:key===undefined?0:1<<key,on:false};});
 $$('#touch-controls .skin-button').forEach(btn=>{const item=rep.items[Number(btn.dataset.item)];btn.dataset.gameInput='';function input(e){if(Array.isArray(item.inputs)){if(item.inputs.includes('menu'))return;pressed.set(e.pointerId,item.inputs.reduce((v,k)=>v|(keybits[k]===undefined?0:1<<keybits[k]),0));}else{const r=btn.getBoundingClientRect();let bits=0;for(const d of builtinDpadDirections((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height,settings))if(keybits[item.inputs[d]]!==undefined)bits|=1<<keybits[item.inputs[d]];pressed.set(e.pointerId,bits);}btn.classList.add('pressed');updateKeys();}
 btn.onpointerdown=e=>{e.preventDefault();if(item.inputs.includes?.('menu')){showGameMenu();return;}if(paused)return;engine?.unlockAudio();if($('#link-panel').contains(document.activeElement))document.activeElement.blur();skinPointers.start(btn,e,{move:Array.isArray(item.inputs)?undefined:input,end:()=>{pressed.delete(e.pointerId);btn.classList.toggle('pressed',skinPointers.has(btn));updateKeys();}});tapHaptic(settings);input(e);};});configureBuiltinTouchTargets($('#touch-controls'),settings);}
function updateKeys(time){let keys=0,second=0;for(const [source,mask] of pressed){const player=source==='mapped-gamepad-2'?2:source==='mapped-keyboard'?inputControls.player(current?.system,'keyboard'):source==='mapped-gamepad'?1:inputControls.player(current?.system,'touch');if(player===2)second|=mask;else keys|=mask;}keys=inputControls.transform(keys,time);if(paused||launching||exiting||rewindSession.busy)keys=second=0;engine?.setKeys(keys);if(engine?.multiplayer)engine.setKeys(second,1);keys|=second;for(const view of dpadViews){const on=!!(keys&view.mask);if(on!==view.on){view.on=on;view.el.hidden=!on;}}}
function release(){skinPointers.release();inputControls.release();stopHaptics();skinInputs?.release();pressed.clear();updateKeys();$$('.pressed').forEach(b=>b.classList.remove('pressed'));}
function setPause(v,reason='pause'){if(!v&&(linkStarting||link?.closed||rewindSession.busy||exitStage))return;if(v){cameraBinding?.cancel();captureControls.pause(reason);}else {pauseSaveTask=null;linkControls.foreground();if(link?.closed)return;}if(v&&playRunAt&&current){current.playDuration=(current.playDuration||0)+Math.max(0,Date.now()-playRunAt);playRunAt=0;}else if(!v&&!playRunAt&&engine)playRunAt=Date.now();paused=v;syncResume();release();if(!exitStage?.coreClosed)engine?.pause(v);void rewindSession.pause(v);if(!v)engine?.unlockAudio();syncRuntime();}
$('#resume-game').onclick=()=>{if(engine&&!launching&&!exiting&&!document.hidden)setPause(false);};
function savePausedGame(options={}){
 if(!engine||!paused||launching||exiting||exitStage||applyingSave||link||linkStarting||linkSaveBlocked||rewindSession.busy)return;
 if(pauseSaveTask?.core===engine)return pauseSaveTask.promise;
 const task={core:engine};task.promise=persist(options).catch(error).finally(()=>{if(pauseSaveTask===task)pauseSaveTask=null;});pauseSaveTask=task;return task.promise;
}
function backgroundPause(){linkControls.background();if(!engine||exiting||exitStage)return;const wasPaused=paused,wasLinked=!!link;setPause(true,'background');if(link?.connected&&!link.canWait)link.close(tr('画面を離れたため接続を終了しました。'));if(!wasLinked)savePausedGame({checkpoint:!wasPaused&&settings.recovery,reason:'background'});}
function foregroundResume(){linkControls.foreground();syncResume();}
function syncResume(){$('#resume-game').hidden=!engine||!paused||!$('#loading').hidden||exiting||!!exitStage;}
new ResizeObserver(scheduleSkinLayout).observe($('#player'));
window.visualViewport?.addEventListener('resize',scheduleSkinLayout);
window.addEventListener('resize',scheduleSkinLayout);window.addEventListener('blur',backgroundPause);window.addEventListener('focus',foregroundResume);
document.addEventListener('visibilitychange',()=>{if(document.hidden)backgroundPause();else foregroundResume();});
window.addEventListener('pagehide',backgroundPause);window.addEventListener('pageshow',event=>{if(event.persisted&&engine)setPause(true);foregroundResume();});
document.addEventListener('freeze',backgroundPause);document.addEventListener('resume',foregroundResume);
function startPadPoll(){engine.beforeFrame=()=>{inputControls.poll();if(engine.rumble?.enabled)engine.rumble.setTarget(inputControls.rumbleTarget());rewindSession.frame();};}
function persist(options={}){if(!engine||!current||launching||exitStage||link||linkStarting||linkSaveBlocked||rewindSession.busy)return Promise.resolve();const savingEngine=engine,started=performance.now();return protection.save(savingEngine,options).then(result=>{if(!result?.skipped)performanceDiagnostics.save(performance.now()-started,true,savingEngine);return result;}).catch(e=>{performanceDiagnostics.save(performance.now()-started,false,savingEngine);diagnostics.record(e,'save');throw e;});}
// A settled native save can reach IndexedDB sooner without capturing a state.
setInterval(()=>{if(engine&&!paused&&settings.autosave&&!applyingSave)persist({gameSave:true,automatic:true}).catch(error);},1000);
// Check deadlines without capturing data; automatic saves start after 120 seconds.
setInterval(()=>{if(engine&&!paused&&(settings.autosave||settings.recovery))persist({checkpoint:settings.recovery&&!link,automatic:true}).catch(error);},10000);
// Crash recovery uses the native automatic-save tab, not a separate menu.
async function showRecovery(interrupted=false){if(!engine)return;setPause(true);await showStates('auto',false,{interrupted});}
async function exportGameSave(){const bytes=await engine.save();if(!bytes?.length){toast(tr('ゲーム内でセーブしてから書き出してください。'));return;}download(bytes,current.name+'.'+coreFor(current).saveExtension);}
const playingSaveData=createSaveRescueView({
 sheet:(title,html,_resume,options)=>sheet(title,html,true,options),
 onClose:cleanup=>{sheetCleanup=cleanup;},showGame:showGameMenu,importSave:chooseSaveImport,
 download,error,toast,exportSave:exportGameSave,
 didRestore:()=>{closeSheet({dismiss:true});toast(tr('復元しました。'));},
 isActive:game=>!!engine&&current?.id===game.id&&!exiting&&!launching&&!exitStage,
 restoreHistory:async(game,plan,index)=>{
  const active=engine,record=await readSaveHistory(plan,index);
  if(!active||engine!==active||current?.id!==game.id||!paused||exiting||launching||exitStage)throw Error(tr('ゲームが変更されました。'));
  await applyGameSave(game,record.bytes,{history:true});
 }
});
async function showSaveData(){
 const active=engine,game=current,origin=$('#sheet-body').firstChild;if(!active||!game)return;
 setPause(true);await pauseSaveTask;await protection.queue;
 if(engine!==active||current!==game||!paused||origin!==$('#sheet-body').firstChild||exiting||launching||exitStage)return;
 await playingSaveData.open(game);
}
// GameOptionsView.getListPage / GameOption.defaultGroupAndSort, with native-only
// actions removed. Browser-only functions use the same grouped row components.
function showGameMenu(){
 if(!engine||launching||linkStarting||exiting||rewindSession.busy)return;if(exitStage){showExitRetry();return;}if(link){showConnectedMenu();return;}setPause(true);savePausedGame({reason:'pause'});
 const cells={
  cartridge:current.system==='nds'?nativeAction(tr('DSの操作'),'cartridge','game'):['gb','gbc','gba'].includes(current.system)&&engine.sensors?nativeAction(current.system==='gba'?tr('GBAカートリッジ'):tr('カートリッジ'),'cartridge','game'):'',
  skins:nativeAction(tr('スキン設定'),'skins','shirt'),stateList:nativeAction(tr('セーブステートを確認'),'states','state'),
  saveData:nativeAction(tr('ゲーム内セーブ・保存履歴'),'saveData','folder'),
  cheatCode:coreFor(current).cheats?nativeAction(tr('チートコード'),'cheats','code'):'',saveState:nativeAction(tr('ステートを保存'),'newState','save'),quickLoadState:nativeAction(tr('クイックロード'),'quickLoad','history'),
  ...menuControlCells(),screenShot:nativeAction(tr('スクリーンショット'),'screenshot','image'),
  showFps:nativeToggle(tr('FPS表示'),'showFps','bolt',settings.showFps),
  netplay:linkModes(current).length?nativeAction(tr('通信（実験版）'),'link','wifi'):'',fullScreen:nativeAction(tr('全画面'),'fullscreen','expand'),reload:nativeAction(tr('再起動'),'restart','reload'),quit:nativeAction(tr('終了'),'exit','power','','danger')
 };
 const shortcuts=gameShortcuts.filter(([id])=>!Array.isArray(settings.gameShortcuts)||settings.gameShortcuts.includes(id));
 const shortcutRows={exit:'quit',restart:'reload',newState:'saveState',quickLoad:'quickLoadState'};
 for(const [id] of shortcuts)delete cells[shortcutRows[id]];
 sheet(tr('ゲームメニュー'),gamePreferenceSummary(current)+groupedOptions(cells,settings.menuOrder),true);$('#sheet').classList.add('port-menu','native-menu');$('#close-sheet').dataset.action='play';$('#close-sheet').setAttribute('aria-label',tr('ゲームに戻る'));
 const handlers={cartridge:()=>current.system==='nds'?showNDSOptions({sheet,closeSheet,engine,settings,applySettings,toast}):showGBAOptions({sheet,engine,system:current.system,settings,applySettings,toast,onClose:fn=>{sheetCleanup=fn;}}),rewind:rewindNow,resetPreferences:()=>resetGamePreferences(current,showGameMenu),link:showLink,states:()=>showStates(),newState:()=>confirmStateSave(),quickLoad:showQuickLoad,saveData:showSaveData,cheats:showCheats,skins:()=>showSkins(current.system,current),controllers:()=>{showControllers();dialogResume=true;},
  screenshot:captureScreenshot,
  fullscreen:async()=>{if(document.fullscreenElement)await document.exitFullscreen();else if($('#player').requestFullscreen)await $('#player').requestFullscreen();else toast(tr('Safariでは共有メニューからホーム画面に追加すると全画面で開けます。'));},restart:confirmRestart,exit:exitGame};
 bindSettings($('#sheet-body'));bindActions($('#sheet-body'),handlers);menuTools(shortcuts,handlers);
}
function confirmRestart(){
 sheet(tr('再起動しますか？'),tr('<p class="sheet-note">ゲーム内セーブから起動します。現在の状態も自動保存に残します。</p><div class="sheet-actions"><button class="secondary" id="cancel-restart">キャンセル</button><button class="primary" id="confirm-restart">再起動</button></div>'),true,{confirmation:true});
 $('#cancel-restart').onclick=showGameMenu;$('#confirm-restart').onclick=async()=>{const button=$('#confirm-restart');button.disabled=true;try{await persist({checkpoint:true,reason:'before-restart'});await rewindSession.clear();await engine.reset();closeSheet();}catch(e){error(e);button.disabled=false;}};
}
function showStates(...args){return guardUpdateTask(()=>stateDialogs.showStates(...args))();}
function confirmStateSave(...args){if(launching||exiting)return;return stateDialogs.confirmStateSave(...args);}
function showQuickLoad(){if(launching||exiting)return;return stateDialogs.showQuickLoad();}
function chooseSaveImport(game){saveImportTarget=game;$('#save-input').click();}
function applyGameSave(game,input,{history=false}={}){return guardUpdateTask(async()=>{
 if(applyingSave||launching||exiting||importing||rewindSession.busy)throw Error(tr('処理が完了してからやり直してください。'));
 if(link||linkStarting||linkSaveBlocked)throw Error(tr('通信を終了してからやり直してください。'));
 if(!game?.id)throw Error(tr('ゲームが見つかりません。'));
 const core=coreFor(game),activeCore=engine;
 if(!(input instanceof Uint8Array)||!input.length||input.length>core.maxSave)throw Error(tr('セーブファイルのサイズを確認してください。'));
 if(core.adapter!=='jgenesis'&&new TextDecoder().decode(input.subarray(0,8))==='LPJGSV01')throw Error(tr('このセーブはjgenesis用です。コアを変更してから読み込んでください。'));
 if(activeCore&&current?.id!==game.id)throw Error(tr('プレイ中のゲームを終了してから読み込んでください。'));
 if(activeCore&&coreFor(current).id!==core.id)throw Error(tr('コア設定が変更されました。ゲームを開き直してください。'));
 // Both file imports and in-app conversions use the core's restore validation
 // and the same atomic save/backup/recovery invalidation transaction.
 const bytes=input.slice(),controls=[$('#close-sheet'),...$('#sheet-body').querySelectorAll('button,input,select')],disabled=controls.map(control=>control.disabled);
 let temporaryCore,temporaryProtection;applyingSave=true;controls.forEach(control=>control.disabled=true);
 try{
  if(activeCore){
   setPause(true);await persist({reason:history?'before-restore':'before-import'});await rewindSession.clear();
   await applyPausedSave(activeCore,bytes,()=>persist({reason:history?'backup-restore':'import',resetRecovery:true,checkpoint:history}));
  }else{
   temporaryProtection=new SaveProtection(()=>{},{useWorker:false});await temporaryProtection.open(game,core.id);
   const rom=await db.get('roms',game.id);if(!rom)throw Error(tr('ROMが見つかりません。'));
   temporaryCore=createCore(document.createElement('div'),game);
   await temporaryCore.load(rom,game);temporaryCore.pause(true);await temporaryCore.restore(bytes);
   await temporaryProtection.save(temporaryCore,{clean:true,reason:'import',resetRecovery:true});
  }
 }catch(error){
  if(activeCore&&error.saveImportUnsafe){
   // No further capture may run against a core whose rollback failed. Use the
   // existing teardown/retry path, retaining the previously committed save.
   if(error.saveImportRecoveryError)diagnostics.record(error.saveImportRecoveryError,'save');
   exitStage={core:activeCore,coreClosed:false};dialogResume=false;clearImportedSkin();
  }
  throw error;
 }finally{
  try{try{await temporaryCore?.close();}finally{await temporaryProtection?.close();}}
  finally{applyingSave=false;controls.forEach((control,index)=>control.disabled=disabled[index]);}
  if(activeCore&&exitStage?.core===activeCore){
   try{await captureControls.stop('exit');await rewindSession.dispose();await exitGame();}catch(exitError){error(exitError);showExitRetry();}
  }
 }
 if(activeCore){if(!history){closeSheet({dismiss:true});toast(tr('セーブを読み込みました。ゲームを再起動します。'));}}
 else{showDetails(game);toast(tr('セーブデータをインポートしました。'));}
})();}
$('#save-input').onchange=guardUpdateTask(async e=>{
 const file=e.target.files[0],game=saveImportTarget||current;saveImportTarget=null;if(!file||!game)return;
 try{
  const core=coreFor(game),extension=file.name.split('.').pop().toLowerCase();
  if(extension==='jgsav'&&core.adapter!=='jgenesis')throw Error(tr('このセーブはjgenesis用です。コアを変更してから読み込んでください。'));
  const extensions=game.system==='3ds'?['lp3sav']:core.adapter==='jgenesis'?['sav','srm','jgsav']:game.system==='nds'?['sav','srm','dsv']:['sav','srm'];
  if(!extensions.includes(extension))throw Error(tr`対応するセーブファイルを選択してください（${extensions.map(value=>'.'+value).join(' / ')}）。`);
  if(!file.size||file.size>core.maxSave+(game.system==='nds'?122:0))throw Error(tr('セーブファイルのサイズを確認してください。'));
  let bytes=new Uint8Array(await file.arrayBuffer());if(game.system==='nds')bytes=normalizeNDSSave(bytes,{requireDSV:extension==='dsv',maxBytes:core.maxSave});
  await applyGameSave(game,bytes);
 }catch(errorValue){error(errorValue);}finally{e.target.value='';}
});
function showExitRetry(){
 sheet(tr('ゲームを終了できませんでした。'),tr('<p class="sheet-note">もう一度終了してください。</p><div class="sheet-actions"><button class="primary" data-action="exit">終了</button></div>'));
 bindActions($('#sheet-body'),{exit:exitGame});
}
async function exitGame(){
 if(launching||linkStarting||exiting||applyingSave)return;exiting=true;
 try{
  if(!exitStage){
   await captureControls.stop('exit');const wasLinked=!!link;await link?.close();if(!engine)return;
   setPause(true);await rewindSession.dispose();await preferences.flush();
   // A failed save keeps the running core available for export/retry. Only a
   // successful final save may advance to irreversible resource teardown.
   await persist({checkpoint:settings.recovery&&!wasLinked,clean:true,reason:'exit'});
   if(current&&!current.cover){try{const cover=await coverThumbnail(engine.screenshot()),updated=await db.setGameCover(current.id,{cover,coverSource:'screenshot'},{onlyMissing:true});if(updated)Object.assign(current,updated,{playDuration:current.playDuration});}catch(e){console.warn('Cover image could not be stored:',e.name);}}
   if(current)await db.setGameDetails(current.id,{playDuration:current.playDuration||0});
   exitStage={core:engine,coreClosed:false};dialogResume=false;clearImportedSkin();
  }
  // Protection.close may retain a fenced writer/lock after failure. Retrying
  // it must not capture from a core that has already been destroyed.
  if(!exitStage.coreClosed){
   try{await exitStage.core.close();exitStage.coreClosed=true;}
   catch(e){exitStage.coreClosed=!!exitStage.core.closed;throw e;}
  }
  await protection.close();
  $('#sheet').close();disposeSheet();releaseSkin();engine=null;current=null;exitStage=null;paused=false;settingsGame=null;linkPanel.reset();screenshotPreview.clear();captureControls.leaveGame();updateLinkButton();linkMessage='';linkSaveBlocked=false;skinPair=null;pressed.clear();$('#screen').replaceChildren();$('#player').hidden=true;
  if(document.fullscreenElement)await document.exitFullscreen();await refresh();
 }finally{exiting=false;if(exitStage)showExitRetry();syncResume();syncRuntime();}
}
function download(bytes,name){return exportFile(bytes,name);}
download.close=()=>exportFile.close();
function updateSpeedButton(){
 const speed=link?1:settings.speed,button=$('#boost');
 button.querySelector('span').textContent=speed+'×';button.disabled=!!link;button.classList.toggle('fast',speed>1);
 button.setAttribute('aria-label',link?tr('通信中は1倍速'):tr`速度 ${speed}倍。押すと${speed%5+1}倍`);button.title=link?tr('通信中は1倍速'):tr('速度切替（1〜5倍） / Tab');
}
async function rewindNow(){const restored=await rewindSession.rewind();if(restored&&$('#sheet').open)closeSheet();return restored;}
function skinAction(command){
 if(launching||exiting||rewindSession.busy)return;
 if(link||linkStarting){if(command==='menu')showGameMenu();else toast(tr('通信中はこの操作を使えません。'));return;}
 if(/^fastForward(?:[234]x)?$/.test(command)){engine.setSpeed(Number(command.match(/[234]/)?.[0]||5));return()=>engine?.setSpeed(settings.speed);}
 const actions={menu:showGameMenu,rewind:rewindNow,quickSave:()=>{setPause(true);confirmStateSave(true);},quickLoad:showQuickLoad,toggleFastForward:cycleSpeed,
  saveStates:()=>{setPause(true);showStates();},skins:()=>{setPause(true);showSkins(current.system,current);},
  cheatCodes:()=>{if(coreFor(current).cheats){setPause(true);showCheats();}else toast(tr('このコアではチートを使えません。'));},
  filters:()=>{setPause(true);showVideoSettings();dialogResume=true;},resolution:()=>{setPause(true);showVideoSettings();dialogResume=true;},
  controllers:()=>{setPause(true);showControllers();dialogResume=true;},
  volume:()=>{settings.muted=!settings.muted;applySettings();},haptics:()=>{if(!supportsHaptics()){toast(tr('このブラウザは振動に対応していません。'));return;}settings.haptics=!settings.haptics;applySettings();if(settings.haptics)tapHaptic(settings);else stopHaptics();toast(settings.haptics?tr('振動：オン'):tr('振動：オフ'));},
  reverseScreens:()=>{if(!dualScreen(current.system)){toast(tr('2画面のゲームで使えます。'));return;}settings.ndsSwapScreens=!settings.ndsSwapScreens;applySettings();layoutSkin();},
  toggleControlls:()=>{settings.touchControls=!settings.touchControls;applySettings();layoutSkin();},restart:()=>{setPause(true);confirmRestart();},quit:()=>{setPause(true);sheet(tr('ゲームを終了しますか？'),tr('<div class="sheet-actions"><button class="secondary" id="skin-stay">キャンセル</button><button class="primary" id="skin-exit">終了</button></div>'),true);$('#skin-stay').onclick=closeSheet;$('#skin-exit').onclick=()=>exitGame().catch(error);},
  screenshot:captureScreenshot
 };
 const handler=actions[command];if(!handler){toast(tr('このスキンの操作はWeb版では使えません。'));return;}
 try{Promise.resolve(handler()).catch(error);}catch(e){error(e);}
}
function cycleSpeed(){if(!engine||paused||launching||exiting||link||linkStarting||rewindSession.busy)return;settings.speed=settings.speed%5+1;applySettings();}
const screenshotPreview=createScreenshotPreview({host:$('#player'),onInteract:release,toast,error});
const captureControls=createCaptureControls({button:$('#player-camera'),host:$('#player'),getState:()=>({core:engine,name:current?.name,playing:!!engine&&!paused&&!launching&&!exiting&&!rewindSession.busy}),capture:captureScreenshot,onInteract:()=>{release();screenshotPreview.hide();},onReview:()=>{if(engine&&!paused)setPause(true);},error,onChange:()=>autoUpdates?.refresh()});
function captureScreenshot(){if(!engine||!current||launching||exiting||rewindSession.busy)return;try{screenshotPreview.show(engine.screenshot(),current.name);if($('#sheet').open)closeSheet({dismiss:true});}catch(e){error(e);}}
function beginCameraMove(){
 const placement=cameraPlacement,button=$('#player-camera');
 if(!placement||placement.game!==current||captureControls.active||!engine||paused||launching||exiting||rewindSession.busy||$('#sheet').open)return null;
 const previous=button.style.cssText,{map,frame,ratio,game,orientation}=placement;let position={x:frame.x,y:frame.y};
 const valid=()=>cameraPlacement===placement&&current===game&&!paused&&!launching&&!exiting&&!rewindSession.busy;
 const cancel=()=>{if(cameraPlacement===placement)button.style.cssText=previous;};
 return {
  update(dx,dy){if(!valid())return;position={x:clamp(frame.x+dx/ratio,0,map.width-frame.width),y:clamp(frame.y+dy/ratio,0,map.height-frame.height)};button.style.left=placement.left+position.x*ratio+'px';button.style.top=placement.top+position.y*ratio+'px';},
  cancel,
  async commit(){
   if(!valid()){cancel();return;}if(Math.abs(position.x-frame.x)<.01&&Math.abs(position.y-frame.y)<.01){cancel();return;}
   try{
    const layout=await db.setGameCameraPosition(game.id,orientation,normalizedPosition(frame,map,position.x,position.y),structuredClone(settings.controlLayouts?.[game.system]||{}));
    if(current===game)game.controlLayout=layout;
    if(cameraPlacement===placement){placement.frame={...frame,...position};toast(tr('レイアウトを保存しました。'));}
   }catch(e){cancel();error(e);}
  }
 };
}
cameraBinding=bindCameraButton($('#player-camera'),event=>captureControls.activate(event),{beginMove:beginCameraMove});
$('#boost').onclick=cycleSpeed;
$('#boost').onkeydown=e=>{if(e.code==='Enter'||e.code==='Space'){e.preventDefault();e.stopPropagation();if(!e.repeat)cycleSpeed();}};
let fpsEngine=null,fpsAt=0,fpsFrames=0;
setInterval(()=>{const now=performance.now(),frames=engine?.frameCount?.()||0;if(!engine||paused||engine!==fpsEngine){fpsEngine=engine;fpsAt=now;fpsFrames=frames;$('#fps-meter').textContent=paused?tr('一時停止'):tr('計測中…');return;}if(now-fpsAt>=1000){const fps=Math.max(0,(frames-fpsFrames)*1000/(now-fpsAt));$('#fps-meter').textContent=$('#player').dataset.builtin==='true'?`${fps.toFixed(1)} fps · ${link?1:settings.speed}×`:tr`処理 ${fps.toFixed(1)} fps · ${link?1:settings.speed}倍`;fpsAt=now;fpsFrames=frames;}},250);
async function showOffline(){
 sheet(tr('オフラインで使う'),tr`<p class="sheet-note">追加済みのゲームと現在の設定に必要なファイルを保存します。</p><p class="sheet-note" id="offline-status" role="status">保存状態を確認しています…</p><button class="primary wide-button" id="offline-download" disabled>オフライン用に準備</button><details class="sheet-note"><summary>詳細</summary><p>コア・スキン・画面サイズを変えた場合は、もう一度準備してください。</p><button class="text-button wide-button" id="offline-all">すべてのファイルを保存</button></details>`);
 const button=$('#offline-download'),status=$('#offline-status'),all=$('#offline-all');let revision=0,timer,busy=false,ready=false;
 const plan=()=>offlineGamePlan(library,preferences.global,{...playerSize(),screenWidth:screen.width,screenHeight:screen.height});
 const update=result=>{if(!status.isConnected)return;ready=!!result.ready;status.textContent=ready?tr('現在のゲームと設定で、オフラインで遊べます。'):tr`あと${bytesLabel(result.missingBytes??result.bytes)}のダウンロードが必要です。`;button.textContent=ready?tr('完了'):tr('オフライン用に準備');button.disabled=false;};
 const check=async()=>{const token=++revision;ready=false;button.textContent=tr('オフライン用に準備');button.disabled=true;try{if(!library.some(game=>!game.romMissing)){status.textContent=tr('先にゲームを追加してください。');return;}const selection=await plan(),result=await offlineStatus(false,()=>{},selection);if(token===revision&&!busy)update(result);}catch(e){if(token===revision&&status.isConnected){status.textContent=e.message;button.disabled=false;}}};
 const resized=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!busy)void check();},150);};window.addEventListener('resize',resized);sheetCleanup=()=>{revision++;clearTimeout(timer);window.removeEventListener('resize',resized);};
 const prepare=everything=>guardUpdateTask(async()=>{
  if(busy)return;busy=true;ready=false;revision++;button.textContent=tr('オフライン用に準備');button.disabled=all.disabled=true;
  try{const selection=everything?undefined:await plan();const result=await offlineStatus(true,p=>{if(status.isConnected)status.textContent=tr`保存中… ${p.progress} / ${p.total}`;},selection);update(result);if(everything&&result.ready&&status.isConnected)status.textContent=tr('すべてのファイルを保存しました。');}
  catch(e){if(status.isConnected){status.textContent=e.message;button.disabled=false;}}
  finally{busy=false;all.disabled=false;}
 });
 const download=prepare(false);button.onclick=()=>{if(busy)return;if(ready)closeSheet();else return download();};all.onclick=prepare(true);await check();
}

async function applyCheats(next,game=current){const old=cheatsFor(game),live=current?.id===game.id?engine:null;try{if(live)await rewindSession.clear();live?.setCheats(next);const updated=await db.setGameCheats(game.id,coreFor(game).key,next);for(const key of ['cheats','coreCheats']){if(Object.hasOwn(updated,key))game[key]=updated[key];else delete game[key];}}catch(e){live?.setCheats(old);throw e;}}
function showCheats(game=current){if(!coreFor(game).cheats)return;const list=cheatsFor(game),mgba=coreFor(game).adapter==='mgba';const formats=game.system==='gba'?[[0,tr('自動判定')],[1,'CodeBreaker'],[2,'GameShark'],[3,'Action Replay'],[4,tr('VBA（アドレス:値）')]]:[[0,tr('自動判定')],[1,'GameShark'],[2,'Game Genie'],[3,tr('VBA（アドレス:値）')]];
 sheet(tr('チート'),tr`<p class="sheet-note">ゲームのバージョンに合うコードを入力してください。使用前にセーブを書き出しておきましょう。</p><div class="settings-group">${list.map((c,i)=>tr`<div class="row"><label class="cheat-toggle"><input type="checkbox" data-cheat-toggle="${i}" ${c.enabled?'checked':''}> ${esc(c.name)}</label><button class="danger" data-cheat-delete="${i}">削除</button></div>`).join('')}</div><div class="label">追加</div><div class="stack"><input class="text-input" id="cheat-name" aria-label="チート名" maxlength="100" placeholder="名前"><select class="text-input" id="cheat-type" aria-label="コード形式">${(mgba?formats:[[0,tr('コアのコード形式')]]).map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select><textarea class="text-input" id="cheat-code" aria-label="チートコード" rows="5" maxlength="16384" placeholder="コードを1行ずつ入力"></textarea><button class="primary" id="cheat-add">有効にして追加</button></div>${mgba?'':tr('<p class="sheet-note">追加したコードが効いているかは、ゲーム内で確認してください。</p>')}`,true);
 $$('[data-cheat-toggle]').forEach(b=>b.onchange=async()=>{try{await applyCheats(list.map((c,i)=>i===+b.dataset.cheatToggle?{...c,enabled:b.checked}:c),game);showCheats(game);}catch(e){b.checked=!b.checked;error(e);}});
 $$('[data-cheat-delete]').forEach(b=>b.onclick=async()=>{try{await applyCheats(list.filter((_,i)=>i!==+b.dataset.cheatDelete),game);showCheats(game);}catch(e){error(e);}});
 $('#cheat-add').onclick=async()=>{const button=$('#cheat-add'),code=$('#cheat-code').value.trim();if(!code){toast(tr('コードを入力してください。'));return;}if(list.length>=100){toast(tr('チートは100件までです。'));return;}button.disabled=true;try{await applyCheats([...list,{name:$('#cheat-name').value.trim()||tr`チート ${list.length+1}`,code,type:Number($('#cheat-type').value),enabled:true}],game);showCheats(game);toast(tr('チートを追加しました。'));}catch(e){error(e);button.disabled=false;}};
}
function showConnectedMenu(){release();sheet('MENU',tr`<p class="sheet-note">通信中は1倍速です。ステート・チートの変更はできません。</p><div class="settings-group">${action(tr('ゲームに戻る'),'play','play')}${action(tr('通信の状態'),'link','wifi')}${action(tr('通信を中止'),'disconnect','back')}${action(tr('ライブラリに戻る'),'exit','back')}</div>`,true);bindActions($('#sheet-body'),{play:closeSheet,link:showLink,disconnect:async()=>{await link?.close();closeSheet();},exit:exitGame});}
function updateLinkButton(){
 const button=$('#player-link'),state=linkStarting?'connecting':link?.closed?'connecting':link?.connected?'connected':link?.joined?'waiting':link?'connecting':'idle';
 button.hidden=!engine||!linkModes(current).length;button.dataset.state=state;
 const label=current?.system!=='gba'?(state==='connected'?tr('GB・GBC通信：接続中'):state==='connecting'?tr('GB・GBC通信：準備中'):tr('GB・GBC通信')):state==='connected'?tr('GBA通信：接続中'):state==='waiting'?tr`GBA通信：部屋 ${link.room} で待機中`:state==='connecting'?tr('GBA通信：準備中'):tr('GBA通信');
 button.setAttribute('aria-label',label);button.title=label;
}
function showLink(){
 if(launching||rewindSession.busy)return;
 if(!engine||!linkModes(current).length||exiting)return;
 if($('#sheet').open)closeSheet();release();renderLinkPanel();linkPanel.show();
}
function renderLinkPanel(){linkControls.render();}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(settings.theme==='auto')applySettings();});
setupOffline().catch(e=>console.warn('Offline setup:',e.message));
const resumeRequestedLaunch=guardUpdateTask(async()=>{
 const request=launchContinuation.take();if(!request)return false;
 try{const game=await db.get('library',request.id);if(game&&!game.romMissing)await launch(game,request);else if(game)showDetails(game);else toast(tr('このブラウザにゲームがありません。先にROMを追加してください。'));}catch(e){error(e);}
 return true;
});
function openGameLink(){if(engine||!location.hash.startsWith('#game='))return;const game=library.find(g=>g.id===location.hash.slice(6));if(game)showDetails(game);else toast(tr('このブラウザにゲームがありません。先にROMを追加してください。'));}
window.addEventListener('hashchange',()=>{if(engine||!appReady)return;tab=tabFromHash();render();openGameLink();});
if((autoUpdates=await startAutoUpdates(()=>appReady&&!captureControls.pending&&!libraryView.selecting&&!engine&&!launching&&!importing&&!exiting&&!link&&!linkStarting&&!saveLock&&(tab!=='imports'||launchContinuation.pending),()=>{updateCompleted=true;},detail=>diagnostics.record(detail,'update'),{beforeReload:()=>launchContinuation.preserve(),onContinue:resumeRequestedLaunch}))!==false){
 applySettings();refresh().then(async()=>{dragDepth=0;document.body.classList.remove('drop-active');await preferences.flush();launchContinuation.restore();await releaseNotice.start({updated:updateCompleted,existing:library.length>0});await finishStartupInputs({onTab:id=>{launchContinuation.clear();setTab(id);render();},onFiles:guardUpdateTask(files=>{launchContinuation.clear();return importFiles(files);})});appReady=true;if(!await resumeRequestedLaunch())openGameLink();autoUpdates?.refresh();startUpdates.listen();}).catch(e=>{error(e);$('#content').innerHTML=tr('<div class="empty-library"><h2>保存データを開けませんでした</h2><p>プライベートブラウズを終了するか、ブラウザの保存設定を確認してください。</p></div>');});
}
