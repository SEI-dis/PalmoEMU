// SPDX-License-Identifier: AGPL-3.0-or-later
// Pixel art edge interpolation. Does not add detail to the game's native image.
// Scale4x applies this port's Scale2x pass twice: https://www.scale2x.it/algorithm
import {tr} from './i18n/index.js';
export const videoFilters=[['pixel',tr('ピクセル')],['smooth',tr('なめらか')],['scanlines',tr('スキャンライン')],['edge2x',tr('輪郭補正2倍')],['edge4x',tr('輪郭補正4倍（高品質）')]];

const observers=new WeakMap();
export function observeVideo(canvas,callback){observers.set(canvas,callback);return()=>{if(observers.get(canvas)===callback)observers.delete(canvas);};}
const present=canvas=>observers.get(canvas)?.();

function scale2x(src,dst,w,h){
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,c=src[i],up=src[(y?y-1:y)*w+x],down=src[(y<h-1?y+1:y)*w+x],left=src[y*w+(x?x-1:x)],right=src[y*w+(x<w-1?x+1:x)],o=y*4*w+x*2;
  const edges=up!==down&&left!==right;
  dst[o]=edges&&left===up?left:c;dst[o+1]=edges&&up===right?right:c;
  dst[o+2*w]=edges&&left===down?left:c;dst[o+2*w+1]=edges&&down===right?right:c;
 }
}

export class VideoOutput {
 constructor(canvas,width,height){this.canvas=canvas;this.width=width;this.height=height;this.setMode('pixel');}
 setMode(mode){
  mode=videoFilters.some(([id])=>id===mode)?mode:'pixel';
  if(this.mode===mode)return;
  this.mode=mode;const n=mode==='edge4x'?4:mode==='edge2x'?2:1;
  this.canvas.width=this.width*n;this.canvas.height=this.height*n;this.ctx=this.canvas.getContext('2d',{alpha:false});
  this.enlarged=n>1?this.ctx.createImageData(this.canvas.width,this.canvas.height):null;
  this.enlargedWords=this.enlarged?new Uint32Array(this.enlarged.data.buffer):null;
  // Reuse both passes' buffers for every frame, and release them in lighter modes.
  this.intermediate=n===4?new Uint32Array(this.width*this.height*4):null;
  // Changing a filter in the paused menu must not clear the current picture.
  if(this.preview)this.restorePreview(this.preview);else if(this.sourceImage)this.draw(this.sourceImage);
 }
 draw(image){
  this.preview=null;
  if(this.sourceImage!==image){this.sourceImage=image;this.sourceWords=new Uint32Array(image.data.buffer,image.data.byteOffset,this.width*this.height);}
  if(!this.enlarged){this.ctx.putImageData(image,0,0);present(this.canvas);return;}
  if(this.intermediate){scale2x(this.sourceWords,this.intermediate,this.width,this.height);scale2x(this.intermediate,this.enlargedWords,this.width*2,this.height*2);}
  else scale2x(this.sourceWords,this.enlargedWords,this.width,this.height);
  this.ctx.putImageData(this.enlarged,0,0);present(this.canvas);
 }
 restorePreview(image){this.preview=image;this.ctx.imageSmoothingEnabled=false;this.ctx.drawImage(image,0,0,this.canvas.width,this.canvas.height);present(this.canvas);}
}
