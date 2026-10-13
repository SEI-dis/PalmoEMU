/* SkinCollectionViewCell / SkinPreviewViewController Web port.
   Copyright © 2025 Manic EMU. Created by Daiuno. Modified 2026-10-09.
   See sources/manicemu-ui/README.md. */
// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from './i18n/index.js';
import {dualScreen} from './development.js';
import {chooseRepresentation} from './skin-format.js';
import {mountSkinScreens} from './skin-screens.js';
import {builtinLayout} from './skin-art.js';
import {cameraLayout,cameraBackgroundSize} from './camera-button.js';
import {icon} from './shared.js';

// Each preview owns its screen renderers; callers own its image URLs.
export function mountSkinPreview(host,skin,{system,orientation,viewport,layout,frameStyle,cameraEnabled=true,touchHitSlop=0}){
 let screenCleanup=()=>{};
 const draw=()=>{
  if(!host.isConnected)return;
  screenCleanup();
  const wide=orientation==='landscape',size=viewport(),short=Math.min(size.width,size.height),long=Math.max(size.width,size.height);
  const width=wide?long:short,height=wide?short:long,source=skin.id.startsWith('builtin:')?builtinLayout(skin,width,height,layout?.[orientation]):chooseRepresentation(skin,width,height);
  const rep=cameraLayout(source,layout?.[orientation],width,height,{enabled:cameraEnabled,hitSlop:skin.id.startsWith('builtin:')?touchHitSlop:0});
  const map=rep.mappingSize,scale=Math.min(host.clientWidth/map.width,host.clientHeight/map.height);
  host.innerHTML=`<div class="skin-mini" style='width:${map.width*scale}px;height:${map.height*scale}px;background-size:${cameraBackgroundSize(rep)};background-position:top left;background-image:url("${skin.images[rep.assets.resizable]}")'>${rep.screens.map(s=>`<div class="skin-mini-screen" style="${frameStyle(s.outputFrame,map)}"><span>${s.label||'PalmoEMU'}</span></div>`).join('')}${rep.items.map(item=>`<span class="skin-mini-button" style='${frameStyle(item.frame,map)}opacity:${item.opacity??1};background-image:url("${skin.images[item.asset?.normal]||''}")'></span>`).join('')}${(rep.actions||[]).map(a=>`<span class="skin-mini-tool" data-control="${a.id}" style="${frameStyle(a.frame,map)}opacity:${a.opacity??1};font-size:${Math.max(3,11*scale)}px">${a.icon?icon(a.icon):a.label}</span>`).join('')}</div>`;
  if(!skin.id.startsWith('builtin:')){
   const mini=host.firstElementChild;mini.style.backgroundImage='none';mini.style.overflow='hidden';mini.querySelectorAll('.skin-mini-screen').forEach(el=>el.remove());
   const sources=(dualScreen(system)?[0,1]:[0]).map(index=>{
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=dualScreen(system)?192:171;
    const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,256,171);gradient.addColorStop(0,index?'#4b8baf':'#324969');gradient.addColorStop(1,'#172637');ctx.fillStyle=gradient;ctx.fillRect(0,0,256,canvas.height);ctx.fillStyle='#d9e5ef';ctx.font='13px sans-serif';ctx.textAlign='center';ctx.fillText('PalmoEMU',128,canvas.height/2);mini.append(canvas);return canvas;
   });
   screenCleanup=mountSkinScreens(mini,{screens:sources},rep,system,{ratio:scale});
   const art=document.createElement('div');art.className='imported-art';art.style.cssText=frameStyle(rep.artFrame||{x:0,y:0,...map},map);art.style.backgroundImage=rep.assets.resizable?`url("${skin.images[rep.assets.resizable]}")`:'none';mini.append(art);
  }
  host.setAttribute('aria-label',tr`${skin.name}・${wide?tr('横'):tr('縦')}画面のプレビュー`);
 };
 const observer=new ResizeObserver(draw);observer.observe(host);window.addEventListener('resize',draw);draw();
 return ()=>{screenCleanup();observer.disconnect();window.removeEventListener('resize',draw);};
}
