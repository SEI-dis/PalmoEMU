// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
import {escapeHTML as esc} from '../shared.js';
import {guardUpdateTask} from '../updates/update-activity.js';
import {trainerAvatarSource,validTrainerAvatar} from '../library/trainer-profile.js';
import {openImageCrop} from './image-crop-dialog.js';

export function editTrainerAvatar(api){
 const initial=api.trainer().profile?.avatar||'';
 let draft=initial;
 const $=selector=>document.querySelector(selector);
 function finish(){
  api.closeSheet({dismiss:true});api.render();$('#trainer-avatar-change')?.focus({preventScroll:true});
 }
 function crop(source,returnTo){
  void openImageCrop(api,source,{title:tr('アイコンを変更'),avatar:true,saveError:tr('保存できませんでした。もう一度お試しください。'),
   onCancel:()=>open(returnTo),persist:value=>api.saveAvatar(value),onSaved:(_,alive)=>{if(alive)finish();}
  }).catch(api.error);
 }
 function open(focus){
  api.sheet(tr('アイコンを変更'),tr`<form id="trainer-avatar-form"><img id="trainer-avatar-preview" class="trainer-avatar trainer-avatar-preview" src="${esc(trainerAvatarSource(draft))}" alt="アイコン"><input id="trainer-avatar-input" type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="trainer-avatar-actions"><button type="button" id="trainer-avatar-pick">画像を選ぶ</button><button type="button" class="secondary" id="trainer-avatar-adjust">表示位置を調整</button></div><p class="sheet-note">利用する権利のある画像を選んでください。画像はこのブラウザ内に保存します。</p><button type="button" class="text-button wide-button" id="trainer-avatar-reset">標準に戻す</button><div class="sheet-actions"><button type="submit" class="primary">保存</button></div></form>`);
  const form=$('#trainer-avatar-form'),input=$('#trainer-avatar-input'),pick=$('#trainer-avatar-pick'),adjust=$('#trainer-avatar-adjust'),reset=$('#trainer-avatar-reset'),save=form.querySelector('[type=submit]');
  function update(){
   const changed=draft!==initial;
   $('#trainer-avatar-preview').src=trainerAvatarSource(draft);adjust.hidden=!validTrainerAvatar(draft);reset.hidden=!draft;
   pick.className=changed?'secondary':'primary';save.disabled=!changed;save.parentElement.hidden=!changed;
  }
  pick.onclick=()=>input.click();
  input.onchange=()=>{const file=input.files[0];input.value='';if(file)crop(file,'#trainer-avatar-pick');};
  adjust.onclick=()=>crop(draft,'#trainer-avatar-adjust');
  reset.onclick=()=>{draft='';update();save.focus({preventScroll:true});};
  form.onsubmit=guardUpdateTask(async event=>{
   event.preventDefault();if(draft===initial||form.getAttribute('aria-busy')==='true')return;
   const close=$('#close-sheet'),controls=[...form.querySelectorAll('button,input'),close];
   for(const control of controls)control.disabled=true;form.setAttribute('aria-busy','true');
   try{await api.saveAvatar(draft);}catch(error){api.error(error);return;}
   finally{for(const control of controls)control.disabled=false;form.removeAttribute('aria-busy');if(form.isConnected)update();}
   if(form.isConnected)finish();
  });
  update();if(focus)$(focus)?.focus({preventScroll:true});
 }
 open();
}
