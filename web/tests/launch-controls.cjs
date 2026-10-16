// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored GB fixture and isolated storage. No user's ROM or save is accessed.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs'),{createStaticServer}=require('../scripts/serve.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const server=createStaticServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  for(const phase of ['native','restore','failure']){
   const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',locale:'ja-JP'}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await context.addInitScript(()=>{localStorage.setItem('manic-settings',JSON.stringify({autosave:true,recovery:false,rewindEnabled:false}));localStorage.setItem('palmo-release-seen:/','9999.0.0');window.reviewIntervals=[];const interval=window.setInterval;window.setInterval=function(callback,ms,...args){if(typeof callback==='function')reviewIntervals.push(callback);return interval.call(this,callback,ms,...args);};});
   await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
   await page.locator('#rom-input').setInputFiles({name:'Launch control fixture.gb',mimeType:'application/octet-stream',buffer:Buffer.from(require('./cartridges.cjs').gb())});
   await page.locator('.game-launch').waitFor();
   await page.evaluate(async()=>{
    const {MGBACore}=await import('./src/core/mgba.js'),{SaveProtection}=await import('./src/storage/save-safety.js');
    const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),[game]=await db.all('library');
    const bytes=Uint8Array.from({length:8192},(_,i)=>(i*17+31)&255);await db.put('saves',game.id,{bytes,hash:await hash(bytes),at:12345,coreId:'mgba-rom64-save6-v2'});
    window.launchReview={phase:null,captures:0,closeCount:0,saveRequests:0,game,db};const f=launchReview,load=MGBACore.prototype.load,verify=SaveProtection.prototype.verify,save=MGBACore.prototype.save,close=MGBACore.prototype.close,persist=SaveProtection.prototype.save;
    f.hold=async()=>{f.held=true;await new Promise(resolve=>f.release=resolve);f.held=false;};
    MGBACore.prototype.load=async function(...args){f.core=this;if(f.phase==='native'||f.phase==='failure'){await f.hold();if(f.phase==='failure')throw Error('Controlled startup failure');}return load.apply(this,args);};
    SaveProtection.prototype.verify=async function(...args){if(f.phase==='restore')await f.hold();return verify.apply(this,args);};
    MGBACore.prototype.save=function(...args){f.captures++;return save.apply(this,args);};
    MGBACore.prototype.close=function(...args){f.closeCount++;return close.apply(this,args);};
    SaveProtection.prototype.save=function(...args){f.saveRequests++;return persist.apply(this,args);};
    f.snapshot=async()=>JSON.stringify([await db.get('saves',game.id),await db.get('backups',game.id),await db.get('recoveries',game.id),await db.all('states')]);
   });
   const play=async()=>{await page.locator('.game-launch').click();await page.locator('.game-info-play').click();};
   await play();await page.locator('#loading').waitFor({state:'hidden'});
   await page.locator('#player-menu').click();await page.evaluate(()=>{launchReview.oldMenu=document.querySelector('#player-menu').onclick;launchReview.oldExit=document.querySelector('[data-shortcut=exit]').onclick;});
   await page.locator('[data-shortcut=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
   await page.evaluate(async phase=>{const f=launchReview;f.phase=phase;f.captures=0;f.closeCount=0;f.saveRequests=0;f.before=await f.snapshot();},phase);
   await play();await page.waitForFunction(()=>launchReview.held);
   const rect=await page.locator('#player-menu').boundingBox();await page.mouse.click(rect.x+rect.width/2,rect.y+rect.height/2);
   for(const key of ['Escape','F5','F8','Tab'])await page.keyboard.press(key);
   await page.evaluate(async()=>{launchReview.oldMenu();await launchReview.oldExit();const timers=reviewIntervals.filter(callback=>callback.toString().includes('persist('));if(timers.length!==2)throw Error('Expected both automatic save polling callbacks');timers.forEach(callback=>callback());});
   const held=await page.evaluate(async()=>({open:document.querySelector('#sheet').open,busy:document.querySelector('#player').getAttribute('aria-busy'),inert:document.querySelector('#player-menu').inert,statusInert:document.querySelector('#loading').inert,captures:launchReview.captures,closes:launchReview.closeCount,saveRequests:launchReview.saveRequests,unchanged:launchReview.before===await launchReview.snapshot()}));
   assert.deepEqual(held,{open:false,busy:'true',inert:true,statusInert:false,captures:0,closes:0,saveRequests:0,unchanged:true},'Loading must block touch, shortcuts, timer saves and old exit handlers without touching saves: '+phase);
   await page.evaluate(()=>launchReview.release());await page.locator('#loading').waitFor({state:'hidden'});
   if(phase==='failure'){
    await page.locator('#player').waitFor({state:'hidden'});assert.equal(await page.locator('#toast').textContent(),'Controlled startup failure');
    assert.equal(await page.evaluate(async()=>launchReview.before===await launchReview.snapshot()),true,'Failed launch preserves all saved bytes and history');
    await page.evaluate(()=>launchReview.phase=null);await play();await page.locator('#loading').waitFor({state:'hidden'});
   }
   assert.deepEqual(await page.evaluate(()=>({busy:document.querySelector('#player').hasAttribute('aria-busy'),inert:[...document.querySelector('#player').children].some(element=>element.inert),open:document.querySelector('#sheet').open,paused:launchReview.core.paused})),{busy:false,inert:false,open:false,paused:false},'Success/retry must restore playable controls: '+phase);
   await page.locator('#player-menu').click();await page.locator('[data-shortcut=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS '+kind+': loading touch/shortcut/retained-handler guards, native and save-restore stages, byte-identical preservation, failure cleanup and normal retry/exit.');
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
