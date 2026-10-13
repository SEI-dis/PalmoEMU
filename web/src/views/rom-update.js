// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
import {escapeHTML as esc,detectSystem,bytesLabel} from '../shared.js';
import {coreRegistry,coreFor} from '../core-registry.js';
import {importROM} from '../rom-import.js';
import {prepareROMUpdate,readROMUpdateBackup} from '../rom-update.js';
import {guardUpdateTask} from '../update-activity.js';
import * as db from '../storage.js';

export function createROMUpdateDialog(api){
 const $=s=>document.querySelector(s);
 let busy=false;
 const bind=(selector,action)=>$(selector).onclick=guardUpdateTask(async()=>{if(busy)return;try{await action();}catch(e){api.error(e);}});
 async function work(action){
  if(busy)return;busy=true;$('#close-sheet').disabled=true;
  const buttons=[...$('#sheet-body').querySelectorAll('button,input')],disabled=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);
  try{return await action();}finally{busy=false;$('#close-sheet').disabled=false;buttons.forEach((b,i)=>b.disabled=disabled[i]);}
 }
 function open(game,{reattach=false}={}){
  const title=reattach?tr('ROMを追加'):tr('ROMを更新');
  api.sheet(title,tr`<p class="sheet-note">${reattach?tr('取り外したものと同じROMを選ぶと、残してあるセーブから遊べます。'):tr('新版のROMへゲーム内セーブをコピーします。旧ROM・旧セーブ・ステートは残ります。')}</p><button id="rom-update-choose" class="primary wide-button">ファイルを選択</button><input id="rom-update-file" type="file" hidden><p id="rom-update-status" class="sheet-note" role="status"></p><button id="rom-update-back" class="secondary wide-button">戻る</button>`);
  bind('#rom-update-back',()=>api.showGame(game));bind('#rom-update-choose',()=>$('#rom-update-file').click());
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
    let plan,target;await work(async()=>{target=(await importROM(file,system,null,{inspectOnly:true})).game;plan=await prepareROMUpdate(game.id,target);});
    confirm(game,file,target,plan);
   }catch(e){$('#rom-update-status').textContent='';api.error(e);}
  });
 }
 function confirm(game,file,target,plan){
  api.sheet(tr('セーブを引き継ぐ'),tr`<div class="settings-group"><p class="sheet-note">${esc(game.name)} → ${esc(target.name)}<br>${bytesLabel(target.size)}</p></div><p class="sheet-note">引き継ぐのはゲーム内セーブだけです。ステートは新版に使いません。</p><label class="row"><input type="checkbox" id="rom-update-compatible"><span>ゲーム作者の案内でセーブの互換性を確認しました</span></label><p class="sheet-note">旧版は削除しません。新版で保存した内容は旧版へ戻せません。</p><p class="sheet-note" id="rom-update-status" role="status"></p><div class="sheet-actions"><button id="rom-update-back" class="secondary">戻る</button><button id="rom-update-confirm" class="primary" disabled>引き継ぐ</button></div>`);
  $('#rom-update-compatible').onchange=()=>$('#rom-update-confirm').disabled=!$('#rom-update-compatible').checked;
  bind('#rom-update-back',()=>open(game));
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
