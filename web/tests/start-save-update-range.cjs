// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored saves and cartridge instructions only. Synthetic ROMs are never run.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const runtime=require('./browser-runtime.cjs');
const {fixture35,fakeROM,hash}=require('./helpers/start-save-fixtures.cjs');
const {fixture:profileROM}=require('./helpers/start-rom-profile-fixture.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';

(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'palmo-start-update-')),files=[];
 let browser;
 try{
  browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));context.on('request',request=>requests.push(request));
  await context.addInitScript(()=>{window.coreAttempts=0;localStorage.setItem('palmo-start-updates-v1',JSON.stringify({enabled:false}));});
  await context.route('**/src/core/core-factory.js',route=>route.fulfill({contentType:'text/javascript',body:'export function createCore(){globalThis.coreAttempts++;throw Error("Synthetic ROM profiles must never execute");}'}));
  const original=fixture35({second:true}),compatible=fixture35({stamp:0x2800,second:true});
  await context.route('**/__range-save-old',route=>route.fulfill({body:Buffer.from(original),contentType:'application/octet-stream'}));
  await context.route('**/__range-save-compatible',route=>route.fulfill({body:Buffer.from(compatible),contentType:'application/octet-stream'}));
  let targetFile;
  await context.route('**/__range-target',route=>route.fulfill({path:targetFile,contentType:'application/octet-stream'}));
  await page.goto(base);await page.locator('#add-first').waitFor();
  const sources=await page.evaluate(async entries=>{
   const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),{importROM}=await import('./src/library/rom-import.js'),result={};
   for(const [key,rom,name]of entries){
    const game=await importROM(new File([new Uint8Array(rom)],name),'gba');
    const bytes=new Uint8Array(await(await fetch('./__range-save-'+key)).arrayBuffer());
    await db.put('saves',game.id,{bytes,hash:await hash(bytes),at:100});result[key]=game.id;
   }
   return result;
  },[['old',[...fakeROM(2749620783)],'PokemonStart_v0.35.0.gba'],['compatible',[...fakeROM(1805207701)],'PokemonStart_v0.40.0.gba']]);
  const openUpdate=async source=>{
   await page.reload();await page.locator(`[data-game="${source}"]`).waitFor();
   if(await page.locator('#sheet.release-notice[open]').count())await page.locator('#close-sheet').click();
   await page.locator(`[data-game="${source}"]`).click();await page.locator('[data-action="updateROM"]').click();
   await page.locator('#rom-update-file').setInputFiles(targetFile);
  };
  const selectProfile=async(version,minimum,rangeGate=false)=>{
   const stamp=value=>{const [,minor,patch]=value.split('.').map(Number);return minor*256+patch;};
   targetFile=path.join(directory,`PokemonStart_v${version}-min${minimum}.gba`);files.push(targetFile);
   fs.writeFileSync(targetFile,profileROM({stamp:stamp(version),minimum:stamp(minimum),rangeGate}).bytes);
   return page.evaluate(async name=>{
    const {importROM}=await import('./src/library/rom-import.js');
    const file=new File([await(await fetch('./__range-target')).arrayBuffer()],name);
    const inspected=await importROM(file,'gba',null,{inspectOnly:true});
    return {id:inspected.id,profile:inspected.startROM};
   },path.basename(targetFile));
  };
  const committed=async(source,target,saveVersion)=>page.evaluate(async({source,target,saveVersion})=>{
   const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),{readROMUpdateBackup}=await import('./src/library/rom-update.js'),{inspectStartSave}=await import('./src/start-save/migration.js');
   const game=await db.get('library',target),save=await db.get('saves',target),backup=await readROMUpdateBackup(game);
   return {target:await hash(save.bytes),source:await hash((await db.get('saves',source)).bytes),backup:await hash(backup.save.bytes),migration:game.romUpdate.migration??null,validSlots:inspectStartSave(save.bytes,saveVersion).slots.filter(slot=>slot.valid).length};
  },{source,target,saveVersion});
  const convert=async(target,version)=>{
   await openUpdate(sources.old);await page.locator('#start-save-apply').waitFor();
   await page.waitForFunction(()=>!document.querySelector('#close-sheet').disabled);
   assert.equal(await page.locator('#start-save-version').inputValue(),'0.35.0');
   assert.equal(await page.locator('#start-save-version').isVisible(),false,'Known source needs no manual version selection');
   assert.equal(await page.locator('#start-save-apply').textContent(),'セーブデータを変換して更新');
   assert.equal(await page.locator('#start-save-apply').isEnabled(),true);
   assert.equal(await page.locator('#start-save-unverified').isVisible(),false,'Native save threshold proves conversion is required');
   assert.equal(await page.locator('#start-save-copy').isVisible(),false,'An incompatible save must not offer unchecked copying');
   assert.equal(await page.locator('#rom-update-compatible').count(),0);
   assert.ok((await page.locator('#sheet-body').textContent()).includes(version),'Show the selected destination game version');
   await page.locator('#start-save-apply').click();await page.locator('#rom-update-play').waitFor();
   const result=await committed(sources.old,target,'0.42.5');
   assert.equal(result.source,hash(original));assert.equal(result.backup,hash(original));assert.notEqual(result.target,hash(original));assert.equal(result.validSlots,2);
   assert.equal(result.migration.kind,'start');assert.equal(result.migration.from,'0.35.0');assert.equal(result.migration.to,version);assert.equal(result.migration.via,version==='0.42.5'?undefined:'0.42.5','Conversion records the reviewed intermediate format separately from the game destination');
   assert.equal(await page.evaluate(()=>coreAttempts),0);return result;
  };

  // This is the reported failure: the latest game is not in the CRC manifest.
  const target425=await selectProfile('0.42.5','0.36.2');
  assert.equal(target425.profile?.version,'0.42.5');assert.equal(target425.profile.minimumSaveVersion,'0.36.2');
  const forgedCopies=await page.evaluate(async({source,target,name})=>{
   const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),{importROM}=await import('./src/library/rom-import.js'),{prepareROMUpdate}=await import('./src/library/rom-update.js');
   const file=new File([await(await fetch('./__range-target')).arrayBuffer()],name),inspected=await importROM(file,'gba',null,{inspectOnly:true});
   const plan=await prepareROMUpdate(source,inspected.game),rejections=[];
   for(const extra of [{},{startCopy:{from:'0.35.0'}}]){
    try{await importROM(file,'gba',null,{updatePlan:{...plan,...extra}});rejections.push(false);}catch{rejections.push(true);}
   }
   return {rejections,library:await db.has('library',target),save:await db.has('saves',target),backup:await db.has('coverCatalogs',db.romUpdateMetadataPrefix+target),source:await hash((await db.get('saves',source)).bytes)};
  },{source:sources.old,target:target425.id,name:path.basename(targetFile)});
  assert.deepEqual(forgedCopies,{rejections:[true,true],library:false,save:false,backup:false,source:hash(original)},'Generic copy and claimed-compatible copy cannot bypass required conversion');
  const converted425=await convert(target425.id,'0.42.5');
  // Until the updated game itself writes a save, its cartridge revision is
  // newer than the serialized stamp. A subsequent update must inspect bytes.
  const nextUpdate=await page.evaluate(async id=>{
   const {startSaveTask}=await import('./src/start-save/client.js');
   return startSaveTask({action:'inspect',id,targetProfile:{version:'0.43.0',minimumSaveVersion:'0.36.2'}});
  },target425.id);
  assert.equal(nextUpdate.identity.version,'0.42.5');assert.equal(nextUpdate.version,'0.42.5','Read the actual converted save stamp');
  assert.equal(nextUpdate.validationError,null);assert.equal(nextUpdate.compatibility.status,'compatible');
  assert.deepEqual(await committed(sources.old,target425.id,'0.42.5'),converted425,'Inspecting the next update never changes the intermediate save or its backup');

  // A compatible source must retain every byte, including both slots and RTC.
  await page.evaluate(async id=>{await(await import('./src/storage/storage.js')).removeGame(id);},target425.id);
  await openUpdate(sources.compatible);await page.locator('#rom-update-confirm').waitFor();
  assert.equal(await page.locator('#start-save-apply').count(),0);
  assert.equal(await page.locator('#rom-update-compatible').isVisible(),false);
  assert.equal(await page.locator('#rom-update-compatible').isChecked(),true);assert.equal(await page.locator('#rom-update-confirm').isEnabled(),true);
  await page.locator('#rom-update-confirm').click();await page.locator('#rom-update-play').waitFor();
  assert.deepEqual(await committed(sources.compatible,target425.id,'0.40.0'),{target:hash(compatible),source:hash(compatible),backup:hash(compatible),migration:null,validSlots:2});

  // The reported 0.40.0 -> 0.47.1 path uses native lower/upper predicates.
  const range=await selectProfile('0.47.1','0.36.2',true);
  assert.deepEqual({version:range.profile.version,minimum:range.profile.minimumSaveVersion},{version:'0.47.1',minimum:'0.36.2'});
  await openUpdate(sources.compatible);await page.locator('#rom-update-confirm').waitFor();
  assert.equal(await page.locator('#start-save-apply').count(),0,'Compatible save goes directly to copy, not conversion');
  await page.locator('#rom-update-confirm').click();await page.locator('#rom-update-play').waitFor();
  assert.deepEqual(await committed(sources.compatible,range.id,'0.40.0'),{target:hash(compatible),source:hash(compatible),backup:hash(compatible),migration:null,validSlots:2});
  await page.evaluate(async id=>{await(await import('./src/storage/storage.js')).removeGame(id);},range.id);
  await convert(range.id,'0.47.1');
  const intermediate=await page.evaluate(async id=>{const {startSaveTask}=await import('./src/start-save/client.js');return startSaveTask({action:'inspect',id,targetProfile:{version:'0.48.0',minimumSaveVersion:'0.36.2'}});},range.id);
  assert.equal(intermediate.identity.version,'0.47.1');assert.equal(intermediate.version,'0.42.5');assert.equal(intermediate.compatibility.status,'compatible');

  // Updating to 0.48 must not stamp 0.48 into an old save before the game has
  // performed its native corrections. Both slots retain the reviewed bridge.
  const latest=await selectProfile('0.48.0','0.36.2',true);
  const convertedLatest=await convert(latest.id,'0.48.0');assert.equal(convertedLatest.migration.via,'0.42.5');
  await page.evaluate(async id=>{await(await import('./src/storage/storage.js')).removeGame(id);},latest.id);
  await openUpdate(sources.compatible);await page.locator('#rom-update-confirm').waitFor();
  assert.equal(await page.locator('#start-save-apply').count(),0);await page.locator('#rom-update-confirm').click();await page.locator('#rom-update-play').waitFor();
  assert.deepEqual(await committed(sources.compatible,latest.id,'0.40.0'),{target:hash(compatible),source:hash(compatible),backup:hash(compatible),migration:null,validSlots:2});

  // Neither the destination version nor its minimum accepted save version is
  // hardcoded: a future release with the same native boundary works as well.
  const future=await selectProfile('0.43.0','0.36.2');
  assert.equal(future.profile?.version,'0.43.0');assert.equal(future.profile.minimumSaveVersion,'0.36.2');
  const convertedFuture=await convert(future.id,'0.43.0');
  assert.equal(convertedFuture.target,converted425.target,'The same supported intermediate save feeds compatible newer releases');

  // A future incompatible format cannot receive the old converter output,
  // either through the UI or through a forged conversion plan.
  const incompatible=await selectProfile('0.48.0','0.43.0',true);
  assert.equal(incompatible.profile.minimumSaveVersion,'0.43.0');
  await openUpdate(sources.old);await page.locator('#start-save-apply').waitFor();
  await page.waitForFunction(()=>!document.querySelector('#close-sheet').disabled);
  assert.equal(await page.locator('#start-save-apply').isDisabled(),true);
  assert.equal(await page.locator('#start-save-apply').evaluate(el=>getComputedStyle(el).cursor),'default','Unavailable does not imply ongoing work');
  assert.equal(await page.locator('#start-save-unverified-row').isVisible(),false,'Acknowledgement cannot unblock an unsupported target');
  assert.equal(await page.locator('#start-save-copy').isVisible(),false);
  assert.equal(await page.locator('#rom-update-confirm').count(),0);
  const denied=await page.evaluate(async({source,target,name})=>{
   const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),{importROM}=await import('./src/library/rom-import.js'),{prepareROMUpdate}=await import('./src/library/rom-update.js');
   const file=new File([await(await fetch('./__range-target')).arrayBuffer()],name),inspected=await importROM(file,'gba',null,{inspectOnly:true});
   const plan=await prepareROMUpdate(source,inspected.game);let rejected=false;
   try{await importROM(file,'gba',null,{updatePlan:{...plan,startMigration:{from:'0.35.0',allowUnverified:true}}});}catch{rejected=true;}
   return {rejected,library:await db.has('library',target),save:await db.has('saves',target),backup:await db.has('coverCatalogs',db.romUpdateMetadataPrefix+target),source:await hash((await db.get('saves',source)).bytes)};
  },{source:sources.old,target:incompatible.id,name:path.basename(targetFile)});
  assert.deepEqual(denied,{rejected:true,library:false,save:false,backup:false,source:hash(original)});
  assert.deepEqual(await committed(sources.old,future.id,'0.42.5'),convertedFuture,'Refused update preserves the successful backup and target too');

  // A newer save must never be an opt-in unknown copy into an older ROM.
  // Use a misleading older cartridge/name: the save's own stamp wins.
  const recentSave=fixture35({stamp:0x2e00,second:true});
  await context.route('**/__range-save-recent',route=>route.fulfill({body:Buffer.from(recentSave),contentType:'application/octet-stream'}));
  await page.evaluate(async id=>{
   const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js');
   const bytes=new Uint8Array(await(await fetch('./__range-save-recent')).arrayBuffer());
   await db.put('saves',id,{bytes,hash:await hash(bytes),at:200});
  },future.id);
  for(const version of ['0.42.5','0.45.1']){
   const older=await selectProfile(version,'0.36.2');
   await openUpdate(future.id);await page.locator('#start-save-apply').waitFor();
   await page.waitForFunction(()=>!document.querySelector('#close-sheet').disabled);
   assert.equal(await page.locator('#start-save-version').inputValue(),'0.46.0');
   const refusal='このセーブは更新先ROMより新しいため、引き継げません。元のデータは変更していません。';
   assert.equal(await page.locator('#start-save-note').textContent(),refusal);
   assert.equal(await page.locator('#start-save-apply').isDisabled(),true);
   assert.equal(await page.locator('#start-save-export').isDisabled(),true);
   assert.equal(await page.locator('#start-save-copy').isVisible(),false);
   assert.equal(await page.locator('#start-save-unverified-row').isVisible(),false);
   assert.equal(await page.locator('#rom-update-confirm').count(),0);
   const guarded=await page.evaluate(async({source,name,expected})=>{
    const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),{importROM}=await import('./src/library/rom-import.js');
    const {prepareROMUpdate,finishROMUpdate,readROMUpdateBackup}=await import('./src/library/rom-update.js'),{startSaveTask}=await import('./src/start-save/client.js');
    const rom=new Uint8Array(await(await fetch('./__range-target')).arrayBuffer()),file=new File([rom],name),inspected=await importROM(file,'gba',null,{inspectOnly:true});
    const plan=await prepareROMUpdate(source,inspected.game);
    const snapshot=async id=>{
     const game=await db.get('library',id),saved=await db.get('saves',id),storedROM=await db.get('roms',id),backup=await db.get('coverCatalogs',db.romUpdateMetadataPrefix+id);
     return {game:JSON.stringify(game??null),save:saved?{hash:await hash(saved.bytes),at:saved.at}:null,rom:storedROM?await hash(storedROM instanceof Blob?await storedROM.arrayBuffer():storedROM):null,backup:backup?{hash:await hash(backup.save.bytes),at:backup.save.at}:null};
    };
    const before=await Promise.all([snapshot(source),snapshot(inspected.game.id)]),messages=[];
    for(const key of ['startCopy','startMigration']){
     for(const from of ['0.46.0','0.35.0']){
      try{await finishROMUpdate({...plan,[key]:{from,allowUnverified:true}},inspected.game,rom);messages.push(null);}
      catch(error){messages.push(error.message);}
     }
    }
    const target=await db.has('library',inspected.game.id)?{targetId:inspected.game.id}:{targetProfile:inspected.startROM};
    const info=await startSaveTask({action:'inspect',id:source,...target});
    let workerError=null;
    try{await startSaveTask({action:'convert',id:source,...target,from:'0.46.0',hash:info.hash,at:info.at,allowUnverified:true});}
    catch(error){workerError=error.message;}
    const oldBackup=await readROMUpdateBackup(await db.get('library',source));
    return {allRejected:messages.every(Boolean),explicit:messages[0]===expected&&messages[2]===expected,workerError,classification:info.compatibility.status,before,after:await Promise.all([snapshot(source),snapshot(inspected.game.id)]),oldBackup:await hash(oldBackup.save.bytes)};
   },{source:future.id,name:path.basename(targetFile),expected:refusal});
   assert.equal(guarded.allRejected,true);assert.equal(guarded.explicit,true);assert.equal(guarded.workerError,refusal);assert.equal(guarded.classification,'downgrade');
   assert.deepEqual(guarded.after,guarded.before,'Refusal must preserve both library entries, original ROMs, saves and existing update backups');
   assert.equal(guarded.oldBackup,hash(original),'The update-before backup remains available independently of the rejected new save');
  }
  assert.equal(await page.evaluate(()=>coreAttempts),0);assert.deepEqual(errors,[]);
  assert(requests.filter(request=>/^https?:/.test(request.url())).every(request=>new URL(request.url()).origin===new URL(base).origin&&['GET','HEAD'].includes(request.method())&&!request.postData()));
  await context.close();
  console.log('PASS: ROM-update UI, forward conversion/copy, newer-save downgrade refusal in UI/commit/Worker, forged source versions, existing/absent targets, immutable originals/backups and no synthetic core execution. '+kind);
 }finally{
  if(browser)await browser.close();
  for(const file of files)if(fs.existsSync(file))fs.unlinkSync(file);
  fs.rmdirSync(directory);
 }
// Assertions, owned-browser cleanup and temporary-file cleanup finish first.
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
