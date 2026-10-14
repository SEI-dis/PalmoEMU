// SPDX-License-Identifier: AGPL-3.0-or-later
// Local canvas/Web Audio recording. No microphone, screen-capture permission or network.
import {tr} from '../i18n/index.js';
import {recordingName} from './recording-file.js';

const formats=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm'];
const safely=fn=>{try{fn();}catch{}};
export function recordingSupported(){
 const AudioContext=window.AudioContext||window.webkitAudioContext;
 try{return typeof MediaRecorder==='function'&&typeof HTMLCanvasElement.prototype.captureStream==='function'&&typeof AudioContext?.prototype.createMediaStreamDestination==='function'&&formats.some(type=>MediaRecorder.isTypeSupported(type));}catch{return false;}
}
export function createGameRecorder({onState=()=>{},onComplete=()=>{},onError=()=>{},onEmpty=()=>{},maxDurationMs=300000,maxBytes=64*1048576}={}){
 const durationLimit=Math.min(300000,Math.max(100,Number(maxDurationMs)||300000)),byteLimit=Math.min(64*1048576,Math.max(1024,Number(maxBytes)||64*1048576));
 let active=null,state='idle';
 const elapsed=s=>s?.startedAt==null?0:Math.max(0,(s.stoppedAt??performance.now())-s.startedAt);
 const notify=()=>safely(()=>onState({state,duration:elapsed(active),bytes:active?.bytes||0,mimeType:active?.mimeType||'',width:active?.canvas?.width||0,height:active?.canvas?.height||0}));
 const change=value=>{state=value;notify();};
 function cleanup(s){
  cancelAnimationFrame(s.raf);clearTimeout(s.limitTimer);clearTimeout(s.startTimer);clearTimeout(s.stopTimer);clearTimeout(s.stopTask);
  if(s.fullscreen)document.removeEventListener('fullscreenchange',s.fullscreen);
  for(const [track,listener]of s.listeners)track.removeEventListener('ended',listener);
  if(s.recorder){s.recorder.ondataavailable=null;s.recorder.onstop=null;s.recorder.onerror=null;}
  for(const [gain,destination]of s.branches)safely(()=>gain.disconnect(destination));
  for(const source of s.sources)safely(()=>source.disconnect());
  for(const track of s.tracks)safely(()=>track.stop());
  if(s.mixer)safely(()=>s.mixer.close().catch(()=>{}));
  s.canvas?.remove();s.chunks=[];
 }
 function finish(s){
  if(s.finished)return;s.finished=true;s.stoppedAt??=performance.now();const containerAt=performance.now();
  let file=null;
  try{if(!s.error&&s.bytes){
   const mime=(s.mimeType||s.chunks[0]?.type||'').split(';')[0],extension=mime==='video/mp4'?'mp4':'webm';
   file=new File(s.chunks,s.name+'.'+extension,{type:mime});
  }}catch(e){s.error=e;}
  const containerMs=performance.now()-containerAt,cleanupAt=performance.now();cleanup(s);const cleanupMs=performance.now()-cleanupAt;if(active===s){active=null;change('idle');}
  if(s.error)safely(()=>onError(s.error));
  if(file)safely(()=>onComplete({file,reason:s.reason||'ended',duration:elapsed(s),timing:{finalizeMs:performance.now()-s.stoppedAt,stopCallMs:s.stopCallMs||0,containerMs,cleanupMs}}));
  else if(!s.error)safely(onEmpty);
  s.resolve(file);
 }
 function fail(s,error){if(s.finished)return;s.error=error instanceof Error?error:new Error(tr('録画を続けられませんでした。'));stopSession(s,'error');}
 function stopSession(s,reason){
  if(s.finished)return s.done;if(s.stopping)return s.done;s.stopping=true;s.reason=reason;s.stoppedAt=performance.now();if(active===s)change('stopping');
  cancelAnimationFrame(s.raf);clearTimeout(s.limitTimer);
  if(!s.recorder||s.recorder.state==='inactive'){finish(s);return s.done;}
  // Wait for the final dataavailable/stop pair, but never retain audio forever.
  s.stopTimer=setTimeout(()=>{s.error??=new Error(tr('録画の終了処理が完了しませんでした。'));finish(s);},8000);
  // Yield after the stopping UI and game pause, before asking the encoder to flush.
  s.stopTask=setTimeout(()=>{if(s.finished)return;const at=performance.now();try{s.recorder.stop();s.stopCallMs=performance.now()-at;}catch(e){s.error=e;finish(s);}},0);return s.done;
 }
 function sources(core){
  if(core.rawScreens?.length>=2)return {width:400,height:480,frames:()=>[{image:core.rawScreens[0],x:0,y:0,w:400,h:240},{image:core.rawScreens[1],x:40,y:240,w:320,h:240}]};
  if(core.screens?.length>=2){const top=core.screens[0],width=top.width,height=top.height*2;return {width,height,frames:()=>core.screens.slice(0,2).map((image,i)=>({image,x:0,y:i*height/2,w:width,h:height/2}))};}
  const width=core.canvas?.width,height=core.canvas?.height;return {width,height,frames:()=>[{image:core.canvas,x:0,y:0,w:width,h:height}]};
 }
 async function start(core,{name='PalmoEMU'}={}){
  if(state!=='idle')return false;
  const s={name:recordingName(name),chunks:[],bytes:0,tracks:new Set(),branches:[],sources:[],listeners:[],startedAt:null};
  s.done=new Promise(resolve=>{s.resolve=resolve;});active=s;change('starting');if(s.finished)return false;
  s.startTimer=setTimeout(()=>fail(s,new Error(tr('録画を開始できませんでした。'))),8000);
  try{
   if(typeof MediaRecorder!=='function'||typeof HTMLCanvasElement.prototype.captureStream!=='function')throw new Error(tr('このブラウザは動画録画に対応していません。'));
   const candidates=formats.filter(type=>MediaRecorder.isTypeSupported(type));if(!candidates.length)throw new Error(tr('このブラウザは動画録画に対応していません。'));
   const layout=sources(core);if(!(layout.width>0&&layout.height>0))throw new Error(tr('ゲーム画面を録画できません。'));
   const audioCores=core.cores?.length?core.cores:[core];
   // Call all unlock methods before awaiting so iOS receives the user gesture.
   const promises=audioCores.map(c=>c.unlockAudio?.());
   if(audioCores.length>1){const AudioContext=window.AudioContext||window.webkitAudioContext;s.mixer=new AudioContext();promises.push(s.mixer.resume());}
   const unlocking=Promise.all(promises);
   await Promise.race([unlocking,s.done]);if(s.finished||s.stopping)return false;
   if(audioCores.some(c=>!c.ac||!c.gain||c.ac.state!=='running'||typeof c.ac.createMediaStreamDestination!=='function'))throw new Error(tr('ゲーム音を録画できません。音声を有効にしてからお試しください。'));
   const streams=audioCores.map(c=>{const destination=c.ac.createMediaStreamDestination();s.branches.push([c.gain,destination]);for(const track of destination.stream.getTracks())s.tracks.add(track);c.gain.connect(destination);return destination.stream;});
   let audio=streams[0];
   if(streams.length>1){
    const destination=s.mixer.createMediaStreamDestination();
    for(const track of destination.stream.getTracks())s.tracks.add(track);
    for(const stream of streams){const source=s.mixer.createMediaStreamSource(stream);s.sources.push(source);source.connect(destination);}
    if(s.mixer.state!=='running')throw new Error(tr('ゲーム音を録画できません。音声を有効にしてからお試しください。'));audio=destination.stream;
   }
   s.canvas=document.createElement('canvas');s.canvas.dataset.recordingCanvas='';s.canvas.setAttribute('aria-hidden','true');
   // Expand small pixel-art screens before lossy encoding. Integer scaling keeps
   // hard pixel edges; cap at 2x / 720px to bound mobile encoder work.
   const longest=Math.max(layout.width,layout.height),scale=longest<=360?2:Math.min(1,720/longest);s.canvas.width=Math.max(2,Math.round(layout.width*scale/2)*2);s.canvas.height=Math.max(2,Math.round(layout.height*scale/2)*2);
   // Keep a painted DOM canvas: display:none/off-DOM capture has failed on iOS.
   s.canvas.style.cssText='position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:.01;pointer-events:none;z-index:0';
   s.fullscreen=()=>{const host=document.fullscreenElement||document.body;if(s.canvas.parentElement!==host)host.append(s.canvas);};s.fullscreen();document.addEventListener('fullscreenchange',s.fullscreen);
   const context=s.canvas.getContext('2d',{alpha:false});context.imageSmoothingEnabled=false;
   const draw=()=>{context.fillStyle='#000';context.fillRect(0,0,s.canvas.width,s.canvas.height);for(const frame of layout.frames())context.drawImage(frame.image,frame.x/layout.width*s.canvas.width,frame.y/layout.height*s.canvas.height,frame.w/layout.width*s.canvas.width,frame.h/layout.height*s.canvas.height);};
   draw();const video=s.canvas.captureStream(30);for(const track of video.getTracks())s.tracks.add(track);
   const stream=new MediaStream([...video.getVideoTracks(),...audio.getAudioTracks()]);
   if(!stream.getVideoTracks().length||!stream.getAudioTracks().length)throw new Error(tr('ゲーム画面と音声を録画できません。'));
   for(const track of stream.getTracks()){const ended=()=>stopSession(s,'ended');track.addEventListener('ended',ended);s.listeners.push([track,ended]);}
   const dataAvailable=event=>{
    if(s.finished||!event.data?.size)return;
    if(s.bytes+event.data.size>byteLimit){fail(s,new Error(tr('録画のサイズ上限を超えたため、保存できませんでした。')));return;}
    s.chunks.push(event.data);s.bytes+=event.data.size;
    // Leave space for the final chunk/container metadata before the hard cap.
    if(s.bytes>=byteLimit-Math.min(byteLimit/4,1048576))stopSession(s,'size');
   };
   let creationError;
   for(const mimeType of candidates){
    let recorder;
    try{
     recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:4000000,audioBitsPerSecond:128000});s.recorder=recorder;s.mimeType=recorder.mimeType;
     recorder.ondataavailable=dataAvailable;recorder.onstop=()=>finish(s);recorder.onerror=event=>fail(s,event.error);recorder.start(1000);break;
    }catch(e){
     creationError=e;
     // A format may pass isTypeSupported but still reject its encoder at start.
     if(recorder){recorder.ondataavailable=null;recorder.onstop=null;recorder.onerror=null;if(recorder.state!=='inactive')safely(()=>recorder.stop());}
     s.recorder=null;s.chunks=[];s.bytes=0;
    }
   }
   if(!s.recorder)throw creationError;
   s.startedAt=performance.now();clearTimeout(s.startTimer);change('recording');if(s.finished||s.stopping)return false;
   let lastDraw=0,lastNotify=0;
   const tick=time=>{if(s.finished||s.stopping)return;if(core.closed){stopSession(s,'core-ended');return;}try{if(time-lastDraw>=1000/30){draw();lastDraw=time;}if(time-lastNotify>=250){notify();lastNotify=time;}}catch(e){fail(s,e);return;}s.raf=requestAnimationFrame(tick);};s.raf=requestAnimationFrame(tick);
   s.limitTimer=setTimeout(()=>stopSession(s,'duration'),durationLimit);return true;
  }catch(e){if(!s.finished){s.error=e;stopSession(s,'error');}return false;}
 }
 return {start,stop:(reason='user')=>active?stopSession(active,reason):Promise.resolve(null),get state(){return state;},get duration(){return elapsed(active);}};
}
