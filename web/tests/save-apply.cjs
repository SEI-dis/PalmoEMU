// SPDX-License-Identifier: AGPL-3.0-or-later
// Exercise file import and in-app save application with an authored GB program.
// The exposed API exists only in this intercepted test copy of game-info.js.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});try{
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',error=>errors.push(error.message));context.on('request',request=>requests.push(request));
 const source=fs.readFileSync(path.join(__dirname,'../src/views/game-info.js'),'utf8');
 assert.ok(source.includes('export function createGameInfo(api){'));
 await context.route('**/src/views/game-info.js',route=>route.fulfill({contentType:'text/javascript',body:source.replace('export function createGameInfo(api){','export function createGameInfo(api){ globalThis.testSaveAPI=api;')}));
 await page.goto(base+'privacy.html');
 await page.evaluate(async rom=>{
  const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),bytes=new Uint8Array(8192).fill(9);
  localStorage.setItem('manic-settings',JSON.stringify({autosave:false,recovery:false}));
  for(const id of ['apply-fixture','other-fixture'])await db.addGame({id,name:id,system:'gb',size:rom.length},new Uint8Array(rom));
  const old={bytes,hash:await hash(bytes),at:1,coreId:'mgba-rom64-save6-v2'};
  await db.put('saves','apply-fixture',old);await db.put('recoveries','apply-fixture',[{...old,save:bytes}]);await db.put('states','apply-fixture:manual',old);
 },[...require('./cartridges.cjs').gb()]);
 await page.goto(base);await page.locator('[data-game-id="apply-fixture"],.game-launch').first().waitFor();
 await page.evaluate(async()=>{
  const db=await import('./src/storage/storage.js'),{MGBACore}=await import('./src/core/mgba.js');
  window.testGame=await db.get('library','apply-fixture');window.testCalls={load:0,close:0,restore:0};
  const load=MGBACore.prototype.load,close=MGBACore.prototype.close,restore=MGBACore.prototype.restore;
  MGBACore.prototype.load=async function(...args){testCalls.load++;window.testCore=this;if(window.testLoadGate)await window.testLoadGate;return load.apply(this,args);};
  MGBACore.prototype.restore=function(...args){testCalls.restore++;if(window.testRestoreFailure)throw Error('Synthetic restore failure');return restore.apply(this,args);};
  MGBACore.prototype.close=function(...args){testCalls.close++;const result=close.apply(this,args);if(window.testCloseFailure)throw Error('Synthetic close failure');return result;};
  window.testSnapshot=async()=>JSON.stringify(await Promise.all(['saves','backups','archives','recoveries','states'].map(store=>db.get(store,store==='states'?'apply-fixture:manual':'apply-fixture'))));
 });
 const validation=await page.evaluate(async()=>{
  const {coreFor}=await import('./src/core/core-registry.js'),before=await testSnapshot(),messages=[];
  for(const value of [new ArrayBuffer(8),new Uint8Array(),new Uint8Array(coreFor(testGame).maxSave+1),new TextEncoder().encode('LPJGSV01payload')]){
   try{await testSaveAPI.applySave(testGame,value);throw Error('Accepted invalid save');}catch(error){messages.push(error.message);}
  }
  return {messages,unchanged:before===await testSnapshot(),calls:testCalls};
 });
 assert.deepEqual(validation.calls,{load:0,close:0,restore:0});assert.equal(validation.unchanged,true);assert.ok(validation.messages.slice(0,3).every(message=>message.includes('サイズ')));assert.match(validation.messages[3],/jgenesis/);
 const applied=await page.evaluate(async()=>{
  const bytes=new Uint8Array(8192).fill(22);await testSaveAPI.applySave(testGame,bytes);
  const db=await import('./src/storage/storage.js'),{updateTasksPending}=await import('./src/updates/update-activity.js');
  return {first:(await db.get('saves',testGame.id)).bytes[0],backup:(await db.get('backups',testGame.id))[0].bytes[0],recovery:await db.has('recoveries',testGame.id),manual:(await db.get('states',testGame.id+':manual')).bytes[0],input:bytes[0],lock:await navigator.locks.request('local-game:'+testGame.id,{ifAvailable:true},lock=>!!lock),pending:updateTasksPending(),calls:testCalls};
 });
 assert.deepEqual(applied,{first:22,backup:9,recovery:false,manual:9,input:22,lock:true,pending:false,calls:{load:1,close:1,restore:1}});
 assert.equal(await page.locator('#player').isVisible(),false);await page.locator('.game-info-play').waitFor();
 console.log('PASS '+kind+': direct apply uses real core, retains backup/manual state, clears obsolete recovery and releases lock');
 // Extension validation remains at the file boundary, and content validation
 // also rejects a jgenesis envelope renamed to .sav.
 const choose=async(name,buffer)=>{if(await page.locator('[data-action=saveData]').count())await page.locator('[data-action=saveData]').click();const chosen=page.waitForEvent('filechooser');await page.locator('#save-rescue-import').click();await(await chosen).setFiles({name,mimeType:'application/octet-stream',buffer});};
 for(const [name,bytes,pattern]of [['wrong.txt',Buffer.alloc(8192),/対応するセーブ/],['wrong.jgsav',Buffer.alloc(8192),/jgenesis/],['renamed.sav',Buffer.from('LPJGSV01payload'),/jgenesis/],['empty.sav',Buffer.alloc(0),/サイズ/]]){
  await choose(name,bytes);await page.waitForFunction(()=>document.querySelector('#save-input').value==='');assert.match(await page.locator('#toast').textContent(),pattern);
 }
 await choose('accepted.sav',Buffer.alloc(8192,33));await page.waitForFunction(async()=>{const db=await import('./src/storage/storage.js');return (await db.get('saves','apply-fixture'))?.bytes[0]===33;});
 await page.waitForFunction(()=>document.querySelector('#save-input').value==='');assert.equal(await page.evaluate(()=>testCalls.load),2);
 console.log('PASS '+kind+': filename/type checks and valid file import share the direct-apply path');
 const failure=await page.evaluate(async()=>{
  const before=await testSnapshot(),db=await import('./src/storage/storage.js');let message;
  testRestoreFailure=true;testCloseFailure=true;
  try{await testSaveAPI.applySave(testGame,new Uint8Array(8192).fill(44));}catch(error){message=error.message;}finally{testRestoreFailure=false;testCloseFailure=false;}
  return {message,unchanged:before===await testSnapshot(),lock:await navigator.locks.request('local-game:'+testGame.id,{ifAvailable:true},lock=>!!lock),disabled:document.querySelector('#close-sheet').disabled,pending:(await import('./src/updates/update-activity.js')).updateTasksPending()};
 });
 assert.deepEqual(failure,{message:'Synthetic close failure',unchanged:true,lock:true,disabled:false,pending:false});
 const peer=await context.newPage();await peer.goto(base+'privacy.html');
 await peer.evaluate(()=>{window.lockHeld=new Promise(resolve=>{navigator.locks.request('local-game:apply-fixture',async()=>{resolve();await new Promise(done=>window.unlock=done);});});return lockHeld;});
 const blocked=await page.evaluate(async()=>{const before=await testSnapshot(),loads=testCalls.load;let message;try{await testSaveAPI.applySave(testGame,new Uint8Array(8192).fill(44));}catch(error){message=error.message;}return {message,unchanged:before===await testSnapshot(),loads:testCalls.load-loads};});
 assert.match(blocked.message,/別のタブ/);assert.equal(blocked.unchanged,true);assert.equal(blocked.loads,0);await peer.evaluate(()=>unlock());await peer.close();
 const concurrent=await page.evaluate(async()=>{
  let release;window.testLoadGate=new Promise(resolve=>release=resolve);const applying=testSaveAPI.applySave(testGame,new Uint8Array(8192).fill(44));
  let message;try{await testSaveAPI.applySave(testGame,new Uint8Array(8192).fill(45));}catch(error){message=error.message;}
  const during={message,launch:await testSaveAPI.launch(testGame),pending:(await import('./src/updates/update-activity.js')).updateTasksPending(),disabled:document.querySelector('#close-sheet').disabled};
  release();await applying;window.testLoadGate=null;return during;
 });
 assert.deepEqual(concurrent,{message:'処理が完了してからやり直してください。',launch:false,pending:true,disabled:true});
 console.log('PASS '+kind+': failed restore/close releases protection; cross-tab lock and concurrent operations preserve saved data');
 // A running game uses its existing protection/engine. Another game cannot
 // be imported into that engine, even when a stale picker finishes late.
 await page.locator('[data-action=play]').click();await page.locator('#loading').waitFor({state:'hidden'});await page.locator('#player-menu').click();
 // A real aborted IndexedDB import must restore the running core too, not
 // leave imported cartridge RAM paired with the old CPU/game state.
 const aborted=await page.evaluate(async()=>{
  const db=await import('./src/storage/storage.js'),before=Array.from(await testCore.save()),put=IDBObjectStore.prototype.put;let failures=0,message;
  IDBObjectStore.prototype.put=function(value,...rest){if(this.name==='saves'&&value?.reason==='import'){failures++;throw new DOMException('Synthetic failed live import','QuotaExceededError');}return put.call(this,value,...rest);};
  try{await testSaveAPI.applySave(testGame,new Uint8Array(8192).fill(54));}catch(error){message=error.name;}finally{IDBObjectStore.prototype.put=put;}
  return {message,failures,memoryUnchanged:JSON.stringify(before)===JSON.stringify(Array.from(await testCore.save())),stored:(await db.get('saves',testGame.id)).bytes[0],paused:testCore.paused,disabled:document.querySelector('#close-sheet').disabled};
 });
 assert.deepEqual(aborted,{message:'QuotaExceededError',failures:1,memoryUnchanged:true,stored:44,paused:true,disabled:false});
 console.log('PASS '+kind+': aborted live import restores original cartridge RAM and keeps the old save');
 const live=await page.evaluate(async()=>{
  const db=await import('./src/storage/storage.js'),other=await db.get('library','other-fixture'),before=await testSnapshot(),calls={...testCalls};let message;
  try{await testSaveAPI.applySave(other,new Uint8Array(8192).fill(55));}catch(error){message=error.message;}
  const unchanged=before===await testSnapshot();await testSaveAPI.applySave(testGame,new Uint8Array(8192).fill(55));
  return {message,unchanged,first:(await db.get('saves',testGame.id)).bytes[0],backup:(await db.get('backups',testGame.id))[0].bytes[0],load:testCalls.load-calls.load,close:testCalls.close-calls.close,recovery:await db.has('recoveries',testGame.id)};
 });
 assert.deepEqual(live,{message:'プレイ中のゲームを終了してから読み込んでください。',unchanged:true,first:55,backup:44,load:0,close:0,recovery:false});
 assert.equal(await page.locator('#sheet').isVisible(),false);assert.equal(await page.locator('#player').isVisible(),true);assert.deepEqual(errors,[]);
 await page.locator('#player-menu').click();
 // Fail before capture, after a partial save import, and after reset. Every
 // rejection must leave the old save usable and the current session paused.
 const faults=await page.evaluate(async()=>{
  const db=await import('./src/storage/storage.js'),results=[];
  for(const method of ['state','restore','reset']){
   const original=testCore[method];let once=true;
   testCore[method]=async function(...args){if(once){once=false;if(method!=='state')await original.apply(this,args);throw Error('Synthetic '+method+' failure');}return original.apply(this,args);};
   let message;try{await testSaveAPI.applySave(testGame,new Uint8Array(8192).fill(66));}catch(error){message=error.message;}finally{testCore[method]=original;}
   results.push({message,live:(await testCore.save())[0],stored:(await db.get('saves',testGame.id)).bytes[0],paused:testCore.paused});
  }
  return results;
 });
 assert.deepEqual(faults,['state','restore','reset'].map(method=>({message:'Synthetic '+method+' failure',live:55,stored:55,paused:true})));
 // Model a lost acknowledgment after a real successful commit. The app must
 // not roll back to old RAM and then overwrite the committed import on exit.
 const uncertain=await page.evaluate(async()=>{
  const db=await import('./src/storage/storage.js'),{SaveProtection}=await import('./src/storage/save-safety.js'),save=SaveProtection.prototype.save;let unknown=false;
  SaveProtection.prototype.save=async function(core,options){const result=await save.call(this,core,options);if(options?.reason==='import')throw Object.assign(Error('Synthetic lost acknowledgment'),{saveOutcomeUnknown:true});return result;};
  try{await testSaveAPI.applySave(testGame,new Uint8Array(8192).fill(66));}catch(error){unknown=error.saveOutcomeUnknown;}finally{SaveProtection.prototype.save=save;}
  return {unknown,stored:(await db.get('saves',testGame.id)).bytes[0],backup:(await db.get('backups',testGame.id))[0].bytes[0],reason:(await db.get('saves',testGame.id)).reason,closed:testCore.closed};
 });
 assert.deepEqual(uncertain,{unknown:true,stored:66,backup:55,reason:'import',closed:true});
 assert.equal(await page.locator('#player').isVisible(),false);
 await page.evaluate(()=>testSaveAPI.launch(testGame));await page.locator('#player-menu').click();
 // If even rollback fails, discard the unsafe core without saving it again.
 const fatal=await page.evaluate(async()=>{
  const db=await import('./src/storage/storage.js'),put=IDBObjectStore.prototype.put,loadState=testCore.loadState;let message;
  IDBObjectStore.prototype.put=function(value,...rest){if(this.name==='saves'&&value?.reason==='import')throw new DOMException('Synthetic failed live import','QuotaExceededError');return put.call(this,value,...rest);};
  testCore.loadState=()=>{throw Error('Synthetic failed rollback');};
  try{await testSaveAPI.applySave(testGame,new Uint8Array(8192).fill(77));}catch(error){message=error.name;}finally{IDBObjectStore.prototype.put=put;testCore.loadState=loadState;}
  return {message,stored:(await db.get('saves',testGame.id)).bytes[0],closed:testCore.closed,lock:await navigator.locks.request('local-game:'+testGame.id,{ifAvailable:true},lock=>!!lock),pending:(await import('./src/updates/update-activity.js')).updateTasksPending()};
 });
 assert.deepEqual(fatal,{message:'QuotaExceededError',stored:66,closed:true,lock:true,pending:false});
 assert.equal(await page.locator('#player').isVisible(),false);
 console.log('PASS '+kind+': capture/partial-restore/reset failures roll back; failed rollback exits without overwriting saves');
 // WebKit reports the local object URLs used by skin images as requests too.
 assert.deepEqual(requests.filter(request=>!['GET','HEAD'].includes(request.method())||new URL(request.url()).origin!==new URL(base).origin).map(request=>({method:request.method(),url:request.url()})),[],'No uploads or external requests');
 console.log('PASS '+kind+': live apply reuses current core; another-game import rejects without modifying saves');
 await context.close();
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
