// SPDX-License-Identifier: AGPL-3.0-or-later
// Original common shortcut. Imported skin frames and input mappings stay intact.
import {tr} from '../i18n/index.js';
import {applyControlLayout} from '../skins/control-layout.js';
export function cameraLayout(source,layout,width,height,{enabled=true,hitSlop=0,fallbackBoost=true}={}){
 if(!enabled)return source;
 const rep={...source,mappingSize:{...source.mappingSize},cameraBaseSize:{...source.mappingSize},actions:[...source.actions||[]]},map=rep.mappingSize;
 const ratio=Math.min(width/map.width,height/map.height),size=40/ratio,gap=8/ratio;
 const occupied=[...rep.screens.map(s=>s.outputFrame),...rep.items.map(i=>{
  const e=i.extendedEdges||{},n=hitSlop/ratio;return {x:i.frame.x-(e.left||0)-n,y:i.frame.y-(e.top||0)-n,width:i.frame.width+(e.left||0)+(e.right||0)+n*2,height:i.frame.height+(e.top||0)+(e.bottom||0)+n*2};
 }),...rep.actions.map(a=>a.frame),{x:0,y:0,width:map.width,height:48/ratio}];
 // Imported skins without an authored speed action keep the common bottom-right button.
 if(fallbackBoost&&!rep.actions.some(a=>a.id==='boost')&&!rep.items.some(i=>Array.isArray(i.inputs)&&i.inputs.some(k=>k==='toggleFastForward'||/^fastForward/.test(k))))occupied.push({x:map.width-50/ratio,y:map.height-50/ratio,width:38/ratio,height:38/ratio});
 const free=f=>occupied.every(r=>f.x+f.width+gap<=r.x||f.x>=r.x+r.width+gap||f.y+f.height+gap<=r.y||f.y>=r.y+r.height+gap);
 let frame;
 // Prefer a central lower gap away from the save/load pair, then other gaps.
 const xs=[(map.width-size)/2,gap,map.width-size-gap,...occupied.flatMap(r=>[r.x-size-gap,r.x+r.width+gap])];
 const ys=[map.height-size-gap,...occupied.flatMap(r=>[r.y-size-gap,r.y+r.height+gap])].sort((a,b)=>b-a);
 outer:for(const y of ys)for(const x of xs){const f={x,y,width:size,height:size};if(x>=gap&&y>=gap&&x+size<=map.width-gap&&y+size<=map.height-gap&&free(f)){frame=f;break outer;}}
 if(!frame){
  // Dense/full-screen skins have no safe gap. Only this case adds a slim rail;
  // the original skin is uniformly fitted and its authored coordinates remain.
  rep.artFrame=rep.artFrame||{x:0,y:0,...map};frame={x:(map.width-size)/2,y:map.height+gap,width:size,height:size};map.height+=size+gap*2;
 }
 const camera={id:'player-camera',label:tr('スクリーンショット'),icon:'camera',frame};
 applyControlLayout({mappingSize:map,items:[],actions:[camera],screens:[]},layout);
 rep.actions.push(camera);return rep;
}
export function cameraBackgroundSize(rep){const f=rep.artFrame;return f?`${f.width/rep.mappingSize.width*100}% ${f.height/rep.mappingSize.height*100}%`:'100% 100%';}
export function bindCameraButton(button,capture,{beginMove}={}){
 let pointer=null,busy=false;
 button.dataset.gameInput='';
 const finish=()=>{const active=pointer;pointer=null;if(active)clearTimeout(active.timer);button.classList.remove('camera-moving');return active;};
 const cancel=()=>{const active=finish();active?.move?.cancel();if(active)try{button.releasePointerCapture(active.id);}catch{}};
 button.onpointerdown=event=>{
  if(event.button>0||pointer||busy)return;event.preventDefault();
  const active=pointer={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false,long:false,move:null};
  try{button.setPointerCapture(event.pointerId);}catch{}
  active.timer=setTimeout(()=>{if(pointer!==active||active.moved)return;active.long=true;active.move=beginMove?.()||null;if(active.move)button.classList.add('camera-moving');},400);
 };
 button.onpointermove=event=>{
  if(pointer?.id!==event.pointerId)return;event.preventDefault();
  const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
  if(pointer.move)pointer.move.update(dx,dy);
  else if(Math.hypot(dx,dy)>12){pointer.moved=true;clearTimeout(pointer.timer);}
 };
 button.onpointerup=event=>{
  if(pointer?.id!==event.pointerId)return;event.preventDefault();const active=finish();
  if(active.move){
   if(event.clientX<0||event.clientY<0||event.clientX>innerWidth||event.clientY>innerHeight){active.move.cancel();return;}
   active.move.update(event.clientX-active.x,event.clientY-active.y);busy=true;button.setAttribute('aria-busy','true');
   Promise.resolve().then(()=>active.move.commit()).catch(()=>active.move.cancel()).finally(()=>{busy=false;button.removeAttribute('aria-busy');});
  }else{const r=button.getBoundingClientRect();if(!active.long&&!active.moved&&Math.hypot(event.clientX-active.x,event.clientY-active.y)<=12&&event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom)capture(event);}
 };
 button.onpointercancel=cancel;button.onlostpointercapture=cancel;
 button.onclick=event=>{event.preventDefault();if(event.detail===0&&!pointer&&!busy)capture(event);};
 button.onkeydown=event=>{if(['Enter','Space'].includes(event.code)){event.preventDefault();event.stopPropagation();if(!event.repeat&&!pointer&&!busy)capture(event);}};
 button.onkeyup=event=>{if(['Enter','Space'].includes(event.code)){event.preventDefault();event.stopPropagation();}};
 const visibility=()=>{if(document.hidden)cancel();};
 window.addEventListener('blur',cancel);window.addEventListener('resize',cancel);document.addEventListener('visibilitychange',visibility);
 const dispose=()=>{window.removeEventListener('blur',cancel);window.removeEventListener('resize',cancel);document.removeEventListener('visibilitychange',visibility);cancel();};dispose.cancel=cancel;return dispose;
}
