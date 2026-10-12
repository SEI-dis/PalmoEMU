// SPDX-License-Identifier: AGPL-3.0-or-later
// Each test owns its browser server. Explicitly stop it even when a browser
// driver fails to complete its normal close handshake on Windows.
const runtime=require(process.env.PLAYWRIGHT_MODULE||'playwright');
module.exports=Object.fromEntries(['chromium','webkit','firefox'].map(name=>[name,new Proxy(runtime[name],{get(target,key){
 if(key!=='launch')return Reflect.get(target,key);
 return async options=>{
  const server=await target.launchServer(options);
  let browser;
  try{browser=await target.connect(server.wsEndpoint());}catch(error){await server.kill();throw error;}
  // Existing Japanese UI assertions must not depend on the CI host's locale.
  // Localization tests override this default with explicit browser locales.
  for(const method of ['newContext','newPage']){
   const create=browser[method].bind(browser);
   browser[method]=options=>create({locale:'ja-JP',...options});
  }
  const close=browser.close.bind(browser);let closed=false;
  browser.close=async()=>{
   if(closed)return;closed=true;let timer;
   try{await Promise.race([(async()=>{await close();await server.close();})(),new Promise(resolve=>{timer=setTimeout(resolve,5000);})]);}
   finally{
    clearTimeout(timer);
    const process=server.process();
    if(process.exitCode===null){
     if(global.process.platform==='win32'){
      const result=require('node:child_process').spawnSync('taskkill',['/PID',String(process.pid),'/T','/F'],{windowsHide:true,encoding:'utf8',timeout:10000});
      if(result.error)throw result.error;
     }else process.kill('SIGKILL');
    }
    server.kill().catch(()=>{});
   }
  };
  return browser;
 };
}})]));
