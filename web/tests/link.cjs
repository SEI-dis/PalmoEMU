// SPDX-License-Identifier: AGPL-3.0-or-later
// Original GBA programs exchange colored words through the CPU's SIO reads.
const assert=require('node:assert/strict');
function cartridge(own,wanted){
  const words=[],labels={},fixes=[],literal=[];
  const emit=w=>words.push(w>>>0),mark=l=>labels[l]=words.length;
  const branch=(l,cond=14,call=false)=>{fixes.push({at:words.length,l,cond,call});emit(0);};
  const load=(r,value)=>{literal.push({at:words.length,r,value});emit(0);};
  const read=()=>{emit(0xe1d060b2);emit(0xe1d070b0);emit(0xe1d080b8);emit(0xe3180010);emit(0x01a07006);branch('delay',14,true);};
  load(9,0x04000000);load(10,0x403);emit(0xe1c9a0b0);
  load(0,0x04000120);load(1,0x06000000);emit(0xe3a0b000);emit(0xe1c0b1b4);load(11,0x6003);emit(0xe1c0b0b8);load(4,0xB9A0);emit(0xe1a02004);
  mark('handshake');emit(0xe1c020ba);read();emit(0xe1570004);branch('handshake',1);
  load(2,0x8FFF);emit(0xe1c020ba);read();emit(0xe3a02000);emit(0xe1c020ba);read();
  load(2,own);load(3,wanted);emit(0xe3a0a008);
  mark('data');emit(0xe1c020ba);read();emit(0xe1570003);branch('found',0);mark('next');emit(0xe25aa001);branch('data',1);
  emit(0xe3a0b000);emit(0xe1c0b0ba);read();emit(0xe3a0a008);branch('data');
  // Receiving a peer word must not stop our own transfers. At unequal frame
  // rates the first recipient may still have fewer than the 32 outgoing words
  // needed to flush a Celio packet; halting here starves the other participant.
  mark('found');emit(0xe1c170b0);branch('next');
  mark('delay');emit(0xe1d9b0b6);emit(0xe35b00a0);branch('delay',2);
  mark('vblank');emit(0xe1d9b0b6);emit(0xe35b00a0);branch('vblank',3);emit(0xe1a0f00e);
  for(const f of literal){const at=words.length;emit(f.value);words[f.at]=(0xe59f0000|(f.r<<12)|((at-f.at-2)*4))>>>0;}
  for(const f of fixes)words[f.at]=((f.cond<<28)|(f.call?0x0b000000:0x0a000000)|((labels[f.l]-f.at-2)&0xffffff))>>>0;
  const b=new Uint8Array(1024),v=new DataView(b.buffer);b[0xb2]=0x96;v.setUint32(0,0xea00003e,true);words.forEach((w,i)=>v.setUint32(0x100+i*4,w,true));return b;
}
module.exports={cartridge};
if(require.main===module)(async()=>{
  const {chromium}=require('./browser-runtime.cjs');
  const b=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{}),args:['--autoplay-policy=no-user-gesture-required']});
  try{
    const c=await b.newContext(),p=await c.newPage(),requests=[],errors=[];
    p.on('request',r=>requests.push({url:r.url(),method:r.method(),body:r.postDataBuffer()?.length||0}));p.on('pageerror',e=>errors.push(e.message));
    await p.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');
    console.log('Link test: app loaded.');
    await p.evaluate(async roms=>{
      const {MGBACore}=await import('./src/core/mgba.js'),{PeerLink}=await import('./src/link/peer-link.js');
      window.linkTest={cores:[],links:[],status:[],packets:[]};
      for(const rom of roms){const cv=document.createElement('canvas');const engine=new MGBACore(cv);await engine.load(new Uint8Array(rom));window.linkTest.cores.push(engine);}
      for(let i=0;i<2;i++){
        const link=new PeerLink(window.linkTest.cores[i].linkIO(),{onStatus:s=>window.linkTest.status.push([i,s]),onEnd:s=>window.linkTest.status.push([i,'end:'+s])});
        const original=link.send.bind(link);link.send=packet=>{window.linkTest.packets.push(packet);original(packet);};window.linkTest.links.push(link);
      }
      const [a,z]=window.linkTest.links;await a.accept(await z.answer(await a.offer()));
    },[[...cartridge(0x001F,0x03E0)],[...cartridge(0x03E0,0x001F)]]);
    console.log('Link test: signaling complete.');
    try{await p.waitForFunction(()=>{const [a,b]=window.linkTest.cores.map(e=>e.canvas.getContext('2d').getImageData(0,0,1,1).data);return a[1]>200&&a[0]<10&&b[0]>200&&b[1]<10;},null,{timeout:20000});}
    catch(e){console.log(await p.evaluate(()=>({status:linkTest.status,packets:linkTest.packets.slice(0,12),state:linkTest.links.map(l=>({pc:l.pc.connectionState,phase:l.device.phase,local:l.local,remote:l.remote,sent:l.sent,received:l.received}))})));throw e;}
    console.log('PASS: two emulated GBA CPUs exchange 32-word packets over direct WebRTC; peer colors render.');
    const result=await p.evaluate(()=>{const t=window.linkTest;const before=t.links.map(l=>({sent:l.sent,received:l.received}));t.links[0].message(JSON.stringify({t:'data',words:[1]}));return before;}).catch(e=>({expectedValidation:e.message}));
    assert.match(result.expectedValidation,/形式/);
    const lengths=await p.evaluate(()=>window.linkTest.packets.map(v=>JSON.stringify(v).length));assert.ok(lengths.every(n=>n<=512));
    await p.evaluate(()=>{window.linkTest.links.forEach(l=>l.close());window.linkTest.cores.forEach(c=>c.close());});
    assert.deepEqual(errors,[]);const net=requests.filter(r=>/^https?:/.test(r.url));assert.ok(net.every(r=>r.url.startsWith(process.env.TEST_URL||'http://127.0.0.1:4173/')&&['GET','HEAD'].includes(r.method)&&!r.body));
    console.log('PASS: bounded protocol validation; no ROM/save upload or external HTTP. Remote Internet and real game trade not yet verified.');
    await c.close();
  }finally{await Promise.race([b.close(),new Promise(r=>setTimeout(r,2500))]);}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
