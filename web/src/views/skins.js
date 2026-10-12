/* SkinSettingsView / FlexSkinSettingViewController Web port.
   Copyright © 2025–2026 Manic EMU. Created by Daiuno. Modified 2026-10-09.
   See sources/manicemu-ui/README.md. */
// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
import {guardUpdateTask} from '../update-activity.js';
import * as db from '../storage.js';
import {systems,escapeHTML as esc,icon} from '../shared.js';
import {row} from '../components/rows.js';
import {builtins,importSkin,previewSkin,skinSupportsSystem} from '../skins.js';
import {skinChoice,withSkinChoice,withoutSkinChoice} from '../skin-selection.js';
import {bundledSkins} from '../bundled-skins.js';
import {builtinColors} from '../skin-profiles.js';
import {mountSkinPreview} from '../skin-preview.js';
import {mountControlEditor} from '../control-editor.js';
export function createSkinSettings(api){
 const {runtime,settings,setPause,sheet,applySettings,layoutSkin,reloadSkins,refresh,toast,error,controlLayout,playerSize,frameStyle}=api;
 const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
 let skinOrientation='portrait';
async function editControls(system,game,id){
 if(runtime.engine)setPause(true);
 const preview=await previewSkin(system,id);
 if(!preview.skin.id.startsWith('builtin:')){preview.urls.forEach(URL.revokeObjectURL);return;}
 sheet(tr('レイアウトを編集'),'',!!runtime.engine);$('#sheet').classList.add('control-edit');
 const cleanup=mountControlEditor($('#sheet-body'),{skin:preview.skin,layout:controlLayout(system,game),shared:settings.controlLayouts?.[system],inherits:game?.controlLayout==null,game:!!game,orientation:skinOrientation,viewport:playerSize,
  onCancel:()=>showSkins(system,game),
  onSave:async layout=>{
   if(game){await db.setGameControls(game.id,layout);game.controlLayout=layout??undefined;}
   else{const next={...settings,controlLayouts:{...settings.controlLayouts,[system]:layout}};localStorage.setItem('manic-settings',JSON.stringify(next));Object.assign(settings,next);}
   if(runtime.current){runtime.current.controlLayout=(await db.get('library',runtime.current.id))?.controlLayout;layoutSkin();}
   await refresh();await showSkins(system,game);toast(tr('レイアウトを保存しました。'));
  }
 });
 runtime.cleanup=()=>{cleanup();$('#sheet').classList.remove('control-edit');preview.urls.forEach(URL.revokeObjectURL);};
}
async function showSkins(system=settings.skinSystem||'gba',game=null,orientation=skinOrientation){
 skinOrientation=orientation==='landscape'?'landscape':'portrait';
 if(!systems[system])system='gba';
 if(game){const record=await db.get('library',game.id);if(!record)throw new Error(tr('ゲームが見つかりません。'));game.skinId=record.skinId;game.controlLayout=record.controlLayout;system=game.system;}
 else if(settings.skinSystem!==system){settings.skinSystem=system;applySettings();}
 const saved=(await db.skinCatalog()).filter(s=>skinSupportsSystem(s.system,system)).sort((a,b)=>(a.importedAt||0)-(b.importedAt||0)||a.name.localeCompare(b.name));
 const bundled=bundledSkins.filter(s=>s.system===system);
 const colors=builtinColors(system);
 const choices=[...builtins.map(([id,name])=>({id:'builtin:'+id,name})),...bundled,...saved];
 const valid=(value,fallback='')=>choices.some(s=>s.id===value)?value:fallback;
 let shared,selected,effective;
 function readSelection(){shared=valid(skinChoice(settings.skins?.[system],skinOrientation),'builtin:classic');selected=game?valid(skinChoice(game.skinId,skinOrientation)):shared;effective=selected||shared;}
 readSelection();
 let standardId=effective.startsWith('builtin:')?effective:shared.startsWith('builtin:')?shared:'builtin:classic',editing=false,alive=true,busy=false;
 const mounted=new Map(),pending=new Set(),zoomCleanups=new Set();
 const syncCurrent=async()=>{const live=runtime.current;if(live){const stored=await db.get('library',live.id);if(runtime.current===live){live.skinId=stored?.skinId;await reloadSkins();}}};
 const card=(id,name)=>tr`<article class="skin-card" data-skin-card="${esc(id)}"><button class="skin-use" data-skin-choice="${esc(id)}" aria-label="${esc(name)}を使う" aria-pressed="false"><span class="skin-card-preview" role="img"></span><span class="skin-current" aria-hidden="true"></span></button><button class="skin-preview-open" data-preview-skin="${esc(id)}" aria-label="${esc(name)}をプレビュー">${icon('expand')}<span>プレビュー</span></button><p class="skin-card-name">${esc(name)}</p>${id.startsWith('skin:')?tr`<button class="skin-delete danger" data-delete-skin="${esc(id)}" aria-label="${esc(name)}を削除" hidden>${icon('trash')}<span>削除</span></button>`:''}</article>`;
 sheet(tr('スキン'),tr`${game?tr`<p class="sheet-note skin-target">${esc(game.name)}</p><label class="row skin-inherit"><span id="skin-inherit-label">機種の設定を使う</span><input type="checkbox" id="skin-inherit" ${!selected?'checked':''}></label>`:`<div class="settings-group">${row(tr('機種'),`<select id="skin-system">${Object.entries(systems).map(([k,s])=>`<option value="${k}" ${k===system?'selected':''}>${s.short}</option>`).join('')}</select>`,'game')}</div>`}<div class="segmented skin-orientation" role="group" aria-label="設定する画面の向き"><button data-skin-orientation="portrait">縦画面</button><button data-skin-orientation="landscape">横画面</button></div><p class="sheet-note" id="skin-orientation-label"></p><div id="skin-grid" class="skin-grid">${card(standardId,tr('標準'))}${[...bundled,...saved].map(s=>card(s.id,s.name)).join('')}<button id="import-skin" class="skin-add">${icon('plus')}<span>新規スキン追加</span></button></div><div class="skin-standard-options" hidden><div id="skin-palette" hidden><p class="label">標準スキンの色</p><div id="skin-colors" aria-label="標準スキンの色">${colors.map(([id,name])=>`<button data-skin-color="${id}" aria-label="${name}" title="${name}"><i class="swatch-${id}"></i></button>`).join('')}</div></div><button class="secondary" id="edit-controls">画面・ボタンのレイアウト</button></div>${bundled.length?tr('<p class="sheet-note"><a href="licenses.html#skins" target="_blank" rel="noopener">Manic EMU · CC BY 4.0 — スキンのクレジット</a></p>'):''}<details class="sheet-note skin-help"><summary>スキンについて</summary><p id="skin-description"></p><p>Delta／Manic形式に対応しています。スキンは端末内だけで使用します。作者の利用条件をご確認ください。</p><a class="row" href="https://faq.deltaemulator.com/using-delta/controller-skins" target="_blank" rel="noopener">Delta公式のスキン案内</a><a class="row" href="https://manicemu.site/guides/homemade-skins/#-official-skins-downloads" target="_blank" rel="noopener">Manic公式のスキン案内</a></details>`,!!runtime.engine);
 const grid=$('#skin-grid'),standard=grid.firstElementChild;
 $('#sheet').classList.add('skin-manager');
 $('#sheet-tools').innerHTML=tr`<button class="sheet-tool skin-edit-toggle" id="manage-skins" ${saved.length?'':'disabled'}>編集</button>`;
 const previewOptions=()=>({system,orientation:skinOrientation,viewport:playerSize,layout:controlLayout(system,game),frameStyle});
 function disposeCard(node){const entry=mounted.get(node);if(entry){entry.cleanup();entry.preview.urls.forEach(URL.revokeObjectURL);mounted.delete(node);}node.querySelector('.skin-card-preview').replaceChildren();}
 async function mountCard(node){
  if(!alive||mounted.has(node)||pending.has(node))return;
  const id=node.dataset.skinCard;pending.add(node);let preview;
  try{
   preview=await previewSkin(system,id);
   if(!alive||!node.isConnected||node.dataset.skinCard!==id){preview.urls.forEach(URL.revokeObjectURL);return;}
   const host=node.querySelector('.skin-card-preview'),entry={preview,cleanup:mountSkinPreview(host,preview.skin,previewOptions())};mounted.set(node,entry);
   if(id===effective)$('#skin-description').textContent=(preview.skin.warnings||[]).join('\n');
  }catch(e){preview?.urls.forEach(URL.revokeObjectURL);if(alive){const host=node.querySelector('.skin-card-preview');host.textContent=tr('プレビューを表示できません');host.setAttribute('aria-label',tr('プレビューを表示できません'));}}
  finally{pending.delete(node);if(alive&&node.dataset.skinCard!==id)mountCard(node);}
 }
 const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting)mountCard(entry.target);else disposeCard(entry.target);}},{root:$('#sheet'),rootMargin:'120px'});
 grid.querySelectorAll('.skin-card').forEach(node=>observer.observe(node));
 function updateSelection(){
  grid.dataset.selection=selected;grid.dataset.effective=effective;
  grid.querySelectorAll('.skin-card').forEach(node=>{const active=node.dataset.skinCard===effective;node.classList.toggle('is-current',active);node.querySelector('.skin-use').setAttribute('aria-pressed',String(active));const host=node.querySelector('.skin-card-preview');if(active)host.id='skin-preview';else host.removeAttribute('id');});
  $$('[data-skin-color]').forEach(b=>b.setAttribute('aria-pressed',String(effective==='builtin:'+b.dataset.skinColor)));
  const direction=skinOrientation==='portrait'?tr('縦画面'):tr('横画面');
  $('#skin-orientation-label').textContent=direction+tr('のスキン');
  if($('#skin-inherit')){$('#skin-inherit').checked=!selected;$('#skin-inherit-label').textContent=direction+tr('は機種の設定を使う');}
  const standardSelected=effective.startsWith('builtin:');
  $('.skin-standard-options').hidden=!standardSelected;
  $('#skin-palette').hidden=!standardSelected||colors.length<2;
  $('#edit-controls').hidden=!standardSelected;
  const entry=[...mounted.entries()].find(([node])=>node.dataset.skinCard===effective)?.[1];
  $('#skin-description').textContent=entry?(entry.preview.skin.warnings||[]).join('\n'):'';
 }
 function syncStandard(){
  const next=effective.startsWith('builtin:')?effective:shared.startsWith('builtin:')?shared:'builtin:classic';
  if(next===standardId)return;
  standardId=next;disposeCard(standard);standard.dataset.skinCard=standardId;standard.querySelector('.skin-use').dataset.skinChoice=standardId;standard.querySelector('[data-preview-skin]').dataset.previewSkin=standardId;mountCard(standard);
 }
 function refreshOrientation(){
  readSelection();syncStandard();updateSelection();
  $$('[data-skin-orientation]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.skinOrientation===skinOrientation)));
  grid.dataset.orientation=skinOrientation;
  for(const [node,entry] of mounted){entry.cleanup();entry.cleanup=mountSkinPreview(node.querySelector('.skin-card-preview'),entry.preview.skin,previewOptions());}
 }
 function enableControls(){
  if(!alive)return;
  grid.querySelectorAll('.skin-use,.skin-preview-open').forEach(b=>b.disabled=busy||editing);
  $$('[data-skin-color],#skin-inherit,#skin-system,#edit-controls,[data-skin-orientation]').forEach(b=>b.disabled=busy||editing);
  $('#manage-skins').disabled=busy||!saved.length;$('#import-skin').disabled=busy;
 }
 const apply=async(id,targetSystem=system,orientation=skinOrientation)=>{
  if(game){game.skinId=await db.setGameSkin(game.id,id,orientation);}
  else{const next={...settings,skins:{...settings.skins,[targetSystem]:withSkinChoice(settings.skins?.[targetSystem],orientation,id)}};localStorage.setItem('manic-settings',JSON.stringify(next));Object.assign(settings,next);applySettings();}
  await syncCurrent();await refresh();
 };
 const choose=async id=>{
  if(busy||editing)return;const orientation=skinOrientation;busy=true;enableControls();
  try{
   if(id.startsWith('bundled:'))await previewSkin(system,id);
   await apply(id,system,orientation);readSelection();if(alive)syncStandard();
   if(alive)updateSelection();
  }catch(e){error(e);}finally{busy=false;enableControls();}
 };
 grid.querySelectorAll('[data-skin-choice]').forEach(b=>b.onclick=guardUpdateTask(()=>choose(b.dataset.skinChoice)));
 $$('[data-skin-color]').forEach(b=>b.onclick=guardUpdateTask(()=>choose('builtin:'+b.dataset.skinColor)));
 if($('#skin-inherit'))$('#skin-inherit').onchange=guardUpdateTask(e=>choose(e.target.checked?'':effective));
 if($('#skin-system'))$('#skin-system').onchange=guardUpdateTask(e=>showSkins(e.target.value).catch(error));
 $('#edit-controls').onclick=()=>editControls(system,game,effective).catch(error);
 $$('[data-skin-orientation]').forEach(b=>b.onclick=()=>{skinOrientation=b.dataset.skinOrientation;refreshOrientation();});
 $('#manage-skins').onclick=()=>{editing=!editing;grid.classList.toggle('is-editing',editing);$('#manage-skins').textContent=editing?tr('完了'):tr('編集');grid.querySelectorAll('[data-delete-skin]').forEach(b=>b.hidden=!editing);$('#import-skin').hidden=editing;enableControls();};
 async function openPreview(id){
  const preview=await previewSkin(system,id);if(!alive){preview.urls.forEach(URL.revokeObjectURL);return;}
  const zoom=document.createElement('dialog');zoom.className='skin-zoom';zoom.setAttribute('aria-label',preview.skin.name+tr('のプレビュー'));
  zoom.innerHTML=tr`<header><h2>${esc(preview.skin.name)}</h2><button class="circle" aria-label="プレビューを閉じる">${icon('close')}</button></header><div class="skin-zoom-art" role="img"></div>`;
  document.body.append(zoom);zoom.showModal();const unmount=mountSkinPreview(zoom.querySelector('.skin-zoom-art'),preview.skin,previewOptions());
  let closed=false;const close=()=>{if(closed)return;closed=true;unmount();preview.urls.forEach(URL.revokeObjectURL);zoom.close();zoom.remove();zoomCleanups.delete(close);};zoomCleanups.add(close);zoom.querySelector('button').onclick=close;zoom.addEventListener('cancel',e=>{e.preventDefault();close();});
 }
 grid.querySelectorAll('[data-preview-skin]').forEach(b=>b.onclick=()=>openPreview(b.dataset.previewSkin).catch(error));
 $('#import-skin').onclick=()=>{const orientation=skinOrientation;$('#skin-input').onchange=guardUpdateTask(async e=>{const file=e.target.files[0];if(!file)return;try{toast(tr('スキンを読み込み中…'));const skin=await importSkin(file,game?.system);await apply(skin.id,skin.system,orientation);await showSkins(game?.system||skin.system,game);toast(tr('スキンを追加しました。'));}catch(e){error(e);}finally{e.target.value='';}});$('#skin-input').click();};
 grid.querySelectorAll('[data-delete-skin]').forEach(b=>b.onclick=()=>{
  const id=b.dataset.deleteSkin,skin=saved.find(s=>s.id===id);
  sheet(tr('スキンを削除しますか？'),tr`<p class="sheet-note">${esc(skin.name)}</p><p class="sheet-note">このスキンを使っているゲームは、機種の設定に戻ります。ゲームやセーブは残ります。</p><div class="sheet-actions"><button class="secondary" id="cancel-skin-delete">キャンセル</button><button class="secondary danger" id="confirm-skin-delete">削除</button></div>`,!!runtime.engine);
  $('#cancel-skin-delete').onclick=()=>showSkins(system,game);
  $('#confirm-skin-delete').onclick=guardUpdateTask(async()=>{const button=$('#confirm-skin-delete');button.disabled=true;try{await db.removeSkin(id);for(const k of Object.keys(settings.skins||{})){const next=withoutSkinChoice(settings.skins[k],id);if(next)settings.skins[k]=next;else delete settings.skins[k];}applySettings();await syncCurrent();await refresh();await showSkins(system,game);}catch(e){error(e);if(button.isConnected)button.disabled=false;}});
 });
 runtime.cleanup=()=>{alive=false;observer.disconnect();for(const close of [...zoomCleanups])close();for(const node of [...mounted.keys()])disposeCard(node);$('#sheet').classList.remove('skin-manager');};
 updateSelection();refreshOrientation();enableControls();await mountCard(standard);
}
 return {showSkins};
}
