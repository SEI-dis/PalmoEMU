// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
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
 // The credential stays on a fixed API origin and redirects are refused.
 let request;const result=await githubJSON('/repos/owner/core',{token:'fixture-token',fetchImpl:async(url,options)=>{request={url,options};return new Response('{"default_branch":"main"}');}});
 assert.equal(result.default_branch,'main');assert.equal(request.url,'https://api.github.com/repos/owner/core');assert.equal(request.options.redirect,'error');
 await assert.rejects(githubJSON('https://attacker.invalid',{fetchImpl:()=>{throw Error('must not fetch');}}));
 await assert.rejects(githubJSON('/repos/owner/core',{fetchImpl:async()=>new Response('denied',{status:403})}),/403/);
 await assert.rejects(githubJSON('/repos/owner/core',{fetchImpl:async()=>new Response('x'.repeat(2*1024*1024+1))}),/too large/);
 const checkedIn=JSON.parse(fs.readFileSync(path.join(__dirname,'../scripts/upstream-sources.json'))),pins=require('../SOURCES.json');
 assert.equal(configuredSources(checkedIn,pins).length,13);assert.equal(checkedIn.converter.feed,null);
 const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/upstream-watch.yml'),'utf8');
 assert.match(workflow,/contents: read/);assert(!workflow.includes('pull_request_target'));assert(!workflow.includes('workflow run'));
 console.log('PASS upstream watch: pinned metadata, candidates/branches/errors, no converter feed, optional release feed, bounded API, credential isolation and report escaping.');
})().catch(error=>{console.error(error);process.exitCode=1;});
