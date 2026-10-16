// SPDX-License-Identifier: AGPL-3.0-or-later
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'SOURCES.json')));
const {spawnSync}=require('node:child_process');
function run(command,args){const r=spawnSync(command,args,{stdio:'inherit'});assert.equal(r.status,0,'Release verification failed: '+command+' '+args.join(' '));}
const python=process.env.PYTHON||(process.platform==='win32'?'python':'python3');
run(process.execPath,[path.join(__dirname,'start-save-migrate/check.mjs')]);
// A generic ready flag or valid source hashes cannot replace component permission.
run(process.execPath,[path.join(__dirname,'start-save-format/check.mjs'),'--publication']);
run(python,['-B','-X','utf8',path.join(__dirname,'audit-content.py')]);
run(python,['-B','-X','utf8',path.join(__dirname,'check-bundled-skins.py')]);
run(python,['-B','-X','utf8',path.join(__dirname,'package_source.py'),'--check']);
run(process.execPath,[path.join(__dirname,'build-offline.cjs'),'--check']);
run(process.execPath,[path.join(__dirname,'check-modules.cjs')]);
run(process.execPath,[path.join(__dirname,'check-i18n.mjs')]);
run(process.execPath,[path.join(__dirname,'build-icons.cjs'),'--check']);
for(const [file,expected] of Object.entries(manifest.files)){const bytes=fs.readFileSync(path.join(root,file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),expected,'Changed upstream asset: '+file);}
function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);assert.ok(!entry.isSymbolicLink(),'Symlink in deployment');if(entry.isDirectory()){assert.ok(!['node_modules','.git','test-results','playwright-report'].includes(entry.name),'Non-release directory: '+entry.name);scan(file);}else {assert.ok(!/\.(pks|3ds|3dsx|cci|cxi|lp3sav|nds|dsv|gba|gb|gbc|nes|sfc|smc|smd|gen|bin|sav|srm|state|ss\d)$/i.test(entry.name),'ROM/save in release: '+file);if(/\.md$/i.test(entry.name)){const b=fs.readFileSync(file);assert.notEqual(b.subarray(256,260).toString(),'SEGA','MD ROM in release');}assert.ok(fs.statSync(file).size<100*1024*1024,'File exceeds GitHub limit: '+file);}}}
scan(root);for(const name of ['index.html']){const s=fs.readFileSync(path.join(root,name),'utf8');assert.ok(s.includes("connect-src 'self' blob:"));assert.ok(s.includes('Content-Security-Policy'));}
assert.ok(fs.existsSync(path.join(root,'sources/web-ui-source.zip')),'Run package_source.py');console.log('PASS: source hashes, release content, file sizes, source package and static CSP checks.');
const review=JSON.parse(fs.readFileSync(path.join(root,'RELEASE_REVIEW.json'),'utf8'));
assert.ok(Array.isArray(review.openItems),'Release review must list open items');
if(review.status!=='ready'||review.openItems.length||manifest.otherCores.correspondingSourceVerified!==true){
  console.error('NOT READY FOR PUBLICATION: license/source review is incomplete. See LICENSE_AUDIT.md.');
  for(const item of review.openItems)console.error(' - '+item.id+': '+item.detail);
  process.exitCode=1;
}else{
  // A status flip alone cannot clear an unresolved rights review.
  assert.equal(review.reviewedContentSha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'RELEASE_CONTENT.json'))).digest('hex'),'Approval must identify the exact reviewed inventory');
  for(const id of ['corresponding-source','nds-corresponding-source','alternate-corresponding-source','noncommercial-core-combination','asset-rights','bundled-skin-rights','source-archive-materials','external-artwork-policy','runtime-validation']){
    const e=review.resolutions?.find(item=>item.id===id);
    assert.ok(e?.evidenceFile&&e?.sha256,'Documented resolution required: '+id);
    const p=path.resolve(root,e.evidenceFile);assert.ok(p.startsWith(root+path.sep),'Evidence must be in the release');
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),e.sha256,'Changed review evidence: '+id);
  }
  for(const name of ['ci.yml','web-pages.yml','core-candidate.yml','upstream-watch.yml']){
    let file=path.join(root,'../.github/workflows',name);
    if(name==='web-pages.yml'&&!fs.existsSync(file))file=path.join(root,'../deployment',name);
    assert.ok(review.workflows?.[name],'Reviewed workflow required: '+name);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),review.workflows[name],'Workflow differs from review: '+name);
  }
}

for(const retired of ['vendor/emulatorjs','retro.html','sources/skins','sources/snes9x-source.tar.gz','sources/genesis_plus_gx-source.tar.gz','sources/retroarch-source.tar.gz'])assert.ok(!fs.existsSync(path.join(root,retired)),'Retired unapproved component: '+retired);
const build=JSON.parse(fs.readFileSync(path.join(root,'sources/build-evidence.json')));
for(const [name,hash] of Object.entries(build.archives))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'sources',name))).digest('hex'),hash,'Rebuild source changed: '+name);
for(const [core,files] of Object.entries(build.cores))for(const [ext,proof] of Object.entries(files)){const file=path.join(root,'cores',core,(core==='mgba'?'mgba':'core')+'.'+ext);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),proof.sha256);assert.equal(proof.rebuildMatches,true);}
const nds=JSON.parse(fs.readFileSync(path.join(root,manifest.nds.buildEvidence)));
assert.equal(nds.commit,manifest.nds.commit,'NDS revision does not match source manifest');
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'sources',nds.archive.path))).digest('hex'),nds.archive.sha256,'NDS source archive changed');
for(const ext of ['js','wasm']){
 const proof=nds.cores.nds[ext],file=path.join(root,'cores/nds/core.'+ext);
 assert.equal(proof.rebuildMatches,true,'NDS independent source rebuild is required');
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),proof.sha256,'NDS binary differs from reviewed rebuild');
}
const alternates=JSON.parse(fs.readFileSync(path.join(root,manifest.alternateCores.buildEvidence)));
for(const [name,core] of Object.entries(manifest.alternateCores.sources)){
 const proof=alternates.cores[name];assert.equal(proof.commit,core.commit,'Alternate revision changed: '+name);
 assert.equal(proof.rebuildMatches,true,'Alternate independent rebuild is required: '+name);
 for(const [file,expected] of Object.entries(proof.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'cores',name,file))).digest('hex'),expected,'Alternate binary changed: '+name+'/'+file);
 const archive=alternates.archives[core.archive];assert.ok(archive,'Missing alternate corresponding source');
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,core.archive))).digest('hex'),archive,'Alternate source archive changed');
}
// Credits/source links must work in the published tree, including nested pages.
for(const name of ['index.html','licenses.html','privacy.html','update.html','notices.html']){
 const html=fs.readFileSync(path.join(root,name),'utf8');
 for(const match of html.matchAll(/(?:href|src)="([^"#]+)(?:#[^"]*)?"/g)){
  const target=match[1];if(/^(?:https?:|data:|blob:|mailto:)/.test(target))continue;
  const file=path.resolve(root,target);assert.ok(file.startsWith(root+path.sep)&&fs.existsSync(file),'Broken local page/source link: '+target);
 }
}
if(!process.exitCode)console.log('PASS: reviewed release configuration, source-built cores, corresponding-source evidence and notices.');
