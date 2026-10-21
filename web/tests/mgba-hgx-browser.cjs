// SPDX-License-Identifier: AGPL-3.0-or-later
// Isolated synthetic HGX cartridge. No user files or browser profile.
const assert=require('node:assert/strict'),http=require('node:http');
const {cartridge}=require('./mgba-hgx.cjs'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium';
(async()=>{
 const staticServer=require('../scripts/serve.cjs').createStaticServer();
 const handler=staticServer.listeners('request')[0];
 const server=http.createServer((req,res)=>{
  if(req.url==='/__hgx.html'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>HGX regression</title><script src="/cores/mgba/mgba.js"></script>');}
  handler(req,res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/__hgx.html`);
  for(const [options,expected] of [[{compressed:true},[255,0,0]],[{ramPalette:true},[0,0,255]],[{invalid:true},[0,255,0]],[{hgx:false},[0,255,0]]]){
   const result=await page.evaluate(async bytes=>{
    const m=await createMGBA({print:()=>{},printErr:()=>{}});
    const put=(data,fn)=>{const p=m._malloc(data.length);try{m.HEAPU8.set(data,p);return fn(p,data.length);}finally{m._free(p);}};
    const pixels=()=>{for(let i=0;i<4;i++){m._web_frame(0);m._web_audio_read();}const p=m._web_rgba_pixels();return [...m.HEAPU8.slice(p,p+3)];};
    try{if(put(bytes,m._web_load)!==1)throw Error('ROM load failed');const before=pixels();
     const size=m._web_state_export();if(!size)throw Error('State export failed');
     const state=m.HEAPU8.slice(m._web_state_data(),m._web_state_data()+size);m._web_reset();
     if(put(state,m._web_state_import)!==1)throw Error('State import failed');return {before,after:pixels()};
    }finally{m._web_close();}
   },Array.from(cartridge(options)));
   assert.deepEqual(result,{before:expected,after:expected});
  }
  assert.deepEqual(errors,[]);console.log(`PASS: ${kind} HGX LZ77/RAM palette, unsafe fallback, ordinary ROM and state restoration (8 framebuffer checks).`);
 }finally{await browser?.close();server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
