// SPDX-License-Identifier: AGPL-3.0-or-later
// Original synthetic files, isolated IndexedDB and browser; no user ROMs.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const kind=process.env.BROWSER_ENGINE||'chromium',runtime=require('./browser-runtime.cjs');
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];
  page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));context.on('request',r=>requests.push(r));
  await context.addInitScript(()=>{
   window.importWorkers={created:0,active:0,terminated:0};const Original=window.Worker;
   window.Worker=new Proxy(Original,{construct(target,args){
    const worker=Reflect.construct(target,args);if(!String(args[0]).includes('rom-import-worker.js'))return worker;
    importWorkers.created++;importWorkers.active++;const terminate=worker.terminate.bind(worker);let closed=false;
    worker.terminate=()=>{if(!closed){closed=true;importWorkers.active--;importWorkers.terminated++;}return terminate();};return worker;
   }});
  });
  let nextMode='slow';
  await context.route('**/src/library/rom-import-worker.js',async route=>{
   const response=await route.fetch(),mode=nextMode;nextMode='normal';let prefix='';
   if(mode==='slow')prefix=`const originalRead=FileReader.prototype.readAsArrayBuffer;FileReader.prototype.readAsArrayBuffer=function(file){setTimeout(()=>originalRead.call(this,file),4500);};\n`;
   if(mode==='error')prefix=`FileReader.prototype.readAsArrayBuffer=function(){Object.defineProperty(this,'error',{value:new DOMException('Synthetic read failure','NotReadableError')});setTimeout(()=>this.dispatchEvent(new ProgressEvent('error')),50);};\n`;
   await route.fulfill({response,body:prefix+await response.text()});
  });
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';await page.goto(base);
  await page.evaluate(async()=>{window.isImportPending=(await import('./src/updates/update-activity.js')).updateTasksPending;});
  const source=Buffer.from(require('./link.cjs').cartridge(31,992)),identity=crypto.createHash('sha256').update(source).digest('hex');
  const file=(name,buffer=source)=>({name,mimeType:'application/octet-stream',buffer});
  const progress=page.locator('#rom-import-progress'),input=page.locator('#rom-input');
  const idle=async()=>{await page.waitForFunction(()=>!document.querySelector('#rom-import-progress')&&!isImportPending());assert.equal(await input.inputValue(),'');assert.equal(await page.evaluate(()=>importWorkers.active),0);};
  const records=()=>page.evaluate(async()=>await(await import('./src/storage/storage.js')).all('library'));
  await page.evaluate(()=>{window.importFrames=0;const tick=()=>{importFrames++;requestAnimationFrame(tick);};requestAnimationFrame(tick);});
  await input.setInputFiles(file('Progress <test>.gba'));await progress.waitFor();
  assert.equal(await page.locator('#rom-import-name').textContent(),'Progress <test>.gba');
  assert.equal(await progress.getAttribute('data-phase'),'reading');assert.equal(await progress.locator('progress').getAttribute('value'),'0');
  assert.equal(await page.evaluate(async()=>(await import('./src/updates/update-activity.js')).updateTasksPending()),true,'App updates must wait for the import');
  const frames=await page.evaluate(()=>importFrames);await page.keyboard.press('Escape');assert.equal(await progress.isVisible(),true,'Escape cannot hide an unfinished import');
  // The former toast vanished after 3.5 seconds. The import status must persist.
  await page.waitForTimeout(3600);assert.equal(await progress.isVisible(),true);assert.ok(await page.evaluate(start=>importFrames-start,frames)>5,'Main thread keeps animating during worker file reading');
  if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'rom-import-progress.png')});}
  await page.evaluate(()=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array([5,6,7])],'Concurrent.gba'));const input=document.querySelector('#rom-input');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));});
  await idle();assert.equal((await records()).length,1,'An overlapping import cannot start a second worker');assert.equal(await page.evaluate(()=>importWorkers.created),1);
  assert.equal((await records())[0].id,identity,'Existing SHA-256 content identity remains stable');
  const preserved=await page.evaluate(async id=>{
   const db=await import('./src/storage/storage.js'),game=await db.get('library',id);Object.assign(game,{name:'My renamed game',favorite:true,cover:'data:image/png;base64,AA==',lastPlayed:1234});await db.put('library',id,game);await db.put('saves',id,{bytes:new Uint8Array([9,8,7])});return JSON.stringify(game);
  },identity);
  await input.setInputFiles(file('Renamed duplicate.gba'));await idle();assert.equal((await records()).length,1);
  assert.equal(await page.evaluate(async id=>JSON.stringify(await(await import('./src/storage/storage.js')).get('library',id)),identity),preserved,'Duplicate import preserves names, favorites and cover');
  assert.deepEqual(await page.evaluate(async id=>[...await(await import('./src/storage/storage.js')).get('roms',id)],identity),[...source]);
  const other=Buffer.from(source);other[other.length-1]^=1;
  await input.setInputFiles([file('Batch one.gb',Buffer.from(require('./cartridges.cjs').gb())),file('Batch two.gba',other)]);await idle();assert.equal((await records()).length,3,'Batch commits each distinct file');
  // A failed read must finish progress, report the result, release the update guard and allow retry.
  const retry=Buffer.from(source);retry[retry.length-1]^=2;nextMode='error';
  await input.setInputFiles(file('Retry.gba',retry));await idle();await page.locator('#import-results-close').waitFor();assert.match(await page.locator('.import-results').textContent(),/Synthetic read failure/);assert.equal((await records()).length,3);await page.locator('#import-results-close').click();
  await input.setInputFiles(file('Retry.gba',retry));await idle();assert.equal((await records()).length,4);
  // A serialization failure must not leave metadata without its ROM record.
  const rollback=await page.evaluate(async()=>{
   const db=await import('./src/storage/storage.js');let failed=false;
   try{await db.addGame({id:'rollback-probe',name:'Never committed',system:'gba'},()=>{});}catch{failed=true;}
   return {failed,game:await db.get('library','rollback-probe'),rom:await db.get('roms','rollback-probe')};
  });assert.equal(rollback.failed,true);assert.equal(rollback.game,undefined);assert.equal(rollback.rom,undefined);
  // Repair older partial imports without overwriting their metadata or save.
  await page.evaluate(async id=>(await import('./src/storage/storage.js')).remove('roms',id),identity);
  await input.setInputFiles(file('Repair.gba'));await idle();
  const repaired=await page.evaluate(async id=>{const db=await import('./src/storage/storage.js');return {game:JSON.stringify(await db.get('library',id)),rom:[...await db.get('roms',id)],save:[...(await db.get('saves',id)).bytes]};},identity);
  assert.equal(repaired.game,preserved);assert.deepEqual(repaired.rom,[...source]);assert.deepEqual(repaired.save,[9,8,7]);
  // 128 MiB exceeds Chromium's typed-array IndexedDB serialization limit. Blob
  // storage must commit it atomically without returning ROM bytes to the page.
  const nds=[...require('./nds-cartridge.cjs')()],size=128*1048576;
  const large=await page.evaluate(async({nds,size})=>{
   const {importROM}=await import('./src/library/rom-import.js'),db=await import('./src/storage/storage.js'),phases=[];
   const file=new File([new Uint8Array(nds),new Uint8Array(size-nds.length)],'Large original.nds');
   const result=await importROM(file,'nds',p=>phases.push(p.phase)),rom=await db.get('roms',result.id),game=await db.get('library',result.id);
   const blob=rom instanceof Blob,header=blob?[...new Uint8Array(await rom.slice(0,32).arrayBuffer())]:[...rom.slice(0,32)];
   return {added:result.added,blob,byteArray:rom instanceof Uint8Array,size:blob?rom.size:rom.length,recordSize:game.size,phases,header};
  },{nds,size});
  assert.equal(large.added,true);if(kind==='chromium')assert.equal(large.blob,true);else assert.ok(large.blob||large.byteArray,'WebKit may use the atomic byte-array fallback when Blob persistence is unavailable');assert.equal(large.size,size);assert.equal(large.recordSize,size);assert.deepEqual(large.header,nds.slice(0,32));
  assert.ok(['reading','checking','saving'].every(phase=>large.phases.includes(phase)));
  // Both the new Blob format and existing byte-array saves still reach the core.
  const loaded=await page.evaluate(async nds=>{
   const {NDSCore}=await import('./src/core/nds.js'),results=[];
   for(const bytes of [new Blob([new Uint8Array(nds)]),new Uint8Array(nds)]){
    const core=new NDSCore(document.createElement('div'));
    try{await core.load(bytes);core.pause(true);for(let i=0;i<4;i++)core.m._web_frame(0);core.draw();results.push(core.screens.map(c=>[...c.getContext('2d').getImageData(0,0,1,1).data]));}
    finally{core.close();}
   }return results;
  },nds);
  assert.deepEqual(loaded,Array(2).fill([[255,0,0,255],[0,0,255,255]]));assert.equal(await page.evaluate(()=>importWorkers.active),0);assert.deepEqual(errors,[]);
  assert.ok(requests.filter(r=>/^https?:/.test(r.url())).every(r=>new URL(r.url()).origin===new URL(base).origin&&['GET','HEAD'].includes(r.method())&&!r.postData()),'ROM import performs no upload');
  await context.close();console.log(`PASS: persistent responsive import UI, update/reentry guards, stable IDs, duplicate/batch/retry, atomic rollback/orphan repair, ${size/1048576} MiB NDS ${large.blob?'Blob':'byte-array fallback'} storage and Blob/legacy core loading. ${kind}`);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
