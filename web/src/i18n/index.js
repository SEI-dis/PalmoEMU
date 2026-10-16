// SPDX-License-Identifier: AGPL-3.0-or-later
import {translateSource,interpolate} from './format.js';
import {languages,supportsLanguage,resolveLanguage} from './languages.js';
export {languages,resolveLanguage};

const key='palmo-language';
const loaders={
 en:()=>import('./locales/en.js'),
 'zh-Hans':()=>import('./locales/zh-Hans.js'),
 'zh-Hant':()=>import('./locales/zh-Hant.js'),
 ko:()=>import('./locales/ko.js'),
 es:()=>import('./locales/es.js'),
 fr:()=>import('./locales/fr.js'),
 de:()=>import('./locales/de.js'),
 pt:()=>import('./locales/pt.js')
};
const catalogues={},pending=new Map();
function loadCatalogue(code) {
 if(!pending.has(code))pending.set(code,loaders[code]().then(module=>module.default).catch(error=>{pending.delete(code);throw error;}));
 return pending.get(code);
}
async function loadLanguage(code) {
 if(code==='ja'||catalogues[code])return code;
 const english=loadCatalogue('en').then(catalogue=>catalogues.en=catalogue);
 try {
  const [fallback,selected]=await Promise.all([english,loadCatalogue(code)]);
  catalogues[code]=code==='en'?selected:{...fallback,...selected};return code;
 }catch{
  try{await english;return 'en';}catch{return 'ja';}
 }
}
export function languagePreference() {
 try {
  const value=globalThis.localStorage?.getItem(key);
  return supportsLanguage(value)?value:'auto';
 }catch{return 'auto';}
}
// Install worker message handlers before fetching a dictionary. WebKit can
// dispatch the first queued message while a module's top-level await is still
// fetching; each handler already awaits setWorkerLanguage(message.language).
export let language=typeof document==='undefined'?'ja':resolveLanguage(languagePreference());
// A missing catalogue must not prevent access to local games or save exports.
// Keep the preference so the next page load can retry its selected language.
if(typeof document!=='undefined')language=await loadLanguage(language);
export const locale=()=>languages.find(item=>item.code===language).locale;
export function saveLanguage(value) {
 if(value!=='auto'&&!supportsLanguage(value))throw TypeError('Unsupported language');
 globalThis.localStorage.setItem(key,value);
}
// Workers have no localStorage. Await the page's language before doing the job.
export async function setWorkerLanguage(value) {
 if(typeof document!=='undefined'||!supportsLanguage(value))return;
 language=await loadLanguage(value);
}

const templates=new WeakMap(),strings=new Map();
export function tr(source,...values) {
 const tagged=Array.isArray(source),cache=tagged?templates:strings;
 if(!cache.has(source)) {
  const original=tagged?source.map((part,i)=>part+(i<values.length?`⟪${i}⟫`:'')).join(''):source;
  cache.set(source,{original,localized:new Map([['ja',original]])});
 }
 const entry=cache.get(source);
 if(!entry.localized.has(language))entry.localized.set(language,translateSource(entry.original,catalogues[language]||catalogues.en||{}));
 const text=entry.localized.get(language);
 return values.length?interpolate(text,values):text;
}
export function localizeDocument(root=document) {
 // Only authored static DOM, before user data and event handlers are mounted.
 document.documentElement.lang=language;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
 for(let node=walker.nextNode();node;node=walker.nextNode()) {
  if(!node.parentElement?.closest('script,style,pre,code,[translate="no"],[data-i18n],time[datetime]'))node.nodeValue=tr(node.nodeValue);
 }
 for(const element of root.querySelectorAll('[aria-label],[title],[alt],[placeholder]')) {
  if(element.closest('[translate="no"]'))continue;
  for(const name of ['aria-label','title','alt','placeholder']) {
   if(element.hasAttribute(name))element.setAttribute(name,tr(element.getAttribute(name)));
  }
 }
 if(language!=='ja')for(const element of root.querySelectorAll('[data-i18n]')) {
  const translations=JSON.parse(element.dataset.i18n);
  element.textContent=translations[language]||translations.en||element.textContent;
 }
 for(const time of root.querySelectorAll('time[datetime]')) {
  const date=new Date(time.dateTime);
  if(Number.isFinite(date.getTime()))time.textContent=new Intl.DateTimeFormat(locale(),{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(date);
 }
}
