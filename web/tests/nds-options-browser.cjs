// SPDX-License-Identifier: AGPL-3.0-or-later
// Original fixture only. Isolated browser storage; no user ROM/save or microphone.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  for(const [coreKey,defaultLanguage] of [['desmume2015',0],['melonds',1]]){
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r));page.setDefaultTimeout(20000);
   const base=process.env.TEST_URL||'http://127.0.0.1:4173/';await page.goto(base);
   await page.locator('#rom-input').setInputFiles({name:'DS options fixture.nds',mimeType:'application/octet-stream',buffer:require('./nds-options-cartridge.cjs')()});
   await page.locator('.game-launch').click();
   if(coreKey==='melonds'){await page.locator('[data-action=switchCore]').click();await page.locator('[data-core=melonds]').click();}
   await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
   const language=expected=>page.waitForFunction(expected=>{const c=document.querySelector('.nds-top');if(!c)return false;const [r,g,b,a]=c.getContext('2d').getImageData(0,0,1,1).data;return r>=(expected+1)*32&&r<=(expected+1)*32+7&&g===0&&b===0&&a===255;},expected);
   const microphone=active=>page.waitForFunction(active=>{const c=document.querySelector('.nds-bottom');if(!c)return false;const [r,g,b,a]=c.getContext('2d').getImageData(0,0,1,1).data;return r===0&&a===255&&(active?g>=248&&b===0:g===0&&b>=248);},active);
   const options=async()=>{await page.locator('#player-menu').click();await page.locator('[data-action=cartridge]').click();};
   const exit=async()=>{await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});};
   await language(defaultLanguage);await microphone(false);await options();
   const names=await page.locator('[data-setting=ndsLanguage] option').allTextContents();assert.ok(names.includes('日本語')&&names.includes('Italiano'));assert.equal(names.length,7);
   await page.locator('[data-setting=ndsLanguage]').selectOption('fr');await page.locator('#nds-blow').click();await page.locator('#sheet').waitFor({state:'hidden'});
   await language(defaultLanguage);await microphone(true);await microphone(false);
   // Opening the menu cancels an active action before the five-second deadline.
   await options();await page.locator('#nds-blow').click();await microphone(true);await page.locator('#player-menu').click();await page.locator('#close-sheet').click();await microphone(false);
   await exit();await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});await language(2);await microphone(false);
   await options();assert.equal(await page.locator('[data-setting=ndsLanguage]').inputValue(),'fr');await page.locator('#close-sheet').click();await exit();
   assert.deepEqual(errors,[]);assert.ok(requests.every(r=>{const url=new URL(r.url());return url.origin===new URL(base).origin&&['http:','https:','blob:'].includes(url.protocol)&&['GET','HEAD'].includes(r.method())&&!r.postData();}));
   await context.close();console.log('PASS: NDS options UI, actual microphone input/timeout/pause, language persists and applies on reopening: '+coreKey+' '+kind);
  }
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
