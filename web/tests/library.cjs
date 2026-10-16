// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs'),path=require('node:path');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await page.locator('#add-first').waitFor();await page.waitForFunction(()=>!document.documentElement.hasAttribute('aria-busy'));
 // Original metadata fixtures, no third-party game files or user database.
 await page.evaluate(async()=>{const db=await import('./src/storage/storage.js');for(const game of [
  {id:'a',name:'Alpha 10',system:'gba',added:100,lastPlayed:300,playDuration:100},
  {id:'b',name:'Alpha 2',system:'gba',added:300,lastPlayed:100,playDuration:200,category:'playing'},
  {id:'c',name:'Beta',system:'nds',added:200,lastPlayed:200,playDuration:300,favorite:true,category:'completed'},
  {id:'d',name:'<script>Delta</script>',system:'gb',added:50,category:'backlog'}
 ])await db.addGame({...game,size:4},new Uint8Array([0,1,2,3]));});
 await page.reload();await page.locator('[data-game=a]').waitFor();
 const ids=()=>page.locator('[data-game]').evaluateAll(nodes=>nodes.map(node=>node.dataset.game));
 const close=async()=>{await page.locator('#close-sheet').click();await page.locator('#sheet').waitFor({state:'hidden'});};
 // Sort the combined library, with deterministic ties and numeric name order.
 await page.locator('#library-sort').click();await page.locator('#library-group-choice').selectOption('none');await close();
 assert.deepEqual(await ids(),['d','b','a','c']);
 for(const [sort,expected] of [['name-desc',['c','a','b','d']],['recent',['a','c','b','d']],['added',['b','c','a','d']],['playtime',['c','b','a','d']]]){
  await page.locator('#library-sort').click();await page.locator('#library-sort-choice').selectOption(sort);await close();assert.deepEqual(await ids(),expected,sort);
 }
 await page.reload();await page.locator('[data-game=a]').waitFor();assert.deepEqual(await ids(),['c','b','a','d'],'Display choice persists');
 // Search normalizes full-width characters, combining system/status/favorite.
 await page.locator('#search').fill('ＡＬＰＨＡ');assert.deepEqual(await ids(),['b','a']);
 await page.locator('#category-filter').selectOption('playing');assert.deepEqual(await ids(),['b']);
 await page.locator('#favorites').click();assert.equal((await ids()).length,0);await page.locator('#favorites').click();
 await page.locator('#category-filter').selectOption('all');await page.locator('#system-filter').selectOption('nds');assert.equal((await ids()).length,0);
 await page.locator('#system-filter').selectOption('all');await page.locator('#search').fill('');
 // Ordinary selection opens the owning ROM menu. Single-category changes and
 // X/cancel return to that menu, without starting a core or closing to library.
 await page.locator('[data-game=a]').click();await page.locator('#sheet.game-info').waitFor();await page.locator('[data-action=category]').click();assert.equal(await page.locator('#library-cancel').count(),0);await page.locator('#close-sheet').click();await page.locator('#sheet.game-info').waitFor();
 await page.locator('[data-action=category]').click();await page.locator('[data-library-category=playing]').click();await page.locator('#sheet.game-info').waitFor();assert.match(await page.locator('[data-action=category]').textContent(),/プレイ中/);assert.equal(await page.locator('#player').isVisible(),false);
 // A stale, already-open menu must not revive a category removed elsewhere.
 await page.evaluate(async()=>{const db=await import('./src/storage/storage.js');await db.setGamesLibraryMetadata(['a'],{category:''});});
 await page.locator('#game-favorite-button').click();await page.locator('#sheet.game-info').waitFor();
 const patched=await page.evaluate(async()=>{const db=await import('./src/storage/storage.js');return db.get('library','a');});assert.equal(patched.category,undefined);assert.equal(patched.favorite,true);await close();
 await page.locator('#library-select').click();await page.locator('[data-game=a]').click();await page.locator('[data-game=c]').click();assert.equal(await page.locator('#library-selected-count').textContent(),'2件を選択');assert.equal(await page.locator('#sheet').isVisible(),false);
 await page.locator('#library-category').click();assert.equal(await page.locator('[data-library-category][aria-pressed=true]').count(),0,'Mixed categories are not preselected');await page.locator('[data-library-category=backlog]').click();await page.locator('#sheet').waitFor({state:'hidden'});
 await page.locator('#category-filter').selectOption('backlog');assert.deepEqual(await ids(),['c','a','d']);
 await page.locator('#library-sort').click();await page.locator('#library-group-choice').selectOption('category');await close();assert.deepEqual(await page.locator('.section-title>span:first-child').allTextContents(),['あとで遊ぶ']);
 await page.locator('#library-sort').click();await page.locator('#library-group-choice').selectOption('none');await close();
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('palmo-library-view-v1'))),{sort:'playtime',group:'none'},'Only display choices are persisted, never search terms or selected IDs');
 // All-select affects the visible search/filter results only. Changing a
 // filter clears selection so a hidden ROM cannot be deleted accidentally.
 await page.locator('#library-select-all').click();assert.equal(await page.locator('#library-selected-count').textContent(),'3件を選択');
 await page.locator('#search').fill('alpha');assert.equal(await page.locator('#library-selected-count').textContent(),'0件を選択');assert.equal(await page.locator('#library-delete').isDisabled(),true);
 await page.locator('#library-select-all').click();await page.locator('#library-favorite').click();await page.locator('#library-favorite-add').click();await page.locator('#sheet').waitFor({state:'hidden'});
 const metadata=await page.evaluate(async()=>{const db=await import('./src/storage/storage.js');return db.all('library');});assert.equal(metadata.find(g=>g.id==='a').favorite,true);assert.equal(metadata.find(g=>g.id==='b').favorite,undefined);
 await page.locator('#category-filter').selectOption('all');await page.locator('#search').fill('');await page.locator('#library-select-all').click();
 // Portrait, small portrait, landscape and desktop do not overflow or hide
 // batch controls under the navigation/tab bar. Buttons use native keyboard
 // activation and pressed state; no long-press selection is required.
 for(const [width,height] of [[320,640],[390,844],[844,390],[1200,800]]){
  await page.setViewportSize({width,height});const layout=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('.library-batch-actions button')].map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})}));
  assert.ok(layout.scroll<=layout.width,`${width}: no horizontal overflow`);for(const button of layout.buttons){assert.ok(button.left>=0&&button.right<=width);assert.ok(button.top>=0&&button.bottom<height-70);}
 }
 await page.setViewportSize({width:390,height:844});require('node:fs').mkdirSync(path.join(__dirname,'../test-results'),{recursive:true});await page.screenshot({path:path.join(__dirname,'../test-results/library-'+kind+'.png')});
 // Cancel is inert; successful deletion removes only the selected records.
 await page.locator('#library-delete').click();assert.equal(await page.locator('#close-sheet').isVisible(),false);await page.keyboard.press('Escape');assert.equal((await ids()).length,4);
 await page.locator('#search').fill('alpha');await page.locator('#library-select-all').click();await page.locator('#library-delete').click();assert.equal(await page.locator('#library-delete-confirm').textContent(),'2件を削除');await page.locator('#library-delete-confirm').click();await page.locator('#sheet').waitFor({state:'hidden'});
 assert.equal((await ids()).length,0);await page.locator('#search').fill('');assert.deepEqual(await ids(),['c','d']);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#library-select').textContent(),'選択');await page.locator('[data-game=c]').click();await page.locator('#sheet.game-info').waitFor();await close();
 await page.reload();await page.locator('[data-game=c]').waitFor();assert.deepEqual(await ids(),['c','d']);assert.deepEqual(errors,[]);
 console.log(`PASS ${kind}: library sorting, grouping, filtering, single/batch categories, selection scope, favorites, deletion, persistence and responsive controls`);await context.close();
}finally{await browser.close();}})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
