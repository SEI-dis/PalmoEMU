// SPDX-License-Identifier: AGPL-3.0-or-later
// Original GBA cartridge, isolated storage, in-process relay fixture. No public relay traffic.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const browserName=process.env.BROWSER_ENGINE||'chromium',playwright=require('./browser-runtime.cjs');
(async()=>{
 const browser=await playwright[browserName].launch({headless:true,...(browserName==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),p=await ctx.newPage(),errors=[],wire=[];
  let relay,connections=0;
  p.on('pageerror',e=>errors.push(e.message));
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';
  await ctx.route('**/*',route=>{assert.equal(new URL(route.request().url()).origin,new URL(base).origin);return route.continue();});
  await ctx.routeWebSocket('**/*',ws=>{
   assert.match(ws.url(),/^wss:\/\/celio-server\.up\.railway\.app\/socket\.io\//);relay=ws;connections++;
   ws.onMessage(message=>{wire.push(message);if(message.startsWith('40'))ws.send('40{}');else if(message.startsWith('420'))ws.send('430[{"variant":"Ok","value":{"id":"8969"}}]');});
   ws.send('0{"sid":"local-ui-fixture","pingInterval":25000,"pingTimeout":20000}');
  });
  await p.goto(base);
  await p.evaluate(async()=>{
   const {MGBACore}=await import('./src/core/mgba.js'),original=MGBACore.prototype.setSpeed;
   MGBACore.prototype.setSpeed=function(v){window.testEngine=this;return original.call(this,v);};
   const keys=MGBACore.prototype.setKeys;window.testKeys=[];MGBACore.prototype.setKeys=function(v){testKeys.push(v);return keys.call(this,v);};
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedRoom=text;}}});
  });
  await p.locator('#rom-input').setInputFiles({name:'Original floating panel.gba',mimeType:'application/octet-stream',buffer:Buffer.from(require('./link.cjs').cartridge(31,992))});
  await p.locator('.game-launch').click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});
  const panel=p.locator('#link-panel'),trigger=p.locator('#player-link');
  await trigger.tap();assert.equal(await p.locator('#sheet').evaluate(e=>e.open),false);assert.equal(await p.evaluate(()=>testEngine.paused),false);
  assert.equal(await panel.getAttribute('aria-modal'),'false');assert.equal(connections,0,'Opening must not connect');
  const frames=await p.evaluate(()=>testEngine.frames);await p.waitForFunction(n=>testEngine.frames>n+3,frames);
  const a=await p.locator('.skin-button[aria-label=A]').boundingBox();
  await p.mouse.move(a.x+a.width/2,a.y+a.height/2);await p.mouse.down();assert.equal(await p.evaluate(()=>testEngine.keys&1),1);await p.mouse.up();assert.equal(await p.evaluate(()=>testEngine.keys),0);
  await p.locator('#link-input').fill('12');await p.evaluate(()=>testKeys.length=0);await p.locator('#link-input').press('Enter');
  assert.equal(connections,0);assert.ok((await p.evaluate(()=>testKeys)).every(v=>v===0),'Editing panel must not press START');
  // Moving and closing the panel must not pause the core.
  const before=await panel.boundingBox(),head=await p.locator('#link-panel-drag').boundingBox();
  await p.mouse.move(head.x+40,head.y+20);await p.mouse.down();await p.mouse.move(head.x+20,head.y+110,{steps:6});await p.mouse.up();
  assert.ok((await panel.boundingBox()).y>before.y+60);assert.equal(await p.evaluate(()=>testEngine.paused),false);
  await p.locator('#link-panel-drag').focus();const oldY=(await panel.boundingBox()).y;await p.keyboard.press('ArrowUp');assert.equal((await panel.boundingBox()).y,oldY-16);
  await p.keyboard.press('Escape');assert.equal(await panel.isVisible(),false);assert.equal(await trigger.getAttribute('aria-expanded'),'false');
  // Settings/menu entry uses the same Wi-Fi symbol and resumes gameplay.
  await p.locator('#player-menu').click();assert.equal(await p.evaluate(()=>testEngine.paused),true);
  assert.equal(await p.locator('[data-action=link] svg path').first().getAttribute('d'),await trigger.locator('svg path').getAttribute('d'));
  await p.locator('[data-action=link]').click();assert.equal(await panel.isVisible(),true);assert.equal(await p.evaluate(()=>testEngine.paused),false);
  await p.locator('#link-create').click();await p.waitForFunction(()=>document.querySelector('#link-room-number')?.value==='8969');
  assert.equal(await trigger.getAttribute('data-state'),'waiting');assert.equal(await p.locator('#boost').isDisabled(),true);
  const input=await p.locator('#link-room-number').boundingBox(),copy=await p.locator('#link-copy').boundingBox();
  assert.ok(Math.abs(input.y+input.height/2-copy.y-copy.height/2)<2,'Copy is inside the room field');
  await p.locator('#link-copy').tap();assert.equal(await p.evaluate(()=>copiedRoom),'8969');
  await p.locator('#link-panel-close').tap();assert.equal(await panel.isVisible(),false);assert.equal(wire.filter(m=>m.includes('sessionLeft')).length,0);assert.equal(await p.evaluate(()=>testEngine.paused),false);
  await trigger.tap();assert.equal(await p.locator('#link-room-number').inputValue(),'8969');assert.equal(connections,1);
  const dir=path.join(__dirname,'../test-results/link-panel');fs.mkdirSync(dir,{recursive:true});
  for(const [width,height]of [[390,844],[844,390],[320,568],[240,320],[1024,768]]){
   await p.setViewportSize({width,height});await p.waitForTimeout(80);
   const r=await panel.boundingBox(),b=await trigger.boundingBox();assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=width+1&&r.y+r.height<=height+1,JSON.stringify(r));
   assert.ok(Math.abs(b.x+b.width/2-width/2)<1);assert.ok(b.height>=44);
   if(width===390||width===844)await p.screenshot({path:path.join(dir,`${browserName}-${width}x${height}.png`)});
  }
  await p.locator('summary').click();
  assert.equal(await p.locator('#player').evaluate(el=>getComputedStyle(el).touchAction),'pan-y','Player allows vertical panel panning without zoom');
  for(const locator of [panel,panel.locator('.link-panel-body')])assert.equal(await locator.evaluate(el=>getComputedStyle(el).touchAction),'pan-y','Panel retains native vertical panning');
  await panel.locator('.link-panel-body').evaluate(el=>el.scrollTop=el.scrollHeight);
  await p.setViewportSize({width:390,height:844});await p.locator('#link-panel-close').click();
  relay.send('42["partnerJoined",{}]');await p.waitForFunction(()=>document.querySelector('#player-link').dataset.state==='connected');
  assert.equal(await panel.isVisible(),false,'Status updates must not reopen panel');await trigger.tap();
  // Drop restores the backup and leaves the game paused, preserving existing link safety.
  relay.close();await p.waitForFunction(()=>document.querySelector('#player-link').dataset.state==='idle');
  assert.match(await p.locator('#link-status').textContent(),/通信前に戻しました/);assert.equal(await p.evaluate(()=>testEngine.paused),true);
  await p.locator('#link-panel-close').click();await p.locator('#resume-game').click();
  // Closing while asynchronous backup is pending must also stay closed after connection.
  await p.evaluate(async()=>{const {SaveProtection}=await import('./src/storage/save-safety.js'),save=SaveProtection.prototype.save;SaveProtection.prototype.save=async function(core,options){if(options?.reason==='before-link')await new Promise(r=>setTimeout(r,250));return save.call(this,core,options);};});
  await trigger.tap();await p.locator('#link-input').fill('8969');await p.locator('#link-input').press('Enter');await p.locator('#link-panel-close').click();
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});window.dispatchEvent(new Event('blur'));document.dispatchEvent(new Event('visibilitychange'));});
  await p.waitForFunction(()=>document.querySelector('#player-link').dataset.state==='connected');assert.equal(await panel.isVisible(),false);
  assert.equal(await p.evaluate(()=>testEngine.paused),true,'Leaving during async backup keeps joined room paused');
  await p.evaluate(()=>{delete document.hidden;window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
  await p.locator('#resume-game').click();
  relay.send('42["deviceCommand",{"uuid":"begin-game","command":18}]');await p.waitForTimeout(30);
  await p.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await p.waitForFunction(()=>document.querySelector('#player-link').dataset.state==='idle');
  assert.equal(await p.evaluate(()=>testEngine.paused),true,'Leaving after handshake starts restores backup and pauses');
  await p.evaluate(()=>window.dispatchEvent(new Event('focus')));if(await panel.isVisible())await p.locator('#link-panel-close').click();await p.locator('#resume-game').click();
  await trigger.tap();await p.locator('#link-create').click();await p.locator('#link-stop').waitFor();
  await p.locator('#link-stop').click();await p.waitForFunction(()=>document.querySelector('#player-link').dataset.state==='idle');
  assert.ok(wire.some(m=>m==='42["sessionLeft"]'));assert.equal(await p.evaluate(()=>testEngine.paused),true);
  await p.locator('#link-panel-close').click();await p.locator('#player-menu').click();await p.locator('[data-action=exit]').click();await p.locator('#player').waitFor({state:'hidden'});
  // No Wi-Fi shortcut is offered for an unsupported machine.
  await p.locator('#rom-input').setInputFiles({name:'Original NES test.nes',mimeType:'application/octet-stream',buffer:Buffer.from(require('./cartridges.cjs').nes())});
  await p.getByRole('button',{name:'Original NES testの設定を開く',exact:true}).click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});assert.equal(await trigger.isVisible(),false);assert.equal(await panel.isVisible(),false);
  assert.deepEqual(errors,[]);await ctx.close();
  console.log('PASS: non-modal play/input, field copy, menu Wi-Fi shortcut, drag/keyboard movement, responsive bounds, retained connection while hidden, status updates, rollback, pending-backup close and unsupported cores.');
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
