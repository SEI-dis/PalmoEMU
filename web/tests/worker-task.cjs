// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict');
(async()=>{
 const {runWorkerTask}=await import('../src/workers/task.js');
 class Worker {
  constructor(){this.stopped=0;}
  postMessage(value){this.sent=value;}
  terminate(){this.stopped++;}
  emit(data){this.onmessage({data});}
 }
 const options={errorMessage:()=> 'worker failed',messageError:()=> 'unreadable reply'};
 const verify=worker=>{assert.equal(worker.stopped,1);for(const key of ['onmessage','onerror','onmessageerror'])assert.equal(worker[key],null);};
 const worker=new Worker(),progress=[],payload={language:'en',file:{local:true}};
 const task=runWorkerTask(()=>worker,payload,{...options,onProgress:value=>progress.push(value)});
 assert.equal(worker.sent,payload);worker.emit({type:'progress',index:1});assert.equal(worker.stopped,0);
 const late=worker.onmessage,done={type:'done',value:42};worker.emit(done);assert.equal(await task,done);
 late({data:{type:'error',message:'late failure'}});verify(worker);assert.deepEqual(progress,[{type:'progress',index:1}]);
 for(const mode of ['error','message','post','mapping']){
  const w=new Worker();if(mode==='post')w.postMessage=()=>{throw Error('clone failed');};
  const p=runWorkerTask(()=>w,{}, {...options,mapError:data=>{if(mode==='mapping')throw Error('mapping failed');return Object.assign(Error(data.message),{name:data.name,addedCount:data.addedCount});}});
  const check=assert.rejects(p,error=>{
   if(mode==='error'){assert.equal(error.name,'QuotaExceededError');assert.equal(error.addedCount,2);}
   return true;
  });
  if(mode==='error'||mode==='mapping')w.emit({type:'error',message:'failed',name:'QuotaExceededError',addedCount:2});
  if(mode==='message')w.onmessageerror();
  await check;verify(w);
 }
 const native=new Worker(),nativeTask=runWorkerTask(()=>native,{},options);let prevented=false;
 const rejected=assert.rejects(nativeTask,/worker failed/);native.onerror({message:'',preventDefault(){prevented=true;}});await rejected;verify(native);assert(prevented);
 await assert.rejects(runWorkerTask(()=>{throw Error('blocked worker');},{},options),/blocked worker/);
 console.log('PASS: single-task Worker progress/result, import error metadata, clone/transport/mapping failures, late reply isolation and exactly-once cleanup.');
})().catch(error=>{console.error(error);process.exitCode=1;});
