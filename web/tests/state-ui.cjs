// SPDX-License-Identifier: AGPL-3.0-or-later
// All test data is synthetic and stays in a separate browser context.
const assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const browserName=process.env.BROWSER_ENGINE||'chromium',browserType=require('./browser-runtime.cjs')[browserName];
(async()=>{
 const b=await browserType.launch({headless:true,...(browserName==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),base=process.env.TEST_URL||'http://127.0.0.1:4173/';let p=await c.newPage();
  await c.route('**/src/storage/storage.js',async route=>{
   const response=await route.fetch(),source=await response.text(),needle='stateCatalog=guardUpdateTask(readStateCatalog)';assert.ok(source.includes(needle));
   await route.fulfill({response,body:source.replace(needle,'stateCatalog=guardUpdateTask(async(...args)=>{if(globalThis.stateUiCatalogGate){stateUiCatalogWaiting=true;await stateUiCatalogGate;}try{return await readStateCatalog(...args);}finally{globalThis.stateUiCatalogDone=true;}})')});
  });
  await c.route('**/src/views/states.js',async route=>{
   const response=await route.fetch(),source=await response.text(),factory='export function createStateDialogs(api){',result='return {showStates,confirmStateSave,showQuickLoad};';assert.ok(source.includes(factory)&&source.includes(result));
   await route.fulfill({response,body:source.replace(factory,factory+'globalThis.stateUiAPI=api;').replace(result,'return globalThis.stateUiDialogs={showStates,confirmStateSave,showQuickLoad};')});
  });
  const errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(15000);
  const screenshot=async name=>{await p.locator('#toast.show').waitFor({state:'hidden'});await p.waitForTimeout(250);await p.screenshot({path:path.join(process.env.SCREENSHOT_DIR||os.tmpdir(),name+'.png')});};
  const count=()=>p.evaluate(async()=>{const db=await import('./src/storage/storage.js');return(await db.all('states')).length;});
  const menu=async()=>{
   // Opening MENU now saves battery data asynchronously. Observe the real queue
   // without replacing persistence, then take preservation snapshots only after
   // that save has committed. A failed save must fail this test as well.
   await p.evaluate(async()=>{
    if(window.stateUiSaveObserver)return;
    const {SaveProtection}=await import('./src/storage/save-safety.js'),save=SaveProtection.prototype.save;
    window.stateUiSaveObserver={};
    SaveProtection.prototype.save=function(...args){stateUiSaveObserver.protection=this;return save.apply(this,args);};
   });
   if(await p.locator('#sheet').isVisible())await p.locator('#close-sheet').click();await p.locator('#player-menu').click();
   await p.evaluate(async()=>{const protection=stateUiSaveObserver.protection;if(!protection)throw Error('MENU did not request a battery save');await protection.queue;});
  };
  const fits=async()=>{
   await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const problems=await p.locator('#sheet').evaluate(d=>{
    const issues=[],rect=d.getBoundingClientRect();if(d.scrollWidth>d.clientWidth+1)issues.push('dialog overflows');
    for(const el of d.querySelectorAll('.sheet-actions button,.state-continue,.row>span:first-of-type,.sheet-head button')){
     if(!el.getClientRects().length)continue; // A hidden optional row has no layout box.
     const r=el.getBoundingClientRect();if(r.left<rect.left||r.right>rect.right)issues.push(el.textContent+' outside dialog '+JSON.stringify({viewport:innerWidth,dialog:[rect.left,rect.right],element:[r.left,r.right]}));
     if(el.matches('.row>span')&&r.width<55)issues.push(el.textContent+' label squeezed to '+r.width);
     if(el.matches('.sheet-actions button')&&r.height>70)issues.push(el.textContent+' button too tall');
    }return issues;
   });assert.deepEqual(problems,[]);
  };
  await p.goto(base);await p.locator('#rom-input').setInputFiles({name:'Original-test.gb',mimeType:'application/octet-stream',buffer:Buffer.from(require('./cartridges.cjs').gb())});
  await p.locator('.game-launch').click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});
  for(let i=0;i<2;i++){await menu();await p.locator('[data-action=newState]').click();await p.locator('[data-slot-load]').first().waitFor();}
  assert.equal(await p.locator('[data-slot-load]').count(),2,'Append without replacing');assert.equal(await p.locator('[data-state-delete],[data-action=newState],#confirm-state-save').count(),0,'Read view has no adjacent save/delete action');assert.equal(await count(),2);
  const stateBounds=async()=>{
   await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   return p.evaluate(()=>Object.fromEntries(['#sheet','.states-view .segmented','#close-sheet','.state-scroll'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return [selector,{x:r.x,y:r.y,width:r.width,height:r.height}];})));
  };
  for(const [width,height] of [[390,844],[844,390],[768,1024],[1366,768]]){
   await p.setViewportSize({width,height});const bounds=await stateBounds();
   await p.locator('[data-state-mode=auto]').click();await p.locator('[data-state-mode=auto][aria-pressed=true]').waitFor();
   assert.deepEqual(await stateBounds(),bounds,'Automatic/manual counts cannot resize or shift the state picker');
   await p.locator('.save-details summary').click();assert.deepEqual(await stateBounds(),bounds,'Expanding status scrolls within the fixed list');
   await p.locator('[data-state-mode=manual]').click();await p.locator('#edit-states').waitFor();
   await p.locator('#edit-states').click();await p.locator('[data-state-select]').first().waitFor();
   assert.deepEqual(await stateBounds(),bounds,'Edit mode keeps header and list bounds');
   await p.locator('#edit-states').click();await p.locator('[data-slot-load]').first().waitFor();
  }
  for(const width of [240,280,320,390,768]){await p.setViewportSize({width,height:844});await fits();if(width===280)await screenshot('state-list-narrow');}
  await p.setViewportSize({width:390,height:844});await screenshot('state-list');
  await menu();assert.equal(await p.locator('#sheet-title').textContent(),'ゲームメニュー');assert.equal(await p.locator('.action-tile,.menu-resume').count(),0);assert.equal(await p.locator('[data-shortcut]').count(),4);
  for(const [width,height] of [[240,844],[280,844],[320,844],[390,844],[844,390],[1024,768]]){await p.setViewportSize({width,height});await fits();if(width===280)await screenshot('game-menu-narrow');if(width===844)await screenshot('game-menu-landscape');}
  await p.locator('[data-setting=filter]').selectOption('lcd');assert.equal(await p.locator('[data-setting=filterStrength]').isVisible(),true);
  for(const [width,height]of [[240,844],[844,390]]){await p.setViewportSize({width,height});await fits();}
  await p.locator('[data-setting=filter]').selectOption('pixel');
  await p.setViewportSize({width:390,height:844});await screenshot('game-menu');
  await p.locator('#close-sheet').click();await p.locator('#quick-save').click();await p.locator('#cancel-state-save').click();assert.equal(await count(),2);await menu();await p.locator('[data-action=states]').click();
  await p.locator('#edit-states').click();await p.locator('[data-state-select]').first().check();await p.locator('#delete-selected-states').click();assert.equal(await count(),2);
  await p.setViewportSize({width:240,height:844});await fits();await p.locator('#cancel-state-delete').click();assert.equal(await count(),2);await p.setViewportSize({width:390,height:844});
  await p.locator('#edit-states').click();await p.locator('[data-slot-load]').first().click();await p.locator('#sheet').waitFor({state:'hidden'});assert.equal(await count(),2,'Loading cannot overwrite manual states');
  // Confirmed deletion changes only selected manual records, not another game's
  // states, automatic checkpoints or battery save. Invalid mixed keys are atomic.
  // Pause and finish the menu save before the snapshot. Stay in this menu until
  // deletion: closing/reopening it is another legitimate battery-save operation.
  await menu();
  const before=await p.evaluate(async()=>{const db=await import('./src/storage/storage.js');const [g]=await db.all('library'),states=await db.stateEntries(g.id);await db.put('states','other-game:keep',states[0].value);return {id:g.id,keys:states.map(s=>s.key),save:JSON.stringify(await db.get('saves',g.id)),auto:JSON.stringify(await db.get('recoveries',g.id))};});
  assert.equal(await p.evaluate(async({id,keys})=>{const db=await import('./src/storage/storage.js');try{await db.removeStates(id,[keys[0],'other-game:keep']);return false;}catch{return(await db.stateEntries(id)).length===2&&!!await db.get('states','other-game:keep');}},before),true,'Reject cross-game removal before any deletion');
  await p.locator('[data-action=states]').click();await p.locator('#edit-states').click();await p.locator('[data-state-select]').first().check();await p.locator('#delete-selected-states').click();
  // Hold the real deletion behind another transaction. Closing a confirmed
  // mutation must wait for its outcome, just like state save/load operations.
  await p.evaluate(async()=>{
   const request=indexedDB.open('manicemu-web',5),db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   const tx=db.transaction(['states','coverCatalogs'],'readwrite');let held=true;
   window.releaseStateDelete=()=>{held=false;};window.stateDeleteBlockerDone=new Promise((resolve,reject)=>{tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};});
   const keepAlive=()=>{if(held)tx.objectStore('states').get('__state_delete_test_hold__').onsuccess=keepAlive;};keepAlive();
  });
  await p.locator('#confirm-state-delete').click();
  assert.equal(await p.locator('#close-sheet').isDisabled(),true,'Confirmed deletion blocks closing until the transaction completes');
  assert.equal(await p.locator('#cancel-state-delete').isDisabled(),true,'Confirmed deletion cannot navigate back while pending');
  assert.equal(await p.locator('#sheet').evaluate(dialog=>{const event=new Event('cancel',{cancelable:true});dialog.dispatchEvent(event);return event.defaultPrevented;}),true,'Escape/cancel is blocked during deletion');
  await p.locator('#close-sheet').evaluate(button=>button.click());await p.keyboard.press('Escape');assert.equal(await p.locator('#sheet').isVisible(),true);
  await p.evaluate(async()=>{releaseStateDelete();await stateDeleteBlockerDone;});await p.locator('[data-slot-load]').first().waitFor();
  assert.equal(await p.locator('#close-sheet').isDisabled(),false,'Completed deletion restores normal closing');
  assert.equal(await count(),2,'One manual and one other-game record remain');
  assert.deepEqual(await p.evaluate(async id=>{const db=await import('./src/storage/storage.js');return {other:!!await db.get('states','other-game:keep'),save:JSON.stringify(await db.get('saves',id)),auto:JSON.stringify(await db.get('recoveries',id))};},before.id),{other:true,save:before.save,auto:before.auto});
  // Restart cannot happen before confirmation; cancelled restart leaves autos.
  await menu();await p.locator('[data-shortcut=restart]').click();await p.locator('#cancel-restart').click();assert.equal(await p.evaluate(async id=>JSON.stringify(await (await import('./src/storage/storage.js')).get('recoveries',id)),before.id),before.auto);
  await p.locator('[data-action=restart]').click();await p.locator('#confirm-restart').click();await p.locator('#sheet').waitFor({state:'hidden'});
  assert.ok(await p.evaluate(async ({id,auto})=>(await (await import('./src/storage/storage.js')).get('recoveries',id))[0].at>JSON.parse(auto)[0].at,before),'Restart checkpoints before resetting');
  // Battery backups are a separate operation and cannot restore on the first tap.
  await menu();
  const battery=await p.evaluate(async id=>{const db=await import('./src/storage/storage.js'),value=await db.get('saves',id);await db.put('backups',id,[value]);return JSON.stringify(value);},before.id);
  await p.locator('[data-action=saveData]').click();await p.locator('[data-action=backups]').click();await p.locator('[data-backup-restore]').first().click();
  await p.setViewportSize({width:240,height:844});await fits();await p.locator('#cancel-backup').click();
  assert.equal(await p.evaluate(async id=>JSON.stringify(await (await import('./src/storage/storage.js')).get('saves',id)),before.id),battery,'Cancelling backup restore leaves battery unchanged');
  // Observe the successful restore commit itself: a normal autosave may update
  // the latest record's reason immediately after the confirmation resumes play.
  await p.evaluate(async()=>{
   const {SaveProtection}=await import('./src/storage/save-safety.js'),save=SaveProtection.prototype.save;window.backupRestoreCommits=[];
   SaveProtection.prototype.save=function(core,options){const result=save.call(this,core,options);return options?.reason==='backup-restore'?result.then(value=>{backupRestoreCommits.push(value?.save);return value;}):result;};
  });
  await p.setViewportSize({width:390,height:844});await p.locator('[data-backup-restore]').first().click();await p.locator('#confirm-backup').click();await p.locator('#sheet').waitFor({state:'hidden'});
  const restoredBattery=await p.evaluate(async id=>{const latest=await (await import('./src/storage/storage.js')).get('saves',id);return {commits:backupRestoreCommits.map(save=>({reason:save?.reason,hash:save?.hash,bytes:save?.bytes?[...save.bytes]:null})),latest:{hash:latest.hash,bytes:[...latest.bytes]}};},before.id),expectedBattery=JSON.parse(battery),expectedBytes=Object.values(expectedBattery.bytes);
  assert.deepEqual(restoredBattery.commits,[{reason:'backup-restore',hash:expectedBattery.hash,bytes:expectedBytes}],'Confirmation commits the selected backup exactly once');
  assert.deepEqual(restoredBattery.latest,{hash:expectedBattery.hash,bytes:expectedBytes},'Later automatic saves retain the restored battery contents');
  await menu();await p.locator('[data-action=states]').click();await p.locator('[data-state-mode=auto]').click();await p.locator('[data-recover]').first().waitFor();assert.equal(await p.locator('#edit-states').count(),0,'Recovery checkpoints are protected');
  await screenshot('automatic-state-list');await p.close();
  p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.locator('.game-launch').click();await p.locator('.game-info-play').click();await p.getByRole('heading',{name:'前回のプレイを復旧'}).waitFor();
  const recoveryBounds=await stateBounds();await p.locator('[data-state-mode=manual]').click();await p.locator('#edit-states').waitFor();
  assert.equal(await p.locator('#sheet-title').textContent(),'前回のプレイを復旧');assert.equal(await p.locator('#continue-save').count(),1);assert.deepEqual(await stateBounds(),recoveryBounds,'Recovery guidance and frame persist across tabs');
  const normalStartBounds=async()=>{
   await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   return p.locator('#continue-save').evaluate(button=>{
    const r=button.getBoundingClientRect(),sheet=document.querySelector('#sheet').getBoundingClientRect(),list=document.querySelector('.state-scroll').getBoundingClientRect();
    return {x:r.x,y:r.y,width:r.width,height:r.height,visible:r.top>=0&&r.bottom<=innerHeight&&r.left>=sheet.left&&r.right<=sheet.right&&r.bottom<=sheet.bottom,outsideList:!button.closest('.state-scroll')&&r.top>=list.bottom,clickable:button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};
   });
  };
  for(const [width,height]of [[240,568],[320,720],[390,844],[844,390]]){
   await p.setViewportSize({width,height});let bounds;
   for(const mode of ['auto','manual']){
    await p.locator('[data-state-mode='+mode+']').click();await p.locator('[data-state-mode='+mode+'][aria-pressed=true]').waitFor();
    const current=await normalStartBounds();assert.ok(current.visible&&current.outsideList&&current.clickable&&current.height>=44,'Normal launch must be visible without scrolling at '+width+'x'+height);
    if(bounds)assert.deepEqual(current,bounds,'Normal launch stays fixed across manual/automatic tabs');else bounds=current;
    if(mode==='auto'){await p.locator('.save-details summary').click();assert.deepEqual(await normalStartBounds(),bounds,'Expanded save status cannot push normal launch away');}
    await p.locator('.state-scroll').evaluate(list=>{list.scrollTop=list.scrollHeight;});assert.deepEqual(await normalStartBounds(),bounds,'Scrolling only moves the state list');
   }
   if(width===320||width===844)await screenshot('recovery-normal-start-'+width);
  }
  await p.setViewportSize({width:390,height:844});
  const beforeNormal=await p.evaluate(async id=>{const db=await import('./src/storage/storage.js');return JSON.stringify([await db.get('saves',id),await db.get('recoveries',id)]);},before.id);
  await p.locator('#continue-save').click();await p.locator('#sheet').waitFor({state:'hidden'});assert.equal(await p.locator('#resume-game').isVisible(),false,'Normal launch resumes the loaded game');
  assert.equal(await p.evaluate(async id=>{const db=await import('./src/storage/storage.js');return JSON.stringify([await db.get('saves',id),await db.get('recoveries',id)]);},before.id),beforeNormal,'Normal launch does not restore or replace save data');
  await p.close();p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.locator('.game-launch').click();await p.locator('.game-info-play').click();await p.getByRole('heading',{name:'前回のプレイを復旧'}).waitFor();
  await p.locator('[data-state-mode=auto]').click();await p.locator('[data-recover]').first().click();await p.locator('#sheet').waitFor({state:'hidden'});
  await menu();await p.locator('[data-action=exit]').click();await p.locator('#player').waitFor({state:'hidden'});
  // Empty sheet bodies compare equal again after menu -> exit. An async picker
  // must also retain its game/core owner, or it can reopen an exited game.
  for(const mode of ['quick','manual']){
   await p.locator('.game-launch').click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});
   await p.evaluate(()=>{stateUiCatalogDone=false;stateUiCatalogWaiting=false;stateUiCatalogGate=new Promise(resolve=>globalThis.releaseStateUiCatalog=resolve);});
   if(mode==='quick')await p.locator('#quick-load').click();
   else await p.evaluate(()=>{stateUiAPI.setPause(true);globalThis.stateUiPending=stateUiDialogs.showStates();}); // Imported skins call the same API directly.
   await p.waitForFunction(()=>stateUiCatalogWaiting);assert.equal(await p.locator('#sheet-body').evaluate(node=>node.firstChild===null),true);
   await p.locator('#player-menu').click();await p.locator('[data-action=exit]').click();await p.locator('#player').waitFor({state:'hidden'});
   assert.equal(await p.locator('#sheet-body').evaluate(node=>node.firstChild===null),true);
   await p.evaluate(()=>{stateUiCatalogGate=null;releaseStateUiCatalog();});await p.waitForFunction(()=>stateUiCatalogDone);
   await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.equal(await p.locator('#sheet').isVisible(),false,'Delayed '+mode+' picker cannot reopen an exited game');
   assert.equal(await p.locator('#player').isVisible(),false);assert.equal(await p.locator('#sheet-body').evaluate(node=>node.firstChild===null),true);
  }
  await p.locator('[data-tab=settings]').click();await p.locator('[data-theme-choice=auto]').click();await screenshot('settings-menu');assert.deepEqual(errors,[]);
  console.log('PASS: native menu groups/shortcuts, 240–1024px layouts, append-only states, save/delete/restart cancellation, selected atomic deletion, other-game and battery preservation, real close/reopen recovery, delayed picker ownership after exit.');
  await p.goto('about:blank');await c.close();
 }finally{await Promise.race([b.close(),new Promise(r=>setTimeout(r,2500))]);}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
