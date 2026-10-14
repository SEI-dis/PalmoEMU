// SPDX-License-Identifier: AGPL-3.0-or-later
// Local generated images and synthetic save canaries; no ROM execution.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});try{
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
 await page.goto(base);await page.locator('#add-first').waitFor();
 const result=await page.evaluate(async()=>{
  const db=await import('./src/storage/storage.js'),{hash}=await import('./src/shared.js');
  const image=color=>{const c=document.createElement('canvas');c.width=c.height=2;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,2,2);return c.toDataURL();};
  const oldImage=image('red'),selected=image('blue'),own=image('green');
  const game=(id,extra={})=>({id,name:id,system:'gba',size:4,added:1,lastPlayed:0,...extra});
  const save={bytes:new Uint8Array([7,8,9]),at:123,hash:await hash(new Uint8Array([7,8,9]))};
  const source=game('source',{cover:oldImage,coverSource:'screenshot'});await db.addGame(source,new Uint8Array([1,2,3,4]));await db.put('saves',source.id,save);
  await db.setGameCover(source.id,{cover:selected,coverSource:'custom',coverTitle:'My cover',coverUrl:''});
  const expected={cover:selected,coverSource:'custom',coverTitle:'My cover',coverUrl:''},pick=g=>Object.fromEntries(Object.keys(expected).map(key=>[key,g[key]]));
  const commit=target=>db.commitROMUpdate({source,game:target,rom:new Uint8Array([4,3,2,1]),save});
  const updated=await commit(game('new')); // Deliberately pass stale source metadata.
  const custom=game('custom',{cover:own,coverSource:'custom',favorite:true});await db.addGame(custom,new Uint8Array([2,2,2,2]));const kept=await commit(custom);
  const automatic=game('automatic',{cover:oldImage,coverSource:'screenshot'});await db.addGame(automatic,new Uint8Array([3,3,3,3]));const replaced=await commit(automatic);
  let rejected=false;try{await db.commitROMUpdate({source,game:game('rollback'),rom:()=>{},save});}catch{rejected=true;}
  const rollback=rejected&&!await db.has('library','rollback')&&!await db.has('saves','rollback');
  const relation=id=>({romUpdate:{previousId:id}});
  const rows=[game('missed',{...relation('source'),cover:oldImage,coverSource:'screenshot',favorite:true,preferences:{volume:.2}}),game('chain',{...relation('missed')}),game('chosen',{...relation('source'),cover:own,coverSource:'custom'}),game('unrelated',{name:'source'}),game('orphan',relation('deleted')),game('wrong',{...relation('source'),system:'gb'}),game('cycle-a',relation('cycle-b')),game('cycle-b',relation('cycle-a')),game('remote',{cover:'https://example.invalid/cover.png',coverSource:'custom'}),game('remote-child',relation('remote'))];
  for(const row of rows)await db.addGame(row,new Uint8Array([0,0,0,0]));
  await db.put('saves','missed',{bytes:new Uint8Array([99]),at:999});await db.put('states','missed:manual',{bytes:new Uint8Array([88]),at:888});
  const snapshot=async()=>JSON.stringify(await Promise.all(['roms','saves','states','recoveries'].map(store=>db.all(store)))),before=await snapshot();
  // A failed metadata write must leave the entire migration unchanged and readable.
  const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='library')throw new DOMException('Synthetic quota','QuotaExceededError');return put.apply(this,args);};
  let readable;try{readable=(await db.trainerCard()).games.find(g=>g.id==='missed').cover===oldImage;}finally{IDBObjectStore.prototype.put=put;}
  const failedUnchanged=(await db.get('library','missed')).cover===oldImage;
  await db.trainerCard();const repaired=await db.get('library','missed'),chain=await db.get('library','chain'),untouched=[];
  for(const id of ['chosen','unrelated','orphan','wrong','cycle-a','cycle-b','remote-child']){const original=rows.find(row=>row.id===id),actual=await db.get('library',id);untouched.push(actual.cover===original.cover);}
  let writes=0;IDBObjectStore.prototype.put=function(...args){if(this.name==='library')writes++;return put.apply(this,args);};try{await db.trainerCard();}finally{IDBObjectStore.prototype.put=put;}
  const preserved=before===await snapshot();
  return {expected,updated:pick(updated),replaced:pick(replaced),kept:kept.cover===own&&kept.favorite,rollback,sourceKept:(await db.get('library','source')).cover===selected,readable,failedUnchanged,repaired:pick(repaired),chain:pick(chain),metadata:repaired.favorite&&repaired.preferences.volume===.2,untouched,writes,preserved};
 });
 for(const key of ['updated','replaced','repaired','chain'])assert.deepEqual(result[key],result.expected,key);
 for(const key of ['kept','rollback','sourceKept','readable','failedUnchanged','metadata','preserved'])assert.equal(result[key],true,key);
 assert.ok(result.untouched.every(Boolean));assert.equal(result.writes,0,'Repair is idempotent');assert.deepEqual(errors,[]);
 console.log(`PASS ${kind}: latest artwork inheritance, explicit target priority, transactional rollback, legacy-chain repair, cycles/unrelated/missing source, no remote fetch, save/ROM canaries and idempotence.`);
}finally{await browser.close();}})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
