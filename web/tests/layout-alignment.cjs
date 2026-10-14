// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated browser storage and an original synthetic cartridge only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const kind=process.env.BROWSER_ENGINE||'chromium',pw=require('./browser-runtime.cjs');
(async()=>{
 const browser=await pw[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),p=await ctx.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);await p.goto(process.env.TEST_URL||'http://127.0.0.1:4173/');
  // Verify geometry against independent coordinates, including unequal button sizes.
  const geometry=await p.evaluate(async()=>{
   const {snapPosition,alignedPosition}=await import('./src/skins/control-alignment.js'),{normalizedPosition}=await import('./src/skins/control-layout.js');
   const item={id:'a',frame:{x:20,y:20,width:40,height:40}},other={id:'b',frame:{x:80,y:140,width:40,height:40}},map={width:400,height:600};
   const items=[item,other,{id:'screen',screen:true,frame:{x:181,y:223,width:40,height:40}}];
   return {center:snapPosition(item,items,map,{x:183,y:227}),mirror:snapPosition(item,items,map,{x:279,y:144}),edge:snapPosition(item,items,map,{x:-30,y:999}),aligned:alignedPosition({...item,frame:{...item.frame,width:60,height:20}},other,map,'mirror'),nearlyFull:normalizedPosition({width:399.5,height:600},map,.25,0)};
  });
  assert.equal(geometry.center.x,180);assert.equal(geometry.center.y,224);
  assert.equal(geometry.mirror.x,280);assert.equal(geometry.mirror.y,140);assert.ok(geometry.mirror.guides.some(g=>g.kind==='mirror'));
  assert.equal(geometry.edge.x,0);assert.equal(geometry.edge.y,560);assert.deepEqual(geometry.aligned,{x:270,y:150});assert.deepEqual(geometry.nearlyFull,{x:.5,y:0});
  const open=async()=>{await p.locator('[data-tab=settings]').click();await p.locator('[data-action=skins]').click();await p.locator('#edit-controls').click();};
  const close=()=>p.locator('#close-sheet').click();
  const stored=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('manic-settings')).controlLayouts?.gba);
  const rect=id=>p.locator(`[data-edit-control="${id}"]`).boundingBox();
  const center=b=>({x:b.x+b.width/2,y:b.y+b.height/2});
  const near=(a,b,label)=>assert.ok(Math.abs(a-b)<.15,`${label}: ${a} vs ${b}`);
  const size=async value=>{await p.locator('#edit-size').fill(String(value));await p.locator('#edit-size').dispatchEvent('input');};
  const align=action=>p.locator(`[data-align="${action}"]`).click();
  const mode=value=>p.locator(`[data-edit-mode="${value}"]`).click();
  const save=async()=>{await p.locator('#edit-save').click();await p.locator('#skin-grid').waitFor();};
  const dir=path.join(__dirname,'../test-results/layout-alignment');fs.mkdirSync(dir,{recursive:true});
  await open();await p.locator('#edit-grid').uncheck();assert.equal(await p.locator('.edit-guides.show-grid').count(),0);
  await p.locator('#edit-snap').uncheck();await p.locator('#edit-cancel').click();assert.equal(await stored(),undefined,'Layout aids do not create layout changes');
  await p.locator('#edit-controls').click();assert.equal(await p.locator('#edit-grid').isChecked(),true);
  for(const orientation of ['portrait','landscape']){
   await p.locator(`[data-edit-orientation=${orientation}]`).click();await mode('screen');
   await size(await p.locator('#edit-size').getAttribute('max'));await align('center-x');await align('center-y');
   // Screen remains at the bottom even when selected. Controls retain their actual opacity.
   await mode('buttons');await p.locator('#edit-selection').selectOption('a');await align('center-x');await align('center-y');
   await p.locator('#edit-opacity').fill('55');await p.locator('#edit-opacity').dispatchEvent('input');
   const a=await rect('a'),s=await rect('screen'),host=await p.locator('.edit-preview').boundingBox();
   near(center(a).x,center(s).x,'screen/button center x');near(center(a).y,center(s).y,'screen/button center y');
   assert.ok(a.width<s.width&&a.height<s.height);
   assert.equal(await p.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('[data-edit-control]')?.dataset.editControl,center(a)),'a');
   await mode('screen');
   const stacking=await p.evaluate(()=>{const a=document.querySelector('[data-edit-control=a]'),s=document.querySelector('.edit-screen');return {a:Number(getComputedStyle(a).zIndex),s:Number(getComputedStyle(s).zIndex),opacity:getComputedStyle(a).opacity,art:getComputedStyle(a.firstElementChild).opacity};});
   assert.ok(stacking.a>stacking.s);assert.equal(stacking.opacity,'1');assert.equal(stacking.art,'0.45');
   assert.equal(await p.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('[data-edit-control]')?.dataset.editControl,center(a)),'screen','Screen can be edited through inactive controls');
   await mode('buttons');await p.locator('[data-edit-control=l]').focus();for(let i=0;i<3;i++)await p.keyboard.press('Shift+ArrowRight');
   await p.locator('#edit-selection').selectOption('r');await size(130);await p.locator('#edit-align-reference').selectOption('l');await align('mirror');
   const l=await rect('l'),r=await rect('r');near(center(l).x+center(r).x,host.x*2+host.width,'Mirror center');near(center(l).y,center(r).y,'Mirror level');
   await p.locator('#edit-selection').selectOption('b');await p.locator('#edit-align-reference').selectOption('a');await align('level');near(center(await rect('a')).y,center(await rect('b')).y,'Align level');
   await p.locator('#edit-selection').selectOption('a');
   // Grid spacing scales with preview; a drag near center emits guides and snaps exactly.
   await p.locator('#edit-grid-step').selectOption('32');await p.locator('#edit-grid-step').selectOption('16');
   let c=center(await rect('a'));await p.mouse.move(c.x,c.y);await p.mouse.down();await p.mouse.move(c.x+1,c.y+1,{steps:2});
   assert.ok(await p.locator('.edit-snap-guide').count()>0);near(center(await rect('a')).x,center(host).x,'Center snap');
   await p.screenshot({path:path.join(dir,`${kind}-${orientation}-guides.png`)});await p.mouse.up();assert.equal(await p.locator('.edit-snap-guide').count(),0,'Release removes transient guides');
   await p.locator('#edit-snap').uncheck();const before=await rect('a');c=center(before);await p.mouse.move(c.x,c.y);await p.mouse.down();await p.mouse.move(c.x+3,c.y-3,{steps:2});await p.mouse.up();const after=await rect('a');near(after.x-before.x,3,'Free drag x');near(after.y-before.y,-3,'Free drag y');
   await p.locator('#edit-snap').check();await align('center-x');await align('center-y');
   await p.locator('[data-edit-control=a]').focus();const beforeKey=await rect('a');await p.keyboard.press('ArrowRight');assert.ok((await rect('a')).x>beforeKey.x,'Keys allow fine adjustments with snap on');await align('center-x');
  }
  await p.locator('[data-edit-orientation=portrait]').click();await save();const saved=await stored();assert.equal(saved.portrait.a.opacity,.45);assert.equal(saved.landscape.a.opacity,.45);
  // Verify preview paint order at an overlap, allowing pointer inspection temporarily.
  await p.locator('[data-preview-skin]').first().click();await p.locator('.skin-zoom .skin-mini').waitFor();
  // ResizeObserver can replace the artwork after locator resolution. Read the
  // current artwork inside the stable preview host in the same browser task.
  const preview=await p.locator('.skin-zoom-art').evaluate(host=>{
   const e=host.querySelector('.skin-mini');
   const buttons=[...e.querySelectorAll('.skin-mini-button')],screen=e.querySelector('.skin-mini-screen'),r=screen.getBoundingClientRect();
   const a=buttons.find(b=>{const f=b.getBoundingClientRect();return Math.abs(f.x+f.width/2-r.x-r.width/2)<1&&Math.abs(f.y+f.height/2-r.y-r.height/2)<1;});
   if(!a)return {error:'No centered button',screen:r.toJSON(),buttons:buttons.map(b=>b.getBoundingClientRect().toJSON())};
   for(const el of [screen,a])el.style.pointerEvents='auto';const f=a.getBoundingClientRect(),hit=document.elementFromPoint(f.x+f.width/2,f.y+f.height/2);for(const el of [screen,a])el.style.removeProperty('pointer-events');return {hit:hit===a,opacity:getComputedStyle(a).opacity,element:hit?.outerHTML.slice(0,180)};
  });assert.ok(preview.hit&&preview.opacity==='0.45','Preview paints translucent button above the screen: '+JSON.stringify(preview));
  await p.getByRole('button',{name:'プレビューを閉じる',exact:true}).click();
  await p.screenshot({path:path.join(dir,kind+'-preview.png')});await close();await p.reload();await open();await p.locator('#edit-reset').click();await p.locator('#edit-cancel').click();assert.deepEqual(await stored(),saved,'Cancel preserves saved overlapped layout');await close();
  await p.evaluate(async()=>{const {MGBACore}=await import('./src/core/mgba.js'),original=MGBACore.prototype.setKeys;window.keys=[];MGBACore.prototype.setKeys=function(k){keys.push(k);return original.call(this,k);};});
  await p.locator('#rom-input').setInputFiles({name:'Original overlay.gba',mimeType:'application/octet-stream',buffer:Buffer.from(require('./link.cjs').cartridge(31,992))});await p.locator('.game-launch').click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});
  for(const [width,height]of [[390,844],[844,390]]){
   await p.setViewportSize({width,height});await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const a=await p.locator('.skin-button[aria-label=A]').boundingBox(),s=await p.locator('#screen').boundingBox();near(center(a).x,center(s).x,'Saved overlap x');near(center(a).y,center(s).y,'Saved overlap y');
   await p.mouse.move(center(a).x,center(a).y);await p.mouse.down();assert.ok(await p.evaluate(()=>keys.at(-1)&1),'Overlaid translucent A sends input');await p.mouse.up();assert.equal(await p.evaluate(()=>keys.at(-1)),0);
   assert.equal(await p.locator('.skin-button[aria-label=A]').evaluate(e=>getComputedStyle(e).opacity),'0.45');
   await p.screenshot({path:path.join(dir,`${kind}-${width}-game.png`)});
  }
  assert.deepEqual(errors,[]);console.log(`PASS ${kind}: grid/snap/free drag, visible guides, centers/edges/symmetry, unequal sizes, fine keys, translucent overlap in editor/preview/game, actual input, orientation persistence and cancel.`);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
