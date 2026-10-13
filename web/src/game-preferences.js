// SPDX-License-Identifier: AGPL-3.0-or-later
// Game-scoped options follow ManicEMU Game / GameOptionPerform's persisted
// speed, volume and shader choices. Web inheritance and storage are original.
import {videoFilters} from './video.js';
const boolean=v=>typeof v==='boolean';
const values=list=>v=>list.includes(v);
const schema={volume:v=>Number.isFinite(v)&&v>=0&&v<=1,speed:values([1,2,3,4,5]),
 muted:boolean,preservePitch:boolean,filter:values(videoFilters.map(([id])=>id)),filterStrength:v=>Number.isFinite(v)&&v>=0&&v<=1,
 haptics:boolean,hapticStrength:values([0,8,20]),deadZone:values([.1,.2,.3,.4,.5]),
 screenScaling:values(['fit','stretch','fill']),touchControls:boolean,showFps:boolean,
 overclock:values([1,2,4,8]),sunlight:v=>Number.isInteger(v)&&v>=0&&v<=10,
 tiltX:v=>Number.isFinite(v)&&Math.abs(v)<=1,tiltY:v=>Number.isFinite(v)&&Math.abs(v)<=1,gyro:v=>Number.isFinite(v)&&Math.abs(v)<=1,
 rtcMode:values(['auto','offset']),rtcOffset:v=>Number.isInteger(v)&&Math.abs(v)<=315576000,gameRumble:boolean,
 ndsLanguage:values(['default','ja','en','fr','de','it','es']),ndsSwapScreens:boolean,ndsPowerSave:boolean,rewindEnabled:boolean};
export function sanitizeGamePreferences(value){
 const result={};if(!value||typeof value!=='object'||Array.isArray(value))return result;
 for(const [key,valid] of Object.entries(schema))if(Object.hasOwn(value,key)&&valid(value[key]))result[key]=value[key];
 return result;
}
export const hasGamePreferences=game=>Object.keys(sanitizeGamePreferences(game?.preferences)).length>0;
export function createGamePreferences(global,{getGame,saveGame,onError=()=>{}}){
 let queue=Promise.resolve();const pending=new Map();
 function change(game,next){game.preferences=next;pending.set(game.id,{game,value:{...next}});}
 const settings=new Proxy(global,{
  get(target,key){const game=getGame();if(Object.hasOwn(schema,key)&&game){const own=sanitizeGamePreferences(game.preferences);if(Object.hasOwn(own,key))return own[key];}return Reflect.get(target,key);},
  set(target,key,value){
   const game=getGame();if(Object.hasOwn(schema,key)){if(!schema[key](value))return true;if(game){change(game,{...sanitizeGamePreferences(game.preferences),[key]:value});return true;}}
   return Reflect.set(target,key,value);
  },
  deleteProperty(target,key){const game=getGame();if(game&&Object.hasOwn(schema,key)){const next=sanitizeGamePreferences(game.preferences);delete next[key];change(game,next);return true;}return Reflect.deleteProperty(target,key);}
 });
 function save(){
  // Never serialize the effective Proxy: that would leak game overrides into
  // the global defaults. Serial writes keep rapid edits in their final order.
  localStorage.setItem('manic-settings',JSON.stringify(global));
  const edits=[...pending.values()];pending.clear();
  for(const edit of edits)queue=queue.catch(()=>{}).then(()=>saveGame(edit.game.id,edit.value)).catch(error=>{onError(error);throw error;});
  queue.catch(()=>{});return queue;
 }
 return {settings,global,save,flush:()=>queue,reset(game){change(game,{});return save();}};
}
