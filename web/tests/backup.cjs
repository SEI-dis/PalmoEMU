// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated synthetic cartridges and save bytes. Never reads a user's library.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const engine=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{
 const browser=await runtime[engine].launch({headless:true,...(engine==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage(),requests=[];
  context.on('request',r=>requests.push(r.url()));await page.goto(base);
  await page.locator('#add-first').waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
  await page.evaluate(async()=>{window.backup=await import('./src/storage/backup.js');window.db=await import('./src/storage/storage.js');window.digest=(await import('./src/shared.js')).hash;});
  const fixture=await page.evaluate(async()=>{
   const a='a'.repeat(64),b='b'.repeat(64),canary='c'.repeat(64),missing='d'.repeat(64),at=1720000000000;
   window.fixture={a,b,canary,missing};
   const layout={portrait:{dpad:{x:.1,y:.8,opacity:.6,scale:1.2}},landscape:{screen:{x:.2,y:0,scale:1.4}}};
   await db.addGame({id:a,system:'gba',size:16,name:'Original game',category:'playing',favorite:true,cover:'COVER_PRIVATE_CANARY',skinId:'SKIN_PRIVATE_CANARY',filename:'ROM_PRIVATE_CANARY.gba',coreKey:'mgba',preferences:{volume:.2,speed:2},controlLayout:layout,cheats:[{name:'Synthetic cheat',code:'0'.repeat(16384),type:4,enabled:false}]},new Uint8Array(16).fill(211));
   await db.addGame({id:b,system:'nds',size:32,name:'NDS fixture',category:'completed',favorite:false,preferences:{ndsPowerSave:false},controlLayout:{portrait:{'screen-main':{x:0,y:.1,scale:1},'screen-sub':{x:0,y:.5,scale:.8}}}},new Uint8Array(32).fill(212));
   await db.addGame({id:canary,system:'gb',size:8,name:'Unrelated'},new Uint8Array(8).fill(213));
   const save=async(bytes,coreId)=>({bytes:new Uint8Array(bytes),hash:await digest(new Uint8Array(bytes)),at,coreId,reason:'SECRET_REASON'});
   const state=async(bytes,coreId)=>({...await save(bytes,coreId),save:new Uint8Array([9,8]),saveHash:await digest(new Uint8Array([9,8])),image:'SCREEN_PRIVATE_CANARY',sessionId:'SESSION_PRIVATE_CANARY'});
   await db.put('saves',a,await save([1,2,3],'mgba-rom64-save6-v2'));
   await db.put('saves',a+'@vba-next',await save([4,5,6],'vba-next-web-v1'));
   await db.put('saves',a+'@link-2p',await save([7,8,9],'mgba-rom64-save6-v2'));
   await db.put('states',a+':manual-1',await state([11,12,13],'mgba-rom64-save6-v2'));
   await db.put('states',a+'@vba-next:manual-2',await state([14,15,16],'vba-next-web-v1'));
   await db.put('backups',a,[await save([21,22],'mgba-rom64-save6-v2')]);
   await db.put('archives',a,await Promise.all(Array.from({length:10},(_,i)=>save([61,i],'mgba-rom64-save6-v2'))));
   await db.put('recoveries',a,[await state([31,32],'mgba-rom64-save6-v2')]);
   await db.put('recoveries',a+'@link-2p',[await state([33,34],'mgba-rom64-save6-v2')]);
   await db.put('saves',b,await save([41,42],'desmume2015-web-v1'));
   await db.put('states',b+':nds-state',await state([43,44],'desmume2015-web-v1'));
   await db.put('saves',canary,await save([51,52],'mgba-rom64-save6-v2'));
   await db.put('sessions',a,{id:'SESSION_PRIVATE_CANARY',dirty:true});
   await db.put('coverCatalogs','cover-canary',{private:'CATALOG_PRIVATE_CANARY'});
   await db.put('skins','skin-canary',{private:'SKIN_BYTES_PRIVATE_CANARY'});
   localStorage.setItem('palmo-diagnostics-v1','DIAGNOSTICS_PRIVATE_CANARY');localStorage.setItem('unrelated','LOCAL_CANARY');
   window.settings={theme:'light',volume:.8,speed:3,recovery:true,autosave:true,showFps:true,rewindEnabled:true,skins:{gba:'SKIN_PRIVATE_CANARY'},controlLayouts:{gba:layout},inputControls:{version:1,profiles:{gba:{keyboard:{KeyX:'a'},gamepad:{b0:'a'}}},assist:{gba:{interval:100,modes:{a:'turbo'}}}},unknown:'PRIVATE_UNKNOWN_SETTING'};
   localStorage.setItem('manic-settings',JSON.stringify(settings));
   const result=await backup.createBackup(settings);window.original=result;return {a,b,canary,text:result.text,summary:result.summary};
  });
  assert.equal(fixture.summary.games,3);assert.equal(fixture.summary.records,12);
  for(const secret of ['COVER_PRIVATE','SKIN_PRIVATE','ROM_PRIVATE','SCREEN_PRIVATE','SESSION_PRIVATE','SECRET_REASON','CATALOG_PRIVATE','SKIN_BYTES_PRIVATE','DIAGNOSTICS_PRIVATE','PRIVATE_UNKNOWN_SETTING'])assert.ok(!fixture.text.includes(secret),'Excluded '+secret);
  const archive=JSON.parse(fixture.text);assert.equal(archive.games.find(g=>g.id===fixture.b).controlLayout.portrait['screen-sub'].scale,.8);
  assert.deepEqual(archive.games.map(({category,favorite})=>({category,favorite})),[{category:'playing',favorite:true},{category:'completed',favorite:false},{category:'',favorite:false}],'New backups explicitly represent every classification and favorite value');
  assert.deepEqual(archive.settings.inputControls.profiles.gba.keyboard,{KeyX:'a'});
  assert.equal(archive.games[0].cheats[0].code.length,16384,'The full UI cheat-code limit remains portable');
  const barrier=await page.evaluate(async()=>{
   const {updateTasksPending}=await import('./src/updates/update-activity.js'),realGet=IDBObjectStore.prototype.get,realCursor=IDBObjectStore.prototype.openCursor;let romReads=0;
   IDBObjectStore.prototype.get=function(...args){if(this.name==='roms')romReads++;return realGet.apply(this,args);};
   IDBObjectStore.prototype.openCursor=function(...args){if(this.name==='roms')romReads++;return realCursor.apply(this,args);};
   try{const task=backup.createBackup(settings),during=updateTasksPending();await task;return {during,after:updateTasksPending(),romReads};}finally{IDBObjectStore.prototype.get=realGet;IDBObjectStore.prototype.openCursor=realCursor;}
  });assert.deepEqual(barrier,{during:true,after:false,romReads:0});
  // Patch-only preferences preserve concurrent metadata and null truly inherits.
  assert.deepEqual(await page.evaluate(async()=>{
   const {a}=fixture;await db.setGamePreferences(a,{speed:5,unknown:'secret'});const one=await db.get('library',a);await db.setGamePreferences(a,null);const two=await db.get('library',a);return {preferences:one.preferences,name:one.name,cover:one.cover,cleared:!Object.hasOwn(two,'preferences')};
  }),{preferences:{speed:5},name:'Original game',cover:'COVER_PRIVATE_CANARY',cleared:true});
  // Preserve current values in the prior snapshot; restore replaces matching
  // save/state sets while keeping all ROM, asset and session records untouched.
  const restored=await page.evaluate(async()=>{
   const {a}=fixture;await db.put('saves',a,{bytes:new Uint8Array([99]),hash:await digest(new Uint8Array([99])),at:Date.now(),coreId:'mgba-rom64-save6-v2'});
   await db.put('states',a+':newer',{bytes:new Uint8Array([98]),hash:await digest(new Uint8Array([98])),save:null,saveHash:null,at:Date.now(),coreId:'mgba-rom64-save6-v2'});
   const game=await db.get('library',a);game.name='Latest renamed game';game.favorite=false;game.category='backlog';await db.put('library',a,game);
   for(const id of [fixture.b,fixture.canary])await db.put('library',id,{...await db.get('library',id),favorite:true,category:'backlog'});
   localStorage.setItem('manic-settings',JSON.stringify({theme:'dark',volume:.6,skins:{gba:'SKIN_PRIVATE_CANARY'}}));
   const before=await db.readBackupData();window.beforeRestore=before;const plan=await backup.inspectBackup(original.text);const result=await backup.restoreBackup(plan,{settings:{theme:'dark',volume:.6},includeSettings:true});
   const previous=await backup.previousBackup();return {result,previous:previous.archive,game:await db.get('library',a),other:await db.get('library',fixture.b),unclassified:await db.get('library',fixture.canary),save:[...(await db.get('saves',a)).bytes],oldState:await db.has('states',a+':newer'),rom:[...await db.get('roms',a)],session:await db.get('sessions',a),skin:await db.get('skins','skin-canary'),catalog:await db.get('coverCatalogs','cover-canary'),diagnostics:localStorage.getItem('palmo-diagnostics-v1'),unrelated:localStorage.getItem('unrelated')};
  });
  assert.equal(restored.result.games,3);assert.deepEqual(restored.save,[1,2,3]);assert.equal(restored.oldState,false);assert.equal(restored.game.name,'Latest renamed game');assert.equal(restored.game.favorite,true);assert.equal(restored.game.cover,'COVER_PRIVATE_CANARY');assert.deepEqual(restored.game.preferences,{volume:.2,speed:2});assert.equal(restored.rom.length,16);assert.ok(restored.rom.every(n=>n===211));assert.equal(restored.session.id,'SESSION_PRIVATE_CANARY');assert.equal(restored.skin.private,'SKIN_BYTES_PRIVATE_CANARY');assert.equal(restored.catalog.private,'CATALOG_PRIVATE_CANARY');assert.equal(restored.diagnostics,'DIAGNOSTICS_PRIVATE_CANARY');assert.equal(restored.unrelated,'LOCAL_CANARY');
  assert.equal(restored.previous.settings.theme,'dark');assert.equal(restored.previous.records.find(r=>r.store==='saves'&&r.key===fixture.a).value.bytes,'Yw==');assert.ok(restored.previous.records.some(r=>r.key===fixture.a+':newer'));
  assert.equal(restored.game.category,'playing');assert.equal(restored.other.category,'completed');assert.equal(restored.other.favorite,false);assert.equal(Object.hasOwn(restored.unclassified,'category'),false);assert.equal(!!restored.unclassified.favorite,false,'Explicit false and unclassified clear later library edits');
  assert.deepEqual(restored.previous.games.map(({category,favorite})=>({category,favorite})),[{category:'backlog',favorite:false},{category:'backlog',favorite:true},{category:'backlog',favorite:true}],'The retained prior snapshot includes library classifications');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).skins.gba),'SKIN_PRIVATE_CANARY','Local skin selections survive settings restore');
  // Every encoded record, including secondary cores and 2P save/recovery, survives.
  const roundtrip=await page.evaluate(async()=>{const result=await backup.createBackup(original.archive.settings);return {records:result.archive.records,games:result.archive.games};});assert.deepEqual(roundtrip,{records:archive.records,games:archive.games});
  // Old archives omit these independent optional fields. Omission preserves
  // current metadata; explicit empty/false still performs a deliberate reset.
  const legacy=await page.evaluate(async()=>{
   const source=structuredClone(original.archive);for(const game of source.games){delete game.category;delete game.favorite;}
   const {a}=fixture;await db.put('library',a,{...await db.get('library',a),category:'backlog',favorite:true});
   const restore=async data=>backup.restoreBackup(await backup.inspectBackup(JSON.stringify(data)),{settings,includeSettings:true});
   const metadata=async()=>{const game=await db.get('library',a);return {category:game.category,favorite:game.favorite};};
   await restore(source);const absent=await metadata();
   const categoryOnly=structuredClone(source);categoryOnly.games.find(game=>game.id===a).category='';await restore(categoryOnly);const category=await metadata();
   await db.put('library',a,{...await db.get('library',a),category:'completed'});
   const favoriteOnly=structuredClone(source);favoriteOnly.games.find(game=>game.id===a).favorite=false;await restore(favoriteOnly);const favorite=await metadata();
   await backup.restoreBackup(await backup.inspectBackup(original.text),{settings,includeSettings:true});return {absent,category,favorite};
  });assert.deepEqual(legacy,{absent:{category:'backlog',favorite:true},category:{category:undefined,favorite:true},favorite:{category:'completed',favorite:false}});
  // Unavailable games are previewed and skipped, never made into ghost entries.
  const missing=await page.evaluate(async()=>{
   const source=structuredClone(original.archive);source.games=source.games.filter(g=>g.id===fixture.a);source.records=source.records.filter(r=>r.key.startsWith(fixture.a));source.games.push({...source.games[0],id:fixture.missing});source.records.push({store:'saves',key:fixture.missing,value:source.records.find(r=>r.store==='saves'&&r.key===fixture.a).value});
   const plan=await backup.inspectBackup(JSON.stringify(source));window.partial=JSON.stringify(source);await backup.restoreBackup(plan,{settings,includeSettings:true});return {matched:plan.matched,missing:plan.missing,library:await db.has('library',fixture.missing),rom:await db.has('roms',fixture.missing),save:await db.has('saves',fixture.missing),canary:[...(await db.get('saves',fixture.canary)).bytes]};
  });assert.deepEqual(missing,{matched:1,missing:1,library:false,rom:false,save:false,canary:[51,52]});
  const invalid=await page.evaluate(async()=>{
   const cases=[a=>a.extra='ROM',a=>a.version=99,a=>a.games[0].system='nes',a=>a.games[0].size++,a=>a.games.push(a.games[0]),a=>a.settings.remoteUrl='https://example.invalid',a=>a.settings.speed=42,a=>a.games[0].preferences={volume:5},a=>a.records[0].value.hash='f'.repeat(64),a=>a.records[0].value.coreId='unknown-core',a=>a.records[0].value.bytes='AA=A',a=>a.records[0].key='../../roms',a=>a.records.push(a.records[0]),a=>a.records[0].value.image='https://example.invalid',a=>a.records[0].store='roms',a=>a.records.find(r=>r.store==='states').value.saveHash='f'.repeat(64),a=>a.records[0].value.at=-1];
   for(const category of ['unknown','Playing',false,null,[],{}])cases.push(a=>a.games[0].category=category);
   for(const favorite of [0,1,'true','false',null,[],{}])cases.push(a=>a.games[0].favorite=favorite);
   const result=[];for(const mutate of cases){const data=structuredClone(original.archive);mutate(data);try{await backup.inspectBackup(JSON.stringify(data));result.push(false);}catch{result.push(true);}}return result;
  });assert.ok(invalid.every(Boolean),'Every corrupt/unknown/mismatched archive rejected');
  const changedAfterPreview=await page.evaluate(async()=>{
   const plan=await backup.inspectBackup(original.text),game=await db.get('library',fixture.a),save=await db.get('saves',fixture.a);await db.put('library',fixture.a,{...game,size:game.size+1});
   let rejected=false;try{await backup.restoreBackup(plan,{settings,includeSettings:true});}catch(e){rejected=/ゲーム一覧が変わりました/.test(e.message);}finally{await db.put('library',fixture.a,game);}
   return {rejected,same:(await db.get('saves',fixture.a)).hash===save.hash};
  });assert.deepEqual(changedAfterPreview,{rejected:true,same:true});
  const large=await page.evaluate(async()=>{try{await backup.inspectBackup(new Blob([new Uint8Array(backup.backupLimits.file+1)]));return false;}catch(e){return /192/.test(e.message);}});assert.equal(large,true);
  // A distinct tab holding an actual Web Lock blocks before the first write.
  const other=await context.newPage();await other.goto(base);await other.evaluate(id=>{window.held=false;window.task=navigator.locks.request('local-game:'+id,async()=>{window.held=true;await new Promise(resolve=>window.release=resolve);});},fixture.a);await other.waitForFunction(()=>held);
  const locked=await page.evaluate(async()=>{const plan=await backup.inspectBackup(original.text);try{await backup.restoreBackup(plan,{settings,includeSettings:true});return false;}catch(e){return /プレイ中/.test(e.message);}});assert.equal(locked,true);await other.evaluate(async()=>{release();await task;});await other.close();
  // Deliberate mid-transaction failure must roll back metadata, deleted/inserted
  // states, saves, previous snapshot AND pending settings together.
  const rollback=await page.evaluate(async()=>{
   const plan=await backup.inspectBackup(original.text),before=await backup.createBackup(settings),previous=await backup.previousBackup(),oldSettings=localStorage.getItem('manic-settings');
   const real=IDBObjectStore.prototype.put;let injected=false;
   IDBObjectStore.prototype.put=function(...args){if(this.name==='states'&&!injected){injected=true;throw new DOMException('synthetic quota','QuotaExceededError');}return real.apply(this,args);};
   let rejected=false;try{await backup.restoreBackup(plan,{settings,includeSettings:true});}catch{rejected=true;}finally{IDBObjectStore.prototype.put=real;}
   const after=await backup.createBackup(settings),afterPrevious=await backup.previousBackup();
   return {injected,rejected,same:JSON.stringify(before.archive.records)===JSON.stringify(after.archive.records)&&JSON.stringify(before.archive.games)===JSON.stringify(after.archive.games),previousSame:JSON.stringify(previous.archive.records)===JSON.stringify(afterPrevious.archive.records),settingsSame:oldSettings===localStorage.getItem('manic-settings'),pending:await db.has('coverCatalogs',db.backupMetadataPrefix+'pending')};
  });assert.deepEqual(rollback,{injected:true,rejected:true,same:true,previousSame:true,settingsSame:true,pending:false});
  // Simulate interruption after IDB commits but before localStorage completion.
  const journal=await page.evaluate(async()=>{
   const plan=await backup.inspectBackup(original.text),real=Storage.prototype.setItem;let calls=0,rejected=false;
   Storage.prototype.setItem=function(key,value){if(key==='manic-settings'&&++calls===2)throw new DOMException('synthetic quota','QuotaExceededError');return real.call(this,key,value);};
   try{await backup.restoreBackup(plan,{settings,includeSettings:true});}catch(e){rejected=/設定を保存できません/.test(e.message);}finally{Storage.prototype.setItem=real;}
   const pending=await db.has('coverCatalogs',db.backupMetadataPrefix+'pending');await backup.applyPendingBackupSettings();return {rejected,pending,done:!await db.has('coverCatalogs',db.backupMetadataPrefix+'pending'),theme:JSON.parse(localStorage.getItem('manic-settings')).theme};
  });assert.deepEqual(journal,{rejected:true,pending:true,done:true,theme:'light'});
  // Real view: selection only previews, confirmation is a separate user action.
  await page.evaluate(async()=>{
   window.downloads=[];const {createBackupView}=await import('./src/views/backup.js');
   const show=createBackupView({settings,sheet(title,body){document.querySelector('#sheet-title').textContent=title;document.querySelector('#sheet-body').innerHTML=body;document.querySelector('#sheet').showModal();},download(bytes,name){downloads.push({text:new TextDecoder().decode(bytes),name});return 'download';},onRestored(){window.restoredUI=true;}});show();
  });
  await page.locator('#backup-mode-restore').click();await page.locator('#backup-import').setInputFiles({name:'test-backup.json',mimeType:'application/json',buffer:Buffer.from(fixture.text)});await page.locator('#backup-confirm').waitFor();assert.equal(await page.evaluate(()=>!!window.restoredUI),false);await page.locator('#backup-confirm').click();await page.locator('#backup-reload').waitFor();assert.equal(await page.evaluate(()=>!!window.restoredUI),false);await page.locator('#backup-reload').click();await page.waitForFunction(()=>window.restoredUI===true);
  await page.locator('#backup-previous').click();await page.waitForFunction(()=>downloads.length===1);assert.match(await page.evaluate(()=>downloads[0].name),/^PalmoEMU-before-restore-/);
  await page.screenshot({path:`web/test-results/backup-${engine}-390.png`});
  assert.ok(requests.filter(url=>/^https?:/.test(url)).every(url=>new URL(url).origin===new URL(base).origin),'Backup never uploads to remote services');
  console.log(`PASS ${engine}: backup roundtrip/core/2P/category/favorite, legacy metadata preservation and explicit reset, strict validation, missing ROMs, real cross-tab lock, atomic quota rollback, settings journal, canaries and explicit preview/restore UI`);
  await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
