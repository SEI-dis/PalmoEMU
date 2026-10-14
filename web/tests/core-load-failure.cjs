// SPDX-License-Identifier: AGPL-3.0-or-later
// Real SW SRI rejection, adapter boundaries and app recovery in isolated storage.
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const runtime=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium',root=path.resolve(__dirname,'..');
(async()=>{
 const resources=['cores/mgba/mgba.wasm','cores/nes/core.js','cores/nds/core.js','cores/jgenesis/core.js'];
 const build=fs.readFileSync(path.join(root,'index.html'),'utf8').match(/name="app-build" content="([^"]+)"/)[1];
 const manifest={version:build,files:resources,shell:[],bytes:0,integrity:Object.fromEntries(resources.map(name=>[name,'sha256-'+crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('base64')]))};
 let broken=new Set(resources),failure='integrity';const failures=[];
 const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html',file=path.resolve(root,name);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'})[path.extname(name)]||'application/octet-stream');
  if(name==='offline-manifest.js'){res.end('self.APP_OFFLINE='+JSON.stringify(manifest)+';');return;}
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  const bytes=fs.readFileSync(file);
  if(broken.has(name)){failures.push(name);if(failure==='http'){res.writeHead(503).end();return;}res.end(Buffer.concat([bytes,Buffer.from('\n// Different release')]));return;}
  res.end(bytes);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port+'/';
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.setDefaultTimeout(30000);
  await context.addInitScript(()=>{localStorage.setItem('manic-settings',JSON.stringify({autosave:false,recovery:false}));localStorage.setItem('palmo-release-seen:/','9999.0.0');});
  await page.goto(base);await page.locator('#add-first').waitFor();await page.waitForFunction(()=>!!navigator.serviceWorker.controller&&!document.documentElement.hasAttribute('aria-busy'));
  // Each actual loader rejects an old-worker/new-resource combination. The
  // worker's response body is not available to dynamic import/script.onerror.
  const adapterResults=await page.evaluate(async()=>{
   const {RetroCore}=await import('./src/core/retro.js'),{NDSCore}=await import('./src/core/nds.js'),{JgenesisCore}=await import('./src/core/jgenesis.js');
   const out=[];
   for(const [Core,system,coreKey] of [[RetroCore,'nes','fceumm'],[NDSCore,'nds','desmume2015'],[JgenesisCore,'gb','jgenesis']]){
    const core=new Core(document.createElement('div'));try{await core.load(new Uint8Array([1]),{system,coreKey,size:1});out.push('unexpected');}catch(error){out.push(error.code);}finally{core.close();}
   }return out;
  });assert.deepEqual(adapterResults,['CORE_LOAD_FAILED','CORE_LOAD_FAILED','CORE_LOAD_FAILED']);
  await page.locator('#rom-input').setInputFiles({name:'Core recovery fixture.gb',mimeType:'application/octet-stream',buffer:Buffer.from(require('./cartridges.cjs').gb())});await page.locator('.game-launch').waitFor();
  await page.evaluate(async()=>{
   window.db=await import('./src/storage/storage.js');const {hash}=await import('./src/shared.js');window.game=(await db.all('library'))[0];
   const bytes=new Uint8Array(8192);bytes[0]=0x53;window.original={bytes,hash:await hash(bytes),at:123,coreId:'mgba-rom64-save6-v2'};
   await db.put('saves',game.id,original);await db.put('backups',game.id,[original]);
   window.snapshot=async()=>JSON.stringify([await db.get('saves',game.id),await db.get('backups',game.id),await db.get('roms',game.id)]);window.before=await snapshot();
  });
  await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#core-load-update').waitFor();
  assert.match(await page.locator('#sheet-body').innerText(),/アプリを更新/);assert.equal(await page.locator('#player').isVisible(),false);assert.equal(await page.evaluate(()=>location.pathname),'/');
  assert.equal(await page.locator('#core-load-update').getAttribute('href'),'update.html');
  assert.equal(await page.evaluate(async()=>before===await snapshot()),true,'Failed startup leaves ROM, save and history byte-identical');
  assert.equal(await page.evaluate(()=>navigator.locks.request('local-game:'+game.id,{ifAvailable:true},lock=>!!lock)),true,'Failure releases the game lock before recovery UI');
  assert(resources.every(name=>failures.includes(name)),'All loader failures used real SW integrity checks');
  // Reload is user-initiated, clears failed module imports, and preserves data.
  broken=new Set();await page.locator('#retry-core-load').click();await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});await page.locator('#player').waitFor({state:'visible'});
  assert.equal(await page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js'),game=(await db.all('library'))[0],save=await db.get('saves',game.id),history=await db.get('backups',game.id);return save.bytes[0]===0x53&&save.at===123&&save.hash===await hash(save.bytes)&&history.length===1&&history[0].hash===save.hash;}),true);await context.close();
  // Ordinary network errors receive the same neutral recovery choices, without
  // claiming a release is available. A ROM rejection keeps its own message.
  failure='http';broken=new Set(['cores/nes/core.js']);
  const ordinary=await browser.newContext({serviceWorkers:'block'}),plain=await ordinary.newPage();await plain.goto(base);await plain.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
  assert.equal(await plain.evaluate(async()=>{const {RetroCore}=await import('./src/core/retro.js'),core=new RetroCore(document.createElement('div'));try{await core.load(new Uint8Array([1]),{system:'nes',size:1});}catch(error){return error.code;}finally{core.close();}}),'CORE_LOAD_FAILED');
  await ordinary.close();broken=new Set();
  const invalid=await browser.newContext({serviceWorkers:'block'}),invalidPage=await invalid.newPage();await invalidPage.goto(base);await invalidPage.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
  const rejected=await invalidPage.evaluate(async()=>{const {RetroCore}=await import('./src/core/retro.js'),core=new RetroCore(document.createElement('div'));try{await core.load(new Uint8Array([1,2,3]),{system:'nes',size:3});}catch(error){return {code:error.code||null,message:error.message,cause:error.cause?.message};}finally{core.close();}});
  assert.equal(rejected.code,null);assert.match(rejected.message,/ROM/,'Invalid ROM must not become an update warning');await invalid.close();
  console.log('PASS '+kind+': actual SW SRI/503 failures in four core adapters, actionable update/retry UI, released lock, original saves/history/ROM preserved and invalid-ROM classification.');
 }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
