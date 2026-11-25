// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
(async()=>{
 const {configuredSources,inspectUpstreams,reportMarkdown,githubJSON}=await import('../scripts/upstream-watch.mjs');
 const old='a'.repeat(40),next='b'.repeat(40),component={toolVersion:'1.0.5',outputVersion:'0.42.3'};
 const sources={core:{repository:'https://github.com/owner/core',commit:old}};
 const config={schema:1,sources:[{id:'mgba64',label:'Core',sourcePath:['core'],branch:'rom64'}],converter:{feed:null}};
 const fixture=async({sha=next,status='ahead',error=false,release='v1.0.6'}={})=>{
  const calls=[];const report=await inspectUpstreams(config,sources,component,{now:()=> '2026-10-14T00:00:00.000Z',github:async url=>{
   calls.push(url);if(error)throw Error('GitHub API 403');
   if(url.endsWith('/releases/latest'))return {tag_name:release,id:123};
   if(url.includes('/commits/'))return {sha};
   if(url.includes('/compare/'))return {status,ahead_by:2,files:[{filename:'LICENSE'},{filename:'src/main.c'},{filename:'deps/NOTICE.md'}]};
   return {default_branch:'main'};
  }});return {report,calls};
 };
 const candidate=await fixture();assert.equal(candidate.report.items[0].status,'candidate');assert.equal(candidate.report.items[1].status,'manual');
 assert.equal(candidate.report.metadataOnly,true);assert.equal(candidate.report.automaticAdoption,false);
 assert.equal(candidate.report.summary.candidates,1);assert.deepEqual(candidate.report.items[0].noticeFiles,['LICENSE','deps/NOTICE.md']);
 assert.equal(candidate.report.items[0].candidateCommand,`gh workflow run core-candidate.yml -f commit=${next}`);
 assert(candidate.calls.every(url=>url.startsWith('/repos/owner/core/')));
 const current=await fixture({sha:old});assert.equal(current.report.items[0].status,'current');assert.equal(current.calls.length,1,'No comparison request for identical revisions');
 for(const status of ['behind','diverged'])assert.equal((await fixture({status})).report.items[0].status,'review');
 const failure=(await fixture({error:true})).report;assert.equal(failure.items[0].status,'error');assert.equal(failure.summary.errors,1);
 assert.equal((await fixture({sha:'not-a-commit'})).report.items[0].status,'error');
 assert.match(reportMarkdown(failure),/取得失敗/);assert.match(reportMarkdown(candidate.report),/公開の更新取得先は未登録/);
 const injection=structuredClone(candidate.report);injection.items[0].label='<script>|[oops](bad)';assert(!reportMarkdown(injection).includes('<script>'));
 delete config.sources[0].branch;const defaultBranch=await fixture();assert.equal(defaultBranch.report.items[0].branch,'main');
 config.converter.feed={kind:'github-release',repository:'https://github.com/owner/converter',adoptedTag:'v1.0.5'};
 assert.equal((await fixture()).report.items[1].status,'candidate');assert.equal((await fixture({release:'v1.0.5'})).report.items[1].status,'current');
 const unusual=(await fixture({release:'v1.0.6)(unsafe)'})).report.items[1];assert(!unusual.releaseURL.includes('('));assert(!unusual.releaseURL.includes(')'));
 config.converter.feed.repository='https://attacker.invalid/tool';assert.equal((await fixture()).report.items[1].status,'error');
 const broken=structuredClone(config);broken.sources.push(broken.sources[0]);assert.throws(()=>configuredSources(broken,sources));
 assert.throws(()=>configuredSources(config,{core:{...sources.core,commit:'main'}}));
 assert.throws(()=>configuredSources(config,{core:{...sources.core,repository:'https://github.com.evil.invalid/owner/core'}}));
 // Follow the exact same branch as the core builder, including future reviewed
 // branch changes. A missing/mismatched config must not silently use main.
 const buildPath='sources/mgba-web-port/upstream.json',derived=structuredClone(config);
 derived.converter.feed=null;derived.sources[0].buildConfig=buildPath;
 const build={schema:1,repository:'https://github.com/owner/core.git',branch:'rom128'};
 assert.throws(()=>configuredSources(derived,sources),/Mismatched build configuration/);
 for(const branch of ['rom128','future-reviewed-branch']){
  const calls=[],report=await inspectUpstreams(derived,sources,component,{buildConfigs:{[buildPath]:{...build,branch}},github:async url=>{
   calls.push(url);assert.equal(url,'/repos/owner/core/commits/'+branch);return {sha:old};
  }});
  assert.equal(report.items[0].branch,branch);assert.equal(report.items[0].status,'current');assert.equal(calls.length,1);
 }
 for(const invalid of [{...build,branch:''},{...build,branch:null},{...build,schema:2},{...build,repository:'https://github.com/another/core'}])
  assert.throws(()=>configuredSources(derived,sources,{[buildPath]:invalid}));
 const duplicated=structuredClone(derived);duplicated.sources[0].branch='rom64';
 assert.throws(()=>configuredSources(duplicated,sources,{[buildPath]:build}),/Invalid build configuration reference/);
 const unexpected=structuredClone(derived);unexpected.sources[0].buildConfig='../untrusted.json';
 assert.throws(()=>configuredSources(unexpected,sources,{[buildPath]:build}),/Invalid build configuration reference/);
 // A reviewed no-change pair prevents the same desktop-only candidate from
 // being rebuilt every day, without relaxing the builder's safety policy.
 const reviewed=structuredClone(derived),review={repository:'owner/core',branch:'rom128',baseline:old,candidate:next,reviewedOn:'2026-11-25',reason:'Desktop-only changes; Web runtime unchanged.',evidence:'UPSTREAM_REVIEW.md#review-2026-11-25'};
 reviewed.sources[0].reviewedUnchanged=review;
 const reviewFixture=async({head=next,baseline=old,branch='rom128',status='ahead',error=false}={})=>inspectUpstreams(reviewed,{core:{...sources.core,commit:baseline}},component,{buildConfigs:{[buildPath]:{...build,branch}},github:async url=>{
  if(error)throw Error('GitHub API 503');
  if(url.includes('/commits/'))return {sha:head};
  assert(url.includes('/compare/'));return {status,ahead_by:6,files:[]};
 }});
 const noChange=await reviewFixture();assert.equal(noChange.items[0].status,'reviewed');assert.equal(noChange.summary.candidates,0);
 assert.equal(noChange.items[0].candidateCommand,undefined);assert.equal(noChange.items[0].baseline,old);assert.equal(noChange.items[0].candidate,next);
 assert.match(reportMarkdown(noChange),/確認済み・Web版の変更不要/);assert.equal(noChange.items[0].reviewEvidence,review.evidence);assert(reportMarkdown(noChange).includes('UPSTREAM\\_REVIEW.md#review-2026-11-25'));
 for(const options of [{head:'c'.repeat(40)},{baseline:'d'.repeat(40)},{branch:'new-branch'}])assert.equal((await reviewFixture(options)).items[0].status,'candidate','Reviews cannot cover another head, baseline or branch');
 for(const status of ['behind','diverged'])assert.equal((await reviewFixture({status})).items[0].status,'review');
 assert.equal((await reviewFixture({error:true})).items[0].status,'error');assert.equal((await reviewFixture({status:'unknown'})).items[0].status,'error');
 for(const invalid of [null,{}, {...review,repository:'other/core'}, {...review,baseline:'main'}, {...review,candidate:old}, {...review,branch:''}, {...review,reason:''}, {...review,evidence:'https://other.invalid'}, {...review,reviewedOn:null}]){
  const bad=structuredClone(reviewed);bad.sources[0].reviewedUnchanged=invalid;assert.throws(()=>configuredSources(bad,sources,{[buildPath]:build}),/Invalid reviewed upstream range/);
 }
 // Exercise the actual CLI/main output gate, not only inspectUpstreams(). Each
 // child has its own source/config/work tree and fetch never reaches a network.
 const tempParent=fs.realpathSync(os.tmpdir()),scratch=fs.mkdtempSync(path.join(tempParent,'palmo-upstream-watch-'));
 try{
  const cliSource=fs.readFileSync(path.join(__dirname,'../scripts/upstream-watch.mjs'),'utf8');
  for(const scenario of [
   {name:'reviewed',head:next,status:'reviewed',exit:0,output:''},
   {name:'new-head',head:'c'.repeat(40),status:'candidate',exit:0,output:'mgba_commit='+'c'.repeat(40)+'\n'},
   {name:'fetch-failure',head:next,status:'error',exit:1,output:''}
  ]){
   const directory=path.join(scratch,scenario.name),web=path.join(directory,'web');
   const write=(relative,data)=>{const file=path.join(directory,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);return file;};
   const json=(relative,data)=>write(relative,JSON.stringify(data));
   const cliConfig=structuredClone(reviewed);cliConfig.converter.metadata='vendor/start-save-migrate/component.json';
   const script=write('web/scripts/upstream-watch.mjs',cliSource);
   json('web/scripts/upstream-sources.json',cliConfig);json('web/SOURCES.json',sources);
   json('web/'+buildPath,build);json('web/vendor/start-save-migrate/component.json',component);
   const preload=write('fixture-fetch.mjs',`
    globalThis.fetch=async (url,options)=>{
     if(options.redirect!=='error')throw Error('Redirect policy changed');
     if(url==='https://api.github.com/repos/owner/core/commits/rom128')return new Response(JSON.stringify({sha:${JSON.stringify(scenario.head)}}));
     if(url===${JSON.stringify('https://api.github.com/repos/owner/core/compare/'+old+'...'+scenario.head)})return ${scenario.name==='fetch-failure'?'new Response("Unavailable",{status:503})':'new Response(JSON.stringify({status:"ahead",ahead_by:6,files:[]}))'};
     throw Error('Unexpected fixture URL; network access is disabled');
    };
   `);
   const output=path.join(directory,'github-output.txt'),summary=path.join(directory,'github-summary.md');
   const result=spawnSync(process.execPath,['--import',pathToFileURL(preload).href,script],{cwd:directory,encoding:'utf8',timeout:15000,windowsHide:true,
    env:{...process.env,GITHUB_TOKEN:'fixture-token',GITHUB_OUTPUT:output,GITHUB_STEP_SUMMARY:summary}});
   assert.ifError(result.error);assert.equal(result.status,scenario.exit,scenario.name+' CLI exit: '+result.stdout+result.stderr);
   assert.equal(fs.existsSync(output)?fs.readFileSync(output,'utf8'):'',scenario.output,scenario.name+' controls the scheduled candidate output');
   const report=JSON.parse(fs.readFileSync(path.join(directory,'work/upstream-review/report.json'),'utf8'));
   assert.equal(report.items[0].status,scenario.status);assert.equal(report.items[0].baseline,old);assert.equal(report.items[0].candidate,scenario.head);
   assert.equal(report.summary.errors,scenario.exit);assert.equal(report.summary.candidates,scenario.status==='candidate'?1:0);
   if(scenario.status==='error')assert.equal(report.items[0].error,'GitHub API 503');
   assert.equal(fs.readFileSync(summary,'utf8'),fs.readFileSync(path.join(directory,'work/upstream-review/report.md'),'utf8'),'CLI summary and isolated report agree');
   assert.equal(JSON.parse(fs.readFileSync(path.join(web,'SOURCES.json'),'utf8')).core.commit,old,'CLI must not adopt a candidate');
  }
 }finally{
  // Delete only the newly created test directory under the resolved temp root.
  assert.equal(path.dirname(scratch),tempParent);assert(path.basename(scratch).startsWith('palmo-upstream-watch-'));
  fs.rmSync(scratch,{recursive:true,force:true});
 }
 // The credential stays on a fixed API origin and redirects are refused.
 let request;const result=await githubJSON('/repos/owner/core',{token:'fixture-token',fetchImpl:async(url,options)=>{request={url,options};return new Response('{"default_branch":"main"}');}});
 assert.equal(result.default_branch,'main');assert.equal(request.url,'https://api.github.com/repos/owner/core');assert.equal(request.options.redirect,'error');
 await assert.rejects(githubJSON('https://attacker.invalid',{fetchImpl:()=>{throw Error('must not fetch');}}));
 await assert.rejects(githubJSON('/repos/owner/core',{fetchImpl:async()=>new Response('denied',{status:403})}),/403/);
 await assert.rejects(githubJSON('/repos/owner/core',{fetchImpl:async()=>new Response('x'.repeat(2*1024*1024+1))}),/too large/);
 const checkedIn=JSON.parse(fs.readFileSync(path.join(__dirname,'../scripts/upstream-sources.json'))),pins=require('../SOURCES.json');
 const checkedInBuild=JSON.parse(fs.readFileSync(path.join(__dirname,'..',buildPath))),resolved=configuredSources(checkedIn,pins,{[buildPath]:checkedInBuild});
 assert.equal(resolved.length,13);assert.equal(checkedIn.converter.feed,null);
 const mgbaEntry=checkedIn.sources.find(entry=>entry.id==='mgba64'),mgba=resolved.find(entry=>entry.id==='mgba64');
 assert.equal(mgbaEntry.buildConfig,buildPath);assert.equal(mgbaEntry.branch,undefined);
 assert.equal(mgba.branch,checkedInBuild.branch);assert.equal(mgba.baseline,pins.mgba.sourceCommit);
 assert.equal(mgba.repository,checkedInBuild.repository.replace(/^https:\/\/github\.com\//,'').replace(/\.git$/,''));
 const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/upstream-watch.yml'),'utf8');
 assert.match(workflow,/contents: read/);assert(!workflow.includes('pull_request_target'));assert(!workflow.includes('workflow run'));
 console.log('PASS upstream watch: isolated CLI output gates, exact reviewed no-change pairs, new-head/baseline/branch rejection, shared build branch, pinned metadata, candidates/errors, optional release feed, bounded API, credential isolation and report escaping.');
})().catch(error=>{console.error(error);process.exitCode=1;});
