// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored canvas pixels and oscillator tones, isolated profile, no mic or ROM.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';await context.route('**/*',route=>{assert.equal(new URL(route.request().url()).origin,new URL(base).origin);return route.continue();});
  await page.goto(base);await page.locator('#add-first').waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
  const result=await page.evaluate(async()=>{
   const {createGameRecorder,recordingSupported}=await import('./src/capture/game-recorder.js'),check=(value,label)=>{if(!value)throw Error(label);},sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
   const reports=[],native=recordingSupported();
   const {recordingName}=await import('./src/capture/recording-file.js'),date=new Date(2026,9,14,0,12,34),firstName=recordingName('A/B',date),secondName=recordingName('A/B',date);
   check(firstName==='A_B_2026-10-14_00-12-34'&&secondName===firstName+'-2','Local timestamp includes seconds; same-second recordings do not collide');
   const canvas=(w=240,h=160,color='#ff0000')=>{const value=document.createElement('canvas');value.width=w;value.height=h;value.getContext('2d').fillStyle=color;value.getContext('2d').fillRect(0,0,w,h);return value;};
   const captureCanvas=()=>document.querySelector('[data-recording-canvas]');
   if(!native){let failure;const recorder=createGameRecorder({onError:error=>failure=error});check(await recorder.start({canvas:canvas()})===false,'Unsupported browser does not start');check(recorder.state==='idle'&&failure&&!captureCanvas(),'Unsupported recorder leaves no resources');reports.push('Native recording unavailable: UI capability and failure cleanup verified');}
   else{
    const makeCore=async(w=240,h=160,color='#ff0000',frequency=440)=>{
     const ac=new AudioContext(),gain=ac.createGain(),osc=ac.createOscillator(),branches=new Set();gain.gain.value=.2;gain.connect(ac.destination);osc.frequency.value=frequency;osc.connect(gain);osc.start();
     const connect=gain.connect.bind(gain),disconnect=gain.disconnect.bind(gain);let speakerDisconnections=0;
     gain.connect=node=>{branches.add(node);return connect(node);};gain.disconnect=node=>{if(!node||node===ac.destination)speakerDisconnections++;branches.delete(node);return disconnect(node);};
     return {canvas:canvas(w,h,color),ac,gain,branches,unlockAudio:()=>ac.resume(),get speakerDisconnections(){return speakerDisconnections;},async close(){osc.stop();await ac.close();}};
    };
    const decode=async(file,{sound=false,position=.3}={})=>{
     const video=document.createElement('video'),url=URL.createObjectURL(file);video.src=url;video.playsInline=true;video.muted=!sound;document.body.append(video);
     let ac,source,analyser,quiet;try{
      await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=()=>reject(Error('Recorded video cannot decode'));});
      check(video.videoWidth>0&&video.videoHeight>0,'Decoded video dimensions exist');
      if(Number.isFinite(video.duration)&&video.duration>position){video.currentTime=position;await new Promise(resolve=>video.onseeked=resolve);}
      const frame=canvas(video.videoWidth,video.videoHeight),ctx=frame.getContext('2d');ctx.drawImage(video,0,0);
      const pixels=[[.5,.1],[.5,.9],[.01,.9]].map(([x,y])=>[...ctx.getImageData(Math.floor(x*frame.width),Math.floor(y*frame.height),1,1).data]);
      let amplitude=0;if(sound){ac=new AudioContext();source=ac.createMediaElementSource(video);analyser=ac.createAnalyser();quiet=ac.createGain();quiet.gain.value=0;source.connect(analyser);analyser.connect(quiet);quiet.connect(ac.destination);await ac.resume();video.currentTime=position;await video.play();const samples=new Float32Array(analyser.fftSize);for(let i=0;i<12;i++){await sleep(40);analyser.getFloatTimeDomainData(samples);amplitude=Math.max(amplitude,...samples.map(Math.abs));}}
      return {width:video.videoWidth,height:video.videoHeight,pixels,amplitude};
     }finally{video.pause();video.removeAttribute('src');video.load();video.remove();URL.revokeObjectURL(url);source?.disconnect();await ac?.close();}
    };
    const core=await makeCore(960,640),states=[],complete=[],failures=[];
    const recorder=createGameRecorder({onState:value=>states.push(value),onComplete:value=>complete.push(value),onError:value=>failures.push(value)});
    check(await recorder.start(core,{name:'Original recording'})===true,'Native recorder starts');check(captureCanvas()?.isConnected&&getComputedStyle(captureCanvas()).display!=='none','Capture canvas stays painted in DOM');
    check(states.at(-1).mimeType.startsWith('video/mp4'),'MP4 is preferred when supported');check(states.at(-1).width===720&&states.at(-1).height===480,'Longest side capped at 720');
    await sleep(650);core.canvas.width=320;core.canvas.height=240;core.canvas.getContext('2d').fillStyle='#0000ff';core.canvas.getContext('2d').fillRect(0,0,320,240);await sleep(900);
    const stopping=recorder.stop(),again=recorder.stop('exit');check(stopping===again,'Repeated stop shares completion');const file=await stopping;
    check(file?.type==='video/mp4'&&/^Original recording_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:-\d+)?\.mp4$/.test(file.name)&&file.size>0,'Native MP4 file generated with timestamp to seconds');check(complete.length===1&&complete[0].reason==='user'&&complete[0].duration>=1400,'One completion and duration');check(!failures.length,'No native record error');
    const first=await decode(file,{sound:true}),last=await decode(file,{position:1});check(first.width===720&&first.height===480,'Fixed output size survives filter/resolution change');check(first.pixels[0][0]>200&&first.pixels[0][2]<30,'Early recorded pixel is red');check(last.pixels[0][2]>200&&last.pixels[0][0]<30,'Later recorded pixel is blue');check(first.amplitude>.02,'Recording has non-silent game audio');
    check(recorder.state==='idle'&&!captureCanvas()&&core.branches.size===0&&core.speakerDisconnections===0&&core.ac.state==='running','Recording cleanup preserves speakers/audio context');
    check(await recorder.start(core)===true,'Recording can restart');await sleep(180);check((await recorder.stop())?.size>0,'Second recording completes');await core.close();reports.push('Native MP4 decode, changing pixels, non-silent audio, 720px fixed size, repeat stop/restart and cleanup');
    for(const type of ['nds','3ds']){
     const core=await makeCore();if(type==='nds')core.screens=[canvas(256,192,'#ff0000'),canvas(256,192,'#0000ff')];else core.rawScreens=[canvas(400,240,'#ff0000'),canvas(320,240,'#0000ff')];
     const recorder=createGameRecorder();check(await recorder.start(core),'Dual screen starts');await sleep(700);const file=await recorder.stop(),decoded=await decode(file);check(decoded.height===(type==='nds'?384:480),'Dual screen combined dimensions');check(decoded.pixels[0][0]>200&&decoded.pixels[1][2]>200,'Both screens appear in video');if(type==='3ds')check(decoded.pixels[2].slice(0,3).every(v=>v<25),'3DS lower screen is centered');await core.close();
    }reports.push('NDS two-screen and centered 3DS composition decode');
    const primary=await makeCore(),secondary=await makeCore(240,160,'#0000ff',660);secondary.gain.gain.value=0;const pair={canvas:primary.canvas,cores:[primary,secondary]},pairRecorder=createGameRecorder();check(await pairRecorder.start(pair),'Local two-core recording starts');await sleep(400);primary.gain.gain.value=0;secondary.gain.gain.value=.2;pair.canvas.getContext('2d').drawImage(secondary.canvas,0,0);await sleep(500);const pairedFile=await pairRecorder.stop(),paired=await decode(pairedFile,{sound:true,position:.55});check(paired.amplitude>.02&&paired.pixels[0][2]>200&&primary.branches.size===0&&secondary.branches.size===0,'Two contexts mix audio and detach both branches');await primary.close();await secondary.close();reports.push('Local two-core audio mixing and branch cleanup');
   }
   // Deterministic codec, lifecycle, resource and race tests also run in Windows WebKit.
   const originals={MediaRecorder:window.MediaRecorder,MediaStream:window.MediaStream,AudioContext:window.AudioContext,capture:HTMLCanvasElement.prototype.captureStream};
   const tracks=[],nodes=[],contexts=[],recorders=[];let support='all',mode='normal';
   class Track extends EventTarget{constructor(kind){super();this.kind=kind;this.readyState='live';tracks.push(this);}stop(){this.readyState='ended';}}
   class Stream{constructor(values=[]){this.values=values;}getTracks(){return this.values;}getAudioTracks(){return this.values.filter(t=>t.kind==='audio');}getVideoTracks(){return this.values.filter(t=>t.kind==='video');}}
   class AC{constructor(){this.state='running';contexts.push(this);}createMediaStreamDestination(){return {stream:new Stream([new Track('audio')])};}createMediaStreamSource(){const value={disconnect(){this.disconnected=true;},connect(){}};nodes.push(value);return value;}resume(){return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}}
   class Recorder{static isTypeSupported(type){return support==='all'||support==='webm'&&type.startsWith('video/webm');}constructor(stream,options){this.stream=stream;this.mimeType=options.mimeType;this.state='inactive';recorders.push(this);if(mode==='constructor')throw Error('Synthetic constructor failure');}start(slice){check(slice===1000,'Chunks requested every second');if(mode==='start'||mode==='first-start'&&this.mimeType.includes('avc1'))throw Error('Synthetic start failure');this.state='recording';}stop(){this.state='inactive';if(mode==='stalled')return;queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['synthetic recording'],{type:this.mimeType})});this.onstop?.();});}}
   window.MediaRecorder=Recorder;window.MediaStream=Stream;window.AudioContext=AC;HTMLCanvasElement.prototype.captureStream=function(){return new Stream([new Track('video')]);};
   try{
    const core=()=>{const ac=new AC(),connections=new Set(),gain={connect:node=>connections.add(node),disconnect:node=>{check(node!==undefined,'Only recording branch may disconnect');connections.delete(node);}};return {canvas:canvas(),ac,gain,connections,unlockAudio:async()=>{}};};
    const clean=()=>check(tracks.every(t=>t.readyState==='ended')&&!captureCanvas(),'All recording tracks and canvases cleaned');
    check(recordingSupported(),'Mock supported capability');let complete=[],failures=[];const value=core(),recorder=createGameRecorder({onComplete:r=>complete.push(r),onError:e=>failures.push(e)});
    check(await recorder.start(value),'Mock starts');check(captureCanvas().width===480&&captureCanvas().height===320&&!captureCanvas().getContext('2d').imageSmoothingEnabled,'Small screens use integer 2x without smoothing');check(recorders.at(-1).mimeType.startsWith('video/mp4'),'MP4 priority');recorders.at(-1).stream.getVideoTracks()[0].dispatchEvent(new Event('ended'));await recorder.stop();check(complete[0].reason==='ended','Track end finalizes');clean();check(value.connections.size===0,'Mock branch detached');
    support='webm';await recorder.start(value);check(recorders.at(-1).mimeType.startsWith('video/webm'),'WebM fallback');check((await recorder.stop()).type==='video/webm','Fallback extension/type');support='all';clean();
    mode='first-start';check(await recorder.start(value),'Failed MP4 codec start tries next supported format');check(recorders.at(-1).mimeType==='video/mp4','Fallback starts the next format');await recorder.stop();mode='normal';clean();
    const fullscreenDescriptor=Object.getOwnPropertyDescriptor(document,'fullscreenElement'),fullscreenHost=document.createElement('div');document.body.append(fullscreenHost);Object.defineProperty(document,'fullscreenElement',{configurable:true,writable:true,value:fullscreenHost});
    try{await recorder.start(value);check(captureCanvas().parentElement===fullscreenHost,'Recording canvas belongs to fullscreen tree');document.fullscreenElement=null;document.dispatchEvent(new Event('fullscreenchange'));check(captureCanvas().parentElement===document.body,'Canvas follows fullscreen exit');await recorder.stop();document.dispatchEvent(new Event('fullscreenchange'));clean();}finally{if(fullscreenDescriptor)Object.defineProperty(document,'fullscreenElement',fullscreenDescriptor);else delete document.fullscreenElement;fullscreenHost.remove();}
    let release;const delayed=core();delayed.unlockAudio=()=>new Promise(r=>release=r);const opening=recorder.start(delayed);check(recorder.state==='starting','Start waits for audio');check(await recorder.stop('exit')===null,'Stop during starting resolves');release();check(await opening===false&&recorder.state==='idle'&&delayed.connections.size===0,'Delayed start cannot revive cancelled session');clean();
    for(const failure of ['constructor','start']){mode=failure;check(await recorder.start(core())===false,'Recorder '+failure+' failure reported');check(recorder.state==='idle','Recorder '+failure+' returns idle');clean();}mode='normal';
    await recorder.start(value);recorders.at(-1).onerror({error:Error('Synthetic encoder error')});await recorder.stop();check(failures.length===3&&recorder.state==='idle','Runtime encoder error clears resources');clean();
    const limited=createGameRecorder({maxDurationMs:100,onComplete:r=>complete.push(r)});await limited.start(core());await sleep(160);check(limited.state==='idle'&&complete.at(-1).reason==='duration','Duration cap automatically finalizes');clean();
    const size=createGameRecorder({maxBytes:1024,onComplete:r=>complete.push(r),onError:e=>failures.push(e)});await size.start(core());recorders.at(-1).ondataavailable({data:new Blob([new Uint8Array(800)])});await size.stop();check(complete.at(-1).reason==='size'&&complete.at(-1).file.size<=1024,'Size cap leaves finalization headroom');clean();
    await size.start(core());recorders.at(-1).ondataavailable({data:new Blob([new Uint8Array(2048)])});check(await size.stop()===null&&size.state==='idle','Oversized chunk is not retained/exported');clean();
    // Advance only the backend's bounded finalization timer; do not wait 8s.
    const timeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>timeout(fn,ms===8000?20:ms,...args);mode='stalled';try{await recorder.start(core());check(await recorder.stop()===null,'Stalled finalization ends without exporting corrupt data');check(recorder.state==='idle','Stalled recorder returns idle');clean();}finally{window.setTimeout=timeout;mode='normal';}
    const FileClass=window.File;window.File=class{constructor(){throw new DOMException('Synthetic memory limit','QuotaExceededError');}};try{await recorder.start(value);check(await recorder.stop()===null&&recorder.state==='idle','File allocation failure settles stop');clean();}finally{window.File=FileClass;}
    const audioFailure=core();audioFailure.unlockAudio=async()=>{throw new DOMException('Synthetic denied resume','NotAllowedError');};check(await recorder.start(audioFailure)===false&&recorder.state==='idle'&&audioFailure.connections.size===0,'Audio resume failure does not leave a recording');clean();
    check(await recorder.start(value),'Failure permits retry');await recorder.stop();clean();reports.push('Codec fallback, track end, start-stop race, encoder failures, duration/size bounds, stalled finalization and retry');
   }finally{window.MediaRecorder=originals.MediaRecorder;window.MediaStream=originals.MediaStream;window.AudioContext=originals.AudioContext;if(originals.capture)HTMLCanvasElement.prototype.captureStream=originals.capture;else delete HTMLCanvasElement.prototype.captureStream;}
   return {native,reports};
  });
  assert.deepEqual(errors,[]);for(const report of result.reports)console.log('PASS '+kind+': '+report);await context.close();
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
