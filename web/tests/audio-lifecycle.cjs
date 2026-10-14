// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const page=await browser.newPage();await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');await page.locator('#add-first').waitFor();
  const result=await page.evaluate(async()=>{
   const {MGBACore}=await import('./src/core/mgba.js'),{LocalLinkCore}=await import('./src/link/local-link-core.js'),{ThreeDSCore}=await import('./src/core/three-ds.js');
   if(!window.AudioContext&&!window.webkitAudioContext)window.AudioContext=class {};
   const check=(ok,label)=>{if(!ok)throw Error(label);};
   // Model queued Web Audio control messages rather than immediate state changes.
   const make=()=>{
    const core=new MGBACore(document.createElement('canvas')),calls=[],tasks=[];
    const ac={state:'running',currentTime:0,destination:{},createGain:()=>({gain:{value:0},connect(){}}),
     resume(){calls.push('resume');return new Promise(resolve=>tasks.push(()=>{ac.state='running';resolve();}));},
     suspend(){calls.push('suspend');return new Promise(resolve=>tasks.push(()=>{ac.state='suspended';resolve();}));},close(){ac.state='closed';return Promise.resolve();}};
    core.ac=ac;core.video={dispose(){}};core.draw=()=>{};
    const flush=async()=>{while(tasks.length){tasks.shift()();await Promise.resolve();}await Promise.resolve();};
    return {core,ac,calls,flush};
   };
   const f=make();f.core.pause(true);check(f.calls.at(-1)==='suspend','Pause requests AudioContext suspension');
   const opening=f.core.unlockAudio();check(f.calls.at(-1)==='resume','Fast resume queues resume before suspend state notification');await f.flush();await opening;check(f.ac.state==='running','Fast resume ultimately runs audio');
   f.ac.state='suspended';const late=f.core.unlockAudio();f.core.pause(true);await f.flush();await late;await f.flush();check(f.ac.state==='suspended','Late unlock cannot leave audio running after pause');
   f.ac.resume=()=>Promise.reject(Error('Autoplay refused'));check(await f.core.unlockAudio()===false,'Autoplay refusal is handled');f.core.close();check(await f.core.unlockAudio()===false,'Closed core cannot reopen audio');
   const p=make(),q=make(),pair=new LocalLinkCore(p.core,q.core);await p.flush();await q.flush();pair.pause(false);const playing=pair.unlockAudio();await p.flush();await q.flush();await playing;
   check(p.core.paused&&p.ac.state==='running'&&q.ac.state==='suspended','Selected local-link audio runs while child CPU is externally driven');
   pair.select(1);await p.flush();await q.flush();check(p.ac.state==='suspended'&&q.ac.state==='running','Player selection suspends old audio and starts selected audio');
   pair.pause(true);await p.flush();await q.flush();check(p.ac.state==='suspended'&&q.ac.state==='suspended','Pausing local link suspends both outputs');pair.dispose();p.core.close();
   const d=new ThreeDSCore(document.createElement('div')),s=make();d.ac=s.ac;d.send=()=>{};d.releaseTouch=()=>{};d.pause(true);await s.flush();check(s.ac.state==='suspended','Worker core uses shared suspension');
   return true;
  });assert.equal(result,true);
  console.log('PASS '+kind+': AudioContext pause/resume ordering, late unlock, refusal, local-link selected output and 3DS suspension. Physical iOS audio-session behavior untested.');
 }finally{await browser.close();}
})().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
