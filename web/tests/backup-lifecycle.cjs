// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const engine=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{
 const browser=await runtime[engine].launch({headless:true,...(engine==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();await page.goto(base);await page.locator('#add-first').waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
  const fixture=await page.evaluate(async()=>{
   window.db=await import('./src/storage/storage.js');window.backup=await import('./src/storage/backup.js');const {hash}=await import('./src/shared.js');window.id='e'.repeat(64);await db.addGame({id,name:'Lifecycle fixture',system:'gba',size:8},new Uint8Array(8));const bytes=new Uint8Array([1,2]);await db.put('saves',id,{bytes,hash:await hash(bytes),at:1000,coreId:'mgba-rom64-save6-v2'});window.original=await backup.createBackup({});
   const imported=await backup.inspectBackup(original.text),prepared=await backup.prepareBackupExport({});backup.releaseBackupPlan(imported);backup.releaseBackupPlan(prepared);
   let importReleased=false,exportReleased=false;try{await backup.restoreBackup(imported);}catch(error){importReleased=/選び直し/.test(error.message);}try{await backup.createBackupPart(prepared,1);}catch(error){exportReleased=/選び直し/.test(error.message);}
   window.done=0;window.closedExport=0;const {createBackupView}=await import('./src/views/backup.js');window.show=createBackupView({settings:{},sheet(title,body){if(window.closeBackup)closeBackup();document.querySelector('#sheet-title').textContent=title;document.querySelector('#sheet-body').innerHTML=body;document.querySelector('#sheet').showModal();},onClose(callback){window.closeBackup=callback;},download:async()=>{window.waitingExport=true;return await new Promise(resolve=>window.finishExport=resolve);},onRestored(){done++;}});show();
   return {text:original.text,importReleased,exportReleased,previous:await backup.hasPreviousBackup()};
  });assert.equal(fixture.importReleased,true);assert.equal(fixture.exportReleased,true);assert.equal(fixture.previous,false);
  await page.locator('#backup-mode-restore').click();assert.equal(await page.locator('#backup-previous').count(),0);assert.equal(await page.locator('#backup-export').count(),0);
  await page.locator('#backup-import').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(fixture.text)});await page.locator('#backup-confirm').waitFor();
  // Hold a detached confirmation handler; disposing the view still invalidates
  // its plan and prevents any later write through that handler.
  await page.evaluate(()=>{window.confirmAgain=document.querySelector('#backup-confirm').onclick;closeBackup();document.querySelector('#sheet').close();});assert.equal(await page.evaluate(async()=>{await confirmAgain();return await backup.hasPreviousBackup();}),false);
  await page.evaluate(()=>show());await page.locator('#backup-mode-restore').click();await page.locator('#backup-import').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(fixture.text)});await page.locator('#backup-confirm').waitFor();await page.locator('#backup-confirm').click();await page.locator('#backup-reload').waitFor();assert.equal(await page.evaluate(()=>done),0);assert.match(await page.locator('#backup-content').textContent(),/復元しました/);await page.locator('#backup-previous').waitFor();
  await page.locator('#backup-reload').click();assert.equal(await page.evaluate(()=>done),1);await page.evaluate(()=>closeBackup());assert.equal(await page.evaluate(()=>done),1,'Completion callback is not invoked twice');
  // Closing a successful completion also reloads, so stale global settings
  // cannot remain active if the user uses the dialog close control instead.
  await page.evaluate(()=>{document.querySelector('#sheet').close();show();});await page.locator('#backup-mode-restore').click();await page.locator('#backup-import').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(fixture.text)});await page.locator('#backup-confirm').click();await page.locator('#backup-reload').waitFor();assert.equal(await page.evaluate(()=>done),1);await page.evaluate(()=>closeBackup());assert.equal(await page.evaluate(()=>done),2);
  console.log(`PASS ${engine}: export/import plan invalidation, staged backup, conditional rollback export, no closed-view writes and persistent completion before explicit reload`);await context.close();
 }finally{await browser.close();}
})().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
