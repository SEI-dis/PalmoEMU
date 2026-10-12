// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr,languagePreference,saveLanguage} from '../i18n/index.js';
import {row} from './rows.js';

export function languageSetting(){
 const value=languagePreference();
 return row(tr('言語'),`<select id="app-language" aria-label="${tr('言語')}">${[
  ['auto',tr('自動')],['ja','日本語'],['en','English']
 ].map(([id,label])=>`<option value="${id}"${value===id?' selected':''}>${label}</option>`).join('')}</select>`,'settings');
}
export function bindLanguageSetting(root,{canChange=()=>true,onError=()=>{},reload=()=>location.reload()}={}){
 const select=root.querySelector('#app-language');if(!select)return;
 select.addEventListener('change',()=>{
  if(!canChange()){select.value=languagePreference();return;}
  try{saveLanguage(select.value);}catch{select.value=languagePreference();onError(tr('言語を保存できませんでした。'));return;}
  // Settings are only editable outside gameplay. Reload this idle page so
  // module-level labels, workers and static accessibility text switch together.
  reload();
 });
}
