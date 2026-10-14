// SPDX-License-Identifier: AGPL-3.0-or-later
// Real app launch/IndexedDB/native GB core, with a controllable Web Audio policy.
// No device sound or physical iPhone permission claim is made by this test.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  for(const mode of ['success','denied','pending']){
   const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(20000);
   await context.addInitScript(()=>localStorage.setItem('manic-settings',JSON.stringify({autosave:false,recovery:false,rewindEnabled:false,muted:false,volume:.7})));
   await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');await page.locator('#add-first').waitFor();
   await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy')||document.querySelector('#release-notice-done'));
   if(await page.locator('#release-notice-done').isVisible())await page.locator('#release-notice-done').click();
   await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
   await page.evaluate(async mode=>{
    window.audioStartup={mode,contexts:[],events:[],armed:false,inPlay:false,inEnable:false};const f=audioStartup;
    class Context extends EventTarget{
     constructor(){super();this.state='suspended';this.destination={};this.pending=[];this.closed=0;f.contexts.push(this);f.events.push({event:'create',inPlay:f.inPlay});}
     get currentTime(){return performance.now()/1000;}
     change(state){this.state=state;this.dispatchEvent(new Event('statechange'));}
     resume(){f.events.push({event:'resume',inPlay:f.inPlay,inEnable:f.inEnable});if(f.mode==='denied')return Promise.reject(Error('Autoplay denied'));if(f.mode==='pending')return new Promise(resolve=>this.pending.push(()=>{if(this.state!=='closed')this.change('running');resolve();}));if(this.state!=='closed')this.change('running');return Promise.resolve();}
     suspend(){if(this.state!=='closed')this.change('suspended');return Promise.resolve();}
     close(){this.closed++;this.change('closed');return Promise.resolve();}
     createGain(){return {gain:{value:0},connect(){},disconnect(){}};}
     createBuffer(channels,length,rate){const data=Array.from({length:channels},()=>new Float32Array(length));return {duration:length/rate,getChannelData:index=>data[index]};}
     createBufferSource(){return {playbackRate:{value:1},connect(){},disconnect(){},stop(){},start(){queueMicrotask(()=>this.onended?.());}};}
    }
    window.AudioContext=Context;window.webkitAudioContext=undefined;
    const {MGBACore}=await import('./src/core/mgba.js'),{SaveProtection}=await import('./src/storage/save-safety.js'),load=MGBACore.prototype.load,save=SaveProtection.prototype.save,get=IDBObjectStore.prototype.get;
    MGBACore.prototype.load=function(...args){f.core=this;f.events.push({event:'core-load',inPlay:f.inPlay,same:this.ac===f.contexts[0]});return load.apply(this,args);};
    SaveProtection.prototype.save=function(...args){f.protection=this;return save.apply(this,args);};
    IDBObjectStore.prototype.get=function(...args){if(f.armed)f.events.push({event:'idb-read',inPlay:f.inPlay});return get.apply(this,args);};
   },mode);
   await page.locator('#rom-input').setInputFiles({name:'Audio launch.gb',mimeType:'application/octet-stream',buffer:Buffer.from(require('./cartridges.cjs').gb())});
   await page.locator('.game-launch').waitFor();
   await page.evaluate(async()=>{
    const db=await import('./src/storage/storage.js'),{coreFor}=await import('./src/core/core-registry.js'),{hash}=await import('./src/shared.js'),[game]=await db.all('library');
    const bytes=Uint8Array.from({length:8192},(_,i)=>(i*17+31)&255);audioStartup.id=game.id;audioStartup.expectedHash=await hash(bytes);
    await db.put('saves',game.id,{bytes,hash:audioStartup.expectedHash,at:12345,coreId:coreFor(game).id,reason:'audio-fixture'});
   });
   await page.locator('.game-launch').click();await page.locator('.game-info-play').waitFor();
   await page.evaluate(()=>{
    const f=audioStartup,button=document.querySelector('.game-info-play'),click=button.onclick;f.armed=true;
    button.onclick=function(event){f.trusted=event.isTrusted;f.inPlay=true;try{return click.call(this,event);}finally{f.inPlay=false;}};
   });
   await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});await page.waitForFunction(()=>audioStartup.core&&!audioStartup.core.paused);
   const order=await page.evaluate(()=>{const f=audioStartup,create=f.events.findIndex(e=>e.event==='create'),resume=f.events.findIndex(e=>e.event==='resume'),read=f.events.findIndex(e=>e.event==='idb-read'),load=f.events.find(e=>e.event==='core-load');return {trusted:f.trusted,create,createInPlay:f.events[create].inPlay,resume,resumeInPlay:f.events[resume].inPlay,read,readInPlay:f.events[read]?.inPlay,loadInPlay:load?.inPlay,same:load?.same,contexts:f.contexts.length};});
   assert.equal(order.trusted,true);assert.equal(order.createInPlay,true,'Actual Play handler creates audio synchronously');assert.equal(order.resumeInPlay,true,'Actual Play handler resumes audio synchronously');
   assert.ok(order.create<order.resume&&order.resume<order.read,'Audio activation precedes asynchronous IndexedDB access');assert.equal(order.readInPlay,false);assert.equal(order.loadInPlay,false);assert.equal(order.same,true);assert.equal(order.contexts,1);
   const enable=page.locator('#enable-audio');
   if(mode==='success')assert.equal(await enable.isVisible(),false,'Activated audio needs no extra prompt');
   else{
    await enable.waitFor();await page.locator('#player-menu').click();await page.locator('#sheet').waitFor();assert.equal(await enable.isVisible(),false,'No activation prompt over paused menus');assert.equal(await page.evaluate(()=>audioStartup.core.paused),true);
    await page.evaluate(()=>audioStartup.protection.queue);await page.locator('#close-sheet').click();await enable.waitFor();
    const snapshot=async()=>page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),id=audioStartup.id;return hash(new TextEncoder().encode(JSON.stringify([await db.get('saves',id),await db.get('backups',id),await db.get('recoveries',id)])));});
    const before=await snapshot();
    await page.evaluate(()=>{const f=audioStartup,b=document.querySelector('#enable-audio'),click=b.onclick;f.mode='success';b.onclick=function(event){f.enableTrusted=event.isTrusted;f.inEnable=true;try{return click.call(this,event);}finally{f.inEnable=false;}};});
    await enable.click();await enable.waitFor({state:'hidden'});
    assert.deepEqual(await page.evaluate(()=>({trusted:audioStartup.enableTrusted,inEnable:audioStartup.events.filter(e=>e.event==='resume').at(-1).inEnable,running:audioStartup.core.ac.state==='running',contexts:audioStartup.contexts.length})),{trusted:true,inEnable:true,running:true,contexts:1},'Explicit retry uses the same context within a genuine click');
    assert.equal(await snapshot(),before,'Enabling audio cannot change battery, backup or recovery records');
    await page.evaluate(()=>audioStartup.core.ac.pending.forEach(done=>done()));
   }
   assert.equal(await page.evaluate(async()=>{const {hash}=await import('./src/shared.js');return await hash(audioStartup.core.save())===audioStartup.expectedHash;}),true,'Native core still contains the imported battery bytes');
   await page.locator('#player-menu').click();await page.locator('#sheet').waitFor();assert.equal(await enable.isVisible(),false);await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
   assert.deepEqual(await page.evaluate(()=>({contexts:audioStartup.contexts.length,closed:audioStartup.contexts[0].closed,state:audioStartup.contexts[0].state,coreClosed:audioStartup.core.closed})),{contexts:1,closed:1,state:'closed',coreClosed:true},'Exit releases the single transferred context');
   assert.equal(await page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),save=await db.get('saves',audioStartup.id);return save.hash===audioStartup.expectedHash&&await hash(save.bytes)===audioStartup.expectedHash;}),true,'Final persistence preserves every battery byte');
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS '+kind+': actual Play click activates audio before IndexedDB; one transferred context; denied/pending enable-button retry; paused-menu hiding; exit cleanup; unchanged save bytes. Physical iPhone audio untested.');
 }finally{await browser.close();}
})().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
