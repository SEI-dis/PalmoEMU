// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict');
(async()=>{
 const {createScreenAwake}=await import('../src/runtime/screen-awake.js');
 const doc=new EventTarget();doc.hidden=false;const requests=[];let resolveNext;
 class Lock extends EventTarget {async release(){this.releases=(this.releases||0)+1;this.dispatchEvent(new Event('release'));}}
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 const awake=createScreenAwake({document:doc,navigator:{wakeLock:{request:()=>{requests.push('screen');return new Promise(resolve=>{resolveNext=resolve;});}}}});
 awake.set({active:false});await flush();assert.equal(requests.length,0);
 awake.set({active:true});awake.set({active:true});await flush();assert.equal(requests.length,1);
 const stale=new Lock();awake.set({active:false});awake.set({active:true});resolveNext(stale);await flush();assert.equal(stale.releases,1);assert.equal(requests.length,2,'A stale pending request is replaced after resume');
 const visible=new Lock();resolveNext(visible);await flush();awake.set({active:true});assert.equal(requests.length,2);
 doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(visible.releases,1);
 doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));await flush();const disposed=new Lock();awake.dispose();resolveNext(disposed);await flush();assert.equal(disposed.releases,1);
 const denied=createScreenAwake({document:doc,navigator:{wakeLock:{request:async()=>{throw Error('low power');}}}});denied.set({active:true});await flush();denied.dispose();
 const unsupported=createScreenAwake({document:doc,navigator:{}});assert.equal(unsupported.supported,false);unsupported.set({active:true});unsupported.dispose();
 const {createPerformanceDiagnostics}=await import('../src/runtime/performance.js');let now=0;
 const measure=createPerformanceDiagnostics({clock:()=>now}),engine={canvas:{}},other={};
 measure.configure({engine,running:true});measure.frame(engine.canvas,0,16);assert.equal(measure.snapshot().frames,0,'Disabled measurement costs no samples');
 measure.configure({engine,enable:true,running:true,fps:60});
 for(let i=1;i<=400;i++){now=i*16.7;measure.frame(engine.canvas,now-2,now);measure.frame(other,now-1,now);}
 now+=100;measure.frame(engine.canvas,now-3,now);measure.audioGap(.02,engine);measure.audioGap(.03,other);measure.save(50,true,engine);measure.save(100,false,engine);
 let report=measure.snapshot();assert.equal(report.frames,401);assert.equal(report.delayedFrames,1);assert.equal(report.frameInterval.samples,256);assert.equal(report.audio.gaps,1);assert.equal(report.saving.count,2);assert.equal(report.saving.failures,1);
 measure.configure({engine,enable:true,running:false});const duration=measure.snapshot().durationMs;now+=10000;assert.equal(measure.snapshot().durationMs,duration);
 measure.configure({engine,enable:true,running:true});measure.frame(engine.canvas,now,now+2);assert.equal(measure.snapshot().delayedFrames,1,'Pause does not count as a delayed frame');
 measure.reset();assert.equal(measure.snapshot().frames,0);assert.equal(measure.snapshot().saving.count,0);
 const next={canvas:{}};measure.configure({engine:next,enable:true,running:true,fps:30});measure.frame(next.canvas,now,now);measure.frame(next.canvas,now+31,now+33);assert.equal(measure.snapshot().delayedFrames,0);
 measure.save(200,true,engine);assert.equal(measure.snapshot().saving.count,0,'Late save from the previous game is ignored');
 measure.save(20,true,next);measure.configure({enable:true,engine:null});measure.save(30,true,next);assert.equal(measure.snapshot().saving.count,1,'Exit drops core references and ignores pending results');assert.equal(measure.measuring,false);
 const paired={canvas:{},cores:[engine,next],view:0};measure.configure({engine:paired,enable:true,running:true});measure.audioGap(.01,next);measure.audioGap(.01,engine);paired.view=1;measure.audioGap(.01,next);assert.equal(measure.snapshot().audio.gaps,2,'Local link records audio only from the selected player');
 assert(!JSON.stringify(measure.snapshot()).includes('canvas'));
 console.log('PASS: wake-lock refusal/lifecycle/stale requests and bounded opt-in performance measurements.');
})().catch(error=>{console.error(error);process.exitCode=1;});
