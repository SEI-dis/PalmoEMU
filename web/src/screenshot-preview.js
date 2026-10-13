// SPDX-License-Identifier: AGPL-3.0-or-later
// Local PNG preview/export. Capturing never uploads pixels or pauses the core.
import {tr} from './i18n/index.js';
import {icon} from './shared.js';

export function createScreenshotPreview({host,onInteract=()=>{},toast=()=>{},error=()=>{}}){
 const panel=document.createElement('section');panel.id='screenshot-preview';panel.className='screenshot-preview';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-label',tr('スクリーンショット'));
 panel.innerHTML=`<header><strong>${tr('スクリーンショット')}</strong><button class="circle" data-photo-close aria-label="${tr('閉じる')}">${icon('close')}</button></header><img data-photo-image alt="${tr('スクリーンショット')}"><div class="screenshot-actions"><button class="primary" data-photo-save>${tr('画像を保存')}</button><button class="secondary" data-photo-share hidden>${tr('共有')}</button></div><p class="sheet-note" data-photo-status role="status"></p>`;
 host.append(panel);
 const image=panel.querySelector('[data-photo-image]'),save=panel.querySelector('[data-photo-save]'),share=panel.querySelector('[data-photo-share]'),status=panel.querySelector('[data-photo-status]');
 let file=null,sharing=false;
 function hide(){panel.hidden=true;if(panel.contains(document.activeElement))document.activeElement.blur();}
 panel.querySelector('[data-photo-close]').onclick=hide;
 panel.addEventListener('pointerdown',onInteract);
 panel.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();hide();}});
 save.onclick=()=>{
  if(!file)return;
  const url=URL.createObjectURL(file),anchor=document.createElement('a');anchor.href=url;anchor.download=file.name;anchor.hidden=true;document.body.append(anchor);
  try{anchor.click();status.textContent=tr('ダウンロードを開始しました。');toast(status.textContent);}catch(e){error(e);}finally{anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 };
 share.onclick=async()=>{
  if(!file||sharing)return;sharing=true;share.disabled=true;const current=file;
  try{await navigator.share({files:[current]});}catch(e){if(e?.name!=='AbortError')error(e);}finally{sharing=false;share.disabled=false;}
 };
 return {
  show(data,name){
   // Use bytes and an explicit MIME type instead of navigating to a data URL.
   const prefix='data:image/png;base64,';if(typeof data!=='string'||!data.startsWith(prefix))throw new TypeError('Invalid screenshot PNG');
   const bytes=Uint8Array.from(atob(data.slice(prefix.length)),value=>value.charCodeAt(0));
   file=new File([bytes],String(name).replace(/[\\/\u0000-\u001f]/g,'_')+'.png',{type:'image/png'});image.src=data;status.textContent=tr('画像を確認して、保存または共有できます。');
   let supported=false;try{supported=typeof navigator.share==='function'&&navigator.canShare?.({files:[file]})===true;}catch{}
   share.hidden=!supported;panel.hidden=false;
  },
  hide,
  clear(){hide();file=null;image.removeAttribute('src');status.textContent='';},
  get visible(){return !panel.hidden;}
 };
}
