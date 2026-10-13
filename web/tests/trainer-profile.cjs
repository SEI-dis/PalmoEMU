// SPDX-License-Identifier: AGPL-3.0-or-later
// Pure model tests: no browser, IndexedDB, ROMs, save data, or network.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/trainer-profile.js'),'utf8');
 const {trainerProfileKey,playRecordPrefix,playRecord,trainerStats,initialTrainerProfile}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const clock=Date.now,now=2000000000000;Date.now=()=>now;
 try{
  assert.equal(trainerProfileKey,'\u0001palmo-trainer-profile');assert.equal(playRecordPrefix,'\u0001palmo-play-record:');
  const game=(id,playDuration,added,previousId,system='gba')=>({id,system,name:id,playDuration,added,lastPlayed:added,...(previousId?{romUpdate:{previousId,at:added}}:{})});
  const old={...game('a',100,100),previousIds:['earlier','earlier','a','invalid:key'],updatedAt:150};
  const current={...game('a',30,200,'parent'),name:' New name ',rom:new Uint8Array([1]),save:{bytes:new Uint8Array([2])}};
  const before=JSON.stringify([old,current]);
  assert.deepEqual(playRecord(current,old),{id:'a',system:'gba',name:'New name',added:100,lastPlayed:200,playDuration:100,updatedAt:200,previousIds:['earlier','parent']});
  assert.equal(JSON.stringify([old,current]),before,'Inputs are not mutated');
  assert.equal(playRecord(game('a',5,100),game('other',999,1)).playDuration,5,'Different ROM cannot donate a counter');
  assert.equal(playRecord(game('a',5,100),game('a',999,1,undefined,'nds')).playDuration,5,'Different system cannot donate a counter');
  assert.throws(()=>playRecord({id:'bad:key',system:'gba'}),TypeError);
  for(const invalid of [-1,NaN,Infinity,'30',Number.MAX_SAFE_INTEGER+1])assert.equal(playRecord({...game('x',invalid,now+1),lastPlayed:invalid,romUpdate:{previousId:'x',at:Infinity}}).playDuration,0);
  assert.deepEqual(playRecord({...game('x',1,now+1),lastPlayed:now+1,updatedAt:now+1}),{id:'x',system:'gba',name:'x',added:0,lastPlayed:0,playDuration:1,updatedAt:0,previousIds:[]});

  const a=game('a',10,100),b=game('b',20,200,'a'),c=game('c',30,300,'b'),d=game('d',70,400),unplayed=game('unplayed',0,500);
  const saved=[a,b,c,d,unplayed].map(row=>playRecord(row));
  let result=trainerStats(saved,[c,d,unplayed]);
  assert.deepEqual(result,{total:130,rankings:[{id:'d',name:'d',system:'gba',playDuration:70},{id:'c',name:'c',system:'gba',playDuration:60}]},'Deleted old versions retain their own time in one ranked series');
  assert.deepEqual(trainerStats([...saved,a,a,b],[a,b,c,d,unplayed]),result,'Repeated records and same ROM imports count once');
  assert.deepEqual(trainerStats(saved,[game('a',5,900),c,d]),result,'Re-added old ROM neither loses past time nor becomes the newest version');
  assert.deepEqual(trainerStats(saved,[]),result,'Fully archived series retains a representative');
  assert.equal(trainerStats(saved,[{...c,name:'Current title',playDuration:35}]).rankings.find(row=>row.id==='c').name,'Current title');
  assert.equal(trainerStats(saved,[{...c,playDuration:35}]).total,135,'Only the current ROM own counter grows');

  const branch=[a,b,game('fork',40,250,'a')];
  assert.deepEqual(trainerStats(branch,branch),{total:70,rankings:[{id:'fork',name:'fork',system:'gba',playDuration:70}]},'Branches merge each ROM once and choose the newest live branch');
  const cycle=[game('a',10,100,'c'),b,c];
  assert.deepEqual(trainerStats(cycle,cycle),{total:60,rankings:[{id:'c',name:'c',system:'gba',playDuration:60}]},'Cycles terminate and count unique IDs once');
  assert.deepEqual(trainerStats([...cycle].reverse(),[...cycle].reverse()),trainerStats(cycle,cycle),'Cycle output is deterministic');
  const foreign=game('foreign',15,500,'a','nds');
  assert.deepEqual(trainerStats([a,foreign],[a,foreign]),{total:25,rankings:[{id:'foreign',name:'foreign',system:'nds',playDuration:15},{id:'a',name:'a',system:'gba',playDuration:10}]},'Cross-system relations are ignored');
  assert.deepEqual(trainerStats([game('a',999,500,undefined,'nds'),a],[a]),{total:10,rankings:[{id:'a',name:'a',system:'gba',playDuration:10}]},'Live system controls conflicting duplicate identity');
  assert.equal(trainerStats([game('one',Number.MAX_SAFE_INTEGER,1),game('two',Number.MAX_SAFE_INTEGER,2)],[]).total,Number.MAX_SAFE_INTEGER,'Overflow saturates instead of losing integer precision');
  assert.deepEqual(trainerStats([null,{},game('negative',-1,1),{id:'invalid:key',system:'gba',playDuration:999}],null),{total:0,rankings:[]});
  const frozen=Object.freeze(saved.map(row=>Object.freeze({...row,previousIds:Object.freeze([...row.previousIds])})));
  assert.deepEqual(trainerStats(frozen,Object.freeze([c,d,unplayed])),result,'Frozen records work without mutation');

  assert.deepEqual(initialTrainerProfile([game('a',1,100),game('b',1,200)],{now}),{nickname:'',joinedAt:100,joinSource:'estimated'});
  assert.deepEqual(initialTrainerProfile([game('a',1,100)],{now,fresh:true}),{nickname:'',joinedAt:now,joinSource:'first-use'});
  assert.deepEqual(initialTrainerProfile([],{now}),{nickname:'',joinedAt:now,joinSource:'recorded'});
  assert.deepEqual(initialTrainerProfile([null,{added:now+1},{added:NaN},{added:-1},{added:'100'}],{now}),{nickname:'',joinedAt:now,joinSource:'recorded'});
  assert.deepEqual(initialTrainerProfile([{added:100}],{now:NaN}),{nickname:'',joinedAt:100,joinSource:'estimated'});
  console.log('PASS: trainer profile provenance, monotone per-ROM records, unique series totals, removed/re-added versions, branches/cycles, live representatives, invalid dates/edges/counters, overflow and immutable inputs.');
 }finally{Date.now=clock;}
})().catch(error=>{console.error(error);process.exitCode=1;});
