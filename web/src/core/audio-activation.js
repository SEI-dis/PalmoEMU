// SPDX-License-Identifier: AGPL-3.0-or-later
// Start Web Audio in the user's launch gesture, before ROM/storage/core awaits.
// The launch attempt owns this context until one core takes it. A blocked or
// cancelled launch must close its token in finally, even while resume is pending.
export function resumeAudioContext(context){
 try{return Promise.resolve(context.resume()).then(()=>context.state==='running',()=>false);}
 catch{return Promise.resolve(false);}
}
export function closeAudioContext(context){
 if(!context||context.state==='closed')return;
 try{return Promise.resolve(context.close()).catch(()=>{});}catch{}
}
export function prepareGameAudio(){
 let prepared=null,owned=true;
 try{
  const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(AudioContext){const context=new AudioContext();prepared={context,ready:resumeAudioContext(context)};}
 }catch{} // Unavailable audio must not prevent starting a game.
 return {
  take(){if(!owned)return null;owned=false;return prepared;},
  close(){if(!owned)return;owned=false;return closeAudioContext(prepared?.context);}
 };
}
