// SPDX-License-Identifier: AGPL-3.0-or-later
// Browser adapter for the MPL-2.0 mGBA bridge; see licenses/ and SOURCES.json.
import {tr} from './i18n/index.js';
import {VideoOutput} from './video.js';
import {GBASensors} from './gba-options.js';
import {TimeStretch} from './time-stretch.js';
import {loadCompatibleMGBA} from './mgba-compatibility.js';
import {choosePixelTransfer,createPixelTransfer} from './pixel-transfer.js';
import {GameRumble} from './game-rumble.js';
// Bind every native operation to its own mCore. Heap views remain dynamic when
// WASM memory grows, and the original exports remain usable by older callers.
function coreInstance(module,index){
  if(typeof module._web_select!=='function'){if(index)throw Error(tr('通信機能を開始できません。'));return module;}
  const methods=new Map();
  return new Proxy(module,{get(target,key){
    const value=Reflect.get(target,key);
    if(typeof value!=='function'||!String(key).startsWith('_web_'))return value;
    if(!methods.has(key))methods.set(key,(...args)=>{target._web_select(index);return value.apply(target,args);});
    return methods.get(key);
  },set(target,key,value){methods.delete(key);return Reflect.set(target,key,value);}});
}
export class MGBACore {
  constructor(canvas){this.canvas=canvas;this.keys=0;this.speed=1;this.volume=.7;this.paused=true;this.sources=new Set();this.frames=0;this.presented=0;this.cheatCount=0;this.preservePitch=true;}
  async load(bytes,{sharedCore}={}){
    this.stateIncludesSave=true; // The bridge restores SAVESTATE_SAVEDATA, including the active flash bank.
    if(sharedCore&&!sharedCore.supportsGBLink)throw Error(tr('通信機能を開始できません。'));
    this.nativeModule=sharedCore?.nativeModule||await window.createMGBA({locateFile:p=>new URL('../cores/mgba/'+p,import.meta.url).href});
    this.instance=sharedCore?1:0;this.m=coreInstance(this.nativeModule,this.instance);
    this.pixelTransferChoice=sharedCore?.pixelTransferChoice||choosePixelTransfer(this.m);
    this.compatibility=await loadCompatibleMGBA(this.m,bytes);
    this.width=this.m._web_width();this.height=this.m._web_height();this.video=new VideoOutput(this.canvas,this.width,this.height);this.image=new ImageData(this.width,this.height);this.pixelTransfer=createPixelTransfer(this.m,this.width,this.height,this.pixelTransferChoice.mode);this.fps=this.m._web_fps();this.sensors=new GBASensors((...values)=>this.m._web_sensors?.(...values));
    if(this.supportsGameRumble)this.rumble=new GameRumble({readStrength:()=>this.m._web_rumble_strength(),setEnabled:value=>this.m._web_rumble_enable(value)});
    // The app caches options before load. Apply the clock before the first
    // frame, including while asynchronous save verification is still pending.
    this.applyClockOptions();
    this.startLoop();
  }
  // Display refresh can exceed emulation refresh (for example, 120 Hz phones).
  // Present only new frames, and schedule no emulation callbacks while paused.
  startLoop(){
    cancelAnimationFrame(this.raf);this.raf=null;this.paused=false;this.clock=null;this.rumble?.pause(false);
    this.tick=t=>{
      this.raf=null;if(this.closed||this.paused)return;
      try{
        const step=1000/this.fps/this.speed;if(this.clock===null||t-this.clock>150)this.clock=t;
        let frames=0;if(t>=this.clock){this.beforeFrame?.();if(!this.paused)this.rumble?.prepare();}
        while(!this.paused&&t>=this.clock&&frames<Math.ceil(this.speed*3)){this.m._web_frame(this.keys);this.frames++;frames++;this.audio();this.clock+=step;}
        if(frames){this.draw();this.rumble?.tick();}
      }catch(e){this.pause(true);this.onError?.(e);}
      this.scheduleFrame();
    };this.scheduleFrame();
  }
  scheduleFrame(){if(!this.closed&&!this.paused&&this.tick&&this.raf==null)this.raf=requestAnimationFrame(this.tick);}
  copyIn(bytes,fn){const p=this.m._malloc(bytes.length);if(!p)throw new Error(tr('メモリを確保できませんでした。'));try{this.m.HEAPU8.set(bytes,p);return fn(p,bytes.length);}finally{this.m._free(p);}}
  draw(output=this.video){
    if(this.closed)return;
    this.pixelTransfer??=createPixelTransfer(this.m,this.width,this.height,this.pixelTransferChoice?.mode);
    if(!this.pixelTransfer.copy(this.image.data))return;
    output.draw(this.image);this.presented++;
  }
  async unlockAudio(){const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;this.ac??=new AudioContext();if(!this.gain){this.gain=this.ac.createGain();this.gain.connect(this.ac.destination);this.gain.gain.value=this.volume;}if(this.ac.state!=='running')await this.ac.resume();}
  audio(){
    const m=this.m,n=m._web_audio_read();if(!n)return;
    if(!this.ac||this.ac.state!=='running'||!this.volume||this.nextAudio>this.ac.currentTime+.18){this.stretch?.reset();return;}
    const rate=m._web_audio_rate(),p=m._web_audio()>>1,pcm=m.HEAP16;
    if(this.preservePitch&&this.speed>1){
      if(this.stretch?.rate!==rate||this.stretch?.speed!==this.speed)this.stretch=new TimeStretch(rate,this.speed);
      this.stretch.push(pcm,p,n,(left,right)=>{const buffer=this.ac.createBuffer(2,left.length,rate);buffer.getChannelData(0).set(left);buffer.getChannelData(1).set(right);this.queueAudio(buffer,1);});
    }else{
      // At 1x (or with preservation off), keep the native-rate path unchanged.
      const buffer=this.ac.createBuffer(2,n,rate),left=buffer.getChannelData(0),right=buffer.getChannelData(1);
      for(let i=0;i<n;i++){left[i]=pcm[p+i*2]/32768;right[i]=pcm[p+i*2+1]/32768;}
      this.queueAudio(buffer,this.speed);
    }
  }
  queueAudio(buffer,speed){
    const source=this.ac.createBufferSource();source.buffer=buffer;source.playbackRate.value=speed;source.connect(this.gain);
    source.onended=()=>{source.disconnect();this.sources.delete(source);};this.sources.add(source);
    if(!this.nextAudio||this.nextAudio<this.ac.currentTime+.003)this.nextAudio=this.ac.currentTime+.025;
    source.start(this.nextAudio);this.nextAudio+=buffer.duration/speed;
  }
  setFilter(mode){if(this.video?.mode!==mode)this.video?.setMode(mode);}
  setFilterStrength(value){this.video?.setStrength(value);}
  frameCount(){return this.frames;}
  linkIO(){const m=this.m;if(!m._web_link_enable||m._web_platform()!==0)throw new Error(tr('このコアはGBA通信に対応していません。'));const io={event:null,enable:on=>{if(!m._web_link_enable(on?1:0))throw new Error(tr('通信機能を開始できません。'));if(!on)m._web_overclock?.(this.overclock||1);},read:p=>m._web_link_read(p),write:(p,v)=>m._web_link_write(p,v),mask:v=>m._web_link_mask(v)};m.webLinkEvent=kind=>io.event?.(kind);return io;}
  setCheats(list){for(let i=this.cheatCount-1;i>=0;i--)this.m._web_cheat_remove(i);this.cheatCount=0;const enc=new TextEncoder();for(const cheat of list){const index=this.copyIn(enc.encode(cheat.name+'\0'),p=>this.copyIn(enc.encode(cheat.code+'\0'),q=>this.m._web_cheat_add(p,q,Number(cheat.type))));if(index<0)throw new Error(index===-1000?tr('チートの数・長さを確認してください。'):tr`「${cheat.name}」の${-index}行目を読み込めません。`);this.cheatCount++;this.m._web_cheat_enable(index,cheat.enabled?1:0);}}
  get supportsRTC(){return typeof this.m?._web_rtc_set==='function';}
  get supportsGBLink(){return this.m?._web_platform?.()===1&&typeof this.m?._web_gb_link_frame==='function'&&typeof this.m?._web_select==='function';}
  get supportsGameRumble(){return typeof this.m?._web_rumble_enable==='function'&&typeof this.m?._web_rumble_strength==='function';}
  applyClockOptions(){if(this.clockOptions&&this.supportsRTC)this.m._web_rtc_set(this.clockOptions.mode,this.clockOptions.offset);}
  setCartridgeOptions(options){
    this.overclock=[1,2,4,8].includes(options.overclock)?options.overclock:1;this.m?._web_overclock?.(this.overclock);this.sensors?.configure(options);
    this.clockOptions={mode:options.rtcMode==='offset'?1:0,offset:Number.isInteger(options.rtcOffset)&&Math.abs(options.rtcOffset)<=315576000?options.rtcOffset:0};this.applyClockOptions();
    this.rumble?.configure({enabled:options.gameRumble===true});
  }
  setKeys(mask){this.keys=mask;}
  stopAudio(){for(const s of this.sources){s.onended=null;try{s.stop();}catch{}s.disconnect();}this.sources.clear();this.nextAudio=0;this.stretch?.reset();}
  pause(value){this.paused=value;this.sensors?.pause(value);this.rumble?.pause(value);this.keys=0;this.clock=null;if(value){cancelAnimationFrame(this.raf);this.raf=null;this.stopAudio();}else this.scheduleFrame();}
  setVolume(v){if(!v&&this.volume)this.stopAudio();this.volume=v;if(this.gain)this.gain.gain.value=v;}
  setPreservePitch(value){value=!!value;if(this.preservePitch===value)return;this.preservePitch=value;this.stopAudio();this.stretch=null;}
  setSpeed(v){v=Math.max(1,Math.min(5,Number(v)||1));if(this.speed===v)return;this.speed=v;this.stopAudio();this.clock=null;}
  save(){const n=this.m._web_save_export();return n?this.m.HEAPU8.slice(this.m._web_save_data(),this.m._web_save_data()+n):null;}
  restore(bytes){this.copyIn(bytes,(p,n)=>{if(!this.m._web_save_import(p,n))throw new Error(tr('セーブ形式が一致しません。'));});this.applyClockOptions();}
  state(){const n=this.m._web_state_export();if(!n)throw new Error(tr('状態を保存できませんでした。'));return this.m.HEAPU8.slice(this.m._web_state_data(),this.m._web_state_data()+n);}
  loadState(bytes){this.stopAudio();this.rumble?.stop();this.copyIn(bytes,(p,n)=>{if(!this.m._web_state_import(p,n))throw new Error(tr('このコアで読み込めるステートではありません。'));});this.m._web_overclock?.(this.overclock||1);this.applyClockOptions();this.draw();}
  async restorePreview(url){
    // This bridge's states restore CPU/VRAM, but not the last rendered frame.
    // Show the paired local screenshot while paused, until the next emulated frame.
    if(typeof url!=='string'||!url.startsWith('data:image/png;base64,')||url.length>8*1024*1024)return;
    try{const image=new Image();image.src=url;await image.decode();if(this.paused&&!this.closed)this.video.restorePreview(image);}catch{}
  }
  screenshot(){return this.canvas.toDataURL('image/png');}
  reset(){this.stopAudio();this.rumble?.stop();this.m._web_reset();this.m._web_overclock?.(this.overclock||1);this.applyClockOptions();this.clock=null;}
  close(){this.closed=true;this.sensors?.close();this.rumble?.close();this.pixelTransfer?.dispose();this.pixelTransfer=null;this.video?.dispose();cancelAnimationFrame(this.raf);this.stopAudio();this.ac?.close();this.m?._web_close();}
}
