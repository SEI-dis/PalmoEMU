// SPDX-License-Identifier: AGPL-3.0-or-later
// Rebuild only the reviewed local archives, using an isolated browser database.
// --check compares bytes; no mode updates the rights manifest or its hashes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createStaticServer}=require('./serve.cjs'),{chromium}=require('../tests/browser-runtime.cjs');
const root=path.resolve(__dirname,'..'),manifest=require('../BUNDLED_SKINS.json');
(async()=>{
 const server=createStaticServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const write=(file,bytes)=>{if(process.argv.includes('--check'))assert.ok(fs.readFileSync(file).equals(bytes),'Rebuilt skin differs: '+file);else fs.writeFileSync(file,bytes);};
  for(const entry of manifest.skins){
   const record=await page.evaluate(async entry=>{
    const {importSkin}=await import('./src/skins/skins.js');
    const response=await fetch(entry.sourceArchive);if(!response.ok)throw Error('Missing skin source');
    const record=await importSkin(new File([await response.arrayBuffer()],entry.upstreamFile),entry.system);
    for(const image of Object.values(record.images)){let text='';for(const n of image.bytes)text+=String.fromCharCode(n);image.base64=btoa(text);delete image.bytes;}
    record.id=entry.id;delete record.importedAt;return record;
   },entry);
   const folder=path.dirname(path.join(root,entry.dataFile));fs.mkdirSync(folder,{recursive:true});
   for(const [name,image]of Object.entries(record.images)){
    write(path.join(folder,name+'.png'),Buffer.from(image.base64,'base64'));record.images[name]=name+'.png';
   }
   write(path.join(root,entry.dataFile),Buffer.from(JSON.stringify(record,null,2)+'\n'));
   console.log('Rendered '+entry.id);
  }
  await context.close();
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
