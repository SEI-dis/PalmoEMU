// SPDX-License-Identifier: AGPL-3.0-or-later
// Game gestures belong to the emulator. Keep native clicks for menu/skin
// commands and native editing/scrolling in the communication panel.
export function guardPlayerGestures(player){
 const targetOf=event=>{
  const target=event.target instanceof Element?event.target:event.target?.parentElement;
  if(!target||target.closest('#link-panel,#capture-menu,#recording-preview,#screenshot-preview,input,textarea,select')||target.isContentEditable)return null;
  return target;
 };
 const cancelGesture=event=>{if(targetOf(event)&&event.cancelable)event.preventDefault();};
 const cancelTouch=event=>{
  const target=targetOf(event);if(!target)return;
  // Cancelling touchend would suppress the native click used by commands.
  // Game buttons, touch screens and empty areas are handled by Pointer Events.
  if(target.closest('button,a,[role="button"],summary')&&!target.closest('[data-game-input]'))return;
  if(event.cancelable)event.preventDefault();
 };
 const listeners=[['gesturestart',cancelGesture],['gesturechange',cancelGesture],['dblclick',cancelGesture],['touchmove',cancelTouch],['touchend',cancelTouch]];
 for(const [type,handler]of listeners)player.addEventListener(type,handler,{capture:true,passive:false});
 return()=>{for(const [type,handler]of listeners)player.removeEventListener(type,handler,true);};
}
