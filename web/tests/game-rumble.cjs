// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic controllers only. No ROM, user data, browser profile or hardware.
const assert=require('node:assert/strict');
(async()=>{
 const {GameRumble,supportsGameRumble}=await import('../src/game-rumble.js');
 class Surface extends EventTarget {hidden=false;}
 function fixture(){
  const calls=[],core=[],visibility=new Surface(),events=new EventTarget();let strength=.4,time=0;
  const makePad=(index,id)=>({index,id,connected:true,vibrationActuator:{effects:['dual-rumble'],playEffect(type,value){calls.push({index,type,...value});return Promise.resolve('complete');},reset(){calls.push({index,reset:true});return Promise.resolve('complete');}}});
  const first=makePad(0,'pad-a'),second=makePad(1,'pad-b'),pads=[first,second];
  const rumble=new GameRumble({readStrength:()=>strength,setEnabled:value=>core.push(value),getGamepads:()=>pads,now:()=>time,visibility,events});
  return {rumble,first,second,pads,calls,core,visibility,events,set strength(value){strength=value;},set time(value){time=value;}};
 }
 const f=fixture();f.rumble.tick();assert.equal(f.calls.length,0);
 f.rumble.pause(false);f.rumble.configure({enabled:true});f.rumble.tick();assert.equal(f.calls.length,0,'No target means no implicit first pad');
 f.rumble.setTarget(f.second);f.rumble.tick();assert.deepEqual(f.core,[1]);assert.equal(f.calls[0].index,1);assert.equal(f.calls[0].strongMagnitude,.4);
 f.time=10;f.rumble.tick();assert.equal(f.calls.length,1,'Bound duplicate hardware requests');
 f.time=60;f.rumble.tick();assert.equal(f.calls.length,2);
 f.rumble.setTarget(f.first);assert.equal(f.calls.at(-1).index,1);assert.equal(f.calls.at(-1).reset,true);
 f.rumble.tick();assert.equal(f.calls.at(-1).index,0,'Only the selected target receives the new effect');
 f.rumble.pause(true);assert.equal(f.core.at(-1),0);assert.equal(f.calls.at(-1).reset,true);
 const paused=f.calls.length;f.rumble.tick();assert.equal(f.calls.length,paused);
 f.rumble.pause(false);f.time=100;f.rumble.tick();f.visibility.hidden=true;f.visibility.dispatchEvent(new Event('visibilitychange'));assert.equal(f.core.at(-1),0);assert.equal(f.calls.at(-1).reset,true);
 f.visibility.hidden=false;f.rumble.tick();f.first.connected=false;f.rumble.tick();assert.equal(f.core.at(-1),0);
 f.pads[0]={...f.first,connected:true,id:'different-pad'};const replaced=f.calls.length;f.rumble.tick();assert.equal(f.calls.length,replaced,'An index reused by another device must not inherit rumble');
 f.rumble.close();f.rumble.close();const closed=f.calls.length;f.visibility.dispatchEvent(new Event('visibilitychange'));f.rumble.tick();assert.equal(f.calls.length,closed);
 const z=fixture();z.rumble.setTarget(z.first);z.rumble.configure({enabled:true});z.rumble.pause(false);z.strength=9;z.rumble.tick();assert.equal(z.calls[0].strongMagnitude,1);z.strength=NaN;z.rumble.tick();assert.equal(z.calls.at(-1).reset,true);z.rumble.close();
 const unsupported=fixture();delete unsupported.first.vibrationActuator;assert.equal(supportsGameRumble(unsupported.first),false);unsupported.rumble.setTarget(unsupported.first);unsupported.rumble.configure({enabled:true});unsupported.rumble.pause(false);unsupported.rumble.tick();assert.equal(unsupported.calls.length,0);unsupported.rumble.close();
 const denied=fixture();denied.first.vibrationActuator.playEffect=()=>Promise.reject(Error('Not allowed'));denied.first.vibrationActuator.reset=()=>Promise.reject(Error('Not allowed'));
 denied.rumble.setTarget(denied.first);denied.rumble.configure({enabled:true});denied.rumble.pause(false);denied.rumble.tick();await Promise.resolve();await Promise.resolve();assert.equal(denied.core.at(-1),0);denied.rumble.tick();assert.equal(denied.core.at(-1),0,'Do not retry a rejected actuator every frame');denied.rumble.close();
 const stale=fixture();let rejectOld;stale.first.vibrationActuator.playEffect=()=>new Promise((resolve,reject)=>{rejectOld=reject;});stale.rumble.setTarget(stale.first);stale.rumble.configure({enabled:true});stale.rumble.pause(false);stale.rumble.tick();stale.rumble.setTarget(stale.second);stale.rumble.tick();rejectOld(Error('Late rejection'));await Promise.resolve();assert.equal(stale.core.at(-1),1,'Old target cannot disable the current target');stale.rumble.close();
 const thrown=fixture();thrown.first.vibrationActuator.playEffect=()=>{throw Error('Unsupported');};thrown.first.vibrationActuator.reset=()=>{throw Error('Unsupported');};thrown.rumble.setTarget(thrown.first);thrown.rumble.configure({enabled:true});thrown.rumble.pause(false);assert.doesNotThrow(()=>thrown.rumble.tick());assert.equal(thrown.core.at(-1),0);thrown.rumble.close();
 const coreDenied=fixture();coreDenied.rumble.setEnabled=()=>0;coreDenied.rumble.setTarget(coreDenied.first);coreDenied.rumble.configure({enabled:true});coreDenied.rumble.pause(false);coreDenied.rumble.tick();assert.equal(coreDenied.calls.length,0,'A rejected core API cannot emit hardware effects');coreDenied.rumble.close();
 const pulse=fixture();let sampling=false,sample=0;
 pulse.rumble.setEnabled=value=>{sampling=!!value;sample=0;return 1;};pulse.rumble.readStrength=()=>sample;
 pulse.rumble.setTarget(pulse.first);pulse.rumble.configure({enabled:true});pulse.rumble.pause(false);
 pulse.rumble.prepare();assert.equal(sampling,true);assert.equal(pulse.calls.length,0,'Preparing a frame only enables core sampling');
 sample=sampling ? .6 : 0;pulse.rumble.tick();assert.equal(pulse.calls.at(-1).strongMagnitude,.6,'The first single-frame pulse reaches the selected controller');
 pulse.rumble.pause(true);assert.equal(sampling,false);pulse.rumble.pause(false);pulse.rumble.prepare();sample=sampling ? .3 : 0;pulse.rumble.tick();assert.equal(pulse.calls.at(-1).strongMagnitude,.3,'The first pulse after resume is retained');pulse.rumble.close();
 console.log('PASS: explicit single target, opt-in, pause/visibility/disconnect/close, bounded output, unsupported/denied APIs and stale rejection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
