// SPDX-License-Identifier: AGPL-3.0-or-later
// ManicEMU FocusKit interaction port: external input routes to focus while idle
// or paused, and back to the game while playing. Copyright 2026 Manic EMU.
// Modified for browser DOM controls, native text editing and focus on 2026-10-13.
export function createUINavigation({active,capturing,release,back}){
 let previous=new Set(),repeats=new Map(),wasActive=false,frame,destroyed=false;
 const editable=el=>el?.matches('input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]),textarea')||el?.isContentEditable;
 const scope=()=>document.querySelector('dialog[open]')||document.body;
 const targets=()=>[...scope().querySelectorAll('button,a[href],input,select,textarea,summary,[tabindex="0"]')].filter(el=>!el.disabled&&!el.closest('[hidden],[inert]')&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&el.type!=='hidden');
 function focus(el){el?.focus({preventScroll:true});el?.scrollIntoView({block:'nearest',inline:'nearest'});el?.classList.add('controller-focus');}
 function move(direction){
  const list=targets(),current=document.activeElement;if(!list.length)return;
  if(!list.includes(current)){focus(list[0]);return;}
  const a=current.getBoundingClientRect(),vertical=direction==='up'||direction==='down',sign=direction==='left'||direction==='up'?-1:1;
  let best=null,score=Infinity;
  for(const el of list){if(el===current)continue;const b=el.getBoundingClientRect(),dx=(b.left+b.right-a.left-a.right)/2,dy=(b.top+b.bottom-a.top-a.bottom)/2,along=(vertical?dy:dx)*sign,across=Math.abs(vertical?dx:dy);if(along<=1)continue;const distance=along+across*3;if(distance<score){score=distance;best=el;}}
  focus(best);
 }
 function adjust(el,amount){
  if(el?.matches('select')){const options=[...el.options].filter(o=>!o.disabled),index=options.indexOf(el.selectedOptions[0]),next=options[Math.max(0,Math.min(options.length-1,index+amount))];if(next&&next.value!==el.value){el.value=next.value;el.dispatchEvent(new Event('change',{bubbles:true}));}return true;}
  if(el?.matches('input[type=range]')){amount>0?el.stepUp():el.stepDown();el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;}return false;
 }
 function action(key){
  const el=document.activeElement;
  if(key==='back'){back();return;}
  if(key==='accept'){if(!targets().includes(el)){focus(targets()[0]);return;}if(el.matches('select'))adjust(el,1);else if(editable(el))el.focus();else el.click();return;}
  if((key==='left'||key==='right')&&adjust(el,key==='left'?-1:1))return;
  move(key);
 }
 const commands=()=>{
  const held=new Set();let pads;try{pads=navigator.getGamepads?.()||[];}catch{return held;}for(const pad of pads){if(!pad||pad.connected===false)continue;const on=i=>pad.buttons?.[i]?.pressed||pad.buttons?.[i]?.value>.5;
   for(const [i,key] of [[0,'accept'],[1,'back'],[9,'back'],[12,'up'],[13,'down'],[14,'left'],[15,'right']])if(on(i))held.add(key);
   if(pad.axes?.[0]<-.5)held.add('left');if(pad.axes?.[0]>.5)held.add('right');if(pad.axes?.[1]<-.5)held.add('up');if(pad.axes?.[1]>.5)held.add('down');
  }return held;
 };
 function deactivate(){wasActive=false;previous.clear();repeats.clear();}
 function schedule(){if(!destroyed)frame=requestAnimationFrame(tick);}
 function tick(time){
  if(destroyed)return;
  // The running core or input capture already polls the controller. UI focus
  // must not take a second snapshot while it has no input ownership.
  if(document.hidden||!active()||capturing()){deactivate();schedule();return;}
  const held=commands();
  if(!wasActive){release();repeats.clear();previous=held;wasActive=true;}
  for(const key of held){const fresh=!previous.has(key),repeat=!['accept','back'].includes(key)&&time>=(repeats.get(key)??Infinity);if(fresh||repeat){if(destroyed||document.hidden||!active()||capturing())break;action(key);repeats.set(key,time+(fresh?400:130));}}
  for(const key of previous)if(!held.has(key))repeats.delete(key);previous=held;schedule();
 }
 const keydown=event=>{if(!active()||capturing()||event.altKey||event.metaKey||event.ctrlKey||editable(event.target)||event.target?.matches('select,input[type=range]'))return;const direction={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'}[event.key];if(direction){event.preventDefault();move(direction);}};
 const clear=()=>document.querySelectorAll('.controller-focus').forEach(el=>el.classList.remove('controller-focus'));
 // Hidden documents may receive no animation frame at all. Reset on the
 // visibility event so their first visible frame takes a new held baseline.
 const visibility=()=>{if(document.hidden)deactivate();};
 document.addEventListener('keydown',keydown);document.addEventListener('pointerdown',clear);document.addEventListener('visibilitychange',visibility);schedule();
 return {destroy(){destroyed=true;cancelAnimationFrame(frame);deactivate();document.removeEventListener('keydown',keydown);document.removeEventListener('pointerdown',clear);document.removeEventListener('visibilitychange',visibility);clear();}};
}
