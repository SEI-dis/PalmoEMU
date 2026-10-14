// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('./browser-runtime.cjs');
const base=process.env.TEST_URL||'http://127.0.0.1:4173/';
const {cartridge}=require('./link.cjs');
(async()=>{const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),p=await context.newPage(),errors=[],uploads=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url())&&(r.method()!=='GET'||!r.url().startsWith(base)))uploads.push(r.url());});
  await p.goto(base);
  await p.locator('#rom-input').setInputFiles([{name:'Demo One.gba',mimeType:'application/octet-stream',buffer:Buffer.from(cartridge(31,992))},{name:'Demo Two.gba',mimeType:'application/octet-stream',buffer:Buffer.from(cartridge(62,496))}]);
  await p.locator('.game-launch').nth(1).waitFor();
  const stored=()=>p.evaluate(async()=>{const db=await import('./src/storage/storage.js');return(await db.all('library')).sort((a,b)=>a.name.localeCompare(b.name));});
  const choose=async id=>{if(!id)await p.locator('#skin-inherit').check();else if(id.startsWith('builtin:')){if(!await p.locator('#skin-palette').isVisible())await p.locator('[data-skin-choice^="builtin:"]').click({position:{x:15,y:15}});await p.locator(`[data-skin-color=${id.slice(8)}]`).click();}else await p.locator(`[data-skin-choice="${id}"]`).click({position:{x:15,y:15}});await p.waitForFunction(id=>document.querySelector('#skin-grid')?.dataset.selection===id&&!document.querySelector('[data-skin-color]').disabled,id);};
  const openGameSkin=async name=>{await p.getByRole('button',{name:name+'のメニュー',exact:true}).click();await p.locator('[data-action=gameSkin]').click();await p.locator('.skin-mini').first().waitFor();};
  const openDefaults=async()=>{await p.locator('[data-tab=settings]').click();await p.locator('#content [data-action=skins]').click();await p.locator('.skin-mini').first().waitFor();};
  const close=async()=>{await p.locator('#close-sheet').click();if(await p.locator('#sheet.game-info').isVisible())await p.locator('#close-sheet').click();};
  const shared=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).skins.gba.portrait);
  const expectColor=async color=>p.waitForFunction(color=>decodeURIComponent(document.querySelector('#skin').style.backgroundImage).includes(color),color);
  await openDefaults();await choose('builtin:mint');assert.equal(await shared(),'builtin:mint');await close();await p.locator('[data-tab=games]').click();
  await openGameSkin('Demo One');assert.equal(await p.locator('#skin-grid').getAttribute('data-selection'),'');assert.equal(await p.locator('#skin-system').count(),0);await choose('builtin:sunset');
  let games=await stored();assert.equal(games[0].skinId.portrait,'builtin:sunset');assert.equal(games[1].skinId,undefined);assert.equal(await shared(),'builtin:mint');
  if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await p.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'game-skin-picker.png')});}
  await close();await p.reload();await p.getByRole('button',{name:'Demo Oneの設定を開く',exact:true}).click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});await expectColor('#dfa58f');
  await p.locator('#player-menu').click();await p.locator('#sheet [data-action=skins]').click();await choose('builtin:graphite');await expectColor('#566374');assert.equal(await shared(),'builtin:mint');await close();
  await p.locator('#player-menu').click();await p.locator('[data-action=exit]').click();await p.locator('#player').waitFor({state:'hidden'});
  await p.getByRole('button',{name:'Demo Twoの設定を開く',exact:true}).click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});await expectColor('#9bc7b7');await p.locator('#player-menu').click();await p.locator('[data-action=exit]').click();await p.locator('#player').waitFor({state:'hidden'});
  await openDefaults();await choose('builtin:purple');await close();await p.locator('[data-tab=games]').click();await openGameSkin('Demo One');assert.equal(await p.locator('#skin-grid').getAttribute('data-selection'),'builtin:graphite');await choose('');assert.equal((await stored())[0].skinId,undefined);await close();
  await p.getByRole('button',{name:'Demo Oneの設定を開く',exact:true}).click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});await expectColor('#9383d0');await p.locator('#player-menu').click();await p.locator('[data-action=exit]').click();await p.locator('#player').waitFor({state:'hidden'});
  // Original, local-only skin fixture; shared by two game overrides.
  await p.evaluate(async()=>{const db=await import('./src/storage/storage.js');const canvas=document.createElement('canvas');canvas.width=390;canvas.height=844;const ctx=canvas.getContext('2d');ctx.fillStyle='#244034';ctx.fillRect(0,0,390,844);const blob=await new Promise(r=>canvas.toBlob(r));await db.put('skins','skin:fixture',{id:'skin:fixture',name:'Local fixture',system:'gba',images:{background:blob},portrait:{mappingSize:{width:390,height:844},assets:{resizable:'background'},screens:[{outputFrame:{x:20,y:20,width:350,height:233}}],items:[]}});});
  for(const name of ['Demo One','Demo Two']){await openGameSkin(name);await choose('skin:fixture');await close();}
  await openGameSkin('Demo One');await p.locator('#manage-skins').click();await p.locator('[data-delete-skin="skin:fixture"]').click();await p.locator('#cancel-skin-delete').click();assert.ok((await stored()).every(g=>g.skinId?.portrait==='skin:fixture'));
  await p.locator('#manage-skins').click();await p.locator('[data-delete-skin="skin:fixture"]').click();await p.locator('#confirm-skin-delete').click();await p.waitForFunction(()=>document.querySelector('#skin-grid')?.dataset.selection==='');assert.ok((await stored()).every(g=>!g.skinId));
  assert.equal(await p.evaluate(async()=>{const db=await import('./src/storage/storage.js');return(await db.all('roms')).length;}),2);
  // Missing overrides inherit the platform default; compatibility works for GB/GBC.
  assert.equal(await p.evaluate(async()=>{const {loadSkin}=await import('./src/skins/skins.js');return(await loadSkin('gba','skin:missing','builtin:mint')).id;}),'builtin:mint');
  assert.equal(await p.evaluate(async()=>{const {skinSupportsSystem}=await import('./src/skins/skins.js');return skinSupportsSystem('gb','gbc')&&!skinSupportsSystem('snes','gba');}),true);
  // Updating one field must preserve newer metadata in storage.
  await p.evaluate(async()=>{const db=await import('./src/storage/storage.js'),g=(await db.all('library'))[0];await db.put('library',g.id,{...g,favorite:true});await db.setGameSkin(g.id,'builtin:mint');if(!(await db.get('library',g.id)).favorite)throw Error('Metadata overwritten');});
  assert.deepEqual(errors,[]);assert.deepEqual(uploads,[]);await context.close();
  console.log('PASS: per-game isolation, shared defaults, restart, live changes, inherit/reset, imported-skin deletion/cancel, orphan fallback, metadata preservation and no uploads.');
 }finally{await Promise.race([browser.close(),new Promise(r=>setTimeout(r,2500))]);}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
