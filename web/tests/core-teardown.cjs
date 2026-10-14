// SPDX-License-Identifier: AGPL-3.0-or-later
// Fault injection against isolated adapters; no user ROM/save/profile is read.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');
  for(const failing of ['sensors','rumble','pixels','video','listener','source-1','native','gain']){
   const result=await page.evaluate(async failing=>{
    const {MGBACore}=await import('./src/core/mgba.js'),core=new MGBACore(document.createElement('canvas'));
    const calls=[],failure=new WebAssembly.RuntimeError('Failed '+failing),run=name=>{calls.push(name);if(name===failing)throw failure;};
    core.sensors={close:()=>run('sensors')};core.rumble={close:()=>run('rumble')};core.pixelTransfer={dispose:()=>run('pixels')};core.video={dispose:()=>run('video')};
    core.observedAudio={removeEventListener:()=>run('listener')};
    core.ac={state:'running',close(){run('audio');this.state='closed';return Promise.resolve();}};
    core.sources=new Set([1,2].map(index=>({onended:()=>{},stop:()=>run('stop-'+index),disconnect:()=>run('source-'+index)})));
    core.stretch={reset:()=>run('stretch')};core.gain={disconnect:()=>run('gain')};
    core.nativeModule={HEAPU8:new Uint8Array(1024)};core.m={_web_close:()=>run('native')};
    core.tick=()=>{};core.image=new ImageData(1,1);core.raf=requestAnimationFrame(()=>calls.push('frame-after-close'));
    let caught;try{core.close();}catch(error){caught=error;}
    const afterFirst=calls.length;core.close();await new Promise(resolve=>requestAnimationFrame(resolve));
    return {sameError:caught===failure,calls,secondCloseDidNothing:afterFirst===calls.length,closed:core.closed,
     released:core.m===null&&core.nativeModule===null&&core.tick===null&&core.image===null&&core.pixelTransfer===null&&core.gain===null,
     sources:core.sources.size,audioClosed:core.ac.state==='closed',listenerReleased:core.observedAudio===null};
   },failing);
   assert.equal(result.sameError,true,'The first '+failing+' failure is reported');
   assert.deepEqual([...result.calls].sort(),['sensors','rumble','pixels','video','listener','stop-1','source-1','stop-2','source-2','stretch','audio','native','gain'].sort(),'All resources are torn down after '+failing+' fails');
   assert.deepEqual({second:result.secondCloseDidNothing,closed:result.closed,released:result.released,sources:result.sources,audio:result.audioClosed,listener:result.listenerReleased},{second:true,closed:true,released:true,sources:0,audio:true,listener:true},'A failed close releases the adapter and remains idempotent');
  }
  for(const adapter of ['nds','jgenesis'])for(const failing of adapter==='nds'?['microphone','video-0','touch']:['video','native','game']){
   const result=await page.evaluate(async({adapter,failing})=>{
    const module=await import('./src/core/'+adapter+'.js'),Core=module[adapter==='nds'?'NDSCore':'JgenesisCore'];
    const container=document.createElement('div'),core=new Core(container),calls=[],failure=new Error(failing),run=name=>{calls.push(name);if(name===failing)throw failure;};
    core.m={_web_close:()=>run('native'),_web_blow:()=>run('microphone'),_web_touch:()=>run('touch')};core.nativeModule={HEAPU8:new Uint8Array(1024)};
    core.ac={state:'running',close(){run('audio');this.state='closed';return Promise.resolve();}};
    if(adapter==='nds')core.videos.forEach((video,index)=>{video.dispose=()=>run('video-'+index);});
    else {core.video={dispose:()=>run('video')};core.game={free:()=>run('game')};core.rom=new Uint8Array(1024);core.wasm={memory:{buffer:new ArrayBuffer(1024)}};}
    let caught;try{core.close();}catch(error){caught=error;}
    const afterFirst=calls.length;core.close();
    return {sameError:caught===failure,calls,second:afterFirst===calls.length,released:!core.m&&!core.nativeModule&&!core.game&&!core.rom&&!core.wasm,closed:core.closed,displayRemoved:adapter!=='nds'||!container.contains(core.display)};
   },{adapter,failing});
   assert.deepEqual([...result.calls].sort(),(adapter==='nds'?['microphone','video-0','video-1','touch','native','audio']:['video','native','game','audio']).sort(),adapter+' cleanup continues after '+failing+' fails');
   assert.deepEqual({sameError:result.sameError,second:result.second,released:result.released,closed:result.closed,displayRemoved:result.displayRemoved},{sameError:true,second:true,released:true,closed:true,displayRemoved:true});
  }
  await context.close();
  for(const adapter of ['nds','retro','jgenesis']){
   const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
   const directory={nds:'nds',retro:'nes',jgenesis:'jgenesis'}[adapter];
   const body=adapter==='jgenesis'?'export class Game{constructor(){window.lateGameCreated=true;throw Error("Cancelled game created");}};export default ()=>new Promise(resolve=>window.resolveFactory=resolve);':`window.${adapter==='nds'?'createNDS':'createCore'}=()=>new Promise(resolve=>window.resolveFactory=resolve);`;
   await page.route('**/cores/'+directory+'/core.js',route=>route.fulfill({contentType:'text/javascript',body}));
   await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');
   await page.evaluate(async adapter=>{
    const module=await import('./src/core/'+adapter+'.js'),Core=module[{nds:'NDSCore',retro:'RetroCore',jgenesis:'JgenesisCore'}[adapter]];
    window.cancelledCore=new Core(document.createElement('div'));
    window.cancelledLoad=cancelledCore.load(new Uint8Array(8192),{system:adapter==='nds'?'nds':'nes'}).then(()=>null,error=>error.name);
   },adapter);
   await page.waitForFunction(()=>typeof window.resolveFactory==='function');
   const result=await page.evaluate(async()=>{
    const core=cancelledCore;core.close();
    let nativeLoads=0;resolveFactory({HEAPU8:new Uint8Array(1024*1024),_malloc:()=>1024,_free(){},_web_load(){nativeLoads++;return 1;},_web_touch(){},_web_close(){},_web_width:()=>240,_web_height:()=>160,_web_fps:()=>60});
    const error=await cancelledLoad;core.close();
    return {error,nativeLoads,lateGameCreated:!!window.lateGameCreated,released:!core.m&&!core.nativeModule&&!core.game&&!core.wasm&&!core.rom&&!core.tick,closed:core.closed};
   });
   assert.deepEqual(result,{error:'AbortError',nativeLoads:0,lateGameCreated:false,released:true,closed:true},adapter+' must not attach a late module or cartridge after cancellation');
   await context.close();
  }
  console.log('PASS '+kind+': teardown faults release all resources once; cancelled NDS, Retro and jgenesis loads cannot retain a late module or cartridge.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
