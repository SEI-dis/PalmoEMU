// SPDX-License-Identifier: AGPL-3.0-or-later
// Trusted browser clicks with a controlled Web Audio policy double. This checks
// activation/lifetime ordering, not physical iPhone audio-session permission.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');await page.locator('#add-first').waitFor();
  await page.evaluate(async()=>{
   const {prepareGameAudio}=await import('./src/core/audio-activation.js'),{MGBACore}=await import('./src/core/mgba.js');
   window.audioFixture={contexts:[],insideClick:false,mode:'success',outcome:'start',started:0,finished:0,states:[]};const f=audioFixture;
   class Context extends EventTarget{
    constructor(){super();if(f.mode==='constructor-failure')throw Error('Audio hardware unavailable');this.state='suspended';this.destination={};this.currentTime=0;this.calls=[];this.pending=[];this.closed=0;this.createdInClick=f.insideClick;f.contexts.push(this);}
    resume(){this.calls.push({operation:'resume',inClick:f.insideClick});if(f.mode==='denied')return Promise.reject(Error('Autoplay refused'));if(f.mode==='pending')return new Promise(resolve=>this.pending.push(()=>{if(this.state!=='closed')this.change('running');resolve();}));if(this.state!=='closed')this.change('running');return Promise.resolve();}
    change(state){this.state=state;this.dispatchEvent(new Event('statechange'));}
    suspend(){this.calls.push({operation:'suspend'});if(this.state!=='closed')this.change('suspended');return Promise.resolve();}
    close(){this.closed++;this.change('closed');return Promise.resolve();}
    createGain(){return {gain:{value:0},connect(){},disconnect(){}};}
   }
   window.AudioContext=Context;window.webkitAudioContext=undefined;f.AudioContext=Context;
   const button=document.createElement('button');button.id='audio-launch-fixture';button.textContent='Start audio fixture';button.style.cssText='position:fixed;top:0;left:0;z-index:99999';document.body.append(button);
   button.onclick=async event=>{
    f.trusted=event.isTrusted;f.insideClick=true;const token=prepareGameAudio();f.token=token;f.insideClick=false;f.started++;
    try{
     await new Promise(resolve=>{f.finishLaunch=resolve;});
     if(f.outcome!=='start')return; // Update blocking, cancellation or startup error.
     const core=new MGBACore(document.createElement('canvas'));f.core=core;core.onAudioState=state=>f.states.push(state);f.adopted=core.adoptAudio(token);
     f.unlock=core.unlockAudio();core.pause(false); // Gameplay need not await sound.
    }finally{token.close();f.finished++;}
   };
  });
  const begin=async(mode='success',outcome='start')=>{
   const previous=await page.evaluate(({mode,outcome})=>{audioFixture.mode=mode;audioFixture.outcome=outcome;return audioFixture.started;},{mode,outcome});
   await page.locator('#audio-launch-fixture').click();await page.waitForFunction(n=>audioFixture.started===n+1,previous);
   return previous;
  };
  const finish=async previous=>{await page.evaluate(()=>audioFixture.finishLaunch());await page.waitForFunction(n=>audioFixture.finished===n+1,previous);};
  let attempt=await begin();
  assert.deepEqual(await page.evaluate(()=>{const f=audioFixture,c=f.contexts.at(-1);return {trusted:f.trusted,createdInClick:c.createdInClick,resumedInClick:c.calls[0].inClick,coreCreated:!!f.core};}),{trusted:true,createdInClick:true,resumedInClick:true,coreCreated:false},'Context creation and resume happen in the real click before asynchronous launch work');
  await finish(attempt);
  assert.deepEqual(await page.evaluate(async()=>{const f=audioFixture;return {adopted:f.adopted,same:f.core.ac===f.contexts[0],unlocked:await f.unlock,contexts:f.contexts.length,closed:f.core.ac.closed,state:f.core.audioState};}),{adopted:true,same:true,unlocked:true,contexts:1,closed:0,state:'running'},'The late-created core adopts the exact activated context; launch finally cannot close it');
  assert.equal(await page.evaluate(async()=>{const f=audioFixture;f.core.pause(true);const paused=f.core.audioState==='paused'&&f.core.ac.state==='suspended';f.core.pause(false);await f.core.unlockAudio();f.core.close();return paused&&f.core.ac.closed===1&&f.core.audioState==='closed';}),true,'Adoption preserves pause/resume/close behavior');
  for(const outcome of ['cancel','update-blocked','startup-error']){
   attempt=await begin('pending',outcome);await finish(attempt);
   assert.deepEqual(await page.evaluate(async()=>{const c=audioFixture.contexts.at(-1);audioFixture.token.close();c.pending.forEach(done=>done());await Promise.resolve();return {closed:c.closed,state:c.state,taken:audioFixture.token.take()};}),{closed:1,state:'closed',taken:null},outcome+' disposes even a pending activation exactly once');
  }
  attempt=await begin('denied');await finish(attempt);
  assert.deepEqual(await page.evaluate(async()=>{const f=audioFixture;return {unlocked:await f.unlock,state:f.core.audioState,playing:!f.core.paused};}),{unlocked:false,state:'blocked',playing:true},'Autoplay refusal cannot fail or pause gameplay');
  await page.evaluate(()=>audioFixture.core.close());
  attempt=await begin('pending');await finish(attempt);
  assert.deepEqual(await page.evaluate(()=>({state:audioFixture.core.audioState,resumes:audioFixture.core.ac.calls.filter(c=>c.operation==='resume').length,playing:!audioFixture.core.paused})),{state:'pending',resumes:1,playing:true},'Core adoption reuses a pending resume instead of continuously retrying');
  await page.evaluate(()=>{const b=document.createElement('button');b.id='audio-enable-fixture';b.textContent='Enable sound';b.style.cssText='position:fixed;top:50px;left:0;z-index:99999';b.onclick=()=>{audioFixture.insideClick=true;audioFixture.mode='success';audioFixture.retry=audioFixture.core.unlockAudio({retry:true});audioFixture.insideClick=false;};document.body.append(b);});
  await page.locator('#audio-enable-fixture').click();
  assert.deepEqual(await page.evaluate(async()=>{const f=audioFixture;await f.retry;return {state:f.core.audioState,resumes:f.core.ac.calls.filter(c=>c.operation==='resume').length,lastInClick:f.core.ac.calls.at(-1).inClick};}),{state:'running',resumes:2,lastInClick:true},'An explicit enable-sound click can retry a browser promise left pending');
  assert.equal(await page.evaluate(async()=>{
   const f=audioFixture;let closes=0;f.core.m={_web_close:()=>closes++};f.core.nativeModule={HEAPU8:new Uint8Array(1024)};
   f.core.close();const released=f.core.m===null&&f.core.nativeModule===null;f.core.close();
   f.core.ac.pending.forEach(done=>done());await f.unlock;
   return released&&closes===1&&f.core.ac.closed===1&&f.core.ac.state==='closed'&&f.core.audioState==='closed'&&await f.core.unlockAudio()===false;
  }),true,'A retained adapter releases its module even with pending audio, closes once and cannot reopen');
  assert.equal(await page.evaluate(async()=>{
   const {MGBACore}=await import('./src/core/mgba.js'),create=window.createMGBA,core=new MGBACore(document.createElement('canvas'));
   let resolve;window.createMGBA=()=>new Promise(done=>resolve=done);
   try{
    const loading=core.load(new Uint8Array(8192)).then(()=>false,error=>error.name==='AbortError');core.close();resolve({});
    return await loading&&core.m==null&&core.nativeModule==null&&core.tick==null;
   }finally{window.createMGBA=create;}
  }),true,'An asynchronously created module cannot attach or start after close');
  attempt=await begin('constructor-failure');await finish(attempt);
  assert.deepEqual(await page.evaluate(async()=>({adopted:audioFixture.adopted,playing:!audioFixture.core.paused,unlocked:await audioFixture.unlock})),{adopted:false,playing:true,unlocked:false},'Unavailable audio hardware does not reject launch');
  await page.evaluate(()=>audioFixture.core.close());
  assert.equal(await page.evaluate(async()=>{
   const {MGBACore}=await import('./src/core/mgba.js'),{NDSCore}=await import('./src/core/nds.js'),{RetroCore}=await import('./src/core/retro.js'),{JgenesisCore}=await import('./src/core/jgenesis.js'),{ThreeDSCore}=await import('./src/core/three-ds.js');
   return [NDSCore,RetroCore,JgenesisCore,ThreeDSCore].every(Core=>Core.prototype.adoptAudio===MGBACore.prototype.adoptAudio&&Core.prototype.unlockAudio===MGBACore.prototype.unlockAudio);
  }),true,'All supported adapters inherit the activation transfer');
  assert.equal(await page.evaluate(async()=>{
   const {prepareGameAudio}=await import('./src/core/audio-activation.js'),{ThreeDSCore}=await import('./src/core/three-ds.js');
   audioFixture.mode='success';const token=prepareGameAudio(),core=new ThreeDSCore(document.createElement('div'));core.call=async()=>{};core.adoptAudio(token);token.close();await core.unlockAudio();await core.close();
   return core.ac.closed===1&&core.audioState==='closed'&&core.observedAudio===null;
  }),true,'Worker-core teardown also releases its transferred context and state listener');
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS '+kind+': real-click audio preparation, async core transfer, cancellation/update/error cleanup, rejected/pending activation, explicit retry, pause/close and inherited adapters. Physical iPhone audio untested.');
 }finally{await browser.close();}
})().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
