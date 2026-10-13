// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic authored text only. No user's files or real model needed in CI.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
(async()=>{
 const {pathToFileURL}=require('node:url');
 const {createPlan,assertCurrent,synchronize,targets,hash,readCatalogue,validateText}=await import(pathToFileURL(path.join(__dirname,'../scripts/i18n/catalogues.mjs')));
 const {scanSources}=await import(pathToFileURL(path.join(__dirname,'../scripts/i18n/extract.mjs')));
 const {translateSource}=await import(pathToFileURL(path.join(__dirname,'../src/i18n/format.js')));
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'palmo-i18n-'));
 const write=(file,text)=>{const p=path.join(root,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);};
 const read=file=>fs.readFileSync(path.join(root,file),'utf8');
 const json=(file,data)=>write(file,JSON.stringify(data));
 const catalogue=(code,data)=>write('src/i18n/locales/'+code+'.js','export default '+JSON.stringify(data)+';');
 const snapshot=()=>JSON.stringify(targets.map(({code})=>read('src/i18n/locales/'+code+'.js')).concat(read('release-notes.json'),read('scripts/i18n/state.json')));
 try{
  write('src/app.js',"import {tr} from './i18n.js';const text=tr('保存');");json('scripts/i18n/exclusions.json',[]);
  for(const {code}of targets)catalogue(code,{'保存':code+' approved save'});
  json('release-notes.json',{releases:[{version:'1.0.0',date:'2026-10-13',changes:['以前の更新'],changesEn:['Previous change'],translations:Object.fromEntries(targets.filter(x=>x.code!=='en').map(({code})=>[code,[code+' previous']]))}]});
  json('scripts/i18n/state.json',{schema:1,messages:{'保存':hash('保存')},releases:{'1.0.0':hash(JSON.stringify(['以前の更新']))}});
  let calls=0;const fake=async(code,sources)=>{calls++;return sources.map(source=>code+' translated '+(source.match(/⟪\d+⟫/g)||[]).join(' '));};
  const before=snapshot();assertCurrent(createPlan(root));assert.equal(await synchronize(createPlan(root),fake),0);assert.equal(calls,0);assert.equal(snapshot(),before,'Unchanged reviewed text stays byte-identical');
  write('src/app.js',"import {tr} from './i18n.js';const text=tr('保存');const label=tr`新しい機能 ${name} ${2}`;");
  let plan=createPlan(root);assert.equal(plan.jobs.length,8);assert.throws(()=>assertCurrent(plan),/missing or stale/);await synchronize(plan,fake);assertCurrent(createPlan(root));
  for(const {code}of targets){const c=readCatalogue(path.join(root,'src/i18n/locales/'+code+'.js'));assert.equal(c['保存'],code+' approved save');assert.match(c['新しい機能 ⟪0⟫ ⟪1⟫'],/⟪0⟫ ⟪1⟫/);}
  let notes=JSON.parse(read('release-notes.json'));notes.releases.unshift({version:'1.1.0',date:'2026-10-13',changes:['新しい更新']});json('release-notes.json',notes);
  assert.equal(createPlan(root).jobs.filter(j=>j.kind==='release').length,8);await synchronize(createPlan(root),fake);assertCurrent(createPlan(root));
  notes=JSON.parse(read('release-notes.json'));notes.releases[0].changes[0]='書き直した更新';json('release-notes.json',notes);assert.equal(createPlan(root).jobs.length,8,'Same-version edits invalidate every language');await synchronize(createPlan(root),fake);
  notes=JSON.parse(read('release-notes.json'));notes.releases[0].changes.push('さらに追加');json('release-notes.json',notes);await synchronize(createPlan(root),fake);notes=JSON.parse(read('release-notes.json'));notes.releases[0].changes.shift();json('release-notes.json',notes);await synchronize(createPlan(root),fake);assert.equal(JSON.parse(read('release-notes.json')).releases[0].changesEn.length,1,'Removing/reordering Japanese lines cannot retain stale translated lines');
  let fr=readCatalogue(path.join(root,'src/i18n/locales/fr.js'));delete fr['保存'];catalogue('fr',fr);assert.equal(createPlan(root).jobs.length,1);await synchronize(createPlan(root),fake);
  fr=readCatalogue(path.join(root,'src/i18n/locales/fr.js'));fr['保存']='保存';catalogue('fr',fr);assert.equal(createPlan(root).jobs.length,1,'Copied Japanese is not a French translation');await synchronize(createPlan(root),fake);
  const validJS=read('src/app.js');
  for(const source of ["const b='未登録のボタン';", "button.textContent='Save new game';", 'button.innerHTML=`<button>Unregistered action</button>`;', "const b=tr('英語 '+name);", "const b=tr('Save new game');", 'const b=tr`状態 ${"未登録の中身"}`;']){
   write('src/app.js',validJS+source);assert.throws(()=>createPlan(root),/src\/app.js:/,'Unwrapped/dynamic text is rejected: '+source);
  }
  write('src/app.js',validJS+"// コメント内の日本語は翻訳しません\nconst r=/日本語/;const x='\\u672a\\u767b\\u9332';");assert.throws(()=>createPlan(root),/未登録/,'Unicode escapes are inspected as text');
  write('src/app.js',validJS+"// コメント内の日本語\nconst r=/日本語/;");assertCurrent(createPlan(root));
  for(const source of ["button.setAttribute('aria-label','Start a game');",'button.textContent=`Start ${game}`;']){write('src/app.js',validJS+source);assert.throws(()=>createPlan(root),/Unregistered literal UI/);}
  write('src/app.js',validJS);
  write('page.html',`<p title='設定 &gt; 詳細'>新しい &amp; 案内</p><code>原文</code><span translate="no">作者名</span><time datetime="2026-10-13">2026年10月13日</time><li data-i18n='{}'>生成済み</li>`);
  let scan=scanSources(root);assert.ok(scan.messages.has('設定 > 詳細'));assert.ok(scan.messages.has('新しい & 案内'));assert.ok(!scan.messages.has('原文')&&!scan.messages.has('作者名')&&!scan.messages.has('2026年10月13日'));
  fs.unlinkSync(path.join(root,'page.html'));
  write('style.css',"/* 日本語のコメント */ .x::after{content:'新しい文言'}");assert.throws(()=>createPlan(root),/style.css:/);fs.unlinkSync(path.join(root,'style.css'));
  write('src/labels.json',JSON.stringify({label:'未登録の設定'}));assert.throws(()=>createPlan(root),/labels.json:/);fs.unlinkSync(path.join(root,'src/labels.json'));
  write('src/app.js',validJS+"const fail=tr('保存に失敗 ⟪0⟫');");let unchanged=snapshot();
  await assert.rejects(()=>synchronize(createPlan(root),async()=>{throw Error('Unavailable');}),/no files were changed/);assert.equal(snapshot(),unchanged);
  await assert.rejects(()=>synchronize(createPlan(root),async()=>['Missing slot']),/placeholders/);assert.equal(snapshot(),unchanged);
  await assert.rejects(()=>synchronize(createPlan(root),async()=>['<script>bad</script>⟪0⟫']),/Unexpected HTML/);assert.equal(snapshot(),unchanged);
  let edit=true;await assert.rejects(()=>synchronize(createPlan(root),async(code,sources)=>{if(edit){edit=false;write('src/app.js',read('src/app.js')+'\n// concurrent edit');}return fake(code,sources);}),/changed during generation/);assert.equal(snapshot(),unchanged);
  write('src/app.js',validJS);assertCurrent(createPlan(root));
  write('src/i18n/locales/fr.js','globalThis.executed=true;export default {};');assert.throws(()=>readCatalogue(path.join(root,'src/i18n/locales/fr.js')),/plain exported/);assert.equal(globalThis.executed,undefined,'Catalogue source is parsed, never executed');
  assert.equal(translateSource(`<span title='設定 > 詳細'>保存</span>`,{'設定 > 詳細':'Settings > More','保存':'Save'}),`<span title='Settings &gt; More'>Save</span>`);
  assert.throws(()=>validateText('MPL-2.0 と 6 MiB','MPL-2.0 and 6 MB'),/MiB/);
  assert.throws(()=>validateText('保存しました','保存しました','en'),/Untranslated/);
  await verifyProviderAndWatcher(root);
  console.log('PASS: extraction, new UI/all-language generation, same-version notes edits, removals/reordering, missing locales, manual translation preservation, escaped/unwrapped/dynamic text, HTML/CSS/JSON, nonexecuting catalogues, failure atomicity and concurrent-edit protection.');
 }finally{
  const resolved=path.resolve(root);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('palmo-i18n-'));fs.rmSync(resolved,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});

async function verifyProviderAndWatcher(parent){
 const {pathToFileURL}=require('node:url'),{spawn}=require('node:child_process'),http=require('node:http');
 const source=path.resolve(__dirname,'..'),root=path.join(parent,'watch'),config=JSON.parse(fs.readFileSync(path.join(source,'scripts/i18n/translator.json')));
 const {createTranslator}=await import(pathToFileURL(path.join(source,'scripts/i18n/translator.mjs')));
 const {targets,hash}=await import(pathToFileURL(path.join(source,'scripts/i18n/catalogues.mjs')));
 let mode='valid',requests=[],child,output='';
 const server=http.createServer(async(req,res)=>{
  let body='';for await(const data of req)body+=data;requests.push([req.url,body]);
  res.setHeader('Content-Type','application/json');
  if(req.url==='/api/version')return res.end(JSON.stringify({version:'test'}));
  if(req.url==='/api/tags')return res.end(JSON.stringify({models:[{name:config.model,digest:mode==='wrong-model'?'wrong':config.digest}]}));
  if(req.url==='/api/chat'){
   const data=JSON.parse(body);assert.equal(data.stream,false);assert.equal(data.think,false);
   const values=JSON.parse(data.messages[1].content);
   if(mode==='redirect'){res.writeHead(302,{Location:'https://example.invalid/'});res.end();return;}
   const result=Object.fromEntries(Object.entries(values).map(([id,text])=>[id,'Translated '+(text.match(/\{\d+\}/g)||[]).join(' ')]));
   if(mode==='wrong-ids')result.extra='unexpected';
   return res.end(JSON.stringify({done:mode!=='incomplete',message:{content:JSON.stringify(result)}}));
  }res.writeHead(404).end('{}');
 });
 const previous=process.env.PALMO_TRANSLATOR_URL;
 const wait=async(test,label)=>{for(let n=0;n<300;n++){if(await test())return;await new Promise(r=>setTimeout(r,100));}throw Error(label+' timed out: '+output);};
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  process.env.PALMO_TRANSLATOR_URL='https://example.invalid';await assert.rejects(createTranslator,/loopback/);assert.equal(requests.length,0);
  process.env.PALMO_TRANSLATOR_URL='http://127.0.0.1:'+server.address().port;
  mode='wrong-model';await assert.rejects(createTranslator,/model changed/);
  mode='valid';const provider=await createTranslator();assert.deepEqual(await provider.translate('en',['状態 ⟪0⟫']),['Translated ⟪0⟫']);
  for(const [value,pattern]of [['wrong-ids',/IDs/],['incomplete',/Incomplete/],['redirect',/fetch failed/]]){mode=value;await assert.rejects(()=>provider.translate('en',['保存']),pattern);}
  await provider.close();mode='valid';
  // Start the real dev command against a disposable, minimal application.
  fs.mkdirSync(path.join(root,'scripts'),{recursive:true});fs.mkdirSync(path.join(root,'src/i18n/locales'),{recursive:true});
  for(const file of ['develop.mjs','build-offline.cjs','build-release-notes.cjs','sync-i18n.mjs','serve.cjs'])fs.copyFileSync(path.join(source,'scripts',file),path.join(root,'scripts',file));
  fs.cpSync(path.join(source,'scripts/i18n'),path.join(root,'scripts/i18n'),{recursive:true,filter:file=>!file.endsWith('.sync.lock')});
  for(const file of ['format.js','languages.js'])fs.copyFileSync(path.join(source,'src/i18n',file),path.join(root,'src/i18n',file));
  const put=(file,value)=>fs.writeFileSync(path.join(root,file),typeof value==='string'?value:JSON.stringify(value));
  put('package.json',{version:'1.0.0',type:'module'});put('src/app.js',"const label=tr('保存');");
  const exclusions=JSON.parse(fs.readFileSync(path.join(source,'scripts/i18n/exclusions.json'))).filter(e=>e.file.endsWith('languages.js'));put('scripts/i18n/exclusions.json',exclusions);
  for(const {code}of targets)put('src/i18n/locales/'+code+'.js','export default '+JSON.stringify({'保存':'Reviewed save'})+';');
  put('release-notes.json',{releases:[{version:'1.0.0',date:'2026-10-13',changes:['更新'],changesEn:['Reviewed update'],translations:Object.fromEntries(targets.filter(x=>x.code!=='en').map(x=>[x.code,['Reviewed update']]))}]});
  put('scripts/i18n/state.json',{schema:1,messages:{'保存':hash('保存')},releases:{'1.0.0':hash(JSON.stringify(['更新']))}});
  put('index.html','<meta name="app-version" content="1.0.0"><meta name="app-build" content="0000000000000000">');
  put('licenses.html','<!-- latest-release:start --><!-- latest-release:end -->');put('notices.html','<!-- release-history:start --><!-- release-history:end -->');put('sw.js','');
  const count=requests.length;child=spawn(process.execPath,['scripts/develop.mjs'],{cwd:root,env:{...process.env,PORT:'0'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
  await wait(()=>output.includes('PalmoEMU development:'),'Initial development build');assert.equal(requests.length,count,'Up-to-date development startup does not contact a model');
  // Generated history introduces these existing UI keys; synchronize them first.
  put('src/app.js',"const label=tr('保存');const added=tr('新しい画面');");
  put('release-notes.json',{releases:[{version:'1.0.0',date:'2026-10-13',changes:['変更通知を編集']}]});
  await wait(()=>{try{return JSON.parse(fs.readFileSync(path.join(root,'scripts/i18n/state.json'))).messages['新しい画面']===hash('新しい画面');}catch{return false;}},'Automatic localization');
  for(const {code}of targets){assert.ok(fs.readFileSync(path.join(root,'src/i18n/locales',code+'.js'),'utf8').includes('新しい画面'));}
  const notes=JSON.parse(fs.readFileSync(path.join(root,'release-notes.json')));assert.equal(notes.releases[0].changesEn[0],'Translated ');assert.equal(Object.keys(notes.releases[0].translations).length,7);
  await wait(()=>fs.readFileSync(path.join(root,'notices.html'),'utf8').includes('変更通知を編集'),'Generated history');
  const url=output.match(/PalmoEMU development: (http:\/\/127\.0\.0\.1:\d+)/)[1];assert.ok((await(await fetch(url+'/notices.html')).text()).includes('変更通知を編集'));
  console.log('PASS: local-only translator, model pin, structured response failures, redirect rejection and real dev command watching UI/release-note edits across eight languages.');
 }finally{
  if(previous===undefined)delete process.env.PALMO_TRANSLATOR_URL;else process.env.PALMO_TRANSLATOR_URL=previous;
  if(child&&child.exitCode===null){const closed=new Promise(resolve=>child.once('close',resolve));child.kill();await closed;}
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 }
}
