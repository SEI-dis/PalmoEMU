// SPDX-License-Identifier: AGPL-3.0-or-later
// Original synthetic cartridges only; never reads a user's games or saves.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium';
const carts=require('./cartridges.cjs');
function gba(){const b=Buffer.alloc(8192);b[0xb2]=0x96;b.writeUInt32LE(0xea00003e,0);[0xe59f0018,0xe3a01003,0xe3811b01,0xe1c010b0,0xe59f000c,0xe3a0101f,0xe1c010b0,0xeafffffe,0x04000000,0x06000000].forEach((w,i)=>b.writeUInt32LE(w,0x100+i*4));return b;}
function nds(){const rom=require('./nds-cartridge.cjs')();rom.write('LPTE',12);rom.copy(rom,0x8000,0x200,0x200+rom.readUInt32LE(0x2c));rom.writeUInt32LE(0x8000,0x20);return rom;}
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844}}),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r));page.setDefaultTimeout(20000);
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';await page.goto(base);
  for(const [system,coreKey,rom] of [['gb','jgenesis',carts.gb()],['gbc','jgenesis',carts.gbc()],['nes','jgenesis',carts.nes()],['snes','jgenesis',carts.snes()],['md','jgenesis',carts.md()],['gba','vba-next',gba()],['nds','melonds',nds()]]){
   const result=await page.evaluate(async({system,coreKey,rom})=>{
    const {createCore}=await import('./src/core/core-factory.js'),game={system,coreKey,size:rom.length,name:'Original fixture'},container=document.createElement('div');document.body.append(container);
    const core=createCore(container,game);try{
     await core.load(new Uint8Array(rom),game);core.pause(true);for(let i=0;i<90;i++)core.m._web_frame(0);core.draw();
     const save=core.save(),state=core.state(),pixel=[...core.canvas.getContext('2d').getImageData(0,0,1,1).data];
     core.reset();core.loadState(state);let batteryRoundtrip=true;
     if(save?.length){const input=save.slice();if(system==='nds'||system==='gba')input.fill(0x63);core.restore(input);core.reset();const output=core.save();batteryRoundtrip=input.length===output.length&&input.every((v,i)=>v===output[i]);}
     let failed=false;try{core.loadState(new Uint8Array([1,2,3]));}catch{failed=true;}
     for(let i=0;i<5;i++)core.m._web_frame(0);core.draw();
     let ndsInput=null;if(system==='nds'){
      const color=i=>[...core.screens[i].getContext('2d').getImageData(0,0,1,1).data];
      core.setKeys(1);core.m._web_touch(0,16000,1);for(let i=0;i<5;i++)core.m._web_frame(core.keys);core.draw();ndsInput=[color(0),color(1)];core.releaseTouch();
     }
     return {state:state.length,save:save?.length||0,pixel,failed,ndsInput,batteryRoundtrip};
    }finally{core.close();container.remove();}
   },{system,coreKey,rom:[...rom]});
   assert.ok(result.state>1000);assert.equal(result.failed,true,'Reject malformed states');
   assert.equal(result.batteryRoundtrip,true,'Save import/export across reset');if(system==='nds')assert.equal(result.save,8192);
   if(system!=='nds')assert.equal(result.pixel[3],255,'Opaque visible pixels');
   if(system==='gba')assert.deepEqual(result.pixel,[255,0,0,255]);
   if(system==='nds')for(const color of result.ndsInput)assert.ok(color[1]>245&&color[0]===0&&color[2]===0,'NDS button/stylus input');
   console.log('PASS: alternate core',system,coreKey);
  }
  // Seed the existing/default save and state, then switch via native settings.
  await page.locator('#rom-input').setInputFiles({name:'Switch fixture.gb',mimeType:'application/octet-stream',buffer:Buffer.from(carts.gb())});
  await page.locator('.game-launch').waitFor();
  const id=await page.evaluate(async()=>{const db=await import('./src/storage/storage.js'),[game]=await db.all('library');await db.put('saves',game.id,{bytes:new Uint8Array(8192).fill(0x36),coreId:'mgba-rom64-link-v1'});await db.put('states',game.id+':original',{bytes:new Uint8Array([7]),at:1,coreId:'mgba-rom64-link-v1'});return game.id;});
  await page.locator('.game-launch').click();await page.locator('[data-action=switchCore]').click();await page.locator('[data-core=jgenesis]').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForTimeout(250);await page.locator('#player-menu').click();assert.equal(await page.locator('[data-action=cheats]').count(),0);
  const other=await context.newPage();await other.goto(base);assert.match(await other.evaluate(async id=>{try{await (await import('./src/storage/storage.js')).setGameCore(id,'mgba');return 'unexpected';}catch(e){return e.message;}},id),/プレイ中/);await other.close();
  await page.locator('[data-action=newState]').click();await page.locator('#confirm-state-save').click();await page.locator('[data-slot-load]').click();await page.locator('#sheet').waitFor({state:'hidden'});
  await page.locator('#player-menu').click();await page.locator('[data-action=exit]').click();await page.locator('#player').waitFor({state:'hidden'});
  const saved=await page.evaluate(async id=>{const db=await import('./src/storage/storage.js');return {old:[...(await db.get('saves',id)).bytes],oldStates:(await db.stateEntries(id)).length,newSave:(await db.get('saves',id+'@jgenesis')).bytes.length,newStates:(await db.stateEntries(id+'@jgenesis')).length};},id);
  assert.deepEqual(saved.old,Array(8192).fill(0x36));assert.equal(saved.oldStates,1);assert.equal(saved.newStates,1);assert.ok(saved.newSave>8192);
  await page.locator('.game-launch').click();await page.locator('[data-action=switchCore]').click();await page.locator('[data-core=mgba]').click();await page.locator('[data-action=states]').click();await page.locator('[data-slot-load]').waitFor();assert.equal(await page.locator('[data-slot-load]').count(),1);
  await page.locator('#close-sheet').click();await page.locator('.game-info-play').waitFor();await page.locator('#close-sheet').click();await page.locator('.game-launch').click();const chooser=page.waitForEvent('filechooser');await page.locator('[data-action=importSave]').click();await (await chooser).setFiles({name:'wrong-core.sav',mimeType:'application/octet-stream',buffer:Buffer.from('LPJGSV01invalid')});await page.getByText('このセーブはjgenesis用です。コアを変更してから読み込んでください。',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(async id=>[...(await (await import('./src/storage/storage.js')).get('saves',id)).bytes],id),Array(8192).fill(0x36));
  assert.equal(await page.evaluate(async()=>{const {coreRegistry,supportsGame}=await import('./src/core/core-registry.js');return supportsGame(coreRegistry.gba[1],{size:67108864});}),false,'64 MiB games cannot use the 32 MiB core');
  await page.evaluate(async id=>{const db=await import('./src/storage/storage.js');await db.removeGame(id);if(await db.get('saves',id+'@jgenesis')||(await db.stateEntries(id+'@jgenesis')).length)throw Error('Orphaned alternate data');},id);
  assert.deepEqual(errors,[]);
  // WebKit may expose local Blob/File reads as same-origin requests.
  assert.ok(requests.every(r=>{const url=new URL(r.url());return url.origin===new URL(base).origin&&['http:','https:','blob:'].includes(url.protocol)&&['GET','HEAD'].includes(r.method())&&!r.postData();}));
  console.log('PASS: native core picker; core-specific saves/states; live-session lock; original data intact; full deletion; local-only requests. '+kind);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
