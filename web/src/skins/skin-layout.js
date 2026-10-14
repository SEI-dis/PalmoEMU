// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared bounds/fit calculation; each profile supplies its own control layout.
import {applyControlLayout} from './control-layout.js';
import {skinProfile} from './skin-profiles.js';
const item=(input,x,y,width,height=width,label)=>({inputs:input==='dpad'?{up:'up',down:'down',left:'left',right:'right'}:[input],frame:{x,y,width,height},asset:{normal:input},...(label?{label}:{})});

function faceButtons(kind,x,y,size){
 if(kind==='diamond'){
  const b=size/3;return [item('x',x+b,y,b),item('y',x,y+b,b),item('a',x+2*b,y+b,b),item('b',x+b,y+2*b,b)];
 }
 if(kind==='six'){
  const step=size/3,b=step-3,small=b*.78;
  return ['x','y','z','a','b','c'].map((key,i)=>{const col=i%3,top=i<3,n=top?small:b;return item(key,x+col*step+(step-n)/2,y+(top?size*.14:size*.51)+(2-col)*size*.045,n);});
 }
 if(kind==='horizontal'){
  const b=size*.46;return [item('b',x,y+(size-b)/2,b),item('a',x+size-b,y+(size-b)/2,b)];
 }
 const b=size*.46;return [item('a',x+size-b,y+size*.08,b),item('b',x,y+size*.48,b)];
}
function candidate(profile,width,height,wide,clearance){
 const fit=wide?Math.min(1,width/(2*profile.wing+120),height/288):1;
 const w=width/fit,h=height/fit,top=clearance/fit,items=[],actions=[];
 const action=(id,label,x,y,width,height=width)=>actions.push({id,label,frame:{x,y,width,height}});
 const utility=(x,y,right,width=72,height=36)=>item(right?'start':'select',x,y,width,height,!right&&profile.faces==='six'?'MODE':undefined);
 let screen;
 if(wide){
  const sw=Math.min(w-2*profile.wing,(h-12)*profile.ratio),wing=(w-sw)/2;
  screen={x:wing,y:(h-sw/profile.ratio)/2,width:sw,height:sw/profile.ratio};
  const zone=Math.min(wing,212),left=(wing-zone)/2,right=w-left-zone;
  const groupTop=top+Math.max(0,(h-top-16-360)/2),groupBottom=Math.min(h-16,groupTop+360);
  const size=Math.min(zone-16,groupBottom-groupTop-112,184),y=groupTop+52+(groupBottom-groupTop-104-size)/2;
  items.push(item('dpad',(wing-size)/2,y,size),...faceButtons(profile.faces,w-wing+(wing-size)/2,y,size));
  if(profile.shoulders)items.push(item('l',left+8,groupTop,72,36),item('r',right+zone-80,groupTop,72,36));
  action('quick-save','save',left+zone-52,groupTop,44,36);action('quick-load','load',right+8,groupTop,44,36);
  items.push(utility(left+8,groupBottom-40,false),utility(right+zone-80,groupBottom-40,true));
  action('player-menu','…',left+zone-52,groupBottom-44,44);action('boost','1×',right+8,groupBottom-44,44);
 }else{
  const bottom=18,ch=profile.controlsHeight;
  const scale=Math.min(1.16,(w-24)/366,(h-top-bottom-12-Math.min(110,h*.28))/ch),controlH=ch*scale;
  const areaH=h-top-bottom-controlH-12,sw=Math.min(w-12,areaH*profile.ratio),base=h-bottom-controlH;
  screen={x:(w-sw)/2,y:top+(areaH-sw/profile.ratio)/2,width:sw,height:sw/profile.ratio};
  items.push(item('dpad',12,base+profile.mainY*scale,172*scale),...faceButtons(profile.faces,w-12-168*scale,base+profile.mainY*scale,168*scale));
  if(profile.shoulders)items.push(item('l',12,base,114*scale,42*scale),item('r',w-12-114*scale,base,114*scale,42*scale));
  const quickY=base+(profile.shoulders?50:6)*scale;
  action('quick-save','save',w/2-70*scale,quickY,60*scale,34*scale);action('quick-load','load',w/2+10*scale,quickY,60*scale,34*scale);
  const foot=base+(ch-42)*scale;
  items.push(utility(w/2-70*scale,foot,false,60*scale,36*scale),utility(w/2+10*scale,foot,true,60*scale,36*scale));
  action('player-menu','…',12,foot,36*scale);action('boost','1×',w-12-36*scale,foot,36*scale);
 }
 for(const f of [screen,...items.map(i=>i.frame),...actions.map(a=>a.frame)])for(const key of ['x','y','width','height'])f[key]*=fit;
 return {mappingSize:{width,height},assets:{resizable:'responsive'},items,actions,screens:[{outputFrame:screen}],wide,side:screen.x};
}
export function singleScreenLayout(system,width,height,layout,clearance){
 const profile=skinProfile(system),bottom=candidate(profile,width,height,false,clearance),side=candidate(profile,width,height,true,clearance);
 const area=rep=>{const f=rep.screens[0].outputFrame;return f.width*f.height;};
 return applyControlLayout(area(side)>area(bottom)?side:bottom,layout);
}
