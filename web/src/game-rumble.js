// SPDX-License-Identifier: AGPL-3.0-or-later
// Original browser adapter for mGBA's game-driven rumble. No touch vibration.
// Modified 2026-10-13: opt-in, one explicitly selected pad, bounded effects.
const actuatorFor=pad=>{
 try{
  if(!pad||pad.connected===false)return null;
  const actuator=pad.vibrationActuator;
  if(typeof actuator?.playEffect!=='function')return null;
  if(Array.isArray(actuator.effects)&&!actuator.effects.includes('dual-rumble'))return null;
  return actuator;
 }catch{return null;}
};
export const supportsGameRumble=pad=>!!actuatorFor(pad);

export class GameRumble {
 constructor({readStrength=()=>0,setEnabled=()=>{},getGamepads=()=>globalThis.navigator?.getGamepads?.()||[],now=()=>performance.now(),visibility=globalThis.document,events=globalThis.window}={}){
  Object.assign(this,{readStrength,setEnabled,getGamepads,now,visibility,events});
  this.enabled=false;this.paused=true;this.closed=false;this.target=null;this.actuator=null;this.blocked=null;this.coreEnabled=false;this.lastAt=-Infinity;this.lastStrength=0;this.generation=0;
  this.onVisibility=()=>{if(this.visibility?.hidden)this.stop();};
  this.onDisconnect=event=>{if(event.gamepad?.index===this.target?.index)this.stop();};
  this.onPageHide=()=>this.stop();
  visibility?.addEventListener?.('visibilitychange',this.onVisibility);
  events?.addEventListener?.('gamepaddisconnected',this.onDisconnect);
  events?.addEventListener?.('pagehide',this.onPageHide);
 }
 // The caller chooses the pad assigned to 1P; there is no first-pad fallback.
 setTarget(pad){
  const target=pad&&Number.isInteger(pad.index)&&pad.index>=0&&typeof pad.id==='string'?{index:pad.index,id:pad.id}:null;
  if(target?.index===this.target?.index&&target?.id===this.target?.id)return;
  this.stop();this.target=target;this.blocked=null;
 }
 configure({enabled=false}={}){
  enabled=enabled===true;
  if(enabled===this.enabled)return;
  this.stop();this.enabled=enabled;this.blocked=null;
 }
 pause(value){
  value=!!value;if(value===this.paused)return;
  this.paused=value;
  if(value)this.stop();
 }
 syncCore(enabled){
  if(enabled===this.coreEnabled)return;
  try{const accepted=this.setEnabled(enabled?1:0);this.coreEnabled=enabled&&accepted!==0&&accepted!==false;}catch{this.coreEnabled=false;}
 }
 stopOutput(){
  this.generation++;
  const actuator=this.actuator;this.actuator=null;this.lastAt=-Infinity;this.lastStrength=0;
  if(!actuator)return;
  try{
   const result=typeof actuator.reset==='function'?actuator.reset():actuator.playEffect('dual-rumble',{duration:0,startDelay:0,strongMagnitude:0,weakMagnitude:0});
   Promise.resolve(result).catch(()=>{});
  }catch{}
 }
 stop(){this.stopOutput();this.syncCore(false);}
 // Enable sampling before emulation so a single-frame pulse is not discarded.
 prepare(){
  if(this.closed||!this.enabled||this.paused||this.visibility?.hidden||!this.target){this.stop();return null;}
  try{
   const pad=Array.from(this.getGamepads()||[]).find(p=>p&&p.index===this.target.index&&p.id===this.target.id);
   const actuator=actuatorFor(pad);
   if(!actuator||actuator===this.blocked){this.stop();return null;}
   if(this.actuator&&this.actuator!==actuator)this.stop();
   this.syncCore(true);
   return this.coreEnabled?actuator:null;
  }catch{this.stop();return null;}
 }
 tick(){
  const actuator=this.prepare();if(!actuator)return;
  try{
   const raw=this.readStrength(),strength=Number.isFinite(raw)?Math.max(0,Math.min(1,raw)):0;
   if(!strength){if(this.actuator)this.stopOutput();return;}
   const time=this.now();
   if(this.actuator===actuator&&time-this.lastAt<50&&Math.abs(strength-this.lastStrength)<.05)return;
   this.actuator=actuator;this.lastAt=time;this.lastStrength=strength;
   const generation=this.generation;
   const failed=()=>{if(!this.closed&&generation===this.generation&&this.actuator===actuator){this.blocked=actuator;this.stop();}};
   try{Promise.resolve(actuator.playEffect('dual-rumble',{duration:80,startDelay:0,strongMagnitude:strength,weakMagnitude:strength})).catch(failed);}catch{failed();}
  }catch{this.stop();}
 }
 close(){
  if(this.closed)return;this.closed=true;this.stop();this.target=null;
  this.visibility?.removeEventListener?.('visibilitychange',this.onVisibility);
  this.events?.removeEventListener?.('gamepaddisconnected',this.onDisconnect);
  this.events?.removeEventListener?.('pagehide',this.onPageHide);
 }
}
