// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated browser profiles and authored metadata only; no user ROMs or saves.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
const runtime=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
const japanese=/[ぁ-んァ-ヶ一-龯]/;
(async()=>{
 const {default:catalogue}=await import(pathToFileURL(path.join(__dirname,'../src/i18n/locales/en.js')));
 const slots=s=>[...s.matchAll(/⟪\d+⟫/g)].map(m=>m[0]).sort();
 for(const [source,english]of Object.entries(catalogue)){
  assert.ok(english.trim(),source);assert.deepEqual(slots(english),slots(source),'Interpolation slots: '+source);
  if(source!=='日本語')assert.ok(!japanese.test(english),'Untranslated: '+source);
 }
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({locale:'en-US',viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push([r.method(),r.url()]));
  const clean=async label=>{const text=await page.locator('body').innerText();assert.ok(!japanese.test(text.replaceAll('日本語','').replaceAll('保存','')),label+': '+text);};
  await page.goto(base+'index.html#settings');await page.locator('#app-language').waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.equal(await page.locator('#app-language').inputValue(),'auto');assert.equal(await page.locator('h1').textContent(),'Settings');
  const pictures=path.join(__dirname,'../test-results/i18n-'+kind);fs.mkdirSync(pictures,{recursive:true});
  await page.screenshot({path:path.join(pictures,'settings.png'),fullPage:true});
  const primitives=await page.evaluate(async()=>{
   const {tr,resolveLanguage}=await import('./src/i18n/index.js');
   return {auto:[resolveLanguage('auto',['ja-JP']),resolveLanguage('auto',['en-GB']),resolveLanguage('auto',['fr-FR']),resolveLanguage('en',['ja-JP']),resolveLanguage('ja',['en-US'])],
    safe:tr`<p>${'設定⟪0⟫<b>name</b>'}</p><button>削除</button>`,order:tr`「${'保存'}」の${2}行目を読み込めません。`,unknown:tr('unknown diagnostic')};
  });
  assert.deepEqual(primitives.auto,['ja','en','en','en','ja']);assert.equal(primitives.safe,'<p>設定⟪0⟫<b>name</b></p><button>Delete</button>');assert.equal(primitives.order,'Could not read line 2 of “保存”.');assert.equal(primitives.unknown,'unknown diagnostic');
  for(const action of ['video','audio','saveHelp','storage','skins','controllers','backup','diagnostics']){
   await page.locator(`#content [data-action=${action}]`).click();await page.locator('#sheet[open]').waitFor();await clean(action);
   await page.locator('#close-sheet').click();await page.locator('#sheet').waitFor({state:'hidden'});
  }
  await page.evaluate(async()=>{const db=await import('./src/storage.js');await db.addGame({id:'language-canary',name:'保存',system:'gba',size:4,added:1},new Uint8Array([1,2,3,4]));await db.put('saves','language-canary',{bytes:new Uint8Array([8,9])});});
  await page.locator('#app-language').selectOption('ja');await page.waitForFunction(()=>document.documentElement.lang==='ja');await page.locator('#app-language').waitFor();
  assert.equal(await page.locator('h1').textContent(),'設定');assert.equal(await page.locator('#app-language').inputValue(),'ja');
  await page.reload();await page.locator('#app-language').waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'ja','Explicit choice persists');
  await page.locator('#app-language').selectOption('en');await page.waitForFunction(()=>document.documentElement.lang==='en');await page.locator('#app-language').waitFor();
  const saved=await page.evaluate(async()=>{const db=await import('./src/storage.js');return {name:(await db.get('library','language-canary')).name,rom:[...await db.get('roms','language-canary')],save:[...(await db.get('saves','language-canary')).bytes]};});
  assert.deepEqual(saved,{name:'保存',rom:[1,2,3,4],save:[8,9]},'Language changes preserve user data');
  await page.locator('[data-tab=games]').click();await page.locator('[data-game=language-canary]').click();await clean('game menu');await page.locator('#close-sheet').click();
  await page.locator('#rom-input').setInputFiles({name:'English-test.gb',mimeType:'application/octet-stream',buffer:Buffer.from(require('./cartridges.cjs').gb())});
  await page.getByRole('button',{name:'English-test: open settings',exact:true}).click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
  await page.locator('#player-menu').click();await page.locator('[data-action=newState]').click();assert.equal(await page.locator('#sheet-title').textContent(),'Save state');await page.locator('#confirm-state-save').click();await page.locator('[data-slot-load]').waitFor();
  assert.equal(await page.locator('[data-state-mode=auto]').textContent(),'Auto');assert.equal(await page.locator('[data-state-mode=manual]').textContent(),'Manual');
  await page.screenshot({path:path.join(pictures,'states.png')});
  for(const [width,height]of [[320,568],[844,390],[1024,768]]){
   await page.setViewportSize({width,height});
   assert.ok(await page.locator('#sheet').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'English state dialog fits '+width);
  }
  await page.locator('#close-sheet').click();await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  await page.setViewportSize({width:320,height:568});
  for(const name of ['privacy','licenses','notices','update']){
   await page.goto(base+name+'.html');await page.waitForFunction(()=>document.documentElement.lang==='en');await clean(name);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' fits narrow screen');
   if(name==='notices')await page.screenshot({path:path.join(pictures,'notices.png'),fullPage:true});
  }
  assert.ok((await page.locator('#update-status').textContent()).length);
  await context.setOffline(true);await page.goto(base+'index.html#settings').catch(()=>{}); // blocked profile has no SW cache
  await context.setOffline(false);await page.goto(base+'index.html#settings');await page.locator('#app-language').waitFor();
  await context.setOffline(true);assert.equal(await page.evaluate(async()=>{const {tr}=await import('./src/i18n/index.js');return tr('保存失敗');}),'Save failed','Translation needs no network');await context.setOffline(false);
  // WebKit also reports in-memory Blob reads used for local state thumbnails.
  assert.deepEqual(errors,[]);assert.deepEqual(requests.filter(([method,url])=>method!=='GET'||(!url.startsWith(base)&&!url.startsWith('blob:'+base))),[],'Only local static or in-memory resources read');await context.close();
  for(const locale of ['ja-JP','fr-FR']){
   const c=await browser.newContext({locale,serviceWorkers:'block'}),p=await c.newPage();await p.goto(base+'index.html#settings');await p.locator('#app-language').waitFor();assert.equal(await p.locator('html').getAttribute('lang'),locale==='ja-JP'?'ja':'en');
   if(locale==='ja-JP'){
    await p.locator('#app-language').selectOption('en');await p.waitForFunction(()=>document.documentElement.lang==='en');await p.locator('#app-language').waitFor();
    // Force a local file read abort inside an isolated worker, exercising the
    // explicit override when the browser's own language is still Japanese.
    await p.route('**/src/rom-import-worker.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:'const NativeReader=self.FileReader;self.FileReader=class extends NativeReader{readAsArrayBuffer(file){super.readAsArrayBuffer(file);this.abort();}};\n'+await response.text()});});
    assert.equal(await p.evaluate(async()=>{const {importROM}=await import('./src/rom-import.js');try{await importROM(new File([new Uint8Array(4)],'local.gb'),'gb');return 'unexpected success';}catch(e){return e.message;}}),'File reading was interrupted.');
    await p.unroute('**/src/rom-import-worker.js');
    await p.locator('#app-language').selectOption('auto');await p.waitForFunction(()=>document.documentElement.lang==='ja');
   }
   await c.close();
  }
  console.log('PASS: locale defaults, overrides, settings and legal pages, interpolation, persistence, user data and offline translation.');
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
