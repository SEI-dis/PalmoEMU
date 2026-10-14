// SPDX-License-Identifier: AGPL-3.0-or-later
// Two independent cartridges/CPUs, one clock and one visible/audio output.
import {tr} from '../i18n/index.js';
export class LocalLinkCore {
  constructor(primary,secondary){
    this.cores=[primary,secondary];this.canvas=primary.canvas;this.video=primary.video;
    this.width=primary.width;this.height=primary.height;this.fps=primary.fps;this.view=0;
    this.beforeFrame=primary.beforeFrame;this.onError=primary.onError;this.paused=true;this.volume=primary.volume;
    this.nativeGB=primary.supportsGBLink&&secondary.nativeModule===primary.nativeModule;
    this.cores.forEach(c=>{c.pause(true);c.setSpeed(1);});
    this.tick=t=>{
      this.raf=null;if(this.paused||this.closed)return;
      try{
        const step=1000/this.fps;if(this.clock===null||t-this.clock>150)this.clock=t;
        let frames=0;if(t>=this.clock)this.beforeFrame?.();
        while(!this.paused&&t>=this.clock&&frames<3){
          if(this.nativeGB){
            const before=this.cores.map(c=>c.m._web_frame_count());
            if(primary.m._web_gb_link_frame(this.view===0?this.keys:0,this.view===1?this.keys:0)!==1)throw Error(tr('通信処理を続けられません。通信前の状態に戻します。'));
            this.cores.forEach((c,i)=>{c.frames+=(c.m._web_frame_count()-before[i])>>>0;});
          }else for(const [i,c]of this.cores.entries()){c.m._web_frame(i===this.view?this.keys:0);c.frames++;}
          for(const [i,c]of this.cores.entries()){if(i===this.view)c.audio();else c.m._web_audio_read();}
          this.clock+=step;frames++;
        }
        if(frames)this.cores[this.view].draw(this.video);
      }catch(e){this.pause(true);this.onError?.(e);}
      if(!this.paused&&!this.closed)this.raf=requestAnimationFrame(this.tick);
    };
  }
  select(view){if(![0,1].includes(view))return;this.setKeys(0);this.cores.forEach(c=>c.stopAudio());this.view=view;this.cores[view].draw(this.video);this.unlockAudio().catch(()=>{});}
  setKeys(mask){this.keys=mask;this.cores.forEach(c=>c.setKeys(0));}
  pause(value){this.paused=value;this.setKeys(0);this.clock=null;cancelAnimationFrame(this.raf);this.raf=null;this.cores.forEach(c=>c.pause(true));if(!value&&!this.closed)this.raf=requestAnimationFrame(this.tick);}
  setVolume(v){this.volume=v;this.cores.forEach(c=>c.setVolume(v));}
  setSpeed(){/* Celio always runs at 1x. */}
  setPreservePitch(value){this.cores.forEach(c=>c.setPreservePitch(value));}
  setFilter(mode){this.cores[0].setFilter(mode);}
  async unlockAudio(){await this.cores[this.view].unlockAudio();}
  frameCount(){return this.cores[0].frameCount();}
  screenshot(){return this.canvas.toDataURL('image/png');}
  dispose(){this.pause(true);this.closed=true;if(this.nativeGB)this.cores[0].m._web_gb_link_stop();this.cores[1].close();}
}

// GB serial has no game-independent "trade finished" packet. The user ends
// both in-game sessions before explicitly committing both saves together.
export class GBLocalLink {
  constructor(paired,{onStatus=()=>{},onClosing=()=>{},onEnd=()=>{}}={}){this.paired=paired;this.onStatus=onStatus;this.onClosing=onClosing;this.onEnd=onEnd;this.kind='local';this.closed=false;this.connected=false;this.manualCompletion=true;}
  async start(){
    if(this.closed||this.connected||!this.paired.nativeGB||!this.paired.cores[0].m._web_gb_link_start())throw Error(tr('通信機能を開始できません。'));
    this.connected=true;this.onStatus(tr('1P・2Pを切り替えて、両方のゲームでケーブル通信の受付へ進んでください。'));
  }
  get canComplete(){return this.connected&&!this.closed&&!this.paired.cores[0].m._web_gb_link_busy();}
  close(reason=tr('通信を中止しました。'),{keep=false}={}){
    if(this.completion)return this.completion;
    if(keep&&this.paired.cores[0].m._web_gb_link_busy())return Promise.reject(Error(tr('まだ通信データを転送しています。両方のゲームで通信を終えてから保存してください。')));
    this.closed=true;this.connected=false;this.onClosing();
    this.completion=Promise.resolve().then(async()=>{
      this.paired.cores[0].m._web_gb_link_stop();
      await this.onEnd(reason,{keep});
    });return this.completion;
  }
}
