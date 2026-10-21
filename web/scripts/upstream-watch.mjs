// SPDX-License-Identifier: AGPL-3.0-or-later
// Read upstream metadata only. Never download/build/run or adopt upstream code.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=value=>typeof value==='string'&&/^[0-9a-f]{40}$/.test(value);
const repository=value=>{
  const match=/^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(value||'');
  if(!match)throw Error('Unsupported repository URL');return match[1];
};
const string=value=>typeof value==='string'&&value.length>0&&value.length<=250&&!/[\x00-\x1f\x7f]/.test(value);
const md=value=>String(value??'').replace(/[\x00-\x1f\x7f]/g,' ').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\[\]\\`*_{}|]/g,'\\$&');
const segment=value=>encodeURIComponent(value).replace(/[!'()*]/g,character=>'%'+character.charCodeAt(0).toString(16).toUpperCase());

export async function githubJSON(apiPath,{token=process.env.GITHUB_TOKEN,fetchImpl=fetch}={}){
  if(typeof apiPath!=='string'||!apiPath.startsWith('/repos/')||/[\s\\?#]/.test(apiPath))throw Error('Invalid API path');
  const response=await fetchImpl('https://api.github.com'+apiPath,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{
    Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'PalmoEMU-upstream-review',...(token?{Authorization:'Bearer '+token}:{})
  }});
  if(!response.ok)throw Error(`GitHub API ${response.status}`);
  // Metadata is bounded; logs never include access tokens or upstream content.
  let size=0;const chunks=[];
  for await(const chunk of response.body){size+=chunk.byteLength;if(size>2*1024*1024)throw Error('Upstream metadata is too large');chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function configuredSources(config,sources){
  if(config?.schema!==1||!Array.isArray(config.sources)||!config.sources.length)throw Error('Invalid upstream source configuration');
  const ids=new Set();
  return config.sources.map(entry=>{
    if(!/^[a-z0-9-]+$/.test(entry.id)||ids.has(entry.id)||!string(entry.label)||!Array.isArray(entry.sourcePath)||entry.sourcePath.some(key=>!string(key)||['__proto__','prototype','constructor'].includes(key)))throw Error('Invalid upstream entry');
    ids.add(entry.id);const source=entry.sourcePath.reduce((value,key)=>value?.[key],sources);
    const repo=repository(source?.repository),baseline=source?.[entry.commitKey||'commit'];
    if(!sha(baseline)||entry.branch!==undefined&&!string(entry.branch))throw Error('Missing pinned source revision: '+entry.id);
    return {id:entry.id,label:entry.label,repository:repo,baseline,branch:entry.branch||null};
  });
}
export async function inspectUpstreams(config,sources,component,{github=githubJSON,now=()=>new Date().toISOString()}={}){
  const report={schema:1,checkedAt:now(),metadataOnly:true,automaticAdoption:false,items:[]};
  for(const entry of configuredSources(config,sources)){
    const item={...entry};report.items.push(item);
    try{
      const root='/repos/'+entry.repository;
      const branch=entry.branch||(await github(root)).default_branch;
      if(!string(branch))throw Error('Invalid default branch');item.branch=branch;
      const head=await github(root+'/commits/'+encodeURIComponent(branch));
      if(!sha(head.sha))throw Error('Invalid upstream revision');item.candidate=head.sha;
      item.compareURL='https://github.com/'+entry.repository+'/compare/'+entry.baseline+'...'+head.sha;
      if(head.sha===entry.baseline){item.status='current';continue;}
      const comparison=await github(root+'/compare/'+entry.baseline+'...'+head.sha);
      if(!['ahead','behind','diverged','identical'].includes(comparison.status))throw Error('Invalid upstream comparison');
      item.relationship=comparison.status;
      item.status=comparison.status==='ahead'?'candidate':comparison.status==='identical'?'current':'review';
      item.aheadBy=Number.isSafeInteger(comparison.ahead_by)?comparison.ahead_by:null;
      // File names are review hints, not proof of a complete license review.
      item.noticeFiles=(comparison.files||[]).filter(file=>typeof file.filename==='string'&&/(^|\/)(licen[cs]e|copying|copyright|notice|authors)(\.|\/|$)/i.test(file.filename)).slice(0,100).map(file=>file.filename);
      item.requires=['ライセンス・依存関係の差分確認','セーブ・ステート互換性と端末動作の検証','対応ソースと配布レビューの更新'];
      if(entry.id==='mgba64')item.candidateCommand=`gh workflow run core-candidate.yml -f commit=${head.sha}`;
    }catch(error){item.status='error';item.error=/^GitHub API \d{3}$/.test(error.message)?error.message:'更新情報を取得できませんでした。';}
  }
  const converter={id:'start-save-migrate',label:'START Save Migrate',baseline:component?.toolVersion,outputVersion:component?.outputVersion};
  if(!string(converter.baseline)||!string(converter.outputVersion))throw Error('Invalid converter metadata');
  report.items.push(converter);
  if(config.converter.feed===null){converter.status='manual';converter.note='作者からの提供ファイルを確認してください。公開の更新取得先は未登録です。';}
  else{
    try{
      const feed=config.converter.feed;
      if(feed?.kind!=='github-release'||!string(feed.adoptedTag))throw Error('Invalid converter feed');
      const repo=repository(feed.repository),release=await github('/repos/'+repo+'/releases/latest');
      if(!string(release.tag_name)||!Number.isSafeInteger(release.id)||release.id<1)throw Error('Invalid converter release');
      converter.status=release.tag_name===feed.adoptedTag?'current':'candidate';converter.candidate=release.tag_name;
      converter.releaseURL='https://github.com/'+repo+'/releases/tag/'+segment(release.tag_name);
      converter.requires=['配布・改変許可と作者表示の確認','候補パッケージの隔離検査','両セーブスロット・RTC・旧データ保全の回帰検証'];
    }catch(error){converter.status='error';converter.error=/^GitHub API \d{3}$/.test(error.message)?error.message:'変換ツールの更新情報を取得できませんでした。';}
  }
  report.summary={candidates:report.items.filter(item=>['candidate','review'].includes(item.status)).length,errors:report.items.filter(item=>item.status==='error').length,manual:report.items.filter(item=>item.status==='manual').length};
  return report;
}
export function reportMarkdown(report){
  const names={current:'採用版と一致',candidate:'更新候補あり',review:'履歴の分岐・巻き戻りを要確認',error:'取得失敗',manual:'提供ファイルを手動確認'};
  const lines=['# 上流更新の確認','',`確認日時: ${md(report.checkedAt)}`,'','これは更新候補の検出です。コア・変換ツールの実行、入れ替え、公開は行っていません。','','| 対象 | 結果 | 採用版 → 候補 |','| --- | --- | --- |'];
  for(const item of report.items){
    const label=md(item.label),url=item.compareURL||item.releaseURL;
    lines.push(`| ${url?'['+label+']('+url+')':label} | ${names[item.status]} | ${md(item.baseline)}${item.candidate?' → '+md(item.candidate):''} |`);
  }
  for(const item of report.items.filter(item=>item.status!=='current')){
    lines.push('','## '+md(item.label),'');
    if(item.note||item.error)lines.push(md(item.note||item.error));
    if(item.noticeFiles?.length)lines.push('ライセンス関連の変更候補: '+item.noticeFiles.map(md).join(', '));
    if(item.requires)lines.push(...item.requires.map(value=>'- '+md(value)));
    if(item.candidateCommand)lines.push('','ソースの安全性を確認した後、次の手動ワークフローで別候補をビルドできます。','','```sh',item.candidateCommand,'```');
  }
  return lines.join('\n')+'\n';
}
export async function main(){
  if(process.argv.length>2)throw Error('This read-only checker takes no arguments');
  const config=JSON.parse(await fs.readFile(path.join(web,'scripts/upstream-sources.json'),'utf8'));
  if(config.converter.metadata!=='vendor/start-save-migrate/component.json')throw Error('Unexpected converter metadata path');
  const sources=JSON.parse(await fs.readFile(path.join(web,'SOURCES.json'),'utf8')),component=JSON.parse(await fs.readFile(path.join(web,config.converter.metadata),'utf8'));
  const report=await inspectUpstreams(config,sources,component),markdown=reportMarkdown(report);
  const output=path.join(web,'../work/upstream-review');await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await fs.writeFile(path.join(output,'report.md'),markdown);
  const mgba=report.items.find(item=>item.id==='mgba64');
  if(process.env.GITHUB_OUTPUT&&mgba?.status==='candidate'&&sha(mgba.candidate))await fs.appendFile(process.env.GITHUB_OUTPUT,`mgba_commit=${mgba.candidate}\n`);
  if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,markdown);
  console.log(`Upstream review: ${report.summary.candidates} candidate(s), ${report.summary.errors} fetch error(s), ${report.summary.manual} manual source(s).`);
  if(report.summary.errors)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(()=>{console.error('Upstream review failed; inspect the trusted source configuration.');process.exitCode=1;});
