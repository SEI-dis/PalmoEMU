// SPDX-License-Identifier: AGPL-3.0-or-later
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const {checkModuleLinks}=await import('../scripts/lib/module-links.mjs');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'palmo-module-links-'));
 const write=(name,text)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
 try{
  write('src/nested/worker.js','export const done=true;');write('src/app.js',"import './nested/worker.js'; const sample=\"import './absent.js'\"; new Worker(new URL('./nested/worker.js',import.meta.url));");
  write('src/classic.js',"importScripts('../vendor/tool.js');");write('vendor/tool.js','');write('index.html','<script type="module" src="src/app.js"></script>');
  assert.deepEqual(checkModuleLinks(root),{modules:1,resources:3,dynamicBases:0});
  write('src/nested/deep.js',"new URL('../../vendor/',import.meta.url);");assert.equal(checkModuleLinks(root).resources,4);
  write('src/nested/deep.js',"new URL('../../vendor/'+name,import.meta.url);");assert.equal(checkModuleLinks(root).dynamicBases,1);
  for(const source of ["import './missing.js';","new Worker(new URL('./missing.js',import.meta.url));","importScripts('./missing.js');","new URL('../../../outside.js',import.meta.url);"]){write('src/nested/deep.js',source);assert.throws(()=>checkModuleLinks(root));}
  fs.unlinkSync(path.join(root,'src/nested/deep.js'));write('index.html','<script src="src/missing.js"></script>');assert.throws(()=>checkModuleLinks(root));
  console.log('PASS: source/worker/classic-script/HTML references, nested asset bases, false-positive strings and web-root boundaries.');
 }finally{assert(path.dirname(path.resolve(root))===path.resolve(os.tmpdir())&&path.basename(root).startsWith('palmo-module-links-'));fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
