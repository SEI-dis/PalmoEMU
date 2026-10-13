// SPDX-License-Identifier: AGPL-3.0-or-later
// Small authored saves and a monotonic synthetic clock, in an isolated profile.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.TEST_URL||'http://127.0.0.1:4173/')+'privacy.html');
  const result=await page.evaluate(async()=>{
   const {SaveProtection}=await import('./src/save-safety.js'),db=await import('./src/storage.js');
   const check=(condition,message)=>{if(!condition)throw Error(message);};
   const reject=async promise=>{try{await promise;}catch(e){return e;}throw Error('Expected rejection');};
   const make=async(id,start=0)=>{
    const fixture={time:start,batteries:0,states:0};
    fixture.protection=new SaveProtection(()=>{},{useWorker:false,clock:()=>fixture.time});
    fixture.core={save:()=>new Uint8Array([++fixture.batteries]),state:()=>new Uint8Array([++fixture.states,42])};
    fixture.auto=checkpoint=>fixture.protection.save(fixture.core,{checkpoint,automatic:true});
    await fixture.protection.open({id,system:'gba'},'synthetic');return fixture;
   };
   const first=await make('cadence-initial',1000);
   for(const time of [11000,21000,120999]){first.time=time;check((await first.auto(true)).skipped,'No initial capture before 120 seconds');}
   check(first.protection.stateAt===0&&first.batteries===0&&first.states===0,'Zero stateAt must not trigger early work');
   first.time=121000;await first.auto(true);check(first.batteries===1&&first.states===1,'Initial capture at 120 seconds');
   first.time=131000;await first.protection.save(first.core,{checkpoint:true,reason:'manual'});
   first.time=251000-1;check((await first.auto(true)).skipped,'Manual success moves next automatic deadline');
   first.time++;await first.auto(true);check(first.batteries===3&&first.states===3,'Automatic resumes 120 seconds after manual success');
   await first.protection.close();

   const battery=await make('cadence-battery');
   for(const time of [10000,20000,119999]){battery.time=time;await battery.auto(false);}
   check(!battery.batteries,'Battery-only setting also waits 120 seconds');
   battery.time=120000;await battery.auto(false);check(battery.batteries===1&&!battery.states,'Battery-only automatic save excludes checkpoint');
   for(const reason of ['background','exit','manual']){
    battery.time++;await battery.protection.save(battery.core,{reason});
    check((await db.get('saves','cadence-battery')).reason===reason,reason+' bypasses the periodic deadline');
   }
   await battery.protection.close();

   const state=await make('cadence-state-fail'),stateAttempts=[],batteryAttempts=[];
   state.core.save=()=>{batteryAttempts.push(state.time);return new Uint8Array([++state.batteries]);};
   state.core.state=()=>{stateAttempts.push(state.time);throw Error('Synthetic unavailable checkpoint');};
   for(let time=10000;time<=1560000;time+=10000){
    state.time=time;try{await state.auto(true);}catch(e){check(e.saveCommitted===true,'Checkpoint failure still commits battery');}
   }
   check(JSON.stringify(stateAttempts)===JSON.stringify([120000,240000,480000,960000,1560000]),'Checkpoint failures back off 120/240/480/600 seconds');
   check(batteryAttempts.length===13&&batteryAttempts.every((time,i)=>time===(i+1)*120000),'Battery continues every 120 seconds during checkpoint backoff');
   check(state.protection.stateAt===0,'Failure must not fake a successful checkpoint timestamp');
   state.time++;state.core.state=()=>new Uint8Array([88]);
   await state.protection.save(state.core,{checkpoint:true,reason:'background'});
   check(state.protection.stateAt>0,'Immediate successful checkpoint after failure');
   state.time+=119999;check((await state.auto(true)).skipped,'Successful manual checkpoint restarts its automatic deadline');
   state.time++;await state.auto(true);
   check((await db.get('recoveries','cadence-state-fail'))[0].bytes[0]===88,'Successful recovery clears backoff');
   await state.protection.close();

   const failure=await make('cadence-save-fail'),failedAt=[];
   failure.core.save=()=>{failedAt.push(failure.time);throw new DOMException('Synthetic quota','QuotaExceededError');};
   for(let time=10000;time<=2160000;time+=10000){failure.time=time;try{await failure.auto(false);}catch(e){check(e.name==='QuotaExceededError','Original error preserved');}}
   check(JSON.stringify(failedAt)===JSON.stringify([120000,240000,480000,960000,1560000,2160000]),'Battery failure retries are bounded and capped at 600 seconds');
   await failure.protection.close();
   await failure.protection.open({id:'cadence-new-owner',system:'gba'},'synthetic');
   failure.core.save=()=>new Uint8Array([99]);failure.time+=119999;check((await failure.auto(false)).skipped,'New owner starts a fresh 120 second deadline');
   failure.time++;await failure.auto(false);check((await db.get('saves','cadence-new-owner')).bytes[0]===99,'Previous owner backoff does not leak to new owner');
   await failure.protection.close();

   const queued=await make('cadence-queue');let unblock,entered;
   const started=new Promise(resolve=>{entered=resolve;});
   queued.core.save=async()=>{queued.batteries++;if(queued.batteries===1){entered();await new Promise(resolve=>{unblock=resolve;});}return new Uint8Array([queued.batteries]);};
   queued.time=120000;const pending=queued.auto(true);await started;
   queued.time=240000;
   for(let i=0;i<10;i++)check((await queued.auto(true)).skipped,'In-progress automatic saves must not accumulate');
   const manual=queued.protection.save(queued.core,{reason:'exit',clean:true});
   check((await queued.auto(true)).skipped,'Queued manual save also suppresses automatic work');
   unblock();await Promise.all([pending,manual]);
   check(queued.batteries===2&&queued.states===1,'Only initial capture and explicitly queued save ran');
   check((await db.get('sessions','cadence-queue')).dirty===false,'Exit remains ordered after automatic save');
   await queued.protection.close();

   const clock=await make('cadence-clock',1000);
   for(const time of [NaN,Infinity,-1,900]){clock.time=time;check((await clock.auto(true)).skipped,'Invalid or backwards clock cannot trigger a save');}
   clock.protection.clock=()=>{throw Error('Synthetic clock unavailable');};check((await clock.auto(true)).skipped,'Clock failure remains safe');
   clock.protection.clock=()=>clock.time;clock.time=121000;await clock.auto(true);
   clock.time=1000;check((await clock.auto(true)).skipped,'Clock rollback after success cannot repeat a capture');
   clock.time=241000;await clock.auto(true);check(clock.batteries===2,'Finite clock recovery preserves cadence');
   await clock.protection.close();
   await reject(clock.auto(false));
   return {initial:true,battery:true,checkpointBackoff:true,batteryBackoff:true,owner:true,queue:true,clock:true};
  });
  assert.deepEqual(result,{initial:true,battery:true,checkpointBackoff:true,batteryBackoff:true,owner:true,queue:true,clock:true});
  assert.deepEqual(errors,[]);console.log('Save cadence PASS ('+kind+'): delayed initial capture, battery/checkpoint backoff, immediate manual saves, bounded queue, owner and clock safety');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
