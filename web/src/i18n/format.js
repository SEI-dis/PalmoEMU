// SPDX-License-Identifier: AGPL-3.0-or-later
// Translate only authored template text, before inserting values. User names,
// filenames and markup returned by expressions never enter the catalogue lookup.
export const hasJapanese = text => /[ぁ-んァ-ヶ一-龯]/.test(text);
const slot = /⟪(\d+)⟫/g;
export function messageKey(text) {
 const slots=[];
 const key=text.trim().replace(/\s+/g,' ').replace(slot,(_,id)=>{slots.push(id);return `⟪${slots.length-1}⟫`;});
 return {key,slots};
}
export function mapSource(source,translate) {
 // Authored HTML/SVG only; interpolation markers cannot contain HTML syntax.
 const tag=/<\/?[a-zA-Z!][^>]*>/g;let result='',from=0,html=false;
 for(const match of source.matchAll(tag)){
  html=true;result+=translate(source.slice(from,match.index),'html');
  result+=match[0].replace(/\b(aria-label|title|alt|placeholder)="([^"]*)"/g,(_,name,text)=>`${name}="${translate(text,'attribute')}"`);
  from=match.index+match[0].length;
 }
 return result+translate(source.slice(from),html?'html':'text');
}
export function translateSource(source,catalogue) {
 return mapSource(source,(text,kind)=>{
  const {key,slots}=messageKey(text);if(!Object.hasOwn(catalogue,key))return text;
  let value=catalogue[key];
  if(kind!=='text')value=value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  value=value.replace(slot,(_,id)=>`⟪${slots[Number(id)]}⟫`);
  return text.slice(0,text.length-text.trimStart().length)+value+text.slice(text.trimEnd().length);
 });
}
export function interpolate(source,values) {return source.replace(slot,(_,id)=>String(values[Number(id)]));}
