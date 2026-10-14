// SPDX-License-Identifier: AGPL-3.0-or-later
// CELIO_SERVER_ROOT: pinned Celio-Server with test-built client/session classes.
// CELIO_REFERENCE_ROOT: unmodified published mgba.js, mgba.wasm, link-session.js.
// Both are test-only fixtures, never shipped to the production browser.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http'),{fork,spawnSync}=require('node:child_process');
const {cartridge}=require('./link.cjs'),{createStaticServer}=require('../scripts/serve.cjs');
const relayURL='wss://celio-server.up.railway.app/socket.io/?EIO=4&transport=websocket';
const reference=process.env.CELIO_REFERENCE_ROOT,serverRoot=process.env.CELIO_SERVER_ROOT;
assert.ok(reference&&serverRoot,'Specify the pinned local compatibility fixtures');
if(!process.env.CELIO_TEST_PROTOCOL){
 for(const protocol of ['legacy','modern']){
  const root=protocol==='legacy'?serverRoot:path.join(serverRoot,'../celio-server-modern/Celio-Server-8f509bdcf2a8383b936e0f2f31b2f6553ae421ce');
  const result=spawnSync(process.execPath,[__filename],{env:{...process.env,CELIO_TEST_PROTOCOL:protocol,CELIO_SERVER_ROOT:root},stdio:'inherit',windowsHide:true,timeout:140000});
  if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
 }process.exit(0);
}
const modern=process.env.CELIO_TEST_PROTOCOL==='modern';
(async()=>{
 const relay=fork(path.join(__dirname,'celio-server.cjs'),{stdio:['ignore','ignore','inherit','ipc']}),wire=[];
 relay.on('message',m=>{if(m.event)wire.push(m);});
 const port=await new Promise(resolve=>relay.on('message',m=>{if(m.port)resolve(m.port);}));
 console.log('Local Celio relay ready:',process.env.CELIO_TEST_PROTOCOL);
 const appHandler=createStaticServer().listeners('request')[0];
 const server=http.createServer((req,res)=>{
  if(req.url==='/__reference__/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><html><meta charset="utf-8"><body><script src="mgba.js"></script><script src="link-session.js"></script></body></html>');}
  if(/^\/__reference__\/(mgba.js|mgba.wasm|link-session.js)$/.test(req.url)){res.setHeader('Content-Type',req.url.endsWith('.wasm')?'application/wasm':'text/javascript');return fs.createReadStream(path.join(reference,req.url.split('/').pop())).pipe(res);}
  appHandler(req,res);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/',browserName=process.env.BROWSER_ENGINE||'chromium';
 const browser=await require('./browser-runtime.cjs')[browserName].launch({headless:true,...(browserName==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})}),errors=[];
 console.log('Browser ready.');const dropped=new Set();
 async function context(){
  const c=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});c.setDefaultTimeout(15000);c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  await c.route('**/*',route=>{assert.equal(new URL(route.request().url()).origin,new URL(base).origin,'External HTTP in local test');return route.continue();});
  await c.routeWebSocket('**/*',ws=>{
   assert.equal(ws.url(),relayURL);
   // Playwright connectToServer() cannot change the URL. Explicit Node loopback
   // forwarding keeps this fixture independent of the public relay.
   const WS=require(path.join(serverRoot,'node_modules/ws')),remote=new WS(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`),queued=[];
   const sentAcks=new Map(),receivedAcks=new Map();
   function drop(message,pending,direction){
    const ack=/^43(\d+)/.exec(message);if(!ack)return false;
    const name=pending.get(ack[1]),key=direction+':'+name;
    if(modern&&['deviceData','deviceStatus','deviceCommand','partnerJoined'].includes(name)&&!dropped.has(key)){dropped.add(key);return true;}return false;
   }
   ws.onMessage(message=>{if(drop(message,receivedAcks,'client'))return;const e=/^42(\d+)\["([^"]+)"/.exec(message);if(e)sentAcks.set(e[1],e[2]);if(remote.readyState===WS.OPEN)remote.send(message);else queued.push(message);});
   remote.on('open',()=>{for(const m of queued)remote.send(m);queued.length=0;});
   remote.on('message',(data,isBinary)=>{const message=data.toString();if(drop(message,sentAcks,'server'))return;const e=/^42(\d+)\["([^"]+)"/.exec(message);if(e)receivedAcks.set(e[1],e[2]);ws.send(isBinary?data:message);});
   remote.on('close',()=>ws.close({code:1000}));remote.on('error',()=>ws.close({code:1011}));ws.onClose(()=>remote.close());
  });return c;
 }
 async function ours(p,own,wanted,speed=1){await p.goto(base);await p.evaluate(async({rom,speed})=>{
   const {MGBACore}=await import('./src/core/mgba.js'),{RoomLink}=await import('./src/link/room-link.js');
   const core=new MGBACore(document.createElement('canvas'));await core.load(new Uint8Array(rom));core.setSpeed(speed);window.test={core,status:[]};
   test.link=new RoomLink(core.linkIO(),{onStatus:s=>test.status.push(s),onEnd:(s,info)=>test.end={s,...info}});
 },{rom:[...cartridge(own,wanted)],speed});}
 async function theirs(p,own,wanted){await p.goto(base+'__reference__/');await p.evaluate(async rom=>{
   const ids=['link-usb-support','link-usb-online','link-status','link-hud-status','link-host','link-join','link-local-start','link-usb-start','link-pick-save2','link-blank2','link-room','link-server','link-end','link-backup','link-export2','link-hud','link-view0','link-view1','link-usb-start','link-save2','link-save2-name','link-open','link-hud-settings'];
   for(const id of new Set(ids)){const e=document.createElement('input');e.id=id;document.body.append(e);}
   const m=await createMGBA();const upload=(data,fn)=>{const p=m._malloc(data.length);try{m.HEAPU8.set(data,p);return fn(p,data.length);}finally{m._free(p);}};
   const bytes=new Uint8Array(rom);if(!upload(bytes,m._web_load))throw new Error('Reference ROM load failed');
   window.test={m};test.session=createLinkSession({m,$:id=>document.getElementById(id),upload,store:{read:async()=>null,write:async()=>{}},getGame:()=>({loaded:true,bytes,key:'synthetic',name:'synthetic.gba',cheats:false}),beforeStart:async()=>{},mode:()=>{},close:()=>{},open:()=>{},release:()=>{},refresh:()=>{},audio:()=>{}});
   await test.session.onGame();const tick=t=>{test.session.tick(t,0);test.raf=requestAnimationFrame(tick);};test.raf=requestAnimationFrame(tick);
 },[...cartridge(own,wanted)]);}
 try{
  if(modern){const c=await context(),p=await c.newPage();await p.goto(base);await require('./room-protocol.cjs')(p);await c.close();}
  // Exercise both roles at normal speed, plus deliberately uneven scheduling.
  // A successful recipient must keep sending until the other CPU also receives.
  // This test-only speed skew does not change the application's 1x link limit.
  for(const {host,speed} of modern?[]:[{host:'ours',speed:1},{host:'theirs',speed:1},{host:'theirs',speed:5}]){
   const a=await context(),z=await context(),p=await a.newPage(),q=await z.newPage();console.log('Loading local core');await ours(p,31,992,speed);console.log('Loading reference core');await theirs(q,992,31);console.log('Connecting',host,'test speed',speed);
   let room;
   if(host==='ours'){await p.evaluate(()=>test.link.start());try{await p.waitForFunction(()=>test.link.joined,null,{timeout:10000});}catch(e){console.log(await p.evaluate(()=>({status:test.status,end:test.end,ready:test.link.socket.readyState})));throw e;}room=await p.evaluate(()=>test.link.room);await q.locator('#link-room').fill(room);await q.locator('#link-join').click();}
   else {await q.locator('#link-host').click();await q.waitForFunction(()=>/^\d{4}$/.test(document.getElementById('link-room').value));room=await q.locator('#link-room').inputValue();await p.evaluate(r=>test.link.start(r),room);}
   try{await p.waitForFunction(()=>test.core.canvas.getContext('2d').getImageData(0,0,1,1).data[1]>200,null,{timeout:30000});await q.waitForFunction(()=>test.m.HEAPU8[test.m._web_pixels()]>200,null,{timeout:30000});}
   catch(e){console.log('diagnostic',await p.evaluate(()=>({status:test.status,phase:test.link.device.phase,sent:test.link.sent,received:test.link.received,end:test.end})),await q.evaluate(()=>({status:document.getElementById('link-status').textContent,pixel:[...test.m.HEAPU8.slice(test.m._web_pixels(),test.m._web_pixels()+4)]})));throw e;}
   assert.ok(await p.evaluate(()=>test.link.sent>0&&test.link.received>0));await p.evaluate(()=>test.link.close());await q.waitForFunction(()=>!test.session.busy);assert.match(await q.locator('#link-status').textContent(),/通信前/);
   await p.evaluate(()=>test.core.close());await a.close();await z.close();console.log('PASS: actual GBA CPUs exchange words with unmodified published liru55 WASM + transport; host='+host+'; test speed='+speed);
  }
  // User-visible room UI, durable backup and rollback in separate browser libraries.
  const a=await context(),z=await context(),pages=[await a.newPage(),await z.newPage()];
  for(let i=0;i<2;i++){
   const p=pages[i];await p.goto(base);await p.locator('#rom-input').setInputFiles({name:'LOCAL_PRIVATE_CANARY.gba',mimeType:'application/octet-stream',buffer:Buffer.from(cartridge(i?992:31,i?31:992))});await p.locator('.game-launch').click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});
   await p.locator('#boost').click();await p.locator('#boost').click();assert.equal(await p.locator('#boost').textContent(),'3×');await p.locator('#player-menu').click();await p.locator('[data-action=link]').click();
  }
  const [p,q]=pages;await p.locator('#link-create').click();await p.waitForFunction(()=>/^\d{4}$/.test(document.querySelector('#link-room-number')?.value));
  console.log('UI host room created.');
  await q.locator('#link-input').fill(await p.locator('#link-room-number').inputValue());await q.locator('#link-join').click();
  for(const page of pages){await page.locator('#link-room-number').waitFor();await page.locator('#link-panel-close').click();assert.equal(await page.locator('#boost').textContent(),'1×');assert.equal(await page.locator('#boost').isDisabled(),true);}
  console.log('UI joined.');
  await p.waitForFunction(()=>document.querySelector('#screen canvas').getContext('2d').getImageData(0,0,1,1).data[1]>200);
  const before=await p.evaluate(async()=>{const db=await import('./src/storage/storage.js'),[game]=await db.all('library'),rs=await db.get('recoveries',game.id);return {id:game.id,image:rs[0]?.image,cpu:[...rs[0].bytes.slice(0x20,0x60)],recoveries:rs.map(r=>r.hash),saved:await db.get('saves',game.id)};});assert.ok(before.recoveries.length>0);
  // Timer autosaves must not replace the pre-link save or recovery state.
  await p.waitForTimeout(10500);
  assert.deepEqual(await p.evaluate(async id=>{const db=await import('./src/storage/storage.js');return {recoveries:(await db.get('recoveries',id)).map(r=>r.hash),saved:await db.get('saves',id)};},before.id),{recoveries:before.recoveries,saved:before.saved});
  relay.send('drop');try{await p.waitForFunction(()=>document.querySelector('#boost').textContent==='3×');}catch(e){console.log('Drop diagnostic',errors,await p.evaluate(()=>({toast:document.querySelector('#toast').textContent,speed:document.querySelector('#boost').textContent,playerHidden:document.querySelector('#player').hidden})));throw e;}
  const restoredImage=await p.evaluate(async url=>{const image=new Image();image.src=url;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);const original=c.getContext('2d').getImageData(0,0,c.width,c.height).data,restored=document.querySelector('#screen canvas').getContext('2d').getImageData(0,0,c.width,c.height).data;let max=0;for(let i=0;i<original.length;i++)max=Math.max(max,Math.abs(original[i]-restored[i]));return {max,original:[...original.slice(0,4)],restored:[...restored.slice(0,4)]};},before.image);
  assert.equal(restoredImage.max,0,'Paused restore must show the paired backup screenshot');
  assert.deepEqual(await p.evaluate(async id=>[...(await (await import('./src/storage/storage.js')).get('recoveries',id))[0].bytes.slice(0x20,0x60)],before.id),before.cpu,'GBA r0-r15 including PC must return to the pre-link state');
  if(!await p.locator('#link-panel').isVisible())await p.locator('#player-link').click();assert.match(await p.locator('#link-status').textContent(),/通信前/);
  console.log('PASS: visible room UI; 1× during link; no mid-link autosaves; disconnection restores pre-link CPU state and prior speed.');
  await a.close();await z.close();
  // Normal protocol close is distinct from interrupted sessions.
  const c=await context(),d=await context(),x=await c.newPage(),y=await d.newPage();await ours(x,31,992);await ours(y,992,31);
  await x.evaluate(()=>test.link.start());await x.waitForFunction(()=>test.link.joined);await y.evaluate(room=>test.link.start(room),await x.evaluate(()=>test.link.room));
  await x.waitForFunction(()=>test.link.received>0);await y.waitForFunction(()=>test.link.received>0);
  for(const page of [x,y])await page.evaluate(()=>{
   test.core.pause(true);const dev=test.link.device;dev.phase=1;dev.rx=[];dev.tx=[];dev.received=[];
   dev.receive([0xCAFE,0x17,...Array(6).fill(0),0x5FFF,...Array(23).fill(0)]);
   dev.transfer(0);for(let i=0;i<8;i++)dev.transfer(0);
   dev.transfer(0);for(let i=0;i<8;i++)dev.transfer(i===0?0x5FFF:0);dev.transfer(0);
  });
  for(const page of [x,y]){await page.waitForFunction(()=>test.end);assert.equal(await page.evaluate(()=>test.end.keep),true);await page.evaluate(()=>test.core.close());}
  await c.close();await d.close();console.log('PASS: Celio normal-close sequence commits only after game close and server sessionClose.');
  // Wire allow-list excludes ROM names, file blobs, saves, SDP, telemetry and HTTP upload.
  assert.ok(wire.length>0);for(const {event,args} of wire){assert.ok(['sessionCreate','sessionJoin','sessionLeft','deviceStatus','deviceData'].includes(event));const s=JSON.stringify(args);assert.ok(!s.includes('LOCAL_PRIVATE_CANARY'));assert.ok(s.length<(modern?8192:512));if(event==='deviceData'){const packets=modern?args[0]:[args[0]];assert.ok(Array.isArray(packets)&&packets.length>0&&packets.length<=32);for(const packet of packets)assert.equal(packet.data.length,32);}}
  if(modern)assert.deepEqual([...dropped].sort(),['client:deviceCommand','client:deviceData','client:partnerJoined','server:deviceData','server:deviceStatus'],'Lost ACKs are retried in both directions');
  assert.deepEqual(errors,[]);console.log('PASS: relay receives only bounded Celio protocol messages, with no user file metadata.');
 }finally{console.log('Closing test fixtures.');relay.send('stop');await Promise.race([browser.close(),new Promise(r=>setTimeout(r,2500))]);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
