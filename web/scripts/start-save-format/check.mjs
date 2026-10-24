// SPDX-License-Identifier: AGPL-3.0-or-later
// Check source as syntax/data. Never import or execute a candidate engine.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parse} from '../i18n/vendor/acorn.mjs';

export const installedDirectory=fileURLToPath(new URL('../../vendor/start-save-format/',import.meta.url));
const publicationScopes=['incorporation','webPublication','modification','offlineDistribution','modifiedSourceRedistribution'];
export function checkPublicationPermission(record){
 const permission=record.publicationPermission;
 assert(permission&&publicationScopes.every(scope=>permission.scopes?.[scope]===true),'NOT READY FOR PUBLICATION: format converter modification/offline/modified-source permission is not fully confirmed');
 assert(/^\d{4}-\d{2}-\d{2}$/.test(permission.confirmedOn||'')&&typeof permission.evidence==='string'&&permission.evidence.trim(),'NOT READY FOR PUBLICATION: format permission confirmation evidence is required');
}
const expectedSources=[
 {name:'セーブデータ移行ツール.html',sha256:'3ee55e1e53f3095c32cc932f1bf6f161e4f9ebfc463e0e71772e891480ad4ac5'},
 {name:'statically decoded embedded JavaScript',sha256:'240cb3bd2ee0d6bca5c4e730713da9334b366c6cede63b10e2ace2078379d958'}
];
const expectedPermission="On 2026-10-16 the project maintainer confirmed that incorporation, Web publication, modification, offline distribution and redistribution of modified source on GitHub and in source ZIPs are permitted with credit attribution. The maintainer also confirmed the developer is already credited. This records the maintainer report, not an independently inspected rights-holder message. Retain the existing PokemonStart developer and project credits and this provenance. No standardized upstream or general third-party license is asserted; do not attribute this separate tool to the earlier START Save Migrate author.";
const expectedDirection={from:['old','L','W'],to:['L','W','X'],reverseConversion:false,rounding:false,versionGuards:{L:0x31ff,W:0x34ff,X:0x3b02}};
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
 const constants=Object.fromEntries(['SECTOR','DATA','SIGNATURE','SLOT_BYTES','FULL_BYTES','SMALL_BYTES','VERSION_OFFSET','VERSION_GUARD','WIDE_VERSION_GUARD','SECTION_SIZES','MAP_OFFSET'].map(name=>[name,value(declarations.get(name))]));
 assert.deepEqual(constants,{SECTOR:4096,DATA:4080,SIGNATURE:0x08012025,SLOT_BYTES:3145728,FULL_BYTES:6291456,SMALL_BYTES:131072,VERSION_OFFSET:0xba,VERSION_GUARD:0x31ff,WIDE_VERSION_GUARD:0x34ff,SECTION_SIZES:[0xf24,0xff0,0xff0,0xff0,0xd98],MAP_OFFSET:0x1400},'Unsupported serialized format contract');
 assert.equal(value(declarations.get('LARGE_SLOT_BYTES')),8388608,'Unsupported 0.59 slot stride');
 assert.equal(value(declarations.get('LARGE_FULL_BYTES')),16777216,'Unsupported 0.59 body extent');
 assert.equal(value(declarations.get('MARK_OFFSET')),34*4096,'Unsupported storage marker sector');
 assert.equal(value(declarations.get('X_VERSION_GUARD')),0x3b02,'Unsupported X version contract');
 assert.equal(value(declarations.get('X_TAIL_BYTES')),15,'Unsupported X record contract');
 assert.equal(value(declarations.get('MAC_SECRET')),0xe4ee25b3,'Unsupported integrity contract');
 assert.deepEqual(value(declarations.get('SAVE_KEYS')),[[0x3901,0xcf0a5e2e],[0x3b01,0x2b1db2eb],[0x3b02,0x35bf48d2],[0x3b03,0x557d0a65],[0x3b04,0xfaf25c60],[0x3b05,0xeea1554f]],'Unsupported keyed-sector contract');
 const layouts={};
 for(const [name,expected] of [['OLD',['old',0x4c454853,58,12,70,15,17,5,990,330,28]],['LARGE',['L',0x324c4853,60,11,68,16,18,8,1020,480,30]],['WIDE',['W',0x334c4853,63,11,64,16,18,9,960,540,30,26,18]],['XWIDE',['X',0x344c4853,78,8,52,16,18,14,780,720,30,156,28,128]]]){
  const node=declarations.get(name);assert(node?.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name==='format','Expected reviewed format descriptor');
  layouts[name]=node.arguments.map(argument=>value(argument));assert.deepEqual(layouts[name],expected,'Unsupported serialized layout: '+name);
 }
 const input=functions.get('input'),guards={};assert(input,'Missing input size validation');
 visit(input,node=>{
  if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&!node.callee.computed&&node.callee.property.name==='includes'&&node.callee.object.type==='ArrayExpression'&&node.arguments.length===1&&node.arguments[0].type==='Identifier')guards[node.arguments[0].name]=value(node.callee.object);
 });
 assert.deepEqual(guards.bodyBytes,[131072,6291456,16777216],'Input body sizes differ from contract');
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
 assert(record.schema===1&&record.hostContract==='start-format-forward-v4','Unsupported component record');
 assert.equal(record.distribution,'maintainer-supplied PokemonStart 0.59.5 migration HTML','Source distribution changed');
 assert.equal(record.distributionVersion,'0.59.5','Source distribution version changed');
 assert.equal(record.sourceDistributor,'pm-start/PokemonStart','Source distributor changed');
 assert.equal(record.sourceURL,'https://github.com/pm-start/PokemonStart','Source URL changed');
 assert.equal(record.individualAuthor,null,'Do not invent an individual author');
 for(const key of ['author','license','spdxLicenseId'])assert(!Object.hasOwn(record,key),'Unreviewed author/license assertion');
 assert.equal(record.permission,expectedPermission,'Permission scope differs from reviewed provenance');
 assert.deepEqual(Object.keys(record.publicationPermission?.scopes||{}).sort(),[...publicationScopes].sort(),'Explicit publication permission scopes required');
 assert(Object.values(record.publicationPermission.scopes).every(value=>value===true||value===false||value===null),'Permission scopes must distinguish confirmed, refused and unconfirmed');
 assert.deepEqual(record.sources,expectedSources,'Source evidence differs from reviewed provenance');
 assert.deepEqual(record.direction,expectedDirection,'Unsupported migration direction or rounding');
 assert.deepEqual(record.saveBodyBytes,[131072,6291456,16777216],'Unsupported input body sizes');
 assert.deepEqual(record.storageLayout,{legacySlotStride:3145728,currentSlotStride:8388608,currentBodyBytes:16777216,markerSector:34,markerVersion:2,minimumTargetVersion:'0.59.0'},'Unsupported physical storage layout');
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
  const args=process.argv.slice(2),publication=args.includes('--publication'),directories=args.filter(arg=>arg!=='--publication');
  assert(directories.length<=1&&!directories.some(arg=>arg.startsWith('--')),'Usage: node web/scripts/start-save-format/check.mjs [candidate-directory] [--publication]');
  const checked=checkComponent(directories[0]||installedDirectory);
  if(publication)checkPublicationPermission(checked.record);
  console.log(`PASS: PokemonStart ${checked.record.distributionVersion} format component, reviewed provenance, pinned files, old/L/W → L/W/X contract and exported API (source not executed).`);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
