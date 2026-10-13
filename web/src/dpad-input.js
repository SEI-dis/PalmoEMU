// SPDX-License-Identifier: AGPL-3.0-or-later
// Built-in skins: broad cardinal sectors let a finger drift across an arm
// without turning it into a diagonal. Imported skins keep their own mapping.
export function builtinDpadDirections(x,y){
 const dx=x-.5,dy=y-.5,ax=Math.abs(dx),ay=Math.abs(dy);
 if(dx*dx+dy*dy<=.12*.12)return [];
 const directions=[];
 if(ax>=ay*.6)directions.push(dx<0?'left':'right');
 if(ay>=ax*.6)directions.push(dy<0?'up':'down');
 return directions;
}
