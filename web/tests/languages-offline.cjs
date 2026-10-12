// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path'),fs=require('node:fs');
const engine=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const root=path.resolve(__dirname,'..');let offline=false;
 const server=http.createServer((req,res)=>{
  if(offline){req.socket.destroy();return;}
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/`;
 const browser=await require('./browser-runtime.cjs')[engine].launch({headless:true,...(engine==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({locale:'ja-JP'}),page=await context.newPage();
  await page.goto(base+'index.html#settings');await page.locator('#app-language').waitFor();
  await page.evaluate(async()=>{
   await navigator.serviceWorker.ready;
   const db=await import('./src/storage.js');await db.addGame({id:'language-canary',name:'保存 ⟪0⟫',system:'gba',size:4,added:1},new Uint8Array([1,2,3,4]));await db.put('saves','language-canary',{bytes:new Uint8Array([5,6])});
  });
  // Real origin outage exercises cached navigation in both engines. Playwright
  // WebKit's offline emulation itself rejects SW-cached navigations (#42775).
  offline=true;
  for(const code of ['zh-Hans','zh-Hant','ko','es','fr','de','pt','en','ja']){
   await page.locator('#app-language').selectOption(code);
   await page.waitForFunction(code=>document.documentElement.lang===code,code);await page.locator('#app-language').waitFor();
   const response=await page.reload();assert.equal(response.fromServiceWorker(),true);await page.locator('#app-language').waitFor();
   assert.equal(await page.locator('#app-language').inputValue(),code,'Offline choice persists');
  }
  assert.deepEqual(await page.evaluate(async()=>{const db=await import('./src/storage.js');return {name:(await db.get('library','language-canary')).name,rom:[...await db.get('roms','language-canary')],save:[...(await db.get('saves','language-canary')).bytes]};}),{name:'保存 ⟪0⟫',rom:[1,2,3,4],save:[5,6]},'All offline language changes preserve data');
  await page.locator('#app-language').selectOption('es');await page.waitForFunction(()=>document.documentElement.lang==='es');
  const response=await page.goto(base+'notices.html');assert.equal(response.fromServiceWorker(),true);await page.waitForFunction(()=>document.documentElement.lang==='es');assert.equal(await page.locator('h1').textContent(),'Novedades');
  await context.close();console.log('PASS: cold navigation and every language switch during origin outage, localized release notes and unchanged user data.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
