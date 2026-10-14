// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic cartridge and intercepted sockets only; no public server traffic.
const assert=require('node:assert/strict');
(async()=>{
 const name=process.env.BROWSER_ENGINE||'chromium';
 const browser=await require('./browser-runtime.cjs')[name].launch({headless:true,...(name==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),p=await ctx.newPage();
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/',connections=[],wire=[],errors=[];
  p.on('pageerror',error=>errors.push(error.message));
  await ctx.route('**/*',route=>{assert.equal(new URL(route.request().url()).origin,new URL(base).origin);return route.continue();});
  await ctx.routeWebSocket('**/*',socket=>{
   connections.push(socket.url());
   assert.equal(socket.url(),'wss://relay.example/socket.io/?EIO=4&transport=websocket');
   socket.onMessage(message=>{wire.push(message);if(message.startsWith('40'))socket.send('40{}');else if(message.startsWith('420'))socket.send('430[{"variant":"Ok","value":{"id":"1234"}}]');});
   socket.send('0{"sid":"isolated-test","pingInterval":25000,"pingTimeout":20000}');
  });
  await p.goto(base);
  await p.locator('#rom-input').setInputFiles({name:'Original relay test.gba',mimeType:'application/octet-stream',buffer:Buffer.from(require('./link.cjs').cartridge(31,992))});
  await p.locator('.game-launch').click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});
  await p.locator('#player-link').click();await p.locator('#link-server-settings summary').click();
  assert.equal(await p.locator('#link-server').inputValue(),'wss://celio-server.up.railway.app');assert.equal(connections.length,0);
  await p.locator('#link-server').fill('wss://relay.example/other');await p.locator('#link-create').click();
  assert.equal(connections.length,0);assert.equal(await p.locator('#link-server').count(),1,'Invalid setting leaves controls available');
  await p.locator('#link-server').fill('wss://user:secret@relay.example');await p.locator('#link-create').click();assert.equal(connections.length,0);
  await p.locator('#link-server-reset').click();assert.equal(await p.locator('#link-server').inputValue(),'wss://celio-server.up.railway.app');
  await p.locator('#link-server').fill('wss://relay.example');await p.locator('#link-server').press('Tab');
  assert.equal(await p.evaluate(()=>localStorage.getItem('palmo-celio-relay')),'wss://relay.example');assert.equal(connections.length,0,'Changing the server never connects by itself');
  await p.locator('#link-panel-close').click();await p.locator('#player-link').click();
  assert.equal(await p.locator('#link-server').inputValue(),'wss://relay.example');
  await p.locator('#link-create').click();await p.waitForFunction(()=>document.querySelector('#link-room-number')?.value==='1234');
  assert.equal(connections.length,1);assert.equal(await p.locator('#link-server').count(),0,'Relay cannot change during an active session');
  await p.locator('#link-stop').click();await p.waitForFunction(()=>document.querySelector('#link-server'));
  assert.equal(await p.locator('#link-server').inputValue(),'wss://relay.example');assert(wire.every(text=>text.startsWith('40')||text.startsWith('420')||text==='42["sessionLeft"]'));
  // New page, same isolated storage: preference survives restart but no session auto-connects.
  await p.reload();assert.equal(connections.length,1);
  await p.locator('.game-launch').click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});
  await p.locator('#continue-save').click();
  await p.locator('#player-link').click();await p.locator('#link-server-settings summary').click();
  assert.equal(await p.locator('#link-server').inputValue(),'wss://relay.example');
  await p.locator('#link-server-reset').click();assert.equal(await p.evaluate(()=>localStorage.getItem('palmo-celio-relay')),null);
  for(const [width,height]of [[320,568],[844,390]]){
   await p.setViewportSize({width,height});await p.waitForTimeout(80);
   const bounds=await p.locator('#link-panel').boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1);
  }
  assert.deepEqual(errors,[]);await ctx.close();
  console.log('PASS relay UI: opt-in secure server, invalid URL rejection, persistence/reset, no auto-connect, session immutability, bounded mobile panel and local-only fixtures.');
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
