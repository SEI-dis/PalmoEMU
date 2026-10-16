// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated synthetic saves only; no user's library or remote service is used.
const assert=require('node:assert/strict'),path=require('node:path'),runtime=require('./browser-runtime.cjs');
const engine=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{
 const browser=await runtime[engine].launch({headless:true,...(engine==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage();await page.goto(base);await page.locator('#add-first').waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
  const fixture=await page.evaluate(async()=>{
   window.db=await import('./src/storage/storage.js');window.backup=await import('./src/storage/backup.js');const {hash}=await import('./src/shared.js');
   const games=[];for(const [n,name] of [[1,'Selected game'],[2,'Unselected game']]){const rom=new Uint8Array([n,0,1]),game={id:await hash(rom),system:'gb',size:rom.length,name,preferences:{speed:n},favorite:false};await db.addGame(game,rom);games.push(game);}
   window.games=games;window.save=async(n,at)=>({bytes:new Uint8Array([n]),hash:await hash(new Uint8Array([n])),at,coreId:'mgba-rom64-save6-v2'});
   for(const [i,game] of games.entries()){await db.put('saves',game.id,await save(i+1,100));await db.put('states',game.id+':original',{...await save(i+3,200),save:null,saveHash:null});await db.put('archives',game.id,[await save(i+5,300)]);}
   // GB/GBC 2P records share their ROM identity and remain portable.
   await db.put('saves',games[0].id+'@link-2p',await save(9,350));
   window.archive=await backup.createBackup({theme:'light',volume:.3});
   for(const [i,game] of games.entries()){await db.put('saves',game.id,await save(i+11,900));await db.put('states',game.id+':newer',{...await save(i+13,1000),save:null,saveHash:null});await db.put('library',game.id,{...game,preferences:{speed:5},favorite:true});}
   localStorage.setItem('manic-settings',JSON.stringify({theme:'dark',volume:.8,unknown:'UNCHANGED',skins:{gb:'local-skin'}}));
   window.snapshot=async()=>({data:await db.readBackupData(),settings:localStorage.getItem('manic-settings')});
   window.before=await snapshot();window.plan=await backup.inspectBackup(archive.text);return {games,text:archive.text,preview:plan.games};
  });
  assert.equal(fixture.preview.length,2);for(const row of fixture.preview){assert.equal(row.currentAt,1000);assert.equal(row.backupAt,row.id===fixture.games[0].id?350:300);assert.equal(row.name,fixture.games.find(g=>g.id===row.id).name);}
  const restored=await page.evaluate(async()=>{
   const result=await backup.restoreBackup(plan,{gameIds:[games[0].id]}),after=await snapshot(),prior=await backup.previousBackup();
   // Cursor callbacks across stores may interleave differently after another
   // game's record count changes. Compare the keyed records, not callback order.
   const pick=(data,id)=>({game:data.games.find(g=>g.id===id),records:data.records.filter(r=>r.key.split(/[@:]/,1)[0]===id).sort((a,b)=>(a.store+':'+a.key).localeCompare(b.store+':'+b.key))});
   return {result,unselectedBefore:pick(before.data,games[1].id),unselectedAfter:pick(after.data,games[1].id),settingsSame:before.settings===after.settings,selectedSave:[...(await db.get('saves',games[0].id)).bytes],selectedNewer:await db.has('states',games[0].id+':newer'),priorGames:prior.archive.games.map(g=>g.id),priorSave:prior.archive.records.find(r=>r.store==='saves'&&r.key===games[0].id).value.bytes,pending:await db.has('coverCatalogs',db.backupMetadataPrefix+'pending')};
  });
  assert.equal(restored.result.games,1);assert.equal(restored.result.settings,null);assert.deepEqual(restored.unselectedAfter,restored.unselectedBefore);assert.equal(restored.settingsSame,true);assert.deepEqual(restored.selectedSave,[1]);assert.equal(restored.selectedNewer,false);assert.deepEqual(restored.priorGames,[fixture.games[0].id]);assert.equal(restored.priorSave,'Cw==');assert.equal(restored.pending,false);
  // An unrelated active game is not locked or changed by a selected restore.
  const other=await context.newPage();await other.goto(base);await other.evaluate(id=>{window.task=navigator.locks.request('local-game:'+id,async()=>{window.held=true;await new Promise(resolve=>window.release=resolve);});},fixture.games[1].id);await other.waitForFunction(()=>window.held);
  assert.deepEqual(await page.evaluate(async()=>{await backup.restoreBackup(await backup.inspectBackup(archive.text),{gameIds:[games[0].id]});const before=await snapshot();let blocked=false;try{await backup.restoreBackup(await backup.inspectBackup(archive.text),{gameIds:[games[1].id]});}catch(e){blocked=/プレイ中/.test(e.message);}return {blocked,unchanged:JSON.stringify(before)===JSON.stringify(await snapshot())};}),{blocked:true,unchanged:true});await other.evaluate(async()=>{release();await task;});await other.close();
  // Detached ROMs retain SHA identities and are still eligible for save restore.
  assert.deepEqual(await page.evaluate(async()=>{await db.put('library',games[0].id,{...await db.get('library',games[0].id),romMissing:true});await db.remove('roms',games[0].id);const plan=await backup.inspectBackup(archive.text);await backup.restoreBackup(plan,{gameIds:[games[0].id]});return {matched:plan.matched,detached:plan.games.find(g=>g.id===games[0].id).romMissing,rom:await db.has('roms',games[0].id),flag:(await db.get('library',games[0].id)).romMissing};}),{matched:2,detached:true,rom:false,flag:true});
  // Only an explicit settings opt-in changes the global preferences.
  assert.deepEqual(await page.evaluate(async()=>{const before=await db.readBackupData();await backup.restoreBackup(await backup.inspectBackup(archive.text),{gameIds:[],includeSettings:true});return {same:JSON.stringify(before)===JSON.stringify(await db.readBackupData()),theme:JSON.parse(localStorage.getItem('manic-settings')).theme,skin:JSON.parse(localStorage.getItem('manic-settings')).skins.gb};}),{same:true,theme:'light',skin:'local-skin'});
  assert.equal(await page.evaluate(async()=>{const plan=await backup.inspectBackup(archive.text),before=await snapshot();for(const gameIds of [[],['f'.repeat(64)],'all']){let rejected=false;try{await backup.restoreBackup(plan,{gameIds});}catch{rejected=true;}if(!rejected)return false;}return JSON.stringify(before)===JSON.stringify(await snapshot());}),true,'Invalid/empty selections never write');
  const rollback=await page.evaluate(async()=>{
   const before=await snapshot(),previous=await backup.previousBackup(),plan=await backup.inspectBackup(archive.text),put=IDBObjectStore.prototype.put;let injected=false,rejected=false;
   IDBObjectStore.prototype.put=function(...args){if(this.name==='states'&&!injected){injected=true;throw new DOMException('synthetic quota','QuotaExceededError');}return put.apply(this,args);};
   try{await backup.restoreBackup(plan,{gameIds:[games[0].id]});}catch{rejected=true;}finally{IDBObjectStore.prototype.put=put;}
   const afterPrevious=await backup.previousBackup();return {injected,rejected,same:JSON.stringify(before)===JSON.stringify(await snapshot()),prior:JSON.stringify(previous.archive.records)===JSON.stringify(afterPrevious.archive.records)};
  });assert.deepEqual(rollback,{injected:true,rejected:true,same:true,prior:true});
  await page.evaluate(async()=>{const {createBackupView}=await import('./src/views/backup.js');window.restored=false;window.uiBefore=JSON.stringify(await db.get('saves',games[1].id));createBackupView({settings:{theme:'light'},sheet(title,body){document.querySelector('#sheet-title').textContent=title;document.querySelector('#sheet-body').innerHTML=body;document.querySelector('#sheet').showModal();},download(){},toast(){},onRestored(result){window.restored=result;}})();});
  await page.locator('#backup-mode-restore').click();await page.locator('#backup-import').setInputFiles({name:'selected.json',mimeType:'application/json',buffer:Buffer.from(fixture.text)});await page.locator('#backup-confirm').waitFor();assert.equal(await page.locator('#backup-settings').isChecked(),false);assert.equal(await page.locator('[data-backup-game]').count(),2);assert.match(await page.locator('#backup-preview').textContent(),/現在：.*ファイル：/s);
  await page.locator('#backup-preview').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR||'web/test-results',`backup-selection-${engine}-390.png`)});
  await page.locator('#backup-select-all').click();assert.equal(await page.locator('#backup-confirm').isDisabled(),true);await page.locator('[data-backup-game="'+fixture.games[0].id+'"]').check();await page.locator('#backup-confirm').click();await page.locator('#backup-reload').waitFor();assert.equal(await page.evaluate(()=>window.restored),false);await page.locator('#backup-reload').click();await page.waitForFunction(()=>window.restored!==false);assert.deepEqual(await page.evaluate(async()=>({games:restored.games,settings:restored.settings,same:uiBefore===JSON.stringify(await db.get('saves',games[1].id))})),{games:1,settings:null,same:true});
  console.log(`PASS ${engine}: selected backup restore, per-game dates, untouched deselected records/settings, GB 2P, detached ROM, selected locks, atomic rollback and explicit selection UI`);await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
