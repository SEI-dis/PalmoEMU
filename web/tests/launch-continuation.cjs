// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict');
(async()=>{
 const {createLaunchContinuation:create}=await import('../src/updates/launch-continuation.js');
 const values=new Map(),storage=()=>({getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)});
 let time=1000;const make=(build='old',scope='/app/')=>create({build,scope,storage,now:()=>time}),key='palmo-launch-after-update:/app/';
 const old=make();old.remember({id:'selected-new-rom',name:'Must not persist this title'},{skipRecovery:true});
 assert.equal(values.size,0,'Merely waiting does not persist a launch');
 old.preserve();const record=JSON.parse(values.get(key));assert.deepEqual(Object.keys(record).sort(),['schema','id','safeMode','skipRecovery','from','at'].sort());
 const next=make('new');next.restore();assert.equal(values.size,0,'Consume the stored request before running a core');assert.deepEqual(next.take(),{schema:1,id:'selected-new-rom',safeMode:false,skipRecovery:true});assert.equal(next.take(),null);
 for(const invalid of [{...record,from:'new'},{...record,at:-300000},{...record,at:2000},{...record,id:''},{...record,safeMode:'false'},{...record,schema:2}]){values.set(key,JSON.stringify(invalid));const request=make('new');request.restore();assert.equal(request.take(),null);assert.equal(values.has(key),false);}
 values.set(key,'{broken');assert.doesNotThrow(()=>make('new').restore());assert.equal(values.has(key),false);
 old.remember({id:'safe-rom'},{safeMode:true});old.preserve();const other=make('new','/other/');other.restore();assert.equal(other.take(),null);assert.equal(values.has(key),true);
 const restored=make('new');restored.restore();assert.equal(restored.take().safeMode,true);
 old.remember({id:'cancelled'});old.clear();old.preserve();assert.equal(values.size,0);
 old.remember({id:'first'});old.remember({id:'latest'});assert.equal(old.take().id,'latest');
 const blocked=create({scope:'/app/',build:'old',storage:()=>{throw Error('Denied');},now:()=>time});blocked.remember({id:'local'});assert.doesNotThrow(()=>blocked.preserve());assert.equal(blocked.take().id,'local');assert.doesNotThrow(()=>blocked.restore());
 console.log('PASS: one-shot app-update launch intent, option preservation, expiry, build/scope validation, cancellation and unavailable storage; no ROM/save content.');
})().catch(error=>{console.error(error);process.exitCode=1;});
