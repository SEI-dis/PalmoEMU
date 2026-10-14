// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated browser contexts, a local fixture server and an authored GB program only.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const kind=process.env.BROWSER_ENGINE||'chromium',runtime=require('./browser-runtime.cjs');
const root=path.resolve(__dirname,'..'),current='9.0.0',previous='8.9.9',seenKey='palmo-release-seen:/';
const languages=['ja','en','zh-Hans','zh-Hant','ko','es','fr','de','pt'];
const stores=['library','roms','saves','states','backups','archives','recoveries','sessions','skins','coverCatalogs'];
const cartridge=Array.from(require('./cartridges.cjs').gb());
const shots=process.env.SCREENSHOT_DIR||path.join(root,'test-results','release-notice-'+kind);

function fixtureIndex(source,version){
 assert.match(version,/^\d+\.\d+\.\d+$/);
 assert.match(source,/<meta name="app-version" content="[^"]+">/);
 let templateFound=false;
 const output=source.replace(/(<meta name="app-version" content=")[^"]+/,`$1${version}`)
  .replace(/<template\b[^>]*\bid="latest-update-notes"[^>]*>/,tag=>{
   templateFound=true;assert.match(tag,/\bdata-version="[^"]+"/);
   return tag.replace(/(\bdata-version=")[^"]+/,`$1${version}`);
  });
 assert.ok(templateFound,'Generate template#latest-update-notes before running this test');
 return output;
}

(async()=>{
 const server=http.createServer((request,response)=>{
  try{
   const url=new URL(request.url,'http://localhost');
   if(url.pathname==='/fixture-seed.html'){response.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'}).end('<!doctype html><html><head><meta charset="utf-8"></head><body>Isolated test seed</body></html>');return;}
   const filename=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
   if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename)||!fs.statSync(filename).isFile()){response.writeHead(404).end();return;}
   let bytes=fs.readFileSync(filename);
   if(path.basename(filename)==='index.html')bytes=Buffer.from(fixtureIndex(bytes.toString(),url.searchParams.get('fixtureVersion')||current));
   const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
   response.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store'}).end(bytes);
  }catch(error){response.writeHead(500,{'Content-Type':'text/plain'}).end(String(error.stack));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/',errors=[],foreignRequests=[];
 let browser;
 const notice=page=>page.locator('#sheet.release-notice[open]');
 const seen=page=>page.evaluate(key=>localStorage.getItem(key),seenKey);
 const ready=page=>page.waitForFunction(()=>(document.documentElement.getAttribute('aria-busy')!=='true'||!!document.querySelector('#sheet.release-notice[open]'))&&!!document.querySelector('#content .page,#content .empty-library,#content .game-launch'));
 const absent=async(page,message)=>{await page.waitForTimeout(1100);assert.equal(await notice(page).count(),0,message);};
 const open=async(page,{version=current,hash=''}={})=>{await page.goto(base+'?fixtureVersion='+version+hash);await ready(page);};
 const closeNotice=async(page,method='done')=>{
  if(method==='escape')await page.keyboard.press('Escape');
  else await page.locator(method==='header'?'#close-sheet':'#release-notice-done').click();
  await notice(page).waitFor({state:'hidden'});
  assert.equal(await seen(page),current,'Dismissal remembers the release version');
 };
 const snapshot=page=>page.evaluate(async names=>{
  const database=await new Promise((resolve,reject)=>{const request=indexedDB.open('manicemu-web',5);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{
   const tx=database.transaction(names),output={};
   await Promise.all(names.map(name=>new Promise((resolve,reject)=>{
    const rows=[],request=tx.objectStore(name).openCursor();
    request.onsuccess=()=>{const cursor=request.result;if(cursor){rows.push([cursor.key,cursor.value]);cursor.continue();}else{output[name]=rows;resolve();}};request.onerror=()=>reject(request.error);
   })));
   return JSON.stringify(Object.fromEntries(names.map(name=>[name,output[name]])),(_,value)=>value instanceof ArrayBuffer?Array.from(new Uint8Array(value)):ArrayBuffer.isView(value)?Array.from(new Uint8Array(value.buffer,value.byteOffset,value.byteLength)):value);
  }finally{database.close();}
 },stores);
 async function withContext(options,run){
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  context.on('page',page=>{page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));});
  context.on('request',request=>{if(/^https?:/.test(request.url())&&(!request.url().startsWith(base)||request.method()!=='GET'))foreignRequests.push(request.method()+' '+request.url());});
  await context.addInitScript(({hidden})=>{
   // This suite exercises release notices independently of SW activation.
   // The existing update.cjs suite verifies the real worker protocol.
   Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:undefined});
   window.releaseFixtureHidden=hidden;
   Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.releaseFixtureHidden});
   Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.releaseFixtureHidden?'hidden':'visible'});
   window.releaseFixtureVisibility=visible=>{window.releaseFixtureHidden=!visible;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));};
   window.releaseFixtureShows=0;
   const show=HTMLDialogElement.prototype.showModal;
   HTMLDialogElement.prototype.showModal=function(...args){const result=show.apply(this,args);queueMicrotask(()=>{if(this.open&&this.classList.contains('release-notice'))window.releaseFixtureShows++;});return result;};
  },{hidden:!!options.hidden});
  const seed=await context.newPage();
  try{
   await seed.goto(base+'fixture-seed.html');
   const gameId=await seed.evaluate(async({options,cartridge,seenKey})=>{
    if(options.seen)localStorage.setItem(seenKey,options.seen);
    if(options.language)localStorage.setItem('palmo-language',options.language);
    if(options.existing)localStorage.setItem('manic-settings',JSON.stringify({theme:'dark',speed:1,volume:.37,filter:'pixel',autosave:false,recovery:false}));
    if(!options.game&&!options.personal)return null;
    const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),bytes=new Uint8Array(cartridge),id=await hash(bytes);
    await db.addGame({id,name:'Authored release notice test',filename:'notice-test.gb',system:'gb',size:bytes.length,added:100,lastPlayed:0,favorite:true,preferences:{volume:.29,speed:2},category:'backlog'},bytes);
    if(options.personal){
     const save={bytes:new Uint8Array([9,8,7,6]),hash:'synthetic-preservation-marker',at:101};
     await db.put('saves',id,save);await db.put('states',id+':keep',{...save,image:'',coreId:'synthetic',name:'Keep this state'});
     for(const store of ['backups','archives','recoveries'])await db.put(store,id,[save]);
     localStorage.setItem('release-fixture-personal','keep this unrelated preference');
    }
    return id;
   },{options,cartridge,seenKey});
   await run({context,seed,gameId,newPage:()=>context.newPage()});
  }finally{await context.close();}
 }
 try{
  browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
  await withContext({},async({newPage})=>{
   const page=await newPage();await open(page);await absent(page,'A clean first install must not claim an update');
   assert.equal(await seen(page),current,'First install establishes the current baseline');
   await page.reload();await ready(page);await absent(page,'A second visit to the first installation stays quiet');
  });
  console.log('PASS '+kind+': first installation and baseline');

  await withContext({seen:previous,existing:true,personal:true},async({seed,newPage})=>{
   const before=await snapshot(seed),page=await newPage();await open(page);await notice(page).waitFor();
   assert.equal(await snapshot(page),before,'Opening release notes preserves all ROM/save/state records and metadata');
   assert.equal(await page.evaluate(()=>localStorage.getItem('release-fixture-personal')),'keep this unrelated preference');
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).volume),.37);
   await closeNotice(page);assert.equal(await snapshot(page),before,'Dismissing release notes preserves personal data');
   await page.reload();await ready(page);await absent(page,'The acknowledged release cannot reappear on reload');
   await page.evaluate(()=>localStorage.setItem('palmo-language','en'));await page.reload();await ready(page);await absent(page,'Changing language cannot reset the acknowledged release');
   await open(page,{version:'8.8.8'});await absent(page,'An older app must not announce a downgrade as an update');assert.equal(await seen(page),current,'An older tab cannot roll back the acknowledged version');
  });
  console.log('PASS '+kind+': upgrade, repeat visits, language change, downgrade and personal-data preservation');

  await withContext({existing:true},async({newPage})=>{
   const page=await newPage();await open(page,{version:'0.3.23'});await notice(page).waitFor();
   await page.locator('#release-notice-done').click();assert.equal(await seen(page),'0.3.23','An existing 0.3.22 installation without the new key receives the migration notice');
  });

  const latest=JSON.parse(fs.readFileSync(path.join(root,'release-notes.json'),'utf8')).releases[0];
  fs.mkdirSync(shots,{recursive:true});
  for(const language of languages)await withContext({seen:previous,language},async({newPage})=>{
   const page=await newPage();await open(page);await notice(page).waitFor();
   const expected=(language==='ja'?latest.changes:language==='en'?latest.changesEn:latest.translations[language]).slice(0,3);
   assert.equal(await page.locator('html').getAttribute('lang'),language);
   assert.deepEqual(await notice(page).locator('li').allTextContents(),expected,'Latest three changes are localized: '+language);
   for(const [width,height]of [[390,844],[844,390]]){
    await page.setViewportSize({width,height});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const geometry=await notice(page).evaluate(dialog=>{
     const r=dialog.getBoundingClientRect(),v=visualViewport;
     const width=v?.width||innerWidth,height=v?.height||innerHeight,left=v?.offsetLeft||0,top=v?.offsetTop||0;
     return {dx:Math.abs((r.left+r.right)/2-(left+width/2)),dy:Math.abs((r.top+r.bottom)/2-(top+height/2)),inside:r.left>=left-1&&r.top>=top-1&&r.right<=left+width+1&&r.bottom<=top+height+1,overflow:dialog.scrollWidth>dialog.clientWidth+1};
    });
    assert.ok(geometry.inside&&!geometry.overflow&&geometry.dx<=3&&geometry.dy<=3,language+' '+width+'x'+height+' centered and contained: '+JSON.stringify(geometry));
    if(language==='ja'||language==='de')await page.screenshot({path:path.join(shots,language+'-'+(width<height?'portrait':'landscape')+'.png')});
   }
   await closeNotice(page,language==='ja'?'escape':language==='en'?'header':'done');
  });
  console.log('PASS '+kind+': legacy migration, all nine languages, portrait/landscape and close/ESC/header controls');

  await withContext({seen:previous},async({context,newPage})=>{
   const page=await newPage();await open(page);await notice(page).waitFor();
   const link=page.locator('#release-notice-details'),target=await link.getAttribute('target');
   assert.equal(new URL(await link.getAttribute('href'),page.url()).pathname,'/notices.html','Details opens the existing local release history');
   if(target==='_blank'){const popup=context.waitForEvent('page');await link.click();const details=await popup;await details.waitForLoadState('domcontentloaded');assert.equal(new URL(details.url()).pathname,'/notices.html');await details.close();}
   else{await link.click();await page.waitForURL(url=>url.pathname==='/notices.html');}
   assert.equal(await seen(page),current,'Following Details also acknowledges the notice');
   await open(page);await absent(page,'Returning from Details cannot repeat the same notice');
  });

  await withContext({seen:previous,hidden:true},async({newPage})=>{
   const page=await newPage();await open(page);await absent(page,'A hidden tab cannot display or consume the update notice');assert.equal(await seen(page),previous);
   await page.evaluate(async()=>{const {guardUpdateTask}=await import('./src/updates/update-activity.js');guardUpdateTask(()=>new Promise(resolve=>{window.finishNoticeTask=resolve;}))();releaseFixtureVisibility(true);});
   await absent(page,'An outstanding save/import task defers the update notice');assert.equal(await seen(page),previous);
   await page.evaluate(()=>finishNoticeTask());await notice(page).waitFor();await closeNotice(page);
  });

  await withContext({seen:previous,hidden:true},async({context,newPage})=>{
   const page=await newPage();await open(page);await absent(page,'Keep the offline scenario pending until the app shell is loaded');
   await context.setOffline(true);await page.evaluate(()=>releaseFixtureVisibility(true));
   await notice(page).waitFor();await closeNotice(page);
   assert.ok(await page.locator('#content').isVisible(),'Bundled release notes work offline without blocking the library');
  });

  await withContext({seen:previous},async({newPage})=>{
   const first=await newPage(),second=await newPage();await Promise.all([open(first),open(second)]);
   await Promise.race([notice(first).waitFor(),notice(second).waitFor()]);await first.waitForTimeout(1100);
   const counts=await Promise.all([notice(first).count(),notice(second).count()]);assert.equal(counts[0]+counts[1],1,'Only one of two simultaneous eligible tabs owns the notice');
   await closeNotice(counts[0]?first:second);await Promise.all([absent(first,'Acknowledgment clears the first tab'),absent(second,'Acknowledgment clears the second tab')]);
   assert.equal(await first.evaluate(()=>releaseFixtureShows)+await second.evaluate(()=>releaseFixtureShows),1,'The losing tab does not briefly display a second notice');
  });
  console.log('PASS '+kind+': details, offline display, hidden/task deferral and simultaneous-tab ownership');

  for(const hidden of [false,true])await withContext({seen:previous,existing:true,game:true,hidden},async({newPage,gameId})=>{
   const page=await newPage();await open(page,{hash:'#game='+gameId});
   // Either valid ordering is accepted: preserve the game sheet until later,
   // or show the release notice first and restore the requested game on close.
   await page.waitForFunction(()=>!!document.querySelector('#sheet.release-notice[open],#sheet.game-info[open]'));
   if(await notice(page).count())await closeNotice(page);
   await page.locator('#sheet.game-info[open]').waitFor();assert.equal(new URL(page.url()).hash,'#game='+gameId);
   if(hidden)assert.equal(await seen(page),previous,'The game starts with a genuinely unacknowledged pending notice');
   await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});assert.equal(await page.locator('#player').isVisible(),true);
   if(hidden)await page.evaluate(()=>releaseFixtureVisibility(true));
   await absent(page,'A pending notice cannot interrupt an active game');
   await page.locator('#player-menu').click();assert.equal(await notice(page).count(),0,'A paused game menu is still an active game');
   await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
   if(await seen(page)!==current){await notice(page).waitFor();await closeNotice(page);}
  });
  assert.deepEqual(errors,[],'No uncaught browser errors');assert.deepEqual(foreignRequests,[],'No user data or test data leaves the local fixture server');
  console.log('PASS '+kind+': game-link preservation, no active/paused-game interruption; release-notice suite complete. Screenshots: '+shots);
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>{server.close(resolve);server.closeAllConnections?.();});
 }
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
