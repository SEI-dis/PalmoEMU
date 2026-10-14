// SPDX-License-Identifier: AGPL-3.0-or-later
// Non-modal panel: only its own rectangle receives input; the game stays usable.
export function floatingPanel(element,{handle,trigger,close,onInteract=()=>{}}){
 let position=null,drag=null;
 const viewport=()=>{
  const v=window.visualViewport,style=getComputedStyle(element.parentElement);
  return {left:(v?.offsetLeft||0)+parseFloat(style.paddingLeft)+8,top:(v?.offsetTop||0)+parseFloat(style.paddingTop)+8,
   right:(v?.offsetLeft||0)+(v?.width||innerWidth)-parseFloat(style.paddingRight)-8,
   bottom:(v?.offsetTop||0)+(v?.height||innerHeight)-parseFloat(style.paddingBottom)-8};
 };
 function place(){
  if(element.hidden)return;
  const bounds=viewport();element.style.maxHeight=Math.max(48,bounds.bottom-bounds.top)+'px';
  element.style.width=Math.min(320,Math.max(0,bounds.right-bounds.left))+'px';
  const r=element.getBoundingClientRect(),anchor=trigger.getBoundingClientRect();
  const wanted=position||{x:(bounds.left+bounds.right-r.width)/2,y:anchor.bottom+8};
  const x=Math.max(bounds.left,Math.min(wanted.x,bounds.right-r.width)),y=Math.max(bounds.top,Math.min(wanted.y,bounds.bottom-r.height));
  element.style.left=x+'px';element.style.top=y+'px';
  if(position)position={x,y};
 }
 function hide({focus=false}={}){element.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus({preventScroll:true});else if(element.contains(document.activeElement))document.activeElement.blur();}
 function show(){element.hidden=false;trigger.setAttribute('aria-expanded','true');place();}
 close.onclick=()=>hide({focus:true});
 element.addEventListener('pointerdown',onInteract);
 handle.addEventListener('pointerdown',e=>{
  if(e.button!==0||drag)return;e.preventDefault();onInteract();
  const r=element.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};handle.setPointerCapture(e.pointerId);
 });
 handle.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;position={x:drag.left+e.clientX-drag.x,y:drag.top+e.clientY-drag.y};place();});
 const end=e=>{if(drag?.id===e.pointerId)drag=null;};
 for(const type of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(type,end);
 handle.addEventListener('keydown',e=>{
  const delta={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key];
  if(!delta)return;e.preventDefault();const r=element.getBoundingClientRect();position={x:r.left+delta[0],y:r.top+delta[1]};place();
 });
 element.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();hide({focus:true});}});
 new ResizeObserver(place).observe(element);
 window.addEventListener('resize',place);window.visualViewport?.addEventListener('resize',place);window.visualViewport?.addEventListener('scroll',place);
 return {show,hide,place,reset(){hide();position=null;},get visible(){return !element.hidden;}};
}
