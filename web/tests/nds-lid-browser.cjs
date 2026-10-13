// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  for(const core of ['desmume2015','melonds']){
   const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(20000);
   await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');await page.locator('#rom-input').setInputFiles({name:'Hinge fixture.nds',mimeType:'application/octet-stream',buffer:require('./nds-lid-cartridge.cjs')()});
   await page.locator('.game-launch').click();if(core==='melonds'){await page.locator('[data-action=switchCore]').click();await page.locator('[data-core=melonds]').click();}
   await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
   const hinge=closed=>page.waitForFunction(closed=>{const c=document.querySelector('.nds-bottom');if(!c)return false;const [r,g,b,a]=c.getContext('2d').getImageData(0,0,1,1).data;return r===0&&a===255&&(closed?g>=248&&b===0:g===0&&b>=248);},closed);
   const options=async()=>{await page.locator('#player-menu').click();await page.locator('[data-action=cartridge]').click();};
   await hinge(false);await options();assert.equal(await page.locator('#nds-lid').textContent(),'ふたを閉じる');await page.locator('#nds-lid').click();await hinge(true);
   await options();assert.equal(await page.locator('#nds-lid').textContent(),'ふたを開く');await page.locator('#nds-lid').click();await hinge(false);
   await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});assert.deepEqual(errors,[]);await context.close();
   console.log('PASS: DS lid menu drives real '+core+' open/closed/open '+kind);
  }
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
