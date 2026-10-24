// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated authored ROM instructions/saves. Never execute a game or use user storage.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const runtime=require('./browser-runtime.cjs');
const {fixture35,fakeROM,hash}=require('./helpers/start-save-fixtures.cjs');
const {fixture}=require('./helpers/start-rom-profile-fixture.cjs');
const {changePage,put16}=require('./helpers/start-save-format-fixtures.cjs');
const {eggs}=require('./helpers/start-save-egg-fixture.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
async function run(cases=[[50,0,'0.49.0'],[50,1,'0.49.0'],[53,1,'0.49.0'],[53,1,'0.50.1'],[53,1,'0.52.0']]){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'palmo-format-l-'));let browser;
 try{
  browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
  const {convertFormatSave}=await import('../src/start-save/format-l.js');
  for(const [minor,patch,from] of cases){
  const x=minor>59||minor===59&&patch>=2;
  const targetVersion=`0.${minor}.${patch}`,targetBytes=fixture({stamp:(minor<<8)+patch,rangeGate:true,upperImmediate:patch===0,lFormat:minor===50,wFormat:minor>=53&&!x,xFormat:x}).bytes;
  const file=path.join(dir,`PokemonStart_v${targetVersion}.gba`);fs.writeFileSync(file,targetBytes);
  let original=fixture35({stamp:0x3100,second:true});
  const sourceX=/^0\.59\.[2-9]$/.test(from);
  if(sourceX){original=eggs((await convertFormatSave(original,{to:'X',storageLayout:2})).bytes,{stamp:0x3b05});}
  else if(from!=='0.49.0'){
   original=(await convertFormatSave(original,{to:from==='0.57.0'?'W':'L'})).bytes;
   const [,minor,patch]=from.split('.').map(Number);
   for(const slot of [0,1])original=changePage(original,slot,10,page=>put16(page,0x245,(minor<<8)+patch));
  }
  if(from==='0.57.0')original=eggs(original,{key:2});
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(()=>{localStorage.setItem('palmo-start-updates-v1',JSON.stringify({enabled:false}));window.coreAttempts=0;});
  // Observe the real worker's storage reads and transfer ownership. No game or
  // persisted record is replaced by a stub, and no timing threshold hides errors.
  await context.route('**/src/start-save/worker.js',route=>route.fulfill({contentType:'text/javascript',body:`
   const testReads=[],testGet=IDBObjectStore.prototype.get,testSend=self.postMessage.bind(self);
   IDBObjectStore.prototype.get=function(key){if(this.name==='roms')testReads.push(key);return testGet.call(this,key);};
   self.postMessage=(data,transfer)=>{if(data.type==='done')data.testWorker={romReads:testReads.slice(),transferBytes:(transfer||[]).reduce((n,b)=>n+b.byteLength,0),transfers:transfer?.length||0,independent:!data.bytes||data.bytes.buffer!==data.original.buffer};return testSend(data,transfer);};
  `+fs.readFileSync(path.join(__dirname,'../src/start-save/worker.js'),'utf8')}));
  await context.route('**/src/core/core-factory.js',r=>r.fulfill({contentType:'text/javascript',body:'export function createCore(){globalThis.coreAttempts++;throw Error("Synthetic ROM must never execute");}'}));
  await context.route('**/__format-source',r=>r.fulfill({body:Buffer.from(original),contentType:'application/octet-stream'}));
  await context.route('**/__format-target',r=>r.fulfill({path:file,contentType:'application/octet-stream'}));
  await page.goto(base);await page.locator('#add-first').waitFor();
  const source=await page.evaluate(async({rom,from})=>{
   const {importROM}=await import('./src/library/rom-import.js'),db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js');
   const game=await importROM(new File([new Uint8Array(rom)],`PokemonStart_v${from}.gba`),'gba');
   const bytes=new Uint8Array(await(await fetch('./__format-source')).arrayBuffer());
   await db.put('saves',game.id,{bytes,hash:await hash(bytes),at:101});return game.id;
  },{rom:[...fakeROM(3735236845)],from});
  await page.reload();await page.locator(`[data-game="${source}"]`).waitFor();
  if(await page.locator('#sheet.release-notice[open]').count())await page.locator('#close-sheet').click();
  await page.locator(`[data-game="${source}"]`).click();await page.locator('[data-action="updateROM"]').click();
  await page.locator('#rom-update-file').setInputFiles(file);await page.locator('#start-save-apply').waitFor();
  await page.waitForFunction(()=>!document.querySelector('#close-sheet').disabled);
  assert.equal(await page.locator('#start-save-apply').textContent(),'セーブデータを変換して更新');
  assert.equal(await page.locator('#start-save-version').inputValue(),from);
  assert.equal(await page.locator('#start-save-apply').isEnabled(),true,`${from} → ${targetVersion} must use validated worker support, not a historical version list`);
  assert.equal(await page.locator('#start-save-unverified').isVisible(),false);
  assert.equal(await page.locator('#start-save-copy').isVisible(),false,'0.50 must never offer a plain legacy copy');
  assert.match(await page.locator('#start-save-note').textContent(),/そのままでは新版で続きから遊べない/);
  if(from!=='0.49.0'){
   await page.locator('#start-save-details > summary').click();
   await page.locator('#start-save-version').selectOption('0.49.0');
   await page.waitForFunction(()=>!document.querySelector('#close-sheet').disabled);
   assert.equal(await page.locator('#start-save-apply').isDisabled(),true,'A recognized target never overrides a mismatched source claim');
   await page.locator('#start-save-version').selectOption(from);
   await page.waitForFunction(()=>!document.querySelector('#close-sheet').disabled);
   assert.equal(await page.locator('#start-save-apply').isEnabled(),true);
  }
  await page.locator('#start-save-apply').click();await page.locator('#rom-update-play').waitFor();
  const result=await page.evaluate(async({source,targetVersion,from})=>{
   const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),{importROM}=await import('./src/library/rom-import.js');
   const {prepareROMUpdate,readROMUpdateBackup}=await import('./src/library/rom-update.js');
   const {inspectFormatSave}=await import('./src/start-save/format-l.js');
   const {startSaveTask}=await import('./src/start-save/client.js');
   const rom=new File([await(await fetch('./__format-target')).arrayBuffer()],`PokemonStart_v${targetVersion}.gba`);
   const target=(await importROM(rom,'gba',null,{inspectOnly:true})).game;
   const game=await db.get('library',target.id),save=await db.get('saves',target.id),backup=await readROMUpdateBackup(game),profile=inspectFormatSave(save.bytes);
   const current=await startSaveTask({action:'inspect',id:target.id,targetId:target.id});
   let transfer=null,invalidStoredTarget=null;
   if(from==='0.52.0'){
    const inspected=await startSaveTask({action:'inspect',id:source,targetId:target.id});
    const converted=await startSaveTask({action:'convert',id:source,targetId:target.id,from,hash:inspected.hash,at:inspected.at});
    transfer={...converted.testWorker,output:await hash(converted.bytes),original:await hash(converted.original)};
    const originalROM=await db.get('roms',target.id);
    try{
     await db.put('roms',target.id,new Uint8Array([1,2,3]));
     invalidStoredTarget=await startSaveTask({action:'inspect',id:source,targetId:target.id,targetProfile:{version:'0.53.1',minimumSaveVersion:'0.36.2',saveFormat:'W'}});
    }finally{await db.put('roms',target.id,originalROM);}
   }
   const before=await hash(save.bytes),plan=await prepareROMUpdate(source,target);let rejected=false;
   try{await importROM(rom,'gba',null,{updatePlan:{...plan,startCopy:{from,allowUnverified:true}}});}catch{rejected=true;}
   return {source:await hash((await db.get('saves',source)).bytes),backup:await hash(backup.save.bytes),target:before,unchanged:before===await hash((await db.get('saves',target.id)).bytes),rejected,bodyBytes:profile.bodyBytes,layout:profile.layout,slots:profile.slots.map(s=>({valid:s.valid,format:s.format,stamp:s.versionStamp})),migration:game.romUpdate.migration,current,transfer,invalidStoredTarget,attempts:coreAttempts};
  },{source,targetVersion,from});
  assert.equal(result.source,hash(original));assert.equal(result.backup,hash(original));assert.notEqual(result.target,hash(original));
  assert.equal(result.unchanged,true);assert.equal(result.rejected,true);
  const bridge=sourceX?from:x?'0.59.2':from==='0.57.0'?'0.57.0':minor>=53?'0.53.0':'0.50.0';
  assert.deepEqual(result.slots,[0,1].map(()=>({valid:true,format:x?'X':minor>=53?'W':'L',stamp:sourceX?0x3b05:x?0x3b02:from==='0.57.0'?0x3900:minor>=53?0x34ff:0x31ff})));
  assert.deepEqual(result.migration,{kind:'start',from,to:targetVersion,...(bridge!==targetVersion?{via:bridge}:{})});
  if(minor>=59){assert.equal(result.bodyBytes,16777216);assert.equal(result.layout.version,2);}
  assert.equal(result.current.version,bridge);assert.equal(result.current.compatibility.status,'compatible');assert.equal(result.current.validationError,null);
  assert.equal(result.current.testWorker.romReads.length,1,'Same-ROM inspection reads/scans the large ROM once');
  if(result.transfer){
   assert.equal(result.transfer.transfers,2);assert.equal(result.transfer.transferBytes,original.length+result.bodyBytes+original.length%4096);assert.equal(result.transfer.independent,true);
   assert.equal(result.transfer.output,result.target);assert.equal(result.transfer.original,hash(original));
   assert.equal(result.invalidStoredTarget.targetReady,false,'Stored unrecognized ROM cannot use a supplied optimistic profile');
  }
  assert.equal(result.attempts,0);assert.deepEqual(errors,[]);
  await context.close();
  console.log('PASS: '+kind+' ROM update UI → Worker → '+from+' → '+targetVersion+' format migration, both slots, original/backup preservation, no unchecked copy, converted-save reinspection');
  }
 }finally{
  if(browser)await browser.close();
  assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert(path.basename(dir).startsWith('palmo-format-l-'));fs.rmSync(dir,{recursive:true,force:true});
 }
}
module.exports=run;
if(require.main===module)run().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
