// SPDX-License-Identifier: AGPL-3.0-or-later
// Original fixtures only; isolated context. No user's games or browser profile.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs'),{createStaticServer}=require('../scripts/serve.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const server=createStaticServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:'msedge'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'ja-JP',serviceWorkers:'block'});
  await context.addInitScript(()=>{Object.defineProperty(navigator,'serviceWorker',{value:undefined});localStorage.setItem('palmo-language','ja');});
  // WebKit exposes FileReader's local blob requests to routing as well.
  await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  let workers=0;await context.route('**/src/library/rom-import-worker.js',async route=>{const response=await route.fetch(),prefix=++workers===1?`FileReader.prototype.readAsArrayBuffer=function(){Object.defineProperty(this,'error',{value:new DOMException('Synthetic read failure','NotReadableError')});setTimeout(()=>this.dispatchEvent(new ProgressEvent('error')),0);};\n`:'';await route.fulfill({response,body:prefix+await response.text()});});
  const page=await context.newPage();await page.goto(base);await page.locator('#rom-input').waitFor({state:'attached'});
  const source=Buffer.from(require('./link.cjs').cartridge(31,992)),later=Buffer.from(source);later[later.length-1]^=1;
  await page.locator('#rom-input').setInputFiles([{name:'Unsupported <file>.txt',mimeType:'text/plain',buffer:Buffer.from('fixture')},{name:'Failure.gba',mimeType:'application/octet-stream',buffer:source},{name:'Success.gba',mimeType:'application/octet-stream',buffer:later}]);
  await page.locator('#import-results-close').waitFor();const result=await page.locator('#sheet-body').textContent();assert.match(result,/1本/);assert.match(result,/Unsupported <file>\.txt/);assert.match(result,/Failure.gba/);assert.equal(workers,2,'Later files still attempted');assert.equal(await page.locator('#sheet-body file').count(),0);
  const records=await page.evaluate(async()=>await(await import('./src/storage/storage.js')).all('library'));assert.equal(records.length,1);
  await page.locator('#import-results-close').click();assert.equal(await page.locator('#sheet-body').innerHTML(),'','Closed sheet releases rows/handlers');
  // A single known game still opens its update panel first. The user can
  // leave the panel without a system picker blocking the navigation.
  let fileChoices=0;page.on('filechooser',()=>{fileChoices++;});await page.locator('[data-tab=imports]').click();await page.locator('#import-update-rom').click();await page.locator('#rom-update-choose').waitFor();assert.equal(fileChoices,0);await page.locator('#close-sheet').click();assert.equal(await page.locator('#sheet').isVisible(),false);assert.equal(fileChoices,0);
  await page.locator('#import-update-rom').click();await page.locator('#rom-update-choose').waitFor();assert.equal(fileChoices,0);const chosen=page.waitForEvent('filechooser');await page.locator('#rom-update-choose').click();const chooser=await chosen;assert.equal(fileChoices,1);await chooser.setFiles([]);await page.locator('#close-sheet').click();
  // Destructive action remains separate and after ROM updates, in both themes.
  await page.locator('[data-tab=games]').click();await page.locator('.game-options').first().click();
  const positions=await page.evaluate(()=>({update:document.querySelector('[data-action=updateROM]').getBoundingClientRect().top,remove:document.querySelector('[data-action=delete]').getBoundingClientRect().top,safe:getComputedStyle(document.querySelector('.game-info-safe')).color,primary:getComputedStyle(document.querySelector('.game-info-play')).backgroundColor}));assert.ok(positions.update<positions.remove);assert.notEqual(positions.safe,positions.primary);
  await page.locator('#close-sheet').click();
  const cover=await page.evaluate(async()=>{const {coverThumbnail}=await import('./src/library/cover-thumbnail.js'),canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;const ctx=canvas.getContext('2d');ctx.fillStyle='#ac3366';ctx.fillRect(0,0,800,600);const source=canvas.toDataURL(),output=await coverThumbnail(source),image=new Image();image.src=output;await image.decode();return {width:image.width,height:image.height,sourceBytes:source.length,outputBytes:output.length};});assert.ok(cover.width<=320&&cover.height<=320);assert.ok(cover.outputBytes<cover.sourceBytes);
  const skins=await page.evaluate(async()=>{const {offlineGamePlan,representationImages}=await import('./src/updates/offline-plan.js'),{bundledSkin}=await import('./src/skins/bundled-skins.js'),{chooseRepresentation}=await import('./src/skins/skin-format.js');const games=[{system:'gba',skinId:'bundled:manic-gba'}],skin=await bundledSkin('gba','bundled:manic-gba'),base=new URL('.',location.href);const check=async(width,height)=>{const plan=await offlineGamePlan(games,{}, {width,height}),needed=[...representationImages(skin,chooseRepresentation(skin,width,height)),...representationImages(skin,chooseRepresentation(skin,height,width))].map(url=>url.slice(base.href.length));return {files:plan.files,complete:needed.every(file=>plan.files.includes(file)),cores:plan.cores};};return {phone:await check(390,844),tablet:await check(1024,1366)};});assert.ok(skins.phone.complete&&skins.tablet.complete);assert.deepEqual(skins.phone.cores,['mgba']);assert.equal(skins.phone.files.some(f=>f.includes('/ipad_')),false);assert.ok(skins.tablet.files.some(f=>f.includes('/ipad_')));
  assert.equal(await page.evaluate(async()=>await(await import('./src/storage/storage.js')).has('roms',(await(await import('./src/storage/storage.js')).all('library'))[0].id)),true);
  await context.close();console.log('PASS '+kind+': partial batch import, explicit ROM picker, closed-sheet cleanup, action hierarchy, cover thumbnail and selected offline artwork.');
 }finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exit(1);});
