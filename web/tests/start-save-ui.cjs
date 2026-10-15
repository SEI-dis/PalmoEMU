// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic CRC fixtures are never executed as ROMs. No user data or external requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const runtime=require('./browser-runtime.cjs'),{fixture35,fakeROM,hash}=require('./helpers/start-save-fixtures.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
async function downloadedBytes(download){const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);return Buffer.concat(chunks);}
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},acceptDownloads:true}),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));context.on('request',request=>requests.push(request));
  await context.addInitScript(()=>{window.coreAttempts=0;localStorage.setItem('palmo-start-updates-v1',JSON.stringify({enabled:false}));});
  await context.route('**/src/core/core-factory.js',route=>route.fulfill({contentType:'text/javascript',body:'export function createCore(){globalThis.coreAttempts++;throw Error("Synthetic CRC fixtures must never execute");}'}));
  const fixture=fixture35(),compatibleFixture=fixture35({stamp:0x2800,second:true}),unknownFixture=fixture35({stamp:0x2402,second:true}),mixedFixture=fixture35({stamp:0x2800,second:true,secondStamp:0});
  for(const [name,bytes]of Object.entries({old:fixture,compatible:compatibleFixture,unknown:unknownFixture,mixed:mixedFixture}))await context.route('**/__start-fixture-'+name,route=>route.fulfill({body:Buffer.from(bytes),contentType:'application/octet-stream'}));
  await page.goto(base);await page.locator('#add-first').waitFor();
  const ids=await page.evaluate(async({oldROM,newROM})=>{
   const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),{importROM}=await import('./src/library/rom-import.js');
   const source=(await importROM(new File([new Uint8Array(oldROM)],'START-0.35.0.gba'),'gba')).id;
   const bytes=new Uint8Array(await (await fetch('./__start-fixture-old')).arrayBuffer());await db.put('saves',source,{bytes,hash:await hash(bytes),at:100});
   const inspected=await importROM(new File([new Uint8Array(newROM)],'START-0.42.3.gba'),'gba',null,{inspectOnly:true});
   if(inspected.startROM?.version!=='0.42.3')throw Error('Target ROM identification failed');
   return {source,target:inspected.id,targetGame:inspected.game};
  },{oldROM:[...fakeROM(2749620783)],newROM:[...fakeROM(47924504)]});
  const result=await page.evaluate(async({source,targetGame,newROM})=>{
   const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),{startSaveTask}=await import('./src/start-save/client.js'),{prepareROMUpdate,readROMUpdateBackup}=await import('./src/library/rom-update.js'),{importROM}=await import('./src/library/rom-import.js'),{inspectStartSave}=await import('./src/start-save/migration.js');
   const original=await db.get('saves',source),inspection=await startSaveTask({action:'inspect',id:source});
   const input={action:'convert',id:source,from:'0.35.0',targetProfile:{version:'0.42.3'},hash:inspection.hash,at:inspection.at},converted=await startSaveTask(input);
   const valid=inspectStartSave(converted.bytes,'0.42.3').slots[0].valid;
   let rejected=false;await db.put('saves',source,{...original,at:101});try{await startSaveTask(input);}catch{rejected=true;}await db.put('saves',source,original);
   const plan=await prepareROMUpdate(source,targetGame),file=new File([new Uint8Array(newROM)],'START-0.42.3.gba'),phases=[];
   await importROM(file,'gba',event=>phases.push(event.phase),{updatePlan:{...plan,startMigration:{from:'0.35.0'}}});
   const game=await db.get('library',targetGame.id),save=await db.get('saves',game.id),snapshot=await readROMUpdateBackup(game);
   const hashes={input:await hash(converted.original),source:await hash((await db.get('saves',source)).bytes),backup:await hash(snapshot.save.bytes),converted:await hash(converted.bytes),target:await hash(save.bytes)};
   // A failed previous update must remain untouched; its original backup is usable.
   const targetSave={bytes:new Uint8Array([91,92,93]),at:200,hash:await hash(new Uint8Array([91,92,93]))};await db.put('saves',game.id,targetSave);await db.put('recoveries',game.id,[{bytes:new Uint8Array([44]),at:200}]);
   let occupied=false;try{await importROM(file,'gba',null,{updatePlan:{...plan,startMigration:{from:'0.35.0'}}});}catch{occupied=true;}
   const kept=[...(await db.get('saves',game.id)).bytes],recovery=(await db.get('recoveries',game.id))[0].bytes[0];
   const backupInfo=await startSaveTask({action:'inspect',id:game.id,previous:true}),retry=await startSaveTask({...input,id:game.id,previous:true,hash:backupInfo.hash,at:backupInfo.at});
   // A clone failure rolls back converted saves and original snapshots together.
   let rollback=false;const empty={...targetGame,id:'start-rollback'};
   try{await db.commitROMUpdate({source:await db.get('library',source),game:empty,rom:()=>{},save:original,targetSave:save,migration:{kind:'start',from:'0.35.0',to:'0.42.3'}});}catch{rollback=true;}
   const noPartial=!(await db.has('library',empty.id))&&!(await db.has('saves',empty.id))&&!(await db.has('coverCatalogs',db.romUpdateMetadataPrefix+empty.id));
   return {valid,rejected,hashes,identified:inspection.identity?.version,phases,occupied,kept,recovery,retry:await hash(retry.bytes),rollback,noPartial,migration:game.romUpdate.migration};
  },{...ids,newROM:[...fakeROM(47924504)]});
  for(const name of ['valid','rejected','occupied','rollback','noPartial'])assert.equal(result[name],true,name);
  for(const name of ['input','source','backup'])assert.equal(result.hashes[name],hash(fixture),name);
  assert.equal(result.hashes.converted,result.hashes.target);assert.equal(result.retry,result.hashes.converted);assert.notEqual(result.hashes.target,hash(fixture));assert.equal(result.identified,'0.35.0');assert(result.phases.includes('migrating'));assert.deepEqual(result.kept,[91,92,93]);assert.equal(result.recovery,44);
  assert.deepEqual(result.migration,{kind:'start',from:'0.35.0',to:'0.42.3'});
  await page.reload();await page.locator(`[data-game="${ids.target}"]`).waitFor();
  if(await page.locator('#sheet.release-notice[open]').count())await page.locator('#close-sheet').click();
  const openStart=async()=>{await page.locator('[data-action="updateROM"]').click();await page.locator('#sheet-body details > summary').click();await page.locator('#rom-update-start').click();await page.locator('#start-save-apply').waitFor();};
  await page.locator(`[data-game="${ids.target}"]`).click();await openStart();
  assert.equal(await page.locator('#start-save-source').inputValue(),'previous');assert.equal(await page.locator('#start-save-version').inputValue(),'0.35.0');
  assert.equal(await page.locator('#start-save-apply').textContent(),'セーブデータを変換して更新');assert.equal(await page.locator('#start-save-apply').isEnabled(),true);
  assert.equal(await page.locator('#start-save-version').isVisible(),false);assert.equal(await page.locator('#start-save-source').isVisible(),false);assert.equal(await page.locator('#start-save-export').isVisible(),false);assert.equal(await page.locator('#start-save-confirmed').count(),0);
  for(const width of [320,390,844]){
   await page.setViewportSize({width,height:width===844?390:844});
   assert.equal(await page.locator('#sheet').evaluate(dialog=>dialog.scrollWidth<=dialog.clientWidth+1),true,`No horizontal overflow at ${width}`);
  }
  await page.setViewportSize({width:390,height:844});
  if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,kind+'-start-conversion.png')});}
  await page.locator('#start-save-details > summary').click();await page.locator('#start-save-export').click();await page.locator('#start-save-download').waitFor();
  const convertedDownload=page.waitForEvent('download');await page.locator('#start-save-download').click();const converted=await convertedDownload;
  assert.equal(hash(await downloadedBytes(converted)),result.hashes.converted);
  const originalDownload=page.waitForEvent('download');await page.locator('#start-save-original').click();const original=await originalDownload;
  assert.equal(hash(await downloadedBytes(original)),hash(fixture));
  await page.locator('#start-save-target').click();assert.equal(await page.locator('#sheet').evaluate(x=>x.classList.contains('game-info')),true);
  // The current target is deliberately invalid; selecting it never writes or loses the backup route.
  await openStart();await page.locator('#start-save-details > summary').click();await page.locator('#start-save-source').selectOption('current');await page.waitForFunction(()=>document.querySelector('#start-save-source')?.value==='current');
  assert.equal(await page.locator('#start-save-version').isVisible(),true);assert.equal(await page.locator('#start-save-apply').isDisabled(),true);assert.equal(await page.locator('#start-save-export').isDisabled(),true);
  await page.locator('#start-save-version').selectOption('0.35.0');await page.waitForFunction(()=>!document.querySelector('#close-sheet').disabled);
  assert.equal(await page.locator('#start-save-apply').isDisabled(),true);assert.equal(await page.locator('#start-save-export').isDisabled(),true);assert.equal(await page.locator('#start-save-download').count(),0);
  assert.equal(await page.evaluate(async id=>[...(await (await import('./src/storage/storage.js')).get('saves',id)).bytes].join(','),ids.target),'91,92,93');
  // Reselecting the already-added target ROM rescues the original snapshot;
  // it must not run prepareROMUpdate against the intentionally invalid save.
  await page.locator('#start-save-back').click();await page.locator('#rom-update-file').setInputFiles({name:'START-0.42.3.gba',mimeType:'application/octet-stream',buffer:Buffer.from(fakeROM(47924504))});
  await page.locator('#start-save-apply').waitFor();assert.equal(await page.locator('#start-save-source').inputValue(),'previous');assert.equal(await page.locator('#start-save-version').inputValue(),'0.35.0');assert.equal(await page.locator('#start-save-version').isVisible(),false);assert.equal(await page.locator('#start-save-apply').textContent(),'セーブデータを変換して更新');assert.equal(await page.locator('#start-save-apply').isEnabled(),true);
  assert.equal(await page.evaluate(()=>coreAttempts),0,'Real application export never creates a core for synthetic CRC fixtures');
  // Exercise the real application, real workers and IndexedDB. Fresh-target
  // update commits never launch a core, so authored CRC fixtures remain data.
  const sources=await page.evaluate(async entries=>{
   const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),{importROM}=await import('./src/library/rom-import.js'),out={};
   for(const [key,rom,name,fixture]of entries){const game=await importROM(new File([new Uint8Array(rom)],name),'gba'),bytes=new Uint8Array(await(await fetch('./__start-fixture-'+fixture)).arrayBuffer());await db.put('saves',game.id,{bytes,hash:await hash(bytes),at:300});out[key]=game.id;}return out;
  },[
   ['compatible',[...fakeROM(1805207701)],'START-0.40.0.gba','compatible'],
   ['unknown',[...fakeROM(3497195746)],'START-0.36.2.gba','unknown'],
   ['mismatch',[...fakeROM(0x11223344)],'PokemonStart-v0.40.0.gba','old'],
   ['newerName',[...fakeROM(0x1234abcd)],'PokemonStart-v0.48.0.gba','old'],
   ['unnamed',[...fakeROM(0x12345678)],'Unknown.gba','old'],
   ['mixed',[...fakeROM(0x55667788)],'PokemonStart-v0.40.0.gba','mixed']
  ]);
  const workerPolicy=await page.evaluate(async sources=>{
   const {startSaveTask}=await import('./src/start-save/client.js'),db=await import('./src/storage/storage.js'),out={};
   const task=options=>startSaveTask({targetProfile:{version:'0.42.3'},...options});
   for(const key of Object.keys(sources))out[key]=await task({action:'inspect',id:sources[key]});
   for(const key of ['compatible','unknown','mismatch','mixed']){
    const info=out[key];try{await task({action:'convert',id:sources[key],from:info.version,hash:info.hash,at:info.at,allowUnverified:key==='compatible'});out[key+'Rejected']=false;}catch{out[key+'Rejected']=true;}
   }
   const info=out.unknown,save=await db.get('saves',sources.unknown);await db.put('saves',sources.unknown,{...save,at:301});
   try{await task({action:'classify',id:sources.unknown,from:'0.36.2',hash:info.hash,at:info.at});out.staleRejected=false;}catch{out.staleRejected=true;}await db.put('saves',sources.unknown,save);
   out.corrected=await task({action:'classify',id:sources.mismatch,from:'0.35.0',hash:out.mismatch.hash,at:out.mismatch.at});return out;
  },sources);
  assert.equal(workerPolicy.compatible.version,'0.40.0');assert.equal(workerPolicy.compatible.compatibility.status,'compatible');assert.equal(workerPolicy.compatible.validationError,null);
  assert.equal(workerPolicy.unknown.version,'0.36.2');assert.equal(workerPolicy.unknown.compatibility.status,'unknown');assert.equal(workerPolicy.unknown.validationError,null);
  assert.equal(workerPolicy.unnamed.version,null);assert.ok(workerPolicy.mismatch.validationError);assert.ok(workerPolicy.mixed.validationError);
  for(const key of ['compatibleRejected','unknownRejected','mismatchRejected','mixedRejected','staleRejected'])assert.equal(workerPolicy[key],true,key);
  assert.equal(workerPolicy.corrected.compatibility.status,'convert');assert.equal(workerPolicy.corrected.targetReady,true);
  const openUpdate=async id=>{await page.reload();await page.locator(`[data-game="${id}"]`).waitFor();if(await page.locator('#sheet.release-notice[open]').count())await page.locator('#close-sheet').click();await page.locator(`[data-game="${id}"]`).click();await page.locator('[data-action="updateROM"]').click();};
  const selectTarget=()=>page.locator('#rom-update-file').setInputFiles({name:'START-0.42.3.gba',mimeType:'application/octet-stream',buffer:Buffer.from(fakeROM(47924504))});
  const removeTarget=()=>page.evaluate(async id=>{await(await import('./src/storage/storage.js')).removeGame(id);},ids.target);
  const committed=(source,version='0.42.3')=>page.evaluate(async({source,target,version})=>{
   const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),{readROMUpdateBackup}=await import('./src/library/rom-update.js'),{inspectStartSave}=await import('./src/start-save/migration.js');
   const game=await db.get('library',target),save=await db.get('saves',target),backup=await readROMUpdateBackup(game);
   return {target:await hash(save.bytes),source:await hash((await db.get('saves',source)).bytes),backup:await hash(backup.save.bytes),migration:game.romUpdate.migration??null,valid:inspectStartSave(save.bytes,version).slots.filter(s=>s.valid).length};
  },{source,target:ids.target,version});
  await removeTarget();await openUpdate(sources.compatible);await selectTarget();await page.locator('#rom-update-confirm').waitFor();
  assert.equal(await page.locator('#start-save-apply').count(),0);assert.equal(await page.locator('#rom-update-compatible').isVisible(),false);assert.equal(await page.locator('#rom-update-compatible').isChecked(),true);assert.equal(await page.locator('#rom-update-confirm').isEnabled(),true);
  await page.locator('#rom-update-confirm').click();await page.locator('#rom-update-play').waitFor();
  const copied=await committed(sources.compatible,'0.40.0');assert.deepEqual(copied,{target:hash(compatibleFixture),source:hash(compatibleFixture),backup:hash(compatibleFixture),migration:null,valid:2},'Compatible update copies every byte and retains the original');
  assert.equal(await page.evaluate(()=>coreAttempts),0);
  // Unknown compatibility offers a separately confirmed copy route and gates
  // conversion until the user explicitly accepts the unverified conversion.
  await removeTarget();await openUpdate(sources.unknown);await selectTarget();await page.locator('#start-save-apply').waitFor();
  assert.equal(await page.locator('#start-save-version').isVisible(),true);assert.equal(await page.locator('#start-save-version').inputValue(),'0.36.2');assert.equal(await page.locator('#start-save-unverified').isVisible(),true);assert.equal(await page.locator('#start-save-unverified').isChecked(),false);assert.equal(await page.locator('#start-save-apply').isDisabled(),true);assert.equal(await page.locator('#start-save-export').isDisabled(),true);
  await page.locator('#start-save-copy').click();await page.locator('#rom-update-confirm').waitFor();assert.equal(await page.locator('#rom-update-compatible').isVisible(),true);assert.equal(await page.locator('#rom-update-compatible').isChecked(),false);assert.equal(await page.locator('#rom-update-confirm').isDisabled(),true);
  await page.locator('#rom-update-back').click();await selectTarget();await page.locator('#start-save-unverified').waitFor();await page.locator('#start-save-unverified').check();assert.equal(await page.locator('#start-save-apply').isEnabled(),true);
  await page.locator('#start-save-apply').click();await page.locator('#rom-update-play').waitFor();
  const migrated=await committed(sources.unknown);assert.equal(migrated.source,hash(unknownFixture));assert.equal(migrated.backup,hash(unknownFixture));assert.notEqual(migrated.target,hash(unknownFixture));assert.equal(migrated.valid,2);assert.deepEqual(migrated.migration,{kind:'start',from:'0.36.2',to:'0.42.3'});assert.equal(await page.evaluate(()=>coreAttempts),0);
  // A compatible-looking filename cannot override incompatible save contents.
  for(const key of ['mismatch','mixed']){
   await openUpdate(sources[key]);await selectTarget();await page.locator('#start-save-apply').waitFor();assert.equal(await page.locator('#start-save-version').isVisible(),true);assert.equal(await page.locator('#start-save-apply').isDisabled(),true,key);assert.equal(await page.locator('#start-save-export').isDisabled(),true,key);assert.equal(await page.locator('#start-save-copy').isVisible(),false);
   if(key==='mismatch'){await page.locator('#start-save-version').selectOption('0.35.0');await page.waitForFunction(()=>!document.querySelector('#close-sheet').disabled&&!document.querySelector('#start-save-apply').disabled);assert.equal(await page.locator('#start-save-unverified').isVisible(),false);}
  }
  await openUpdate(sources.unnamed);await selectTarget();await page.locator('#start-save-apply').waitFor();assert.equal(await page.locator('#start-save-version').isVisible(),true);assert.equal(await page.locator('#start-save-version').inputValue(),'');assert.equal(await page.locator('#start-save-apply').isDisabled(),true);
  await page.locator('#start-save-version').selectOption('0.35.0');await page.waitForFunction(()=>!document.querySelector('#close-sheet').disabled&&!document.querySelector('#start-save-apply').disabled);assert.equal(await page.locator('#start-save-unverified').isVisible(),false);
  assert.deepEqual(await committed(sources.unknown),migrated,'Inspection and version selection never overwrite the existing target');assert.equal(await page.evaluate(()=>coreAttempts),0);
  // A misleading newer filename initially rules out the older destination.
  // Correcting the unstamped save's source must refresh target readiness too,
  // so the initial refusal does not permanently disable a safe conversion.
  await removeTarget();await openUpdate(sources.newerName);await selectTarget();await page.locator('#start-save-apply').waitFor();
  assert.equal(await page.locator('#start-save-version').inputValue(),'0.48.0');
  assert.equal(await page.locator('#start-save-apply').isDisabled(),true);assert.equal(await page.locator('#start-save-export').isDisabled(),true);
  await page.locator('#start-save-version').selectOption('0.35.0');
  await page.waitForFunction(()=>!document.querySelector('#close-sheet').disabled&&!document.querySelector('#start-save-apply').disabled);
  assert.equal(await page.locator('#start-save-export').isEnabled(),true,'Corrected source refreshes conversion and export readiness');
  assert.equal(await page.locator('#start-save-unverified').isVisible(),false);
  await page.locator('#start-save-apply').click();await page.locator('#rom-update-play').waitFor();
  const corrected=await committed(sources.newerName);assert.equal(corrected.source,hash(fixture));assert.equal(corrected.backup,hash(fixture));assert.notEqual(corrected.target,hash(fixture));assert.equal(corrected.valid,1);
  assert.deepEqual(corrected.migration,{kind:'start',from:'0.35.0',to:'0.42.3'});assert.equal(await page.evaluate(()=>coreAttempts),0);
  assert.deepEqual(errors,[]);assert(requests.filter(r=>/^https?:/.test(r.url())).every(r=>new URL(r.url()).origin===new URL(base).origin&&['GET','HEAD'].includes(r.method())&&!r.postData()));
  await context.close();console.log('PASS: START real worker/application UI; compatible byte-for-byte copy, explicit unknown conversion/copy gates, old conversion/exports, malformed/mismatched/mixed-slot rejection, immutable originals/snapshots, rollback/stale refusal and no synthetic core execution. '+kind);
 }finally{await browser.close();}
// All assertions and owned-browser cleanup finish before terminating the runner.
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
