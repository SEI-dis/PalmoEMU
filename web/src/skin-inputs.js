// SPDX-License-Identifier: AGPL-3.0-or-later
// Local controls for imported skins. Every pointer is released on pause/layout change.
import {gameInputs} from './skin-format.js';
import {screenTransform} from './skin-screens.js';
import {createSkinPointers} from './skin-pointers.js';
export function mountSkinInputs(host,rep,images,api){
 const {keybits,pressed,updateKeys,action,engine,paused,haptic}=api,held=new Map(),pointers=createSkinPointers();
 host.replaceChildren();
 const position=(el,f,map)=>{el.style.left=f.x/map.width*100+'%';el.style.top=f.y/map.height*100+'%';el.style.width=f.width/map.width*100+'%';el.style.height=f.height/map.height*100+'%';};
 const items=rep.items.map(item=>{
  if(!item.touch)return item;
  const match=rep.screens.find(s=>['x','y','width','height'].every(k=>Math.abs(s.outputFrame[k]-item.frame[k])<1));
  if(!match)return item; // A separately positioned touch pad keeps its own mapping.
  const screen=api.swap?rep.screens.find(s=>s.inputFrame&&s.inputFrame.y<192):match;
  return screen?{...item,frame:screen.outputFrame,touchScreen:screen}:item;
 });
 items.forEach(item=>{
  const pad=!Array.isArray(item.inputs)&&!item.touch,keys=Array.isArray(item.inputs)?item.inputs:[],button=document.createElement('button'),visual=document.createElement('span');
  button.className='skin-button imported-control'+(pad?' dpad':'')+(item.touch?' touch-region':'');button.setAttribute('aria-label',item.touch?'タッチスクリーン':pad?'十字キー':keys.join(' + '));
  const f=item.frame,e=item.extendedEdges||{},hit={x:f.x-(e.left||0),y:f.y-(e.top||0),width:Math.max(1,f.width+(e.left||0)+(e.right||0)),height:Math.max(1,f.height+(e.top||0)+(e.bottom||0))};
  position(button,hit,rep.mappingSize);visual.className='imported-control-art';position(visual,{x:f.x-hit.x,y:f.y-hit.y,width:f.width,height:f.height},hit);visual.style.opacity=item.opacity??1;
  if(item.touchScreen)button.style.transform=screenTransform(item.touchScreen.filters,api.ratio).toString();
  const normal=images[item.asset?.normal],selected=images[item.asset?.selected];if(normal)visual.style.backgroundImage=`url("${normal}")`;
  const sprite=document.createElement('span');sprite.className='skin-switch-sprite';
  if(item.animation){visual.style.backgroundImage='none';sprite.style.backgroundImage=normal?`url("${normal}")`:'';position(sprite,item.animation.begin,f);visual.append(sprite);}
  let thumb;if(item.thumbstick){thumb=document.createElement('span');thumb.className='skin-thumbstick';thumb.style.backgroundImage=`url("${images[item.thumbstick.name]}")`;thumb.style.width=item.thumbstick.width/f.width*100+'%';thumb.style.height=item.thumbstick.height/f.height*100+'%';visual.append(thumb);}
  if(pad&&!thumb)for(const dir of ['up','down','left','right']){const part=document.createElement('span');part.className='dpad-direction'+(normal?'':' baked');part.dataset.direction=dir;part.hidden=true;visual.append(part);}
  button.append(visual);host.append(button);let latched=!!api.selected?.(keys[0]);
  const show=on=>{button.classList.toggle('pressed',on);if(selected&&!item.animation)visual.style.backgroundImage=`url("${on?selected:normal||selected}")`;if(item.animation){position(sprite,on?item.animation.end:item.animation.begin,f);sprite.style.backgroundImage=`url("${on?(selected||normal):normal}")`;}};
  const input=event=>{
   const rect=visual.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
   if(item.touch){
    let tx=x,ty=y;
    if(item.touchScreen){
     const bounds=host.getBoundingClientRect(),ratio=api.ratio,screen=item.touchScreen,crop=screen.inputFrame||{x:0,y:0,width:256,height:384};
     const local=new DOMPoint(event.clientX-bounds.left-(f.x+f.width/2)*ratio,event.clientY-bounds.top-(f.y+f.height/2)*ratio).matrixTransform(screenTransform(screen.filters,ratio).inverse());
     tx=(crop.x+(local.x/(f.width*ratio)+.5)*crop.width)/256;
     const sourceY=crop.y+(local.y/(f.height*ratio)+.5)*crop.height;
     ty=(sourceY-(api.swap?0:192))/192;
    }
    if(!Number.isFinite(tx)||!Number.isFinite(ty)){engine.releaseTouch?.();return;}
    engine.touchAt?.(tx,ty);return;
   }
   let bits=0;
   if(pad){for(const [d,on]of [['left',x<1/3],['right',x>2/3],['up',y<1/3],['down',y>2/3]])if(on&&keybits[item.inputs[d]]!==undefined)bits|=1<<keybits[item.inputs[d]];
    for(const part of visual.querySelectorAll('[data-direction]'))part.hidden=!(bits&(1<<keybits[item.inputs[part.dataset.direction]]));
    if(thumb){thumb.style.left=Math.max(0,Math.min(1,x))*100+'%';thumb.style.top=Math.max(0,Math.min(1,y))*100+'%';}
   }else bits=keys.reduce((mask,k)=>mask|(keybits[k]===undefined?0:1<<keybits[k]),0);
   pressed.set(event.pointerId,bits);updateKeys();
  };
  const release=id=>{
   const record=held.get(id);if(!record||record.button!==button)return;
   held.delete(id);pressed.delete(id);record.end?.();if(item.touch)engine.releaseTouch?.();show(latched);updateKeys();
   if(thumb){thumb.style.left='50%';thumb.style.top='50%';}visual.querySelectorAll('[data-direction]').forEach(el=>el.hidden=true);
  };
  show(latched);
  const command=keys.find(k=>!gameInputs.has(k)),holdAction=command&&/^fastForward(?:[234]x)?$/.test(command);
  // Modal actions use click, after the pointer gesture is complete. Opening a
  // dialog on pointerdown lets the same tap activate its cancel/delete button.
  button.onclick=event=>{if(!command||holdAction||paused())return;event.preventDefault();event.stopPropagation();action(command);if(!item.selfRetracting&&button.isConnected){latched=api.selected?.(command)??!latched;show(latched);}};
  button.onkeydown=event=>{if(command&&['Enter','Space'].includes(event.code)){event.stopPropagation();if(event.repeat)event.preventDefault();}};
  button.onkeyup=event=>{if(command&&['Enter','Space'].includes(event.code))event.stopPropagation();};
  button.onpointerdown=event=>{
   if(event.button>0||paused())return;if(!command||holdAction)event.preventDefault();engine.unlockAudio?.();pointers.start(button,event,{move:pad||item.touch?input:undefined,end:()=>release(event.pointerId)});haptic();
   held.set(event.pointerId,{button});show(true);
   if(command&&holdAction){
    const end=action(command);const record=held.get(event.pointerId);if(record)record.end=end;else end?.();
    if(!item.selfRetracting)latched=!latched;
   }else if(!command)input(event);
  };
 });
 return{release:()=>pointers.release(),destroy(){pointers.destroy();host.replaceChildren();}};
}
