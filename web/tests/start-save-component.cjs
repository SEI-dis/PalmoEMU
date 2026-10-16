// SPDX-License-Identifier: AGPL-3.0-or-later
// Candidate checks use temporary source fixtures, never user saves/ROMs.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
(async()=>{
 const {checkComponent,compareComponents,readManifest,installedDirectory}=await import('../scripts/start-save-migrate/check.mjs');
 const {defineStartComponent,startVersionNumber}=await import('../src/start-save/contract.js');
 const {assembleEngine,buildEngine}=await import('../scripts/start-save-migrate/build.mjs');
 const sourceDirectory=path.join(__dirname,'../scripts/start-save-migrate');
 const template=fs.readFileSync(path.join(sourceDirectory,'base/engine.template.txt'));
 const patches=JSON.parse(fs.readFileSync(path.join(sourceDirectory,'patches.json'),'utf8'));
 const definitions=fs.readFileSync(path.join(installedDirectory,'manifest.js'));
 assert.equal(assembleEngine(template,patches,definitions),buildEngine({check:true}));
 assert.throws(()=>assembleEngine(Buffer.concat([template,Buffer.from(' ')]),patches,definitions),/template changed/);
 assert.throws(()=>assembleEngine(template,patches,Buffer.concat([definitions,Buffer.from(' ')])),/definitions changed/);
 for(const modify of [p=>p.changes.pop(),p=>p.changes.push(p.changes[0]),p=>p.changes[0].id='missing-anchor',p=>p.changes[0].code='/* PALMO_PATCH:injected */',p=>p.changes[0].reason='']){
  const invalid=structuredClone(patches);modify(invalid);assert.throws(()=>assembleEngine(template,invalid,definitions));
 }
 const current=checkComponent(),original=fs.readFileSync(path.join(installedDirectory,'manifest.js'),'utf8'),manifest=readManifest(original);
 const snapshot=Object.fromEntries(fs.readdirSync(installedDirectory).map(name=>[name,hash(fs.readFileSync(path.join(installedDirectory,name)))]));
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'palmo-start-component-'));
 try{
  const candidate=path.join(root,'candidate');fs.cpSync(installedDirectory,candidate,{recursive:true});
  const recordPath=path.join(candidate,'component.json'),record=JSON.parse(fs.readFileSync(recordPath,'utf8'));
  const pin=()=>{for(const name of Object.keys(record.files))record.files[name]=hash(fs.readFileSync(path.join(candidate,name)));fs.writeFileSync(recordPath,JSON.stringify(record));};
  assert.equal(current.definition.output.version,manifest.latest);
  assert(Object.isFrozen(current.definition)&&Object.isFrozen(current.definition.versions)&&Object.isFrozen(current.definition.output));
  // Simulate an updated definition retaining the known layout; this is not
  // a claim of support for a real unreleased converter/game.
  const nextMinor=(startVersionNumber(manifest.latest)>>>8)+1,nextVersion=`0.${nextMinor}.0`,nextPatch=`0.${nextMinor}.1`,followingVersion=`0.${nextMinor+1}.0`;
  const next=structuredClone(manifest);next.toolVersion='fixture-next';next.latest=nextVersion;
  next.versions.push({...next.versions.at(-1),version:next.latest,saveVersionStamp:startVersionNumber(next.latest),resumeMaxSourceStamp:startVersionNumber(next.latest)-1,crc32:null,saveSampleTested:false});
  fs.writeFileSync(path.join(candidate,'manifest.js'),'export const MANIFEST='+JSON.stringify(next)+';');
  record.toolVersion=next.toolVersion;record.outputVersion=next.latest;record.sources=[{name:'synthetic-fixture',sha256:'1'.repeat(64)}];pin();
  const checked=checkComponent(candidate),diff=compareComponents(current,checked);
  assert.equal(checked.definition.output.version,nextVersion);assert.deepEqual(diff.addedVersions,[nextVersion]);
  assert.deepEqual(diff.outputVersion,[manifest.latest,nextVersion]);assert.deepEqual(diff.removedVersions,[]);assert.equal(diff.provenanceChanged,true);
  assert.deepEqual(diff.changedFiles,['manifest.js']);
  // Load only the host definition with a synthetic manifest; the real engine
  // is not executed. All consumers get the updated version from one source.
  const feature=path.join(root,'src','start-save'),vendor=path.join(root,'vendor','start-save-migrate');
  fs.mkdirSync(feature,{recursive:true});fs.mkdirSync(vendor,{recursive:true});fs.writeFileSync(path.join(root,'package.json'),'{"type":"module"}');
  for(const name of ['contract.js','definition.js','compatibility.js','version.js','format-version.js'])fs.copyFileSync(path.join(__dirname,'../src/start-save',name),path.join(feature,name));
  fs.copyFileSync(path.join(candidate,'manifest.js'),path.join(vendor,'manifest.js'));
  const definition=await import(pathToFileURL(path.join(feature,'definition.js'))),compatibility=await import(pathToFileURL(path.join(feature,'compatibility.js')));
  assert.equal(definition.START_MIGRATION_VERSION,nextVersion);assert.equal(compatibility.START_MIGRATION_VERSION,nextVersion);
  assert.equal(definition.START_SOURCE_VERSIONS.at(-1).version,nextVersion);
  assert.equal(compatibility.canApplyStartMigration({version:nextPatch,minimumSaveVersion:nextVersion},'0.35.0'),false,'The 0.50 serialized format needs independent evidence, not another legacy metadata stamp');
  assert.equal(compatibility.canApplyStartMigration({version:followingVersion,minimumSaveVersion:nextPatch},'0.35.0'),false);
  assert.equal(compatibility.canApplyStartMigration(nextPatch,'0.35.0'),false,'Do not broaden legacy ROM evidence automatically');
  assert.equal(compatibility.selectStartMigrationVersion({version:'0.48.0',minimumSaveVersion:'0.43.0'},'0.35.0'),null,'A manifest stamp alone is not a reviewed bridge');
  for(const modify of [m=>m.latest='0.42.2',m=>m.versions.reverse(),m=>m.versions.push({...m.versions.at(-1)}),m=>m.versions.at(-1).boxes=60,m=>m.versions.at(-1).encrypted=false,m=>delete m.versions.at(-1).saveVersionStamp,m=>m.nativeCompatibility.versionVariable=0x50ee,
   m=>m.versions.at(-1).species=0,m=>m.versions.at(-1).moves=1006.5,m=>m.versions.at(-1).items=65537,
   m=>m.versions.at(-1).resumeMaxSourceStamp=0,m=>m.versions.at(-1).resumeMaxSourceStamp=m.versions.at(-1).saveVersionStamp]){
   const invalid=structuredClone(manifest);modify(invalid);assert.throws(()=>defineStartComponent(invalid),/Unsupported/);
  }
  fs.appendFileSync(path.join(candidate,'engine.js'),'\n// tampered');assert.throws(()=>checkComponent(candidate),/Changed component file/);pin();
  const engine=fs.readFileSync(path.join(candidate,'engine.js'),'utf8');
  fs.writeFileSync(path.join(candidate,'engine.js'),engine.replace(/export\s*\{[^}]*\}/,'export {MANIFEST};'));pin();assert.throws(()=>checkComponent(candidate),/Missing engine API/);
  fs.writeFileSync(path.join(candidate,'engine.js'),engine+'\nimport "./unreviewed.js";');pin();assert.throws(()=>checkComponent(candidate),/Unexpected engine dependency/);
  fs.writeFileSync(path.join(candidate,'engine.js'),engine);pin();
  fs.writeFileSync(path.join(candidate,'private.sav'),'not a save');assert.throws(()=>checkComponent(candidate),/Unexpected component files/);fs.unlinkSync(path.join(candidate,'private.sav'));
  const marker=path.join(root,'should-not-exist');
  fs.writeFileSync(path.join(candidate,'manifest.js'),`export const MANIFEST=(()=>{require('node:fs').writeFileSync(${JSON.stringify(marker)},'executed');return ${JSON.stringify(next)}})();`);pin();
  assert.throws(()=>checkComponent(candidate),/literal data/);assert.equal(fs.existsSync(marker),false);
  assert.throws(()=>readManifest('export const MANIFEST={latest:"a",latest:"b"};'),/Duplicate/);
  assert.throws(()=>readManifest('export const MANIFEST={}; globalThis.sideEffect=true;'),/one exported/);
  for(const [name,digest]of Object.entries(snapshot))assert.equal(hash(fs.readFileSync(path.join(installedDirectory,name))),digest,'Installed component remains unchanged: '+name);
  console.log('PASS: START component provenance/hashes, read-only candidate diff, next-version metadata propagation, unchanged ROM boundaries, unsupported layouts/APIs and executable manifest rejection.');
 }finally{
  // Only remove the exact directory freshly allocated for this test.
  assert(path.dirname(path.resolve(root))===path.resolve(os.tmpdir())&&path.basename(root).startsWith('palmo-start-component-'));
  fs.rmSync(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
