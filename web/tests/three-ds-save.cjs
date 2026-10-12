// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const {packSave,unpackSave}=await import(require('node:url').pathToFileURL(path.join(__dirname,'../src/three-ds-save.js')));
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'local-play-save-'));
 const local=p=>path.join(root,p);let failure='';
 const FS={readdir:p=>fs.readdirSync(local(p)),lstat:p=>fs.lstatSync(local(p)),isDir:m=>(m&0o170000)===0o040000,isFile:m=>(m&0o170000)===0o100000,readFile:p=>new Uint8Array(fs.readFileSync(local(p))),mkdirTree:p=>fs.mkdirSync(local(p),{recursive:true}),unlink:p=>fs.unlinkSync(local(p)),writeFile:(p,b)=>{if(p===failure){failure='';throw Error('write failed');}fs.writeFileSync(local(p),b);}};
 const a='/user/Azahar/sdmc/title/a.sav',b='/user/Azahar/nand/title/b.sav';
 try{
  FS.mkdirTree('/user/Azahar/sdmc/title');FS.mkdirTree('/user/Azahar/nand/title');FS.writeFile(a,new Uint8Array([1,2]));FS.writeFile(b,new Uint8Array([3]));
  const original=packSave(FS);assert.throws(()=>packSave({...FS,readdir:()=>{throw Error('read failed');}}),/read failed/);FS.writeFile(a,new Uint8Array([8]));FS.writeFile('/user/Azahar/sdmc/extra.sav',new Uint8Array([7]));
  unpackSave(FS,original);assert.deepEqual(FS.readFile(a),new Uint8Array([1,2]));assert.ok(!fs.existsSync(local('/user/Azahar/sdmc/extra.sav')));
  const archive=entries=>{const meta=Buffer.from(JSON.stringify(entries)),body=Buffer.alloc(entries.reduce((n,e)=>n+e[1],0)),header=Buffer.alloc(12);header.write('LP3SAVE\0');header.writeUInt32LE(meta.length,8);return new Uint8Array(Buffer.concat([header,meta,body]));};
  for(const bad of [original.subarray(0,original.length-1),archive([['/user/Azahar/sdmc/../../outside',1]]),archive([[a,1],[a,1]]),archive([[a,1],[a+'/child',1]]),archive([['/roms/game.3ds',1]]),archive([['/user/Azahar/sdmc//bad',1]])]){
   assert.throws(()=>unpackSave(FS,bad));assert.deepEqual(packSave(FS),original);
  }
  FS.writeFile(a,new Uint8Array([9]));FS.writeFile(b,new Uint8Array([8]));const before=packSave(FS);failure=a;
  assert.throws(()=>unpackSave(FS,original),/write failed/);assert.deepEqual(packSave(FS),before);
  console.log('PASS: 3DS save archive exact restore, stale-file removal, corrupt/traversal/duplicate/conflicting paths rejected, failed write rollback.');
 }finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'local-play-save-'));fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
