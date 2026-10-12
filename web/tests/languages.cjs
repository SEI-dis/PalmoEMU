// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic profiles only. No user's ROM, save, skin or live relay is used.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
const engine=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{
 const {languages,resolveLanguage}=await import(pathToFileURL(path.join(__dirname,'../src/i18n/languages.js')));
 const only=process.env.LANGUAGE_TEST_CODES?.split(',');
 if(only)assert.ok(only.length&&only.every(code=>languages.some(item=>item.code===code&&!['ja','en'].includes(code))),'Unknown test language');
 const tested=languages.filter(item=>!['ja','en'].includes(item.code)&&(!only||only.includes(item.code)));
 for(const [input,expected]of [['zh-CN','zh-Hans'],['zh-SG','zh-Hans'],['zh-TW','zh-Hant'],['zh-HK','zh-Hant'],['zh-MO','zh-Hant'],['zh-Hans-HK','zh-Hans'],['zh-Hant-CN','zh-Hant'],['ko-KR','ko'],['es-MX','es'],['fr-CA','fr'],['de-AT','de'],['pt-BR','pt'],['pt-PT','pt'],['ru-RU','en']])assert.equal(resolveLanguage('auto',[input]),expected,input);
 assert.equal(resolveLanguage('auto',['ru-RU','de-DE','en-US']),'de');assert.equal(resolveLanguage('ja',['fr-FR']),'ja');assert.equal(resolveLanguage('auto',[]),'en');
 const browser=await require('./browser-runtime.cjs')[engine].launch({headless:true,...(engine==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 const output=path.join(__dirname,'../test-results/languages-'+engine);fs.mkdirSync(output,{recursive:true});
 try{
  for(const {code}of tested){
   const context=await browser.newContext({locale:code,viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];
   page.on('pageerror',error=>errors.push(error.message));page.on('request',req=>requests.push([req.method(),req.url()]));
   const {default:catalogue}=await import(pathToFileURL(path.join(__dirname,`../src/i18n/locales/${code}.js`)));
   await page.goto(base+'index.html#settings');await page.locator('#app-language').waitFor();
   assert.equal(await page.locator('html').getAttribute('lang'),code);assert.equal(await page.locator('h1').textContent(),catalogue['設定']);
   assert.equal(await page.locator('#app-language').inputValue(),'auto');assert.deepEqual(await page.locator('#app-language option').evaluateAll(options=>options.slice(1).map(o=>o.textContent)),languages.map(item=>item.name));
   for(const width of [320,390,844]){
    await page.setViewportSize({width,height:width===844?390:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),code+' settings width '+width);
   }
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,code+'-settings.png'),fullPage:true});
   for(const action of ['saveHelp','skins','controllers','diagnostics']){
    await page.locator(`#content [data-action=${action}]`).click();await page.locator('#sheet[open]').waitFor();
    assert.ok(await page.locator('#sheet').evaluate(el=>el.scrollWidth<=el.clientWidth+1),code+' '+action+' fits');
    await page.locator('#close-sheet').click();
   }
   const local=await page.evaluate(async()=>{const {tr}=await import('./src/i18n/index.js');return {plain:tr('保存'),dynamic:tr`「${'保存 <b>test</b>⟪0⟫'}」の${2}行目を読み込めません。`};});
   assert.equal(local.plain,catalogue['保存']);assert.ok(local.dynamic.includes('保存 <b>test</b>⟪0⟫'),'User text remains literal');assert.ok(local.dynamic.includes('2'));
   await page.locator('#app-language').selectOption(code);await page.waitForFunction(code=>localStorage.getItem('palmo-language')===code,code);await page.locator('#app-language').waitFor();
   await page.reload();await page.locator('#app-language').waitFor();assert.equal(await page.locator('#app-language').inputValue(),code);
   for(const name of ['notices','privacy','licenses','update']){
    await page.goto(base+name+'.html');await page.waitForFunction(code=>document.documentElement.lang===code,code);
    assert.ok(await page.locator('h1').textContent());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),code+' '+name+' fits');
    if(name==='notices'){
     const first=(await page.locator('[data-i18n]').first().textContent());assert.ok(!/[ぁ-ゖ]/.test(first));assert.ok(!first.startsWith('Added Simplified'));
     await page.screenshot({path:path.join(output,code+'-notices.png'),fullPage:true});
    }
   }
   assert.deepEqual(errors,[]);assert.deepEqual(requests.filter(([method,url])=>method!=='GET'||!url.startsWith(base)),[],'Only own static files');
   const fetched=requests.map(([,url])=>url).filter(url=>/\/locales\//.test(url));assert.ok(fetched.some(url=>url.endsWith('/'+code+'.js')));assert.ok(fetched.every(url=>url.endsWith('/en.js')||url.endsWith('/'+code+'.js')),'Only selected catalogue is loaded');
   await context.close();
  }
  // A Japanese device explicitly selecting Korean must propagate its choice to workers.
  const context=await browser.newContext({locale:'ja-JP',serviceWorkers:'block'}),page=await context.newPage();
  await context.addInitScript(()=>localStorage.setItem('palmo-language','ko'));
  await page.route('**/src/rom-import-worker.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:'const R=self.FileReader;self.FileReader=class extends R{readAsArrayBuffer(file){super.readAsArrayBuffer(file);this.abort();}};\n'+await response.text()});});
  await page.goto(base+'index.html#settings');await page.locator('#app-language').waitFor();
  const result=await page.evaluate(async()=>{const {importROM}=await import('./src/rom-import.js');try{await importROM(new File([new Uint8Array(4)],'synthetic.gb'),'gb');}catch(e){return e.message;}});
  const {default:ko}=await import(pathToFileURL(path.join(__dirname,'../src/i18n/locales/ko.js')));assert.equal(result,ko['ファイルの読み込みが中断されました。']);await context.close();
  const fallback=await browser.newContext({locale:'fr-FR',serviceWorkers:'block'}),fallbackPage=await fallback.newPage();
  await fallback.addInitScript(()=>localStorage.setItem('palmo-language','fr'));
  await fallbackPage.route('**/locales/fr.js',route=>route.fulfill({status:503,body:'Unavailable'}));
  await fallbackPage.goto(base+'index.html#settings');await fallbackPage.locator('#app-language').waitFor();
  assert.equal(await fallbackPage.locator('html').getAttribute('lang'),'en');assert.equal(await fallbackPage.locator('#app-language').inputValue(),'fr');
  await fallbackPage.unroute('**/locales/fr.js');await fallbackPage.reload();await fallbackPage.locator('#app-language').waitFor();assert.equal(await fallbackPage.locator('html').getAttribute('lang'),'fr','Retry selected language on next load');await fallback.close();
  console.log(`PASS: ${tested.length} additional languages, regional defaults, manual persistence, page/dialog layout, worker override, interpolation, selected-catalogue-only loading and recoverable missing catalogue.`);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
