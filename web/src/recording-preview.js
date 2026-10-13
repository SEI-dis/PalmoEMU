// SPDX-License-Identifier: AGPL-3.0-or-later
// Local recording review. Keep the only copy until the user explicitly closes it.
import {tr} from './i18n/index.js';
import {icon} from './shared.js';
import {saveRecording} from './recording-file.js';

export function createRecordingPreview({onInteract=()=>{},onChange=()=>{},error=()=>{}}={}){
 const panel=document.createElement('section');panel.id='recording-preview';panel.className='capture-panel recording-preview';panel.hidden=true;
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-label',tr('録画した動画'));
 panel.innerHTML=`<header><strong>${tr('録画した動画')}</strong><button class="circle" data-video-close aria-label="${tr('閉じる')}">${icon('close')}</button></header><video controls playsinline preload="metadata"></video><p class="sheet-note" data-video-info></p><div class="capture-actions"><button class="primary" data-video-save>${tr('動画を保存')}</button><button class="secondary" data-video-share hidden>${tr('共有')}</button></div><p class="sheet-note" data-video-status role="status"></p><div class="capture-actions" data-video-confirm hidden><button class="secondary" data-video-cancel>${tr('キャンセル')}</button><button class="secondary danger" data-video-discard>${tr('録画を閉じる')}</button></div>`;
 const video=panel.querySelector('video'),share=panel.querySelector('[data-video-share]'),status=panel.querySelector('[data-video-status]'),confirm=panel.querySelector('[data-video-confirm]');
 let file=null,url=null,sharing=false,saving=false,preparing=false;
 const save=panel.querySelector('[data-video-save]');
 const close=panel.querySelector('[data-video-close]'),info=panel.querySelector('[data-video-info]'),actions=panel.querySelector('.capture-actions');
 function preparation(value){preparing=value;panel.setAttribute('aria-busy',String(value));video.hidden=value;info.hidden=value;actions.hidden=value;close.disabled=value;}
 const mount=()=>{(document.fullscreenElement||document.body).append(panel);};mount();
 function clear(){if(saving||sharing)return;video.pause();video.removeAttribute('src');video.load();if(url)URL.revokeObjectURL(url);url=null;file=null;panel.hidden=true;confirm.hidden=true;onChange();}
 function requestClose(){if(sharing||saving||preparing)return;video.pause();confirm.hidden=false;status.textContent=tr('保存してから閉じてください。閉じると、この録画は破棄されます。');panel.querySelector('[data-video-cancel]').focus({preventScroll:true});}
 panel.querySelector('[data-video-close]').onclick=requestClose;
 panel.querySelector('[data-video-discard]').onclick=clear;
 panel.querySelector('[data-video-cancel]').onclick=()=>{confirm.hidden=true;status.textContent='';};
 panel.addEventListener('pointerdown',onInteract);
 panel.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();requestClose();}});
 save.onclick=async()=>{
  if(!file||saving||sharing)return;video.pause();saving=true;confirm.hidden=true;save.disabled=share.disabled=close.disabled=true;status.textContent='';
  try{
   const result=await saveRecording(file,url,()=>{save.textContent=tr('保存中…');});
   status.textContent=result==='saved'?tr('保存しました'):result==='download'?tr('ダウンロード一覧を確認'):'';
  }catch(e){error(e);}finally{saving=false;save.textContent=tr('動画を保存');save.disabled=share.disabled=close.disabled=false;}
 };
 share.onclick=async()=>{
  if(!file||sharing||saving)return;video.pause();sharing=true;share.disabled=save.disabled=close.disabled=true;
  try{await navigator.share({files:[file]});}catch(e){if(e?.name!=='AbortError')error(e);}finally{sharing=false;share.disabled=save.disabled=close.disabled=false;}
 };
 video.onplay=onInteract;
 document.addEventListener('fullscreenchange',mount);
 return {
  prepare(){if(file)return;preparation(true);confirm.hidden=true;status.textContent=tr('動画を準備しています…');mount();panel.hidden=false;onChange();},
  cancelPreparation(){if(!preparing)return;preparation(false);panel.hidden=true;status.textContent='';onChange();},
  show(result){
   if(file)throw Error('Recording preview is already occupied');
   const at=performance.now();
   preparation(false);
   file=result.file;url=URL.createObjectURL(file);video.src=url;confirm.hidden=true;
   const seconds=Math.round(result.duration/1000),minutes=Math.floor(seconds/60),size=(file.size/1048576).toFixed(1),format=file.type.includes('mp4')?'MP4':'WebM';
   panel.querySelector('[data-video-info]').textContent=tr`${minutes}分${String(seconds%60).padStart(2,'0')}秒 · ${size} MB · ${format}`;
   status.textContent=['duration','size'].includes(result.reason)?tr('録画の上限に達したため停止しました。動画を保存できます。'):result.reason!=='user'?tr('ゲームの中断に合わせて録画を停止しました。動画を保存できます。'):'';
   let supported=false;try{supported=typeof navigator.share==='function'&&navigator.canShare?.({files:[file]})===true;}catch{}
   share.hidden=!supported;mount();panel.hidden=false;onChange();
   // Bounded local timing only: no title, ROM, pixels, save or file contents.
   const timing={...result.timing,previewMs:performance.now()-at};panel.dataset.recordingTiming=JSON.stringify(timing);
   requestAnimationFrame(()=>{if(file===result.file)panel.dataset.recordingTiming=JSON.stringify({...timing,previewFrameMs:performance.now()-at});});
  },
  open(){if(file){mount();panel.hidden=false;}},
  leaveGame(){video.pause();document.body.append(panel);},
  pause(){video.pause();},
  get occupied(){return preparing||!!file;},get visible(){return !panel.hidden;}
 };
}
