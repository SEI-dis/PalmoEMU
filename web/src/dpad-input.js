// SPDX-License-Identifier: AGPL-3.0-or-later
// Built-in skins: broad cardinal sectors let a finger drift across an arm
// without turning it into a diagonal. Imported skins keep their own mapping.
export const touchInputDefaults={touchDpadMode:'eight',touchDpadDeadZone:.12,touchDpadDiagonal:.6,touchHitSlop:0};
export function builtinDpadDirections(x,y,settings={}){
 const dx=x-.5,dy=y-.5,ax=Math.abs(dx),ay=Math.abs(dy);
 if(!Number.isFinite(dx)||!Number.isFinite(dy))return [];
 const zone=[0,.06,.12,.18,.24].includes(settings.touchDpadDeadZone)?settings.touchDpadDeadZone:.12;
 if(dx*dx+dy*dy<=zone*zone)return [];
 if(settings.touchDpadMode==='four')return [ax>ay?(dx<0?'left':'right'):(dy<0?'up':'down')];
 const diagonal=[.35,.6,.85].includes(settings.touchDpadDiagonal)?settings.touchDpadDiagonal:.6;
 const directions=[];
 if(ax>=ay*diagonal)directions.push(dx<0?'left':'right');
 if(ay>=ax*diagonal)directions.push(dy<0?'up':'down');
 return directions;
}
