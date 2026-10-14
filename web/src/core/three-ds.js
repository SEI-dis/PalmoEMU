// SPDX-License-Identifier: AGPL-3.0-or-later
// Reuse the existing dual-screen UI; run the source-built 3DS core in its own worker.
import {tr,language} from '../i18n/index.js';
import {VideoOutput} from '../rendering/video.js';
import {TimeStretch} from '../rendering/time-stretch.js';
import {NDSCore} from './nds.js';
import {coreFor} from './core-registry.js';
export class ThreeDSCore extends NDSCore {
 constructor(container){
  super(container);this.pending=new Map();this.sequence=0;this.frames=0;this.paused=true;
  this.width=400;this.height=480;this.screens.forEach((c,i)=>{c.width=i?320:400;c.height=240;c.setAttribute('aria-label',i?tr('3DS タッチスクリーン'):tr('3DS 上画面'));});
  this.rawScreens=this.screens.map(c=>{const raw=document.createElement('canvas');raw.width=c.width;raw.height=c.height;return raw;});
  this.videos=this.screens.map(c=>new VideoOutput(c,c.width,c.height));
 }
 async load(blob,game){
  if(!crossOriginIsolated||typeof SharedArrayBuffer!=='function')throw Error(tr('3DSの起動に必要な設定が反映されていません。ページを開き直してください。'));
  this.core=coreFor(game);this.keyboard=new SharedArrayBuffer(1040);
  this.worker=new Worker(new URL('./three-ds-worker.js',import.meta.url));
  this.worker.onmessage=({data})=>this.receive(data);
  this.worker.onerror=e=>this.failure(Error(e.message||tr('3DSコアを読み込めませんでした。')));
  const result=await this.call('load',{language,blob:blob instanceof Blob?blob:new Blob([blob]),filename:game.filename,keyboard:this.keyboard});
  this.fps=result.fps;
  const poll=()=>{if(this.closed)return;if(!this.paused)this.beforeFrame?.();this.raf=requestAnimationFrame(poll);};poll();
 }
 call(type,data={}){
  if(!this.worker||this.closed)return Promise.reject(Error(tr('3DSコアは終了しています。')));
  return new Promise((resolve,reject)=>{const id=++this.sequence;
   const timer=setTimeout(()=>{this.pending.delete(id);reject(Error(tr('3DSコアの応答がありません。')));},180000);
   this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({type,id,...data});
  });
 }
 send(type,data={}){if(!this.closed)this.worker?.postMessage({type,...data});}
 failure(error){this.pause(true);for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();this.onError?.(error);}
 receive(data){
  if(data.type==='reply'){const p=this.pending.get(data.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.result);}
  else if(data.type==='fatal')this.failure(Error(data.error));
  else if(data.type==='frame'){
   try{if(!this.closed){this.drawBitmap(data.bitmap);this.frames=data.frames;this.presented++;}}
   finally{data.bitmap.close();this.send('ack');}
  }else if(data.type==='audio'){
   if(this.paused||!this.ac||this.ac.state!=='running'||!this.volume||this.nextAudio>this.ac.currentTime+.18)return;
   const n=data.pcm.length/2;
   if(this.preservePitch&&this.speed>1){
    if(this.stretch?.rate!==data.rate||this.stretch?.speed!==this.speed)this.stretch=new TimeStretch(data.rate,this.speed);
    this.stretch.push(data.pcm,0,n,(l,r)=>{const out=this.ac.createBuffer(2,l.length,data.rate);out.getChannelData(0).set(l);out.getChannelData(1).set(r);this.queueAudio(out,1);});
   }else{const buffer=this.ac.createBuffer(2,n,data.rate),left=buffer.getChannelData(0),right=buffer.getChannelData(1);for(let i=0;i<n;i++){left[i]=data.pcm[i*2]/32768;right[i]=data.pcm[i*2+1]/32768;}this.queueAudio(buffer,this.speed);}
  }else if(data.type==='keyboard'){
   this.stopAudio();Promise.resolve(this.onKeyboard?.(data)).then(answer=>{
    const flags=new Int32Array(this.keyboard,0,4),bytes=answer==null?null:new TextEncoder().encode(String(answer).slice(0,data.maxLength));
    if(bytes&&bytes.length<=1024){new Uint8Array(this.keyboard,16).set(bytes);Atomics.store(flags,1,bytes.length);Atomics.store(flags,0,1);}else Atomics.store(flags,0,2);
    Atomics.notify(flags,0);
   }).catch(()=>{const flags=new Int32Array(this.keyboard,0,4);Atomics.store(flags,0,2);Atomics.notify(flags,0);});
  }
 }
 setKeys(mask){if(this.keyMask===mask)return;this.keyMask=mask;this.send('keys',{mask});}
 touchAt(x,y){if(this.paused)return;this.send('touch',{x,y,down:true});}
 releaseTouch(){this.send('touch',{x:0,y:0,down:false});}
 pause(value){this.paused=!!value;this.keyMask=null;this.stopAudio();this.send('pause',{value:this.paused});if(value)this.releaseTouch();}
 setSpeed(value){super.setSpeed(value);this.send('speed',{value:this.speed});}
 setVolume(value){super.setVolume(value);this.send('volume',{value});}
 setCheats(list){if(list?.some(c=>c.enabled))throw Error(tr('この3DSコアはチートに対応していません。'));}
 setRenderLimit(){}
 presentScreens(){this.rawScreens.forEach((c,i)=>{const video=this.videos[i];if(video.enlarged||video.gpuMode)video.draw(c.getContext('2d').getImageData(0,0,c.width,c.height));else video.restorePreview(c);});}
 drawBitmap(bitmap){this.rawScreens.forEach((c,i)=>c.getContext('2d').drawImage(bitmap,i?40:0,i?240:0,c.width,240,0,0,c.width,240));this.presentScreens();}
 setFilter(mode){super.setFilter(mode);this.presentScreens();}
 save(){return this.call('save');}
 restore(bytes){return this.call('restore',{bytes});}
 state(){return this.call('state');}
 checkpoint(){return this.call('checkpoint');}
 loadState(bytes){this.stopAudio();return this.call('loadState',{bytes});}
 reset(){this.stopAudio();return this.call('reset');}
 screenshot(){this.canvas.width=400;this.canvas.height=480;const ctx=this.canvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,400,480);ctx.drawImage(this.rawScreens[0],0,0);ctx.drawImage(this.rawScreens[1],40,240);return this.canvas.toDataURL('image/png');}
 async restorePreview(url){
  if(typeof url!=='string'||!url.startsWith('data:image/png;base64,')||url.length>8*1048576)return;
  try{const image=new Image();image.src=url;await image.decode();if(!this.closed&&this.paused)this.drawBitmap(image);}catch{}
 }
 async close(){this.videos.forEach(video=>video.dispose());
  if(this.closed)return;this.pause(true);cancelAnimationFrame(this.raf);
  const flags=this.keyboard&&new Int32Array(this.keyboard,0,4);if(flags){Atomics.store(flags,0,2);Atomics.notify(flags,0);}
  try{await Promise.race([this.call('close'),new Promise(r=>setTimeout(r,3000))]);}finally{
   this.closed=true;this.worker?.terminate();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error(tr('コアを終了しました。')));}this.pending.clear();this.stopAudio();await this.ac?.close();this.display.remove();
  }
 }
}
