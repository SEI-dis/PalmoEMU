// SPDX-License-Identifier: AGPL-3.0-or-later
// A visible, running game may request the screen lock. OS refusal is harmless.
export function createScreenAwake({document:doc=globalThis.document,navigator:nav=globalThis.navigator}={}){
 let playing=false,enabled=true,lock=null,pending=null,disposed=false,epoch=0;
 const wanted=()=>!disposed&&enabled&&playing&&!doc.hidden;
 function release(){epoch++;const previous=lock;lock=null;previous?.release().catch(()=>{});}
 async function sync(){
  if(!wanted()){release();return;}
  if(lock||pending||!nav?.wakeLock?.request)return;
  const generation=epoch;
  const request=Promise.resolve().then(()=>nav.wakeLock.request('screen'));pending=request;
  try{
   const next=await request;
   if(!wanted()||epoch!==generation){await next.release().catch(()=>{});return;}
   lock=next;next.addEventListener('release',()=>{if(lock===next)lock=null;},{once:true});
  }catch{/* Permission, battery policy, or unsupported environment: keep playing. */}
  finally{if(pending===request)pending=null;if(generation!==epoch&&wanted())void sync();}
 }
 const visibility=()=>{void sync();},hide=()=>release();
 doc.addEventListener('visibilitychange',visibility);globalThis.window?.addEventListener('pagehide',hide);
 return {get supported(){return !!nav?.wakeLock?.request;},set({active,allow=true}){playing=!!active;enabled=allow!==false;void sync();},
  dispose(){disposed=true;release();doc.removeEventListener('visibilitychange',visibility);globalThis.window?.removeEventListener('pagehide',hide);}};
}
