// SPDX-License-Identifier: AGPL-3.0-or-later
// Local browser sensors for mGBA's rotation/luminance peripherals.
export class GBASensors {
 constructor(send){this.send=send;this.sunlight=0;this.manual=[0,0,0];this.motion=[0,0,0];this.enabled=false;this.paused=true;this.listener=event=>{
  const a=event.accelerationIncludingGravity,r=event.rotationRate;if(!a)return;
  const angle=(screen.orientation?.angle??window.orientation??0)*Math.PI/180,x=(Number(a.x)||0)/9.80665,y=(Number(a.y)||0)/9.80665;
  this.motion=[x*Math.cos(angle)+y*Math.sin(angle),y*Math.cos(angle)-x*Math.sin(angle),(Number(r?.alpha)||0)/180];this.update();
 };}
 update(){const values=this.enabled?this.motion:this.manual;this.send(...values.map(v=>this.paused?0:Math.round(Math.max(-2,Math.min(2,v))*536870912)),this.sunlight);}
 configure({sunlight=0,tiltX=0,tiltY=0,gyro=0}={}){this.sunlight=Math.max(0,Math.min(10,Math.round(Number(sunlight)||0)));this.manual=[tiltX,tiltY,gyro].map(v=>Math.max(-1,Math.min(1,Number(v)||0)));this.update();}
 async enable(){
  const api=globalThis.DeviceMotionEvent;if(!api)return false;
  if(typeof api.requestPermission==='function'&&await api.requestPermission()!=='granted')return false;
  if(this.closed)return false;if(!this.enabled)window.addEventListener('devicemotion',this.listener);this.enabled=true;this.update();return true;
 }
 disable(){window.removeEventListener('devicemotion',this.listener);this.enabled=false;this.motion=[0,0,0];this.update();}
 pause(value){this.paused=value;if(value)this.motion=[0,0,0];this.update();}
 close(){this.closed=true;this.disable();}
}
