// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated authored ROM instructions/saves. Never execute a game or use user storage.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const runtime=require('./browser-runtime.cjs');
const {fixture35,fakeROM,hash}=require('./helpers/start-save-fixtures.cjs');
const {fixture}=require('./helpers/start-rom-profile-fixture.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'palmo-format-l-'));let browser;
 try{
  const targetBytes=fixture({stamp:0x3200,rangeGate:true,upperImmediate:true,lFormat:true}).bytes;
  const file=path.join(dir,'PokemonStart_v0.50.0.gba');fs.writeFileSync(file,targetBytes);
  const original=fixture35({stamp:0x3100,second:true});
  browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(()=>{localStorage.setItem('palmo-start-updates-v1',JSON.stringify({enabled:false}));window.coreAttempts=0;});
  await context.route('**/src/core/core-factory.js',r=>r.fulfill({contentType:'text/javascript',body:'export function createCore(){globalThis.coreAttempts++;throw Error("Synthetic ROM must never execute");}'}));
  await context.route('**/__format-source',r=>r.fulfill({body:Buffer.from(original),contentType:'application/octet-stream'}));
  await context.route('**/__format-target',r=>r.fulfill({path:file,contentType:'application/octet-stream'}));
  await page.goto(base);await page.locator('#add-first').waitFor();
  const source=await page.evaluate(async rom=>{
   const {importROM}=await import('./src/library/rom-import.js'),db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js');
   const game=await importROM(new File([new Uint8Array(rom)],'PokemonStart_v0.49.0.gba'),'gba');
   const bytes=new Uint8Array(await(await fetch('./__format-source')).arrayBuffer());
   await db.put('saves',game.id,{bytes,hash:await hash(bytes),at:101});return game.id;
  },[...fakeROM(3735236845)]);
  await page.reload();await page.locator(`[data-game="${source}"]`).waitFor();
  if(await page.locator('#sheet.release-notice[open]').count())await page.locator('#close-sheet').click();
  await page.locator(`[data-game="${source}"]`).click();await page.locator('[data-action="updateROM"]').click();
  await page.locator('#rom-update-file').setInputFiles(file);await page.locator('#start-save-apply').waitFor();
  await page.waitForFunction(()=>!document.querySelector('#close-sheet').disabled);
  assert.equal(await page.locator('#start-save-apply').textContent(),'セーブデータを変換して更新');
  assert.equal(await page.locator('#start-save-apply').isEnabled(),true);
  assert.equal(await page.locator('#start-save-unverified').isVisible(),false);
  assert.equal(await page.locator('#start-save-copy').isVisible(),false,'0.50 must never offer a plain legacy copy');
  assert.match(await page.locator('#start-save-note').textContent(),/そのままでは新版で続きから遊べない/);
  await page.locator('#start-save-apply').click();await page.locator('#rom-update-play').waitFor();
  const result=await page.evaluate(async source=>{
   const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),{importROM}=await import('./src/library/rom-import.js');
   const {prepareROMUpdate,readROMUpdateBackup}=await import('./src/library/rom-update.js');
   const {inspectFormatSave}=await import('./src/start-save/format-l.js');
   const {startSaveTask}=await import('./src/start-save/client.js');
   const rom=new File([await(await fetch('./__format-target')).arrayBuffer()],'PokemonStart_v0.50.0.gba');
   const target=(await importROM(rom,'gba',null,{inspectOnly:true})).game;
   const game=await db.get('library',target.id),save=await db.get('saves',target.id),backup=await readROMUpdateBackup(game),profile=inspectFormatSave(save.bytes);
   const current=await startSaveTask({action:'inspect',id:target.id,targetId:target.id});
   const before=await hash(save.bytes),plan=await prepareROMUpdate(source,target);let rejected=false;
   try{await importROM(rom,'gba',null,{updatePlan:{...plan,startCopy:{from:'0.49.0',allowUnverified:true}}});}catch{rejected=true;}
   return {source:await hash((await db.get('saves',source)).bytes),backup:await hash(backup.save.bytes),target:before,unchanged:before===await hash((await db.get('saves',target.id)).bytes),rejected,slots:profile.slots.map(s=>({valid:s.valid,format:s.format,stamp:s.versionStamp})),migration:game.romUpdate.migration,current,attempts:coreAttempts};
  },source);
  assert.equal(result.source,hash(original));assert.equal(result.backup,hash(original));assert.notEqual(result.target,hash(original));
  assert.equal(result.unchanged,true);assert.equal(result.rejected,true);
  assert.deepEqual(result.slots,[0,1].map(()=>({valid:true,format:'L',stamp:0x31ff})));
  assert.deepEqual(result.migration,{kind:'start',from:'0.49.0',to:'0.50.0'});
  assert.equal(result.current.version,'0.50.0');assert.equal(result.current.compatibility.status,'compatible');assert.equal(result.current.validationError,null);
  assert.equal(result.attempts,0);assert.deepEqual(errors,[]);
  console.log('PASS: '+kind+' ROM update UI → Worker → atomic 0.50 format migration, both slots, original/backup preservation, no unchecked copy, converted-save reinspection');
 }finally{
  if(browser)await browser.close();
  assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert(path.basename(dir).startsWith('palmo-format-l-'));fs.rmSync(dir,{recursive:true,force:true});
 }
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
