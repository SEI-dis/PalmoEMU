// SPDX-License-Identifier: AGPL-3.0-or-later
// Extra touch area for built-in controls only. Visual frames and saved layouts
// stay unchanged; imported skins retain their authored input geometry.
const mounted=new WeakMap();
export function configureBuiltinTouchTargets(container,settings){
 mounted.get(container)?.();mounted.delete(container);
 const margin=[8,16,24].includes(settings?.touchHitSlop)?settings.touchHitSlop:0;
 if(!margin)return;
 const buttons=[...container.querySelectorAll('.skin-button')],extensions=[];
 for(const button of buttons){
  const hit=document.createElement('span');hit.setAttribute('aria-hidden','true');hit.className='touch-hit-extension';
  hit.style.cssText=`position:absolute;inset:-${margin}px;pointer-events:auto;touch-action:none;`;
  button.append(hit);extensions.push(hit);
 }
 const down=event=>{
  if(event.pointerType!=='touch'&&event.pointerType!=='pen'){
   const button=event.target.closest('.skin-button'),r=button?.getBoundingClientRect();
   if(r&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))event.stopImmediatePropagation();
   return;
  }
  let nearest=null,distance=Infinity;
  for(const button of buttons){
   const r=button.getBoundingClientRect();if(!r.width||!r.height||button.hidden||button.disabled)continue;
   const dx=Math.max(r.left-event.clientX,0,event.clientX-r.right),dy=Math.max(r.top-event.clientY,0,event.clientY-r.bottom),d=dx*dx+dy*dy;
   if(dx<=margin&&dy<=margin&&d<distance){nearest=button;distance=d;}
  }
  if(nearest&&event.target.closest('.skin-button')!==nearest){event.stopImmediatePropagation();nearest.onpointerdown?.(event);}
 };
 container.addEventListener('pointerdown',down,true);
 mounted.set(container,()=>{container.removeEventListener('pointerdown',down,true);for(const extension of extensions)extension.remove();});
}
