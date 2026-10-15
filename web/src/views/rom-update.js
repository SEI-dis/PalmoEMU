// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
import {escapeHTML as esc,detectSystem,bytesLabel} from '../shared.js';
import {coreRegistry,coreFor} from '../core/core-registry.js';
import {importROM} from '../library/rom-import.js';
import {prepareROMUpdate,readROMUpdateBackup} from '../library/rom-update.js';
import {guardUpdateTask} from '../updates/update-activity.js';
import * as db from '../storage/storage.js';
import {createStartSaveDialog} from './start-save-migrate.js';
import {isStartName} from '../start-save/version.js';

export function createROMUpdateDialog(api){
 const startDialog=createStartSaveDialog(api);
 const $=s=>document.querySelector(s);
 let busy=false;
 const bind=(selector,action)=>$(selector).onclick=guardUpdateTask(async()=>{if(busy)return;try{await action();}catch(e){api.error(e);}});
 async function work(action){
  if(busy)return;busy=true;$('#close-sheet').disabled=true;
  const buttons=[...$('#sheet-body').querySelectorAll('button,input')],disabled=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);
  try{return await action();}finally{busy=false;$('#close-sheet').disabled=false;buttons.forEach((b,i)=>b.disabled=disabled[i]);}
 }
 function open(game,{reattach=false,onBack=()=>api.showGame(game)}={}){
  const title=reattach?tr('ROMを追加'):tr('ROMを更新');
  api.sheet(title,tr`<p class="sheet-note">${reattach?tr('取り外したものと同じROMを選ぶと、残してあるセーブから遊べます。'):tr('新版のROMへゲーム内セーブをコピーします。旧ROM・旧セーブ・ステートは残ります。')}</p><button id="rom-update-choose" class="primary wide-button">ファイルを選択</button><input id="rom-update-file" type="file" hidden><p id="rom-update-status" class="sheet-note" role="status"></p><button id="rom-update-back" class="secondary wide-button">戻る</button>`);
  if(!reattach&&game.system==='gba'&&isStartName(game.filename,game.name)&&api.showStartUpdates){
   const button=document.createElement('button');button.id='rom-update-news';button.className='secondary wide-button';button.textContent=tr('PokemonStartの更新を確認');
   $('#rom-update-choose').before(button);button.onclick=()=>api.showStartUpdates(game,{onBack:()=>open(game,{onBack})});
  }
  if(!reattach&&game.system==='gba'&&coreFor(game).key==='mgba'){
   const button=document.createElement('button');button.id='rom-update-start';button.className='secondary wide-button';button.textContent=tr('PokemonStartのセーブを変換');
   const details=document.createElement('details'),summary=document.createElement('summary');details.className='sheet-note';summary.textContent=tr('詳細');details.append(summary,button);$('#rom-update-back').before(details);
   button.onclick=guardUpdateTask(()=>startDialog.open(game,{onBack:()=>open(game,{onBack}),target:game.romUpdate?game:undefined}));
  }
  bind('#rom-update-back',onBack);bind('#rom-update-choose',()=>$('#rom-update-file').click());
  $('#rom-update-file').onchange=guardUpdateTask(async event=>{
   const input=event.currentTarget,file=input.files?.[0];input.value='';if(!file||busy)return;
   try{
    const system=detectSystem(file.name),core=coreFor(game);
    if(system!==game.system)throw Error(tr('元のゲームと同じ機種のROMを選んでください。'));
    if(!file.size||file.size>core.maxRom)throw Error(tr('このROM容量には対応していません。'));
    $('#rom-update-status').textContent=tr('ROMを確認中…');
    if(reattach){
     await work(async()=>{await importROM(file,system,null,{expectedId:game.id});await api.refresh();api.showGame(await db.get('library',game.id));api.toast(tr('ROMを追加しました。'));});return;
    }
    let plan,target,startROM,existing;await work(async()=>{
     const inspected=await importROM(file,system,null,{inspectOnly:true});({game:target,startROM}=inspected);
     if(!startROM&&system==='gba'&&isStartName(game.filename,game.name,target.filename,target.name))startROM={version:null,unverified:true};
     existing=await db.get('library',target.id);
     if(!(startROM&&core.key==='mgba'&&existing&&(target.id!==game.id||game.romUpdate)))plan=await prepareROMUpdate(game.id,target);
    });
    if(startROM&&core.key==='mgba'){
     if(existing&&coreFor(existing).key!=='mgba')throw Error(tr('この変換はGBAのPokemonStart用です。mGBAコアを選択してください。'));
     const same=target.id===game.id;
     await startDialog.open(game,{previous:same&&!!game.romUpdate,onBack:()=>open(game,{onBack}),target:existing,targetProfile:startROM,onCopy:same?undefined:async(inspected,compatible)=>{
      const copyPlan=await prepareROMUpdate(game.id,target);
      if(copyPlan.sourceHash!==inspected.hash||copyPlan.sourceAt!==inspected.at)throw Error(tr('元のセーブが変わりました。内容を確認してやり直してください。'));
      copyPlan.startCopy={from:inspected.version,allowUnverified:!compatible};
      confirm(game,file,target,copyPlan,onBack,compatible);
     },apply:existing?undefined:async(from,onProgress,options)=>{
      await importROM(file,system,onProgress,{updatePlan:{...plan,startMigration:{from,...options}}});await api.refresh();complete(await db.get('library',target.id));
     }});
    }else confirm(game,file,target,plan,onBack);
   }catch(e){if($('#rom-update-status'))$('#rom-update-status').textContent='';api.error(e);}
  });
 }
 function confirm(game,file,target,plan,onBack,compatible=false){
  api.sheet(tr('セーブを引き継ぐ'),tr`<div class="settings-group"><p class="sheet-note">${esc(game.name)} → ${esc(target.name)}<br>${bytesLabel(target.size)}</p></div><p class="sheet-note">ゲーム内セーブとカバー画像を引き継ぎます。ステートは新版に使いません。</p><label class="row"><input type="checkbox" id="rom-update-compatible"><span>ゲーム作者の案内でセーブの互換性を確認しました</span></label><p class="sheet-note">旧版は削除しません。新版で保存した内容は旧版へ戻せません。</p><p class="sheet-note" id="rom-update-status" role="status"></p><div class="sheet-actions"><button id="rom-update-back" class="secondary">戻る</button><button id="rom-update-confirm" class="primary" disabled>引き継ぐ</button></div>`);
  if(compatible){$('#rom-update-compatible').checked=true;$('#rom-update-compatible').closest('label').hidden=true;$('#rom-update-status').textContent=tr('このセーブは変換せずに引き継げます。');$('#rom-update-confirm').disabled=false;}
  $('#rom-update-compatible').onchange=()=>$('#rom-update-confirm').disabled=!$('#rom-update-compatible').checked;
  bind('#rom-update-back',()=>open(game,{onBack}));
  bind('#rom-update-confirm',async()=>{
   if(!$('#rom-update-compatible').checked)return;
   $('#rom-update-status').textContent=tr('セーブをコピー中…');
   try{await work(async()=>{await importROM(file,target.system,null,{updatePlan:plan});await api.refresh();complete(await db.get('library',target.id));});}
   catch(e){$('#rom-update-status').textContent='';throw e;}
  });
 }
 function complete(game){
  api.sheet(tr('引き継ぎが完了しました'),tr`<p class="sheet-note">新版を起動し、ゲーム内の「つづきから」で確認してください。旧版はライブラリに残っています。</p><button id="rom-update-play" class="primary wide-button">新版をプレイ</button><button id="rom-update-back" class="secondary wide-button">ゲーム詳細へ</button>`);
  bind('#rom-update-play',()=>{api.closeSheet({dismiss:true});return api.launch(game,{skipRecovery:true});});bind('#rom-update-back',()=>api.showGame(game));
 }
 function detach(game){
  api.sheet(tr('ROMだけ取り外す'),tr`<p class="sheet-note">「${esc(game.name)}」のROMだけを取り外します。セーブ・ステート・設定は残ります。同じROMを追加し直すと再開できます。</p><div class="sheet-actions"><button id="rom-update-back" class="secondary">キャンセル</button><button id="rom-detach-confirm" class="secondary danger">取り外す</button></div>`);
  bind('#rom-update-back',()=>api.showGame(game));bind('#rom-detach-confirm',()=>work(async()=>{const fresh=await db.detachROM(game.id);await api.refresh();api.showGame(fresh);}));
 }
 async function previous(game){
  const old=await db.get('library',game.romUpdate?.previousId);if(!old)throw Error(tr('旧版はライブラリにありません。更新前のセーブは書き出せます。'));api.showGame(old);
 }
 async function exportPrevious(game){
  const record=await readROMUpdateBackup(game),core=coreRegistry[record.system]?.find(c=>c.key===record.coreKey);
  api.download(record.save.bytes,record.sourceName+'.'+(core?.saveExtension||'sav'));
 }
 return {open,detach,previous,exportPrevious};
}
