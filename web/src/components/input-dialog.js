// SPDX-License-Identifier: AGPL-3.0-or-later
// iOS keyboards resize/pan the visual viewport, not the layout viewport or dvh.
// Opt in only while editing a short form; do not move the page or the caret.
export function fitInputDialog(dialog){
 const viewport=window.visualViewport;if(!viewport)return ()=>{};
 let frame=0,disposed=false;
 const clear=()=>{dialog.removeAttribute('data-input-viewport');for(const name of ['top','bottom','height'])dialog.style.removeProperty('--input-viewport-'+name);};
 function update(){
  frame=0;if(disposed||!dialog.open)return;
  // Preserve native pinch zoom and its panning; the input already uses 16px text.
  if(Math.abs(viewport.scale-1)>.01||!(viewport.height>0)||viewport.height>=document.documentElement.clientHeight-1){clear();return;}
  const top=Math.max(0,viewport.offsetTop);
  dialog.style.setProperty('--input-viewport-top',top+'px');
  dialog.style.setProperty('--input-viewport-bottom',(top+viewport.height)+'px');
  dialog.style.setProperty('--input-viewport-height',viewport.height+'px');
  dialog.setAttribute('data-input-viewport','');
  const input=document.activeElement;
  if(dialog.contains(input)&&input.matches('input,textarea,[contenteditable=true]')){
   const field=input.getBoundingClientRect(),bounds=dialog.getBoundingClientRect();
   const top=(dialog.querySelector('.sheet-head')?.getBoundingClientRect().bottom??bounds.top)+8,bottom=bounds.bottom-12;
   if(field.bottom>bottom)dialog.scrollTop+=field.bottom-bottom;
   else if(field.top<top)dialog.scrollTop-=top-field.top;
  }
 }
 const schedule=()=>{if(!disposed&&!frame)frame=requestAnimationFrame(update);};
 const close=()=>{if(!dialog.open)destroy();};
 function destroy(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);viewport.removeEventListener('resize',schedule);viewport.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);dialog.removeEventListener('focusin',schedule);dialog.removeEventListener('close',close);clear();}
 viewport.addEventListener('resize',schedule);viewport.addEventListener('scroll',schedule);window.addEventListener('resize',schedule);dialog.addEventListener('focusin',schedule);dialog.addEventListener('close',close);update();
 return destroy;
}
