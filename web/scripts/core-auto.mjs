// SPDX-License-Identifier: AGPL-3.0-or-later
// Runs only in clean, credential-bearing promotion jobs. Never execute candidate
// build scripts here. GITHUB_TOKEN pushes are followed by explicit dispatches.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const allowedFiles = new Set([
  'web/cores/mgba/mgba.js','web/cores/mgba/mgba.wasm',
  'web/sources/mgba-celio-rom64-source.tar.gz','web/sources/mgba-update-review.json',
  'web/sources/build-evidence.json','web/SOURCES.json','web/index.html','web/sw.js',
  'web/offline-manifest.js','web/RELEASE_CONTENT.json','web/RELEASE_REVIEW.json'
]);
export function validateUpdate(report, {base, upstream} = {}) {
  if(report?.status!=='verified'||report.adoption?.automatic!==true||
     report.adoption?.policy!=='preserve-local-patches-and-compatible-saves-v1'||
     !/^[a-f0-9]{40}$/.test(report.candidateCommit)||
     !/^[a-f0-9]{40}$/.test(report.adoption.baseCommit)||
     base&&report.adoption.baseCommit!==base||upstream&&report.candidateCommit!==upstream)
    throw Error('Invalid core adoption identity');
  const required=['local-patches','license-policy','build','corresponding-source','synthetic-core',
    'upgrade-compatibility','mgba-memory','mgba-logging','mgba-allocation',
    'mgba-save-completion','mgba-peripherals','gb-link-core'];
  if(required.some(key=>report.checks?.[key]!==true)||Object.values(report.checks).some(value=>value!==true))
    throw Error('Core adoption checks are incomplete');
  return report;
}
export function validateChanges(names) {
  if(!names.length||names.some(name=>!allowedFiles.has(name)))throw Error('Unexpected candidate changes');
}

async function main(mode) {
  const {GITHUB_REPOSITORY:repo,GITHUB_SHA:sha,GITHUB_REF_NAME:ref,GITHUB_RUN_ID:runID,GH_TOKEN:token}=process.env;
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo||'')||!/^\d+$/.test(runID||'')||!token||!/^[a-f0-9]{40}$/.test(sha||''))throw Error('Expected a trusted Actions context');
  const api=async(route,body)=>{
    const response=await fetch(`https://api.github.com/repos/${repo}/${route}`,{method:body?'POST':'GET',redirect:'error',
      headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error(`GitHub API failed (${response.status})`);
    return response.status===204?null:response.json();
  };
  const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const push=(target)=>{
    const auth=Buffer.from(`x-access-token:${token}`).toString('base64');
    // Never put the credential in command arguments, stored remotes or logs.
    execFileSync('git',['push','origin',`HEAD:refs/heads/${target}`],{stdio:['ignore','pipe','pipe'],env:{...process.env,
      GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'http.https://github.com/.extraheader',GIT_CONFIG_VALUE_0:`AUTHORIZATION: basic ${auth}`}});
  };
  const mainHead=(await api('git/ref/heads/main')).object.sha;
  if(mode==='candidate') {
    if(ref!=='main'||mainHead!==sha)throw Error('Main changed during the build; rerun against its new head');
    const report=validateUpdate(JSON.parse(fs.readFileSync('web/sources/mgba-update-review.json','utf8')),{base:sha});
    validateChanges(git('diff','--name-only').split('\n').filter(Boolean));
    const branch=`codex/core-update-${report.candidateCommit.slice(0,12)}-${runID}`;
    git('config','user.name','github-actions[bot]');git('config','user.email','41898282+github-actions[bot]@users.noreply.github.com');
    git('add','--',...allowedFiles);
    git('commit','-m',`Update mGBA core to ${report.candidateCommit} [core-auto]`);
    push(branch);
    await api('actions/workflows/ci.yml/dispatches',{ref:branch,inputs:{core_update:'true'}});
    console.log(`Candidate ${git('rev-parse','HEAD')} sent to full CI on ${branch}. Main remains unchanged.`);
  } else if(mode==='promote') {
    if(!/^codex\/core-update-[a-f0-9]{12}-\d+$/.test(ref))throw Error('Not an automatic candidate branch');
    git('fetch','origin',`refs/heads/${ref}`);
    if(git('rev-parse','FETCH_HEAD')!==sha)throw Error('Candidate changed after validation');
    const report=validateUpdate(JSON.parse(git('show',`${sha}:web/sources/mgba-update-review.json`)),{base:mainHead});
    if(git('show','-s','--format=%P',sha)!==mainHead||
       git('show','-s','--format=%s',sha)!==`Update mGBA core to ${report.candidateCommit} [core-auto]`||
       git('show','-s','--format=%ae',sha)!=='41898282+github-actions[bot]@users.noreply.github.com')throw Error('Unexpected candidate history');
    validateChanges(git('diff','--name-only',mainHead,sha).split('\n').filter(Boolean));
    git('merge','--ff-only',sha);
    push('main'); // A concurrent main change fails; no force push or rebasing.
    await api('actions/workflows/web-pages.yml/dispatches',{ref:'main',inputs:{validation_run:runID}});
    console.log(`Adopted validated core ${report.candidateCommit}; publication dispatched for ${sha}.`);
  } else throw Error('Unknown automation operation');
}
if(process.argv[1]===fileURLToPath(import.meta.url))main(process.argv[2]).catch(error=>{
  // child_process errors may contain environment/command details; keep tokens private.
  console.error(error.status!==undefined?'Git operation failed; no forced update was attempted.':error.message);process.exitCode=1;
});
