// SPDX-License-Identifier: AGPL-3.0-or-later
// Built-in skin facade: profiles, geometry and original artwork live separately.
import {tr} from '../i18n/index.js';
import {builtins,skinProfile} from './skin-profiles.js';
import {singleScreenLayout} from './skin-layout.js';
import {controllerAssets,controllerBody} from './skin-drawing.js';
import {dualScreen} from '../core/development.js';
import {ndsSkinLayout} from './nds-skin.js';
export {builtins};

// Imported skins retain their author's mapping; only built-ins reflow.
export function builtinLayout(skin,width,height,layout,topClearance=skin.system==='gba'?48:32){
 const w=Math.max(240,width),h=Math.max(200,height);
 if(dualScreen(skin.system))return ndsSkinLayout(skin,w,h,layout);
 const rep=singleScreenLayout(skin.system,w,h,layout,topClearance);
 skin.images.responsive=controllerBody(skin.system,skin.palette,rep);return rep;
}
export function builtinSkin(system,palette='classic'){
 if(!builtins.some(([id])=>id===palette))palette='classic';
 const profile=dualScreen(system)?{name:system==='3ds'?tr('3DS デュアル'):tr('NDS デュアル'),description:tr('縦は上下2画面、横は左の大画面と右上のサブ画面。2画面の位置・サイズを個別に調整できます。')}:skinProfile(system);
 const images=dualScreen(system)?{}:{...controllerAssets(system,palette)};
 const skin={id:'builtin:'+palette,palette,name:profile.name+' · '+builtins.find(b=>b[0]===palette)[1],description:profile.description,system,screenRadius:0,images};
 skin.portrait=builtinLayout(skin,390,844);images.background=images.responsive;skin.portrait.assets={resizable:'background'};
 skin.landscape=builtinLayout(skin,844,390);images.landscape=images.responsive;skin.landscape.assets={resizable:'landscape'};
 return skin;
}
