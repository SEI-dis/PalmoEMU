// SPDX-License-Identifier: AGPL-3.0-or-later
// Derive offline artwork from the same representation selector as playback.
import {coreFor} from '../core/core-registry.js';
import {bundledSkin} from '../skins/bundled-skins.js';
import {skinChoice} from '../skins/skin-selection.js';
import {chooseRepresentation} from '../skins/skin-format.js';
export function representationImages(skin,rep){
 const keys=new Set();
 const visit=value=>{if(typeof value==='string'&&Object.hasOwn(skin.images,value))keys.add(value);else if(value&&typeof value==='object')Object.values(value).forEach(visit);};
 visit(rep);return [...keys].map(key=>skin.images[key]);
}
export async function offlineGamePlan(games,settings,{width,height,screenWidth=width,screenHeight=height}){
 const cores=new Set(),files=new Set(),base=new URL('../../',import.meta.url),pending=new Map();
 // Include both orientations and the full screen (PWA/fullscreen). Account for
 // safe-area/browser bars when choosing among layouts; never infer from UA.
 const boxes=[];for(const [w,h]of [[width,height],[height,width],[screenWidth,screenHeight],[screenHeight,screenWidth]]){
  if(!(w>0&&h>0))continue;
  for(const inset of [0,48,96])boxes.push({width:w,height:Math.max(1,h-inset)},{width:Math.max(1,w-inset),height:h});
 }
 for(const game of games.filter(game=>!game.romMissing)){
  const core=coreFor(game);if(core.adapter==='3ds')continue;cores.add(core.directory);
  for(const orientation of ['portrait','landscape']){
   const fallback=skinChoice(settings.skins?.[game.system],orientation)||'builtin:classic';
   for(const id of new Set([skinChoice(game.skinId,orientation)||fallback,fallback])){
    if(!id.startsWith('bundled:'))continue;
    const key=game.system+':'+id;if(!pending.has(key))pending.set(key,bundledSkin(game.system,id));
    const skin=await pending.get(key);if(!skin)continue;
    files.add(`assets/skins/manic/${game.system}/skin.json`);
    for(const box of boxes.filter(box=>(box.width>box.height?'landscape':'portrait')===orientation)){
     const rep=chooseRepresentation(skin,box.width,box.height);
     for(const image of representationImages(skin,rep)){const url=new URL(image,base);if(url.href.startsWith(base.href))files.add(url.href.slice(base.href.length));}
    }
   }
  }
 }
 return {cores:[...cores],files:[...files]};
}
