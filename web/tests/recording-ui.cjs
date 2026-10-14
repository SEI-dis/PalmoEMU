// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated authored cartridge. Native recording on Edge; explicit unsupported
// WebKit UI plus a deterministic recorder double for otherwise unreachable UI.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
function cartridge(){
 const words=[],pool=[],emit=word=>words.push(word>>>0),load=(reg,value)=>{pool.push({at:words.length,reg,value});emit(0);};
 load(9,0x04000000);load(10,0x404);emit(0xe1c9a0b0);load(1,0x05000000);load(4,0x001f);emit(0xe1c140b0);emit(0xeafffffe);
 for(const {at,reg,value}of pool){words[at]=(0xe59f0000|(reg<<12)|((words.length-at-2)*4))>>>0;emit(value);}
 const rom=Buffer.alloc(1024);rom[0xb2]=0x96;rom.writeUInt32LE(0xea00003e,0);words.forEach((word,i)=>rom.writeUInt32LE(word,0x100+i*4));return rom;
}
(async()=>{const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});try{
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'ja-JP',isMobile:true,hasTouch:true,acceptDownloads:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];
 page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
 await context.addInitScript(()=>localStorage.setItem('palmo-language','ja'));
 // Observe the application's actual update predicate without replacing it or
 // installing a worker. Pending clips must block it after leaving gameplay.
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());requests.push({origin:url.origin,method:request.method()});assert.equal(url.origin,new URL(base).origin);assert.equal(request.method(),'GET');
  if(url.pathname.endsWith('/src/updates/auto-update.js')){const response=await route.fetch(),source=await response.text(),marker=' if(!navigator.serviceWorker||!navigator.locks||!isSecureContext)return;';assert.ok(source.includes(marker));return route.fulfill({response,body:source.replace(marker,' window.recordingCanUpdate=canUpdate;\n'+marker)});}
  return route.continue();
 });
 await page.goto(base);await page.locator('#add-first').waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy')&&window.recordingCanUpdate?.());
 await page.evaluate(async()=>{
  Object.defineProperty(window,'showSaveFilePicker',{configurable:true,writable:true,value:undefined});
  const {MGBACore}=await import('./src/core/mgba.js'),load=MGBACore.prototype.load;MGBACore.prototype.load=function(...args){window.recordingCore=this;return load.apply(this,args);};
  Object.defineProperty(navigator,'canShare',{configurable:true,value:({files})=>files?.length===1&&files[0].type.startsWith('video/')});
  Object.defineProperty(navigator,'share',{configurable:true,value:async({files})=>{window.recordingShared={name:files[0].name,type:files[0].type,size:files[0].size};if(window.cancelRecordingShare)throw new DOMException('Synthetic share cancellation','AbortError');}});
 });
 await page.locator('#rom-input').setInputFiles({name:'Recording fixture.gba',mimeType:'application/octet-stream',buffer:cartridge()});
 const launch=async()=>{await page.getByRole('button',{name:'Recording fixtureの設定を開く',exact:true}).click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});};await launch();
 await page.waitForFunction(()=>document.querySelector('#screen canvas')?.getContext('2d').getImageData(0,0,1,1).data[0]>=248);
 const camera=page.locator('#player-camera'),menu=page.locator('#capture-menu'),preview=page.locator('#recording-preview');assert.equal(await camera.count(),1);
 const out=process.env.SCREENSHOT_DIR||path.join(__dirname,'../../work/recording-ui');fs.mkdirSync(out,{recursive:true});
 const shot=(locator,name)=>locator.screenshot({path:path.join(out,`${kind}-${name}.png`)});
 await camera.tap();await menu.waitFor();assert.equal(await page.evaluate(()=>recordingCore.paused),false);assert.equal(await menu.getAttribute('aria-modal'),'false');
 const native=await page.evaluate(async()=>(await import('./src/capture/game-recorder.js')).recordingSupported());
 if(kind==='chromium')assert.equal(native,true,'Edge fixture must exercise a real MediaRecorder');
 if(!native){
  assert.equal(await page.locator('[data-capture-record]').isDisabled(),true);assert.match(await page.locator('[data-capture-note]').textContent(),/対応していません/);await shot(menu,'unsupported');
  await page.locator('[data-capture-photo]').click();await page.locator('#screenshot-preview').waitFor();assert.match(await page.locator('#screenshot-preview img').getAttribute('src'),/^data:image\/png;base64,/);await page.locator('[data-photo-close]').click();
  // This double verifies UI state only, not WebKit encoding/playback support.
  await page.evaluate(async()=>{
   class Track extends EventTarget{constructor(kind='video'){super();this.kind=kind;}stop(){}}
   class Stream{constructor(tracks=[]){this.tracks=tracks;}getTracks(){return this.tracks;}getVideoTracks(){return this.tracks.filter(t=>t.kind==='video');}getAudioTracks(){return this.tracks.filter(t=>t.kind==='audio');}}
   window.MediaStream=Stream;HTMLCanvasElement.prototype.captureStream=function(){return new Stream([new Track()]);};
   // This Windows WebKit runtime has no Web Audio. Substitute the detached
   // audio branch and drain emulated samples without claiming sound coverage.
   window.AudioContext=class{constructor(){this.state='running';this.destination={};}createMediaStreamDestination(){return {stream:new Stream([new Track('audio')])};}createGain(){return {gain:{value:1},connect(){},disconnect(){}};}resume(){return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}};
   const {MGBACore}=await import('./src/core/mgba.js');MGBACore.prototype.audio=function(){this.m._web_audio_read();};
   window.MediaRecorder=class{static isTypeSupported(){return true;}constructor(stream,{mimeType}){this.mimeType=mimeType;this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['synthetic video UI fixture'],{type:this.mimeType})});this.onstop?.();});}};
  });await camera.tap();await menu.waitFor();
 }
 assert.match(await page.locator('[data-capture-note]').textContent(),/最大5分/);assert.equal(await page.locator('[data-capture-record]').isEnabled(),true);await shot(menu,'menu');
 // Opening/closing the capture chooser never pauses the running game.
 await page.locator('[data-capture-photo]').focus();await page.keyboard.press('Escape');assert.equal(await menu.isVisible(),false);assert.equal(await page.evaluate(()=>recordingCore.paused),false);
 const start=async()=>{
  await camera.tap();await menu.waitFor();await page.locator('[data-capture-record]').click();
  await page.waitForFunction(()=>{const b=document.querySelector('#player-camera'),parts=b.querySelector('.record-time')?.textContent.split(':');return b.dataset.recording==='true'&&b.getAttribute('aria-busy')==='false'&&parts?.length===2&&Number(parts[0])*60+Number(parts[1])>=1;});
  assert.equal(await page.evaluate(()=>recordingCore.paused),false);assert.equal(await camera.getAttribute('aria-label'),'録画を停止');assert.equal(await menu.isVisible(),false);assert.equal(await page.evaluate(()=>recordingCanUpdate()),false);
 };
 const discard=async()=>{await preview.locator('[data-video-close]').click();await preview.locator('[data-video-confirm]').waitFor();await preview.locator('[data-video-discard]').click();await preview.waitFor({state:'hidden'});assert.equal(await preview.locator('video').getAttribute('src'),null);};
 await start();await shot(camera,'recording-button');
 // Hold encoder completion, not the browser's UI thread. The game must stop
 // spending CPU before the encoder flush and show a visible preparation state.
 await page.evaluate(()=>{const stop=MediaRecorder.prototype.stop;window.stopHeartbeat=0;MediaRecorder.prototype.stop=function(){window.stopGamePaused=recordingCore.paused;window.releaseRecordingStop=()=>{MediaRecorder.prototype.stop=stop;stop.call(this);};};window.stopHeartbeatTimer=setInterval(()=>stopHeartbeat++,30);});
 await camera.tap();await preview.waitFor();await page.waitForFunction(()=>!!window.releaseRecordingStop);
 assert.equal(await preview.getAttribute('aria-busy'),'true');assert.equal(await page.evaluate(()=>stopGamePaused),true);assert.equal(await preview.locator('[data-video-save]').isVisible(),false);assert.match(await preview.locator('[data-video-status]').textContent(),/準備/);await page.waitForFunction(()=>stopHeartbeat>=4);await shot(preview,'preparing');
 await page.evaluate(()=>{clearInterval(stopHeartbeatTimer);releaseRecordingStop();});await page.waitForFunction(()=>recordingCore.paused&&document.querySelector('#player-camera').dataset.recording==='false');assert.equal(await preview.getAttribute('aria-busy'),'false');
 assert.equal(await camera.isDisabled(),false);assert.equal(await camera.count(),1);assert.equal(await page.locator('[data-recording-canvas]').count(),0);assert.equal(await preview.getAttribute('aria-modal'),'false');
 const clipURL=await preview.locator('video').getAttribute('src');assert.match(clipURL,/^blob:/);
 const timing=await preview.evaluate(el=>JSON.parse(el.dataset.recordingTiming));
 for(const field of ['inputDelayMs','pauseMs','finalizeMs','stopCallMs','containerMs','cleanupMs','preparationMs','urlMs','videoSourceMs','infoMs','shareSupportMs','mountMs','changeMs','previewMs'])assert.ok(Number.isFinite(timing[field])&&timing[field]>=0,field);
 if(native){await page.waitForFunction(()=>document.querySelector('#recording-preview video').readyState>=1);assert.deepEqual(await preview.locator('video').evaluate(v=>[v.videoWidth,v.videoHeight]),[480,320]);}
 await shot(preview,'preview');
 // Review fits narrow portrait and landscape without horizontal overflow.
 for(const [width,height]of [[320,568],[844,390]]){await page.setViewportSize({width,height});const box=await preview.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=height+1);assert.equal(await preview.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);}
 await page.setViewportSize({width:390,height:844});
 // A blocked download and cancelled share retain the only in-memory clip.
 await page.evaluate(()=>{const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download.endsWith('.mp4')||this.download.endsWith('.webm')){window.recordingExportConnected=this.isConnected;window.recordingExportTarget=this.target;window.recordingExportRel=this.rel;window.recordingExportCount=(window.recordingExportCount||0)+1;if(window.blockRecordingExport)throw new DOMException('Synthetic blocked download','NotAllowedError');}return click.call(this);};window.blockRecordingExport=true;});
 await preview.locator('[data-video-save]').click();assert.equal(await preview.locator('video').getAttribute('src'),clipURL);await page.evaluate(()=>window.blockRecordingExport=false);
 const downloadTask=page.waitForEvent('download');await preview.locator('[data-video-save]').click();const download=await downloadTask;assert.match(download.suggestedFilename(),/^Recording fixture_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:-\d+)?\.(mp4|webm)$/);const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const bytes=Buffer.concat(chunks);assert.ok(bytes.length>(native?100:0));assert.equal(await page.evaluate(()=>recordingExportConnected),true);assert.equal(await preview.isVisible(),true);assert.equal(await preview.locator('[data-video-status]').textContent(),'ダウンロード一覧を確認');
 // Native browser file writes (OPFS) behind a controlled picker. Never write
 // to the user's filesystem. Do not report success before close() completes.
 await page.evaluate(async()=>{
  if(navigator.storage?.getDirectory){const directory=await navigator.storage.getDirectory();window.videoExportHandle=await directory.getFileHandle('synthetic-video',{create:true});}
  else{let saved=new Blob();window.videoExportHandle={async getFile(){return saved;},async createWritable(){let pending;return {async write(file){pending=file;},async close(){saved=pending;},async abort(){pending=null;}};}};}
  window.videoExportMode='save';
  window.showSaveFilePicker=async options=>{window.videoExportOptions=options;if(videoExportMode==='cancel')throw new DOMException('Cancelled','AbortError');return {async createWritable(){const writer=await videoExportHandle.createWritable();return {write:file=>writer.write(file),async close(){await new Promise(resolve=>window.finishVideoWrite=resolve);if(videoExportMode==='fail')throw Error('Synthetic write failure');await writer.close();},abort:()=>writer.abort()};}};};
 });
 await preview.locator('[data-video-save]').click();await page.waitForFunction(()=>!!window.finishVideoWrite);
 assert.equal(await preview.locator('[data-video-save]').textContent(),'保存中…');assert.equal(await preview.locator('[data-video-close]').isDisabled(),true);assert.equal(await preview.locator('[data-video-status]').textContent(),'');
 await page.evaluate(()=>finishVideoWrite());await page.waitForFunction(()=>document.querySelector('[data-video-status]').textContent==='保存しました');
 assert.equal(await page.evaluate(()=>videoExportOptions.suggestedName),download.suggestedFilename());
 const stored=await page.evaluate(async()=>Array.from(new Uint8Array(await (await videoExportHandle.getFile()).arrayBuffer())));assert.deepEqual(Buffer.from(stored),bytes);assert.equal(await preview.locator('video').getAttribute('src'),clipURL);
 await page.evaluate(()=>window.videoExportMode='cancel');await preview.locator('[data-video-save]').click();await page.waitForFunction(()=>!document.querySelector('[data-video-save]').disabled);assert.equal(await preview.locator('[data-video-status]').textContent(),'');assert.equal(await preview.locator('video').getAttribute('src'),clipURL);
 await page.evaluate(()=>{window.videoExportMode='fail';window.finishVideoWrite=null;});await preview.locator('[data-video-save]').click();await page.waitForFunction(()=>!!window.finishVideoWrite);await page.evaluate(()=>finishVideoWrite());await page.waitForFunction(()=>!document.querySelector('[data-video-save]').disabled);assert.equal(await preview.locator('[data-video-status]').textContent(),'');assert.equal(await preview.locator('video').getAttribute('src'),clipURL);
 await page.evaluate(()=>window.showSaveFilePicker=undefined);
 assert.equal(await page.evaluate(()=>recordingExportTarget),'_blank');assert.equal(await page.evaluate(()=>recordingExportRel),'noopener');
 // iPhone and iPadOS desktop mode save through the native share sheet. Holding
 // that promise must preserve the game/clip and block duplicate saves/updates.
 // This simulates OS completion/cancellation, not an actual iPhone Photos save.
 await page.evaluate(()=>{
  const share=navigator.share;
  window.restoreVideoShareEnvironment=()=>{Object.defineProperty(navigator,'share',{configurable:true,value:share});delete navigator.userAgent;delete navigator.maxTouchPoints;};
  Object.defineProperty(navigator,'share',{configurable:true,value:({files})=>{window.iosSavedVideo=files[0];return new Promise((resolve,reject)=>{window.finishIOSVideoSave=resolve;window.cancelIOSVideoSave=()=>reject(new DOMException('Cancelled','AbortError'));window.failIOSVideoSave=()=>reject(new DOMException('Denied','NotAllowedError'));});}});
 });
 const downloadsBeforeIOS=await page.evaluate(()=>recordingExportCount);
 for(const [ua,touches,outcome]of [['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',1,'save'],['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',5,'cancel'],['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)',5,'fail']]){
  await page.evaluate(({ua,touches})=>{Object.defineProperty(navigator,'userAgent',{configurable:true,value:ua});Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,value:touches});window.finishIOSVideoSave=null;},{ua,touches});
  await preview.locator('[data-video-save]').click();await page.waitForFunction(()=>!!window.finishIOSVideoSave);
  assert.equal(await preview.locator('[data-video-save]').isDisabled(),true);assert.equal(await preview.locator('[data-video-close]').isDisabled(),true);assert.equal(await page.evaluate(()=>recordingCanUpdate()),false);
  assert.equal(await page.evaluate(()=>recordingCore.paused),true);assert.equal(await page.locator('#player').isVisible(),true);
  assert.equal(await page.evaluate(()=>iosSavedVideo.name),download.suggestedFilename());assert.equal(await page.evaluate(()=>iosSavedVideo.size),bytes.length);
  await page.evaluate(outcome=>{if(outcome==='save')finishIOSVideoSave();else if(outcome==='cancel')cancelIOSVideoSave();else failIOSVideoSave();},outcome);
  await page.waitForFunction(()=>!document.querySelector('[data-video-save]').disabled);
  assert.equal(await preview.locator('[data-video-status]').textContent(),'','Do not claim an OS destination was saved');
  assert.equal(await preview.locator('video').getAttribute('src'),clipURL);assert.equal(await page.locator('#player').isVisible(),true);assert.equal(await page.evaluate(()=>recordingExportCount),downloadsBeforeIOS,'No navigating download, including on cancellation/failure');
 }
 await page.evaluate(()=>restoreVideoShareEnvironment());
 assert.equal(await preview.locator('[data-video-share]').isVisible(),true);await preview.locator('[data-video-share]').click();await page.waitForFunction(()=>recordingShared&&!document.querySelector('[data-video-share]').disabled);const shared=await page.evaluate(()=>recordingShared);assert.equal(shared.size,bytes.length);assert.match(shared.type,/^video\/(mp4|webm)$/);
 await page.evaluate(()=>window.cancelRecordingShare=true);await preview.locator('[data-video-share]').click();await page.waitForFunction(()=>!document.querySelector('[data-video-share]').disabled);assert.equal(await preview.locator('video').getAttribute('src'),clipURL);
 await preview.locator('[data-video-close]').click();await preview.locator('[data-video-confirm]').waitFor();await preview.locator('[data-video-cancel]').click();assert.equal(await preview.locator('[data-video-confirm]').isVisible(),false);assert.equal(await preview.locator('video').getAttribute('src'),clipURL);
 // Leaving gameplay retains the review, and its unsaved clip blocks automatic
 // updates until an explicit discard. Saving alone does not drop the clip.
 await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});assert.equal(await preview.isVisible(),true);assert.equal(await page.evaluate(()=>recordingCanUpdate()),false);await discard();await page.waitForFunction(()=>recordingCanUpdate());
 await launch();await start();await page.locator('#player-menu').click();await preview.waitFor();assert.equal(await page.evaluate(()=>recordingCore.paused),true);assert.match(await preview.locator('[data-video-status]').textContent(),/中断/);await page.locator('#close-sheet').click();await discard();
 await start();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await preview.waitFor();assert.equal(await page.evaluate(()=>recordingCore.paused),true);assert.match(await preview.locator('[data-video-status]').textContent(),/中断/);await discard();
 // A failing encoder must also close the preparation panel and release its
 // update barrier, without offering a broken download or trapping the camera.
 await page.locator('#resume-game').click();await start();await page.evaluate(()=>{const stop=MediaRecorder.prototype.stop;MediaRecorder.prototype.stop=function(){MediaRecorder.prototype.stop=stop;const fail=this.onerror;stop.call(this);fail?.({error:Error('Synthetic finalization failure')});};});
 await camera.tap();await page.waitForFunction(()=>document.querySelector('#player-camera').dataset.recording==='false');
 assert.equal(await preview.isVisible(),false);assert.equal(await preview.locator('video').getAttribute('src'),null);assert.equal(await camera.isDisabled(),false);
 assert.equal(await page.locator('[data-recording-canvas]').count(),0);assert.deepEqual(errors,[]);assert.ok(requests.length>0);await context.close();
 console.log(`PASS ${kind}: ${native?'native recording':'unsupported UI + mock recording state'}, one-camera menu/start/stop, game pause, local download/share/retry, responsive preview, discard confirmation, background stop and pending-clip update barrier`);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
