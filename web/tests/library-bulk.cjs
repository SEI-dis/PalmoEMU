// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});try{
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy')&&localStorage.getItem('manic-settings')!==null);
 await page.evaluate(async()=>{
  window.db=await import('./src/storage/storage.js');window.activity=await import('./src/updates/update-activity.js');
  window.ids=['a','b','a-canary'];window.stores=['library','roms','saves','states','backups','archives','recoveries','sessions','skins','coverCatalogs'];
  window.snapshot=async()=>{const connection=await new Promise((resolve,reject)=>{const r=indexedDB.open('manicemu-web');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const tx=connection.transaction(stores),out={};for(const name of stores){out[name]=[];const r=tx.objectStore(name).openCursor();r.onsuccess=()=>{const c=r.result;if(c){out[name].push([c.key,c.value]);c.continue();}};}tx.oncomplete=()=>resolve(JSON.stringify(out));tx.onabort=()=>reject(tx.error);});}finally{connection.close();}};
  for(const id of ids){
   await db.addGame({id,name:'Name '+id,system:'gba',size:4,cover:'cover-'+id,skinId:'skin-canary',preferences:{speed:2},played:42},new Uint8Array([1,2,3,4]));
   for(const prefix of [id,id+'@alternate',id+'@link-2p',id+'@link-2p@alternate']){
    for(const store of ['saves','backups','archives','recoveries','sessions'])await db.put(store,prefix,{bytes:new Uint8Array([9,8]),canary:prefix});
    await db.put('states',prefix+':slot',{bytes:new Uint8Array([7,6]),canary:prefix});
   }
  }
  await db.put('skins','skin-canary',{bytes:new Uint8Array([21]),name:'Shared skin'});await db.put('coverCatalogs','catalog-canary',{name:'Shared catalog'});
  localStorage.setItem('unrelated-canary','untouched');
 });
 // Two independent field patches serialize without replacing newer metadata.
 const patched=await page.evaluate(async()=>{
  const tasks=[db.setGameCover('a',{cover:'new-cover',coverSource:'custom'}),db.setGamesLibraryMetadata(['a','b','a'],{category:'playing',favorite:true}),db.setGamePreferences('a',{speed:3})];
  const pending=activity.updateTasksPending(),result=await Promise.all(tasks);return {pending,finished:!activity.updateTasksPending(),rows:result[1],a:await db.get('library','a'),b:await db.get('library','b')};
 });
 assert.equal(patched.pending,true);assert.equal(patched.finished,true);assert.equal(patched.rows.length,2);
 for(const game of [patched.a,patched.b]){assert.equal(game.category,'playing');assert.equal(game.favorite,true);assert.equal(game.skinId,'skin-canary');assert.equal(game.played,42);assert.equal(game.name,'Name '+game.id);}
 assert.equal(patched.a.cover,'new-cover');assert.equal(patched.a.preferences.speed,3);
 const clear=await page.evaluate(async()=>{await db.setGamesLibraryMetadata(['a'],{category:'',favorite:false});return await db.get('library','a');});assert.equal(Object.hasOwn(clear,'category'),false);assert.equal(clear.favorite,false);
 // Pending name/play-time writes must not resurrect metadata removed by a
 // different tab, or drop concurrent artwork, settings and favorite changes.
 const details=await page.evaluate(async()=>{
  await db.setGamesLibraryMetadata(['a'],{category:'completed'});
  const tasks=[db.setGameDetails('a',{name:'  Renamed A  ',lastPlayed:123}),db.setGamesLibraryMetadata(['a'],{category:'',favorite:true}),db.setGameDetails('a',{playDuration:456})];
  const pending=activity.updateTasksPending();await Promise.all(tasks);
  return {game:await db.get('library','a'),pending,idle:!activity.updateTasksPending()};
 });assert.equal(details.game.name,'Renamed A');assert.equal(details.game.lastPlayed,123);assert.equal(details.game.playDuration,456);assert.equal(Object.hasOwn(details.game,'category'),false);assert.equal(details.game.favorite,true);assert.equal(details.game.cover,'new-cover');assert.equal(details.game.preferences.speed,3);assert.equal(details.pending,true);assert.equal(details.idle,true);
 const cheats=await page.evaluate(async()=>{
  const list=[{name:'Test',code:'12345678 ABCD',type:0,enabled:true}];
  await Promise.all([db.setGamesLibraryMetadata(['a'],{category:'backlog',favorite:false}),db.setGameCheats('a','mgba',list),db.setGameDetails('a',{lastPlayed:789})]);
  return {game:await db.get('library','a'),list};
 });assert.equal(cheats.game.category,'backlog');assert.equal(cheats.game.favorite,false);assert.equal(cheats.game.lastPlayed,789);assert.equal(cheats.game.name,'Renamed A');assert.deepEqual(cheats.game.cheats,cheats.list);
 // Reject the complete selection, even if an earlier ID exists.
 const invalid=await page.evaluate(async()=>{
  const before=await snapshot(),results=[];
  for(const [selected,patch] of [[[],{favorite:true}],[['a','missing'],{category:'completed'}],[['a',null],{favorite:true}],[['a@alternate'],{favorite:true}],[['a:slot'],{favorite:true}],[Array(2),{favorite:true}],[['a'],{}],[['a'],{favorite:1}],[['a'],{category:'unknown'}],[['a'],{category:null}],[['a'],{name:'overwrite'}]]){
   try{await db.setGamesLibraryMetadata(selected,patch);results.push(false);}catch{results.push(true);}
  }
  for(const selected of [[],['a','missing'],['a',null],['a@alternate'],['a:slot'],Array(2)]){try{await db.removeGames(selected);results.push(false);}catch{results.push(true);}}
  for(const [id,patch] of [['missing',{name:'Cannot resurrect'}],['a',{}],['a',{name:''}],['a',{name:'  '}],['a',{name:'a'.repeat(121)}],['a',{lastPlayed:Infinity}],['a',{lastPlayed:-1}],['a',{playDuration:NaN}],['a',{playDuration:'123'}],['a',{favorite:false}]]){try{await db.setGameDetails(id,patch);results.push(false);}catch{results.push(true);}}
  for(const [id,key,list] of [['missing','mgba',[]],['a','invalid',[]],['a','vba-next',[]],['a','mgba',null],['a','mgba',[{name:'Test',code:'123',type:0,enabled:1}]],['a','mgba',Array(2)]]){try{await db.setGameCheats(id,key,list);results.push(false);}catch{results.push(true);}}
  return {results,same:before===await snapshot(),idle:!activity.updateTasksPending()};
 });assert.ok(invalid.results.every(Boolean));assert.equal(invalid.same,true);assert.equal(invalid.idle,true);
 // A failure after the first queued update must roll back both selected rows.
 const failedPatch=await page.evaluate(async()=>{
  const before=await snapshot(),original=IDBObjectStore.prototype.put;let injected=false,rejected=false;
  IDBObjectStore.prototype.put=function(value,key){if(this.name==='library'&&key==='b'){injected=true;throw new DOMException('Synthetic quota failure','QuotaExceededError');}return original.call(this,value,key);};
  try{await db.setGamesLibraryMetadata(['a','b'],{category:'completed',favorite:true});}catch{rejected=true;}finally{IDBObjectStore.prototype.put=original;}
  return {injected,rejected,same:before===await snapshot(),idle:!activity.updateTasksPending()};
 });assert.deepEqual(failedPatch,{injected:true,rejected:true,same:true,idle:true});
 // Lock b so that acquisition of a succeeds first. A later refusal must release
 // the earlier lock and preserve every selected game's ROM and save namespaces.
 const other=await context.newPage();await other.goto(base);
 await other.evaluate(()=>{window.held=false;window.hold=navigator.locks.request('local-game:b',async()=>{held=true;await new Promise(resolve=>window.release=resolve);});});await other.waitForFunction(()=>held);
 const locked=await page.evaluate(async()=>{const before=await snapshot();let message='';try{await db.removeGames(['b','a']);}catch(e){message=e.message;}const released=await navigator.locks.request('local-game:a',{ifAvailable:true},lock=>!!lock);return {message,released,same:before===await snapshot(),idle:!activity.updateTasksPending()};});
 assert.match(locked.message,/プレイ中/);assert.equal(locked.released,true);assert.equal(locked.same,true);assert.equal(locked.idle,true);
 await other.evaluate(async()=>{release();await hold;});await other.close();
 const noLocks=await page.evaluate(async()=>{const before=await snapshot(),descriptor=Object.getOwnPropertyDescriptor(navigator,'locks');Object.defineProperty(navigator,'locks',{configurable:true,value:undefined});let rejected=false;try{await db.removeGames(['a','b']);}catch(e){rejected=/最新版/.test(e.message);}finally{if(descriptor)Object.defineProperty(navigator,'locks',descriptor);else delete navigator.locks;}return {rejected,same:before===await snapshot()};});assert.deepEqual(noLocks,{rejected:true,same:true});
 // Abort after first-game deletes were queued. All stores and all locks must
 // recover, including manual states and secondary-core / local 2P save data.
 const failedDelete=await page.evaluate(async()=>{
  const before=await snapshot(),original=IDBObjectStore.prototype.delete;let injected=false,rejected=false;
  IDBObjectStore.prototype.delete=function(key){if(this.name==='roms'&&key==='b'){injected=true;throw new DOMException('Synthetic delete failure','UnknownError');}return original.call(this,key);};
  try{await db.removeGames(['a','b']);}catch{rejected=true;}finally{IDBObjectStore.prototype.delete=original;}
  const released=await navigator.locks.request('local-game:a',{ifAvailable:true},a=>navigator.locks.request('local-game:b',{ifAvailable:true},b=>!!a&&!!b));
  return {injected,rejected,released,same:before===await snapshot(),idle:!activity.updateTasksPending()};
 });assert.deepEqual(failedDelete,{injected:true,rejected:true,released:true,same:true,idle:true});
 const deleted=await page.evaluate(async()=>{
  const before=JSON.parse(await snapshot()),count=await db.removeGames(['a','b','a']),after=JSON.parse(await snapshot());
  const canaries=Object.fromEntries(Object.entries(before).map(([store,rows])=>[store,rows.filter(([key])=>!['a','b'].includes(String(key).split(/[@:]/,1)[0]))]));
  return {count,after,canaries,local:localStorage.getItem('unrelated-canary'),idle:!activity.updateTasksPending()};
 });assert.equal(deleted.count,2);assert.deepEqual(deleted.after,deleted.canaries);assert.equal(deleted.local,'untouched');assert.equal(deleted.idle,true);
 // The single-game compatibility API uses the same protected atomic path.
 assert.equal(await page.evaluate(()=>db.removeGame('a-canary')),1);
 assert.deepEqual(errors,[]);await context.close();console.log(`PASS ${kind}: library field patches, invalid selection, concurrent metadata, transaction rollback, cross-tab locks, full core/2P deletion and shared-asset canaries`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
