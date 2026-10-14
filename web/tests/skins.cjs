// SPDX-License-Identifier: AGPL-3.0-or-later
// Original in-memory test images, never copyrighted game/controller artwork.
const assert=require('node:assert/strict');
const kind=process.env.BROWSER_ENGINE||'chromium',browserType=require('./browser-runtime.cjs')[kind];
const {zip}=require('./skin-fixture.cjs');
function pdf(){let s='%PDF-1.4\n',offset=[0];const stream='0.1 0.2 0.3 rg 0 0 390 844 re f\n';const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 1 /Kids [3 0 R] >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 390 844] /Resources << >> /Contents 4 0 R >>',`<< /Length ${stream.length} >>\nstream\n${stream}endstream`];objects.forEach((o,i)=>{offset.push(s.length);s+=`${i+1} 0 obj\n${o}\nendobj\n`;});const start=s.length;s+='xref\n0 5\n0000000000 65535 f \n'+offset.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return Buffer.from(s);}
(async()=>{const b=await browserType.launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});try{const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),p=await c.newPage(),requests=[],errors=[];p.on('request',r=>requests.push(r));p.on('console',m=>{if(m.type()==='error')console.log(m.text());});p.on('pageerror',e=>errors.push(e.message));const base=process.env.TEST_URL||'http://127.0.0.1:4173/';await p.goto(base);await p.locator('[data-tab=settings]').click();await p.locator('[data-action=skins]').click();
 const rep={mappingSize:{width:390,height:844},assets:{resizable:'controller.pdf'},gameScreenFrame:{x:20,y:65,width:350,height:233},items:[{inputs:['a'],frame:{x:279,y:513,width:76,height:64}}]};
 const info={name:'Original PDF fixture',gameTypeIdentifier:'com.rileytestut.Delta.game.gba',representations:{iphone:{standard:{portrait:rep}}}};
 const payload=zip({'info.json':JSON.stringify(info),'controller.pdf':pdf()});await p.locator('#import-skin').click();await p.locator('#skin-input').setInputFiles({name:'local-fixture.deltaskin',mimeType:'application/zip',buffer:payload});await p.locator('.skin-card-name',{hasText:'Original PDF fixture'}).waitFor({timeout:30000});await p.locator('#skin-preview .skin-mini').waitFor();
 const converted=await p.evaluate(async()=>{const db=await import('./src/storage/storage.js');const v=(await db.all('skins'))[0];return{type:v.images['controller.pdf'].type,size:v.images['controller.pdf'].size,frame:v.portrait.screens[0].outputFrame};});assert.equal(converted.type,'image/png');assert.ok(converted.size>0);assert.equal(converted.frame.width,350);

 const firstId=await p.locator('#skin-grid').getAttribute('data-selection');
 const importAgain=async(name,gameTypeIdentifier=info.gameTypeIdentifier)=>{const bytes=zip({'info.json':JSON.stringify({...info,name,gameTypeIdentifier}),'controller.pdf':pdf()});await p.locator('#import-skin').click();await p.locator('#skin-input').setInputFiles({name:'another.deltaskin',mimeType:'application/zip',buffer:bytes});await p.locator('.skin-card-name',{hasText:name}).waitFor();await p.locator('#skin-preview .skin-mini').waitFor();return p.locator('#skin-grid').getAttribute('data-selection');};
 const secondId=await importAgain('Second original fixture');
 assert.equal(await p.locator('#skin-palette').isVisible(),false,'Imported skins do not expose standard-only colors');
 assert.equal(await p.locator('#edit-controls').innerText(),'スクリーンショットボタン','Imported skins expose only the screenshot layout entry');
 await p.locator('[data-skin-choice^="builtin:"]').click({position:{x:15,y:15}});
 await p.locator('#skin-palette').waitFor();
 await p.locator('[data-skin-color=classic]').click();await p.waitForFunction(()=>document.querySelector('#skin-grid').dataset.selection==='builtin:classic');
 assert.equal(await p.locator('.skin-card').count(),4,'Standard and both imported skins stay visible after changing color');
 assert.equal(await p.evaluate(async()=>(await(await import('./src/storage/storage.js')).all('skins')).length),2);
 await p.locator(`[data-skin-choice="${firstId}"]`).click({position:{x:15,y:15}});await p.waitForFunction(id=>document.querySelector('#skin-grid').dataset.selection===id,firstId);
 await p.locator(`[data-preview-skin="${secondId}"]`).click();await p.locator('.skin-zoom .skin-mini').waitFor();await p.getByRole('button',{name:'プレビューを閉じる',exact:true}).click();
 assert.equal(await p.locator('#skin-grid').getAttribute('data-selection'),firstId,'Preview does not change the selected skin');
 assert.equal(await p.locator('#skin-palette').isVisible(),false,'Selecting an imported skin hides the palette again');
 await p.locator('[data-skin-orientation=landscape]').click();assert.equal(await p.locator('.skin-card').count(),4,'Portrait-only files remain listed while previewing landscape');
 await p.locator('[data-skin-orientation=portrait]').click();if(process.env.SCREENSHOT_DIR){const fs=require('node:fs'),path=require('node:path');fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await p.locator('#skin-grid').scrollIntoViewIfNeeded();await p.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'skin-library-'+kind+'.png')});}
 for(const [width,height]of [[240,320],[320,568],[390,844],[844,390],[768,1024]]){await p.setViewportSize({width,height});assert.equal(await p.locator('#skin-grid').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'Skin cards fit the viewport');}
 await p.setViewportSize({width:390,height:844});
 await importAgain('Original GB fixture','com.rileytestut.delta.game.gb');await p.locator('#close-sheet').click();await p.reload();await p.locator('[data-action=skins]').click();await p.locator('#skin-system').waitFor();assert.equal(await p.locator('#skin-system').inputValue(),'gb','Remember the last platform across reloads');
 await p.locator('#skin-system').selectOption('gba');await p.locator(`[data-skin-choice="${firstId}"]`).waitFor();assert.equal(await p.locator('.skin-card').count(),4);
 assert.equal(await p.locator(`[data-delete-skin="${secondId}"]`).isVisible(),false);
 await p.locator('#manage-skins').click();await p.locator(`[data-delete-skin="${secondId}"]`).click();await p.locator('#cancel-skin-delete').click();await p.locator(`[data-skin-choice="${secondId}"]`).waitFor();
 await p.locator('#manage-skins').click();await p.locator(`[data-delete-skin="${secondId}"]`).click();await p.locator('#confirm-skin-delete').click();await p.locator('#skin-grid').waitFor();
 assert.equal(await p.locator(`[data-skin-choice="${secondId}"]`).count(),0);assert.equal(await p.locator(`[data-skin-choice="${firstId}"]`).count(),1,'Explicit deletion affects only the selected imported file');
 assert.equal(await p.evaluate(async()=>(await(await import('./src/storage/storage.js')).all('skins')).length),2,'The other platform also retains its imported skin');
 for(const system of ['gb','gbc','gba','nes','snes','md','nds']){
  await p.locator('#skin-system').selectOption(system);await p.locator('[data-skin-choice^="builtin:"]').click({position:{x:15,y:15}});
  await p.waitForFunction(()=>document.querySelector('#skin-grid')?.dataset.effective?.startsWith('builtin:'));
  assert.equal(await p.locator('#skin-palette').isVisible(),system!=='nds',system+' palette follows actual body-color support');
 }
 const wrongGame=await p.evaluate(async bytes=>{const{importSkin}=await import('./src/skins/skins.js');try{await importSkin(new File([new Uint8Array(bytes)],'wrong-game.deltaskin'),'snes');return false;}catch(e){return e.message==='このゲーム用のスキンではありません。';}},[...payload]);assert.equal(wrongGame,true);
 const malicious=zip({'../info.json':'{}'});assert.equal(await p.evaluate(async bytes=>{const{readSkinZip}=await import('./src/skins/skin-zip.js');try{await readSkinZip(new Uint8Array(bytes).buffer);return false;}catch{return true;}},[...malicious]),true);
 for(const name of ['not-a-skin.txt','game.gba'])assert.equal(await p.evaluate(async({name,bytes})=>{const{importSkin}=await import('./src/skins/skins.js');try{await importSkin(new File([new Uint8Array(bytes)],name));return false;}catch(e){return e.message.includes('スキンを選択');}},{name,bytes:[...payload]}),true,'Reject non-skin extensions even if their contents look like a skin ZIP');
 const evil={...info,representations:{iphone:{standard:{portrait:{...rep,assets:{resizable:'https://example.com/a.png'}}}}}};const bad=zip({'info.json':JSON.stringify(evil),'controller.pdf':pdf()});assert.equal(await p.evaluate(async bytes=>{const{importSkin}=await import('./src/skins/skins.js');try{await importSkin(new File([new Uint8Array(bytes)],'bad.deltaskin'));return false;}catch{return true;}},[...bad]),true);
 await p.locator('#close-sheet').click();await p.screenshot({path:process.env.SCREENSHOT_PATH||require('node:os').tmpdir()+'/local-play-settings.png'});
 assert.deepEqual(errors,[]);assert.ok(requests.filter(r=>/^https?:/.test(r.url())).every(r=>new URL(r.url()).origin===new URL(base).origin&&r.method()==='GET'&&!r.postData()));console.log('PASS: persistent skin gallery, color changes/reload/platform retention, independent preview, confirmed deletion, local PDF import and no uploads.');await c.close();}finally{await Promise.race([b.close(),new Promise(r=>setTimeout(r,2000))]);}})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
