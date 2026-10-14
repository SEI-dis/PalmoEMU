// SPDX-License-Identifier: AGPL-3.0-or-later
// Older string selections apply to both orientations until either is edited.
import {tr} from '../i18n/index.js';
export const skinOrientations=['portrait','landscape'];
export const skinOrientation=({width,height})=>width>height?'landscape':'portrait';
export function skinChoice(selection,orientation){
 const value=typeof selection==='string'?selection:selection?.[orientation];
 return typeof value==='string'?value:'';
}
export function withSkinChoice(selection,orientation,id){
 if(!skinOrientations.includes(orientation)||typeof id!=='string')throw Error(tr('スキンの向き・選択が正しくありません。'));
 const next=Object.fromEntries(skinOrientations.map(key=>[key,key===orientation?id:skinChoice(selection,key)]).filter(([,value])=>value));
 return Object.keys(next).length?next:undefined;
}
export function withoutSkinChoice(selection,id){
 if(typeof selection==='string')return selection===id?undefined:selection;
 if(!skinOrientations.some(key=>selection?.[key]===id))return selection;
 const next=Object.fromEntries(skinOrientations.map(key=>[key,skinChoice(selection,key)]).filter(([,value])=>value&&value!==id));
 return Object.keys(next).length?next:undefined;
}
