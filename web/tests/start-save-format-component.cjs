// SPDX-License-Identifier: AGPL-3.0-or-later
// Disposable source fixtures only: no ROM, upstream HTML/PKS, or user save.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
(async()=>{
 const {checkComponent,checkPublicationPermission,installedDirectory}=await import('../scripts/start-save-format/check.mjs');
 const current=checkComponent(),snapshot=Object.fromEntries(fs.readdirSync(installedDirectory).map(name=>[name,fs.readFileSync(path.join(installedDirectory,name))]));
 assert.deepEqual(current.contract.saveBodyBytes,[131072,6291456]);assert.deepEqual(current.contract.direction.to,['L','W']);assert.equal(current.contract.direction.reverseConversion,false);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'palmo-format-component-')),candidate=path.join(root,'candidate');fs.mkdirSync(candidate);
 try{
  const reset=()=>{for(const [name,bytes] of Object.entries(snapshot))fs.writeFileSync(path.join(candidate,name),bytes);};
  const editRecord=change=>{const name=path.join(candidate,'component.json'),record=JSON.parse(fs.readFileSync(name));change(record);fs.writeFileSync(name,JSON.stringify(record));};
  const editEngine=(change,repin=false)=>{const name=path.join(candidate,'engine.js');fs.writeFileSync(name,change(fs.readFileSync(name,'utf8')));if(repin)editRecord(record=>record.files['engine.js']=hash(fs.readFileSync(name)));};
  reset();assert.deepEqual(checkComponent(candidate).contract,current.contract);
  // Synthetic permission records exercise the gate; they are not grants for the installed component.
  const granted=structuredClone(current.record);
  granted.publicationPermission={scopes:{incorporation:true,webPublication:true,modification:true,offlineDistribution:true,modifiedSourceRedistribution:true},confirmedOn:'2026-10-16',evidence:'Synthetic author-confirmation fixture only'};
  assert.doesNotThrow(()=>checkPublicationPermission(granted));
  for(const scope of Object.keys(granted.publicationPermission.scopes))for(const value of [null,false,undefined]){
   const incomplete=structuredClone(granted);incomplete.publicationPermission.scopes[scope]=value;
   // A release ready flag does not override an incomplete component grant.
   incomplete.status='ready';incomplete.openItems=[];
   assert.throws(()=>checkPublicationPermission(incomplete),/NOT READY FOR PUBLICATION/);
  }
  for(const field of ['confirmedOn','evidence']){const incomplete=structuredClone(granted);incomplete.publicationPermission[field]=null;assert.throws(()=>checkPublicationPermission(incomplete),/evidence/);}
  reset();editRecord(record=>record.publicationPermission.scopes.modification=null);
  checkComponent(candidate); // Local inspection/building remains possible while publication is held.
  const publication=spawnSync(process.execPath,[path.join(__dirname,'../scripts/start-save-format/check.mjs'),candidate,'--publication'],{encoding:'utf8',windowsHide:true});
  assert.equal(publication.status,1);assert.match(publication.stderr,/NOT READY FOR PUBLICATION/);
  assert.match(fs.readFileSync(path.join(__dirname,'../scripts/check-release.cjs'),'utf8'),/start-save-format\/check\.mjs'\),'--publication'/,'Release verification must request the permission gate');
  for(const name of ['engine.js','README.md']){reset();fs.appendFileSync(path.join(candidate,name),'\n// changed');assert.throws(()=>checkComponent(candidate),/Changed component file/);}
  for(const change of [r=>r.direction.to='old',r=>r.direction.from='L',r=>r.direction.reverseConversion=true,r=>r.direction.rounding=true,r=>r.direction.versionGuard=0x3200,r=>r.saveBodyBytes.push(1048576),r=>r.optionalRTCBytes=32,r=>r.slotBytes=6291456,r=>r.hostContract='future-format']){
   reset();editRecord(change);assert.throws(()=>checkComponent(candidate),/Unsupported/);
  }
  for(const change of [r=>r.sourceDistributor='unverified-author',r=>r.sourceURL='https://example.invalid/tool',r=>r.individualAuthor='invented name',r=>r.license='MIT',r=>r.permission='Permission assumed from public availability',r=>r.sources[0].sha256='0'.repeat(64),r=>r.files['../engine.js']=r.files['engine.js'],r=>r.files['engine.js']='invalid']){
   reset();editRecord(change);assert.throws(()=>checkComponent(candidate));
  }
  // Re-pinning a changed executable must not bypass the known host contract.
  for(const [before,after] of [['WIDE_VERSION_GUARD=0x34ff','WIDE_VERSION_GUARD=0x3500'],['VERSION_GUARD=0x31ff','VERSION_GUARD=0x3200'],['SLOT_BYTES=3*1024*1024','SLOT_BYTES=2*1024*1024'],["60,11,68,16,18,8,1020,480,30","62,11,68,16,18,8,1020,480,30"],['[SMALL_BYTES,FULL_BYTES].includes(bodyBytes)','[SMALL_BYTES,1048576,FULL_BYTES].includes(bodyBytes)'],['[0,16].includes(rtcBytes)','[0,32].includes(rtcBytes)']]){
   reset();editEngine(source=>{assert(source.includes(before));return source.replace(before,after);},true);assert.throws(()=>checkComponent(candidate),/contract|layout|sizes|extent/);
  }
  reset();editEngine(source=>source.replace('export function containsFormatL','function containsFormatL'),true);assert.throws(()=>checkComponent(candidate),/API/);
  reset();editEngine(source=>source+'\nexport function downgradeSave(){}',true);assert.throws(()=>checkComponent(candidate),/API/);
  reset();editEngine(source=>source+'\nimport "./unreviewed.js";',true);assert.throws(()=>checkComponent(candidate),/Unexpected/);
  reset();editEngine(source=>source+'\nfunction deferredDependency(){return import("./unreviewed.js");}',true);assert.throws(()=>checkComponent(candidate),/dependency/);
  const marker=path.join(root,'must-not-exist');
  reset();editEngine(source=>source+`\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},'executed');`,true);assert.throws(()=>checkComponent(candidate),/top-level/);assert(!fs.existsSync(marker),'Candidate code must never execute');
  for(const name of ['セーブデータ移行ツール.html','PokemonStart_v0.50.0.pks','private.gba','private.sav']){reset();fs.writeFileSync(path.join(candidate,name),'synthetic forbidden file');assert.throws(()=>checkComponent(candidate),/Unexpected component files/);fs.unlinkSync(path.join(candidate,name));}
  reset();editRecord(record=>record.direction.reverseConversion=true);
  const result=spawnSync(process.execPath,[path.join(__dirname,'../scripts/start-save-format/check.mjs'),candidate],{encoding:'utf8',windowsHide:true});
  assert.equal(result.status,1,'CLI rejects incompatible candidate');assert.match(result.stderr,/Unsupported migration direction/);
  for(const [name,bytes] of Object.entries(snapshot))assert.deepEqual(fs.readFileSync(path.join(installedDirectory,name)),bytes,'Installed component unchanged: '+name);
  console.log('PASS: format-L source pins, permission record, immutable installed component, tamper/contract/API rejection, source-only inspection and no ROM/HTML/PKS distribution.');
 }finally{
  // Only the exact, freshly allocated test directory is removed.
  assert(path.dirname(path.resolve(root))===path.resolve(os.tmpdir())&&path.basename(root).startsWith('palmo-format-component-'));
  fs.rmSync(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
