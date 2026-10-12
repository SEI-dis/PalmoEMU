// SPDX-License-Identifier: AGPL-3.0-or-later
// Render reviewed bilingual notes at build time: no network or Markdown runtime.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function buildReleaseNotes(root,{check=false}={}){
 const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
 const {releases}=JSON.parse(fs.readFileSync(path.join(root,'release-notes.json'),'utf8'));
 assert.ok(Array.isArray(releases)&&releases.length,'Release notes are required');
 assert.equal(releases[0].version,version,'Add bilingual release notes for the current package version');
 const seen=new Set();let previous=null;
 for(const entry of releases){
  assert.match(entry.version,/^\d+\.\d+\.\d+$/);assert.ok(!seen.has(entry.version),'Duplicate release');seen.add(entry.version);
  assert.match(entry.date,/^\d{4}-\d{2}-\d{2}$/);assert.equal(new Date(entry.date).toISOString().slice(0,10),entry.date);
  assert.ok(Array.isArray(entry.changes)&&entry.changes.length&&entry.changes.every(text=>typeof text==='string'&&text.trim()),'Nonempty release changes required');
  assert.ok(Array.isArray(entry.changesEn)&&entry.changesEn.length===entry.changes.length&&entry.changesEn.every(text=>typeof text==='string'&&text.trim()),'Matching English release notes are required');
  if(previous){
   const a=previous.version.split('.').map(Number),b=entry.version.split('.').map(Number),index=a.findIndex((n,i)=>n!==b[i]);
   assert.ok(index>=0&&a[index]>b[index],'Release versions must be newest first');assert.ok(previous.date>=entry.date,'Release dates must be newest first');
  }
  previous=entry;
 }
 const esc=text=>text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const date=entry=>{const [y,m,d]=entry.date.split('-').map(Number);return `<time datetime="${entry.date}">${y}年${m}月${d}日</time>`;};
 const list=entry=>`<ul>${entry.changes.map((text,i)=>`<li data-i18n-en="${esc(entry.changesEn[i])}">${esc(text)}</li>`).join('')}</ul>`;
 const latest=releases[0];
 const fragments=[
  ['licenses.html','latest-release',`<section class="latest-release" aria-labelledby="latest-release-title">\n<h2 id="latest-release-title" data-i18n-en="Latest update · ${latest.version}">最新の更新 · ${latest.version}</h2>\n<p>${date(latest)}</p>\n${list(latest)}\n<p><a href="notices.html">これまでの更新・詳しい変更内容</a></p>\n</section>`],
  ['notices.html','release-history',releases.map(entry=>`<article class="release-entry" aria-labelledby="v${entry.version.replaceAll('.','-')}">\n<header><h3 id="v${entry.version.replaceAll('.','-')}">${entry.version}</h3>${date(entry)}</header>\n${list(entry)}\n</article>`).join('\n')]
 ];
 for(const [name,key,fragment]of fragments){
  const file=path.join(root,name),source=fs.readFileSync(file,'utf8'),newline=source.includes('\r\n')?'\r\n':'\n';
  const start=`<!-- ${key}:start -->`,end=`<!-- ${key}:end -->`;
  assert.equal(source.split(start).length,2,'Unique start marker required: '+name);assert.equal(source.split(end).length,2,'Unique end marker required: '+name);
  const from=source.indexOf(start)+start.length,to=source.indexOf(end);assert.ok(to>=from);
  const output=source.slice(0,from)+newline+fragment.replaceAll('\n',newline)+newline+source.slice(to);
  if(check)assert.equal(source,output,'Release notes are stale: '+name);else if(source!==output)fs.writeFileSync(file,output);
 }
}
module.exports={buildReleaseNotes};
if(require.main===module){buildReleaseNotes(path.resolve(__dirname,'..'),{check:process.argv.includes('--check')});console.log('Bilingual release notes match the app version.');}
