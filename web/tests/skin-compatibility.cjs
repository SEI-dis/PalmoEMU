// SPDX-License-Identifier: AGPL-3.0-or-later
// This format test uses original test artwork and a synthetic cartridge only.
const assert=require('node:assert/strict'),{zip}=require('./skin-fixture.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',browserType=require('./browser-runtime.cjs')[kind];
(async()=>{
 const browser=await browserType.launch({headless:true,...(kind==='chromium'&&process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r));const base=process.env.TEST_URL||'http://127.0.0.1:4173/';await page.goto(base);
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=390;c.height=844;return c.toDataURL().split(',')[1];});
  const rect=(x,y,width,height)=>({x,y,width,height});
  const rep={mappingSize:{width:390,height:844},assets:{Large:'art.png'},screens:[{outputFrame:rect(0,0,390,390),filters:[{name:'CIGaussianBlur',parameters:{inputRadius:10}}]},{outputFrame:rect(0,80,390,260)}],items:[
   {inputs:['quickSave'],frame:rect(20,380,70,40)}, {inputs:['quickLoad'],frame:rect(120,380,70,40)}, {inputs:['toggleFastForward'],frame:rect(220,380,100,40)},
   {inputs:['fastForward'],frame:rect(220,460,100,40)}, {inputs:{up:'up',down:'down',left:'left',right:'right'},frame:rect(20,500,120,120),thumbstick:{name:'art.png',width:30,height:30}},
   {inputs:'a',frame:rect(220,550,70,70),extendedEdges:{right:20},asset:{normal:'art.png',selected:'art.png'},animation:{begin:rect(0,0,70,70),end:rect(0,4,70,66)},selfRetracting:true}
  ]};
  const info={name:'Original compatibility fixture',gameTypeIdentifier:'com.rileytestut.delta.game.gba',representations:{iphone:{edgeToEdge:{portrait:rep}},ipad:{standard:{portrait:{...rep,mappingSize:{width:768,height:1024}}}}}};
  const payload=zip({'info.json':JSON.stringify(info),'art.png':Buffer.from(png,'base64'),'sound.caf':Buffer.from('inert unsupported audio'),'unused.js':'throw new Error("must never execute")'});
  const skin=await page.evaluate(async({bytes,version})=>{try{const{importSkin}=await import('./src/skins.js');const r=await importSkin(new File([new Uint8Array(bytes)],'fixture.manicskin'));localStorage.setItem('manic-settings',JSON.stringify({skins:{gba:r.id},haptics:false}));localStorage.setItem('palmo-release-seen:'+new URL('.',location.href).pathname,version);return {variants:r.variants,warnings:r.warnings};}catch(e){return {error:String(e),stack:e?.stack};}},{bytes:[...payload],version:require('../package.json').version});assert.ok(!skin.error,JSON.stringify(skin));
  assert.equal(skin.variants.length,2);assert.match(skin.warnings.join(' '),/CAF/);
  const semantics=await page.evaluate(async()=>{
   const {normalizeSkin,chooseRepresentation}=await import('./src/skin-format.js');const db=await import('./src/storage.js');const saved=(await db.all('skins'))[0];
   const unknown=structuredClone(saved.variants[0]);unknown.screens[0].filters=[{name:'CINotImplemented'}];unknown.items.push({inputs:['restart','quit'],frame:{x:0,y:0,width:20,height:20}});
   const result=normalizeSkin({representations:{iphone:{standard:{portrait:unknown}}}},'gba',x=>x);
   return {phone:chooseRepresentation(saved,390,844).device,tablet:chooseRepresentation(saved,768,1024).device,warnings:result.warnings,blocked:result.portrait.items.at(-1).inputs};
  });
  assert.equal(semantics.phone,'iphone');assert.equal(semantics.tablet,'ipad');assert.equal(semantics.warnings.length,2);assert.deepEqual(semantics.blocked,['unsupportedMultipleActions']);
  // Verify actual pixels, source immutability, crop mapping, multi-screen updates and disposal.
  const pixels=await page.evaluate(async()=>{
   const{VideoOutput}=await import('./src/video.js'),{mountSkinScreens}=await import('./src/skin-screens.js');
   const host=document.createElement('div');document.body.append(host);const sources=[0,1].map(()=>{const c=document.createElement('canvas');host.append(c);return c;});
   const videos=sources.map(c=>new VideoOutput(c,256,192)),paint=(video,r,g)=>{const img=new ImageData(256,192);for(let i=0;i<img.data.length;i+=4){img.data[i]=r;img.data[i+1]=g;img.data[i+3]=255;}video.draw(img);};paint(videos[0],255,0);paint(videos[1],0,255);
   const rep={mappingSize:{width:256,height:384},screens:[{inputFrame:{x:0,y:0,width:128,height:192},outputFrame:{x:0,y:0,width:128,height:192}},{inputFrame:{x:0,y:192,width:256,height:192},outputFrame:{x:0,y:192,width:256,height:192}}]};
   const dispose=mountSkinScreens(host,{screens:sources},rep,'nds');const read=()=>[...host.querySelectorAll('.imported-screen')].map(c=>[...c.getContext('2d').getImageData(0,0,1,1).data]);const before=read();paint(videos[1],50,100);const after=read();dispose();const count=host.querySelectorAll('.imported-screen').length;const source=[...sources[0].getContext('2d').getImageData(0,0,1,1).data];host.remove();return{before,after,count,source};
  });
  assert.deepEqual(pixels.before,[[255,0,0,255],[0,255,0,255]]);assert.deepEqual(pixels.after[1],[50,100,0,255]);assert.deepEqual(pixels.source,[255,0,0,255]);assert.equal(pixels.count,0);
  const touch=await page.evaluate(async()=>{
   const {mountSkinInputs}=await import('./src/skin-inputs.js'),{normalizeSkin}=await import('./src/skin-format.js');
   const host=document.createElement('div');host.style.cssText='position:fixed;left:0;top:0;width:256px;height:384px';document.body.append(host);let point;
   const frame={x:0,y:192,width:256,height:192},top={x:0,y:0,width:256,height:192};
   const rep={mappingSize:{width:256,height:384},screens:[{inputFrame:top,outputFrame:top},{inputFrame:frame,outputFrame:frame}],items:[{inputs:{x:'touchScreenX',y:'touchScreenY'},touch:true,frame}]};
   const engine={touchAt:(x,y)=>point=[x,y],releaseTouch:()=>{},unlockAudio:()=>{}},api={engine,keybits:{},pressed:new Map(),updateKeys:()=>{},action:()=>{},paused:()=>false,haptic:()=>{},ratio:1};
   const hit=(x,y)=>host.querySelector('button').dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,clientX:x,clientY:y,bubbles:true}));
   // Synthetic pointer events cannot capture a real pointer; the DOM API is stubbed only for this geometry unit test.
   const capture=Element.prototype.setPointerCapture;Element.prototype.setPointerCapture=()=>{};
   try{
    let view=mountSkinInputs(host,rep,{},api);hit(64,336);const normal=point;view.destroy();
    rep.screens[1].filters=[{name:'CIAffineTransform',parameters:{inputTransform:{rotation:180}}}];view=mountSkinInputs(host,rep,{},api);hit(64,336);const rotated=point;view.destroy();
    view=mountSkinInputs(host,rep,{}, {...api,swap:true});hit(64,144);const swapped=point;view.destroy();
    const split=normalizeSkin({representations:{ipad:{splitView:{portrait:{mappingSize:{width:256,height:100},items:[],screens:[{placement:'app',inputFrame:top}]}}}}},'nds',x=>x);
    return {normal,rotated,swapped,splitHeight:split.portrait.mappingSize.height};
   }finally{Element.prototype.setPointerCapture=capture;host.remove();}
  });
  for(const [actual,expected]of [[touch.normal,[.25,.75]],[touch.rotated,[.75,.25]],[touch.swapped,[.25,.75]]])actual.forEach((n,i)=>assert.ok(Math.abs(n-expected[i])<.001));assert.equal(touch.splitHeight,292);
  await page.reload();await page.evaluate(async()=>{const{MGBACore}=await import('./src/mgba.js'),original=MGBACore.prototype.setSpeed;MGBACore.prototype.setSpeed=function(v){window.testEngine=this;return original.call(this,v);};});
  await page.locator('#rom-input').setInputFiles({name:'Original compatibility.gba',mimeType:'application/octet-stream',buffer:Buffer.from(require('./link.cjs').cartridge(31,992))});await page.locator('.game-launch').click();await page.locator('.game-info-play').click();await page.locator('#loading').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'toggleFastForward',exact:true}).tap();assert.equal(await page.evaluate(()=>testEngine.speed),2);
  await page.getByRole('button',{name:'quickSave',exact:true}).tap();await page.locator('#confirm-state-save').waitFor();assert.equal(await page.evaluate(()=>testEngine.paused),true);await page.locator('#confirm-state-save').click();await page.locator('#sheet').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'quickLoad',exact:true}).tap();await page.locator('#confirm-quick-load').waitFor();await page.locator('#cancel-quick-load').click();
  const hold=page.getByRole('button',{name:'fastForward',exact:true}),r=await hold.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();assert.equal(await page.evaluate(()=>testEngine.speed),5);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await page.evaluate(()=>testEngine.speed),2);await page.mouse.up();await page.locator('#resume-game').click();
  const thumb=page.locator('.skin-thumbstick');const pad=await page.getByRole('button',{name:'十字キー',exact:true}).boundingBox();await page.mouse.move(pad.x+pad.width-5,pad.y+pad.height/2);await page.mouse.down();assert.ok(await page.evaluate(()=>testEngine.keys&(1<<4)));assert.notEqual(await thumb.evaluate(el=>el.style.left),'50%');await page.mouse.up();assert.equal(await page.evaluate(()=>testEngine.keys),0);assert.equal(await thumb.evaluate(el=>el.style.left),'50%');
  await page.setViewportSize({width:768,height:1024});await page.waitForTimeout(100);assert.equal(await page.locator('.imported-screen').count(),2);
  assert.deepEqual(errors,[]);assert.ok(requests.filter(r=>/^https?:/.test(r.url())).every(r=>new URL(r.url()).origin===new URL(base).origin&&r.method()==='GET'&&!r.postData()));
  await context.close();console.log('PASS: variants, layers/crops/pixels, source preservation, shortcuts with confirmation, held speed release, thumbstick, warnings and no upload.');
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
