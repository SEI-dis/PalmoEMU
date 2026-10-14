// SPDX-License-Identifier: AGPL-3.0-or-later
// Generated battery data and isolated IndexedDB; never opens a user profile.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto((process.env.TEST_URL||'http://127.0.0.1:4173/')+'privacy.html');
  const result=await page.evaluate(async()=>{
   const [{SaveProtection},db]=await Promise.all([import('./src/storage/save-safety.js'),import('./src/storage/storage.js')]);
   const check=(condition,message)=>{if(!condition)throw Error(message);};
   const make=async id=>{
    const f={time:0,captures:0,states:0,progress:{epoch:1,revision:0,pending:false}};
    f.p=new SaveProtection(()=>{},{useWorker:false,clock:()=>f.time});
    f.core={saveProgress:()=>({...f.progress}),save:()=>{f.captures++;return new Uint8Array([f.progress.revision]);},state:()=>{f.states++;return new Uint8Array([42]);}};
    f.poll=()=>f.p.save(f.core,{automatic:true,gameSave:true});await f.p.open({id,system:'gba'},'synthetic');return f;
   };
   const f=await make('completion-basic');await f.poll();check(f.captures===0,'No snapshot for idle counter');
   f.progress.revision=1;f.progress.pending=true;
   for(const time of [1000,2000,3000]){f.time=time;await f.poll();}check(!f.captures,'No capture during cartridge writes');
   f.progress.pending=false;f.time=3500;await f.poll();check(!f.captures,'Wait for additional quiet time');
   f.time=4000;await f.poll();check(f.captures===1&&!f.states,'Completed game save persists battery alone before periodic deadline');
   check((await db.get('saves','completion-basic')).reason==='game-save','Stored reason identifies game write');
   for(const time of [5000,6000,10000]){f.time=time;await f.poll();}check(f.captures===1,'Idle counter must not clone/hash again');
   f.progress.revision=2;f.time=11000;await f.poll();f.time=12000;await f.poll();check(f.captures===2,'New settled revision persists');
   f.progress.revision=3;f.time=13000;await f.poll();f.time=14000;await f.poll();check(f.captures===2,'Five second minimum interval');
   f.time=17000;await f.poll();check(f.captures===3,'Later polling saves latest change');
   f.progress.revision=4;f.time=18000;await f.poll();f.progress={epoch:2,revision:0,pending:false};f.time=19000;await f.poll();
   check(f.captures===3,'Import, reset or rewind epoch drops pending prior change');
   for(let time=20000;time<120000;time+=10000){f.time=time;f.progress.revision++;await f.poll();f.time+=1000;await f.poll();}
   f.time=120000;await f.p.save(f.core,{automatic:true,checkpoint:true});check(f.states===1,'Frequent battery saves do not postpone the two-minute recovery');
   await f.p.close();

   const fail=await make('completion-failure');await fail.p.save(fail.core,{reason:'seed'});fail.progress.revision=7;
   fail.time=1000;await fail.poll();fail.time=2000;
   const commit=fail.p.writer.commit.bind(fail.p.writer);let attempts=0;
   fail.p.writer.commit=async()=>{attempts++;throw new DOMException('Synthetic quota','QuotaExceededError');};
   try{await fail.poll();throw Error('Expected failure');}catch(e){check(e.name==='QuotaExceededError','Original quota error retained');}
   check((await db.get('saves','completion-failure')).bytes[0]===0,'Failure retains prior battery');
   for(const time of [3000,32000,121999]){fail.time=time;await fail.poll();}check(attempts===1,'Completion polling respects central retry backoff');
   fail.p.writer.commit=commit;fail.time=122000;await fail.poll();check((await db.get('saves','completion-failure')).bytes[0]===7,'Retry commits the current safe revision');await fail.p.close();

   const race=await make('completion-race');race.progress.revision=1;race.time=1000;await race.poll();
   let release,entered;const started=new Promise(resolve=>{entered=resolve;});race.p.resolveFence=async()=>{entered();await new Promise(resolve=>{release=resolve;});};
   race.time=2000;const saving=race.poll();await started;
   check((await race.poll()).skipped,'Do not queue multiple completion saves');
   race.progress={epoch:2,revision:0,pending:false};release();check((await saving).skipped,'Recheck native epoch after asynchronous fencing');check(!race.captures,'Stale completion never captures imported/restored state');
   race.p.resolveFence=async()=>{};await race.p.close();

   const other=await make('completion-fallback');delete other.core.saveProgress;
   other.time=119999;await other.poll();check(!other.captures,'Unsupported core has no speculative capture');
   other.time=120000;await other.p.save(other.core,{automatic:true,checkpoint:true});check(other.captures===1&&other.states===1,'Unsupported cores keep the ordinary two-minute fallback');await other.p.close();
   return {quiet:true,batteryOnly:true,cooldown:true,epochs:true,recovery:true,failure:true,fence:true,fallback:true};
  });
  assert.ok(Object.values(result).every(Boolean));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');
  await page.waitForFunction(()=>typeof window.createMGBA==='function');
  const native=await page.evaluate(async encoded=>{
   const [{MGBACore},{SaveProtection},db]=await Promise.all([import('./src/core/mgba.js'),import('./src/storage/save-safety.js'),import('./src/storage/storage.js')]);
   const core=new MGBACore(document.createElement('canvas'));let time=1000;
   const protection=new SaveProtection(()=>{},{useWorker:false,clock:()=>time});
   const frame=(count,keys=0)=>{for(let i=0;i<count;i++){core.m._web_frame(keys);core.m._web_audio_read();}};
   try{
    await core.load(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)));core.pause(true);await protection.open({id:'native-completion',system:'gb'},'mgba-rom64-save6-v2');
    const bytes=new Uint8Array(8192);bytes[0]=0x24;const epoch=core.saveProgress().epoch;core.restore(bytes);
    const importEpoch=core.saveProgress().epoch;frame(30);const imported=core.saveProgress();
    frame(5,1);frame(25);const wrote=core.saveProgress();await protection.save(core,{gameSave:true});time+=1000;await protection.save(core,{gameSave:true});
    const saved=await db.get('saves','native-completion'),state=core.state();core.loadState(state);frame(30);time+=1000;
    const restored=core.saveProgress(),skipped=await protection.save(core,{gameSave:true});
    core.reset();const reset=core.saveProgress();return {epochAdvanced:importEpoch>epoch,importQuiet:imported.revision===0,wrote:wrote.revision,saved:saved.bytes[0],stateEpoch:restored.epoch>importEpoch,stateQuiet:restored.revision===0&&skipped.skipped,resetEpoch:reset.epoch>restored.epoch};
   }finally{await protection.close();core.close();}
  },Buffer.from(require('./mgba-save-completion.cjs').keySaveGB()).toString('base64'));
  assert.deepEqual(native,{epochAdvanced:true,importQuiet:true,wrote:1,saved:0x71,stateEpoch:true,stateQuiet:true,resetEpoch:true});
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS ('+kind+'): settled battery persistence, no hot-loop snapshots, minimum interval, import/state epochs, independent recovery timing, failure backoff, asynchronous fence and unsupported-core fallback.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
