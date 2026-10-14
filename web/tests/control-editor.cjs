// SPDX-License-Identifier: AGPL-3.0-or-later
// Original in-memory cartridges only. Never reads user ROMs or their profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('./browser-runtime.cjs');
const base=process.env.TEST_URL||'http://127.0.0.1:4173/';
const {cartridge}=require('./link.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),p=await ctx.newPage(),errors=[],uploads=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url())&&(r.method()!=='GET'||!r.url().startsWith(base)))uploads.push(r.url());});
  await p.goto(base);
  const close=()=>p.locator('#close-sheet').click();
  const openShared=async()=>{await p.locator('[data-tab=settings]').click();await p.locator('#content [data-action=skins]').click();await p.locator('#skin-preview .skin-mini').waitFor();};
  const edit=async()=>{await p.locator('#edit-controls').click();await p.locator('.edit-control').first().waitFor();};
  const save=async()=>{await p.locator('#edit-save').click();await p.locator('#skin-grid').waitFor();};
  const transparency=async(id,v)=>{await p.locator('#edit-selection').selectOption(id);await p.locator('#edit-opacity').fill(String(v));await p.locator('#edit-opacity').dispatchEvent('input');};
  const draftButton=id=>p.locator(`[data-edit-control="${id}"]`);
  const move=async(id,dx,dy)=>{const b=await draftButton(id).boundingBox();await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width/2+dx,b.y+b.height/2+dy,{steps:8});await p.mouse.up();};
  const common=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).controlLayouts?.gba);
  const games=()=>p.evaluate(async()=>{const db=await import('./src/storage/storage.js');return(await db.all('library')).sort((a,b)=>a.name.localeCompare(b.name));});
  const openGame=async name=>{await p.getByRole('button',{name:name+'のメニュー',exact:true}).click();await p.locator('[data-action=gameSkin]').click();await p.locator('#skin-preview .skin-mini').waitFor();};
  await openShared();await edit();
  const before=await draftButton('a').boundingBox();await move('a',-15,-30);const after=await draftButton('a').boundingBox();assert.ok(after.y<before.y-20,'Drag moves artwork');
  await transparency('a',55);assert.equal(await draftButton('a').locator('.edit-art').evaluate(e=>e.style.opacity),'0.45');
  await p.locator('#edit-cancel').click();assert.equal(await common(),undefined,'Cancel has no stored effects');
  await edit();await move('a',-15,-30);await transparency('a',55);
  await p.locator('[data-edit-orientation=landscape]').click();await move('b',-12,-5);await transparency('b',30);
  await p.locator('[data-edit-orientation=portrait]').click();await save();
  const saved=await common();assert.equal(saved.portrait.a.opacity,.45);assert.equal(saved.landscape.b.opacity,.7);assert.equal(saved.landscape.a,undefined);
  await close();await p.reload();await openShared();await edit();assert.equal(await draftButton('a').locator('.edit-art').evaluate(e=>e.style.opacity),'0.45','Restart retains preference');
  await transparency('all',80);assert.ok(await p.locator('.edit-art').evaluateAll(a=>a.every(e=>e.style.opacity==='0.2')),'All-button opacity');
  await p.locator('#edit-reset').click();assert.ok(await p.locator('.edit-art').evaluateAll(a=>a.every(e=>e.style.opacity==='1')));await p.locator('[data-edit-orientation=landscape]').click();assert.equal(await draftButton('b').locator('.edit-art').evaluate(e=>e.style.opacity),'0.7','Reset only chosen orientation');
  await p.locator('#edit-cancel').click();assert.deepEqual(await common(),saved);
  // Failed browser storage must leave the editor open, the stored value intact and retry available.
  await edit();await transparency('a',10);await p.evaluate(()=>{window.oldSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='manic-settings')throw new DOMException('Full','QuotaExceededError');return oldSet.call(this,k,v);};});
  await p.locator('#edit-save').click();await p.getByText('容量が不足しているため保存できません。',{exact:true}).waitFor();assert.deepEqual(await common(),saved);assert.equal(await p.locator('#edit-save').isEnabled(),true);
  await p.evaluate(()=>{Storage.prototype.setItem=window.oldSet;});await p.locator('#edit-cancel').click();await close();
  await p.locator('#rom-input').setInputFiles([{name:'Demo One.gba',mimeType:'application/octet-stream',buffer:Buffer.from(cartridge(31,992))},{name:'Demo Two.gba',mimeType:'application/octet-stream',buffer:Buffer.from(cartridge(62,496))}]);await p.locator('.game-launch').nth(1).waitFor();
  await openGame('Demo One');await edit();await transparency('a',20);await move('a',12,20);
  if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await p.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'control-editor-portrait.png')});}
  await save();let records=await games();assert.equal(records[0].controlLayout.portrait.a.opacity,.8);assert.equal(records[1].controlLayout,undefined);assert.deepEqual(await common(),saved);
  await close();await p.reload();
  // Observe actual core inputs, including absence of gameplay actions while editing.
  await p.evaluate(async()=>{const {MGBACore}=await import('./src/core/mgba.js');const old=MGBACore.prototype.setKeys;window.keyLog=[];MGBACore.prototype.setKeys=function(mask){keyLog.push(mask);return old.call(this,mask);};});
  await p.getByRole('button',{name:'Demo Oneの設定を開く',exact:true}).click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});
  assert.equal(await p.locator('.skin-button[aria-label=A]').evaluate(e=>e.style.opacity),'0.8');
  const actual=await p.locator('.skin-button[aria-label=A]').boundingBox(),aConfig=(await games())[0].controlLayout.portrait.a;
  assert.ok(Math.abs(actual.x-aConfig.x*(390-actual.width))<.1&&Math.abs(actual.y-aConfig.y*(844-actual.height))<.1,'Rendered position matches stored hit target');
  await p.mouse.move(actual.x+actual.width/2,actual.y+actual.height/2);await p.mouse.down();await p.mouse.up();assert.ok(await p.evaluate(()=>keyLog.includes(1)),'Moved A sends A to core: '+JSON.stringify(await p.evaluate(({x,y,width,height})=>({keys:keyLog,paused:!document.querySelector('#resume-game').hidden,hit:document.elementFromPoint(x+width/2,y+height/2)?.outerHTML.slice(0,200)}),actual)));
  await p.locator('#player-menu').click();await p.locator('#sheet [data-action=skins]').click();await edit();await p.evaluate(()=>{keyLog=[];});
  await move('quick-save',4,4);await move('quick-load',-4,-4);await draftButton('a').focus();await p.keyboard.press('ArrowLeft');assert.ok(await p.evaluate(()=>keyLog.every(k=>k===0)),'Editing cannot control game');
  assert.equal(await p.evaluate(async()=>{const db=await import('./src/storage/storage.js');return(await db.all('states')).length;}),0,'Editing shortcuts cannot save a state');
  // Touch drag and edge clamps, then all relevant viewport sizes without clipping tools.
  const touch=await ctx.newCDPSession(p),box=await draftButton('dpad').boundingBox();
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width/2+12,y:box.y+box.height/2-12}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});const moved=await draftButton('dpad').boundingBox();assert.ok(moved.x>box.x+5,'Touch moves D-pad');
  for(const [width,height]of [[320,568],[568,320],[390,844],[844,390],[820,1180],[1180,820],[1280,720]]){
   await p.setViewportSize({width,height});await p.locator(`[data-edit-orientation=${width>height?'landscape':'portrait'}]`).click();await p.locator('#edit-save').scrollIntoViewIfNeeded();
   const bounds=await p.locator('#edit-save').boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+.1&&bounds.y+bounds.height<=height+.1,'Save reachable at '+width+'x'+height);
   if(width===844&&process.env.SCREENSHOT_DIR)await p.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'control-editor-landscape.png')});
  }
  await move('a',-1000,-1000);const limited=await draftButton('a').boundingBox(),host=await p.locator('.edit-preview').boundingBox();assert.ok(limited.x>=host.x-.1&&limited.y>=host.y-.1,'Drag stays in skin');
  await p.locator('#edit-inherit').click();await save();assert.equal((await games())[0].controlLayout,undefined,'Inherit clears override');
  await close();await p.locator('#player-menu').click();await p.locator('[data-action=exit]').click();await p.locator('#player').waitFor({state:'hidden'});
  // Atomic preference writes preserve newer game metadata, ROM bytes and save records.
  await p.evaluate(async()=>{const db=await import('./src/storage/storage.js'),g=(await db.all('library'))[0],rom=await db.get('roms',g.id);await db.put('library',g.id,{...g,name:'New name',favorite:true});await db.put('saves',g.id,{bytes:new Uint8Array([1,2,3])});await db.setGameControls(g.id,{portrait:{a:{opacity:.5}}});const now=await db.get('library',g.id);if(now.name!=='New name'||!now.favorite)throw Error('Lost metadata');if(String(await db.get('roms',g.id))!==String(rom)||String((await db.get('saves',g.id)).bytes)!=='1,2,3')throw Error('ROM or save changed');});
  // Apply malformed/old coordinates safely at different sizes for every system.
  await p.evaluate(async()=>{const {builtinSkin,builtinLayout}=await import('./src/skins/skin-art.js');for(const system of ['gba','gb','gbc','nes','snes','md'])for(const [w,h] of [[320,568],[568,320],[844,390],[820,1180],[1280,720]]){const r=builtinLayout(builtinSkin(system),w,h,{a:{x:4,y:-2,opacity:0},dpad:{x:.9,y:.9,opacity:.4}});for(const i of [...r.items,...r.actions]){const f=i.frame;if(f.x<0||f.y<0||f.x+f.width>w+.1||f.y+f.height>h+.1||i.opacity<.2)throw Error('Invalid control bounds');}}});
  assert.deepEqual(errors,[]);assert.deepEqual(uploads,[]);await ctx.close();
  console.log('PASS: pointer/touch/keyboard moves, hit targets, opacity, separate orientations, cancel/reset/inherit, restart, game isolation, storage failure/retry, 7 editor viewports, safe bounds, metadata preservation, no gameplay actions or uploads.');
 }finally{await Promise.race([browser.close(),new Promise(r=>setTimeout(r,2500))]);}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
