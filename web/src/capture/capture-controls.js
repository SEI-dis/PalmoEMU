// SPDX-License-Identifier: AGPL-3.0-or-later
// One existing camera shortcut handles still images, recording and stop.
import {tr} from '../i18n/index.js';
import {icon} from '../shared.js';
import {createGameRecorder,recordingSupported} from './game-recorder.js';
import {createRecordingPreview} from './recording-preview.js';

export function createCaptureControls({button,host,getState,capture,onInteract=()=>{},onReview=()=>{},error=()=>{},onChange=()=>{}}){
 const menu=document.createElement('section');menu.id='capture-menu';menu.className='capture-panel capture-menu';menu.hidden=true;
 menu.setAttribute('role','dialog');menu.setAttribute('aria-modal','false');menu.setAttribute('aria-label',tr('撮影'));
 menu.innerHTML=`<header><strong>${tr('撮影')}</strong><button class="circle" data-capture-close aria-label="${tr('閉じる')}">${icon('close')}</button></header><button class="capture-choice" data-capture-photo>${icon('camera')}<span>${tr('スクリーンショット')}</span></button><button class="capture-choice" data-capture-record><span class="record-dot" aria-hidden="true"></span><span>${tr('録画を開始')}</span></button><p class="sheet-note" data-capture-note></p>`;
 host.append(menu);
 const record=menu.querySelector('[data-capture-record]'),note=menu.querySelector('[data-capture-note]');
 const preview=createRecordingPreview({onInteract,onChange,error});
 let pauseMs=0,inputDelayMs=0;
 const time=milliseconds=>{const seconds=Math.floor(milliseconds/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
 function hide(){menu.hidden=true;button.setAttribute('aria-expanded','false');}
 function render(snapshot){
  const state=snapshot.state,active=state!=='idle',stopping=state==='stopping',starting=state==='starting';
  button.dataset.recording=String(active);button.disabled=stopping;
  const label=active?(stopping?tr('動画を準備しています…'):tr('録画を停止')):tr('撮影');
  button.setAttribute('aria-label',label);button.title=active?label:`${label} · ${tr('長押しで移動')}`;
  button.innerHTML=active?`<span class="record-stop" aria-hidden="true"></span><span class="record-time" aria-hidden="true">${starting?'…':time(snapshot.duration||0)}</span>`:icon('camera');
  button.setAttribute('aria-busy',String(starting||stopping));onChange();
  if(stopping){preview.prepare();const at=performance.now();onReview();pauseMs=performance.now()-at;}
 }
 const recorder=createGameRecorder({onState:render,onComplete:result=>{preview.show({...result,timing:{...result.timing,pauseMs,inputDelayMs}});},onError:e=>{preview.cancelPreparation();error(e);},onEmpty:()=>preview.cancelPreparation()});
 button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','capture-menu');button.setAttribute('aria-expanded','false');render({state:'idle'});
 menu.querySelector('[data-capture-close]').onclick=hide;
 menu.querySelector('[data-capture-photo]').onclick=()=>{hide();capture();};
 record.onclick=()=>{
  const {core,name,playing}=getState();if(!core||!playing)return;
  hide();if(preview.occupied){preview.open();return;}
  inputDelayMs=0;onInteract();void recorder.start(core,{name});
 };
 menu.addEventListener('pointerdown',onInteract);
 menu.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();hide();button.focus({preventScroll:true});}});
 const api={
  activate(event){
   if(recorder.state!=='idle'){const delay=performance.now()-event?.timeStamp;inputDelayMs=Number.isFinite(delay)&&delay>=0&&delay<300000?delay:0;void recorder.stop('user');return;}
   if(preview.occupied){preview.open();return;}
   if(!getState().core)return;
   if(!menu.hidden){hide();return;}
   const supported=recordingSupported();record.disabled=!supported||!getState().playing;
   note.textContent=!supported?tr('このブラウザはゲーム音付きの録画に対応していません。'):!getState().playing?tr('ゲームを再開すると録画できます。'):tr('ゲーム音付き・最大5分。音量は現在の設定を使います。');
   onInteract();menu.hidden=false;button.setAttribute('aria-expanded','true');
  },
  stop(reason){hide();return recorder.stop(reason);},
  pause(reason='pause'){hide();preview.pause();if(recorder.state!=='idle')void recorder.stop(reason);},
  hide,
  leaveGame(){hide();preview.leaveGame();},
  get active(){return recorder.state!=='idle';},
  get pending(){return recorder.state!=='idle'||preview.occupied;},
  get menuVisible(){return !menu.hidden;}
 };
 window.addEventListener('beforeunload',event=>{if(api.pending){event.preventDefault();event.returnValue='';}});
 return api;
}
