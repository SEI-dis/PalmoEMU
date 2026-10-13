// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated synthetic storage only; exact byte equality must never trust hashes.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs'),kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[],traffic=[];
  page.on('pageerror',e=>errors.push(e.message));context.on('request',r=>traffic.push(r));
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';await page.goto(base+'privacy.html');
  const result=await page.evaluate(async()=>{
   const db=await import('./src/storage.js'),check=(v,message)=>{if(!v)throw Error(message);};
   const coreId='mgba-rom64-save6-v2',canonical=Uint8Array.from({length:33},(_,i)=>(i*13+7)&255);
   const view=(bytes,pad=123)=>{const backing=new Uint8Array(bytes.length+17).fill(pad);backing.set(bytes,5);return backing.subarray(5,5+bytes.length);};
   const asBytes=value=>ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):new Uint8Array(value);
   const same=(a,b)=>JSON.stringify([...asBytes(a)])===JSON.stringify([...asBytes(b)]);
   const cases=[
    ['offset-same',view(canonical,11),view(canonical,22),true],
    ['buffer-same',canonical.slice().buffer,canonical.slice(),true],
    ['legacy-array-same',[...canonical],view(canonical),true],
    ['data-view-same',new DataView(view(canonical).buffer,5,canonical.length),canonical.slice(),true],
    ['uint16-same',new Uint16Array(Uint8Array.from([1,2,3,4,5,6,7,8]).buffer,2,2),Uint8Array.from([3,4,5,6]),true],
    ['different-length',canonical.slice(1),canonical.slice(),false]
   ];
   for(const index of [0,16,32]){const changed=canonical.slice();changed[index]^=0xff;cases.push(['different-'+index,view(canonical),view(changed),false]);}
   const changedBuffer=canonical.slice();changedBuffer[32]^=1;cases.push(['buffer-different',canonical.slice().buffer,changedBuffer.buffer,false]);
   for(const [label,oldBytes,newBytes,equal]of cases){
    const id='compare-'+label,old={bytes:oldBytes,hash:'same-hash-on-purpose',at:1,coreId},next={bytes:newBytes,hash:'same-hash-on-purpose',at:2,coreId};
    await db.put('sessions',id,{id:'owner'});await db.put('saves',id,old);
    await db.commitProtection(id,'owner',next,null);
    const stored=await db.get('saves',id),history=await db.get('backups',id)||[];
    check(same(stored.bytes,newBytes),label+': new bytes stored');
    check(history.length===(equal?0:1),label+': exact comparison controls backup');
    if(!equal)check(same(history[0].bytes,oldBytes),label+': previous byte range preserved');
   }
   // The same exact comparator guards ROM handoff. Equal metadata, including
   // hash and timestamp, must not conceal a source byte changed after inspection.
   const source={id:'comparison-rom-source',system:'gba',size:4,name:'Synthetic source'},target={id:'comparison-rom-target',system:'gba',size:4,name:'Synthetic target'};
   await db.addGame(source,Uint8Array.from([0,1,2,3]));
   const captured={bytes:Uint8Array.from([1,2,3,4]),hash:'same-hash',at:10,coreId};
   const changed={...captured,bytes:Uint8Array.from([1,2,3,5])};await db.put('saves',source.id,changed);
   let failed=false;try{await db.commitROMUpdate({source,game:target,rom:Uint8Array.from([4,5,6,7]),save:captured});}catch{failed=true;}
   check(failed,'Changed ROM source is rejected despite matching hash/time');
   check(!await db.has('library',target.id)&&!await db.has('roms',target.id)&&!await db.has('saves',target.id),'Failed ROM handoff leaves no partial target');
   check(!await db.has('coverCatalogs',db.romUpdateMetadataPrefix+target.id),'Failed ROM handoff leaves no partial snapshot');
   check(same((await db.get('saves',source.id)).bytes,changed.bytes),'Failed ROM handoff retains changed source');
   await db.put('saves',source.id,{...captured,bytes:captured.bytes.slice().buffer});
   await db.commitROMUpdate({source,game:target,rom:Uint8Array.from([4,5,6,7]),save:{...captured,bytes:view(captured.bytes)}});
   check(same((await db.get('saves',target.id)).bytes,captured.bytes),'Equal ArrayBuffer source and offset view transfer exactly');
   check(same((await db.get('saves',source.id)).bytes,captured.bytes),'Successful handoff retains source');
   const protectedCopy=await db.get('coverCatalogs',db.romUpdateMetadataPrefix+target.id);
   check(same(protectedCopy.save.bytes,captured.bytes),'Successful handoff keeps protected copy');
   // Comparison change cannot weaken the existing session ownership transaction.
   const baseline=await db.get('saves','compare-offset-same');failed=false;
   try{await db.commitProtection('compare-offset-same','other-owner',{bytes:new Uint8Array([9]),hash:'same-hash-on-purpose',at:3,coreId},null);}catch{failed=true;}
   check(failed&&same((await db.get('saves','compare-offset-same')).bytes,baseline.bytes),'Wrong-session save still rolls back');
   return {cases:cases.length,romHandoff:true,atomic:true};
  });
  assert.deepEqual(result,{cases:10,romHandoff:true,atomic:true});assert.deepEqual(errors,[]);
  assert.ok(traffic.every(r=>r.method()==='GET'&&!r.postData()&&new URL(r.url()).origin===new URL(base).origin));
  await context.close();console.log(`PASS ${kind}: exact equality across offset views, ArrayBuffer/legacy arrays, first/middle/last differences with same hash, protected ROM handoff and session rollback; zero uploads.`);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
