// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapter test. Fake clock, module exports and DOM script loader only;
// no browser profile, network, user ROM/save, microphone or emulation is used.
const assert=require('node:assert/strict');
(async()=>{
 const {NDSCore,ndsLanguages}=await import('../src/nds.js');
 const saved=new Map(),timers=new Map();let currentModule,time=0,nextTimer=0;
 const replace=(key,value)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});};
 const advance=ms=>{time+=ms;for(const [id,timer] of [...timers])if(timer.at<=time){timers.delete(id);timer.callback();}};
 replace('setTimeout',(callback,delay)=>{const id=++nextTimer;timers.set(id,{at:time+delay,callback});return id;});
 replace('clearTimeout',id=>timers.delete(id));replace('cancelAnimationFrame',()=>{});
 replace('window',{createNDS:async()=>currentModule});
 replace('document',{createElement:()=>({}),head:{append:script=>queueMicrotask(()=>script.onload())}});
 function fixture({legacy=false}={}){
  const calls=[],m={HEAPU8:new Uint8Array(64),_malloc:()=>8,_free:()=>{},_web_load:()=>{calls.push(['load']);return 1;},_web_fps:()=>60,_web_touch:()=>{},_web_reset:()=>calls.push(['reset']),_web_state_import:()=>{calls.push(['state']);return 1;},_web_close:()=>calls.push(['close'])};
  if(!legacy){m._web_set_language=value=>{calls.push(['language',value]);return 1;};m._web_blow=value=>calls.push(['blow',value]);}
  const core=Object.assign(Object.create(NDSCore.prototype),{paused:true,closed:false,keys:0,videos:[],display:{remove(){}},stopAudio(){},draw(){},scheduleFrame(){},startLoop(){this.paused=false;}});
  return {core,m,calls};
 }
 try{
  for(const coreKey of ['desmume2015','melonds']){
   for(const [index,language] of ndsLanguages.entries()){
    const {core,m,calls}=fixture();currentModule=m;core.setNDSOptions({ndsLanguage:language});await core.load(new Uint8Array([1]),{system:'nds',coreKey});
    assert.deepEqual(calls.slice(0,2),[['language',index-1],['load']],'Apply language before initializing either core');
    assert.equal(core.canBlow,true);assert.equal(core.supportsNDSLanguage,true);
    core.setNDSOptions({ndsLanguage:'es'});assert.equal(calls.filter(call=>call[0]==='language').length,1,'Retain live preference for the next launch');
    core.reset();assert.equal(calls.filter(call=>call[0]==='language').length,1,'Reset does not replace the running firmware');core.close();
   }
   const {core,m,calls}=fixture();currentModule=m;core.setNDSOptions({ndsLanguage:'invalid'});await core.load(new Uint8Array([1]),{system:'nds',coreKey});assert.deepEqual(calls[0],['language',-1]);
   const active=()=>calls.filter(call=>call[0]==='blow').at(-1)?.[1];
   core.pause(true);assert.equal(core.blow(),false);assert.equal(timers.size,0);core.pause(false);
   assert.equal(core.blow(),true);assert.equal(active(),1);advance(4999);assert.equal(active(),1);advance(1);assert.equal(active(),0);assert.equal(core.blowing,false);assert.equal(timers.size,0);
   core.blow();advance(4000);core.blow();assert.equal(timers.size,1);advance(1000);assert.equal(active(),1,'A repeated action replaces the old deadline');advance(4000);assert.equal(active(),0);
   for(const stop of [()=>core.pause(true),()=>core.reset(),()=>core.loadState(new Uint8Array([1]))]){
    core.pause(false);core.blow();stop();assert.equal(active(),0);assert.equal(core.blowing,false);assert.equal(timers.size,0);
   }
   core.pause(false);core.blow();m._web_state_import=()=>0;assert.throws(()=>core.loadState(new Uint8Array([0])));assert.equal(active(),0);assert.equal(timers.size,0);
   core.blow();core.close();assert.equal(active(),0);assert.equal(timers.size,0);assert.equal(core.canBlow,false);assert.equal(core.blow(),false);const count=calls.length;advance(10000);assert.equal(calls.length,count,'No timer calls into a closed core');
   const old=fixture({legacy:true});currentModule=old.m;old.core.setNDSOptions({ndsLanguage:'fr'});await old.core.load(new Uint8Array([1]),{system:'nds',coreKey});
   assert.equal(old.core.canBlow,false);assert.equal(old.core.supportsNDSLanguage,false);assert.equal(old.core.blow(),false);assert.deepEqual(old.calls,[['load']]);
   old.core.pause(true);old.core.loadState(new Uint8Array([1]));old.core.reset();old.core.close();assert.equal(timers.size,0,'Older cached exports retain normal lifecycle support');
  }
  console.log('PASS: both NDS adapter mappings, boot-only language, five-second/retrigger timing, pause/reset/state/close cancellation and old-export fallback.');
 }finally{for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
})().catch(error=>{console.error(error);process.exitCode=1;});
