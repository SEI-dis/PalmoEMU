// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from './i18n/index.js';
import {MGBACore} from './mgba.js';
import {VideoOutput} from './video.js';
let runtime;
async function loadRuntime(){return runtime??=import('../cores/jgenesis/core.js').then(async module=>({Game:module.Game,wasm:await module.default()})).catch(e=>{runtime=null;throw e;});}
export class JgenesisCore extends MGBACore {
 constructor(container){const canvas=document.createElement('canvas');container.append(canvas);super(canvas);this.stateIncludesSave=true;}
 async load(bytes,game){
  const {Game,wasm}=await loadRuntime();this.multiplayer=['nes','snes','md'].includes(game.system);this.Game=Game;this.wasm=wasm;this.rom=bytes;this.system={md:0,gb:1,gbc:2,nes:3,snes:4}[game.system];
  this.game=new Game(this.system,bytes,new Uint8Array());
  const engine=this;
  this.m={_web_close:()=>{},_web_frame:keys=>engine.game.frame(keys),_web_audio_read:()=>engine.game.audio_len(),_web_audio:()=>engine.game.audio_ptr(),_web_audio_rate:()=>48000,get HEAP16(){return new Int16Array(wasm.memory.buffer);}};
  this.fps=this.game.fps();this.draw();this.startLoop();
 }
 setKeys(mask,player=0){this.keys=player?(this.keys&0xffff)|((mask&0x3fff)<<16):(this.keys&0xffff0000)|(mask&0x3fff);}
 draw(){
  const w=this.game.width(),h=this.game.height();if(!w||!h)return;
  if(w!==this.width||h!==this.height){const mode=this.video?.mode,strength=this.video?.strength;this.width=w;this.height=h;this.video?.dispose();this.video=new VideoOutput(this.canvas,w,h);this.video.setStrength(strength);if(mode)this.video.setMode(mode);this.image=new ImageData(w,h);this.target=new Uint32Array(this.image.data.buffer);}
  const pixels=new Uint32Array(this.wasm.memory.buffer,this.game.pixels_ptr(),w*h);for(let i=0;i<pixels.length;i++)this.target[i]=pixels[i]|0xff000000;
  this.video.draw(this.image);this.presented++;
 }
 save(){return this.game.save();}
 restore(bytes){const next=new this.Game(this.system,this.rom,bytes);this.stopAudio();this.game.free();this.game=next;this.clock=null;this.draw();}
 state(){return this.game.state();}
 loadState(bytes){this.stopAudio();this.game.load_state(bytes);this.clock=null;this.draw();}
 setCheats(list){if(list.length)throw Error(tr('このコアのチート機能には対応していません。'));}
 reset(){this.stopAudio();this.game.reset();this.clock=null;}
 close(){this.video?.dispose();super.close();this.game?.free();this.game=null;this.rom=null;}
}
