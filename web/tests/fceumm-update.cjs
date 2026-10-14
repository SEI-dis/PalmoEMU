// SPDX-License-Identifier: AGPL-3.0-or-later
// Original NES 2.0 mapper-176 program; no commercial cartridge data.
const assert=require('node:assert/strict'),path=require('node:path');
function mapper176(){
 const rom=new Uint8Array(16+2*1024*1024+8192);
 rom.set([0x4e,0x45,0x53,0x1a,128,1,0x02,0xb8,0x10,0,0x70,0x07]);
 const code=[0x78,0xd8,0xa2,0xff,0x9a];
 const read=(address,target)=>code.push(0xad,address&255,address>>8,0x8d,target&255,target>>8);
 const write=(address,value)=>code.push(0xa9,value,0x8d,address&255,address>>8);
 for(let i=0;i<4;i++)read(0x8000+i*0x2000,0x6000+i);
 write(0x5011,0);read(0xc000,0x6004); // Normal MMC3 mask must cover 512KiB.
 write(0x5013,2);write(0x8000,6);write(0x8001,129);read(0x8000,0x6005); // Extended mode covers 2MiB.
 write(0x5010,0x60);write(0x2006,0);write(0x2006,0);read(0x2007,0x6006);read(0x2007,0x6006); // CHR ROM, not CHR RAM.
 const loop=0xe100+code.length;code.push(0x4c,loop&255,loop>>8);
 for(let bank=0;bank<256;bank++){
  const start=16+bank*8192;rom[start]=bank;rom.set(code,start+0x100);
  for(const vector of [0x1ffa,0x1ffc,0x1ffe])rom.set([0x00,0xe1],start+vector);
 }
 rom.fill(0x55,16+2*1024*1024);return rom;
}
async function core(file){const create=require(file);return create({locateFile:()=>file.replace(/\.js$/,'.wasm')});}
function upload(m,bytes,fn){const p=m._malloc(bytes.length);assert.ok(p);try{m.HEAPU8.set(bytes,p);return fn(p,bytes.length);}finally{m._free(p);}}
function load(m,rom){assert.equal(upload(m,rom,m._web_load),1);}
function run(m){for(let i=0;i<10;i++)m._web_frame(0);}
function save(m){const n=m._web_save_export();return m.HEAPU8.slice(m._web_save_data(),m._web_save_data()+n);}
function state(m){const n=m._web_state_export();assert.ok(n);return m.HEAPU8.slice(m._web_state_data(),m._web_state_data()+n);}
(async()=>{
 const current=await core(path.resolve(process.env.NES_CORE_PATH||path.join(__dirname,'../cores/nes/core.js'))),rom=mapper176();
 load(current,rom);run(current);assert.deepEqual([...save(current).slice(0,7)],[192,193,254,255,62,129,85]);
 current._web_reset();run(current);assert.deepEqual([...save(current).slice(0,7)],[192,193,254,255,62,129,85],'Soft reset restores FK power-on bank');
 const snapshot=state(current),battery=save(current);current._web_reset();assert.equal(upload(current,snapshot,current._web_state_import),1);assert.deepEqual(save(current),battery);
 console.log('PASS: mapper 176 reset mapping, normal/extended PRG masks, CHR ROM selection, save and state round trip.');
 if(process.env.NES_BASELINE_PATH){
  const old=await core(path.resolve(process.env.NES_BASELINE_PATH));load(old,rom);run(old);
  assert.notDeepEqual([...save(old).slice(0,7)],[192,193,254,255,62,129,85],'Prior core reproduces the mapper bug');
  console.log('Prior mapper result:',[...save(old).slice(0,7)]);
  // No SFORMAT/state layout was changed; round-trip old and new mapper states.
  const priorState=state(old),priorSave=save(old);load(current,rom);assert.equal(upload(current,priorState,current._web_state_import),1);assert.deepEqual(save(current),priorSave);
  assert.equal(upload(old,state(current),old._web_state_import),1);assert.deepEqual(save(old),priorSave);
  const basic=require('./cartridges.cjs').nes();basic[6]|=2;basic[8]=1;
  load(old,basic);run(old);const s=state(old),b=save(old);load(current,basic);assert.equal(upload(current,s,current._web_state_import),1);
  assert.deepEqual(state(current),s,'Unrelated NROM state unchanged');assert.equal(upload(current,b,current._web_save_import),1);assert.deepEqual(save(current),b);
  assert.equal(upload(old,state(current),old._web_state_import),1);old._web_close();
  console.log('PASS: old/new state interoperability and unchanged NROM state/battery save.');
 }current._web_close();
 if(process.env.TEST_URL){
  const kind=process.env.BROWSER_ENGINE||'chromium',browser=await require('./browser-runtime.cjs')[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
  try{
   const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),base=process.env.TEST_URL;
   await context.route(base+'__mapper176',route=>route.fulfill({contentType:'application/octet-stream',body:Buffer.from(rom)}));
   await page.goto(base);const result=await page.evaluate(async()=>{
    const {createCore}=await import('./src/core/core-factory.js'),host=document.createElement('div');document.body.append(host);
    const bytes=new Uint8Array(await (await fetch('./__mapper176')).arrayBuffer());
    const game={system:'nes',name:'Original mapper test',size:bytes.length},core=createCore(host,game);
    try{
     await core.load(bytes,game);core.pause(true);
     for(let i=0;i<10;i++)core.m._web_frame(0);core.draw();
     const state=core.state(),save=core.save();core.reset();core.loadState(state);core.restore(save);
     return {words:[...core.save().slice(0,7)],state:state.length};
    }finally{core.close();host.remove();}
   });assert.deepEqual(result.words,[192,193,254,255,62,129,85]);assert.ok(result.state>0);
   console.log('PASS: mapper 176 through browser adapter with state/save round trip: '+kind);
  }finally{await browser.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
