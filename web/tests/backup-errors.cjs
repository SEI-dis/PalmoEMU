// SPDX-License-Identifier: AGPL-3.0-or-later
// Game-specific backup errors remain local UI data, never diagnostic payloads.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const engine=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{
 const browser=await runtime[engine].launch({headless:true,...(engine==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage();await page.goto(base);await page.locator('#add-first').waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
  const data=await page.evaluate(async()=>{
   window.db=await import('./src/storage/storage.js');window.backup=await import('./src/storage/backup.js');window.diagnostics=(await import('./src/diagnostics.js')).diagnostics;const {hash}=await import('./src/shared.js');
   window.a='a'.repeat(60)+'0001';window.b='a'.repeat(60)+'0002';window.c='c'.repeat(64);window.privateName='<img src=x onerror="window.backupInjected=true"> 同じゲーム';
   window.good=async n=>{const bytes=new Uint8Array([n,n+1]);return {bytes,hash:await hash(bytes),at:1000+n,coreId:'mgba-rom64-save6-v2'};};
   for(const [id,name,n] of [[a,privateName,1],[b,privateName,2],[c,'Healthy local game',3]]){await db.addGame({id,name,system:'gba',size:8},new Uint8Array(8));await db.put('saves',id,await good(n));}
   window.original=await backup.createBackup({});window.snapshot=async()=>JSON.stringify(await db.readBackupData());
   window.failure=async task=>{try{await task();return null;}catch(error){diagnostics.clear();diagnostics.setEnabled(true);diagnostics.record(error,'handled');return {message:error.message,display:backup.backupErrorMessage(error),stack:error.stack||'',properties:JSON.stringify(error),diagnostic:JSON.stringify(diagnostics.snapshot())};}};
   const bad={...await good(1),hash:'0'.repeat(64)};await db.put('saves',a,bad);const before=await snapshot(),direct=await failure(()=>backup.createBackup({})),plan=await backup.prepareBackupExport({},{partBytes:2}),part=await failure(()=>backup.createBackupPart(plan,1));
   const selected=await backup.createBackup({},{gameIds:[c]});return {a,b,c,privateName,direct,part,same:before===await snapshot(),selected:selected.archive.games.map(game=>game.id)};
  });
  function named(error,name,id){assert.ok(error);assert.ok(error.display.includes(name));assert.ok(error.display.includes(id));for(const key of ['message','stack','properties','diagnostic']){assert.ok(!error[key].includes(name),key+' excludes game name');assert.ok(!error[key].includes(id),key+' excludes ROM identity');}}
  named(data.direct,data.privateName,data.a);named(data.part,data.privateName,data.a);assert.equal(data.same,true);assert.deepEqual(data.selected,[data.c]);assert.match(data.direct.display,/検証に失敗/);
  const cores=await page.evaluate(async()=>{
   await db.put('saves',a,await good(1));const game=await db.get('library',b);await db.put('library',b,{...game,coreKey:'unsupported-fixture'});const before=await snapshot(),prepare=await failure(()=>backup.prepareBackupExport({})),direct=await failure(()=>backup.createBackup({}));await db.put('library',b,game);
   const badCore={...await good(2),coreId:'unsupported-fixture'};await db.put('saves',b,badCore);const preparedCore=await failure(()=>backup.prepareBackupExport({})),directCore=await failure(()=>backup.createBackup({}));await db.put('saves',b,await good(2));
   return {prepare,direct,preparedCore,directCore};
  });
  for(const error of Object.values(cores)){named(error,data.privateName,data.b);assert.match(error.display,/コア/);}
  const stale=await page.evaluate(async()=>{const plan=await backup.prepareBackupExport({},{partBytes:2});await db.put('saves',b,await good(20));const result=await failure(()=>backup.createBackupPart(plan,1));await db.put('saves',b,await good(2));return result;});named(stale,data.privateName,data.b);assert.match(stale.display,/保存データが変わりました/);
  const imports=await page.evaluate(async()=>{
   const errors={},before=await snapshot();
   for(const [label,mutate] of [['hash',archive=>archive.records.find(row=>row.key===b).value.hash='0'.repeat(64)],['core',archive=>archive.games.find(row=>row.id===b).coreKey='unsupported-fixture'],['saveCore',archive=>archive.records.find(row=>row.key===b).value.coreId='unsupported-fixture'],['duplicate',archive=>archive.games.push(archive.games.find(row=>row.id===b))]]){
    const archive=structuredClone(original.archive);mutate(archive);errors[label]=await failure(()=>backup.inspectBackup(JSON.stringify(archive)));
   }
   // Foreign backup names never replace the current device's local title.
   const archive=structuredClone(original.archive);archive.playRecords.find(row=>row.id===b).name='Foreign secret title';archive.records.find(row=>row.key===b).value.hash='0'.repeat(64);errors.localName=await failure(()=>backup.inspectBackup(JSON.stringify(archive)));
   const game=await db.get('library',b);await db.remove('library',b);errors.noLocalName=await failure(()=>backup.inspectBackup(JSON.stringify(archive)));await db.put('library',b,game);
   return {errors,same:before===await snapshot()};
  });
  for(const [key,error] of Object.entries(imports.errors)){if(key!=='noLocalName')named(error,data.privateName,data.b);assert.ok(!error.display.includes('Foreign secret title'));}
  assert.ok(imports.errors.noLocalName.display.includes(data.b));assert.ok(!imports.errors.noLocalName.display.includes(data.privateName));assert.equal(imports.same,true);assert.match(imports.errors.hash.display,/ハッシュが一致/);
  // Global format failures do not invent a game association.
  assert.equal(await page.evaluate(async()=>{const error=await failure(()=>backup.inspectBackup('{'));return error.display===error.message;}),true);
  // Real UI uses textContent; names that look like markup remain plain text.
  await page.evaluate(async()=>{
   await db.put('saves',a,{...await good(1),hash:'0'.repeat(64)});window.downloads=[];window.uiBefore=await snapshot();const {createBackupView}=await import('./src/views/backup.js');
   createBackupView({settings:{},sheet(title,body){document.querySelector('#sheet-title').textContent=title;document.querySelector('#sheet-body').innerHTML=body;document.querySelector('#sheet').showModal();},download(bytes,name){downloads.push(name);return 'download';}})();
  });
  await page.locator('#backup-export').click();await page.waitForFunction(()=>document.querySelector('#backup-status').textContent.includes('検証に失敗'));
  assert.ok((await page.locator('#backup-status').textContent()).includes(data.privateName));assert.equal(await page.locator('#backup-status img').count(),0);assert.equal(await page.evaluate(()=>!!window.backupInjected),false);assert.equal(await page.evaluate(()=>downloads.length),0);assert.equal(await page.evaluate(async()=>uiBefore===await snapshot()),true);
  await page.locator('#backup-export-options summary').click();await page.locator('[data-backup-export-game="'+data.a+'"]').uncheck();await page.locator('[data-backup-export-game="'+data.b+'"]').uncheck();await page.locator('#backup-export').click();await page.waitForFunction(()=>downloads.length===1);assert.equal(await page.evaluate(async()=>uiBefore===await snapshot()),true);
  const invalid=structuredClone(await page.evaluate(()=>original.archive));invalid.records.find(row=>row.key===data.b).value.hash='0'.repeat(64);
  await page.locator('#backup-mode-restore').click();await page.locator('#backup-import').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await page.waitForFunction(()=>document.querySelector('#backup-status').textContent.includes('ハッシュが一致'));
  assert.ok((await page.locator('#backup-status').textContent()).includes(data.privateName));assert.ok((await page.locator('#backup-status').textContent()).includes(data.b));assert.equal(await page.locator('#backup-status img').count(),0);assert.equal(await page.evaluate(async()=>uiBefore===await snapshot()),true);
  console.log(`PASS ${engine}: named export/prepare/part/import failures, strict hash/core rejection, same-title/full-ID disambiguation, safe text UI, diagnostic redaction, selected healthy export and unchanged originals`);await context.close();
 }finally{await browser.close();}
})().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
