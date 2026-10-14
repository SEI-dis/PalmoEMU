// SPDX-License-Identifier: AGPL-3.0-or-later
// Original cartridges and mock USB streams only; no user files or hardware access.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const engine=process.env.BROWSER_ENGINE||'chromium',runtime=require('./browser-runtime.cjs');
(async()=>{
 const browser=await runtime[engine].launch({headless:true,...(engine==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),p=await ctx.newPage(),errors=[];
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';
  await ctx.route('**/*',r=>{assert.equal(new URL(r.request().url()).origin,new URL(base).origin,'No external communication in local/USB modes');return r.continue();});
  p.on('pageerror',e=>errors.push(e.message));await p.goto(base);
  await p.evaluate(async roms=>{
   const {MGBACore}=await import('./src/core/mgba.js'),{LocalLinkCore}=await import('./src/link/local-link-core.js'),{DirectLink}=await import('./src/link/direct-link.js');
   const cores=[];for(const rom of roms){const c=new MGBACore(document.createElement('canvas'));await c.load(new Uint8Array(rom));c.pause(true);cores.push(c);}
   const pair=new LocalLinkCore(...cores),link=new DirectLink(cores.map(c=>c.linkIO()),{onClosing:()=>pair.pause(true)});
   window.directTest={cores,pair,link};await link.start();pair.pause(false);
  },[[...require('./link.cjs').cartridge(31,992)],[...require('./link.cjs').cartridge(992,31)]]);
  await p.waitForFunction(()=>{const {cores}=directTest;return cores[0].m.HEAPU8[cores[0].m._web_pixels()+1]>200&&cores[0].m.HEAPU8[cores[0].m._web_pixels()]<10&&cores[1].m.HEAPU8[cores[1].m._web_pixels()]>200&&cores[1].m.HEAPU8[cores[1].m._web_pixels()+1]<10;},null,{timeout:20000});
  assert.ok(await p.evaluate(()=>directTest.link.sent>0));
  await p.evaluate(async()=>{const {pair,cores}=directTest;pair.pause(true);window.frameDifference=cores[0].frames-cores[1].frames;window.playerInputs=[[],[]];cores.forEach((c,i)=>{const frame=c.m._web_frame;c.m._web_frame=keys=>{playerInputs[i].push(keys);return frame(keys);};});pair.select(1);pair.pause(false);pair.setKeys(1);});
  await p.waitForTimeout(100);
  assert.equal(await p.evaluate(()=>directTest.cores[0].frames-directTest.cores[1].frames),await p.evaluate(()=>frameDifference),'Both CPUs share the same clock');
  assert.deepEqual(await p.evaluate(()=>playerInputs.map(keys=>[...new Set(keys)])),[[0],[1]],'Only the selected player receives held controls');
  await p.evaluate(async()=>{const stopping=directTest.link.close();if(!directTest.pair.paused)throw Error('Both CPUs must stop before asynchronous save recovery');await stopping;directTest.pair.dispose();directTest.cores[0].close();});
  // Fragmented USB packets, little-endian words, handshake routing and unplug.
  const usb=await p.evaluate(async()=>{
   const {CelioSerial}=await import('./src/link/celio-serial.js'),{DirectLink}=await import('./src/link/direct-link.js');
   const packets=[],writes=[],statuses=[],endings=[];let input,openOptions,closed=0;
   const port={open:async o=>{openOptions=o;},setSignals:async()=>{},close:async()=>{closed++;},readable:new ReadableStream({start(c){input=c;}}),writable:new WritableStream({write(b){writes.push([...b]);}})};
   const io={enable:()=>{},read:()=>0,write:()=>{},mask:()=>{}};
   const link=new DirectLink([io],{port,onStatus:s=>statuses.push(s),onEnd:(s,o)=>endings.push([s,o])});await link.start();
   const frame=CelioSerial.frame(1,Array.from({length:64},(_,i)=>i));input.enqueue(frame.slice(0,3));input.enqueue(frame.slice(3,21));input.enqueue(frame.slice(21));
   await new Promise(r=>setTimeout(r,30));const words=link.devices[0].received.slice();
   link.data(0,Array.from({length:32},(_,i)=>0xAB00+i));await link.serial.queue;
   const decoder=new CelioSerial(null,(c,p)=>packets.push([c,[...p]]),()=>{});for(const frame of writes)for(const b of frame)decoder.feed([b]);
   let rejected=false;try{decoder.feed([71,66,1,65,0]);}catch{rejected=true;}
   input.close();await new Promise(r=>setTimeout(r,40));await link.close();
   return {packets,words,openOptions,closed,rejected,endings};
  });
  assert.equal(usb.openOptions.baudRate,115200);assert.equal(usb.words[0],256);assert.equal(usb.words[31],0x3F3E);
  assert.deepEqual(usb.packets.find(p=>p[0]===1)[1].slice(0,4),[0,171,1,171]);assert.ok(usb.rejected);assert.equal(usb.closed,1);assert.equal(usb.endings[0][1].keep,false);
  const usbCleanup=await p.evaluate(async()=>{
   const {CelioSerial}=await import('./src/link/celio-serial.js');let finishOpen,lateClosed=0,stalledClosed=0;
   const latePort={open:()=>new Promise(resolve=>{finishOpen=resolve;}),close:async()=>{lateClosed++;}};
   const late=new CelioSerial(latePort,()=>{},()=>{}),opening=late.open(),closing=late.close();finishOpen();await Promise.all([opening,closing]);
   const stalledPort={open:async()=>{},setSignals:async()=>{},close:async()=>{stalledClosed++;},readable:new ReadableStream({}),writable:new WritableStream({write:()=>new Promise(()=>{})})};
   const stalled=new CelioSerial(stalledPort,()=>{},()=>{});await stalled.open();stalled.command(0);await new Promise(resolve=>setTimeout(resolve,0));
   const at=performance.now();await stalled.close();
   return {lateClosed,stalledClosed,elapsed:performance.now()-at,locked:stalledPort.readable.locked||stalledPort.writable.locked};
  });assert.equal(usbCleanup.lateClosed,1);assert.equal(usbCleanup.stalledClosed,1);assert.equal(usbCleanup.locked,false);assert.ok(usbCleanup.elapsed<2200,'USB backpressure cannot hold save recovery indefinitely');
  await p.reload();
  await p.evaluate(async()=>{
   const {DirectLink}=await import('./src/link/direct-link.js'),start=DirectLink.prototype.start;
   DirectLink.prototype.start=async function(...a){window.uiLink=this;return start.apply(this,a);};
   const {MGBACore}=await import('./src/core/mgba.js'),startLoop=MGBACore.prototype.startLoop;window.uiCoreClocks=[];
   MGBACore.prototype.startLoop=function(){uiCoreClocks.push({mode:this.m._web_rtc_mode(),offset:this.m._web_rtc_offset()});return startLoop.call(this);};
   Object.defineProperty(navigator,'serial',{configurable:true,value:undefined});
  });
  await p.locator('#rom-input').setInputFiles({name:'Original direct-link.gba',mimeType:'application/octet-stream',buffer:Buffer.from(require('./link.cjs').cartridge(31,31))});
  await p.locator('.game-launch').waitFor();
  await p.evaluate(async()=>{const db=await import('./src/storage/storage.js'),game=(await db.all('library'))[0];await db.setGamePreferences(game.id,{rtcMode:'offset',rtcOffset:3600,gameRumble:true});});
  await p.locator('.game-launch').click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});
  await p.locator('#player-link').click();await p.locator('[data-link-mode=usb]').click();assert.equal(await p.locator('#link-usb-start').isDisabled(),true);
  await p.locator('[data-link-mode=local]').click();await p.locator('#link-local-start').click();await p.waitForFunction(()=>window.uiLink?.connected&&!document.querySelector('[data-link-player="1"]').disabled);
  assert.deepEqual(await p.evaluate(()=>uiCoreClocks),[{mode:1,offset:3600},{mode:1,offset:3600}],'Both local players receive the game clock before their first frame');
  assert.deepEqual(await p.evaluate(()=>uiLink.paired.cores.map(c=>({mode:c.m._web_rtc_mode(),offset:c.m._web_rtc_offset(),rumble:c.rumble.enabled}))),[{mode:1,offset:3600,rumble:true},{mode:1,offset:3600,rumble:false}],'2P inherits only the clock, without enabling a second rumble controller');
  await p.locator('[data-link-player="1"]').click();assert.equal(await p.evaluate(()=>uiLink.paired.view),1);
  const frames=await p.evaluate(()=>uiLink.paired.cores.map(c=>c.frames));await p.waitForFunction(f=>uiLink.paired.cores.every((c,i)=>c.frames>f[i]+3),frames);
  const dir=path.join(__dirname,'../test-results/direct-link');fs.mkdirSync(dir,{recursive:true});await p.screenshot({path:path.join(dir,engine+'-local.png')});
  const before=await p.evaluate(async()=>{const db=await import('./src/storage/storage.js');return {saves:await db.all('saves'),recoveries:await db.all('recoveries')};});
  assert.equal(before.recoveries.length,1,'Only the 1P backup is persisted before completion');
  await p.locator('#link-stop').click();await p.waitForFunction(()=>document.querySelector('#player-link').dataset.state==='idle');assert.match(await p.locator('#link-status').textContent(),/通信前に戻しました/);
  assert.equal(await p.evaluate(async()=>{const db=await import('./src/storage/storage.js');return (await db.all('recoveries')).length;}),1,'Aborted 2P session cannot replace prior saves');
  await p.locator('#link-local-start').click();await p.waitForFunction(()=>window.uiLink?.connected&&!uiLink.closed);
  // Drive both protocol completion notifications, exercising the real callback,
  // snapshot capture and atomic database transaction (not a claimed game trade).
  await p.evaluate(()=>{uiLink.status(0,0xFF07);uiLink.status(1,0xFF07);});
  await p.waitForFunction(()=>document.querySelector('#player-link').dataset.state==='idle');assert.match(await p.locator('#link-status').textContent(),/完了/);
  assert.equal(await p.evaluate(async()=>{const db=await import('./src/storage/storage.js');return (await db.all('recoveries')).length;}),2);
  // A subsequent blank/import session must never erase the previously committed
  // 2P progress when it is cancelled or emulation throws before completion.
  const previous2p=await p.evaluate(async()=>{const db=await import('./src/storage/storage.js'),id=(await db.all('library'))[0].id+'@link-2p';return {save:await db.get('saves',id),recovery:await db.get('recoveries',id)};});
  assert.equal(await p.locator('#link-2p-file').getAttribute('accept'),null,'iOS must allow selecting saves by filename; validate contents after selection');
  await p.locator('#link-2p-source').selectOption('blank');await p.locator('#link-local-start').click();await p.waitForFunction(()=>window.uiLink?.connected&&!uiLink.closed);
  await p.evaluate(()=>{uiLink.paired.cores[1].m._web_frame=()=>{throw Error('Synthetic 2P frame failure');};});
  await p.waitForFunction(()=>document.querySelector('#player-link').dataset.state==='idle');assert.match(await p.locator('#link-status').textContent(),/通信前に戻しました/);
  const restored2p=await p.evaluate(async()=>{const db=await import('./src/storage/storage.js'),id=(await db.all('library'))[0].id+'@link-2p';return {save:await db.get('saves',id),recovery:await db.get('recoveries',id),session:await db.get('sessions',id)};});
  assert.deepEqual(restored2p.save,previous2p.save);assert.deepEqual(restored2p.recovery,previous2p.recovery);assert.equal(restored2p.session.dirty,false);
  await p.evaluate(async()=>{const {MGBACore}=await import('./src/core/mgba.js'),load=MGBACore.prototype.load;MGBACore.prototype.load=async function(){MGBACore.prototype.load=load;throw Error('Synthetic 2P load failure');};});
  await p.locator('#link-local-start').click();await p.waitForFunction(()=>document.querySelector('#link-status').textContent.includes('Synthetic 2P load failure'));
  const failed2p=await p.evaluate(async()=>{const db=await import('./src/storage/storage.js'),id=(await db.all('library'))[0].id+'@link-2p';return {save:await db.get('saves',id),recovery:await db.get('recoveries',id),session:await db.get('sessions',id)};});
  assert.deepEqual(failed2p.save,previous2p.save);assert.deepEqual(failed2p.recovery,previous2p.recovery);assert.equal(failed2p.session.dirty,false,'A failed 2P start must not leave a false crash marker');
  // If either player loses its save lock/session, neither write may commit.
  const atomic=await p.evaluate(async()=>{
   const db=await import('./src/storage/storage.js'),game=(await db.all('library'))[0];
   const s1=await db.get('sessions',game.id),s2=await db.get('sessions',game.id+'@link-2p');
   const old=await db.get('saves',game.id);let rejected=false;
   try{await db.commitProtectionBatch([{id:game.id,sessionId:s1.id,save:{bytes:new Uint8Array([42])}},{id:game.id+'@link-2p',sessionId:s2.id+'wrong',save:{bytes:new Uint8Array([43])}}]);}catch{rejected=true;}
   const now=await db.get('saves',game.id);return {rejected,same:JSON.stringify(old)===JSON.stringify(now)};
  });assert.deepEqual(atomic,{rejected:true,same:true});
  // A cancelled USB chooser must not start a session; unplug restores 1P.
  await p.evaluate(()=>Object.defineProperty(navigator,'serial',{configurable:true,value:{requestPort:async()=>{throw new DOMException('cancel','NotFoundError');}}}));
  await p.locator('[data-link-mode=usb]').click();await p.locator('#link-usb-start').click();await p.waitForFunction(()=>document.querySelector('#link-status').textContent.includes('キャンセル'));
  assert.equal(await p.locator('#player-link').getAttribute('data-state'),'idle');
  await p.evaluate(()=>Object.defineProperty(navigator,'serial',{configurable:true,value:{requestPort:async()=>({open:async()=>{},setSignals:async()=>{},close:async()=>{},readable:new ReadableStream({start(c){window.usbInput=c;}}),writable:new WritableStream({write(){}})})}}));
  await p.locator('#link-usb-start').click();await p.waitForFunction(()=>window.uiLink?.kind==='usb'&&uiLink.connected&&!document.querySelector('#link-stop').disabled);
  await p.evaluate(()=>usbInput.close());await p.waitForFunction(()=>document.querySelector('#player-link').dataset.state==='idle');assert.match(await p.locator('#link-status').textContent(),/通信前に戻しました/);
  await p.locator('#link-panel-close').click();await p.locator('#player-menu').click();await p.locator('[data-action=exit]').click();await p.locator('#player').waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);await ctx.close();
  console.log('PASS: two GBA CPUs exchange packets, synchronized clock and selected-player input, local 1P/2P UI, rollback after 2P failures, atomic saves and retained 2P progress, fragmented USB codec, open/close races, bounded stalled-write cleanup, disconnect and unsupported browser UI. Physical hardware untested.');
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
