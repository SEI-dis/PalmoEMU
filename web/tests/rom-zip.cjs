// SPDX-License-Identifier: AGPL-3.0-or-later
// Original synthetic ZIPs/ROMs, isolated browser storage, no user files.
const assert=require('node:assert/strict'),zlib=require('node:zlib'),crypto=require('node:crypto');
const runtime=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium';
const base=process.env.TEST_URL||'http://127.0.0.1:4173/';
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function prepare(entry){
 const raw=Buffer.from(entry.bytes),name=Buffer.from(entry.name),method=entry.method||0;
 return {...entry,raw,name,method,packed:method===8?zlib.deflateRawSync(raw):raw,length:entry.length??raw.length,crc:(crc32(raw)^(entry.badCRC?1:0))>>>0};
}
function local(entry,extra=0){
 const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(entry.method,8);header.writeUInt32LE(entry.crc,14);header.writeUInt32LE(entry.packed.length,18);header.writeUInt32LE(entry.length,22);header.writeUInt16LE(entry.name.length,26);header.writeUInt16LE(extra,28);
 return Buffer.concat([header,entry.name]);
}
function finish(entries,payload){
 const directory=Buffer.concat(entries.map(entry=>{
  const header=Buffer.alloc(46);header.writeUInt32LE(0x02014b50);header.writeUInt16LE(20,4);header.writeUInt16LE(20,6);header.writeUInt16LE(0x800,8);header.writeUInt16LE(entry.method,10);header.writeUInt32LE(entry.crc,16);header.writeUInt32LE(entry.packed.length,20);header.writeUInt32LE(entry.length,24);header.writeUInt16LE(entry.name.length,28);header.writeUInt32LE(entry.offset,42);return Buffer.concat([header,entry.name]);
 }));
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(payload.length,16);
 return Buffer.concat([payload,directory,end]);
}
function zip(inputs){
 const entries=inputs.map(prepare),parts=[];let offset=0;
 for(const entry of entries){entry.offset=offset;const header=local(entry);parts.push(header,entry.packed);offset+=header.length+entry.packed.length;}
 return finish(entries,Buffer.concat(parts));
}
function overlappingZip(){
 // Both names pass the old local-name/header checks. The first extra field
 // contains the second local header; both entries point at the same stream.
 const first=prepare({name:'first.gba',bytes:[9,8,7],method:8}),second=prepare({name:'other.gba',bytes:[9,8,7],method:8});
 const secondHeader=local(second),firstHeader=local(first,secondHeader.length);first.offset=0;second.offset=firstHeader.length;
 return finish([first,second],Buffer.concat([firstHeader,secondHeader,first.packed]));
}
(async()=>{
 assert.equal(crc32(Buffer.from('123456789')),0xcbf43926,'Fixture CRC matches the standard check vector');
 const source=Buffer.from(require('./link.cjs').cartridge(31,992)),second=Buffer.from(source),third=Buffer.from(source);second[second.length-1]^=1;third[third.length-1]^=2;
 const identity=crypto.createHash('sha256').update(source).digest('hex');
 const fixtures={
  normal:zip([{name:'folder/first.gba',bytes:[1,2,3,4]},{name:'second.gb',bytes:[5,6,7,8],method:8},{name:'readme.txt',bytes:[65,66]}]),
  crc:zip([{name:'bad.gba',bytes:[1,2,3,4],badCRC:true}]),
  overlap:overlappingZip(),
  expanded:zip([{name:'large.nds',bytes:[1],length:512*1048576,method:8},{name:'extra.gba',bytes:[2]}]),
  individual:zip([{name:'large.gba',bytes:[1],length:64*1048576+1,method:8}]),
  streamCap:zip([{name:'understated.gba',bytes:[1,2,3,4,5],length:2,method:8}]),
  duplicate:zip([{name:'Renamed.gba',bytes:source,method:8}]),
  partial:zip([{name:'Partial success.gba',bytes:second,method:8},{name:'CRC failure.gba',bytes:[8,9,10],badCRC:true}]),
  uiPartial:zip([{name:'UI success.gba',bytes:third},{name:'CRC failure.gba',bytes:[3,4,5],badCRC:true}]),
  nds:zip([{name:'Tiny synthetic.nds',bytes:[0,1,2,3,4,5],method:8}])
 };
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));context.on('request',request=>requests.push(request));await page.goto(base+'privacy.html');
  // Module-level imports below prepopulate a current-release library before UI startup.
  await page.evaluate(version=>localStorage.setItem('palmo-release-seen:'+new URL('.',location.href).pathname,version),require('../package.json').version);
  const result=await page.evaluate(async({fixtures,source,identity})=>{
   const {listROMZip,extractROMZip}=await import('./src/rom-zip.js'),{importROM}=await import('./src/rom-import.js'),db=await import('./src/storage.js');
   const check=(value,message)=>{if(!value)throw Error(message);},archive=name=>new File([new Uint8Array(fixtures[name])],name+'.zip');
   const refuse=async action=>{let rejected=false;try{await action();}catch{rejected=true;}check(rejected,'Malformed archive must be rejected');};
   const normal=archive('normal'),entries=await listROMZip(normal);check(entries.length===2,'Only supported ROM entries are extracted');
   for(const [i,entry]of entries.entries()){
    const extracted=await extractROMZip(normal,entry);check(extracted.bytes.join()===(i?'5,6,7,8':'1,2,3,4'),'Stored and deflated bytes match');check(extracted.size===4&&extracted.name===(i?'second.gb':'first.gba'),'Entry metadata is preserved');check(!Object.hasOwn(extracted,'file'),'Extraction does not allocate a second immutable File');
   }
   for(const name of ['overlap','expanded','individual'])await refuse(()=>listROMZip(archive(name)));
   for(const name of ['crc','streamCap']){const file=archive(name),[entry]=await listROMZip(file);await refuse(()=>extractROMZip(file,entry));}
   const first=await importROM(new File([new Uint8Array(source)],'Original.gba'),'gba');check(first.id===identity&&first.added,'Uncompressed identity remains SHA-256');
   const game=await db.get('library',identity);Object.assign(game,{name:'My game',favorite:true,lastPlayed:1234,preferences:{volume:.3}});await db.put('library',identity,game);await db.put('saves',identity,{bytes:new Uint8Array([9,8,7])});const before=JSON.stringify(game);
   const duplicate=await importROM(archive('duplicate'));check(duplicate.addedCount===0&&duplicate.duplicateCount===1,'ZIP duplicate uses the existing identity');check(JSON.stringify(await db.get('library',identity))===before,'ZIP duplicate preserves game metadata');check((await db.get('saves',identity)).bytes.join()==='9,8,7','ZIP duplicate preserves the existing save');
   let partial;try{await importROM(archive('partial'));}catch(error){partial=error;}
   check(partial?.addedCount===1&&partial.duplicateCount===0,'Partial failure reports only committed entries');check((await db.all('library')).some(game=>game.name==='Partial success'),'Earlier committed ROM survives a later CRC failure');
   const nds=await importROM(archive('nds'));check(nds.addedCount===1,'ZIP NDS imports');const ndsGame=(await db.all('library')).find(game=>game.system==='nds'),stored=await db.get('roms',ndsGame.id);const ndsBytes=stored instanceof Blob?new Uint8Array(await stored.arrayBuffer()):stored;check(ndsBytes.join()==='0,1,2,3,4,5','NDS Blob/byte fallback preserves content');const ndsAgain=await importROM(archive('nds'));check(ndsAgain.duplicateCount===1&&ndsAgain.addedCount===0,'NDS duplicate is detected before storage');
   return {count:(await db.all('library')).length,ndsBlob:stored instanceof Blob};
  },{fixtures:Object.fromEntries(Object.entries(fixtures).map(([name,bytes])=>[name,Array.from(bytes)])),source:Array.from(source),identity});
  assert.equal(result.count,3);
  await page.goto(base);await page.locator('.game-name').filter({hasText:'My game'}).waitFor();await page.locator('#rom-input').setInputFiles({name:'Partial.zip',mimeType:'application/zip',buffer:fixtures.uiPartial});
  await page.waitForFunction(()=>!document.querySelector('#rom-import-progress')&&document.querySelector('#toast').textContent.includes('1本のゲームを追加しました。'));
  const message=await page.locator('#toast').textContent();assert.match(message,/ZIP/);assert.match(message,/1本のゲームを追加しました/);
  assert.ok(await page.locator('.game-name').filter({hasText:'UI success'}).count(),'Partial success is visible in the library');
  assert.deepEqual(errors,[]);assert.ok(requests.filter(request=>/^https?:/.test(request.url())).every(request=>new URL(request.url()).origin===new URL(base).origin&&['GET','HEAD'].includes(request.method())&&!request.postData()),'No ZIP/ROM uploads');
  console.log('PASS: '+kind+' stored/deflated ZIP, CRC, overlapping ranges, expanded/stream limits, stable identities, duplicate/save preservation and partial-success UI.',result);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
