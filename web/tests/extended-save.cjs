// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored flash test only; never reads a user's cartridge or browser profile.
const assert=require('node:assert/strict');
const browserName=process.env.BROWSER_ENGINE||'chromium',browserType=require('./browser-runtime.cjs')[browserName];
(async()=>{
 const browser=await browserType.launch({headless:true,...(browserName==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext(),page=await context.newPage(),base=process.env.TEST_URL||'http://127.0.0.1:4173/';const requests=[],errors=[];
  context.on('request',r=>requests.push(r));page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
  await page.goto(base);
  await page.locator('#rom-input').setInputFiles({name:'Authored-flash.gba',mimeType:'application/octet-stream',buffer:Buffer.from(require('./core-upgrade.cjs').flash(95,true))});
  await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForTimeout(1000);await page.locator('#player-menu').click();
  await page.locator('[data-action=newState]').click();await page.locator('[data-slot-load]').first().waitFor();
  const saved=await page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),[game]=await db.all('library'),[entry]=await db.stateEntries(game.id);const s=entry.value;return {id:game.id,stateBytes:s.bytes.length,saveBytes:s.save.length,first:s.save[0],lastBank:s.save[95*65536],core:s.coreId};});
  assert.ok(saved.stateBytes>22*1048576);assert.equal(saved.saveBytes,6*1048576);assert.equal(saved.first,0x5a);assert.equal(saved.lastBank,0x3c);assert.equal(saved.core,'mgba-rom64-save6-v2');
  await page.locator('[data-slot-load]').first().click();await page.locator('#sheet').waitFor({state:'hidden'});
  await page.locator('#player-menu').click();await page.locator('[data-action=saveData]').click();await page.locator('[data-action=restore]').click();
  const bytes=Buffer.alloc(6*1048576,0xff);bytes[0]=0x41;bytes[bytes.length-1]=0x27;
  await page.locator('#save-input').setInputFiles({name:'Authored-flash.sav',mimeType:'application/octet-stream',buffer:bytes});
  await page.getByText('セーブを読み込みました。ゲームを再起動します。',{exact:true}).waitFor();
  const result=await page.evaluate(async id=>{const db=await import('./src/storage/storage.js'),save=await db.get('saves',id),backups=await db.get('backups',id)||[],states=await db.get('recoveries',id)||[],manual=await db.stateEntries(id);return {length:save.bytes.length,last:save.bytes.at(-1),backup:backups.some(s=>s.bytes.length===6*1048576&&s.bytes[0]===0x5a),recovery:states.some(s=>s.bytes.length>22*1048576),manual:manual.some(s=>s.value.bytes.length>22*1048576)};},saved.id);
  assert.deepEqual(result,{length:6*1048576,last:0x27,backup:true,recovery:false,manual:true});
  assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.method()==='GET'&&!r.postData()&&new URL(r.url()).origin===new URL(base).origin));
  await context.close();console.log('PASS: 6 MiB UI import, manual state, paired recovery, retained battery backup and no uploads.');
  // Five minutes at the app's ten-second save interval. This second context
  // has no app-owned running game, so its timer cannot race these checkpoints.
  // The real core executes authored code in a padded 64 MiB cartridge; time
  // advances only for persistence scheduling, not for simulated CPU gameplay.
  const capacityContext=await browser.newContext({serviceWorkers:'block'}),capacityPage=await capacityContext.newPage(),capacityErrors=[],capacityRequests=[];
  capacityContext.on('request',r=>capacityRequests.push(r));capacityPage.on('pageerror',e=>capacityErrors.push(e.message));
  await capacityContext.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  await capacityPage.goto(base);await capacityPage.waitForFunction(()=>typeof window.createMGBA==='function');
  const capacity=await capacityPage.evaluate(async encoded=>{
   const [{MGBACore},{SaveProtection},db,{hash},{historyRecordBytes}]=await Promise.all([import('./src/core/mgba.js'),import('./src/storage/save-safety.js'),import('./src/storage/storage.js'),import('./src/shared.js'),import('./src/storage/save-history.js')]);
   const core=new MGBACore(document.createElement('canvas')),protection=new SaveProtection(()=>{}),coreId='mgba-rom64-save6-v2';
   const rom=new Uint8Array(64*1048576);rom.set(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)));
   const game={id:'synthetic-extended-save-capacity',system:'gba',name:'Authored 64 MiB flash capacity',size:rom.length};
   const clock=Date.now,start=clock(),ticks=[],historyWrites=[];let firstStateBytes;
   try{
    await core.load(rom);core.pause(true);for(let frame=0;frame<30;frame++){core.m._web_frame(0);core.m._web_audio_read();}core.draw();
    await db.addGame(game,rom);await protection.open(game,coreId);
    const initialState=core.state(),initialSave=core.save(),manual={bytes:initialState,hash:await hash(initialState),save:initialSave,saveHash:await hash(initialSave),at:start-1000,coreId};firstStateBytes=initialState.length;
    await db.put('states',game.id+':before-capacity-run',manual);
    for(let tick=1;tick<=30;tick++){
     Date.now=()=>start+tick*10000;
     const battery=core.save();battery[battery.length-1]=tick;core.restore(battery);core.m._web_frame(0);core.m._web_audio_read();
     const checkpoint=Date.now()-protection.stateAt>=20000;await protection.save(core,{checkpoint});
     const saved=await db.get('saves',game.id);ticks.push({tick,checkpoint,at:(saved.at-start)/1000,marker:saved.bytes.at(-1)});
     // The writer may run in a Worker. Inspect actual committed histories,
     // rather than observing only the main realm's IndexedDB prototype.
     for(const store of ['recoveries','backups','archives']){const records=await db.get(store,game.id)||[];historyWrites.push({store,count:records.length,bytes:records.reduce((sum,record)=>sum+historyRecordBytes(record),0)});}
    }
    const recoveries=await db.get('recoveries',game.id),backups=await db.get('backups',game.id),archives=await db.get('archives',game.id),latest=await db.get('saves',game.id),states=await db.stateEntries(game.id),restored=[];
    for(const record of recoveries){await protection.restoreState(core,record);restored.push({second:(record.at-start)/1000,marker:core.save().at(-1),paired:await hash(core.save())===record.saveHash,first:core.save()[0],lastBank:core.save()[95*65536]});}
    const retainedManual=states.find(entry=>entry.key===game.id+':before-capacity-run')?.value;
    const manualUnchanged=states.length===1&&await hash(retainedManual.bytes)===manual.hash&&await hash(retainedManual.save)===manual.saveHash;
    await protection.restoreState(core,retainedManual);
    return {romBytes:rom.length,saveBytes:latest.bytes.length,stateBytes:firstStateBytes,ticks,historyWrites,recoveryCount:recoveries.length,restored,latestMarker:latest.bytes.at(-1),latestSecond:(latest.at-start)/1000,backupMarkers:backups.map(record=>record.bytes.at(-1)),archiveMarkers:archives.map(record=>record.bytes.at(-1)),manualUnchanged,manualRestoredMarker:core.save().at(-1)};
   }finally{Date.now=clock;await protection.close();core.close();}
  },Buffer.from(require('./core-upgrade.cjs').flash(95,true)).toString('base64'));
  assert.equal(capacity.romBytes,64*1048576);assert.equal(capacity.saveBytes,6*1048576);assert.ok(capacity.stateBytes>22*1048576);
  assert.equal(capacity.ticks.length,30);assert.equal(capacity.ticks.filter(tick=>tick.checkpoint).length,15);
  for(const tick of capacity.ticks){assert.equal(tick.marker,tick.tick);assert.equal(tick.at,tick.tick*10);}
  assert.equal(capacity.recoveryCount,3);assert.deepEqual(capacity.restored,[29,27,25].map(tick=>({second:tick*10,marker:tick,paired:true,first:0x5a,lastBank:0x3c})));
  assert.equal(capacity.latestMarker,30);assert.equal(capacity.latestSecond,300);assert.deepEqual(capacity.backupMarkers,[29,28,27,26,25]);assert.deepEqual(capacity.archiveMarkers,[1]);
  assert.equal(capacity.historyWrites.length,90);assert.ok(capacity.historyWrites.every(write=>write.bytes<=96*1048576),'Every committed history stays within its byte budget');
  assert.equal(capacity.manualUnchanged,true);assert.equal(capacity.manualRestoredMarker,0xff);
  assert.deepEqual(capacityErrors,[]);assert.ok(capacityRequests.every(r=>r.method()==='GET'&&!r.postData()&&new URL(r.url()).origin===new URL(base).origin));
  await capacityContext.close();console.log(`PASS: 64 MiB authored ROM, ${capacity.stateBytes}-byte states, 30 saves / 15 checkpoints over five simulated minutes, latest three paired recoveries restored, old manual state preserved, max history ${Math.max(...capacity.historyWrites.map(write=>write.bytes))} bytes, no uploads.`);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
