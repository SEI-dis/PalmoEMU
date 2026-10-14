// SPDX-License-Identifier: AGPL-3.0-or-later
// Exercise actual CSP in a permitted blob script, not a DevTools evaluation.
const assert=require('node:assert/strict'),runtime=require('./browser-runtime.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';
(async()=>{
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  await page.goto(base);await page.locator('[data-tab=settings]').waitFor();
  const policy=await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  assert(policy.includes("'wasm-unsafe-eval'"));assert(!policy.includes("'unsafe-eval'"));
  await page.evaluate(()=>{
   const script=document.createElement('script');
   script.src=URL.createObjectURL(new Blob([`(async()=>{
    const result={evalBlocked:false,wasm:false};
    try{new Function('return 1')();}catch(error){result.evalBlocked=error.name==='EvalError';}
    try{await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0]));result.wasm=true;}catch{}
    window.cspProbe=result;
   })();`],{type:'text/javascript'}));
   script.onload=()=>{URL.revokeObjectURL(script.src);script.remove();};document.head.append(script);
  });
  await page.waitForFunction(()=>window.cspProbe);assert.deepEqual(await page.evaluate(()=>cspProbe),{evalBlocked:true,wasm:true});
  console.log('PASS '+kind+': actual page CSP blocks JavaScript string compilation while permitting WebAssembly.');
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
