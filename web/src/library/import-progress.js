// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
import {bytesLabel} from '../shared.js';
export function createImportProgress(){
 const dialog=document.createElement('dialog');dialog.id='rom-import-progress';dialog.className='rom-import-progress';
 dialog.setAttribute('aria-labelledby','rom-import-title');dialog.setAttribute('aria-describedby','rom-import-name');
 dialog.innerHTML=tr('<div class="rom-import-heading"><span class="update-spinner" aria-hidden="true"></span><h2 id="rom-import-title">ゲームを追加中</h2><span id="rom-import-count"></span></div><p id="rom-import-name"></p><div class="rom-import-status"><span id="rom-import-stage" role="status" aria-live="polite"></span><span id="rom-import-size"></span></div><progress max="1" aria-label="ファイルの読み込み"></progress><p class="rom-import-note">この画面のままお待ちください</p>');
 const find=s=>dialog.querySelector(s),bar=find('progress');
 dialog.addEventListener('cancel',e=>e.preventDefault());document.body.append(dialog);dialog.showModal();
 const update=({phase,loaded,total,name})=>{
  dialog.dataset.phase=phase;
  if(name)find('#rom-import-name').textContent=name;
  find('#rom-import-stage').textContent={reading:tr('読み込み中…'),unpacking:tr('解凍中…'),checking:tr('重複を確認中…'),saving:tr('端末に保存中…')}[phase];
  const reading=phase==='reading'||phase==='unpacking';bar.setAttribute('aria-label',phase==='unpacking'?tr('ZIPの解凍'):reading?tr('ファイルの読み込み'):phase==='checking'?tr('重複の確認'):tr('端末への保存'));
  if(reading&&total>0){bar.value=loaded/total;find('#rom-import-size').textContent=`${bytesLabel(loaded)} / ${bytesLabel(total)}`;}
  else{bar.removeAttribute('value');find('#rom-import-size').textContent='';}
 };
 return {start(file,index,total){find('#rom-import-name').textContent=file.name;find('#rom-import-count').textContent=`${index} / ${total}`;update({phase:'reading',loaded:0,total:file.size});},update,close(){dialog.close();dialog.remove();}};
}
