// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored synthetic cartridges and isolated state only. No user ROM/save data.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',carts=require('./cartridges.cjs');
function gba(){
 const b=Buffer.alloc(8192),code=[],literals=[];b[0xb2]=0x96;b.writeUInt32LE(0xea00003e,0);
 const emit=w=>code.push(w),ldr=value=>{literals.push({at:code.length,value});emit(0);};
 ldr(0x04000000);emit(0xe3a01003);emit(0xe3811b01);emit(0xe1c010b0);
 ldr(0x0e000000);emit(0xe3a01019);emit(0xe5c01000); // initialize SRAM
 ldr(0x06000000);emit(0xe3a0101f);emit(0xe1c010b0);emit(0xeafffffe);
 for(const {at,value} of literals){code[at]=0xe59f0000|((code.length-at)*4-8);code.push(value);}
 code.forEach((w,i)=>b.writeUInt32LE(w>>>0,0x100+i*4));b.write('SRAM_V110',0x1000);return b;
}
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),requests=[];
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';page.on('request',r=>requests.push(r));await page.goto(base+'privacy.html');
  const unit=await page.evaluate(async()=>{
   const {createRewind,supportsRewind}=await import('./src/core/rewind.js');
   const check=(value,message)=>{if(!value)throw Error(message);};
   let frames=0,ram=0,battery=0,stateCalls=0,saveCalls=0,loads=0,restores=0;
   const core={fps:60,paused:false,frameCount:()=>frames,state:()=>{stateCalls++;return new Uint8Array(80).fill(ram);},save:()=>{saveCalls++;return new Uint8Array(16).fill(battery);},loadState:b=>{loads++;ram=b[0];},restore:b=>{restores++;battery=b[0];}};
   let r=createRewind({core,system:'gba'});await r.frame();check(stateCalls===0&&!r.status.enabled,'Must be opt-in');await r.dispose();
   const support=[['gb','mgba'],['gbc','mgba'],['gba','mgba'],['gb','jgenesis'],['gbc','jgenesis'],['gba','vba-next']];
   check(support.every(([s,c])=>supportsRewind(s,c))&&!supportsRewind('nds','mgba')&&!supportsRewind('gba','jgenesis'),'Explicit core/system allowlist');
   let blocked=false,before=0,after=0;
   r=createRewind({core,system:'gba',enabled:true,maxBytes:320,isBlocked:()=>blocked,beforeRestore:async()=>{before++;core.paused=true;await r.pause(true);},afterRestore:async()=>{after++;core.paused=false;await r.pause(false);}});
   for(let i=0;i<10;i++){frames=i*30;ram=i;battery=i+40;await r.frame();check(r.status.bytes<=224,'RAM budget reserves rollback');}
   check(r.status.count===2,'Evict oldest when memory fills');check(await r.rewind(3),'Rewind oldest available');
   check(ram===8&&battery===48&&before===1&&after===1,'Paired state/battery and lifecycle hooks');
   const count=stateCalls;await r.pause(true);frames+=60;await r.frame();check(stateCalls===count,'Paused history must not capture');await r.pause(false);
   blocked=true;await r.frame();check(r.status.count===0&&!await r.rewind(),'Link blocks/clears');blocked=false;await r.clear();await r.dispose();
   let rewoundSeconds=0;r=createRewind({core,system:'gb',enabled:true,afterRestore:value=>{rewoundSeconds=value.seconds;}});
   for(let i=0;i<40;i++){frames+=30;await r.frame();}
   check(r.status.count<=21&&r.status.seconds<=10,'Ten-second/count limit');frames+=6;await r.frame();await r.rewind(3);check(rewoundSeconds>2&&rewoundSeconds<=3,'Never overshoot the requested rewind interval');
   await r.clear();check(r.status.count===0&&r.status.bytes===0,'Clear releases history');await r.dispose();
   let errors=0;r=createRewind({core:{...core,state:()=>{stateCalls++;return new Uint8Array(200);}},system:'gba',enabled:true,maxBytes:320,onError:()=>errors++});
   await r.frame();const stopped=stateCalls;await r.frame();check(!r.status.enabled&&r.status.count===0&&stateCalls===stopped&&errors===1,'Oversize disables once');await r.dispose();
   // Inclusive states must not call battery import, which can reset a core.
   const inclusive={...core,stateIncludesSave:true,state:()=>new Uint8Array([ram,battery]),loadState:b=>{ram=b[0];battery=b[1];},save:()=>{throw Error('Unexpected separate battery capture');},restore:()=>{throw Error('Unexpected separate battery restore');}};
   r=createRewind({core:inclusive,system:'gb',enabled:true});ram=1;battery=2;await r.frame();frames+=60;ram=3;battery=4;await r.frame();check(await r.rewind()&&ram===1&&battery===2,'Inclusive restore');await r.dispose();
   // Pending atomic capture cannot overlap or revive cleared/disposed history.
   let finish,pending=0,maxPending=0,started=0;
   const asynchronous={...core,checkpoint:()=>{started++;pending++;maxPending=Math.max(maxPending,pending);return new Promise(resolve=>{finish=()=>{pending--;resolve({state:new Uint8Array([ram]),save:new Uint8Array([battery])});};});}};
   r=createRewind({core:asynchronous,system:'gba',enabled:true});const first=r.frame();await r.frame();const clearing=r.clear();finish();await Promise.all([first,clearing]);check(started===1&&maxPending===1&&r.status.count===0,'No capture overlap/stale completion');
   const next=r.frame(),disposing=r.dispose();finish();await Promise.all([next,disposing]);check(r.status.bytes===0,'Dispose drains capture');
   // Restore operations themselves are exclusive; disposal cancels before any
   // mutation and still releases the caller's lifecycle lock.
   let enter,entered;const gate=new Promise(resolve=>entered=resolve);let afterDisposed=0;
   r=createRewind({core,system:'gba',enabled:true,beforeRestore:()=>{entered();return new Promise(resolve=>enter=resolve);},afterRestore:()=>afterDisposed++});
   await r.frame();frames+=60;await r.frame();const operation=r.rewind();await gate;check(!await r.rewind(),'No overlapping restores');const oldLoads=loads,closing=r.dispose();enter();await Promise.all([operation,closing]);check(loads===oldLoads&&afterDisposed===1&&r.status.count===0,'Dispose cancels pending restore safely');
   let throwLoad=false;
   r=createRewind({core:{...core,loadState:b=>{ram=b[0];if(throwLoad){throwLoad=false;throw Error('simulated failure');}}},system:'gba',enabled:true});
   ram=10;battery=20;await r.frame();frames+=60;ram=11;battery=21;await r.frame();throwLoad=true;
   check(!await r.rewind()&&ram===11&&battery===21&&!r.status.enabled,'Failed restore rolls back and disables');await r.dispose();
   return {support:support.length,restores,saveCalls};
  });
  assert.equal(unit.support,6);assert.ok(unit.restores>0&&unit.saveCalls>0);
  console.log('PASS: opt-in, bounded RAM/time, paired/inclusive state, pause/link/clear/dispose, asynchronous isolation, transactional rollback.');
  await page.goto(base);
  for(const [system,coreKey,rom] of [['gb','mgba',carts.gb()],['gbc','mgba',carts.gbc()],['gba','mgba',gba()],['gb','jgenesis',carts.gb()],['gbc','jgenesis',carts.gbc()],['gba','vba-next',gba()]]){
   const result=await page.evaluate(async({system,coreKey,rom})=>{
    const {createCore}=await import('./src/core/core-factory.js'),{createRewind}=await import('./src/core/rewind.js'),db=await import('./src/storage/storage.js');
    const game={system,coreKey,size:rom.length,name:'Original rewind fixture'},holder=document.createElement('div');document.body.append(holder);
    const core=createCore(holder,game);let rewind;
    const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
    try{
     await core.load(new Uint8Array(rom),game);core.pause(true);
     for(let i=0;i<5;i++)core.m._web_frame(0);
     const id='rewind:'+system+':'+coreKey,persisted=new Uint8Array([90,91]);await db.put('saves',id,{bytes:persisted});
     const initial=core.save();if(!initial?.length)throw Error('Fixture must expose battery RAM');
     // Jgenesis battery files have a container header; change only the RAM.
     const a=initial.slice(),b=initial.slice();a[a.length-1]=31;b[b.length-1]=63;
     core.restore(a);for(let i=0;i<5;i++)core.m._web_frame(0);const oldSave=core.save(),oldState=core.state();
     rewind=createRewind({core,system,coreKey,enabled:true,beforeRestore:()=>core.pause(true)});
     // Manual frame advancement keeps tests deterministic without wall sleeps.
     core.paused=false;await rewind.frame();core.restore(b);for(let i=0;i<30;i++)core.m._web_frame(0);core.frames+=60;await rewind.frame();
     const changed=!equal(core.save(),oldSave),ok=await rewind.rewind(3),saveMatches=equal(core.save(),oldSave),stateMatches=equal(core.state(),oldState);
     const durable=await db.get('saves',id);return {ok,changed,saveMatches,stateMatches,permanent:[...durable.bytes],bytes:rewind.status.bytes};
    }finally{await rewind?.dispose();core.close();holder.remove();}
   },{system,coreKey,rom:[...rom]});
   assert.equal(result.changed,true,system+' '+coreKey+' fixture changed battery');
   assert.equal(result.ok,true,system+' '+coreKey+' rewind');assert.equal(result.saveMatches,true,system+' '+coreKey+' battery restored');
   assert.equal(result.stateMatches,true,system+' '+coreKey+' machine state restored');assert.deepEqual(result.permanent,[90,91]);assert.ok(result.bytes<8*1048576);
   console.log('PASS: real synthetic cartridge rewind restores state and battery without overwriting durable save:',system,coreKey);
  }
  assert.ok(requests.every(r=>new URL(r.url()).origin===new URL(base).origin&&r.method()==='GET'&&!r.postData()));
  console.log('PASS: rewind requests remain local; '+kind);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
