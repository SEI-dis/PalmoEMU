// SPDX-License-Identifier: AGPL-3.0-or-later
// GameInfo child sheets retain their owning game; gameplay dialogs keep resume.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy')&&localStorage.getItem('manic-settings')!==null);
 await page.locator('#rom-input').setInputFiles({name:'Navigation fixture.gb',mimeType:'application/octet-stream',buffer:Buffer.from(require('./cartridges.cjs').gb())});await page.locator('.game-launch').waitFor();
 await page.evaluate(async()=>{const {MGBACore}=await import('./src/core/mgba.js'),load=MGBACore.prototype.load;window.navLoads=0;MGBACore.prototype.load=function(...args){navLoads++;window.navCore=this;return load.apply(this,args);};});
 const root=async()=>{await page.locator('#sheet.game-info .game-info-play').waitFor();assert.equal(await page.locator('#player').isVisible(),false);};
 await page.locator('.game-launch').click();await root();
 // Returning from every pre-play child keeps the same ROM and its scroll offset.
 for(const [selector,title,escape] of [
  ['[data-action=cover]','カバー変更',false],['[data-action=gameSkin]','スキン',true],['[data-action=states]','セーブステート',false],['[data-action=switchCore]','コアを変更',true],['[data-action=cheats]','チート',false],['[data-action=controllers]','コントローラーと操作補助',true],['[data-action=optionOrder]','機能順序設定',false],['[data-action=shortcuts]','ゲームショートカット',true],['#game-info-button','ゲーム情報',false]
 ]){
  // scrollIntoView performs the same parent scroll as a user's tap; capture it
  // immediately before activation so the expected position is independent.
  await page.locator(selector).scrollIntoViewIfNeeded();const scroll=await page.locator('.native-options').evaluate(el=>el.scrollTop);
  await page.locator(selector).click();await page.locator('#sheet:not(.game-info)').waitFor();assert.equal(await page.locator('#sheet-title').textContent(),title,selector);
  if(selector==='[data-action=gameSkin]')await page.locator('#skin-grid').waitFor();
  if(escape)await page.keyboard.press('Escape');else await page.locator('#close-sheet').click();
  await root();assert.ok(Math.abs(await page.locator('.native-options').evaluate(el=>el.scrollTop)-scroll)<2,'Restore parent scroll for '+selector);
 }
 assert.equal(await page.evaluate(()=>navLoads),0,'Settings navigation never loads a core');
 // Child cleanup (input capture and layout previews) is called before the
 // parent is rebuilt. A close must never retain an invisible capture listener.
 await page.locator('[data-action=controllers]').click();await page.locator('[data-action=map-a]').click();await page.locator('#close-sheet').click();await root();
 await page.locator('[data-setting=speed]').selectOption('3');await page.keyboard.press('j');
 await page.waitForFunction(async()=>{const db=await import('./src/storage/storage.js'),[game]=await db.all('library');return game?.preferences?.speed===3;});
 const scope=await page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),[game]=await db.all('library');return {speed:game.preferences.speed,global:JSON.parse(localStorage.getItem('manic-settings')).speed};});assert.deepEqual(scope,{speed:3,global:1});
 await page.locator('[data-action=gameSkin]').click();await page.locator('#edit-controls').click();await page.locator('.control-editor').waitFor();await page.keyboard.press('Escape');await root();assert.equal(await page.locator('#sheet.control-edit').count(),0);
 // Busy operations already disable the header close button. Esc/background
 // must honor that same guard instead of destroying the operation's UI.
 await page.locator('[data-action=cover]').click();await page.locator('#close-sheet').evaluate(el=>el.disabled=true);await page.keyboard.press('Escape');assert.equal(await page.locator('#sheet-title').textContent(),'カバー変更');await page.locator('#sheet').dispatchEvent('click',{clientX:0,clientY:0});assert.equal(await page.locator('#sheet-title').textContent(),'カバー変更');await page.locator('#close-sheet').evaluate(el=>el.disabled=false);await page.locator('#close-sheet').click();await root();
 // The root X closes to the library; it does not reopen itself.
 await page.locator('#close-sheet').click();await page.locator('#sheet').waitFor({state:'hidden'});await page.locator('.game-launch').click();await root();assert.equal(await page.locator('.native-options').evaluate(el=>el.scrollTop),0);
 // Explicit safe-mode start dismisses the whole pre-play hierarchy. Playing
 // child sheets retain their established pause -> close -> resume behavior.
 await page.locator('[data-action=safeMode]').click();await page.locator('[data-action=start]').click();await page.locator('#loading').waitFor({state:'hidden'});await page.locator('#sheet').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>navCore.paused),false);
 await page.locator('#player-menu').click();await page.locator('[data-action=controllers]').click();assert.equal(await page.evaluate(()=>navCore.paused),true);await page.keyboard.press('Escape');await page.locator('#sheet').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>navCore.paused),false);
 await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
 assert.ok(await page.evaluate(async()=>{const db=await import('./src/storage/storage.js');return (await db.all('library'))[0].playDuration>0;}),'First-play duration survives automatic cover storage');
 // Deleting from a child confirmation dismisses the owner instead of reviving
 // a ROM menu for a game which no longer exists.
 await page.locator('.game-launch').click();await page.locator('[data-action=delete]').click();await page.locator('#confirm-delete').click();await page.locator('#sheet').waitFor({state:'hidden'});await page.locator('.game-launch').waitFor({state:'detached'});
 assert.deepEqual(errors,[]);console.log(`PASS ${kind}: ROM child X/Esc returns, scroll preservation, cleanup, settings scope, dismiss guard, root close, safe start, gameplay resume and delete`);await context.close();
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
