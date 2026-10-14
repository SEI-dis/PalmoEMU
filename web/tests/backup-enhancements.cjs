// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic local data only, isolated browser storage, no ROM or save uploads.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const engine=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{
 const browser=await runtime[engine].launch({headless:true,...(engine==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage();await page.goto(base);await page.locator('#add-first').waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
  const fixture=await page.evaluate(async()=>{
   window.db=await import('./src/storage/storage.js');window.backup=await import('./src/storage/backup.js');window.trainer=await import('./src/library/trainer-profile.js');window.digest=(await import('./src/shared.js')).hash;
   window.a='a'.repeat(64);window.b='b'.repeat(64);window.c='c'.repeat(64);const at=1720000000000;
   window.record=async(n,size=4,time=at)=>{const bytes=new Uint8Array(size).fill(n);return {bytes,hash:await digest(bytes),at:time,coreId:'mgba-rom64-save6-v2'};};
   await db.addGame({id:a,system:'gba',size:8,name:'Old game',added:at,playDuration:1000,lastPlayed:at},new Uint8Array(8));
   await db.addGame({id:b,system:'gba',size:9,name:'Updated game',added:at+1,playDuration:2000,lastPlayed:at+1,romUpdate:{previousId:a,previousName:'Old game',coreKey:'mgba',at:at+1,migration:{kind:'start',from:'0.18',to:'0.42.3'}}},new Uint8Array(9));
   await db.addGame({id:c,system:'gb',size:10,name:'Unselected game',added:at+2,playDuration:3000},new Uint8Array(10));
   await db.saveTrainerNickname('My trainer');
   await db.put('saves',b,await record(1));await db.put('saves',c,await record(8));
   await db.put('states',b+':one',{...await record(2),save:null,saveHash:null});await db.put('states',b+':two',{...await record(3),save:null,saveHash:null});
   await db.put('archives',b,await Promise.all([4,5,6].map((n,i)=>record(n,4,at+i))));
   await db.put('coverCatalogs',db.romUpdateMetadataPrefix+b,{sourceId:a,targetId:b,sourceName:'Old game',system:'gba',coreKey:'mgba',save:await record(7),at:at+1});
   window.original=await backup.createBackup({theme:'dark',keepScreenAwake:true,measurePerformance:false},{gameIds:[b]});
   window.partsPlan=await backup.prepareBackupExport({theme:'dark'},{gameIds:[b],partBytes:8});window.parts=[];for(const part of partsPlan.parts)parts.push(await backup.createBackupPart(partsPlan,part.index));
   return {archive:original.archive,parts:parts.map(part=>part.archive),plan:partsPlan};
  });
  assert.equal(fixture.archive.version,2);assert.equal(fixture.archive.profile.nickname,'My trainer');assert.deepEqual(fixture.archive.playRecords.map(record=>record.id),['a'.repeat(64),'b'.repeat(64)]);assert.equal(fixture.archive.games.length,1);assert.equal(fixture.archive.games[0].playDuration,2000);assert.equal(fixture.archive.games[0].romUpdate.previousId,'a'.repeat(64));assert.equal(fixture.archive.records.find(record=>record.store==='rom-updates').value.bytes,'BwcHBw==');
  assert.equal(fixture.parts.length,4);assert.ok(fixture.plan.parts.every(part=>part.bytes<=8));assert.deepEqual(fixture.parts.map(part=>part.part.index),[1,2,3,4]);assert.ok(fixture.parts.every(part=>part.part.count===4&&part.part.id===fixture.plan.id));
  const restored=await page.evaluate(async()=>{
   await db.put('saves',b,await record(91));await db.put('archives',b,[await record(92,4,1720000000090)]);await db.put('states',b+':unrelated',{...await record(93),save:null,saveHash:null});
   await db.put('library',b,{...await db.get('library',b),playDuration:500});await db.put('coverCatalogs',trainer.playRecordPrefix+b,{...original.archive.playRecords.find(record=>record.id===b),playDuration:500});await db.saveTrainerNickname('Current trainer');
   await db.put('coverCatalogs',db.romUpdateMetadataPrefix+b,{sourceId:a,targetId:b,sourceName:'Old game',system:'gba',coreKey:'mgba',save:await record(94),at:1720000000001});
   const before=await backup.createBackup({theme:'light'});window.before=before;
   // Parts can arrive in any order. Restoring a part twice must not double time.
   const reverse=[...parts].reverse();await backup.restoreBackup(await backup.inspectBackup(reverse[0].text),{includeProfile:true});await backup.restoreBackup(await backup.inspectBackup(reverse[0].text),{includeProfile:true});for(const part of reverse.slice(1))await backup.restoreBackup(await backup.inspectBackup(part.text),{includeProfile:true});
   const previous=await backup.previousBackup(),card=await db.trainerCard();window.previous=previous;
   return {save:[...(await db.get('saves',b)).bytes],archives:(await db.get('archives',b)).map(value=>value.bytes[0]).sort((a,b)=>a-b),states:(await db.stateEntries(b)).map(row=>row.key),stats:trainer.trainerStats(card.records,card.games),nickname:card.profile.nickname,duration:(await db.get('library',b)).playDuration,rollbackSave:previous.archive.records.find(record=>record.store==='saves'&&record.key===b).value.bytes,rollbackProfile:previous.archive.profile.nickname,rollbackStates:previous.archive.records.filter(record=>record.store==='states').map(record=>record.key),rollbackUpdate:previous.archive.records.find(record=>record.store==='rom-updates').value.bytes,updateSave:[...(await db.get('coverCatalogs',db.romUpdateMetadataPrefix+b)).save.bytes]};
  });
  assert.deepEqual(restored.save,[1,1,1,1]);assert.deepEqual(restored.archives,[4,5,6,92]);assert.equal(restored.states.length,3);assert.equal(restored.nickname,'My trainer');assert.equal(restored.duration,2000);assert.equal(restored.stats.total,6000);assert.equal(restored.stats.rankings.find(game=>game.id==='b'.repeat(64)).playDuration,3000);assert.equal(restored.rollbackSave,'W1tbWw==');assert.equal(restored.rollbackProfile,'Current trainer');assert.equal(restored.rollbackStates.length,3);assert.equal(restored.rollbackUpdate,'Xl5eXg==');assert.deepEqual(restored.updateSave,[7,7,7,7]);
  const reapply=await page.evaluate(async()=>{
   await db.put('saves',b,await record(95));await backup.restoreBackup(await backup.inspectBackup(parts[0].text));const afterComplete=await backup.previousBackup();
   await db.put('saves',b,await record(96));await backup.restoreBackup(await backup.inspectBackup(parts[1].text));const afterPlay=await backup.previousBackup();
   return {completed:afterComplete.archive.records.find(record=>record.store==='saves'&&record.key===b).value.bytes,interrupted:afterPlay.archive.records.find(record=>record.store==='saves'&&record.key===b).value.bytes};
  });assert.deepEqual(reapply,{completed:'X19fXw==',interrupted:'YGBgYA=='});
  const editedMetadata=await page.evaluate(async()=>{
   await backup.restoreBackup(await backup.inspectBackup(parts[0].text),{includeSettings:true,includeProfile:true});
   await db.saveTrainerNickname('Edited trainer');localStorage.setItem('manic-settings',JSON.stringify({theme:'light',volume:.37}));
   const key=trainer.playRecordPrefix+c;await db.put('coverCatalogs',key,{...await db.get('coverCatalogs',key),playDuration:8000});
   await backup.restoreBackup(await backup.inspectBackup(parts[1].text),{includeSettings:true,includeProfile:true});
   const previous=await backup.previousBackup();return {nickname:previous.archive.profile.nickname,volume:previous.archive.settings.volume,independentTime:previous.archive.playRecords.find(record=>record.id===c).playDuration};
  });assert.deepEqual(editedMetadata,{nickname:'Edited trainer',volume:.37,independentTime:8000});
  await page.evaluate(async()=>{await db.put('saves',b,await record(1));});
  assert.deepEqual(await page.evaluate(async()=>{
   const latest=await backup.createBackup({},{gameIds:[b],latestOnly:true}),plan=await backup.inspectBackup(latest.text);await db.put('saves',b,await record(9));const before=await db.stateEntries(b);await backup.restoreBackup(plan);return {stores:latest.archive.records.map(record=>record.store),statesUnchanged:JSON.stringify(before)===JSON.stringify(await db.stateEntries(b)),save:[...(await db.get('saves',b)).bytes],merge:plan.merge};
  }),{stores:['saves'],statesUnchanged:true,save:[1,1,1,1],merge:true});
  assert.equal(await page.evaluate(async()=>{const plan=await backup.prepareBackupExport({},{gameIds:[b],partBytes:8});await db.put('saves',b,await record(77));try{await backup.createBackupPart(plan,1);return false;}catch(e){return /保存データが変わりました/.test(e.message);}}),true,'A stale staged export is rejected before a mixed-time file is produced');
  // Malformed metadata never reaches storage. Corrupt rollback data is checked too.
  assert.equal(await page.evaluate(async()=>{
   const cases=[data=>data.profile.nickname='x'.repeat(31),data=>data.profile.avatar='https://example.invalid/avatar',data=>data.playRecords.push(data.playRecords[0]),data=>data.playRecords[0].playDuration=-1,data=>data.playRecords[0].previousIds=['../bad'],data=>data.games[0].romUpdate.previousId=data.games[0].id,data=>data.records.find(record=>record.store==='rom-updates').value.hash='f'.repeat(64),data=>data.part={id:'bad',index:1,count:2}];
   for(const change of cases){const data=structuredClone(original.archive);change(data);try{await backup.inspectBackup(JSON.stringify(data));return false;}catch{}}return true;
  }),true);
  const v1=await page.evaluate(async()=>{const archive=structuredClone(original.archive);archive.version=1;delete archive.profile;delete archive.playRecords;for(const game of archive.games)for(const field of ['added','lastPlayed','updatedAt','playDuration','romUpdate'])delete game[field];archive.records=archive.records.filter(record=>record.store!=='rom-updates');const plan=await backup.inspectBackup(JSON.stringify(archive));await backup.restoreBackup(plan);return {matched:plan.matched,nickname:(await db.trainerCard()).profile.nickname,duration:(await db.get('library',b)).playDuration,updateRetained:await db.has('coverCatalogs',db.romUpdateMetadataPrefix+b)};});assert.deepEqual(v1,{matched:1,nickname:'My trainer',duration:2000,updateRetained:true});
  await page.evaluate(async()=>{window.downloads=[];const {createBackupView}=await import('./src/views/backup.js');createBackupView({settings:{theme:'dark'},sheet(title,body){document.querySelector('#sheet-title').textContent=title;document.querySelector('#sheet-body').innerHTML=body;document.querySelector('#sheet').showModal();},download(bytes,name){downloads.push({archive:JSON.parse(new TextDecoder().decode(bytes)),name});},toast(){},onRestored(){}})();});
  await page.waitForFunction(()=>document.querySelectorAll('[data-backup-export-game]').length===3);await page.locator('#backup-export-options summary').click();await page.locator('[data-backup-export-game="'+'a'.repeat(64)+'"]').uncheck();await page.locator('[data-backup-export-game="'+'c'.repeat(64)+'"]').uncheck();await page.locator('#backup-latest').check();await page.locator('#backup-export').click();await page.waitForFunction(()=>downloads.length===1);
  assert.deepEqual(await page.evaluate(()=>({games:downloads[0].archive.games.map(game=>game.id),stores:downloads[0].archive.records.map(record=>record.store),latest:downloads[0].archive.latestOnly})),{games:['b'.repeat(64)],stores:['saves'],latest:true});await page.locator('#close-sheet').click();
  // A real >128 MiB set is exported in bounded parts; records are not truncated.
  const big=await page.evaluate(async()=>{
   for(let i=0;i<5;i++)await db.put('states',b+':large-'+i,{...await record(100+i,27*1048576),save:null,saveHash:null});
   const prepared=await backup.prepareBackupExport({},{gameIds:[b]});let total=0,max=0,count=0;
   for(const part of prepared.parts){const exported=await backup.createBackupPart(prepared,part.index);total+=exported.summary.bytes;max=Math.max(max,exported.summary.bytes);count+=exported.archive.records.filter(record=>record.key.includes(':large-')).length;}
   return {total,max,count,parts:prepared.parts.length};
  });assert.ok(big.total>128*1048576);assert.ok(big.max<=64*1048576);assert.equal(big.count,5);assert.ok(big.parts>=3);
  const retained=await page.evaluate(async()=>{
   for(let i=0;i<5;i++)await db.remove('states',b+':large-'+i);
   const checkpoint=async(n,at)=>({...await record(n,25*1048576,at),save:null,saveHash:null});
   await db.put('recoveries',b,[await checkpoint(82,1720000000082),await checkpoint(81,1720000000081)]);
   const planned=await backup.prepareBackupExport({},{gameIds:[b],partBytes:32*1048576}),chunks=[];
   for(const part of planned.parts){const output=await backup.createBackupPart(planned,part.index);if(output.archive.records.some(row=>row.store==='recoveries'))chunks.push(output.text);}
   await db.put('recoveries',b,[await checkpoint(72,1720000000072),await checkpoint(71,1720000000071)]);
   for(const text of chunks)await backup.restoreBackup(await backup.inspectBackup(text));
   const history=await db.get('recoveries',b),before=await db.readPreviousBackup({summary:true});
   return {count:history.length,bytes:history.reduce((n,item)=>n+item.bytes.length,0),values:history.map(item=>item.bytes[0]),priorCount:before.records.find(row=>row.store==='recoveries').value.length};
  });assert.deepEqual(retained,{count:3,bytes:75*1048576,values:[82,81,72],priorCount:2});
  console.log(`PASS ${engine}: v2 trainer/profile/ROM-update rollback saves, selected/latest exports, >128 MiB bounded parts, idempotent/time-safe split restore, 96 MiB history bound, fresh rollback after play, stale export rejection, malformed metadata and v1 compatibility`);await context.close();
 }finally{await browser.close();}
})().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
