// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic cartridge, deterministic display timestamps and rendered PCM only.
const assert=require('node:assert/strict');
const browserName=process.env.BROWSER_ENGINE||'chromium',browserType=require('./browser-runtime.cjs')[browserName];
(async()=>{
 const browser=await browserType.launch({headless:true,...(browserName==='chromium'&&process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');
  const result=await page.evaluate(async rom=>{
   const {MGBACore}=await import('./src/core/mgba.js'),{VideoOutput}=await import('./src/rendering/video.js');
   const check=(value,label)=>{if(!value)throw new Error(label);};
   const canvas=document.createElement('canvas'),core=new MGBACore(canvas);
   await core.load(new Uint8Array(rom));core.pause(true);
   const queue=new Map();let id=0,polls=0;
   window.requestAnimationFrame=fn=>{queue.set(++id,fn);return id;};
   window.cancelAnimationFrame=id=>queue.delete(id);
   const step=t=>{const due=[...queue.values()];queue.clear();check(due.length===1,'One active frame callback');due[0](t);};
   core.beforeFrame=()=>{polls++;core.setKeys(64);};
   const cases=[];
   for(const hz of [30,60,120,144])for(const speed of [1,2,5]){
    core.pause(true);core.setSpeed(speed);core.frames=0;core.presented=0;polls=0;core.pause(false);core.pause(false);
    const count=hz*2;
    for(let i=0;i<count;i++)step(1000+i*1000/hz);
    const expected=Math.floor((count-1)/hz*core.fps*speed)+1;
    check(core.frames===expected,`${hz} Hz / ${speed}x emulation timing: ${core.frames} vs ${expected}`);
    check(core.presented===Math.min(count,expected),'Only new images are presented');
    check(polls===core.presented&&core.keys===64,'Input is sampled before active frames');
    cases.push({hz,speed,frames:core.frames,draws:core.presented});
   }
   core.pause(true);check(queue.size===0&&core.keys===0,'Pause stops callbacks and releases input');
   const savedFrames=core.frames;core.pause(false);core.pause(false);step(100000);
   check(core.frames===savedFrames+1,'Resume does not replay the time spent paused');
   let failed=0;core.onError=()=>failed++;core.beforeFrame=()=>{throw Error('Synthetic failure');};step(100100);
   check(core.paused&&queue.size===0&&failed===1,'An error stops the loop');
   core.close();core.pause(false);check(queue.size===0,'Closed engines cannot restart');

   // GBA and GB have different widths but share the bridge's 256-pixel stride.
   for(const width of [160,240]){
    const c=new MGBACore(document.createElement('canvas')),height=144;c.width=width;c.height=height;
    c.image=new ImageData(width,height);c.video=new VideoOutput(c.canvas,width,height);
    let bytes=new Uint8Array(256*height*4+16),ptr=0;
    const fill=seed=>{for(let y=0;y<height;y++)for(let x=0;x<256;x++){const i=ptr+(y*256+x)*4;bytes[i]=(x+seed)%256;bytes[i+1]=(y+seed)%256;bytes[i+2]=(x+y+seed)%256;bytes[i+3]=0;}};
    c.m={get HEAPU8(){return bytes;},_web_pixels:()=>ptr};
    const verify=seed=>{c.draw();const data=c.canvas.getContext('2d').getImageData(0,0,width,height).data;for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;check(data[i]===(x+seed)%256&&data[i+1]===(y+seed)%256&&data[i+2]===(x+y+seed)%256&&data[i+3]===255,'Opaque pixels with correct stride');}};
    fill(7);verify(7);fill(19);verify(19);
    // A WASM memory growth detaches its old buffer, invalidating cached views.
    structuredClone(bytes.buffer,{transfer:[bytes.buffer]});bytes=new Uint8Array(256*height*4+16);ptr=16;fill(31);verify(31);
   }
   // Known corner pattern: the center's upper-left quadrant takes the neighbour.
   const image=new ImageData(3,3),words=new Uint32Array(image.data.buffer);words.fill(0xff000000);words[1]=words[3]=0xffffffff;words[5]=0xff0000ff;words[7]=0xff00ff00;
   const video=new VideoOutput(document.createElement('canvas'),3,3);video.setMode('edge2x');video.draw(image);
   let pixels=new Uint32Array(video.ctx.getImageData(0,0,6,6).data.buffer);
   check(pixels[2*6+2]===0xffffffff&&pixels[2*6+3]===0xff000000&&pixels[3*6+2]===0xff000000,'Edge interpolation preserves the corner');
   words.fill(0xff112233);video.draw(image);pixels=new Uint32Array(video.ctx.getImageData(0,0,6,6).data.buffer);check(pixels.every(v=>v===0xff112233),'Cached filter views see new frame contents');

   if(typeof OfflineAudioContext==='undefined')return{cases,audioCases:[],audioUnavailable:true};
   const audioCases=[];
   for(const rate of [32768,44100,48000])for(const speed of [1,2,5]){
    const n=Math.floor(rate*.1),pcm=new Int16Array(n*2);for(let i=0;i<n;i++){pcm[i*2]=Math.sin(2*Math.PI*400*i/rate)*16384;pcm[i*2+1]=Math.sin(2*Math.PI*800*i/rate)*8192;}
    const ac=new OfflineAudioContext(2,24000,48000),c=new MGBACore(document.createElement('canvas'));let reads=0;
    // Compare the raw resampling path explicitly; app playback always preserves pitch.
    c.setPreservePitch(false);c.speed=speed;c.m={HEAP16:pcm,_web_audio_read:()=>{reads++;return n;},_web_audio_rate:()=>rate,_web_audio:()=>0};
    c.ac={state:'running',get currentTime(){return ac.currentTime;},createBuffer:ac.createBuffer.bind(ac),createBufferSource:ac.createBufferSource.bind(ac)};
    c.gain=ac.createGain();c.gain.connect(ac.destination);
    c.audio();c.audio();const scheduled=c.nextAudio;
    check(Math.abs(scheduled-(.025+2*n/rate/speed))<1e-10,'Native-rate chunks schedule contiguously');
    const pending=c.sources.size;c.setSpeed(speed);check(c.sources.size===pending&&c.nextAudio===scheduled,'Unchanged speed does not interrupt audio');
    const rendered=await ac.startRendering();
    for(const [channel,frequency,amplitude]of [[0,400,.5],[1,800,.25]]){
     const data=rendered.getChannelData(channel),start=Math.ceil(.028*48000),end=Math.floor((scheduled-.003)*48000);let sum=0,square=0,reference=0;
     for(let i=start;i<end;i++){const ideal=amplitude*Math.sin(2*Math.PI*frequency*(i/48000-.025)*speed);sum+=data[i]*ideal;square+=data[i]**2;reference+=ideal**2;}
     check(sum/Math.sqrt(square*reference)>.995,`Stereo pitch and phase at ${rate} Hz / ${speed}x / channel ${channel}`);
     check(Math.abs(Math.sqrt(square/(end-start))*Math.SQRT2-amplitude)<.02,'PCM amplitude is preserved');
     check(data.slice(0,1100).every(v=>v===0)&&data.slice(Math.ceil((scheduled+.003)*48000)).every(v=>Math.abs(v)<.0001),'Start/end timing and silence');
    }
    audioCases.push({rate,speed});
   }
   // Muted audio still drains the bridge; pause and speed changes discard backlog.
   const ac=new OfflineAudioContext(2,48000,48000),c=new MGBACore(document.createElement('canvas'));let reads=0;
   c.m={HEAP16:new Int16Array(960),_web_audio_read:()=>{reads++;return 480;},_web_audio_rate:()=>48000,_web_audio:()=>0};
   c.ac={state:'running',currentTime:0,createBuffer:ac.createBuffer.bind(ac),createBufferSource:ac.createBufferSource.bind(ac)};c.gain=ac.createGain();c.gain.connect(ac.destination);
   c.volume=0;c.audio();check(reads===1&&c.sources.size===0,'Mute drains but does not schedule PCM');c.volume=.7;
   for(let i=0;i<100;i++)c.audio();check(c.sources.size<=17&&c.nextAudio<.2,'Audio queue remains bounded');
   c.setSpeed(2);check(c.sources.size===0&&c.nextAudio===0,'Speed change clears old audio');c.audio();c.pause(true);check(c.sources.size===0,'Pause clears old audio');
   const silent=await ac.startRendering();check(silent.getChannelData(0).every(v=>v===0),'Cancelled sources remain silent');
   return{cases,audioCases};
  },[...require('./link.cjs').cartridge(31,992)]);
  assert.equal(result.cases.length,12);assert.deepEqual(errors,[]);
  console.log('PASS: 30/60/120/144 Hz at 1/2/5x, pause/resume/error/close, input timing, GB/GBA pixels and memory growth, filtered pixels.');
  if(result.audioUnavailable)console.log('SKIP: this browser build has no OfflineAudioContext; audio is not verified in this run.');
  else{assert.equal(result.audioCases.length,9);console.log('PASS: native-rate stereo/pitch/amplitude/timing, bounded audio and cancellation.');}
  await context.close();
 }finally{await Promise.race([browser.close(),new Promise(r=>setTimeout(r,2500))]);}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
