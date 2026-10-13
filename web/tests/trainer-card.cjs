// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic metadata and tiny save canaries in a disposable browser database.
const assert=require('node:assert/strict'),path=require('node:path'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',error=>errors.push(error.message));context.on('request',request=>requests.push(request));page.setDefaultTimeout(20000);
 await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
 await page.goto(base);await page.locator('#add-first').waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
 const migrated=await page.evaluate(async()=>{
  const db=await import('./src/storage.js'),{trainerProfileKey,playRecordPrefix,trainerStats}=await import('./src/trainer-profile.js');
  const fresh=(await db.trainerCard()).profile;const now=Date.now(),old={id:'old',name:'Old edition',system:'gba',added:now-86400000*10,size:4,playDuration:7200000},next={id:'new',name:'New edition',system:'gba',added:now-86400000,size:4};
  await db.remove('coverCatalogs',trainerProfileKey); // Simulate an existing pre-feature database.
  await db.addGame(old,new Uint8Array([1,2,3,4]));await db.put('saves',old.id,{bytes:new Uint8Array([7,8,9]),at:now});
  const updated=await db.commitROMUpdate({source:old,game:next,rom:new Uint8Array([4,3,2,1]),save:await db.get('saves',old.id)});
  await db.setGameDetails(next.id,{playDuration:3600000});
  await db.addGame({id:'other',name:'<img src=x onerror=alert(1)>',system:'gb',added:now-86400000*3,size:4,playDuration:1800000},new Uint8Array([0,0,0,0]));
  const first=await db.trainerCard(),stats=trainerStats(first.records,first.games),joined=first.profile.joinedAt;
  await db.removeGame(old.id);const after=await db.trainerCard();
  await db.addGame({...old,added:now,playDuration:0},new Uint8Array([1,2,3,4]));const readded=await db.get('library',old.id);
  await db.setGameDetails(old.id,{playDuration:readded.playDuration+60000});
  const latest=await db.trainerCard(),latestStats=trainerStats(latest.records,latest.games);
  const snapshot=async()=>({library:await db.get('library',next.id),record:await db.get('coverCatalogs',playRecordPrefix+next.id),save:[...(await db.get('saves',next.id)).bytes],rom:[...new Uint8Array(await db.get('roms',next.id))]});
  const before=await snapshot(),put=IDBObjectStore.prototype.put;let aborted=false;
  IDBObjectStore.prototype.put=function(value,key){if(this.name==='coverCatalogs'&&key===playRecordPrefix+next.id)throw new DOMException('Injected metadata failure','QuotaExceededError');return put.call(this,value,key);};
  try{await db.setGameDetails(next.id,{playDuration:9999999});}catch{aborted=true;}finally{IDBObjectStore.prototype.put=put;}
  const rollback=JSON.stringify(before)===JSON.stringify(await snapshot());
  return {fresh:fresh.joinSource,freshDate:fresh.joinedAt,joined,expected:old.added,source:first.profile.joinSource,total:stats.total,rows:stats.rankings,after:trainerStats(after.records,after.games),readded:readded.playDuration,latest:latestStats,stable:latest.profile.joinedAt===joined,aborted,rollback,save:before.save,rom:before.rom};
 });
 assert.equal(migrated.fresh,'first-use');assert.ok(migrated.freshDate>0);assert.equal(migrated.source,'estimated');assert.equal(migrated.joined,migrated.expected);
 assert.equal(migrated.total,12600000);assert.equal(migrated.rows.length,2);assert.equal(migrated.rows[0].id,'new');assert.equal(migrated.after.total,migrated.total);
 assert.equal(migrated.readded,7200000);assert.equal(migrated.latest.total,12660000);assert.equal(migrated.latest.rankings[0].id,'new');assert.equal(migrated.stable,true);assert.equal(migrated.aborted,true);assert.equal(migrated.rollback,true);assert.deepEqual(migrated.save,[7,8,9]);assert.deepEqual(migrated.rom,[4,3,2,1]);
 // Statistics are optional metadata: a failed migration must not hide the
 // library, preventing the user from exporting saves or freeing storage.
 await page.evaluate(async()=>{const db=await import('./src/storage.js'),{playRecordPrefix}=await import('./src/trainer-profile.js');await db.remove('coverCatalogs',playRecordPrefix+'new');});
 const blocked=await context.newPage();await blocked.addInitScript(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,key){if(this.name==='coverCatalogs')throw new DOMException('Synthetic metadata quota','QuotaExceededError');return put.call(this,value,key);};});
 await blocked.goto(base);await blocked.locator('[data-game=new]').waitFor();await blocked.locator('[data-tab=settings]').click();assert.equal(await blocked.locator('#trainer-total').textContent(),'3時間31分');await blocked.close();
 await page.goto(base+'#settings');await page.reload();await page.locator('#trainer-title').waitFor();
 assert.equal(await page.locator('#trainer-title').textContent(),'トレーナーカード');assert.match(await page.locator('#trainer-nickname').textContent(),/かけだしトレーナー/);assert.equal(await page.locator('#trainer-total').textContent(),'3時間31分');
 assert.equal(await page.locator('.trainer-games li').first().locator('span').textContent(),'New edition');assert.equal(await page.locator('.trainer-games img').count(),0);assert.equal(await page.locator('.trainer-card').getByText('推定',{exact:false}).count(),0);
 const edit=()=>page.locator('#trainer-nickname').click();
 await edit();await page.locator('#trainer-name').fill('Cancelled');await page.locator('#trainer-name-cancel').click();assert.match(await page.locator('#trainer-nickname').textContent(),/かけだしトレーナー/);
 await edit();await page.locator('#trainer-name').fill('<b>Trainer</b>');await page.locator('#trainer-name-form [type=submit]').click();await page.locator('#sheet').waitFor({state:'hidden'});assert.equal(await page.locator('#trainer-nickname b').count(),0);assert.match(await page.locator('#trainer-nickname').textContent(),/<b>Trainer<\/b>/);
 await page.reload();await page.locator('#trainer-nickname').waitFor();assert.match(await page.locator('#trainer-nickname').textContent(),/<b>Trainer<\/b>/);
 await edit();await page.locator('#trainer-name').fill('');await page.locator('#trainer-name-form [type=submit]').click();await page.locator('#sheet').waitFor({state:'hidden'});assert.match(await page.locator('#trainer-nickname').textContent(),/かけだしトレーナー/);
 await edit();await page.locator('#trainer-name').fill('トレーナー'.repeat(6));await page.locator('#trainer-name-form [type=submit]').click();await page.locator('#sheet').waitFor({state:'hidden'});
 // Avatar edits are staged until Save. Only a small re-encoded local PNG is persisted.
 const avatar=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=400;canvas.height=200;const ctx=canvas.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,400,200);ctx.fillStyle='#0000ff';ctx.fillRect(100,0,200,200);return canvas.toDataURL('image/png');});
 const avatarFile={name:'avatar.png',mimeType:'image/png',buffer:Buffer.from(avatar.split(',')[1],'base64')};
 const openAvatar=()=>page.getByRole('button',{name:'アイコンを変更',exact:true}).click();
 const pickAvatar=async()=>{await page.locator('#trainer-avatar-input').setInputFiles(avatarFile);await page.waitForFunction(()=>document.querySelector('#trainer-avatar-preview')?.src.startsWith('data:image/png')&&!document.querySelector('#trainer-avatar-form').hasAttribute('aria-busy'));};
 await openAvatar();await pickAvatar();await page.locator('#trainer-avatar-cancel').click();assert.equal(await page.locator('#trainer-avatar-change img').getAttribute('src'),'assets/icon.svg');
 await openAvatar();await pickAvatar();await page.locator('#trainer-avatar-form [type=submit]').click();await page.locator('#sheet').waitFor({state:'hidden'});
 const savedAvatar=await page.locator('#trainer-avatar-change img').getAttribute('src');assert.ok(savedAvatar.startsWith('data:image/png;base64,'));assert.notEqual(savedAvatar,avatar);
 await page.reload();await page.locator('#trainer-avatar-change').waitFor();assert.equal(await page.locator('#trainer-avatar-change img').getAttribute('src'),savedAvatar);
 assert.deepEqual(await page.locator('#trainer-avatar-change img').evaluate(image=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return [image.naturalWidth,image.naturalHeight,...ctx.getImageData(128,128,1,1).data];}),[256,256,0,0,255,255]);
 const metadata=await page.evaluate(async()=>{const db=await import('./src/storage.js');let rejected=false;try{await db.saveTrainerAvatar('https://example.invalid/avatar.png');}catch{rejected=true;}await Promise.all([db.saveTrainerNickname('同時編集'),db.saveTrainerAvatar((await db.trainerCard()).profile.avatar)]);const before=(await db.trainerCard()).profile,put=IDBObjectStore.prototype.put;let aborted=false;
  IDBObjectStore.prototype.put=function(){throw new DOMException('Synthetic avatar quota','QuotaExceededError');};try{await db.saveTrainerAvatar('');}catch{aborted=true;}finally{IDBObjectStore.prototype.put=put;}
  return {rejected,aborted,before,after:(await db.trainerCard()).profile};});
 assert.equal(metadata.rejected,true);assert.equal(metadata.aborted,true);assert.equal(metadata.before.nickname,'同時編集');assert.equal(metadata.before.avatar,savedAvatar);assert.deepEqual(metadata.before,metadata.after);
 await openAvatar();await page.locator('#trainer-avatar-input').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await page.locator('#toast').filter({hasText:'16MB以下'}).waitFor();assert.equal(await page.locator('#trainer-avatar-preview').getAttribute('src'),savedAvatar);await page.locator('#trainer-avatar-cancel').click();
 await openAvatar();await page.locator('#trainer-avatar-reset').click();await page.locator('#trainer-avatar-cancel').click();assert.equal(await page.locator('#trainer-avatar-change img').getAttribute('src'),savedAvatar);
 await openAvatar();await page.locator('#trainer-avatar-reset').click();await page.locator('#trainer-avatar-form [type=submit]').click();await page.locator('#sheet').waitFor({state:'hidden'});await page.reload();await page.locator('#trainer-avatar-change').waitFor();assert.equal(await page.locator('#trainer-avatar-change img').getAttribute('src'),'assets/icon.svg');
 for(const width of [320,390,844]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow at '+width);await page.screenshot({path:path.join(__dirname,'../test-results/trainer-'+kind+'-'+width+'.png'),fullPage:true});}
 const final=await page.evaluate(async()=>{const db=await import('./src/storage.js');return {date:(await db.trainerCard()).profile.joinedAt,save:[...(await db.get('saves','new')).bytes]};});assert.equal(final.date,migrated.joined);assert.deepEqual(final.save,[7,8,9]);
 assert.deepEqual(errors,[]);assert.ok(requests.every(request=>['GET','HEAD'].includes(request.method())&&new URL(request.url()).origin===new URL(base).origin));
 console.log(`PASS ${kind}: trainer migration, persistent nickname/date/avatar, cancel/reset/invalid images, atomic profile edits, grouped playtime, delete/re-add, rollback, unchanged saves, escaping and responsive card`);
}finally{await browser.close();}})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
