// SPDX-License-Identifier: AGPL-3.0-or-later
// Original Web control editor. Positions use the available travel, not fixed pixels.
import {tr} from '../i18n/index.js';
export const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export function controlId(item){return Array.isArray(item.inputs)?item.inputs.join('+'):'dpad';}
export function controls(rep){
 return [...rep.items.map(item=>({...item,id:controlId(item),label:item.label||(controlId(item)==='dpad'?tr('十字キー'):item.inputs.join(' + ').toUpperCase())})),
  ...(rep.actions||[]).map(a=>({...a,label:({'quick-save':tr('クイック保存'),'quick-load':tr('クイック読込'),'player-menu':tr('メニュー'),boost:tr('速度')})[a.id]||a.label,tool:a.label}))];
}
export function screenBounds(rep){
 const frames=rep.screens.map(s=>s.outputFrame),x=Math.min(...frames.map(f=>f.x)),y=Math.min(...frames.map(f=>f.y));
 return {x,y,width:Math.max(...frames.map(f=>f.x+f.width))-x,height:Math.max(...frames.map(f=>f.y+f.height))-y};
}
export function applyControlLayout(rep,layout){
 const map=rep.mappingSize;
 for(const item of [...rep.items,...rep.actions||[],...rep.screens]){
  const screen=!!item.outputFrame,id=item.id||(screen?'screen':controlId(item)),f=screen?item.outputFrame:item.frame;
  item.baseFrame={...f};item.scale=1;
  const value=layout?.[id];if(!value||typeof value!=='object')continue;
  if(Number.isFinite(value.scale)){
   item.scale=clamp(value.scale,screen ? .25 : .5,Math.min(2,map.width/f.width,map.height/f.height));
   const w=f.width*item.scale,h=f.height*item.scale;f.x+=(f.width-w)/2;f.y+=(f.height-h)/2;f.width=w;f.height=h;
  }
  if(Number.isFinite(value.x))f.x=clamp(value.x,0,1)*Math.max(0,map.width-f.width);
  if(Number.isFinite(value.y))f.y=clamp(value.y,0,1)*Math.max(0,map.height-f.height);
  f.x=clamp(f.x,0,map.width-f.width);f.y=clamp(f.y,0,map.height-f.height);
  if(!screen&&Number.isFinite(value.opacity))item.opacity=clamp(value.opacity,.2,1);
 }
 return rep;
}
export function normalizedPosition(frame,map,x,y){
 const travelX=Math.max(0,map.width-frame.width),travelY=Math.max(0,map.height-frame.height);
 return {x:travelX?clamp(x/travelX,0,1):0,y:travelY?clamp(y/travelY,0,1):0};
}
