// SPDX-License-Identifier: AGPL-3.0-or-later
// Pointer lifetime for game controls, independent of a skin's artwork. Touch
// events only reconcile release state; they never synthesize duplicate presses
// or prevent the browser's native editing, scrolling or click behavior.
export function createSkinPointers(){
 const active=new Map();
 function finish(id){
  const record=active.get(id);if(!record)return;
  active.delete(id);
  try{if(record.button.hasPointerCapture(id))record.button.releasePointerCapture(id);}catch{}
  record.end();
 }
 function release(type){for(const [id,record]of [...active])if(!type||record.type===type)finish(id);}
 const ended=event=>finish(event.pointerId);
 const moved=event=>{
  const record=active.get(event.pointerId);if(!record)return;
  if((record.type==='mouse'||record.type==='pen')&&event.buttons===0){finish(event.pointerId);return;}
  record.move?.(event);
 };
 const lost=event=>{
  const record=active.get(event.pointerId);
  // An old owner's delayed event must not release the new owner's input.
  if(record?.captured&&record.button===event.target&&!record.button.hasPointerCapture(event.pointerId))finish(event.pointerId);
 };
 const touchEnded=event=>{if(event.touches?.length===0)release('touch');};
 const listeners=[['pointerup',ended],['pointercancel',ended],['pointermove',moved],['lostpointercapture',lost],['touchend',touchEnded],['touchcancel',touchEnded]];
 for(const [type,fn]of listeners)window.addEventListener(type,fn,{capture:true,passive:true});
 return{
  start(button,event,{end,move}){
   // A new primary touch begins a new sequence. Clear an orphaned sequence
   // even if its browser-side finish/cancel notification never arrived.
   if(event.pointerType==='touch'&&event.isPrimary)release('touch');
   finish(event.pointerId);
   const record={button,end,move,type:event.pointerType,captured:false};
   active.set(event.pointerId,record);
   // Global move/up listeners remain usable if capture fails or is retargeted.
   try{button.setPointerCapture(event.pointerId);record.captured=true;}catch{}
  },
  has(button){return [...active.values()].some(record=>record.button===button);},
  release:()=>release(),
  destroy(){release();for(const [type,fn]of listeners)window.removeEventListener(type,fn,true);}
 };
}
