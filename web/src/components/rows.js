// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared settings rows. Labels/controls are trusted HTML supplied by the UI;
// escape user-provided text before passing it here.
import {escapeHTML as esc,icon} from '../shared.js';
export const row=(label,control,ic='settings')=>`<label class="row">${icon(ic)}<span>${label}</span>${control}</label>`;
export const detail=(title,text,control,ic)=>row(`${title}<small>${text}</small>`,control,ic);
export const action=(label,id,ic='chevron',extra='')=>`<button class="row ${extra}" data-action="${id}">${icon(ic)}<span>${label}</span>${ic==='back'||ic==='chevron'?'':icon('chevron')}</button>`;
export const settingsGroup=(title,rows)=>`<div class="label">${title}</div><div class="settings-group">${rows.join('')}</div>`;
export const switchControl=(setting,checked,{disabled=false}={})=>`<input data-setting="${setting}" type="checkbox" ${disabled?'disabled':''} ${checked?'checked':''}>`;

/* ASListPage / ASListItemView port. Copyright © 2026 Manic EMU.
   Created by Daiuno. Web adaptation and shared-row refactor: 2026-10-09.
   See sources/manicemu-ui/README.md. */
export function nativeAction(label,id,ic,value='',extra=''){
 const tag=id?'button':'div';
 return `<${tag} class="row native-row ${extra}" ${id?`data-action="${id}"`:''}>${icon(ic)}<span class="native-label">${esc(label)}</span>${value?`<span class="native-value">${esc(value)}</span>`:''}${id?icon('chevron'):''}</${tag}>`;
}
export function nativeSelect(label,key,ic,options,value){
 const selected=options.find(([id])=>String(id)===String(value))||options[0];
 return `<label class="row native-row native-select">${icon(ic)}<span class="native-label">${esc(label)}</span><span class="native-value" aria-hidden="true">${esc(selected[1])}</span>${icon('chevron')}<select aria-label="${esc(label)}" data-setting="${key}">${options.map(([id,title])=>`<option value="${esc(id)}" ${String(id)===String(value)?'selected':''}>${esc(title)}</option>`).join('')}</select></label>`;
}
export function nativeToggle(label,key,ic,checked,{invert=false,detail=''}={}){
 return `<label class="row native-row">${icon(ic)}<span class="native-label">${esc(label)}${detail?`<small>${esc(detail)}</small>`:''}</span><input aria-label="${esc(label)}" data-setting="${key}" ${invert?'data-invert="true"':''} type="checkbox" ${checked?'checked':''}></label>`;
}
