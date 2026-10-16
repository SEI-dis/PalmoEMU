// SPDX-License-Identifier: AGPL-3.0-or-later
// Real app launch/IndexedDB/native GB core, with a controllable Web Audio policy.
// No device sound or physical iPhone permission claim is made by this test.
// The restart-blocked case models a session that needs another gesture after
// suspension; it is not a claim about Safari's general autoplay policy.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const cases=[{name:'restart-empty',mode:'restart-blocked',withSave:false},{name:'restart-save',mode:'restart-blocked',withSave:true},...['success','denied','pending'].map(mode=>({name:mode,mode,withSave:true})),{name:'muted',mode:'success',withSave:true,muted:true,volume:.7,checkStartupVolume:true},{name:'quiet',mode:'success',withSave:true,muted:false,volume:.1,checkStartupVolume:true}];
  const selected=cases.filter(test=>!process.env.AUDIO_STARTUP_CASE||test.name===process.env.AUDIO_STARTUP_CASE);assert.ok(selected.length,'Unknown AUDIO_STARTUP_CASE');
  for(const {name,mode,withSave,muted=false,volume=.7,checkStartupVolume=false} of selected){
   const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:mode==='pending',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(20000);
   await context.addInitScript(({muted,volume})=>localStorage.setItem('manic-settings',JSON.stringify({autosave:false,recovery:false,rewindEnabled:false,muted,volume})),{muted,volume});
   if(checkStartupVolume)await page.route('**/src/storage/storage.js',async route=>{
    const response=await route.fetch(),source=await response.text(),needle='async function setGameDetails(id,patch){';assert.ok(source.includes(needle));
    // A slow lastPlayed write must not let any frame use the default volume.
    const body=source.replace(needle,needle+'\n if(patch?.lastPlayed&&window.audioStartup?.armed){audioStartup.metadataHeld=true;await new Promise(resolve=>audioStartup.releaseMetadata=resolve);audioStartup.metadataHeld=false;}');
    await route.fulfill({response,body});
   });
   await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');await page.locator('#add-first').waitFor();
   await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy')||document.querySelector('#release-notice-done'));
   if(await page.locator('#release-notice-done').isVisible())await page.locator('#release-notice-done').click();
   await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
   await page.evaluate(async mode=>{
     window.audioStartup={mode,contexts:[],events:[],armed:false,inPlay:false,inEnable:false,inMenu:false};const f=audioStartup;
    class Context extends EventTarget{
     constructor(){super();this.state='suspended';this.destination={};this.pending=[];this.closed=0;f.contexts.push(this);f.events.push({event:'create',inPlay:f.inPlay});}
     get currentTime(){return performance.now()/1000;}
     change(state){this.state=state;this.dispatchEvent(new Event('statechange'));}
      resume(){f.events.push({event:'resume',inPlay:f.inPlay,inEnable:f.inEnable,inMenu:f.inMenu,inInput:!!f.inInput,input:f.inputEvent});if(f.mode==='denied'||f.mode==='restart-blocked'&&!f.inPlay&&!f.inEnable&&!f.inMenu)return Promise.reject(Error('Controlled audio-session restart denied outside a gesture'));if(f.mode==='pending')return new Promise(resolve=>this.pending.push(()=>{if(this.state!=='closed')this.change('running');resolve();}));if(this.state!=='closed')this.change('running');return Promise.resolve();}
      suspend(){f.events.push({event:'suspend'});if(this.state!=='closed')this.change('suspended');return Promise.resolve();}
     close(){this.closed++;this.change('closed');return Promise.resolve();}
     createGain(){return {gain:{value:0},connect(){},disconnect(){}};}
     createBuffer(channels,length,rate){const data=Array.from({length:channels},()=>new Float32Array(length));return {duration:length/rate,getChannelData:index=>data[index]};}
     createBufferSource(){return {playbackRate:{value:1},connect(gain){this.gain=gain;},disconnect(){},stop(){},start(){let peak=0;for(const sample of this.buffer.getChannelData(0))peak=Math.max(peak,Math.abs(sample));f.events.push({event:'audio-start',gain:this.gain.gain.value,peak,metadataHeld:!!f.metadataHeld});queueMicrotask(()=>this.onended?.());}};}
    }
    window.AudioContext=Context;window.webkitAudioContext=undefined;
    const {MGBACore}=await import('./src/core/mgba.js'),{SaveProtection}=await import('./src/storage/save-safety.js'),load=MGBACore.prototype.load,save=SaveProtection.prototype.save,get=IDBObjectStore.prototype.get;
    MGBACore.prototype.load=function(...args){f.core=this;f.events.push({event:'core-load',inPlay:f.inPlay,same:this.ac===f.contexts[0]});return load.apply(this,args);};
    SaveProtection.prototype.save=function(...args){f.protection=this;return save.apply(this,args);};
    IDBObjectStore.prototype.get=function(...args){if(f.armed)f.events.push({event:'idb-read',inPlay:f.inPlay});return get.apply(this,args);};
   },mode);
   const rom=require('./cartridges.cjs').gb();
   if(checkStartupVolume){
    // Authored GB square wave: prove non-silent PCM obeys the saved volume.
    const program=[];for(const [reg,value]of [[0x26,0x80],[0x24,0x77],[0x25,0x11],[0x11,0x80],[0x12,0xf0],[0x13,0],[0x14,0x87]])program.push(0x3e,value,0xe0,reg);program.push(0x18,0xfe);rom.set(program,0x150);
   }
   await page.locator('#rom-input').setInputFiles({name:'Audio launch.gb',mimeType:'application/octet-stream',buffer:Buffer.from(rom)});
   await page.locator('.game-launch').waitFor();
    await page.evaluate(async withSave=>{
    const db=await import('./src/storage/storage.js'),{coreFor}=await import('./src/core/core-registry.js'),{hash}=await import('./src/shared.js'),[game]=await db.all('library');
    const bytes=Uint8Array.from({length:8192},(_,i)=>(i*17+31)&255);audioStartup.id=game.id;audioStartup.expectedHash=await hash(bytes);
     if(withSave)await db.put('saves',game.id,{bytes,hash:audioStartup.expectedHash,at:12345,coreId:coreFor(game).id,reason:'audio-fixture'});
     else if(await db.get('saves',game.id))throw Error('Fresh import must begin without a battery save');
    },withSave);
   await page.locator('.game-launch').click();await page.locator('.game-info-play').waitFor();
   await page.evaluate(()=>{
    const f=audioStartup,button=document.querySelector('.game-info-play'),click=button.onclick;f.armed=true;
    button.onclick=function(event){f.trusted=event.isTrusted;f.inPlay=true;try{return click.call(this,event);}finally{f.inPlay=false;}};
   });
   await page.locator('.game-info-play').click();
   if(checkStartupVolume){
    await page.waitForFunction(()=>audioStartup.metadataHeld&&audioStartup.core.frames>=6);
    const startup=await page.evaluate(()=>({volume:audioStartup.core.volume,gain:audioStartup.core.gain.gain.value,started:audioStartup.events.filter(event=>event.event==='audio-start')})),expected=muted?0:volume;
    assert.equal(startup.volume,expected,'Saved volume applies before any startup frame: '+name);assert.equal(startup.gain,expected);
    if(muted)assert.equal(startup.started.length,0,'Muted startup must not queue audio while metadata is pending');
    else{assert.ok(startup.started.some(event=>event.peak>0&&event.metadataHeld),'Quiet startup exercises actual non-silent PCM during the metadata wait');assert.ok(startup.started.every(event=>event.gain===expected),'No startup audio may use the default volume');}
    await page.evaluate(()=>audioStartup.releaseMetadata());
   }
   await page.locator('#loading').waitFor({state:'hidden'});await page.waitForFunction(()=>audioStartup.core&&!audioStartup.core.paused);
   const order=await page.evaluate(()=>{const f=audioStartup,create=f.events.findIndex(e=>e.event==='create'),resume=f.events.findIndex(e=>e.event==='resume'),read=f.events.findIndex(e=>e.event==='idb-read'),load=f.events.find(e=>e.event==='core-load');return {trusted:f.trusted,create,createInPlay:f.events[create].inPlay,resume,resumeInPlay:f.events[resume].inPlay,read,readInPlay:f.events[read]?.inPlay,loadInPlay:load?.inPlay,same:load?.same,contexts:f.contexts.length};});
   assert.equal(order.trusted,true);assert.equal(order.createInPlay,true,'Actual Play handler creates audio synchronously');assert.equal(order.resumeInPlay,true,'Actual Play handler resumes audio synchronously');
   assert.ok(order.create<order.resume&&order.resume<order.read,'Audio activation precedes asynchronous IndexedDB access');assert.equal(order.readInPlay,false);assert.equal(order.loadInPlay,false);assert.equal(order.same,true);assert.equal(order.contexts,1);
    if(!withSave)await page.evaluate(async()=>{const {hash}=await import('./src/shared.js');audioStartup.expectedHash=await hash(audioStartup.core.save());});
   const enable=page.locator('#enable-audio');
    if(mode==='restart-blocked'){
     const initial=await page.evaluate(()=>({audioState:audioStartup.core.audioState,contextState:audioStartup.core.ac.state,playing:!audioStartup.core.paused,enableHidden:document.querySelector('#enable-audio').hidden}));
     await page.locator('#player-menu').click();await page.locator('#sheet').waitFor();
     assert.deepEqual(await page.evaluate(()=>({paused:audioStartup.core.paused,audio:audioStartup.core.audioState,context:audioStartup.core.ac.state})),{paused:true,audio:'paused',context:'suspended'},'Normal game-menu pause still suspends audio');
     await page.evaluate(()=>audioStartup.protection.queue);
     await page.evaluate(()=>{const f=audioStartup,button=document.querySelector('#close-sheet'),click=button.onclick;button.onclick=function(event){f.menuTrusted=event.isTrusted;f.inMenu=true;try{return click.call(this,event);}finally{f.inMenu=false;}};});
     await page.locator('#close-sheet').click();await page.waitForFunction(()=>audioStartup.core.audioState==='running');
     assert.deepEqual(await page.evaluate(()=>({trusted:audioStartup.menuTrusted,inMenu:audioStartup.events.filter(event=>event.event==='resume').at(-1).inMenu,contexts:audioStartup.contexts.length,playing:!audioStartup.core.paused})),{trusted:true,inMenu:true,contexts:1,playing:true},'A genuine menu-close click restarts the existing audio session');
     if(initial.audioState!=='running')console.log('REPRO '+name+': first launch is silent; opening/closing the menu restores audio.',initial);
     assert.deepEqual(initial,{audioState:'running',contextState:'running',playing:true,enableHidden:true},'First launch stays audible without a menu workaround: '+name);
    }
    if(mode==='success'||mode==='restart-blocked')assert.equal(await enable.isVisible(),false,'Activated audio needs no extra prompt');
   else{
    await enable.waitFor();await page.locator('#player-menu').click();await page.locator('#sheet').waitFor();assert.equal(await enable.isVisible(),false,'No activation prompt over paused menus');assert.equal(await page.evaluate(()=>audioStartup.core.paused),true);
    await page.evaluate(()=>audioStartup.protection.queue);await page.locator('#close-sheet').click();await enable.waitFor();
    const snapshot=async()=>page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),id=audioStartup.id;return hash(new TextEncoder().encode(JSON.stringify([await db.get('saves',id),await db.get('backups',id),await db.get('recoveries',id)])));});
    const before=await snapshot();
    if(mode==='pending'){
     const synthetic=await page.evaluate(()=>{
      const f=audioStartup;f.mode='success';f.unlocks=[];const unlock=f.core.unlockAudio;
      f.core.unlockAudio=function(options){f.unlocks.push({retry:options?.retry,inInput:!!f.inInput});return unlock.call(this,options);};
      window.addEventListener('pointerup',event=>{f.inputEvent={trusted:event.isTrusted,type:event.type,pointerType:event.pointerType};f.inInput=true;setTimeout(()=>{f.inInput=false;},0);},{capture:true});
      const count=()=>f.events.filter(event=>event.event==='resume').length,before=count();
      document.querySelector('#screen canvas').dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch'}));
      document.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'F9',code:'F9'}));
      return {before,after:count(),state:f.core.audioState,retries:f.unlocks.filter(call=>call.retry).length};
     });
     assert.equal(synthetic.before,synthetic.after,'Synthetic input cannot retry a pending audio session');assert.equal(synthetic.state,'pending');assert.equal(synthetic.retries,0);
     await page.locator('#screen canvas').first().tap();await enable.waitFor({state:'hidden'});
     assert.deepEqual(await page.evaluate(()=>{const f=audioStartup,resume=f.events.filter(event=>event.event==='resume').at(-1);return {input:resume.input,inInput:resume.inInput,retry:f.unlocks.some(call=>call.retry&&call.inInput),running:f.core.ac.state==='running',contexts:f.contexts.length};}),{input:{trusted:true,type:'pointerup',pointerType:'touch'},inInput:true,retry:true,running:true,contexts:1},'A genuine player touch release retries the same pending context without opening a menu');
    }else{
     await page.evaluate(()=>{const f=audioStartup,b=document.querySelector('#enable-audio'),click=b.onclick;f.mode='success';b.addEventListener('pointerup',event=>{f.enableTrusted=event.isTrusted;f.inEnable=true;setTimeout(()=>{f.inEnable=false;},0);},{capture:true});b.onclick=function(event){f.enableTrusted=event.isTrusted;f.inEnable=true;try{return click.call(this,event);}finally{f.inEnable=false;}};});
     await enable.click();await enable.waitFor({state:'hidden'});
     assert.deepEqual(await page.evaluate(()=>({trusted:audioStartup.enableTrusted,inEnable:audioStartup.events.filter(e=>e.event==='resume').at(-1).inEnable,running:audioStartup.core.ac.state==='running',contexts:audioStartup.contexts.length})),{trusted:true,inEnable:true,running:true,contexts:1},'Explicit retry uses the same context within a genuine click');
    }
    assert.equal(await snapshot(),before,'Enabling audio cannot change battery, backup or recovery records');
    await page.evaluate(()=>audioStartup.core.ac.pending.forEach(done=>done()));
   }
   assert.equal(await page.evaluate(async()=>{const {hash}=await import('./src/shared.js');return await hash(audioStartup.core.save())===audioStartup.expectedHash;}),true,'Native core still contains the imported battery bytes');
   await page.locator('#player-menu').click();await page.locator('#sheet').waitFor();assert.equal(await enable.isVisible(),false);await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
   assert.deepEqual(await page.evaluate(()=>({contexts:audioStartup.contexts.length,closed:audioStartup.contexts[0].closed,state:audioStartup.contexts[0].state,coreClosed:audioStartup.core.closed})),{contexts:1,closed:1,state:'closed',coreClosed:true},'Exit releases the single transferred context');
   assert.equal(await page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),save=await db.get('saves',audioStartup.id);return save.hash===audioStartup.expectedHash&&await hash(save.bytes)===audioStartup.expectedHash;}),true,'Final persistence preserves every battery byte');
    assert.deepEqual(errors,[]);await context.close();console.log('PASS '+kind+': audio startup '+name);
  }
  console.log('PASS '+kind+': actual Play click activates audio before IndexedDB; fresh/with-save startup preserves activation; saved mute/volume applies before startup frames; one transferred context; pending touch-release and denied enable-button retry; synthetic input refusal; normal menu pause/resume; exit cleanup; unchanged save bytes. Physical iPhone audio untested.');
 }finally{await browser.close();}
})().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
