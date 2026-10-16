// SPDX-License-Identifier: AGPL-3.0-or-later
// Old workers may not answer. Stop ports/timers when the candidate is replaced.
export function downloadProgressLabel(label,percent){
 return label+' '+new Intl.NumberFormat(document.documentElement.lang||undefined,{style:'percent',maximumFractionDigits:0}).format(percent/100);
}
export function updateDownloadState(worker,type='update-failure'){
 if(!worker)return Promise.resolve(null);
 return new Promise(resolve=>{
  const channel=new MessageChannel();let timer;
  const finish=value=>{clearTimeout(timer);channel.port1.close();resolve(value);};
  timer=setTimeout(()=>finish(null),500);channel.port1.onmessage=event=>finish(event.data);
  try{worker.postMessage({type},[channel.port2]);}catch{finish(null);}
 });
}
export function watchDownloadProgress(worker,onProgress){
 let stopped=false,timer,timeout,port;
 function stop(){stopped=true;clearTimeout(timer);clearTimeout(timeout);port?.close();}
 function poll(){
  if(stopped||worker.state!=='installing'){stop();return;}
  const channel=new MessageChannel();port=channel.port1;
  const next=()=>{clearTimeout(timeout);channel.port1.close();if(!stopped)timer=setTimeout(poll,500);};
  timeout=setTimeout(next,2000);
  port.onmessage=event=>{const {bytes,totalBytes}=event.data||{};if(!stopped&&worker.state==='installing'&&Number.isFinite(bytes)&&Number.isFinite(totalBytes)&&totalBytes>0&&bytes>=0&&bytes<=totalBytes)onProgress(Math.floor(bytes/totalBytes*100));next();};
  try{worker.postMessage({type:'update-progress'},[channel.port2]);}catch{next();}
 }
 poll();return stop;
}
