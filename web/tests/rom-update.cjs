// SPDX-License-Identifier: AGPL-3.0-or-later
// Original synthetic bytes only; no private ROMs, saves or uploads.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage(),requests=[],errors=[];
  context.on('request',r=>requests.push(r));page.on('pageerror',e=>errors.push(e.message));
  let fileChoices=0;page.on('filechooser',()=>{fileChoices++;});
  const chooseROM=async(name,buffer)=>{const before=fileChoices,chosen=page.waitForEvent('filechooser');await page.locator('#rom-update-choose').click();const chooser=await chosen;assert.equal(fileChoices,before+1,'Only the explicit chooser button opens file selection');await chooser.setFiles(name?{name,mimeType:'application/octet-stream',buffer}:[]);};
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';await page.goto(base);
  // Static tab buttons exist before the async application startup binds them.
  await page.locator('#add-first').waitFor();
  await page.locator('[data-tab="imports"]').click();
  await page.locator('#import-update-rom').waitFor();
  assert.deepEqual(await page.locator('.import-services > button').evaluateAll(buttons=>buttons.map(button=>button.id)),['import-saves','import-skins','import-update-rom','import-patch']);
  assert.equal(await page.locator('#import-update-rom').isDisabled(),true);
  await page.locator('[data-tab="games"]').click();
  const result=await page.evaluate(async()=>{
   const db=await import('./src/storage/storage.js'),{importROM}=await import('./src/library/rom-import.js'),{prepareROMUpdate,readROMUpdateBackup}=await import('./src/library/rom-update.js'),{hash}=await import('./src/shared.js');
   const file=n=>new File([new Uint8Array([n,2,3,4])],`Version ${n}.gba`),old=file(1),next=file(2);
   const sourceId=(await importROM(old,'gba')).id,source=await db.get('library',sourceId),save={bytes:new Uint8Array([7,8,9]),at:100,hash:await hash(new Uint8Array([7,8,9]))};
   await db.put('saves',sourceId,save);await db.put('states',sourceId+':manual',{bytes:new Uint8Array([11]),at:90});
   await db.put('recoveries',sourceId,[{bytes:new Uint8Array([12]),at:99}]);await db.setGameDetails(sourceId,{name:'Original name'});
   const target=(await importROM(next,'gba',null,{inspectOnly:true})).game;
   const canvas=document.createElement('canvas');canvas.width=canvas.height=2;canvas.getContext('2d').fillRect(0,0,2,2);const artwork={cover:canvas.toDataURL(),coverSource:'custom',coverTitle:'Selected cover',coverUrl:''};await db.setGameCover(sourceId,artwork);
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
   if(Object.keys(artwork).some(key=>updated[key]!==artwork[key]))throw Error('ROM import worker lost source artwork');
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
  assert.equal(await page.locator('#rom-update-back').count(),0);await page.locator('#close-sheet').click();await page.locator('[data-action="updateROM"]').click();
  assert.equal(fileChoices,0,'Game-detail update and reattach entries only open their panels');await chooseROM('Next.gba',Buffer.from([3,2,3,4]));
  await page.locator('#rom-update-confirm').waitFor();assert.equal(await page.locator('#rom-update-confirm').isDisabled(),true);
  await page.locator('#rom-update-compatible').check();assert.equal(await page.locator('#rom-update-confirm').isEnabled(),true);
  await page.locator('#rom-update-confirm').click();await page.locator('#rom-update-play').waitFor();
  if(process.env.SCREENSHOT_DIR){const fs=require('node:fs'),path=require('node:path');fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'rom-update-complete.png')});}
  // Both entry points use the same protected update flow. Choosing/backing out
  // must not write anything; choosing another game must copy that game's save.
  await page.goto(base+'index.html#imports');await page.locator('#import-update-rom').waitFor();
  const snapshot=()=>page.evaluate(async()=>{const db=await import('./src/storage/storage.js');return JSON.stringify(await Promise.all(['library','roms','saves','states','recoveries','coverCatalogs'].map(store=>db.all(store))));});
  const beforePicking=await snapshot();
  for(const width of [320,390,844]){
   await page.setViewportSize({width,height:width===844?390:844});
   const boxes=await page.locator('.import-services > button').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right};}));
   assert.equal(boxes[0].y,boxes[1].y);assert.equal(boxes[2].y,boxes[3].y);assert.ok(boxes[2].y>boxes[0].y&&boxes[0].x===boxes[2].x&&boxes[1].x===boxes[3].x);
   assert.ok(boxes.every(box=>box.x>=0&&box.right<=width));
   if(process.env.SCREENSHOT_DIR)await page.screenshot({path:require('node:path').join(process.env.SCREENSHOT_DIR,`rom-update-imports-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});await page.locator('#import-update-rom').click();
  await page.locator(`[data-update-rom="${result.sourceId}"]`).click();await page.locator('#rom-update-choose').waitFor();assert.equal(fileChoices,1,'Selecting a game from imports does not open a file picker');
  // FileChooser.setFiles([]) and a bubbling input cancel exercise the browser
  // DOM contract; this is not an interaction with a real OS picker window.
  await page.locator('#rom-update-file').evaluate(input=>{window.cancelledROMInput=input;window.cancelledROMDialog=input.closest('dialog');});await chooseROM();await page.locator('#rom-update-file').dispatchEvent('cancel',{bubbles:true});
  assert.equal(await page.evaluate(()=>document.querySelector('#rom-update-file')===cancelledROMInput&&document.querySelector('#sheet')===cancelledROMDialog&&cancelledROMDialog.open),true,'Cancelling file selection preserves the same update sheet and input');assert.equal(await snapshot(),beforePicking,'Picker cancellation leaves every stored record unchanged');
  await chooseROM('Cancel.gba',Buffer.from([4,2,3,4]));
  await page.locator('#rom-update-confirm').waitFor();assert.equal(await page.locator('#close-sheet').getAttribute('aria-label'),'閉じる');await page.locator('#close-sheet').click();await page.locator('#rom-update-file').waitFor({state:'attached'});assert.equal(await page.locator('#rom-update-back').count(),0);await page.locator('#close-sheet').click();
  await page.locator(`[data-update-rom="${result.targetId}"]`).waitFor();assert.equal(fileChoices,3,'Returning from confirmation and update panels does not reopen file selection');assert.equal(await snapshot(),beforePicking);
  await page.locator('#close-sheet').click();assert.equal(await page.locator('#sheet').isVisible(),false);
  await page.locator('#import-update-rom').click();await page.locator(`[data-update-rom="${result.targetId}"]`).click();await page.locator('#rom-update-choose').waitFor();assert.equal(fileChoices,3);
  await chooseROM('From Imports.gba',Buffer.from([5,2,3,4]));
  await page.locator('#rom-update-confirm').waitFor();assert.equal(await page.locator('#rom-update-confirm').isDisabled(),true);
  await page.locator('#rom-update-compatible').check();await page.locator('#rom-update-confirm').click();await page.locator('#rom-update-play').waitFor();
  const imported=await page.evaluate(async({sourceId,targetId})=>{const db=await import('./src/storage/storage.js'),games=await db.all('library'),game=games.find(g=>g.name==='From Imports');return {previous:game.romUpdate.previousId,copied:[...(await db.get('saves',game.id)).bytes],selected:[...(await db.get('saves',targetId)).bytes],other:[...(await db.get('saves',sourceId)).bytes],states:(await db.stateEntries(game.id)).length};},result);
  assert.deepEqual(imported,{previous:result.targetId,copied:[99],selected:[99],other:[7,8,9],states:0});
  assert.deepEqual(errors,[]);assert.ok(requests.filter(r=>/^https?:/.test(r.url())).every(r=>new URL(r.url()).origin===new URL(base).origin&&['GET','HEAD'].includes(r.method())&&!r.postData()));
  await context.close();console.log('PASS: ROM update copies battery saves atomically, retains originals/snapshots, rejects stale/occupied/active targets, keeps states separate; ROM detach/reimport and confirmation UI. '+kind);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
