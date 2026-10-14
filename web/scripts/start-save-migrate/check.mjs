// SPDX-License-Identifier: AGPL-3.0-or-later
// Read candidate modules as syntax/data. Never execute supplied code.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {parse} from '../i18n/vendor/acorn.mjs';
import {defineStartComponent} from '../../src/start-save/contract.js';

export const installedDirectory=fileURLToPath(new URL('../../vendor/start-save-migrate/',import.meta.url));
const requiredExports=['MANIFEST','inspectInput','migrateSave','normalizeVersion','readSave','getVariable'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function literal(node){
 if(node.type==='Literal'&&!node.regex&&['string','number','boolean','object'].includes(typeof node.value))return node.value;
 if(node.type==='ArrayExpression')return node.elements.map(literal);
 if(node.type==='ObjectExpression'){
  const keys=new Set(),entries=node.properties.map(p=>{
   assert(p.type==='Property'&&!p.computed&&!p.method&&p.kind==='init','Manifest must be literal data');
   const key=p.key.type==='Identifier'?p.key.name:p.key.value;
   assert(typeof key==='string'&&!keys.has(key),'Duplicate or invalid manifest key');keys.add(key);
   return [key,literal(p.value)];
  });return Object.fromEntries(entries);
 }
 throw Error('Manifest must be literal data, without executable expressions');
}
export function readManifest(source){
 const tree=parse(source,{ecmaVersion:'latest',sourceType:'module'}),statement=tree.body[0];
 assert(tree.body.length===1&&statement.type==='ExportNamedDeclaration','Expected one exported manifest');
 const declaration=statement.declaration;
 assert(declaration?.type==='VariableDeclaration'&&declaration.kind==='const'&&declaration.declarations.length===1&&declaration.declarations[0].id.name==='MANIFEST','Expected const MANIFEST');
 return literal(declaration.declarations[0].init);
}
export function checkComponent(directory=installedDirectory){
 assert(!fs.lstatSync(directory).isSymbolicLink(),'Component directory must not be a symlink');
 const read=name=>{
  const file=path.join(directory,name),stat=fs.lstatSync(file);
  assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<16*1048576,'Expected bounded regular component file: '+name);
  return fs.readFileSync(file);
 };
 const record=JSON.parse(read('component.json'));
 assert(record.schema===1&&record.hostContract==='start-v23-50-savecrypt','Unsupported component record');
 assert(typeof record.author==='string'&&record.author.trim()&&typeof record.permission==='string'&&record.permission.trim(),'Retain author and permission provenance');
 assert(Array.isArray(record.sources)&&record.sources.length&&record.sources.every(s=>typeof s.name==='string'&&s.name.trim()&&digest(s.sha256)),'Record supplied source hashes');
 const files=Object.keys(record.files||{}),allowed=new Set(['engine.js','manifest.js','README.md','LICENSE']);
 assert(['engine.js','manifest.js','README.md'].every(name=>files.includes(name))&&files.every(name=>allowed.has(name)&&digest(record.files[name])),'Invalid component file list');
 assert.deepEqual(fs.readdirSync(directory).sort(),[...files,'component.json'].sort(),'Unexpected component files');
 for(const name of files)assert.equal(hash(read(name)),record.files[name],'Changed component file: '+name);
 const manifest=readManifest(read('manifest.js').toString('utf8')),definition=defineStartComponent(manifest);
 assert.equal(record.toolVersion,definition.toolVersion,'Tool version differs from manifest');
 assert.equal(record.outputVersion,definition.output.version,'Output version differs from manifest');
 const tree=parse(read('engine.js').toString('utf8'),{ecmaVersion:'latest',sourceType:'module'}),exports=new Set();
 for(const node of tree.body){
  if(node.type==='ImportDeclaration')assert.equal(node.source.value,'./manifest.js','Unexpected engine dependency');
  if(node.type==='ExportNamedDeclaration'){
   assert(!node.source,'Engine must not re-export external modules');
   for(const item of node.specifiers)exports.add(item.exported.name);
   if(node.declaration?.id)exports.add(node.declaration.id.name);
   for(const item of node.declaration?.declarations||[])exports.add(item.id.name);
  }
 }
 for(const name of requiredExports)assert(exports.has(name),'Missing engine API: '+name);
 // The syntax/API check is not a sandbox or a behavioural/permission review.
 return {directory:path.resolve(directory),record,definition};
}
export function compareComponents(current,candidate){
 const before=new Set(current.definition.versions.map(v=>v.version)),after=new Set(candidate.definition.versions.map(v=>v.version));
 return {
  toolVersion:[current.record.toolVersion,candidate.record.toolVersion],
  outputVersion:[current.record.outputVersion,candidate.record.outputVersion],
  addedVersions:[...after].filter(v=>!before.has(v)),removedVersions:[...before].filter(v=>!after.has(v)),
  changedFiles:[...new Set([...Object.keys(current.record.files),...Object.keys(candidate.record.files)])].filter(name=>current.record.files[name]!==candidate.record.files[name]),
  provenanceChanged:JSON.stringify([current.record.author,current.record.permission,current.record.sources])!==JSON.stringify([candidate.record.author,candidate.record.permission,candidate.record.sources]),
 };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  assert(process.argv.length<=3,'Usage: node web/scripts/start-save-migrate/check.mjs [candidate-directory]');
  const installed=checkComponent();
  if(process.argv[2]){
   const candidate=checkComponent(path.resolve(process.argv[2]));
   console.log(JSON.stringify(compareComponents(installed,candidate),null,2));
   console.log('Candidate structure verified without executing it. Review source/permission changes and run save regressions before replacement.');
  }else console.log(`PASS: START converter ${installed.record.toolVersion}, output ${installed.record.outputVersion}, pinned files, host contract and exported API.`);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
