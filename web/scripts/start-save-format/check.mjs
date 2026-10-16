// SPDX-License-Identifier: AGPL-3.0-or-later
// Check source as syntax/data. Never import or execute a candidate engine.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parse} from '../i18n/vendor/acorn.mjs';

export const installedDirectory=fileURLToPath(new URL('../../vendor/start-save-format/',import.meta.url));
const expectedSources=[
 {name:'セーブデータ移行ツール.html',sha256:'3a6c4378e32ff3d975d4d3ba15fbd88955baec20c08b9ce6c05f9846cbd35b88'},
 {name:'statically decoded embedded JavaScript',sha256:'61c4e1bc7d64e7c49b3cb4f5569fa2339a60dc0f2fcadac90ed60d568d72a195'}
];
const expectedPermission='The project maintainer explicitly confirmed permission to incorporate the officially bundled HTML migration tool and publish its integration on the Web on 2026-10-16. No standardized upstream license was supplied. This records the maintainer confirmation, not an independently inspected rights-holder message. Retain README.md provenance and permission scope; do not assert a general third-party license or attribute this tool to the separate START Save Migrate author.';
const expectedDirection={from:'old',to:'L',reverseConversion:false,rounding:false,versionGuard:0x31ff};
const expectedExports=['containsFormatL','convertFormatSave','inspectFormatSave'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function visit(node,callback){
 if(!node||typeof node!=='object')return;
 if(Array.isArray(node)){for(const child of node)visit(child,callback);return;}
 if(typeof node.type==='string')callback(node);
 for(const [key,value] of Object.entries(node))if(!['start','end','loc'].includes(key)&&typeof value==='object')visit(value,callback);
}
function engineContract(source){
 const tree=parse(source,{ecmaVersion:'latest',sourceType:'module'}),declarations=new Map(),functions=new Map(),exports=[];
 for(const item of tree.body){
  assert(['VariableDeclaration','FunctionDeclaration','ExportNamedDeclaration'].includes(item.type),'Unexpected top-level engine statement');
  const node=item.type==='ExportNamedDeclaration'?item.declaration:item;
  if(item.type==='ExportNamedDeclaration'){
   assert(!item.source&&node?.type==='FunctionDeclaration'&&!item.specifiers.length,'Expected local exported functions only');
   exports.push(node.id.name);
  }
  if(node.type==='VariableDeclaration')for(const declaration of node.declarations){assert(declaration.id.type==='Identifier','Unexpected engine binding');declarations.set(declaration.id.name,declaration.init);}
  if(node.type==='FunctionDeclaration')functions.set(node.id.name,node);
 }
 visit(tree,node=>assert(!['ImportDeclaration','ImportExpression','ExportAllDeclaration'].includes(node.type),'Unexpected engine dependency'));
 assert.deepEqual(exports.sort(),expectedExports,'Unsupported format engine API');
 assert(functions.get('convertFormatSave')?.async,'Conversion API must remain asynchronous');
 function value(node,seen=new Set()){
  assert(node,'Missing engine contract constant');
  if(node.type==='Literal'&&!node.regex&&['string','number'].includes(typeof node.value))return node.value;
  if(node.type==='ArrayExpression')return node.elements.map(item=>value(item,new Set(seen)));
  if(node.type==='Identifier'){
   assert(!seen.has(node.name),'Cyclic engine contract constant');seen.add(node.name);return value(declarations.get(node.name),seen);
  }
  if(node.type==='BinaryExpression'&&['+','-','*'].includes(node.operator)){
   const a=value(node.left,new Set(seen)),b=value(node.right,new Set(seen));assert(typeof a==='number'&&typeof b==='number','Expected numeric engine contract');
   return node.operator==='+'?a+b:node.operator==='-'?a-b:a*b;
  }
  throw Error('Engine contract constants must be literal arithmetic, not executable expressions');
 }
 const constants=Object.fromEntries(['SECTOR','DATA','SIGNATURE','SLOT_BYTES','FULL_BYTES','SMALL_BYTES','VERSION_OFFSET','VERSION_GUARD','SECTION_SIZES','MAP_OFFSET'].map(name=>[name,value(declarations.get(name))]));
 assert.deepEqual(constants,{SECTOR:4096,DATA:4080,SIGNATURE:0x08012025,SLOT_BYTES:3145728,FULL_BYTES:6291456,SMALL_BYTES:131072,VERSION_OFFSET:0xba,VERSION_GUARD:0x31ff,SECTION_SIZES:[0xf24,0xff0,0xff0,0xff0,0xd98],MAP_OFFSET:0x1400},'Unsupported serialized format contract');
 const layouts={};
 for(const [name,expected] of [['OLD',['old',0x4c454853,58,12,70,15,17,5,990,330,28]],['LARGE',['L',0x324c4853,60,11,68,16,18,8,1020,480,30]]]){
  const node=declarations.get(name);assert(node?.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name==='format','Expected reviewed format descriptor');
  layouts[name]=node.arguments.map(argument=>value(argument));assert.deepEqual(layouts[name],expected,'Unsupported serialized layout: '+name);
 }
 const input=functions.get('input'),guards={};assert(input,'Missing input size validation');
 visit(input,node=>{
  if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&!node.callee.computed&&node.callee.property.name==='includes'&&node.callee.object.type==='ArrayExpression'&&node.arguments.length===1&&node.arguments[0].type==='Identifier')guards[node.arguments[0].name]=value(node.callee.object);
 });
 assert.deepEqual(guards.bodyBytes,[131072,6291456],'Input body sizes differ from contract');
 assert.deepEqual(guards.rtcBytes,[0,16],'Input RTC sizes differ from contract');
 return {direction:{...expectedDirection},saveBodyBytes:guards.bodyBytes,optionalRTCBytes:16,slotBytes:constants.SLOT_BYTES,exports,layouts};
}
export function checkComponent(directory=installedDirectory){
 const location=path.resolve(directory),stat=fs.lstatSync(location);assert(stat.isDirectory()&&!stat.isSymbolicLink(),'Expected regular component directory');
 const read=name=>{
  const file=path.join(location,name),entry=fs.lstatSync(file);assert(entry.isFile()&&!entry.isSymbolicLink()&&entry.size<1048576,'Expected bounded regular component file: '+name);return fs.readFileSync(file);
 };
 assert.deepEqual(fs.readdirSync(location).sort(),['README.md','component.json','engine.js'],'Unexpected component files');
 const record=JSON.parse(read('component.json'));
 assert(record.schema===1&&record.hostContract==='start-format-l-forward-v1','Unsupported component record');
 assert.equal(record.distribution,'PokemonStart_v0.50.0.pks','Source distribution changed');
 assert.equal(record.distributionVersion,'0.50.0','Source distribution version changed');
 assert.equal(record.sourceDistributor,'pm-start/PokemonStart','Source distributor changed');
 assert.equal(record.sourceURL,'https://github.com/pm-start/PokemonStart','Source URL changed');
 assert.equal(record.individualAuthor,null,'Do not invent an individual author');
 for(const key of ['author','license','spdxLicenseId'])assert(!Object.hasOwn(record,key),'Unreviewed author/license assertion');
 assert.equal(record.permission,expectedPermission,'Permission scope differs from reviewed provenance');
 assert.deepEqual(record.sources,expectedSources,'Source evidence differs from reviewed provenance');
 assert.deepEqual(record.direction,expectedDirection,'Unsupported migration direction or rounding');
 assert.deepEqual(record.saveBodyBytes,[131072,6291456],'Unsupported input body sizes');
 assert.equal(record.optionalRTCBytes,16,'Unsupported RTC extent');assert.equal(record.slotBytes,3145728,'Unsupported slot extent');
 assert.deepEqual(Object.keys(record.files||{}).sort(),['README.md','engine.js'],'Invalid pinned component file list');
 assert(Array.isArray(record.localChanges)&&record.localChanges.length&&record.localChanges.every(note=>typeof note==='string'&&note.trim()),'Retain local adaptation notes');
 for(const [name,pin] of Object.entries(record.files)){assert(digest(pin),'Invalid file digest: '+name);assert.equal(hash(read(name)),pin,'Changed component file: '+name);}
 const contract=engineContract(read('engine.js').toString('utf8'));
 assert.deepEqual(record.direction,contract.direction,'Record and engine direction disagree');
 assert.deepEqual(record.saveBodyBytes,contract.saveBodyBytes,'Record and engine sizes disagree');
 assert.equal(record.slotBytes,contract.slotBytes,'Record and engine slot extent disagree');
 // This static/pinning check is not a behavioural test or a grant of rights.
 return {directory:location,record,contract};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  assert(process.argv.length<=3,'Usage: node web/scripts/start-save-format/check.mjs [candidate-directory]');
  const checked=checkComponent(process.argv[2]||installedDirectory);
  console.log(`PASS: PokemonStart ${checked.record.distributionVersion} format component, reviewed provenance, pinned files, old → L contract and exported API (source not executed).`);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
