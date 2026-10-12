// SPDX-License-Identifier: AGPL-3.0-or-later
// Native names keep the selector usable after an accidental language change.
export const languages = [
 {code:'ja',name:'日本語',locale:'ja-JP'},
 {code:'en',name:'English',locale:'en-US'},
 {code:'zh-Hans',name:'简体中文',locale:'zh-Hans'},
 {code:'zh-Hant',name:'繁體中文',locale:'zh-Hant'},
 {code:'ko',name:'한국어',locale:'ko-KR'},
 {code:'es',name:'Español',locale:'es'},
 {code:'fr',name:'Français',locale:'fr'},
 {code:'de',name:'Deutsch',locale:'de'},
 {code:'pt',name:'Português',locale:'pt'}
];
export const supportsLanguage = code => languages.some(item => item.code === code);
function matchLanguage(value) {
 if(typeof value !== 'string')return null;
 const parts=value.toLowerCase().replaceAll('_','-').split('-');
 if(parts[0]==='zh') {
  // An explicit script wins over region (for example zh-Hans-HK).
  if(parts.includes('hans'))return 'zh-Hans';
  if(parts.includes('hant'))return 'zh-Hant';
  return parts.some(part=>['tw','hk','mo'].includes(part))?'zh-Hant':'zh-Hans';
 }
 return supportsLanguage(parts[0])?parts[0]:null;
}
export function resolveLanguage(preference='auto',preferred=globalThis.navigator?.languages||[globalThis.navigator?.language]) {
 if(supportsLanguage(preference))return preference;
 for(const candidate of preferred||[]) {
  const code=matchLanguage(candidate);
  if(code)return code;
 }
 return 'en';
}
