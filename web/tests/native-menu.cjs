// SPDX-License-Identifier: AGPL-3.0-or-later
// GameInfoView / GameOptionsView integration using a private synthetic library.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const kind=process.env.BROWSER_ENGINE||'chromium',browserType=require('./browser-runtime.cjs')[kind];
(async()=>{
 const browser=await browserType.launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  await context.addInitScript(()=>{window.showSaveFilePicker=undefined;});
  page.setDefaultTimeout(10000);page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR:',e.message);});const base=process.env.TEST_URL||'http://127.0.0.1:4173/';await page.goto(base);
  await page.waitForFunction(()=>localStorage.getItem('manic-settings')!==null);
  await page.locator('#rom-input').setInputFiles({name:'Original-test.gb',mimeType:'application/octet-stream',buffer:Buffer.from(require('./cartridges.cjs').gb())});
  await page.locator('.game-launch').waitFor();
  const gameId=await page.evaluate(async()=>{
   const db=await import('./src/storage/storage.js'),[game]=await db.all('library'),cover=document.createElement('canvas');cover.width=cover.height=80;
   const ctx=cover.getContext('2d');ctx.fillStyle='#6739b7';ctx.fillRect(0,0,80,80);ctx.fillStyle='#ffa732';ctx.fillRect(10,10,60,60);ctx.fillStyle='#211934';ctx.font='bold 16px sans-serif';ctx.textAlign='center';ctx.fillText('TEST',40,46);
   game.cover=cover.toDataURL();game.name='Original Test Adventure';game.lastPlayed=Date.now()-150*86400000;game.playDuration=116*60000;await db.put('library',game.id,game);
   // Older settings may still name the removed action. It must never reappear.
   const settings=JSON.parse(localStorage.getItem('manic-settings')),{gameOptionGroups}=await import('./src/components/manic-ui.js');
   settings.menuOrder=gameOptionGroups.map(group=>group.includes('copyLink')?['shareRom',...group]:group);localStorage.setItem('manic-settings',JSON.stringify(settings));return game.id;
  });await page.reload();
  const details=async()=>{await page.locator('.game-launch').click();await page.locator('.game-info-play').waitFor();};
  const shortcuts=['exit','restart','newState','quickLoad'];
  const assertShortcuts=async expected=>{
   assert.deepEqual(await page.locator('#sheet [data-shortcut]').evaluateAll(nodes=>nodes.map(node=>node.dataset.shortcut)),expected);
   for(const id of expected.filter(id=>id==='newState'||id==='quickLoad'))assert.ok((await page.locator(`.state-shortcuts [data-shortcut=${id}]`).innerText()).trim(),id+' has a visible label');
   for(const id of shortcuts){assert.equal(await page.locator(`#sheet [data-action=${id}]`).count(),1,id+' has exactly one entry');assert.equal(await page.locator(`#sheet-body [data-action=${id}]:not([data-shortcut])`).count(),expected.includes(id)?0:1,id+' stays in the list only when its shortcut is hidden');}
   assert.equal(await page.locator('#sheet-body [data-action=importSave],#sheet-body [data-action=export]').count(),0);assert.equal(await page.locator('#sheet-body [data-action=saveData]').count(),1);
  };
  const shot=async name=>{if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,name+'.png')});}};
  await page.evaluate(async()=>{const {MGBACore}=await import('./src/core/mgba.js'),load=MGBACore.prototype.load;window.gameLoads=0;MGBACore.prototype.load=function(...args){gameLoads++;return load.apply(this,args);};});
  const beforeOpen=await page.evaluate(async id=>JSON.stringify(await (await import('./src/storage/storage.js')).get('library',id)),gameId);
  const notStarted=async()=>{
   assert.equal(await page.locator('#player').isVisible(),false,'Choosing a game only opens its settings');
   assert.equal(await page.evaluate(()=>gameLoads),0,'Opening/closing settings must not load a core');
   assert.equal(await page.evaluate(async id=>JSON.stringify(await (await import('./src/storage/storage.js')).get('library',id)),gameId),beforeOpen,'Selection must not record playtime or change the game');
   assert.equal(await page.evaluate(async()=>{const db=await import('./src/storage/storage.js');return (await db.all('sessions')).length+(await db.all('saves')).length;}),0,'Selection must not start a save session');
  };
  await details();await notStarted();await page.locator('#close-sheet').click();
  await page.locator('.game-launch').press('Enter');await page.locator('.game-info-play').waitFor();await notStarted();await page.keyboard.press('Escape');
  await page.locator('#history').click();await page.locator(`[data-action="${gameId}"]`).click();await page.locator('.game-info-play').waitFor();await notStarted();await page.locator('#close-sheet').click();
  await page.locator('[data-details]').click();await page.locator('.game-info-play').waitFor();await notStarted();await page.locator('#close-sheet').click();
  await details();assert.equal(await page.locator('#sheet-tools button').count(),2);assert.match(await page.locator('.game-info-subtitle').textContent(),/合計1時間56分/);
  const rows=await page.locator('.native-options [data-menu-option]').evaluateAll(list=>list.map(el=>el.dataset.menuOption));
  assert.deepEqual(rows.slice(0,5),['cover','skins','category','stateList','saveData']);assert.equal(await page.locator('[data-action=importSave],[data-action=exportSaved]').count(),0);assert.ok(rows.indexOf('volume')<rows.indexOf('haptic'));assert.equal(rows.at(-1),'delete');
  assert.ok(rows.includes('switchCore'),'Supported alternate cores use the native core setting');assert.ok(!rows.includes('shareRom'),'Legacy menu order cannot restore ROM sharing');assert.ok(rows.includes('copyLink'));assert.equal(await page.getByText('ROMを共有',{exact:true}).count(),0);
  await shot('game-info-top');
  const header=await page.locator('.game-info-hero').boundingBox();await page.locator('.native-options').evaluate(el=>el.scrollTop=el.scrollHeight);assert.deepEqual(await page.locator('.game-info-hero').boundingBox(),header,'Title and play remain pinned while options scroll');await shot('game-info-bottom');
  await page.locator('.native-options').evaluate(el=>el.scrollTop=0);
  for(const width of [240,320,390,768]){await page.setViewportSize({width,height:844});assert.equal(await page.locator('#sheet').evaluate(d=>d.scrollWidth<=d.clientWidth+1),true,'Sheet fits viewport');assert.equal(await page.locator('.native-options').evaluate(d=>d.scrollWidth<=d.clientWidth+1),true,'Options fit viewport');}
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-setting=speed]').selectOption('2');assert.equal(await page.locator('[data-setting=speed]').evaluate(el=>el.closest('.native-row').querySelector('.native-value').textContent),'2倍速');
  await page.locator('[data-setting=touchControls]').uncheck();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).touchControls),true,'A game override preserves global touch controls');assert.equal(await page.evaluate(async id=>(await (await import('./src/storage/storage.js')).get('library',id)).preferences.touchControls,gameId),false,'Screen buttons off is stored for this game');await page.locator('[data-setting=touchControls]').check();
  // A slow optional module must not bind drag handlers to the next sheet.
  assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(entry=>entry.name.includes('/vendor/sortable/'))),false);
  let releaseRequest;
  const requested=page.waitForRequest('**/src/views/menu-drag.js'),release=new Promise(resolve=>{releaseRequest=resolve;});
  await page.route('**/src/views/menu-drag.js',async route=>{await release;await route.continue();},{times:1});
  await page.locator('[data-action=optionOrder]').click();await requested;
  assert.equal(await page.locator('.order-grip').first().isVisible(),false);
  await page.locator('#close-sheet').click();releaseRequest();
  await page.waitForFunction(()=>performance.getEntriesByType('resource').some(entry=>entry.name.includes('/vendor/sortable/src/Animation.js')));
  assert.equal(await page.locator('.drag-ready').count(),0);
  await page.locator('[data-action=optionOrder]').click();await page.locator('.drag-ready .order-grip').first().waitFor();
  const orderGroup=page.locator('[data-order-group="1"]');
  const visibleOrder=()=>orderGroup.locator('[data-order-id]').evaluateAll(rows=>rows.map(row=>row.dataset.orderId));
  const persistedOrder=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).menuOrder.find(group=>group.includes('stateList')));
  const original=await persistedOrder();
  assert.deepEqual(await visibleOrder(),['stateList','saveData']);
  const drag=async(from,to,touch=false)=>{
   await to.scrollIntoViewIfNeeded();
   const a=await from.boundingBox(),b=await to.boundingBox(),x=a.x+a.width/2,y=a.y+a.height/2;
   const endX=b.x+b.width/2,endY=b.y+b.height*(y>b.y?0.22:0.78);
   const cdp=touch?await context.newCDPSession(page):null;
   const move=(tx,ty)=>cdp?cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx,y:ty}]}):page.mouse.move(tx,ty);
   try{
    if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});else{await page.mouse.move(x,y);await page.mouse.down();}
    for(let i=1;i<=12;i++){await move(x+(endX-x)*i/12,y+(endY-y)*i/12);await page.waitForTimeout(20);}
    // Sortable's fallback hit-testing is sampled while the pointer is still.
    await page.waitForTimeout(80);
    if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();
   }finally{if(cdp)await cdp.detach();}
  };
  const saveGrip=page.locator('[data-order-id=saveData] .order-grip');
  const stateGrip=page.locator('[data-order-id=stateList] .order-grip');
  await drag(saveGrip,stateGrip);
  assert.deepEqual(await visibleOrder(),['saveData','stateList'],'Dragging with a pointer swaps rows');
  assert.deepEqual(await persistedOrder(),['saveData','importSave','shareSave','stateList'],'Unavailable actions keep their original slots');
  await drag(saveGrip,page.locator('[data-order-id=category] .order-grip'));
  assert.deepEqual(await visibleOrder(),['saveData','stateList'],'Dragging into a different group never transfers the option');
  await drag(stateGrip,saveGrip,kind==='chromium');
  assert.deepEqual(await persistedOrder(),original,'The touch or mouse handle can move the item back');
  await shot('menu-order-drag');await page.locator('#close-sheet').click();
  await page.locator('[data-action=optionOrder]').click();assert.match(await page.locator('[data-option=volumeLevel]').first().getAttribute('aria-label'),/音量レベル/);assert.equal(await page.locator('[data-option=shareRom]').count(),0);await page.locator('[data-option=skins][data-move="-1"]').press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.dataset.option),'skins');await page.locator('#close-sheet').click();assert.equal(await page.locator('[data-menu-option]').first().getAttribute('data-menu-option'),'skins');
  await page.locator('[data-action=optionOrder]').click();await page.locator('[data-action=reset]').click();await page.locator('#close-sheet').click();
  await page.locator('[data-action=states]').click();await page.getByText('セーブステートはありません。',{exact:true}).waitFor();assert.equal(await page.locator('#player').isVisible(),false,'State list does not start the game');await page.locator('#close-sheet').click();
  await page.locator('.game-info-play').waitFor();await page.locator('#close-sheet').click();await details();await page.locator('[data-action=rename]').click();await page.locator('#new-name').fill('Original <Test> Adventure');await page.locator('#save-name').click();await page.locator('.game-info-title h2').waitFor();assert.equal(await page.locator('.game-info-title h2').textContent(),'Original <Test> Adventure');
  await page.locator('[data-action=play]').click();await page.locator('#loading').waitFor({state:'hidden'});await page.locator('#player-menu').click();await assertShortcuts(shortcuts);assert.equal(await page.locator('[data-setting=speed]').inputValue(),'2');await shot('native-playing-menu');
  await page.locator('[data-action=newState]').click();await page.locator('[data-slot-load]').waitFor();await page.locator('#close-sheet').click();await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  // Resume a real saved state from the pre-play details scene.
  await details();await page.locator('[data-action=shortcuts]').click();await page.locator('[data-shortcut-choice=restart]').uncheck();await page.locator('#close-sheet').click();await page.locator('[data-action=states]').click();await page.locator('[data-slot-load]').click();await page.locator('#sheet').waitFor({state:'hidden'});assert.equal(await page.locator('#player').isVisible(),true);
  await page.locator('#player-menu').click();await assertShortcuts(shortcuts.filter(id=>id!=='restart'));await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  // Hiding every shortcut retains all four list actions, including real save/exit.
  await details();await page.locator('[data-action=shortcuts]').click();for(const id of shortcuts)await page.locator(`[data-shortcut-choice=${id}]`).uncheck();await page.locator('#close-sheet').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});await page.locator('#player-menu').click();await assertShortcuts([]);
  await page.locator('#sheet-body [data-action=newState]').click();await page.locator('[data-slot-load]').first().waitFor();await page.locator('#close-sheet').click();await page.locator('#player-menu').click();await page.locator('#sheet-body [data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  const beforeImport=await page.evaluate(async id=>{const db=await import('./src/storage/storage.js');return [...(await db.get('saves',id)).bytes];},gameId);
  assert.ok(beforeImport.length>0,'Battery save has data');const incoming=Buffer.from(beforeImport);incoming[0]^=255;
  await details();await page.locator('[data-action=saveData]').click();const chooser=page.waitForEvent('filechooser');await page.locator('#save-rescue-import').click();await (await chooser).setFiles({name:'test.sav',mimeType:'application/octet-stream',buffer:incoming});
  await page.getByText('セーブデータをインポートしました。',{exact:true}).waitFor();
  const imported=await page.evaluate(async id=>{const db=await import('./src/storage/storage.js');const v=await db.get('saves',id);return {first:v.bytes[0],reason:v.reason};},gameId);assert.deepEqual(imported,{first:incoming[0],reason:'import'});
  assert.equal(await page.locator('#player').isVisible(),false,'Pre-play save import does not start visible gameplay');
  assert.deepEqual(await page.evaluate(async id=>[...(await (await import('./src/storage/storage.js')).get('backups',id))[0].bytes],gameId),beforeImport,'Import retains the previous battery save');
  const exported=page.waitForEvent('download');await page.locator('[data-action=saveData]').click();await page.locator('#save-rescue-export').click();await page.locator('[data-export-save]').click();const saveFile=await exported;
  const chunks=[];for await(const chunk of await saveFile.createReadStream())chunks.push(chunk);
  assert.ok(saveFile.suggestedFilename().endsWith('.sav'));assert.deepEqual(Buffer.concat(chunks),incoming,'Pre-play save export remains intact');
  await page.locator('[data-export-close]').click();await page.locator('#save-rescue-export').waitFor();await page.locator('#close-sheet').click();
  assert.deepEqual(await page.evaluate(async id=>[...await (await import('./src/storage/storage.js')).get('roms',id)],gameId),[...require('./cartridges.cjs').gb()],'Removing share never alters the imported ROM');
  await page.locator('[data-action=safeMode]').click();await page.locator('[data-action=start]').click();await page.locator('#loading').waitFor({state:'hidden'});assert.equal(await page.locator('#sheet').isVisible(),false);
  await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  await page.locator('[data-tab=settings]').click();await page.locator('.settings-page').waitFor();
  assert.equal((await page.locator('.settings-page [data-action=skins]').innerText()).trim(),'スキン');
  for(const file of ['privacy.html','licenses.html','update.html']){
   await page.locator(`.settings-page a[href="${file}"]`).click();await page.getByRole('link',{name:'戻る',exact:true}).click();
   await page.locator('.settings-page').waitFor();assert.equal(new URL(page.url()).hash,'#settings');
   await page.locator(`.settings-page a[href="${file}"]`).click();await page.waitForURL(new URL(file,base).href);await page.goBack();await page.locator('.settings-page').waitFor();
  }
  await page.reload();await page.locator('.settings-page').waitFor();
  await page.goto(new URL('index.html#game='+gameId,base).href);await page.locator('.game-info-title h2').waitFor();assert.equal(await page.locator('#player').isVisible(),false,'Game links still open details');
  assert.deepEqual(errors,[]);console.log('PASS: native details/settings and safe save actions, fixed headers, settings return links/browser history/reload and game links.');
  await context.close();
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
