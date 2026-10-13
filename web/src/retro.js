// SPDX-License-Identifier: AGPL-3.0-or-later
// Browser frontend for our source-built libretro cores. No RetroArch/EmulatorJS.
import {tr} from './i18n/index.js';
import {MGBACore} from './mgba.js';
import {coreFor} from './core-registry.js';
import {VideoOutput} from './video.js';
const factories=new Map();
async function factory(system){
 if(!factories.has(system))factories.set(system,new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src=new URL(`../cores/${system}/core.js`,import.meta.url).href;
  script.onload=()=>resolve(window.createCore);script.onerror=()=>{factories.delete(system);reject(new Error(tr('コアを読み込めませんでした。')));};document.head.append(script);
 }));return factories.get(system);
}
export class RetroCore extends MGBACore {
 constructor(container){const canvas=document.createElement('canvas');container.append(canvas);super(canvas);}
 async load(bytes,game){
  this.system=game.system;this.multiplayer=['nes','snes','md'].includes(game.system);const directory=coreFor(game).directory,create=await factory(directory);
  this.m=await create({locateFile:()=>new URL(`../cores/${directory}/core.wasm`,import.meta.url).href});
  this.copyIn(bytes,(p,n)=>{if(!this.m._web_load(p,n))throw new Error(tr('このコアでROMを読み込めませんでした。'));});
  this.width=this.m._web_width();this.height=this.m._web_height();this.video?.dispose();this.video=new VideoOutput(this.canvas,this.width,this.height);this.image=new ImageData(this.width,this.height);this.fps=this.m._web_fps();this.startLoop();
 }
 setKeys(mask,player=0){const map=this.system==='md'?[1,0,2,3,7,6,4,5,11,10,10,9,8,11]:[8,0,2,3,7,6,4,5,11,10,9,1,8,11];const keys=map.reduce((out,id,i)=>out|((mask&(1<<i))?1<<id:0),0);this.keys=player?(this.keys&0xffff)|(keys<<16):(this.keys&0xffff0000)|keys;}
 draw(){const w=this.m._web_width(),h=this.m._web_height();if(w!==this.width||h!==this.height){const mode=this.video.mode,strength=this.video.strength;this.width=w;this.height=h;this.video?.dispose();this.video=new VideoOutput(this.canvas,w,h);this.video.setStrength(strength);this.video.setMode(mode);this.image=new ImageData(w,h);}const p=this.m._web_pixels();this.image.data.set(this.m.HEAPU8.subarray(p,p+w*h*4));this.video.draw(this.image);this.presented++;}
 setCheats(list){this.m._web_cheat_reset();const enc=new TextEncoder();list.forEach((cheat,i)=>this.copyIn(enc.encode(cheat.code.replace(/\n/g,'+')+'\0'),p=>this.m._web_cheat_set(i,cheat.enabled?1:0,p)));}
}
