// SPDX-License-Identifier: AGPL-3.0-or-later
// This script runs in the waiting Service Worker, never in a game page.
function automaticUpdateCoordinator(base){
 let running=false,activated;
 const scopeClients=async()=> (await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(client=>client.url.startsWith(base.href));
 function ask(client,type,token){return new Promise(resolve=>{
  const channel=new MessageChannel(),port=channel.port1;
  const timer=setTimeout(()=>{port.onmessage=null;resolve({ready:false,client,port});},2000);
  port.onmessage=event=>{clearTimeout(timer);port.onmessage=null;resolve({ready:event.data?.ready===true,client,port});};
  try{client.postMessage({type,token},[channel.port2]);}catch{clearTimeout(timer);port.close();resolve({ready:false,client});}
 });}
 async function apply(source){
  if(running||!self.navigator.locks||!source?.url||!source.url.startsWith(base.href)||!self.registration.waiting)return false;
  running=true;let prepared=[];
  try{
   const clients=await scopeClients();if(!clients.length)return false;
   const token=crypto.randomUUID(),probes=await Promise.all(clients.map(client=>ask(client,'local-play-update-probe',token)));
   probes.forEach(result=>result.port?.close());if(probes.some(result=>!result.ready))return false;
   prepared=await Promise.all(clients.map(client=>ask(client,'local-play-update-prepare',token)));
   if(prepared.some(result=>!result.ready))return false;
   return await self.navigator.locks.request('local-play-version:'+base.pathname,{ifAvailable:true},async lock=>{
    if(!lock)return false;
    const known=new Set(clients.map(client=>client.id));
    if((await scopeClients()).some(client=>!known.has(client.id)))return false;
    // Keep new tabs behind the version lock until claim() has switched controllers.
    let timer;const completion=new Promise((resolve,reject)=>{activated=resolve;timer=setTimeout(()=>reject(Error('Activation timed out')),10000);});
    // All prepared pages have shown their update indicator. Give it time to be read.
    try{await new Promise(resolve=>setTimeout(resolve,1200));await self.skipWaiting();await completion;return true;}finally{clearTimeout(timer);activated=null;}
   });
  }finally{
   for(const result of prepared){try{result.port?.postMessage({type:'cancel'});}catch{}result.port?.close();}
   running=false;
  }
 }
 return {apply,activated:()=>activated?.()};
}
