// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic browser storage only. Never opens a user's game or site storage.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs'),{keySaveGB}=require('./mgba-save-completion.cjs');
const engine=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{
 const browser=await runtime[engine].launch({headless:true,...(engine==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage();await page.goto(base);await page.locator('#add-first').waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
  const fixture=await page.evaluate(async()=>{
   window.db=await import('./src/storage/storage.js');window.rescue=await import('./src/storage/save-rescue.js');window.backup=await import('./src/storage/backup.js');const {hash}=await import('./src/shared.js');
   const bytes=new Uint8Array([1,2,3]);window.game={id:await hash(bytes),name:'Rescue fixture',system:'gba',size:bytes.length};await db.addGame(game,bytes);
   window.save=async(n,at)=>({bytes:new Uint8Array([n,n+1,n+2]),hash:await hash(new Uint8Array([n,n+1,n+2])),at,coreId:'mgba-rom64-save6-v2'});
   window.original={...await save(10,100),hash:'0'.repeat(64)};await db.put('saves',game.id,original);
   const legacy=await save(20,200);delete legacy.hash;const wrongCore={...await save(21,201),coreId:'fceumm-web-v1'};
   window.good=await save(30,300);window.bad={...await save(40,400),hash:'1'.repeat(64)};
   await db.put('backups',game.id,[bad,good,legacy,wrongCore]);await db.put('archives',game.id,[await save(50,500)]);
   const paired=await save(60,600);await db.put('recoveries',game.id,[{bytes:new Uint8Array([5]),hash:'invalid-state-hash',at:600,coreId:paired.coreId,save:paired.bytes,saveHash:paired.hash}]);
   const manual=await save(65,650);await db.put('states',game.id+':manual',{bytes:new Uint8Array([6]),hash:'invalid-state-hash',at:650,coreId:manual.coreId,save:manual.bytes,saveHash:manual.hash});
   await db.put('sessions',game.id,{id:'old-writer',dirty:true});
   window.plan=await rescue.inspectSaveRescue(game);window.snapshot=async()=>({save:await db.get('saves',game.id),recent:await db.get('backups',game.id),archives:await db.get('archives',game.id),recoveries:await db.get('recoveries',game.id),session:await db.get('sessions',game.id),originals:await db.saveRescueOriginals(game.id,'mgba')});
   return {id:game.id,current:plan.current.status,states:plan.entries.map(r=>r.status),raw:[...(await rescue.exportRescueOriginal(plan)).bytes]};
  });
  assert.equal(fixture.current,'damaged');assert.deepEqual(fixture.states,['damaged','valid','unverified','unsupported','valid','valid','valid']);assert.deepEqual(fixture.raw,[10,11,12]);
  assert.deepEqual(await page.evaluate(async()=>{const before=await snapshot();let rejected=0;for(const i of [-1,0,2,3,999])try{await rescue.restoreSaveHistory(plan,i);}catch{rejected++;}return {rejected,same:JSON.stringify(before)===JSON.stringify(await snapshot())};}),{rejected:5,same:true});
  // A selected healthy game remains exportable when another game's save fails
  // integrity. Full export must continue rejecting, not omit broken bytes.
  assert.deepEqual(await page.evaluate(async()=>{
   const {hash}=await import('./src/shared.js'),rom=new Uint8Array([4,5,6]);window.healthy={id:await hash(rom),name:'Healthy',system:'gba',size:rom.length};await db.addGame(healthy,rom);await db.put('saves',healthy.id,await save(70,700));
   let fullRejected=false;try{await backup.createBackup({});}catch{fullRejected=true;}
   const result=await backup.createBackup({},{gameIds:[healthy.id]});return {fullRejected,games:result.archive.games.map(g=>g.id),expected:healthy.id};
  }),{fullRejected:true,games:[await page.evaluate(()=>healthy.id)],expected:await page.evaluate(()=>healthy.id)});
  // Active game lock refuses recovery before writing anything.
  const other=await context.newPage();await other.goto(base);await other.evaluate(id=>{window.lockTask=navigator.locks.request('local-game:'+id,async()=>{window.held=true;await new Promise(resolve=>window.release=resolve);});},fixture.id);await other.waitForFunction(()=>window.held);
  assert.equal(await page.evaluate(async()=>{const before=await snapshot();let blocked=false;try{await rescue.restoreSaveHistory(plan,1);}catch(e){blocked=/プレイ中/.test(e.message);}return blocked&&JSON.stringify(before)===JSON.stringify(await snapshot());}),true);
  await other.evaluate(async()=>{release();await lockTask;});await other.close();
  // Quota failure during original quarantine aborts replacement and session.
  assert.deepEqual(await page.evaluate(async()=>{
   const before=await snapshot(),add=IDBObjectStore.prototype.add;let injected=false,rejected=false;
   IDBObjectStore.prototype.add=function(...args){if(this.name==='coverCatalogs'&&String(args[1]).startsWith(db.saveRescuePrefix)){injected=true;throw new DOMException('synthetic quota','QuotaExceededError');}return add.apply(this,args);};
   try{await rescue.restoreSaveHistory(plan,1);}catch{rejected=true;}finally{IDBObjectStore.prototype.add=add;}
   return {injected,rejected,same:JSON.stringify(before)===JSON.stringify(await snapshot())};
  }),{injected:true,rejected:true,same:true});
  // Preview staleness: reject both current-save changes and selected history.
  assert.equal(await page.evaluate(async()=>{
   const before=await snapshot();await db.put('saves',game.id,{...original,bytes:new Uint8Array([9,9,9])});let a=false,b=false;
   try{await rescue.restoreSaveHistory(plan,1);}catch(e){a=/現在のセーブが変わ/.test(e.message);}await db.put('saves',game.id,original);
   const changed=[...before.recent];changed[1]=await save(31,301);await db.put('backups',game.id,changed);
   try{await rescue.restoreSaveHistory(plan,1);}catch(e){b=/保存履歴が変わ/.test(e.message);}await db.put('backups',game.id,before.recent);
   return a&&b&&JSON.stringify(before)===JSON.stringify(await snapshot());
  }),true);
  // Exact transaction comparisons are still required after hashing; metadata
  // alone must not permit another tab's changed bytes to be overwritten.
  assert.equal(await page.evaluate(async()=>{
   const before=await snapshot();let a=false,b=false;
   try{await db.commitSaveRescue({game,original:{...original,bytes:new Uint8Array([1,1,1])},source:plan.entries[1],record:good,save:good});}catch{a=true;}
   try{await db.commitSaveRescue({game,original,source:plan.entries[1],record:{...good,bytes:new Uint8Array([2,2,2])},save:good});}catch{b=true;}
   return a&&b&&JSON.stringify(before)===JSON.stringify(await snapshot());
  }),true);
  const restored=await page.evaluate(async()=>{
   const before=await snapshot();await rescue.restoreSaveHistory(plan,1);const after=await snapshot(),newPlan=await rescue.inspectSaveRescue(game),raw=await rescue.exportRescueOriginal(newPlan,newPlan.originals[0].key),stored=await db.get('coverCatalogs',newPlan.originals[0].key);
   let fenced=false;try{await db.commitProtection(game.id,'old-writer',await save(99,999),null);}catch{fenced=true;}
   const latest=await backup.createBackup({},{gameIds:[game.id],latestOnly:true});
   return {status:newPlan.current.status,bytes:[...after.save.bytes],dirty:after.session.dirty,raw:[...raw.bytes],originalHash:stored.save.hash,originalTime:stored.save.at,originalCount:newPlan.originals.length,fenced,historiesSame:['recent','archives','recoveries'].every(key=>JSON.stringify(before[key])===JSON.stringify(after[key])),latestRecords:latest.archive.records.map(r=>r.store)};
  });
  assert.deepEqual(restored,{status:'valid',bytes:[30,31,32],dirty:false,raw:[10,11,12],originalHash:'0'.repeat(64),originalTime:100,originalCount:1,fenced:true,historiesSame:true,latestRecords:['saves']});
  // Battery from an automatic state can be rescued independently of a broken
  // state payload. Loading the broken state itself is never attempted.
  assert.deepEqual(await page.evaluate(async()=>{const plan=await rescue.inspectSaveRescue(game);await rescue.restoreSaveHistory(plan,plan.entries.findIndex(r=>r.store==='recoveries'));return {bytes:[...(await db.get('saves',game.id)).bytes],originals:(await db.saveRescueOriginals(game.id,'mgba')).length};}),{bytes:[60,61,62],originals:2});
  assert.deepEqual(await page.evaluate(async()=>{const plan=await rescue.inspectSaveRescue(game);await rescue.restoreSaveHistory(plan,plan.entries.findIndex(r=>r.store==='states'));return {bytes:[...(await db.get('saves',game.id)).bytes],originals:(await db.saveRescueOriginals(game.id,'mgba')).length};}),{bytes:[65,66,67],originals:3});
  // The real pre-launch detail has the recovery entry. No emulator is loaded.
  await page.evaluate(async()=>{
   const {createGameInfo}=await import('./src/views/game-info.js');window.downloads=[];window.launches=0;
   const api={sheet(title,body){const dialog=document.querySelector('#sheet');if(dialog.open)dialog.close();dialog.classList.remove('port-menu','states-view','save-data','native-menu','game-info');document.querySelector('#sheet-cover').hidden=true;document.querySelector('#sheet-tools').replaceChildren();document.querySelector('#sheet-title').textContent=title;document.querySelector('#sheet-body').innerHTML=body;dialog.showModal();dialog.scrollTop=0;},settings:()=>({}),controlCells:()=>({}),bindSettings(){},download(bytes,name){downloads.push({name,bytes:[...bytes]});},refresh:async()=>{},toast(){},launch(){launches++;},error(error){throw error;}};
   window.info=createGameInfo(api);info.show(game);
  });
  await page.locator('[data-action="saveData"]').click();await page.locator('#save-rescue-export').waitFor();assert.equal(await page.locator('[data-rescue-restore]:disabled').count(),3);
  await page.locator('#save-rescue-export').click();await page.waitForFunction(()=>downloads.length===1);assert.deepEqual(await page.evaluate(()=>downloads[0]),{name:'Rescue fixture.sav',bytes:[65,66,67]});
  await page.locator('[data-rescue-restore="1"]').click();await page.locator('#save-rescue-confirm').click();await page.locator('#save-rescue-export').waitFor();assert.equal(await page.evaluate(()=>launches),0);assert.deepEqual(await page.evaluate(async()=>[...(await db.get('saves',game.id)).bytes]),[30,31,32]);
  await page.screenshot({path:`web/test-results/save-rescue-${engine}-390.png`});
  // A known damaged save must not be silently exported under the normal name.
  await page.evaluate(async()=>{await db.put('saves',game.id,original);info.show(game);});await page.locator('[data-action="saveData"]').click();await page.locator('#save-rescue-export').waitFor();assert.equal(await page.evaluate(()=>downloads.length),1);assert.match(await page.locator('#sheet-body').innerText(),/破損が見つかりました/);await page.locator('#save-rescue-export').click();await page.waitForFunction(()=>downloads.length===2);assert.deepEqual(await page.evaluate(()=>downloads[1]),{name:'Rescue fixture-original-100.sav',bytes:[10,11,12]},'Damaged originals remain exportable under a distinct name');
  // An incompatible core record can also carry a bad hash. The status is
  // unsupported, but its original bytes must still be exportable for rescue.
  assert.equal(await page.evaluate(async()=>{await db.put('saves',game.id,{...original,coreId:'fceumm-web-v1'});info.show(game);return (await rescue.inspectSaveRescue(game)).current.status;}),'unsupported');await page.locator('[data-action=saveData]').click();await page.locator('#save-rescue-export').waitFor();assert.match(await page.locator('#sheet-body').innerText(),/このコアでは復元できません/);
  await page.locator('#save-rescue-export').click();await page.waitForFunction(()=>downloads.length===3);assert.deepEqual(await page.evaluate(()=>downloads[2]),{name:'Rescue fixture-original-100.sav',bytes:[10,11,12]},'Unsupported records with invalid hashes keep their original filename and bytes');
  assert.equal(await page.evaluate(async()=>{await db.removeGame(game.id);return (await db.saveRescueOriginals(game.id,'mgba')).length===0&&await db.has('saves',healthy.id);}),true,'Explicit game deletion removes its quarantined originals only');
  await context.close();
  // Exercise the actual app launch/catch/cleanup path with an authored ROM.
  // Returning false must not let a pre-launch state dialog close the new rescue.
  const native=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),live=await native.newPage(),errors=[];live.on('pageerror',error=>errors.push(error.message));
  await native.addInitScript(()=>localStorage.setItem('manic-settings',JSON.stringify({autosave:false,recovery:false})));
  await live.goto(base);await live.locator('#add-first').waitFor();if(await live.locator('#sheet').isVisible())await live.locator('#close-sheet').click();await live.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
  await live.evaluate(async()=>{const {MGBACore}=await import('./src/core/mgba.js'),load=MGBACore.prototype.load;MGBACore.prototype.load=async function(...args){window.rescueCore=this;return load.apply(this,args);};});
  await live.locator('#rom-input').setInputFiles({name:'Rescue boot.gb',mimeType:'application/octet-stream',buffer:Buffer.from(keySaveGB())});await live.locator('.game-launch').waitFor();
  await live.evaluate(async()=>{
   window.db=await import('./src/storage/storage.js');const {hash}=await import('./src/shared.js');window.game=(await db.all('library'))[0];const bytes=new Uint8Array(8192);bytes[0]=0x71;
   window.good={bytes,hash:await hash(bytes),at:12345,coreId:'mgba-rom64-save6-v2'};window.damaged={...good,hash:'0'.repeat(64)};await db.put('saves',game.id,damaged);await db.put('backups',game.id,[good]);
   // State payload is never loaded: corruption must stop battery bootstrap first.
   const state=new Uint8Array([1]);await db.put('states',game.id+':fixture',{bytes:state,hash:await hash(state),at:12346,coreId:good.coreId,save:good.bytes,saveHash:good.hash});
  });
  await live.locator('.game-launch').click();await live.locator('.game-info-play').click();await live.locator('#save-rescue-export').waitFor();
  assert.equal(await live.locator('#player').isVisible(),false);assert.equal(await live.evaluate(()=>rescueCore.closed),true);
  assert.equal(await live.evaluate(async()=>navigator.locks.request('local-game:'+game.id,{ifAvailable:true},lock=>!!lock)),true,'Startup failure releases the game lock before showing rescue');
  assert.match(await live.locator('#sheet-body').innerText(),/起動を中止/);
  await live.locator('#close-sheet.sheet-back').click();await live.locator('[data-action="states"]').click();await live.locator('[data-slot-load]').first().click();await live.locator('#save-rescue-export').waitFor();
  assert.equal(await live.locator('#sheet').isVisible(),true,'Failed state bootstrap retains the newly opened rescue view');
  await live.locator('[data-rescue-restore="0"]').click();await live.keyboard.press('Escape');await live.locator('#save-rescue-export').waitFor();
  assert.equal(await live.locator('#sheet-title').textContent(),'ゲーム内セーブ・保存履歴','Back from confirmation returns to the history, not the game details');
  assert.equal(await live.evaluate(async()=>(await db.get('saves',game.id)).hash), '0'.repeat(64),'Back never applies the selected restoration');
  await live.locator('[data-rescue-restore="0"]').click();await live.locator('#save-rescue-confirm').click();await live.locator('#close-sheet.sheet-back').waitFor();await live.locator('#close-sheet.sheet-back').click();await live.locator('.game-info-play').click();await live.locator('#loading').waitFor({state:'hidden'});
  assert.equal(await live.evaluate(()=>rescueCore.save()[0]),0x71,'Verified history boots successfully after rescue');
  await live.locator('#player-menu').click();await live.locator('[data-action="exit"]').first().click();await live.locator('#player').waitFor({state:'hidden'});assert.deepEqual(errors,[]);await native.close();
  console.log(`PASS ${engine}: pre-launch save recovery, verified histories, unchanged corrupt-original export/quarantine, selected healthy backup, locks, stale previews, writer fencing, atomic rollback, mobile UI and actual failed-launch/state bootstrap recovery`);
 }finally{await browser.close();}
})().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
