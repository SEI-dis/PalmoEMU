// SPDX-License-Identifier: AGPL-3.0-or-later
// Remember a Play action across an app update, not a ROM or an emulator state.
export function createLaunchContinuation({scope=new URL('../',import.meta.url).pathname,build=document.querySelector('meta[name=app-build]')?.content,storage=()=>sessionStorage,now=Date.now}={}){
 const key='palmo-launch-after-update:'+scope;let pending=null;
 const valid=value=>value?.schema===1&&typeof value.id==='string'&&value.id.length>0&&value.id.length<=256&&typeof value.safeMode==='boolean'&&typeof value.skipRecovery==='boolean';
 function clear(){pending=null;try{storage().removeItem(key);}catch{}}
 return {
  get pending(){return !!pending;},
  remember(game,{safeMode=false,skipRecovery=false}={}){clear();pending={schema:1,id:game.id,safeMode:!!safeMode,skipRecovery:!!skipRecovery};},
  preserve(){if(!valid(pending)||!build)return;try{storage().setItem(key,JSON.stringify({...pending,from:build,at:now()}));}catch{/* Storage denial must not block the update. */}},
  restore(){
   let value;try{const text=storage().getItem(key);storage().removeItem(key);value=JSON.parse(text);}catch{return;}
   if(valid(value)&&build&&typeof value.from==='string'&&value.from!==build&&Number.isFinite(value.at)&&now()-value.at>=0&&now()-value.at<300000)pending={schema:1,id:value.id,safeMode:value.safeMode,skipRecovery:value.skipRecovery};
  },
  take(){const value=pending;clear();return value;},clear
 };
}
