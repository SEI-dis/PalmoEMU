// SPDX-License-Identifier: AGPL-3.0-or-later
// Real localized views; private synthetic storage and a deterministic offline-status fixture.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const runtime=require('./browser-runtime.cjs'),{createStaticServer}=require('../scripts/serve.cjs');
const engine=process.env.BROWSER_ENGINE||'chromium',codes=['ja','en','zh-Hans','zh-Hant','ko','es','fr','de','pt'];
const output=path.resolve(process.env.SCREENSHOT_DIR||path.join(__dirname,'../../work/ux-review/layout-'+engine));
const only=process.env.UX_LAYOUT_CODES?.split(',');
const onlyViewports=process.env.UX_LAYOUT_VIEWPORTS?.split(',');
const viewports=[{name:'320-dark',width:320,height:844,theme:'dark'},
 {name:'390-dark',width:390,height:844,theme:'dark'},
 {name:'844-landscape',width:844,height:390,theme:'dark'},
 {name:'768-light',width:768,height:1024,theme:'light'}];
(async()=>{
 fs.mkdirSync(output,{recursive:true});const report=[];
 const server=createStaticServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/',browser=await runtime[engine].launch({headless:true,...(engine==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  for(const code of codes.filter(code=>!only||only.includes(code))){
   const context=await browser.newContext({locale:code,viewport:{width:320,height:844},serviceWorkers:'block'}),errors=[];
   await context.addInitScript(code=>{
    localStorage.setItem('palmo-language',code);localStorage.setItem('palmo-start-updates-v1',JSON.stringify({enabled:false}));
    window.fixtureExports=[];window.showSaveFilePicker=async()=>({createWritable:async()=>({write:async file=>fixtureExports.push(await file.text()),close:async()=>{}})});
    Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{}});
   },code);
   // Only the cache/status transport is mocked. The app's selection planning,
   // translations, responsive offline view, controls and result rendering are real.
   await context.route('**/src/updates/offline.js',route=>route.fulfill({contentType:'text/javascript',body:'export async function setupOffline(){} export async function offlineStatus(download,onProgress,selection){globalThis.fixtureOfflineSelection=selection;if(download)onProgress({progress:12,total:12});return {ready:!!download,bytes:12582912,missingBytes:12582912};}'}));
   await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.fallback():route.abort());
   const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
   await page.goto(base);await page.locator('#add-first').waitFor();
   await page.evaluate(async()=>{
    const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),rom=new Uint8Array([1,2,3,4]),bytes=new Uint8Array([5,6,7,8]),id=await hash(rom);
    await db.addGame({id,name:'Synthetic Adventure — Long localized layout fixture',filename:'Synthetic-layout.gba',system:'gba',size:rom.length,added:1,lastPlayed:0},rom);
    await db.put('saves',id,{bytes,hash:await hash(bytes),at:1700000000000});
    await db.put('backups',id,[{bytes,hash:await hash(bytes),at:1699999900000}]);
   });
   await page.reload();await page.locator('.game-launch').waitFor();if(await page.locator('#sheet.release-notice[open]').count())await page.locator('#close-sheet').click();
   assert.equal(await page.locator('html').getAttribute('lang'),code);
   for(const viewport of (['ja','fr','de'].includes(code)?viewports:viewports.slice(0,1)).filter(viewport=>!onlyViewports||onlyViewports.includes(viewport.name))){
    await page.setViewportSize({width:viewport.width,height:viewport.height});
    await page.locator('[data-tab=settings]').click();await page.locator(`[data-theme-choice=${viewport.theme}]`).click();
    const prefix=code+'-'+viewport.name;
    const check=async(name,root,actions=[])=>{
     for(const selector of actions)await page.locator(selector).click({trial:true});
     const problems=await page.evaluate(root=>{
      const parent=document.querySelector(root),issues=[];
      if(document.documentElement.scrollWidth>innerWidth+1)issues.push('document');
      for(const el of [parent,...parent.querySelectorAll('button,.settings-group,.row,.native-row,.import-service,.sheet-note,#sheet-body,#backup-view')]){
       if(!el.getClientRects().length||!el.clientWidth)continue;
       const box=el.getBoundingClientRect(),style=getComputedStyle(el);
       if(box.width>innerWidth+1)issues.push(el.id||el.className||el.tagName);
       if(el.scrollWidth>el.clientWidth+1&&style.textOverflow!=='ellipsis')issues.push((el.id||el.className||el.tagName)+' text overflow');
      }
      return issues;
     },root);
     assert.deepEqual(problems,[],prefix+' '+name);
     const image=prefix+'-'+name+'.png';await page.screenshot({path:path.join(output,image)});report.push({code,viewport:viewport.name,screen:name,image});
    };
    await page.evaluate(()=>window.scrollTo(0,600));await page.locator('[data-tab=imports]').click();
    assert.equal(await page.evaluate(()=>scrollY),0,prefix+' tab change starts at the top');
    await check('imports','.import-page',['#choose-rom','#import-saves','#import-skins','#import-update-rom','#import-patch']);
    await page.locator('[data-tab=games]').click();await page.locator('.game-launch').click();await check('game-rom','#sheet',['[data-action=updateROM]','[data-action=detachROM]']);
    assert.equal(await page.locator('[data-action=delete]').evaluate(el=>!!el.closest('.destructive-group')),true);
    await check('game-delete','#sheet',['[data-action=delete]']);
    await page.locator('[data-action=delete]').click();await check('delete-confirm','#sheet',['#confirm-delete','[data-action=back]']);assert.equal(await page.locator('#close-sheet').isVisible(),false);
    assert.equal(await page.locator('#close-sheet.sheet-back').count(),0);assert.equal(await page.locator('#confirm-delete.destructive').count(),1);await page.keyboard.press('Escape');await page.locator('.game-info-play').waitFor();
    await page.locator('[data-action=category]').click();await check('category','#sheet',['[data-library-category=""]','#close-sheet.sheet-back']);assert.equal(await page.locator('#library-cancel').count(),0);await page.locator('#close-sheet').click();
    await page.locator('[data-action=updateROM]').click();await check('rom-update','#sheet',['#rom-update-choose','#close-sheet.sheet-back']);assert.equal(await page.locator('#rom-update-back').count(),0);await page.locator('#close-sheet').click();
    await page.locator('[data-action=detachROM]').click();await check('detach-confirm','#sheet',['#rom-detach-confirm','#rom-update-back']);assert.equal(await page.locator('#close-sheet').isVisible(),false);assert.equal(await page.locator('#close-sheet.sheet-back').count(),0);assert.equal(await page.locator('#rom-detach-confirm.destructive').count(),1);await page.keyboard.press('Escape');await page.locator('.game-info-play').waitFor();
    assert.equal(await page.locator('[data-action=importSave],[data-action=exportSaved]').count(),0);
    await page.locator('[data-action=states]').click();await page.locator('#state-import-open').waitFor();await check('states-import','#sheet',['#state-import-open','#close-sheet.sheet-back']);assert.equal(await page.locator('#state-import-open.secondary').count(),0);await page.locator('#close-sheet').click();
    await page.locator('[data-action=saveData]').click();await page.locator('#close-sheet.sheet-back').waitFor();
    await check('save-rescue','#sheet',['#save-rescue-import','#save-rescue-export','[data-rescue-restore]','#close-sheet.sheet-back']);
    assert.equal(await page.locator('#close-sheet.sheet-back').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    assert.equal(await page.locator('#save-rescue-export svg').count(),1);assert.equal(await page.locator('#save-rescue-back').count(),0);
    assert.equal(await page.locator('#sheet-title').textContent(),await page.evaluate(async()=>(await import('./src/i18n/index.js')).tr('ゲーム内セーブ・保存履歴')));
    await page.locator('[data-rescue-restore]').click();await page.locator('#save-rescue-cancel').click();await page.locator('#close-sheet.sheet-back').click();
    await page.locator('[data-action=cover]').click();await check('cover-back','#sheet',['[data-action=cover-local]','#close-sheet.sheet-back']);
    const art=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,600,400);g.addColorStop(0,'#25bdc4');g.addColorStop(1,'#803aba');x.fillStyle=g;x.fillRect(0,0,600,400);x.fillStyle='#ffcb52';x.beginPath();x.arc(300,200,100,0,Math.PI*2);x.fill();return c.toDataURL('image/png').split(',')[1];}),'base64');
    const chooser=page.waitForEvent('filechooser');await page.locator('[data-action=cover-local]').click();await(await chooser).setFiles({name:'Synthetic artwork.png',mimeType:'image/png',buffer:art});
    await page.waitForFunction(()=>!document.querySelector('#cover-crop-save').disabled);await check('cover-crop','#sheet',['#cover-crop-save','#cover-crop-cancel']);
    assert.equal(await page.locator('#cover-crop-canvas').evaluate(el=>getComputedStyle(el).touchAction),'none');
    await page.locator('#cover-crop-cancel').click();await page.locator('#close-sheet.sheet-back').click();
    await page.locator('#game-info-button').click();await check('game-info-back','#sheet',['#close-sheet.sheet-back']);await page.locator('#close-sheet.sheet-back').click();assert.equal(await page.locator('#close-sheet.sheet-back').count(),0);await page.locator('#close-sheet').click();
    await page.locator('[data-tab=settings]').click();
    assert.equal(await page.locator('#content').innerText().then(text=>text.includes('ゲームで変更した項目には、そのゲームの個別設定を使います。')),false);
    await page.locator('#content [data-action=saveHelp]').click();await check('save-help','#sheet',['#close-sheet']);assert.equal(await page.locator('#sheet-body').innerText().then(text=>text.includes('mGBA')),false);await page.locator('#close-sheet').click();
    await page.locator('#content [data-action=diagnostics]').click();await check('diagnostics','#sheet',['#diagnostics-export','#performance-clear','#close-sheet']);assert.equal(await page.locator('#diagnostics-clear.destructive').count(),1);assert.equal(await page.locator('#performance-clear.destructive').count(),1);await page.locator('#close-sheet').click();
    await page.locator('#content [data-action=backup]').click();await page.waitForFunction(()=>!document.querySelector('#backup-export').disabled);
    await page.locator('#backup-export-options > summary').click();await check('backup-save','#sheet',['#backup-mode-save','#backup-mode-restore','#backup-latest','[data-backup-export-game]','#backup-export']);
    await page.locator('#backup-export').click();await page.locator('.file-export').waitFor();await check('file-export','.file-export',['[data-export-save]','[data-export-share]','[data-export-close]']);
    await page.locator('[data-export-save]').click();await page.waitForFunction(()=>fixtureExports.length>0&&!document.querySelector('[data-export-close]').disabled);await page.locator('[data-export-close]').click();await page.waitForFunction(()=>!document.querySelector('#backup-mode-restore').disabled);
    const archive=await page.evaluate(()=>fixtureExports.pop());assert.ok(JSON.parse(archive));
    await page.locator('#backup-mode-restore').click();await check('backup-select','#sheet',['#backup-mode-save','label[for=backup-import]']);
    await page.locator('#backup-import').setInputFiles({name:'synthetic-layout-backup.json',mimeType:'application/json',buffer:Buffer.from(archive)});await page.locator('#backup-confirm').waitFor();
    await page.locator('#backup-preview details > summary').first().click();await check('backup-restore','#sheet',['#backup-select-all','[data-backup-game]','#backup-settings','#backup-confirm']);await page.locator('#close-sheet').click();
    await page.locator('#content [data-action=offline]').click();await page.waitForFunction(()=>!document.querySelector('#offline-download').disabled);
    await page.locator('#sheet-body details > summary').click();await check('offline-needed','#sheet',['#offline-download','#offline-all']);
    await page.locator('#offline-download').click();await page.waitForFunction(()=>document.querySelector('#offline-download').disabled&&!document.querySelector('#offline-all').disabled);await check('offline-ready','#sheet',['#offline-all','#close-sheet']);
    assert.deepEqual(await page.evaluate(()=>fixtureOfflineSelection.cores),['mgba']);await page.locator('#close-sheet').click();
    console.log('PASS '+engine+' '+prefix+': imports/game/backup/export/offline layout and accessible controls');
   }
   assert.deepEqual(errors,[],code+' page errors');await context.close();
  }
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({engine,offlineStatus:'mocked transport',screens:report},null,2));
  console.log('PASS '+engine+': '+report.length+' screenshots in '+output);
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
