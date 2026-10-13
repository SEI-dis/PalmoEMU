// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic frames and an authored cartridge in an isolated browser context.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';await page.goto(base+'privacy.html');
  const result=await page.evaluate(async()=>{
   const {VideoOutput}=await import('./src/video.js');
   const check=(value,message)=>{if(!value)throw Error(message);},results=[];
   for(const mode of ['lcd','crt']){
    const canvas=document.createElement('canvas'),video=new VideoOutput(canvas,16,16),image=new ImageData(16,16);image.data.fill(255);
    video.draw(image);video.setMode(mode);check(video.strength===.5,'Previous appearance is the default');
    const gpu=video.gpu,sample=()=>[...video.ctx.getImageData(12,12,1,1).data];
    video.setStrength(0);const none=sample();video.setStrength(1);const strong=sample();
    if(!gpu.failed){check(none.slice(0,3).every(v=>v===255),'Zero strength preserves native colour');check(strong.slice(0,3).some((v,i)=>v<none[i]),'Changing paused strength redraws');}
    check(video.gpu===gpu,'Strength changes reuse the GPU context');
    video.setStrength(2);check(video.strength===1,'Upper clamp');video.setStrength(-1);check(video.strength===0,'Lower clamp');video.setStrength(NaN);check(video.strength===.5,'Invalid value uses the default');
    const preview=document.createElement('canvas');preview.width=preview.height=2;const ctx=preview.getContext('2d');ctx.fillStyle='#ff00ff';ctx.fillRect(0,0,2,2);
    video.restorePreview(preview);const before=sample();video.setStrength(.8);check(sample().join()===before.join()&&video.preview===preview,'Restored screenshot stays intact while paused');
    video.draw(image);check(video.preview===null&&video.strength===.8,'Next frame uses retained strength');
    video.setMode('pixel');video.setStrength(.2);video.setMode('lcd');check(video.strength===.2,'Mode changes retain strength');
    video.dispose();video.setStrength(.6);video.setMode('crt');video.draw(image);check(video.gpu===null&&video.sourceImage===null,'Late changes do not revive disposed video');
    results.push({mode,fallback:gpu.failed});
   }
   return results;
  });
  assert.equal(result.length,2);
  // The shared setting must be inherited without a game override, while the
  // game slider must persist separately and reach the paused live core.
  await page.goto(base);await page.locator('#add-first').waitFor();await page.locator('[data-tab=settings]').click();await page.locator('[data-action=video]').click();
  const strength=page.locator('[data-setting=filterStrength]'),filter=page.locator('[data-setting=filter]');
  const changeStrength=value=>strength.evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('change',{bubbles:true}));},value);
  assert.equal(await strength.isVisible(),false);await filter.selectOption('lcd');assert.equal(await strength.isVisible(),true);assert.equal(Number(await strength.inputValue()),.5);
  await changeStrength(.25);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).filterStrength),.25);
  await filter.selectOption('xbrz');assert.equal(await strength.isVisible(),false);await filter.selectOption('lcd');assert.equal(Number(await strength.inputValue()),.25);
  await page.locator('#close-sheet').click();await page.locator('[data-tab=games]').click();
  await page.locator('#rom-input').setInputFiles({name:'Original strength.gba',mimeType:'application/octet-stream',buffer:Buffer.from(require('./link.cjs').cartridge(31,992))});
  await page.locator('.game-launch').click();assert.equal(Number(await strength.inputValue()),.25);await filter.selectOption('crt');await changeStrength(.8);
  await page.waitForFunction(async()=>{const [game]=await(await import('./src/storage.js')).all('library');return game?.preferences?.filterStrength===.8;});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).filterStrength),.25,'A game setting preserves the global value');
  await page.evaluate(async()=>{const {MGBACore}=await import('./src/mgba.js'),load=MGBACore.prototype.load;MGBACore.prototype.load=async function(...args){await load.apply(this,args);window.strengthEngine=this;};});
  await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});await page.locator('#player-menu').click();
  assert.deepEqual(await page.evaluate(()=>[strengthEngine.video.mode,strengthEngine.video.strength,strengthEngine.paused]),['crt',.8,true]);
  await changeStrength(.4);assert.equal(await page.evaluate(()=>strengthEngine.video.strength),.4);await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  await page.reload();await page.locator('.game-launch').click();assert.equal(Number(await strength.inputValue()),.4);assert.equal(await filter.inputValue(),'crt');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).filterStrength),.25);assert.deepEqual(errors,[]);
  console.log('PASS: '+kind+' LCD/CRT defaults, bounded strength, paused redraw, preview preservation, GPU reuse/disposal and persisted global/game UI strength.',result);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
