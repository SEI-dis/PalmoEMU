// SPDX-License-Identifier: AGPL-3.0-or-later
// Only original in-memory cartridges and isolated Playwright storage.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const kind=process.env.BROWSER_ENGINE||'chromium',pw=require('./browser-runtime.cjs'),roms=require('./cartridges.cjs');
const buttons={gb:['a','b','select','start'],gbc:['a','b','select','start'],gba:['a','b','l','r','select','start'],nes:['a','b','select','start'],snes:['a','b','x','y','l','r','select','start'],md:['a','b','c','x','y','z','select','start']};
const inputBits={a:0,b:1,select:2,start:3,right:4,left:5,up:6,down:7,r:8,l:9,x:10,y:11,c:12,z:13};
const retroBits={a:8,b:0,select:2,start:3,right:7,left:6,up:4,down:5,r:11,l:10,x:9,y:1};
const mdBits={...retroBits,a:1,c:8,x:10,y:9,z:11};
(async()=>{
 const browser=await pw[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),p=await ctx.newPage(),errors=[],remote=[];
  p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(20000);
  const base=process.env.TEST_URL||'http://127.0.0.1:4173/';p.on('request',r=>{if(/^https?:/.test(r.url())&&(!r.url().startsWith(base)||r.method()!=='GET'))remote.push(r.url());});await p.goto(base);
  const variants=await p.evaluate(async expected=>{
   const {builtinSkin,builtinLayout,builtins}=await import('./src/skins/skin-art.js'),bodies=new Set();let count=0;
   for(const [system,keys]of Object.entries(expected))for(const [color]of builtins){
    const skin=builtinSkin(system,color);if(color==='classic')bodies.add(skin.images.background);
    for(const [w,h]of [[320,568],[390,844],[844,390],[750,369],[768,1024],[1024,768]]){
     const rep=builtinLayout(skin,w,h),actual=rep.items.filter(i=>Array.isArray(i.inputs)).map(i=>i.inputs[0]).sort();
     if(JSON.stringify(actual)!==JSON.stringify([...keys].sort()))throw Error(system+' button contract');
     for(const item of rep.items)if(!skin.images[item.asset.normal])throw Error(system+' missing artwork');
     const f=key=>rep.items.find(i=>i.inputs?.[0]===key).frame,a=f('a'),b=f('b');
     if(system==='nes'&&(a.x<=b.x||Math.abs(a.y-b.y)>.01))throw Error('FC horizontal B/A');
     if(['gb','gbc','gba'].includes(system)&&(a.x<=b.x||a.y>=b.y))throw Error('Handheld diagonal B/A');
     if(system==='snes'&&!(f('x').y<a.y&&b.y>a.y&&f('y').x<a.x))throw Error('SFC diamond');
     if(system==='md'&&!(f('x').width<a.width&&f('x').y<a.y&&a.x<b.x&&b.x<f('c').x))throw Error('MD six-button rows');
     count++;
    }
   }
   if(bodies.size!==6)throw Error('Each system needs its own artwork');return count;
  },buttons);assert.equal(variants,180);
  // Observe the native-facing input values, not merely the rendered labels.
  await p.evaluate(async()=>{
   for(const [file,name]of [['mgba','MGBACore'],['retro','RetroCore']]){
    const Type=(await import(`./src/${file}.js`))[name],set=Type.prototype.setKeys;
    Type.prototype.setKeys=function(mask){set.call(this,mask);(window.skinInputs??=[]).push(this.keys);};
   }
  });
  const settle=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const dir=path.join(__dirname,'../test-results/system-skins');fs.mkdirSync(dir,{recursive:true});
  for(const [system,keys]of Object.entries(buttons)){
   const bytes=system==='gba'?require('./link.cjs').cartridge(31,992):roms[system]();
   await p.locator('#rom-input').setInputFiles({name:`Original skin ${system}.${system==='snes'?'sfc':system}`,mimeType:'application/octet-stream',buffer:Buffer.from(bytes)});
   await p.getByRole('button',{name:`Original skin ${system}の設定を開く`,exact:true}).click();await p.locator('.game-info-play').click();await p.locator('#loading').waitFor({state:'hidden'});
   assert.equal(await p.locator('.skin-button').count(),keys.length+1);
   const map=['gb','gbc','gba'].includes(system)?inputBits:system==='md'?mdBits:retroBits;
   for(const [width,height]of [[390,844],[844,390]]){
    await p.setViewportSize({width,height});await settle();
    for(const key of [...keys,'up','down','left','right']){
     const label=system==='md'&&key==='select'?'MODE':key.toUpperCase(),direction=['up','down','left','right'].includes(key);
     const r=await p.locator(direction?'.skin-button.dpad':`.skin-button[aria-label="${label}"]`).boundingBox();
     const x=r.x+r.width*(key==='left'?.18:key==='right'?.82:.5),y=r.y+r.height*(key==='up'?.18:key==='down'?.82:.5);
     await p.evaluate(()=>window.skinInputs=[]);await p.mouse.move(x,y);await p.mouse.down();
     assert.ok(await p.evaluate(bit=>window.skinInputs.includes(1<<bit),map[key]),system+' '+key+' reaches the core');
     await p.mouse.up();assert.equal(await p.evaluate(()=>window.skinInputs.at(-1)),0,system+' '+key+' releases');
    }
    await p.locator('#toast').evaluate(e=>e.style.visibility='hidden');await p.screenshot({path:path.join(dir,`${kind}-${system}-${width}x${height}.png`)});
   }
   // Safe-area hit targets and canvas stay inside the usable iPhone rectangle.
   await p.locator('#player').evaluate(e=>e.style.padding='0px 47px 21px');await settle();
   const contained=await p.locator('#skin').evaluate(e=>[...e.querySelectorAll('.skin-button,#screen')].every(c=>{const r=c.getBoundingClientRect();return r.left>=46.9&&r.right<=innerWidth-46.9&&r.bottom<=innerHeight-20.9;}));assert.equal(contained,true,system+' safe area');
   await p.locator('#player-menu').click();await p.locator('[data-action=exit]').click();await p.locator('#player').waitFor({state:'hidden'});
   await p.locator('#player').evaluate(e=>e.style.removeProperty('padding'));await p.setViewportSize({width:390,height:844});
  }
  await p.locator('[data-tab=settings]').click();await p.locator('#content [data-action=skins]').click();
  for(const system of Object.keys(buttons)){
   await p.locator('#skin-system').selectOption(system);await p.locator('#skin-preview .skin-mini').waitFor();assert.equal(await p.locator('#skin-description').textContent(),'','Standard skins have no compatibility warnings');
   assert.equal(await p.locator('#skin-grid').getAttribute('data-selection'),'builtin:classic');
  }
  for(const [width,height]of [[240,320],[320,568],[390,844],[844,390]]){
   await p.setViewportSize({width,height});await settle();
   const swatches=await p.locator('#skin-colors button').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return {w:r.width,h:r.height,x:r.x,right:r.right};}));
   for(const r of swatches){assert.ok(Math.abs(r.w-r.h)<.2,'Palette swatches remain round');assert.ok(r.x>=0&&r.right<=width+.1,'Five palettes fit narrow screens');}
  }
  await p.setViewportSize({width:390,height:844});await settle();
  await p.locator('#skin-system').selectOption('md');await p.locator('#edit-controls').click();assert.equal(await p.locator('#edit-selection option[value=select]').textContent(),'MODE');await p.locator('#edit-cancel').click();await p.locator('#close-sheet').click();
  assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
  // A visual contact sheet of the actual SVG components, without game artwork.
  for(const wide of [false,true]){
   await p.setViewportSize({width:1200,height:wide?580:550});
   await p.evaluate(async wide=>{
    const {builtinSkin,builtinLayout}=await import('./src/skins/skin-art.js');document.body.replaceChildren();document.body.style.cssText='margin:0;padding:24px;background:#101114;color:#ededf1;font-family:Arial,sans-serif;overflow:hidden';
    const title=document.createElement('div');title.textContent='PalmoEMU / SYSTEM SKINS · '+(wide?'LANDSCAPE':'PORTRAIT');title.style.cssText='font-size:13px;letter-spacing:2px;margin-bottom:20px';document.body.append(title);
    const gallery=document.createElement('div');gallery.style.cssText=`display:grid;grid-template-columns:repeat(${wide?3:6},1fr);gap:20px`;document.body.append(gallery);
    const css=(f,map)=>`left:${f.x/map.width*100}%;top:${f.y/map.height*100}%;width:${f.width/map.width*100}%;height:${f.height/map.height*100}%;`;
    for(const system of ['gb','gbc','gba','nes','snes','md']){
     const skin=builtinSkin(system),rep=builtinLayout(skin,wide?844:390,wide?390:844),map=rep.mappingSize,card=document.createElement('div');card.style.minWidth='0';
     card.innerHTML=`<p style="font-size:12px;margin:0 0 10px">${skin.name.replace(' · 機種標準','')}</p><div class="skin-mini" style='width:100%;aspect-ratio:${map.width}/${map.height};background-image:url("${skin.images.responsive}")'>${rep.screens.map(s=>`<div class="skin-mini-screen" style="${css(s.outputFrame,map)}"><span>${system.toUpperCase()}</span></div>`).join('')}${rep.items.map(i=>`<span class="skin-mini-button" style='${css(i.frame,map)}background-image:url("${skin.images[i.asset.normal]}")'></span>`).join('')}${rep.actions.map(a=>`<span class="skin-mini-tool" data-control="${a.id}" style="${css(a.frame,map)}font-size:6px">${a.label}</span>`).join('')}</div>`;
     gallery.append(card);
    }
    await Promise.all([...document.querySelectorAll('.skin-mini,.skin-mini-button')].map(e=>{const img=new Image();img.src=e.style.backgroundImage.slice(5,-2);return img.decode();}));
   },wide);await p.screenshot({path:path.join(dir,kind+(wide?'-landscape-gallery.png':'-portrait-gallery.png'))});
  }
  console.log(`PASS ${kind}: 180 skin variants; all six cores, every button and dpad direction in portrait/landscape; native input release, safe areas, system descriptions and MD MODE labels.`);
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
