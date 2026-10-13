// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from './vendor/acorn.mjs';
import {languages} from '../../src/i18n/languages.js';
import {authoredFiles,scanSources,assertSources,webRoot} from './extract.mjs';
export const targets=languages.filter(x=>x.code!=='ja');
export const hash=text=>createHash('sha256').update(text).digest('hex');
export function readCatalogue(file){
 // Never execute a catalogue as part of development extraction.
 const tree=parse(fs.readFileSync(file,'utf8'),{ecmaVersion:'latest',sourceType:'module'});
 if(tree.body.length!==1||tree.body[0].type!=='ExportDefaultDeclaration'||tree.body[0].declaration.type!=='ObjectExpression')throw Error('Expected a plain exported catalogue: '+file);
 const output={};for(const p of tree.body[0].declaration.properties){
  if(p.type!=='Property'||p.computed||p.method||p.kind!=='init'||typeof p.key.value!=='string'||p.value.type!=='Literal'||typeof p.value.value!=='string'||Object.hasOwn(output,p.key.value))throw Error('Invalid or duplicate catalogue entry: '+file);
  Object.defineProperty(output,p.key.value,{value:p.value.value,enumerable:true,writable:true,configurable:true});
 }return output;
}
export function validateText(source,value,code=''){
 if(typeof value!=='string'||!value.trim())throw Error('Empty translation');
 const nativeName=value===source&&languages.some(language=>language.name===source);
 if(!nativeName&&(/[ぁ-んァ-ヶ]/.test(value)||(code&&!code.startsWith('zh-')&&value===source&&/[一-龯]/.test(source))))throw Error('Untranslated Japanese');
 const slots=text=>[...text.matchAll(/⟪\d+⟫/g)].map(m=>m[0]).sort().join(',');
 if(slots(source)!==slots(value))throw Error('Interpolation placeholders changed');
 if(/<\/?[a-z]/i.test(value)&&!/<\/?[a-z]/i.test(source))throw Error('Unexpected HTML in translation');
 if(/<unk>|<0x[0-9A-F]+>|�|991\d{3}|857[1-9]|858\d/.test(value))throw Error('Unfinished translation');
 const protectedTerms=source.match(/https?:\/\/[^\s<>「」]+|\b(?:AGPL|MPL|GPL|Apache)-\d\.\d(?:-or-later)?|\b(?:MiB|KiB|MB)\b/g)||[];
 for(const term of protectedTerms)if(!value.includes(term))throw Error('Protected term changed: '+term);
}
const statePath=root=>path.join(root,'scripts/i18n/state.json');
export function inputFingerprint(root=webRoot){
 const files=[...authoredFiles(root),...targets.map(({code})=>path.join(root,'src/i18n/locales',code+'.js')),path.join(root,'package.json'),path.join(root,'release-notes.json'),statePath(root),path.join(root,'scripts/i18n/exclusions.json'),path.join(root,'scripts/i18n/translator.json')];
 return hash(files.map(file=>path.relative(root,file)+'\0'+(fs.existsSync(file)?hash(fs.readFileSync(file)):'missing')).join('\n'));
}
export function createPlan(root=webRoot){
 const fingerprint=inputFingerprint(root);
 const scan=scanSources(root);assertSources(scan);
 const catalogues=Object.fromEntries(targets.map(({code})=>[code,readCatalogue(path.join(root,'src/i18n/locales',code+'.js'))]));
 const state=JSON.parse(fs.readFileSync(statePath(root),'utf8'));
 if(state.schema!==1)throw Error('Unsupported localization state schema');
 const notes=JSON.parse(fs.readFileSync(path.join(root,'release-notes.json'),'utf8'));
 const jobs=[],next=structuredClone(state),keys=new Set([...Object.keys(catalogues.en),...scan.messages.keys()]);
 for(const key of keys){
  const digest=hash(key);const changed=state.messages[key]!==digest;
  for(const {code}of targets){
   let invalid=false;try{validateText(key,catalogues[code][key],code);}catch{invalid=true;}
   if(changed||invalid)jobs.push({kind:'message',key,source:key,code,locations:scan.messages.get(key)||[]});
  }
  Object.defineProperty(next.messages,key,{value:digest,enumerable:true,writable:true,configurable:true});
 }
 for(const {code}of targets)for(const key of Object.keys(catalogues[code]))if(!keys.has(key))throw Error(code+': entry has no Japanese source: '+key);
 const versions=new Set();
 for(const release of notes.releases){
  if(!/^\d+\.\d+\.\d+$/.test(release.version)||versions.has(release.version)||!Array.isArray(release.changes)||!release.changes.length||release.changes.some(x=>typeof x!=='string'||!x.trim()))throw Error('Invalid Japanese release notes');
  versions.add(release.version);release.translations??={};
  const changed=state.releases[release.version]!==hash(JSON.stringify(release.changes));
  for(const {code}of targets){
   const values=code==='en'?release.changesEn:release.translations[code];
   for(const [index,source]of release.changes.entries()){
    let invalid=false;try{validateText(source,values?.[index],code);}catch{invalid=true;}
    if(changed||invalid)jobs.push({kind:'release',version:release.version,index,source,code});
   }
   if(code==='en')release.changesEn=(values||[]).slice(0,release.changes.length);
   else release.translations[code]=(values||[]).slice(0,release.changes.length);
  }
  next.releases[release.version]=hash(JSON.stringify(release.changes));
 }
 return {root,scan,jobs,catalogues,notes,state:next,fingerprint};
}
export function assertCurrent(plan){
 if(plan.jobs.length)throw Error('Translations are missing or stale. Run npm run i18n:sync or the normal build.\n'+plan.jobs.map(j=>`${j.code}: ${j.kind==='release'?j.version+'['+j.index+']':j.locations[0]?j.locations[0].file+':'+j.locations[0].line:'src/i18n/locales/'+j.code+'.js'} ${j.source.slice(0,100)}`).join('\n'));
 for(const release of plan.notes.releases){
  const original=JSON.parse(fs.readFileSync(path.join(plan.root,'release-notes.json'),'utf8')).releases.find(r=>r.version===release.version);
  if(original.changesEn?.length!==release.changes.length||targets.some(({code})=>code!=='en'&&original.translations?.[code]?.length!==release.changes.length))throw Error('Extra/missing translated release lines: '+release.version);
 }
}
function outputCatalogue(values){return '// SPDX-License-Identifier: AGPL-3.0-or-later\n// Application text; original license documents remain unchanged.\nexport default '+JSON.stringify(values,null,1)+';\n';}
export async function synchronize(plan,translate,{onProgress=()=>{}}={}){
 if(!plan.jobs.length)return 0;
 // All generated data stays in memory until every language has validated.
 for(const {code}of targets){
  const jobs=plan.jobs.filter(j=>j.code===code);
  for(let from=0;from<jobs.length;from+=12){
   const batch=jobs.slice(from,from+12);let result,last;
   for(let attempt=0;attempt<3;attempt++)try{
    result=await translate(code,batch.map(j=>j.source));
    if(!Array.isArray(result)||result.length!==batch.length)throw Error('Wrong translation count');
    result.forEach((value,index)=>validateText(batch[index].source,value,code));last=null;break;
   }catch(error){last=error;}
   if(last)throw Error(code+': translation failed; no files were changed. '+last.message);
   for(const [index,job]of batch.entries()){
    if(job.kind==='message')Object.defineProperty(plan.catalogues[code],job.key,{value:result[index],enumerable:true,writable:true,configurable:true});
    else{const release=plan.notes.releases.find(r=>r.version===job.version);if(code==='en')release.changesEn[job.index]=result[index];else release.translations[code][job.index]=result[index];}
   }
   onProgress(code,Math.min(from+12,jobs.length),jobs.length);
  }
 }
 if(inputFingerprint(plan.root)!==plan.fingerprint)throw Error('Source or translations changed during generation; no files were changed. Run the build again.');
 const writes=targets.map(({code})=>[path.join(plan.root,'src/i18n/locales',code+'.js'),outputCatalogue(plan.catalogues[code])]);
 writes.push([path.join(plan.root,'release-notes.json'),JSON.stringify(plan.notes,null,2)+'\n']);
 // State last: an interrupted filesystem update remains detectably incomplete.
 writes.push([statePath(plan.root),JSON.stringify(plan.state,null,1)+'\n']);
 for(const [file,text]of writes){
  const old=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';const newline=old.includes('\r\n')?'\r\n':'\n';
  const next=text.replaceAll('\n',newline);if(old===next)continue;
  const temp=file+'.i18n-tmp';fs.writeFileSync(temp,next);fs.renameSync(temp,file);
 }
 return plan.jobs.length;
}
