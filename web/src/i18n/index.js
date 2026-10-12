// SPDX-License-Identifier: AGPL-3.0-or-later
import english from './locales/en.js';
import {translateSource,interpolate} from './format.js';
const key='palmo-language',choices=['auto','ja','en'];
export function resolveLanguage(preference='auto',languages=globalThis.navigator?.languages||[globalThis.navigator?.language]) {
 if(preference==='ja'||preference==='en')return preference;
 // Use the primary browser language, with English for unsupported languages.
 return /^ja(?:-|$)/i.test(languages?.[0]||'')?'ja':'en';
}
export function languagePreference(){try{const value=globalThis.localStorage?.getItem(key);return choices.includes(value)?value:'auto';}catch{return 'auto';}}
export let language=resolveLanguage(languagePreference());
export const locale=()=>language==='ja'?'ja-JP':'en-US';
export function saveLanguage(value){if(!choices.includes(value))throw TypeError('Unsupported language');globalThis.localStorage.setItem(key,value);}
// Worker jobs receive the page's resolved language; workers have no localStorage.
export function setWorkerLanguage(value){if(typeof document==='undefined'&&(value==='ja'||value==='en'))language=value;}
const templates=new WeakMap(),strings=new Map();
export function tr(source,...values){
 let template;
 if(Array.isArray(source)){
  template=templates.get(source);if(!template){const original=source.map((part,i)=>part+(i<values.length?`⟪${i}⟫`:'')).join('');template={ja:original,en:translateSource(original,english)};templates.set(source,template);}
 }else{
  if(!strings.has(source))strings.set(source,{ja:source,en:translateSource(source,english)});template=strings.get(source);
 }
 return values.length?interpolate(template[language],values):template[language];
}
export function localizeDocument(root=document){
 // Call once, on the static document before app data or event handlers mount.
 // Never observe or rewrite a live game/library subtree.
 document.documentElement.lang=language;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 for(let node=walker.nextNode();node;node=walker.nextNode())if(!node.parentElement?.closest('script,style,pre,code,[translate="no"],[data-i18n-en],time[datetime]'))node.nodeValue=tr(node.nodeValue);
 for(const element of root.querySelectorAll('[aria-label],[title],[alt],[placeholder]')){
  if(element.closest('[translate="no"]'))continue;
  for(const name of ['aria-label','title','alt','placeholder'])if(element.hasAttribute(name))element.setAttribute(name,tr(element.getAttribute(name)));
 }
 if(language==='en')for(const element of root.querySelectorAll('[data-i18n-en]'))element.textContent=element.dataset.i18nEn;
 for(const time of root.querySelectorAll('time[datetime]')){
  const date=new Date(time.dateTime);if(Number.isFinite(date.getTime()))time.textContent=new Intl.DateTimeFormat(locale(),{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(date);
 }
}
