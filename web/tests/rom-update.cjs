// SPDX-License-Identifier: AGPL-3.0-or-later
// Original synthetic bytes only; no private ROMs, saves or uploads.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage(),requests=[],errors=[];
  context.on('request',r=>requests.push(r));page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';await page.goto(base);
  const result=await page.evaluate(async()=>{
   const db=await import('./src/storage.js'),{importROM}=await import('./src/rom-import.js'),{prepareROMUpdate,readROMUpdateBackup}=await import('./src/rom-update.js'),{hash}=await import('./src/shared.js');
   const file=n=>new File([new Uint8Array([n,2,3,4])],`Version ${n}.gba`),old=file(1),next=file(2);
   const sourceId=(await importROM(old,'gba')).id,source=await db.get('library',sourceId),save={bytes:new Uint8Array([7,8,9]),at:100,hash:await hash(new Uint8Array([7,8,9]))};
   await db.put('saves',sourceId,save);await db.put('states',sourceId+':manual',{bytes:new Uint8Array([11]),at:90});
   await db.put('recoveries',sourceId,[{bytes:new Uint8Array([12]),at:99}]);await db.setGameDetails(sourceId,{name:'Original name'});
   const target=(await importROM(next,'gba',null,{inspectOnly:true})).game;
   const previewDoesNotWrite=!await db.has('library',target.id)&&!await db.has('roms',target.id);
   let plan=await prepareROMUpdate(sourceId,target);
   const reject=async fn=>{try{await fn();return false;}catch{return true;}};
   const same=await reject(()=>prepareROMUpdate(sourceId,source));
   const wrongSystem=await reject(()=>prepareROMUpdate(sourceId,{...target,system:'gb'}));
   const locked=await navigator.locks.request('local-game:'+sourceId,()=>reject(()=>importROM(next,'gba',null,{updatePlan:plan})));
   await db.put('saves',sourceId,{...save,at:101});const stale=await reject(()=>importROM(next,'gba',null,{updatePlan:plan}));
   await db.put('saves',sourceId,save);plan=await prepareROMUpdate(sourceId,target);
   // Existing destination progress in any core must be retained, including a
   // hidden history/session and not merely its currently selected battery save.
   await db.put('states',target.id+'@vba-next:keep',{bytes:new Uint8Array([77]),at:55});
   const occupied=await reject(()=>importROM(next,'gba',null,{updatePlan:plan}));
   const occupiedKept=(await db.get('states',target.id+'@vba-next:keep')).bytes[0]===77;
   await db.remove('states',target.id+'@vba-next:keep');
   // A clone failure late in the atomic write rolls back library and snapshots.
   const rollback=await reject(async()=>db.commitROMUpdate({source:await db.get('library',sourceId),game:target,rom:()=>{},save}));
   const rollbackClean=!await db.has('library',target.id)&&!await db.has('coverCatalogs',db.romUpdateMetadataPrefix+target.id);
   await importROM(next,'gba',null,{updatePlan:plan});
   const updated=await db.get('library',target.id),copy=await db.get('saves',target.id),oldAfter=await db.get('saves',sourceId),snapshot=await readROMUpdateBackup(updated);
   const noStates=(await db.stateEntries(target.id)).length===0&&!await db.has('recoveries',target.id);
   await db.put('saves',target.id,{bytes:new Uint8Array([99]),at:200});
   const untouched=(await db.get('saves',sourceId)).bytes[0]===7&&(await readROMUpdateBackup(updated)).save.bytes[0]===7;
   await db.setGameDetails(target.id,{name:'Updated favorite name'});await db.setGamesLibraryMetadata([target.id],{favorite:true});
   const detachLocked=await navigator.locks.request('local-game:'+target.id,()=>reject(()=>db.detachROM(target.id)));
   await db.detachROM(target.id);const detached=await db.get('library',target.id),removed=!await db.has('roms',target.id),retained=(await db.get('saves',target.id)).bytes[0]===99;
   const mismatch=await reject(()=>importROM(old,'gba',null,{expectedId:target.id}));
   await importROM(next,'gba',null,{expectedId:target.id});const restored=await db.get('library',target.id);
   await db.detachROM(sourceId);const oldStateStill=(await db.get('states',sourceId+':manual')).bytes[0]===11;
   return {sourceId,targetId:target.id,previewDoesNotWrite,same,wrongSystem,locked,stale,occupied,occupiedKept,rollback,rollbackClean,copy:[...copy.bytes],old:[...oldAfter.bytes],snapshot:[...snapshot.save.bytes],previous:updated.romUpdate.previousId,noStates,untouched,detachLocked,detached:detached.romMissing,removed,retained,mismatch,restored:{name:restored.name,favorite:restored.favorite,missing:!!restored.romMissing},oldStateStill};
  });
  for(const key of ['previewDoesNotWrite','same','wrongSystem','locked','stale','occupied','occupiedKept','rollback','rollbackClean','noStates','untouched','detachLocked','detached','removed','retained','mismatch','oldStateStill'])assert.equal(result[key],true,key);
  assert.deepEqual(result.copy,[7,8,9]);assert.deepEqual(result.old,[7,8,9]);assert.deepEqual(result.snapshot,[7,8,9]);assert.equal(result.previous,result.sourceId);
  assert.deepEqual(result.restored,{name:'Updated favorite name',favorite:true,missing:false});
  // Detached game UI restores the exact ROM, while keeping state/save tools.
  await page.reload();await page.waitForFunction(()=>document.querySelector('[data-game]'));
  if(await page.locator('#sheet.release-notice[open]').count())await page.locator('#close-sheet').click();
  await page.locator(`[data-game="${result.sourceId}"]`).click();
  assert.equal(await page.locator('[data-action="restoreROM"]').count(),1);assert.equal(await page.locator('[data-action="play"]').count(),0);
  await page.locator('[data-action="restoreROM"]').click();assert.equal(await page.locator('#sheet-title').textContent(),'ROMを追加');
  await page.locator('#rom-update-back').click();await page.locator('[data-action="updateROM"]').click();
  await page.locator('#rom-update-file').setInputFiles({name:'Next.gba',mimeType:'application/octet-stream',buffer:Buffer.from([3,2,3,4])});
  await page.locator('#rom-update-confirm').waitFor();assert.equal(await page.locator('#rom-update-confirm').isDisabled(),true);
  await page.locator('#rom-update-compatible').check();assert.equal(await page.locator('#rom-update-confirm').isEnabled(),true);
  await page.locator('#rom-update-confirm').click();await page.locator('#rom-update-play').waitFor();
  if(process.env.SCREENSHOT_DIR){const fs=require('node:fs'),path=require('node:path');fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'rom-update-complete.png')});}
  assert.deepEqual(errors,[]);assert.ok(requests.filter(r=>/^https?:/.test(r.url())).every(r=>new URL(r.url()).origin===new URL(base).origin&&['GET','HEAD'].includes(r.method())&&!r.postData()));
  await context.close();console.log('PASS: ROM update copies battery saves atomically, retains originals/snapshots, rejects stale/occupied/active targets, keeps states separate; ROM detach/reimport and confirmation UI. '+kind);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
