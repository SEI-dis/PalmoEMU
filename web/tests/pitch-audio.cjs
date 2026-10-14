// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated profile, generated stereo tones and an original test cartridge only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const kind=process.env.BROWSER_ENGINE||'chromium',browserType=require('./browser-runtime.cjs')[kind];
(async()=>{
 const browser=await browserType.launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');
  await page.locator('#add-first').waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
  const result=await page.evaluate(async()=>{
   const {MGBACore}=await import('./src/core/mgba.js'),{RetroCore}=await import('./src/core/retro.js'),{NDSCore}=await import('./src/core/nds.js'),{JgenesisCore}=await import('./src/core/jgenesis.js'),{ThreeDSCore}=await import('./src/core/three-ds.js'),{LocalLinkCore}=await import('./src/link/local-link-core.js');
   const check=(ok,label)=>{if(!ok)throw Error(label);};
   for(const Core of [MGBACore,RetroCore,NDSCore,JgenesisCore,ThreeDSCore]){
    check(new Core(document.createElement(Core===MGBACore?'canvas':'div')).preservePitch===true,'Every core preserves pitch before settings are applied');
    for(const method of ['setPreservePitch','queueAudio','stopAudio'])check(Core.prototype[method]===MGBACore.prototype[method],'Every core inherits pitch control and audio scheduling');
   }
   for(const Core of [RetroCore,NDSCore,JgenesisCore])for(const method of ['audio','setSpeed'])check(Core.prototype[method]===MGBACore.prototype[method],'Synchronous cores use the shared audio path');
   const linked=[new MGBACore(document.createElement('canvas')),new MGBACore(document.createElement('canvas'))],local=new LocalLinkCore(...linked);local.setPreservePitch(true);check(linked.every(core=>core.preservePitch===true),'Both local-link cores retain pitch preservation');local.dispose();
   if(typeof OfflineAudioContext==='undefined')return{unavailable:true};
   const frequency=(data,start,end)=>{
    const crossings=[];for(let i=start+1;i<end;i++)if(data[i-1]<0&&data[i]>=0)crossings.push(i-data[i]/(data[i]-data[i-1]));
    return (crossings.length-1)*48000/(crossings.at(-1)-crossings[0]);
   };
   const cases=[];
   for(const rate of [32768,44100,48000])for(const speed of [1,2,3,4,5]){
    let normal;
    for(const preserve of [false,true]){
     const ac=new OfflineAudioContext(2,Math.ceil((2/speed+.2)*48000),48000),core=new MGBACore(document.createElement('canvas'));
     const samples=Math.round(rate*2),chunk=Math.round(rate/60);let frame=0,n=0,now=0,heap=new Int16Array(chunk*2+16),starts=[],ends=[];
     core.m={get HEAP16(){return heap;},_web_audio:()=>32,_web_audio_rate:()=>rate,_web_audio_read:()=>n};
     core.ac={state:'running',get currentTime(){return now;},createBuffer:ac.createBuffer.bind(ac),createBufferSource:()=>{
      const source=ac.createBufferSource(),start=source.start.bind(source);
      source.start=t=>{starts.push(t);ends.push(t+source.buffer.duration/source.playbackRate.value);check(source.playbackRate.value===(preserve?1:speed),'Playback rate matches the selected mode');start(t);};return source;
     }};
     core.gain=ac.createGain();core.gain.connect(ac.destination);core.setSpeed(speed);core.setPreservePitch(preserve);
     while(frame<samples){
      n=Math.min(chunk,samples-frame);heap=new Int16Array(n*2+16); // Changing memory view + nonzero WASM pointer.
      for(let i=0;i<n;i++){heap[16+i*2]=Math.sin(2*Math.PI*440*(frame+i)/rate)*19660;heap[17+i*2]=Math.sin(2*Math.PI*660*(frame+i)/rate)*9830;}
      // The same burst cadence as a 60 Hz display running multiple emulated frames.
      now=Math.floor(frame/rate/speed*60)/60;core.audio();frame+=n;
      check(core.nextAudio-now<.16,'Live queue latency remains bounded');
     }
     check(starts.length>2,'Audio was scheduled');
     for(let i=1;i<starts.length;i++)check(Math.abs(starts[i]-ends[i-1])<1e-9,'Continuous stream has no scheduling gaps');
     check(Math.abs(ends.at(-1)-starts[0]-2/speed)<.035,'Output tempo follows emulation speed');
     const pending=core.sources.size;core.setSpeed(speed);core.setPreservePitch(preserve);check(core.sources.size===pending,'Unchanged settings do not cancel sound');
     const rendered=await ac.startRendering(),start=Math.ceil((starts[0]+.065)*48000),end=Math.floor((ends.at(-1)-.025)*48000),hz=[];
     for(const [ch,tone,amplitude]of [[0,440,.6],[1,660,.3]]){
      const data=rendered.getChannelData(ch),actual=frequency(data,start,end);hz.push(actual);
      check(Math.abs(actual-tone*(preserve?1:speed))<5,`${rate} / ${speed}x / ${preserve} / channel ${ch}: ${actual} Hz`);
      let energy=0;for(let i=start;i<end;i++)energy+=data[i]**2;check(Math.sqrt(energy/(end-start))>amplitude*.55,'Stereo energy is preserved');
      check(data.slice(0,Math.floor(starts[0]*48000)-64).every(v=>v===0),'Silence before the scheduled start');
      check(data.slice(Math.ceil((ends.at(-1)+.005)*48000)).every(v=>Math.abs(v)<.0001),'No trailing audio');
     }
     if(speed===1){if(!preserve)normal=rendered;else for(let ch=0;ch<2;ch++){const a=normal.getChannelData(ch),b=rendered.getChannelData(ch);check(a.every((v,i)=>v===b[i]),'1x bypass is sample-identical');}}
     cases.push({rate,speed,preserve,hz});
    }
   }
   // Every discontinuity must clear scheduled sound and the overlap history.
   const ac=new OfflineAudioContext(2,48000,48000),core=new MGBACore(document.createElement('canvas'));let reads=0,closed=0;
   core.m={HEAP16:new Int16Array(2048).fill(12000),_web_audio:()=>0,_web_audio_rate:()=>48000,_web_audio_read:()=>{reads++;return 1024;},_web_reset:()=>{},_web_state_import:()=>1,_web_close:()=>{closed++;}};
   core.ac={state:'running',currentTime:0,createBuffer:ac.createBuffer.bind(ac),createBufferSource:ac.createBufferSource.bind(ac),close:()=>{}};
   core.gain=ac.createGain();core.gain.connect(ac.destination);core.copyIn=(_,fn)=>fn(0,1);core.draw=()=>{};
   const empty=()=>check(core.sources.size===0&&core.nextAudio===0&&(!core.stretch||core.stretch.size===0),'Discontinuity clears pending audio and DSP');
   const fill=()=>{core.setVolume(.7);core.setSpeed(2);core.setPreservePitch(true);for(let i=0;i<6;i++)core.audio();check(core.sources.size>0,'Sources primed');};
   for(const change of [()=>core.setSpeed(3),()=>core.setPreservePitch(false),()=>core.setVolume(0),()=>core.pause(true),()=>core.reset(),()=>core.loadState(new Uint8Array([0]))]){fill();change();empty();}
   fill();for(let i=0;i<300;i++)core.audio();check(core.nextAudio<=.23&&core.sources.size<=11,'Stalled clock cannot grow the source queue');core.stopAudio();empty();
   core.setVolume(0);const before=reads;core.audio();empty();check(reads===before+1,'Muted bridge is still drained');
   core.setVolume(.7);core.ac.state='suspended';core.audio();empty();core.ac.state='running';
   fill();core.close();empty();check(closed===1,'Close reaches native adapter');
   const cancelled=await ac.startRendering();check(cancelled.getChannelData(0).every(v=>v===0),'All cancelled sources remain silent');
   return{cases};
  });
  if(result.unavailable)console.log('SKIP: this browser build has no OfflineAudioContext; rendered audio is not verified.');
  else{assert.equal(result.cases.length,30);console.log('PASS: 30 rendered stereo cases (32.768/44.1/48 kHz, 1–5x, on/off), 1x sample identity, continuous timing, bounded queue and pause/mute/toggle/speed/state/reset/close cancellation.');}
  const pitch=page.locator('[data-setting=preservePitch],[data-menu-option=preservePitch]');
  const settings=async()=>{await page.locator('[data-tab=settings]').click();await page.locator('#content [data-action=audio]').click();};
  const instrument=()=>page.evaluate(async()=>{const {MGBACore}=await import('./src/core/mgba.js'),original=MGBACore.prototype.setSpeed;MGBACore.prototype.setSpeed=function(v){window.testEngine=this;return original.call(this,v);};});
  await settings();assert.equal(await pitch.count(),0,'Common audio settings have no pitch toggle');
  await page.locator('#close-sheet').click();await page.locator('[data-tab=games]').click();
  await page.locator('#rom-input').setInputFiles({name:'Original pitch test.gba',mimeType:'application/octet-stream',buffer:Buffer.from(require('./link.cjs').cartridge(31,992))});
  await page.locator('.game-launch').waitFor();
  await page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),game=(await db.all('library'))[0],settings=JSON.parse(localStorage.getItem('manic-settings'));settings.preservePitch=false;localStorage.setItem('manic-settings',JSON.stringify(settings));await db.setGamePreferences(game.id,{preservePitch:false});});
  await page.reload();await page.locator('.game-launch').waitFor();await instrument();
  await page.locator('[data-details]').click();assert.equal(await pitch.count(),0,'A legacy game override cannot restore the removed menu toggle');
  await page.locator('[data-action=play]').click();await page.locator('#loading').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>testEngine.preservePitch),true,'Legacy common and game false values are ignored at launch');
  for(const speed of [2,3,4,5,1]){await page.locator('#boost').click();assert.deepEqual(await page.evaluate(()=>({speed:testEngine.speed,preservePitch:testEngine.preservePitch})),{speed,preservePitch:true});}
  await page.locator('#player-menu').click();assert.equal(await pitch.count(),0,'The playing menu has no pitch toggle');await page.locator('[data-setting=speed]').selectOption('3');
  assert.equal(await page.evaluate(()=>testEngine.preservePitch),true,'Changing live settings always preserves pitch');
  if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,kind+'-pitch-menu.png')});}
  await page.locator('[data-action=play]').click();assert.equal(await page.evaluate(()=>testEngine.speed),3);
  await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  // Old backups remain readable, but their false value cannot disable audio
  // preservation after the restored settings are applied on the next launch.
  await page.evaluate(async()=>{const backup=await import('./src/storage/backup.js'),settings={speed:4,volume:.4,preservePitch:false,autosave:false,recovery:false};const saved=await backup.createBackup(settings),plan=await backup.inspectBackup(saved.text);await backup.restoreBackup(plan,{settings,includeSettings:true});});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).preservePitch),false,'The fixture restored a real legacy false value');
  assert.equal(await page.evaluate(async()=>(await (await import('./src/storage/storage.js')).all('library'))[0].preferences.preservePitch),false,'Legacy per-game data remains readable');
  await page.reload();await page.locator('.game-launch').waitFor();await instrument();await page.locator('.game-launch').click();assert.equal(await pitch.count(),0);await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>testEngine.preservePitch),true,'Restored legacy backup preferences cannot disable pitch preservation');await page.locator('#boost').click();assert.equal(await page.evaluate(()=>testEngine.preservePitch),true);
  await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});await settings();assert.equal(await pitch.count(),0);
  if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,kind+'-pitch-settings.png')});
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS: mandatory pitch preservation, no settings/pre-play/playing toggle, ignored legacy common/game/backup false values across reload and speed changes, all adapter defaults and shared/local-link audio paths.');
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
