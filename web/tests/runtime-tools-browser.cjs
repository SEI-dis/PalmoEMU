// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const {cartridge}=require('./link.cjs'),engine=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[engine].launch({headless:true,...(engine==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.addInitScript(()=>{
   window.wakeCalls=0;window.wakeReleases=0;
   Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:async()=>{wakeCalls++;const lock=new EventTarget();lock.release=async()=>{wakeReleases++;lock.dispatchEvent(new Event('release'));};return lock;}}});
   localStorage.setItem('manic-settings',JSON.stringify({measurePerformance:true,keepScreenAwake:true}));
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');await page.locator('#add-first').waitFor();if(await page.locator('#sheet').isVisible())await page.locator('#close-sheet').click();assert.equal(await page.evaluate(()=>wakeCalls),0);
  await page.locator('#rom-input').setInputFiles({name:'Runtime synthetic.gba',mimeType:'application/octet-stream',buffer:Buffer.from(cartridge(31,992))});
  await page.locator('.game-launch').waitFor({timeout:10000}).catch(async error=>{console.error('Import diagnostics:',errors,await page.locator('#toast').textContent(),await page.locator('#sheet-body').textContent());throw error;});await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>wakeCalls>0);
  await page.waitForFunction(async()=>{const {performanceDiagnostics:p}=await import('./src/runtime/performance.js');return p.snapshot().frames>20;});
  await page.locator('#player-menu').click();await page.waitForFunction(()=>wakeReleases>0);
  const paused=await page.evaluate(async()=>{const {performanceDiagnostics:p}=await import('./src/runtime/performance.js');return p.snapshot();});assert.equal(paused.measuring,false);assert(paused.frameInterval.samples>0);
  await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  await page.locator('[data-tab=settings]').click();await page.locator('[data-action=diagnostics]').click();await page.locator('#performance-enabled').waitFor();
  assert(await page.locator('#sheet-body').innerText().then(s=>s.includes('描画の間隔')));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const allowed=await page.evaluate(async()=>{
   const {diagnostics:d}=await import('./src/diagnostics.js'),{diagnosticSources}=await import('./src/runtime/diagnostic-sources.js');d.clear();
   const missing=[];for(const file of diagnosticSources){const e=new Error('not retained');e.stack='Error\n at fake ('+new URL(file,location.href).href+':12:3)';const report=d.record(e);if(!report.frames.some(f=>f.file===file))missing.push(file);}
   const privateError=new Error('PRIVATE');privateError.stack='Error\n at fake ('+location.origin+'/src/PRIVATE_ROM_NAME.js:1:1)';const report=d.record(privateError);return {missing,privateFrames:report.frames,performance:d.snapshot().performance};
  });assert.deepEqual(allowed.missing,[]);assert.deepEqual(allowed.privateFrames,[]);assert(allowed.performance.frames>0);
  await page.locator('#performance-enabled').uncheck();assert.equal(await page.evaluate(async()=>(await import('./src/runtime/performance.js')).performanceDiagnostics.snapshot().enabled),false);
  assert.deepEqual(errors,[]);console.log('PASS: '+engine+' real game wake-lock lifecycle, drawing metrics, compact diagnostics and all exact source paths.');
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
