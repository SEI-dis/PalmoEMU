// SPDX-License-Identifier: AGPL-3.0-or-later
// Original local Canvas editor. The caller owns and closes the source bitmap.
import {squareCrop,cropBounds,moveCrop,zoomCrop} from './cover-crop-math.js';

export function mountCoverCrop(canvas,slider,bitmap){
 let crop=squareCrop(bitmap.width,bitmap.height),source=bitmap,frame=null,gesture=null,closed=false,disabled=false;
 const pointers=new Map(),listeners=[];
 const listen=(target,type,handler,options)=>{target.addEventListener(type,handler,options);listeners.push(()=>target.removeEventListener(type,handler,options));};
 function draw(context,size){const bounds=cropBounds(crop);context.clearRect(0,0,size,size);context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(source,bounds.x,bounds.y,bounds.size,bounds.size,0,0,size,size);}
 function render(){
  if(closed)return;frame=null;
  const size=Math.max(1,Math.min(1024,Math.round(canvas.clientWidth*Math.min(window.devicePixelRatio||1,2))));
  if(canvas.width!==size||canvas.height!==size)canvas.width=canvas.height=size;
  draw(canvas.getContext('2d'),size);slider.value=String(Math.round(crop.zoom*100));
 }
 const update=()=>{if(!closed&&frame===null)frame=requestAnimationFrame(render);};
 const point=event=>{const rect=canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height};};
 const midpoint=points=>points.length===1?points[0]:{x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2};
 const distance=points=>points.length<2?0:Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
 const rebase=()=>{const points=[...pointers.values()];gesture=points.length?{crop:{...crop},count:points.length,mid:midpoint(points),distance:distance(points)}:null;canvas.classList.toggle('dragging',!!gesture);};
 const cancelPointers=()=>{const ids=[...pointers.keys()];pointers.clear();rebase();for(const id of ids)try{if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}catch{}};
 listen(canvas,'pointerdown',event=>{
  if(disabled||closed||event.button!==0||pointers.size>=2)return;
  event.preventDefault();canvas.focus({preventScroll:true});pointers.set(event.pointerId,point(event));rebase();
  try{canvas.setPointerCapture(event.pointerId);}catch{pointers.delete(event.pointerId);rebase();}
 });
 listen(canvas,'pointermove',event=>{
  if(disabled||!pointers.has(event.pointerId)||!gesture)return;event.preventDefault();pointers.set(event.pointerId,point(event));
  const points=[...pointers.values()],mid=midpoint(points);
  crop=gesture.count===2&&gesture.distance>0?zoomCrop(gesture.crop,gesture.crop.zoom*distance(points)/gesture.distance,gesture.mid,mid):moveCrop(gesture.crop,mid.x-gesture.mid.x,mid.y-gesture.mid.y);update();
 });
 const end=event=>{if(!pointers.delete(event.pointerId))return;rebase();};
 for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(canvas,type,end);
 for(const type of ['contextmenu','dblclick','gesturestart','gesturechange','gestureend'])listen(canvas,type,event=>event.preventDefault(),{passive:false});
 listen(canvas,'keydown',event=>{
  if(disabled||event.altKey||event.ctrlKey||event.metaKey)return;
  const movement={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
  if(!movement)return;event.preventDefault();event.stopPropagation();cancelPointers();const step=event.shiftKey ? .1 : .025;crop=moveCrop(crop,movement[0]*step,movement[1]*step);update();
 });
 listen(slider,'input',()=>{if(disabled)return;cancelPointers();crop=zoomCrop(crop,Number(slider.value)/100);update();});
 const observer=new ResizeObserver(()=>{cancelPointers();update();});observer.observe(canvas);render();
 return {
  toDataURL(){if(closed)throw Error('Crop editor is closed');const output=document.createElement('canvas'),size=Math.max(1,Math.min(512,Math.floor(cropBounds(crop).size)));output.width=output.height=size;try{draw(output.getContext('2d'),size);return output.toDataURL('image/webp',.85);}finally{output.width=output.height=1;}},
  setDisabled(value){disabled=!!value;slider.disabled=disabled;canvas.setAttribute('aria-disabled',String(disabled));if(disabled)cancelPointers();},
  dispose(){if(closed)return;closed=true;cancelPointers();if(frame!==null)cancelAnimationFrame(frame);frame=null;observer.disconnect();listeners.splice(0).forEach(remove=>remove());source=null;canvas.width=canvas.height=1;}
 };
}
