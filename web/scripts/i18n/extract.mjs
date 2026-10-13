// SPDX-License-Identifier: AGPL-3.0-or-later
// Development-only extraction. Never load user files, cores or third-party sources.
import fs from 'node:fs';
import path from 'node:path';
import {parse} from './vendor/acorn.mjs';
import {mapSource,messageKey,hasJapanese} from '../../src/i18n/format.js';
export const webRoot=path.resolve(import.meta.dirname,'../..');
export function authoredFiles(root=webRoot){
 const files=[];
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  if(e.isSymbolicLink())throw Error('Symlinks are not localization inputs: '+e.name);
  const p=path.join(dir,e.name);
  if(e.isDirectory()){if(path.relative(root,p).replaceAll('\\','/')!=='src/i18n/locales')walk(p);}
  else if(/\.(?:js|mjs|json|css|html|svg)$/.test(e.name))files.push(p);
 }}
 walk(path.join(root,'src'));
 for(const e of fs.readdirSync(root,{withFileTypes:true}))if(e.isFile()&&/\.(?:html|css|webmanifest|js)$/.test(e.name)&&e.name!=='offline-manifest.js')files.push(path.join(root,e.name));
 return files.sort();
}
export function catalogueKeys(source){
 const found=[];mapSource(source,text=>{const {key}=messageKey(text);if(hasJapanese(key))found.push(key);return text;});return [...new Set(found)];
}
function decodeHTML(text){
 const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0',hellip:'…',copy:'©',reg:'®',mdash:'—',ndash:'–'};
 return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi,(_,entity)=>{
  if(entity[0]==='#')return String.fromCodePoint(entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1)));
  if(!(entity in named))throw Error('Use the Unicode character instead of an unsupported HTML entity: &'+entity+';');return named[entity];
 });
}
function htmlTexts(source,emit){
 const skip=['script','style','pre','code'],stack=[];
 const tokens=/<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z](?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+|</g;
 for(const match of source.matchAll(tokens)){
  const raw=match[0];if(raw.startsWith('<!--')||raw.startsWith('<!'))continue;
  if(raw.startsWith('</')){const name=raw.match(/^<\/([\w-]+)/)?.[1].toLowerCase();const index=stack.findLastIndex(e=>e.name===name);if(index>=0)stack.length=index;continue;}
  if(raw.startsWith('<')){
   const name=raw.match(/^<([\w-]+)/)?.[1].toLowerCase();if(!name)continue;
   const attrs={};for(const a of raw.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[a[1].toLowerCase()]=a[2]??a[3]??a[4];
   const excluded=stack.some(e=>e.skip)||skip.includes(name)||attrs.translate==='no'||Object.hasOwn(attrs,'data-i18n')||(name==='time'&&Object.hasOwn(attrs,'datetime'));
   if(!excluded)for(const key of ['aria-label','title','alt','placeholder'])if(attrs[key])emit(decodeHTML(attrs[key]),match.index);
   if(!/\/>$/.test(raw)&&!['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'].includes(name))stack.push({name,skip:excluded});
   continue;
  }
  if(!stack.some(e=>e.skip))emit(decodeHTML(raw),match.index);
 }
}
export function scanSources(root=webRoot){
 const messages=new Map(),issues=[],seenExemptions=new Set();
 const exclusionsPath=path.join(root,'scripts/i18n/exclusions.json');
 const exclusions=fs.existsSync(exclusionsPath)?JSON.parse(fs.readFileSync(exclusionsPath,'utf8')):[];
 const exempt=(file,text)=>{
  const index=exclusions.findIndex(e=>e.file===file&&e.text===text&&typeof e.reason==='string'&&e.reason.trim());
  if(index>=0){seenExemptions.add(index);return true;}return false;
 };
 function record(file,source,text,offset,translated){
  if(exempt(file,text))return;
  if(!hasJapanese(text)){if(translated&&/[A-Za-z]{2}/.test(text)&&!file.endsWith('.html')){const parts=[];mapSource(text,t=>{if(/[A-Za-z]{2}/.test(t.replace(/⟪\d+⟫/g,'')))parts.push(t);return t;});if(parts.length)issues.push({file,line:source.slice(0,offset).split('\n').length,text,reason:'Use Japanese source text in tr() so all languages can be generated.'});}return;}
  const line=source.slice(0,offset).split('\n').length;
  if(!translated){issues.push({file,line,text,reason:'Wrap UI text with tr() or a tr tagged template. Non-UI data needs an exact, explained exclusion.'});return;}
  for(const key of catalogueKeys(text)){
   if(!messages.has(key))messages.set(key,[]);messages.get(key).push({file,line});
  }
 }
 for(const file of authoredFiles(root)){
  const name=path.relative(root,file).replaceAll('\\','/'),source=fs.readFileSync(file,'utf8');
  if(/\.m?js$/.test(name)){
   const ast=parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true});
   const displayProperties=['textContent','innerText','title','alt','placeholder','aria-label'];
   const property=node=>node?.computed?node.property?.value:node?.property?.name;
   function isDisplayValue(node,parent){
    return (parent?.type==='AssignmentExpression'&&parent.right===node&&parent.left.type==='MemberExpression'&&displayProperties.includes(property(parent.left)))||
     (parent?.type==='CallExpression'&&parent.callee.type==='MemberExpression'&&property(parent.callee)==='setAttribute'&&parent.arguments[1]===node&&displayProperties.includes(parent.arguments[0]?.value));
   }
   function visit(node,parent){
    if(!node||typeof node!=='object')return;
    if(node.type==='TaggedTemplateExpression'&&node.tag.type==='Identifier'&&node.tag.name==='tr'){
     const q=node.quasi;record(name,source,q.quasis.map((v,i)=>v.value.cooked+(i<q.expressions.length?'⟪'+i+'⟫':'')).join(''),node.start,true);
     q.expressions.forEach(n=>visit(n,q));return;
    }
    if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name==='tr'){
     const arg=node.arguments[0];
     if(arg?.type==='Literal'&&typeof arg.value==='string'){record(name,source,arg.value,arg.start,true);node.arguments.slice(1).forEach(n=>visit(n,node));return;}
     if(arg?.type==='TemplateLiteral'&&!arg.expressions.length){record(name,source,arg.quasis[0].value.cooked,arg.start,true);return;}
     // tr(variable) is allowed only via the exact expression allowlist below.
     const expression=source.slice(node.start,node.end);
     if(!exempt(name,expression))issues.push({file:name,line:node.loc.start.line,text:expression,reason:'Dynamic tr() cannot be extracted. Use a tagged template; shared static tables need an explained exclusion.'});
    }
    if(node.type==='Literal'&&typeof node.value==='string'){
     record(name,source,node.value,node.start,false);
     const sink=isDisplayValue(node,parent);
     const html=/<[A-Za-z][^>]*>/.test(node.value);
     if(!hasJapanese(node.value)&&(sink||html))mapSource(node.value,text=>{
      if(/[A-Za-z]{2}/.test(text.replace(/⟪\d+⟫/g,''))&&!exempt(name,node.value))issues.push({file:name,line:node.loc.start.line,text:node.value,reason:'Unregistered literal UI text. Use tr() with the Japanese source or explain an invariant value.'});return text;
     });
    }
    if(node.type==='TemplateLiteral'){
     const raw=node.quasis.map((v,i)=>v.value.cooked+(i<node.expressions.length?'⟪'+i+'⟫':'')).join('');
     record(name,source,raw,node.start,false);
     if(!hasJapanese(raw)&&(isDisplayValue(node,parent)||/<[A-Za-z][^>]*>/.test(raw)))mapSource(raw.replace(/<(\/?)⟪\d+⟫/g,'<$1div'),text=>{if(/[A-Za-z]{2}/.test(text.replace(/⟪\d+⟫/g,''))&&!exempt(name,raw))issues.push({file:name,line:node.loc.start.line,text:raw,reason:'Unregistered literal UI text in a template.'});return text;});
     node.expressions.forEach(n=>visit(n,node));return;
    }
    for(const [key,val]of Object.entries(node)){
     if(['loc','start','end'].includes(key))continue;
     if(Array.isArray(val))val.forEach(n=>visit(n,node));else if(val?.type)visit(val,node);
    }
   }
   visit(ast,null);
  }else if(/\.html$/.test(name))htmlTexts(source,(text,offset)=>record(name,source,text,offset,true));
  else if(/\.css$/.test(name)){
   const clean=source.replace(/\/\*[\s\S]*?\*\//g,m=>' '.repeat(m.length));for(const m of clean.matchAll(/(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g))record(name,source,m[0].slice(1,-1),m.index,false);
  }else if(/\.(?:json|webmanifest)$/.test(name)){
   const visit=value=>{if(typeof value==='string')record(name,source,value,source.indexOf(JSON.stringify(value)),false);else if(value&&typeof value==='object')Object.values(value).forEach(visit);};visit(JSON.parse(source));
  }else if(/\.svg$/.test(name))htmlTexts(source,(text,offset)=>record(name,source,text,offset,false));
 }
 for(let i=0;i<exclusions.length;i++)if(!seenExemptions.has(i))issues.push({file:exclusions[i].file,line:0,text:exclusions[i].text,reason:'Unused exclusion: remove or update this exact entry.'});
 return {messages,issues};
}
export function assertSources(scan){if(scan.issues.length)throw Error(scan.issues.map(i=>`${i.file}:${i.line}: ${i.reason}\n  ${i.text.slice(0,180)}`).join('\n'));}
