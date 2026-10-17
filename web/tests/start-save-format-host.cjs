// SPDX-License-Identifier: AGPL-3.0-or-later
// Authored saves only: both converters and the ROM-update compatibility boundary.
const assert=require('node:assert/strict');
const {fixture35,fixture22,hash,slotBytes}=require('./helpers/start-save-fixtures.cjs');
const {newLayout,changePage,put16,u16}=require('./helpers/start-save-format-fixtures.cjs');
(async()=>{
 const api=await import('../src/start-save/migration.js');
 const {startSaveCompatibility:classify,canApplyStartMigration:canApply}=await import('../src/start-save/compatibility.js');
 const {inspectFormatSave}=await import('../src/start-save/format-l.js');
 const target={version:'0.50.0',minimumSaveVersion:'0.36.2',saveFormat:'L'};
 for(const from of ['0.22','0.35.0','0.40.0','0.49.0']){
  assert.equal(classify(from,target).status,'convert');assert.equal(canApply(target,from),true);
 }
 for(const unverified of ['0.50.0',{version:'0.50.0',minimumSaveVersion:'0.36.2'},{...target,unverified:true},{...target,minimumSaveVersion:null},{...target,minimumSaveVersion:'0.50.0'}]){
  assert.equal(canApply(unverified,'0.49.0'),false,'Version/stamp alone cannot authorize the new format');
 }
 for(const [from,save]of [['0.22',fixture22()],['0.35.0',fixture35({second:true})],['0.40.0',fixture35({stamp:0x2800,second:true})],['0.49.0',fixture35({stamp:0x3100,second:true})]]){
  const before=hash(save),result=await api.migrateStartSave(save,{from,target});
  assert.equal(hash(save),before);assert.equal(result.report.to,'0.50.0');
  assert.deepEqual(result.bytes.slice(-16),save.slice(-16));
  const info=inspectFormatSave(result.bytes),used=info.slots.filter(s=>s.valid);
  assert.equal(used.length,from==='0.22'?1:2);assert(used.every(s=>s.format==='L'&&s.versionStamp===0x31ff));
  assert.equal(api.detectStartSaveVersion(result.bytes),'0.50.0');
  assert.equal(api.inspectStartUpdate(result.bytes,'0.50.0',target).compatibility.status,'compatible');
  assert.equal(api.inspectStartUpdate(result.bytes,'0.50.0',{version:'0.49.0',minimumSaveVersion:'0.36.2'}).compatibility.status,'downgrade');
  const noop=await api.migrateStartSave(result.bytes,{from:'0.50.0',target});assert.deepEqual(noop.bytes,result.bytes);
  await assert.rejects(api.migrateStartSave(result.bytes,{from:'0.50.0',target:{version:'0.49.0',minimumSaveVersion:'0.36.2'}}));
  assert.throws(()=>api.inspectStartUpdate(result.bytes,'0.49.0',target));
 }
 const save=fixture35({stamp:0x3100,second:true}),before=hash(save);
 // The converter revision does not replace the layout's 0.50.0 boundary or
 // stamp a target version early. Compatible later ROMs retain native updates.
 for(const version of ['0.50.1','0.51.0']){
  const later={...target,version},result=await api.migrateStartSave(save,{from:'0.49.0',target:later});
  assert.equal(classify('0.49.0',later).status,'convert');
  assert.equal(api.detectStartSaveVersion(result.bytes),'0.50.0');
  assert.equal(api.inspectStartUpdate(result.bytes,'0.50.0',later).compatibility.status,'compatible');
  assert.deepEqual((await api.migrateStartSave(result.bytes,{from:'0.50.0',target:later})).bytes,result.bytes);
  assert.equal(hash(save),before);
 }
 const one=await api.migrateStartSave(save,{from:'0.49.0',target,selection:1});
 assert.deepEqual(one.bytes.subarray(0,slotBytes),save.subarray(0,slotBytes));assert.equal(hash(save),before);
 assert.equal(api.detectStartSaveVersion(one.bytes),null,'Mixed old/L slots are never silently labelled as one version');
 const oldTarget={version:'0.49.0',minimumSaveVersion:'0.36.2'},mismatch={code:'START_MISMATCH'};
 assert.throws(()=>api.inspectStartSave(one.bytes,'0.49.0'),mismatch,'The legacy inspector cannot hide an L adventure as invalid');
 assert.throws(()=>api.inspectStartUpdate(one.bytes,'0.49.0',oldTarget),mismatch,'Mixed saves cannot enter the legacy compatible-copy path');
 await assert.rejects(api.migrateStartSave(one.bytes,{from:'0.49.0',target}),mismatch,'A whole-file source version cannot describe mixed old/L slots');
 const future=changePage(one.bytes,1,10,page=>put16(page,0x245,0x3300));
 await assert.rejects(api.migrateStartSave(future,{from:'0.49.0',target}),mismatch,'A future L adventure must not pass through an old source claim');
 assert.equal(inspectFormatSave(future).slots[1].versionStamp,0x3300);
 // The native 0.50 table has seven 0.38.1 VarSet(id, 0) entries. Its
 // threshold would already be passed after writing the L guard 0x31ff.
 // Match the existing reviewed correction; do not invent a new migration.
 const {MANIFEST}=await import('../vendor/start-save-migrate/manifest.js'),known=MANIFEST.nativeCompatibility.newVariables;
 const nativeVariables=Array.from({length:7},(_,i)=>0x5140+i);
 assert.equal(known.introduced,'0.38.1');assert.equal(known.value,0);assert.deepEqual(known.ids,nativeVariables);
 for(const [from,stamp]of [['0.36.2',0x2402],['0.38.0',0x2600]]){
  const original=fixture35({stamp,second:true}),before=hash(original),result=await api.migrateStartSave(original,{from,target});
  assert.equal(result.report.legacy.to,'0.42.5','The existing bridge applies all reviewed older corrections first');
  for(const slot of [0,1]){const {p0}=newLayout(result.bytes,slot);for(const id of nativeVariables)assert.equal(u16(p0,0x245+(id-0x50ef)*2),0,from+' initialized '+id.toString(16));}
  assert.equal(hash(original),before);assert.deepEqual(result.bytes.slice(-16),original.slice(-16));
 }
 assert.throws(()=>api.inspectStartUpdate(save,'0.50.0',target),'Legacy bytes with a new filename are not L-format saves');
 for(const target of ['0.50.0',{version:'0.50.0',minimumSaveVersion:'0.36.2'}])await assert.rejects(api.migrateStartSave(save,{from:'0.49.0',target}));
 const full=fixture35({stamp:0x3100}),small=new Uint8Array(1048576+16);small.set(full.subarray(0,1048576));small.set(full.slice(-16),1048576);
 const smallHash=hash(small),progress=[];
 const expanded=await api.migrateStartSave(small,{from:'0.49.0',target,onProgress:event=>progress.push(event)});
 assert.equal(expanded.bytes.length,6291456+16);assert.equal(hash(small),smallHash);assert.deepEqual(expanded.bytes.slice(-16),small.slice(-16));
 assert.equal(api.detectStartSaveVersion(expanded.bytes),'0.50.0');assert(progress.length>0);
 assert(progress.every(event=>Number.isFinite(event.index)&&event.index>=0&&event.total>0&&event.index<=event.total),'UI progress always has a finite index and total');
 const stopDuring=new AbortController();await assert.rejects(api.migrateStartSave(small,{from:'0.49.0',target,signal:stopDuring.signal,onProgress:()=>stopDuring.abort()}),{name:'AbortError'});assert.equal(hash(small),smallHash);
 const stop=new AbortController();stop.abort();await assert.rejects(api.migrateStartSave(save,{from:'0.49.0',target,signal:stop.signal}),{name:'AbortError'});assert.equal(hash(save),before);
 const wideTarget={version:'0.53.1',minimumSaveVersion:'0.36.2',saveFormat:'W'};
 const lSave=await api.migrateStartSave(save,{from:'0.49.0',target});
 for(const [from,input]of [['0.22',fixture22()],['0.35.0',fixture35({second:true})],['0.49.0',save],['0.50.0',lSave.bytes]]){
  const inputHash=hash(input),wide=await api.migrateStartSave(input,{from,target:wideTarget});
  assert.equal(hash(input),inputHash);assert.equal(classify(from,wideTarget).status,'convert');
  assert.equal(api.detectStartSaveVersion(wide.bytes),'0.53.0');assert.equal(wide.report.to,'0.53.0');
  assert.equal(api.inspectStartUpdate(wide.bytes,'0.53.0',wideTarget).compatibility.status,'compatible');
  assert.deepEqual((await api.migrateStartSave(wide.bytes,{from:'0.53.0',target:wideTarget})).bytes,wide.bytes);
  assert.throws(()=>api.inspectStartSave(wide.bytes,'0.50.0'),{code:'START_MISMATCH'});
  await assert.rejects(api.migrateStartSave(wide.bytes,{from:'0.53.0',target}));
 }
 for(const bad of [{...wideTarget,saveFormat:'L'},{...wideTarget,minimumSaveVersion:'0.53.0'},{...wideTarget,saveFormat:undefined}])assert.equal(canApply(bad,'0.49.0'),false);
 assert.equal(classify('0.53.0',{...wideTarget,version:'0.54.0'}).status,'compatible');
 const misleading=changePage(lSave.bytes,0,10,p=>put16(p,0x245,0x3501));assert.equal(api.detectStartSaveVersion(misleading),null,'L bytes cannot claim a W version');
 assert.throws(()=>api.inspectStartSave(misleading,'0.53.1'));
 console.log('PASS: START 0.50 host routing, old converter chain, L inspection/bridge marker, immutable slots/RTC, noop, unknown format and downgrade refusal');
})().catch(error=>{console.error(error);process.exitCode=1;});
