// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapter for the source-built DeSmuME 2015 core. See sources/nds-web/BUILD.md.
import {tr} from '../i18n/index.js';
import {normalizeNDSSave} from './nds-save.js';
import {MGBACore,cleanupCoreResources} from './mgba.js';
import {loadCoreResource} from './load-resource.js';
import {VideoOutput} from '../rendering/video.js';
import {screenBounds} from '../skins/control-layout.js';
import {coreFor} from './core-registry.js';
const factories=new Map();
export const ndsLanguages=['default','ja','en','fr','de','it','es'];
function loadFactory(directory){
 if(factories.has(directory))return factories.get(directory);
 const pending=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src=new URL(`../../cores/${directory}/core.js`,import.meta.url).href;
  script.onload=()=>resolve(window.createNDS);script.onerror=()=>{factories.delete(directory);reject(Error(tr('NDSコアを読み込めませんでした。')));};document.head.append(script);
 });factories.set(directory,pending);return pending;
}
export class NDSCore extends MGBACore {
 constructor(container){
  super(document.createElement('canvas'));this.container=container;
  this.display=document.createElement('div');this.display.className='nds-display';container.append(this.display);
  this.screens=[0,1].map(i=>{const canvas=document.createElement('canvas');canvas.className=i?'nds-bottom':'nds-top';canvas.setAttribute('aria-label',i?tr('NDS タッチスクリーン'):tr('NDS 上画面'));this.display.append(canvas);return canvas;});
  this.videos=this.screens.map(c=>new VideoOutput(c,256,192));this.images=[new ImageData(256,192),new ImageData(256,192)];
  const touch=this.screens[1];
  const position=e=>{
   const rect=touch.getBoundingClientRect(),fit=getComputedStyle(touch).objectFit;
   let width=rect.width,height=rect.height,left=rect.left,top=rect.top;
   if(fit!=='fill'){const scale=(fit==='cover'?Math.max:Math.min)(width/256,height/192);width=256*scale;height=192*scale;left+=(rect.width-width)/2;top+=(rect.height-height)/2;}
   const x=(e.clientX-left)/width,y=(e.clientY-top)/height;
   if(x<0||y<0||x>=1||y>=1){this.releaseTouch();return;}
   this.touchAt(x,y);
  };
  touch.onpointerdown=e=>{if(this.paused||e.button>0||this.pointer!=null)return;e.preventDefault();this.pointer=e.pointerId;touch.setPointerCapture(e.pointerId);this.unlockAudio();position(e);};
  touch.onpointermove=e=>{if(e.pointerId===this.pointer&&!this.paused)position(e);};
  const up=e=>{if(e.pointerId===this.pointer){this.pointer=null;this.releaseTouch();}};
  touch.onpointerup=up;touch.onpointercancel=up;touch.onlostpointercapture=up;
 }
 async load(bytes,game={system:'nds'}){
  if(bytes instanceof Blob)bytes=new Uint8Array(await bytes.arrayBuffer());
  this.core=coreFor(game);const module=await loadCoreResource(async()=>{const create=await loadFactory(this.core.directory);return create({locateFile:()=>new URL(`../../cores/${this.core.directory}/core.wasm`,import.meta.url).href});});
  if(this.closed)throw new DOMException('Core closed during loading','AbortError');
  this.m=module;
  // Firmware is created during core initialization. Live settings are retained
  // for the next launch, never applied by resetting the current game.
  this.m._web_set_language?.(ndsLanguages.indexOf(this.ndsLanguage||'default')-1);
  this.copyIn(bytes,(p,n)=>{if(!this.m._web_load(p,n))throw Error(tr('このNDS ROMを読み込めませんでした。'));});
  this.width=256;this.height=384;this.fps=this.m._web_fps();this.startLoop();
 }
 setNDSOptions({ndsLanguage='default'}={}){this.ndsLanguage=ndsLanguages.includes(ndsLanguage)?ndsLanguage:'default';}
 get supportsNDSLanguage(){return typeof this.m?._web_set_language==='function';}
 get canBlow(){return !this.closed&&typeof this.m?._web_blow==='function';}
 get canSetLid(){return !this.closed&&typeof this.m?._web_set_lid==='function'&&typeof this.m?._web_get_lid==='function';}
 get lidClosed(){return this.canSetLid&&!!this.m._web_get_lid();}
 setLidClosed(closed){if(!this.canSetLid)return false;this.stopBlowing();this.pointer=null;this.releaseTouch();return !!this.m._web_set_lid(closed?1:0);}
 // ManicEMU's simBlowing action uses a five-second synthetic microphone input.
 // The C adapters map this to each pinned core's public libretro input; no
 // microphone permission, device recording or network request is involved.
 blow(){
  if(!this.canBlow||this.paused)return false;
  this.stopBlowing();this.blowing=true;this.m._web_blow(1);
  this.blowTimer=setTimeout(()=>this.stopBlowing(),5000);return true;
 }
 stopBlowing(){clearTimeout(this.blowTimer);this.blowTimer=null;this.blowing=false;this.m?._web_blow?.(0);}
 restore(bytes){super.restore(normalizeNDSSave(bytes,{maxBytes:this.core.maxSave}));}
 loadState(bytes){this.stopBlowing();super.loadState(bytes);}
 reset(){this.stopBlowing();super.reset();}
 setKeys(mask){const map=[8,0,2,3,7,6,4,5,11,10,9,1];this.keys=map.reduce((out,id,i)=>out|((mask&(1<<i))?1<<id:0),0);}
 setRenderLimit(enabled){if(this.core?.renderLimit===false)return;if(this.renderLimit===enabled)return;this.renderLimit=enabled;this.m?._web_render_limit(enabled?1:0);}
 setLayout(wide,swap=false,rep){
  this.pointer=null;this.releaseTouch();this.display.dataset.wide=String(wide);this.display.dataset.swap=String(swap);
  const framed=rep?.screens.length===2;this.display.dataset.framed=String(framed);
  const bounds=framed?screenBounds(rep):null;
  this.screens.forEach((canvas,i)=>{
   if(!framed){canvas.removeAttribute('style');return;}
   const f=rep.screens[swap?1-i:i].outputFrame;
   canvas.style.cssText=`left:${(f.x-bounds.x)/bounds.width*100}%;top:${(f.y-bounds.y)/bounds.height*100}%;width:${f.width/bounds.width*100}%;height:${f.height/bounds.height*100}%;`;
   for(const [key,value]of Object.entries({x:canvas.style.left,y:canvas.style.top,w:canvas.style.width,h:canvas.style.height}))this.display.style.setProperty(`--screen-${i}-${key}`,value);
  });
 }
 touchAt(x,y){if(this.paused||x<0||y<0||x>=1||y>=1){this.releaseTouch();return;}this.m?._web_touch(Math.min(32767,Math.round(x*65535-32768)),Math.min(32767,Math.round(y*32768)),1);}
 releaseTouch(){this.m?._web_touch(0,0,0);}
 pause(value){super.pause(value);if(value){this.stopBlowing();this.pointer=null;this.releaseTouch();}}
 draw(){
  const serial=this.m._web_frame_serial();if(serial===this.lastSerial)return;this.lastSerial=serial;
  const ptr=this.m._web_pixels(),bytes=256*192*4;
  for(let i=0;i<2;i++){this.images[i].data.set(this.m.HEAPU8.subarray(ptr+i*bytes,ptr+(i+1)*bytes));this.videos[i].draw(this.images[i]);}
  this.presented++;
 }
 setFilter(mode){for(const video of this.videos)if(video.mode!==mode)video.setMode(mode);}
 screenshot(){
  const [top,bottom]=this.screens;if(this.canvas.width!==top.width)this.canvas.width=top.width;if(this.canvas.height!==top.height*2)this.canvas.height=top.height*2;
  const ctx=this.canvas.getContext('2d');ctx.drawImage(top,0,0);ctx.drawImage(bottom,0,top.height);return this.canvas.toDataURL('image/png');
 }
 async restorePreview(url){
  if(typeof url!=='string'||!url.startsWith('data:image/png;base64,')||url.length>8*1024*1024)return;
  try{const image=new Image();image.src=url;await image.decode();if(!this.paused||this.closed)return;
   for(let i=0;i<2;i++){const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height/2;canvas.getContext('2d').drawImage(image,0,i*canvas.height,canvas.width,canvas.height,0,0,canvas.width,canvas.height);this.videos[i].restorePreview(canvas);}
  }catch{}
 }
 setCheats(list){
  const enabled=list.filter(c=>c.enabled);if(enabled.some(c=>c.code.length>=1024||!/^[\da-fA-F\s+]+$/.test(c.code)))throw Error(tr('NDSはAction Replay形式（16進数、1023文字以内）で入力してください。'));
  this.m._web_cheat_reset();const enc=new TextEncoder();enabled.forEach((c,i)=>this.copyIn(enc.encode(c.code.replace(/\n/g,'+')+'\0'),p=>this.m._web_cheat_set(i,1,p)));
 }
 close(){
  if(this.closed)return;
  cleanupCoreResources([()=>this.stopBlowing(),...this.videos.map(video=>()=>video.dispose()),()=>this.releaseTouch(),()=>super.close(),()=>this.display.remove()]);
 }
}
