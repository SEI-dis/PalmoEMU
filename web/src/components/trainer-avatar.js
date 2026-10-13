// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
import {escapeHTML as esc} from '../shared.js';
import {guardUpdateTask} from '../update-activity.js';
import {trainerAvatarSource} from '../trainer-profile.js';

async function readAvatar(file){
 if(file.size>16*1048576||!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error(tr('16MB以下のPNG・JPEG・WebP画像を選んでください。'));
 const bitmap=await createImageBitmap(file);
 try{
  if(!bitmap.width||!bitmap.height||bitmap.width>8192||bitmap.height>8192)throw Error(tr('画像のサイズが大きすぎます。'));
  // Re-encode to a bounded square. Metadata and external references are discarded.
  const size=Math.min(bitmap.width,bitmap.height),canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';
  ctx.drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,256,256);
  return canvas.toDataURL('image/png');
 }finally{bitmap.close();}
}

export function editTrainerAvatar(api){
 let draft=api.trainer().profile?.avatar||'';
 api.sheet(tr('アイコンを変更'),tr`<form id="trainer-avatar-form"><img id="trainer-avatar-preview" class="trainer-avatar trainer-avatar-preview" src="${esc(trainerAvatarSource(draft))}" alt="アイコン"><input id="trainer-avatar-input" type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="trainer-avatar-actions"><button type="button" class="secondary" id="trainer-avatar-pick">画像を選ぶ</button><button type="button" class="secondary" id="trainer-avatar-reset">標準に戻す</button></div><p class="sheet-note">利用する権利のある画像を選んでください。画像はこのブラウザ内に保存します。</p><div class="sheet-actions"><button type="button" class="secondary" id="trainer-avatar-cancel">キャンセル</button><button type="submit" class="primary">保存</button></div></form>`);
 const form=document.querySelector('#trainer-avatar-form'),input=form.querySelector('input'),preview=form.querySelector('img'),reset=form.querySelector('#trainer-avatar-reset');
 const update=()=>{preview.src=trainerAvatarSource(draft);reset.disabled=!draft;};
 const run=guardUpdateTask(async action=>{
  const controls=[...form.querySelectorAll('button,input'),document.querySelector('#close-sheet')];
  for(const control of controls)control.disabled=true;form.setAttribute('aria-busy','true');
  try{await action();return true;}catch(error){api.error(error);return false;}
  finally{for(const control of controls)control.disabled=false;form.removeAttribute('aria-busy');update();}
 });
 form.querySelector('#trainer-avatar-pick').onclick=()=>input.click();
 input.onchange=()=>{const file=input.files[0];input.value='';if(file)void run(async()=>{draft=await readAvatar(file);});};
 reset.onclick=()=>{draft='';update();};
 form.querySelector('#trainer-avatar-cancel').onclick=()=>api.closeSheet();
 form.onsubmit=event=>{event.preventDefault();void run(()=>api.saveAvatar(draft)).then(saved=>{
  if(!saved)return;api.closeSheet();api.render();document.querySelector('#trainer-avatar-change')?.focus({preventScroll:true});
 });};
 update();
}
