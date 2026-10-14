// SPDX-License-Identifier: AGPL-3.0-or-later
// Browser adapter for the MPL-2.0 mGBA bridge; see licenses/ and SOURCES.json.
import {tr} from '../i18n/index.js';
import {VideoOutput} from '../rendering/video.js';
import {GBASensors} from './gba-options.js';
import {TimeStretch} from '../rendering/time-stretch.js';
import {loadCompatibleMGBA} from './mgba-compatibility.js';
import {recommendedGBACPUClock,resolveGBACPUClock} from './mgba-clock.js';
import {choosePixelTransfer,createPixelTransfer} from '../rendering/pixel-transfer.js';
import {GameRumble} from '../input/game-rumble.js';
import {performanceDiagnostics} from '../runtime/performance.js';
import {resumeAudioContext,closeAudioContext} from './audio-activation.js';
import {loadCoreResource} from './load-resource.js';
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
// A failed native/renderer/audio resource must not prevent the remaining
// resources from being released. Report the original failure after cleanup.
export function cleanupCoreResources(actions){
  let failed=false,failure;
  for(const action of actions)try{action();}catch(error){if(!failed){failed=true;failure=error;}}
  if(failed)throw failure;
}
export class MGBACore {
  constructor(canvas){this.canvas=canvas;this.keys=0;this.speed=1;this.volume=.7;this.paused=true;this.sources=new Set();this.frames=0;this.presented=0;this.cheatCount=0;this.preservePitch=true;}
  async load(bytes,{sharedCore}={}){
    this.stateIncludesSave=true; // The bridge restores SAVESTATE_SAVEDATA, including the active flash bank.
    this.recommendedOverclock=recommendedGBACPUClock(bytes);
    if(sharedCore&&!sharedCore.supportsGBLink)throw Error(tr('通信機能を開始できません。'));
    const nativeModule=sharedCore?.nativeModule||await loadCoreResource(()=>window.createMGBA({locateFile:p=>new URL('../../cores/mgba/'+p,import.meta.url).href}));
    if(this.closed)throw new DOMException('Core closed during loading','AbortError');
    this.nativeModule=nativeModule;
    this.instance=sharedCore?1:0;this.m=coreInstance(this.nativeModule,this.instance);
    this.pixelTransferChoice=sharedCore?.pixelTransferChoice||choosePixelTransfer(this.m);
    this.compatibility=await loadCompatibleMGBA(this.m,bytes);
    if(this.closed)throw new DOMException('Core closed during loading','AbortError');
    this.saveEpoch=(this.saveEpoch||0)+1;
    this.width=this.m._web_width();this.height=this.m._web_height();this.video=new VideoOutput(this.canvas,this.width,this.height);this.image=new ImageData(this.width,this.height);this.pixelTransfer=createPixelTransfer(this.m,this.width,this.height,this.pixelTransferChoice.mode);this.fps=this.m._web_fps();this.sensors=new GBASensors((...values)=>this.m._web_sensors?.(...values));
    if(this.supportsGameRumble)this.rumble=new GameRumble({readStrength:()=>this.m._web_rumble_strength(),setEnabled:value=>this.m._web_rumble_enable(value)});
    // The app caches options before load. Apply the clock before the first
    // frame, including while asynchronous save verification is still pending.
    this.applyCPUClock();this.applyClockOptions();
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
  get audioState(){
    if(this.closed)return 'closed';
    if(this.audioPaused)return 'paused';
    if(this.ac?.state==='running')return 'running';
    if(this.audioResume)return 'pending';
    return this.ac?'blocked':'unavailable';
  }
  notifyAudioState(){try{this.onAudioState?.(this.audioState);}catch{}}
  observeAudioContext(){
    if(this.observedAudio===this.ac)return;
    this.observedAudio?.removeEventListener?.('statechange',this.audioStateListener);
    this.observedAudio=this.ac;this.audioStateListener=()=>this.notifyAudioState();
    this.ac?.addEventListener?.('statechange',this.audioStateListener);
  }
  trackAudioResume(promise){
    const task={promise};this.audioResume=task;
    promise.then(()=>{if(this.audioResume===task){this.audioResume=null;this.notifyAudioState();}});
    return task;
  }
  adoptAudio(prepared){
    if(this.closed||this.ac)return false;
    const audio=prepared?.take();if(!audio?.context)return false;
    this.ac=audio.context;this.audioPaused=false;this.observeAudioContext();this.trackAudioResume(audio.ready);this.notifyAudioState();return true;
  }
  async unlockAudio({retry=false}={}){
    if(this.closed)return false;
    const AudioContext=window.AudioContext||window.webkitAudioContext;if(!this.ac&&!AudioContext){this.notifyAudioState();return false;}
    const wasPaused=this.audioPaused;this.audioPaused=false;
    try{
      this.ac??=new AudioContext();const ac=this.ac;this.observeAudioContext();
      if(!this.gain){this.gain=ac.createGain();this.gain.connect(ac.destination);this.gain.gain.value=this.volume;}
      // Enqueue resume even if a preceding suspend has not changed state yet.
      // Call it synchronously so a real click/tap can supply user activation.
      if(wasPaused||ac.state!=='running'){
        // An explicit enable-sound tap may retry a resume that the browser left
        // pending. Automatic calls share it rather than flooding the control queue.
        const task=(!retry&&this.audioResume)||this.trackAudioResume(resumeAudioContext(ac));this.notifyAudioState();await task.promise;
      }
      if(this.audioPaused&&!this.closed)await ac.suspend();
      this.notifyAudioState();return !this.closed&&!this.audioPaused&&ac.state==='running';
    }catch{return false;} // Autoplay/OS refusal must not reject an input handler.
  }
  suspendAudio(){
    this.audioPaused=true;this.audioResume=null;this.stopAudio();
    // A local-link child remains emulation-paused while its audio is selected;
    // therefore audio intent is separate from the core's paused flag.
    try{this.ac?.suspend?.()?.catch?.(()=>{});}catch{}this.notifyAudioState();
  }
  disposeAudio(){
    const observed=this.observedAudio;this.audioResume=null;this.observedAudio=null;let closing;
    cleanupCoreResources([
      ()=>observed?.removeEventListener?.('statechange',this.audioStateListener),
      ()=>this.stopAudio(),()=>{closing=closeAudioContext(this.ac);},()=>this.notifyAudioState()
    ]);return closing;
  }
  audio(){
    const m=this.m,n=m._web_audio_read();if(!n)return;
    if(!this.ac||this.ac.state!=='running'||!this.volume){this.stretch?.reset();return;}
    if(this.nextAudio>this.ac.currentTime+.18){
      if(performanceDiagnostics.measuring){performanceDiagnostics.audioQueue(this.nextAudio-this.ac.currentTime,this);performanceDiagnostics.audioOverflow(n,!!this.stretch,this);}
      this.stretch?.reset();return;
    }
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
    if(this.nextAudio>0&&this.nextAudio<this.ac.currentTime&&this.ac.state==='running'&&this.volume>0)performanceDiagnostics.audioGap(this.ac.currentTime-this.nextAudio,this);
    if(!this.nextAudio||this.nextAudio<this.ac.currentTime+.003)this.nextAudio=this.ac.currentTime+.025;
    source.start(this.nextAudio);this.nextAudio+=buffer.duration/speed;
    if(performanceDiagnostics.measuring)performanceDiagnostics.audioQueue(Math.max(0,this.nextAudio-this.ac.currentTime),this);
  }
  setFilter(mode){if(this.video?.mode!==mode)this.video?.setMode(mode);}
  setFilterStrength(value){this.video?.setStrength(value);}
  frameCount(){return this.frames;}
  linkIO(){const m=this.m;if(!m._web_link_enable||m._web_platform()!==0)throw new Error(tr('このコアはGBA通信に対応していません。'));const io={event:null,enable:on=>{if(!m._web_link_enable(on?1:0))throw new Error(tr('通信機能を開始できません。'));if(!on)m._web_overclock?.(this.overclock||1);},read:p=>m._web_link_read(p),write:(p,v)=>m._web_link_write(p,v),mask:v=>m._web_link_mask(v)};m.webLinkEvent=kind=>io.event?.(kind);return io;}
  setCheats(list){for(let i=this.cheatCount-1;i>=0;i--)this.m._web_cheat_remove(i);this.cheatCount=0;const enc=new TextEncoder();for(const cheat of list){const index=this.copyIn(enc.encode(cheat.name+'\0'),p=>this.copyIn(enc.encode(cheat.code+'\0'),q=>this.m._web_cheat_add(p,q,Number(cheat.type))));if(index<0)throw new Error(index===-1000?tr('チートの数・長さを確認してください。'):tr`「${cheat.name}」の${-index}行目を読み込めません。`);this.cheatCount++;this.m._web_cheat_enable(index,cheat.enabled?1:0);}}
  get supportsRTC(){return typeof this.m?._web_rtc_set==='function';}
  get supportsGBLink(){return this.m?._web_platform?.()===1&&typeof this.m?._web_gb_link_frame==='function'&&typeof this.m?._web_select==='function';}
  get supportsGameRumble(){return typeof this.m?._web_rumble_enable==='function'&&typeof this.m?._web_rumble_strength==='function';}
  applyCPUClock(){this.overclock=resolveGBACPUClock(this.clockPreference,this.recommendedOverclock);this.m?._web_overclock?.(this.overclock);}
  applyClockOptions(){if(this.clockOptions&&this.supportsRTC)this.m._web_rtc_set(this.clockOptions.mode,this.clockOptions.offset);}
  setCartridgeOptions(options){
    this.clockPreference=options.overclock;this.applyCPUClock();this.sensors?.configure(options);
    this.clockOptions={mode:options.rtcMode==='offset'?1:0,offset:Number.isInteger(options.rtcOffset)&&Math.abs(options.rtcOffset)<=315576000?options.rtcOffset:0};this.applyClockOptions();
    this.rumble?.configure({enabled:options.gameRumble===true});
  }
  setKeys(mask){this.keys=mask;}
  stopAudio(){
    const sources=[...this.sources];this.sources.clear();this.nextAudio=0;
    cleanupCoreResources([...sources.map(source=>()=>{source.onended=null;try{source.stop();}catch{}source.disconnect();}),()=>this.stretch?.reset()]);
  }
  pause(value){this.paused=value;this.sensors?.pause(value);this.rumble?.pause(value);this.keys=0;this.clock=null;if(value){cancelAnimationFrame(this.raf);this.raf=null;this.suspendAudio();}else this.scheduleFrame();}
  setVolume(v){if(!v&&this.volume)this.stopAudio();this.volume=v;if(this.gain)this.gain.gain.value=v;}
  setPreservePitch(value){value=!!value;if(this.preservePitch===value)return;this.preservePitch=value;this.stopAudio();this.stretch=null;}
  setSpeed(v){v=Math.max(1,Math.min(5,Number(v)||1));if(this.speed===v)return;this.speed=v;this.stopAudio();this.clock=null;}
  save(){const n=this.m._web_save_export();return n?this.m.HEAPU8.slice(this.m._web_save_data(),this.m._web_save_data()+n):null;}
  saveProgress(){return !this.closed&&typeof this.m?._web_save_revision==='function'?{epoch:this.saveEpoch||0,revision:this.m._web_save_revision()>>>0,pending:!!this.m._web_save_pending()}:null;}
  restore(bytes){this.copyIn(bytes,(p,n)=>{if(!this.m._web_save_import(p,n))throw new Error(tr('セーブ形式が一致しません。'));});this.saveEpoch=(this.saveEpoch||0)+1;this.applyClockOptions();}
  state(){const n=this.m._web_state_export();if(!n)throw new Error(tr('状態を保存できませんでした。'));return this.m.HEAPU8.slice(this.m._web_state_data(),this.m._web_state_data()+n);}
  loadState(bytes){this.stopAudio();this.rumble?.stop();this.copyIn(bytes,(p,n)=>{if(!this.m._web_state_import(p,n))throw new Error(tr('このコアで読み込めるステートではありません。'));});this.saveEpoch=(this.saveEpoch||0)+1;this.m._web_overclock?.(this.overclock||1);this.applyClockOptions();this.draw();}
  async restorePreview(url){
    // This bridge's states restore CPU/VRAM, but not the last rendered frame.
    // Show the paired local screenshot while paused, until the next emulated frame.
    if(typeof url!=='string'||!url.startsWith('data:image/png;base64,')||url.length>8*1024*1024)return;
    try{const image=new Image();image.src=url;await image.decode();if(this.paused&&!this.closed)this.video.restorePreview(image);}catch{}
  }
  screenshot(){return this.canvas.toDataURL('image/png');}
  reset(){this.stopAudio();this.rumble?.stop();this.m._web_reset();this.saveEpoch=(this.saveEpoch||0)+1;this.m._web_overclock?.(this.overclock||1);this.applyClockOptions();this.clock=null;}
  close(){
    if(this.closed)return;
    this.closed=true;
    try{cleanupCoreResources([
      ()=>this.sensors?.close(),()=>this.rumble?.close(),()=>this.pixelTransfer?.dispose(),()=>this.video?.dispose(),
      ()=>cancelAnimationFrame(this.raf),()=>this.disposeAudio(),()=>this.m?._web_close(),()=>this.gain?.disconnect?.()
    ]);}finally{
      // A pending audio resume or UI callback can retain this adapter after
      // exit. Do not let that also retain a whole WASM heap. A linked peer
      // keeps its own module reference and its selected instance remains live.
      this.m=null;this.nativeModule=null;this.tick=null;this.image=null;this.raf=null;this.pixelTransfer=null;
      this.sensors=null;this.rumble=null;this.stretch=null;this.gain=null;
    }
  }
}
