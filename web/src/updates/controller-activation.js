// SPDX-License-Identifier: AGPL-3.0-or-later
// controllerchange can arrive before activate (including cache cleanup and
// clients.claim()) finishes. Keep the old page alive until the new controller
// is usable; navigating earlier also leaves stale state objects in WebKit.
export function afterControllerActivation(callback,container=navigator.serviceWorker){
 let observed=null,stopped=false;
 function stop(){
  if(stopped)return;stopped=true;
  container.removeEventListener('controllerchange',check);
  observed?.removeEventListener('statechange',check);observed=null;
 }
 function check(){
  if(stopped)return;
  const current=container.controller;
  if(current!==observed){
   observed?.removeEventListener('statechange',check);observed=current;
   observed?.addEventListener('statechange',check);
  }
  if(current?.state==='activated'){stop();callback(current);}
 }
 container.addEventListener('controllerchange',check);check();
 return stop;
}
