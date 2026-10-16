// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'),base='https://example.test/app/',integrity='sha256-'+crypto.createHash('sha256').update('verified application asset').digest('base64');
function fixture(fetcher,{files=['asset.bin'],putError,openError}={}){
 const handlers=new Map(),entries=new Map(),calls=[],delays=[],cancelled=[],messages=[],deleted=[];
 const manifest={version:'new',files,shell:files,integrity:Object.fromEntries(files.map(file=>[file,integrity]))};
 const cache={match:async url=>entries.get(url)?.clone(),keys:async()=>[...entries.keys()].map(url=>({url})),delete:async url=>entries.delete(url),put:async(url,response)=>{if(putError)throw putError;entries.set(url,response.clone());}};
 const old={match:async()=>undefined,keys:async()=>[]};
 const context={URL,Response,Headers,crypto:crypto.webcrypto,btoa,APP_OFFLINE:manifest,importScripts(){},automaticUpdateCoordinator:()=>({activated(){}}),
  self:{location:{href:base+'sw.js'},addEventListener:(type,handler)=>handlers.set(type,handler)},
  caches:{keys:async()=>['manic-web:/app/:old'],open:async name=>{if(openError)throw openError;return name.endsWith(':old')?old:cache;},delete:async name=>deleted.push(name)},
  fetch:async(url,options)=>{calls.push({url,options});return fetcher(calls.length,url);},
  setTimeout(fn,ms){delays.push(ms);queueMicrotask(fn);}
 };
 vm.runInNewContext(source,context,{filename:'sw.js'});
 function event(type,extra={}){let result;handlers.get(type)({...extra,waitUntil:promise=>{result=promise;},respondWith:promise=>{result=promise;}});return result;}
 return {cache,entries,calls,delays,cancelled,messages,deleted,
  asset:()=>context.cacheAsset(cache,base+files[0],true),
  install:()=>event('install'),
  download:()=>event('message',{data:{type:'download'},ports:[{postMessage:message=>messages.push(message)}]}),
  runtime:()=>event('fetch',{request:{url:base+files[0],method:'GET',mode:'cors'}})
 };
}
function failedResponse(status,cancelled){return {ok:false,status,body:{cancel:async()=>cancelled.push(status)}};}
const success=()=>new Response('verified application asset');
function assertFetchSecurity(test){for(const {options}of test.calls){assert.equal(options.integrity,integrity);assert.equal(options.redirect,'error');assert.equal(options.cache,'no-cache');assert.equal(options.signal,undefined,'Downloads have no application timeout signal');}}
async function retirementProbe(activeVersion,wasActive){
 const handlers=new Map(),store=new Map(),cacheName='manic-web:/app/:new',oldName='manic-web:/app/:old',futureName='manic-web:/app/:future',release=base+'.offline-release.json';
 function cache(name){if(!store.has(name))store.set(name,new Map());const entries=store.get(name);return {match:async key=>entries.get(key)?.clone(),put:async(key,value)=>entries.set(key,value.clone()),keys:async()=>[...entries.keys()].map(url=>({url})),delete:async key=>entries.delete(key)};}
 await cache(cacheName).put(release,new Response(JSON.stringify({format:1,version:'new',files:['asset.bin'],integrity:{'asset.bin':integrity},active:wasActive,predecessors:[oldName]})));cache(oldName);cache(futureName);
 const active={state:'activated',postMessage(data,ports){assert.equal(data.probe,true,'Active-version queries cannot trigger recursive retirement');ports[0].postMessage({version:activeVersion});}};
 vm.runInNewContext(source,{URL,Response,Headers,crypto:crypto.webcrypto,btoa,MessageChannel:require('node:worker_threads').MessageChannel,setTimeout,clearTimeout,
  APP_OFFLINE:{version:'new',files:['asset.bin'],shell:['asset.bin'],integrity:{'asset.bin':integrity}},importScripts(){},automaticUpdateCoordinator:()=>({}),
  self:{location:{href:base+'sw.js'},registration:{active},addEventListener:(type,handler)=>handlers.set(type,handler)},
  caches:{open:async name=>cache(name),keys:async()=>[...store.keys()],delete:async name=>store.delete(name)},
 },{filename:'sw.js'});
 let pending;handlers.get('message')({data:{type:'app-version'},ports:[{postMessage(){}}],waitUntil:promise=>{pending=promise;}});await pending;
 const record=await(await cache(cacheName).match(release)).json();
 assert.equal(store.has(futureName),true,'Retirement never removes an unrecorded candidate');
 if(activeVersion==='new'){assert.equal(record.active,true);assert.deepEqual(record.predecessors,[]);assert.equal(store.has(oldName),false);}
 else{assert.equal(record.active,wasActive);assert.deepEqual(record.predecessors,[oldName]);assert.equal(store.has(oldName),true,'Waiting/stale workers cannot retire predecessor caches');}
}
(async()=>{
 await retirementProbe('new',false);await retirementProbe('older',false);await retirementProbe('newer',true);
 let test=fixture(attempt=>attempt===1?failedResponse(503,test.cancelled):success());
 await test.install();assert.equal(test.calls.length,2,'Installation recovers from one transient HTTP failure');assert.deepEqual(test.delays,[1000]);assert.deepEqual(test.cancelled,[503]);assert.equal(test.entries.size,2);assertFetchSecurity(test);

 test=fixture(attempt=>{if(attempt===1)throw new TypeError('Network or integrity failure');return success();});
 await test.download();assert.equal(test.calls.length,2,'Explicit offline download retries a rejected fetch');assert.deepEqual(test.delays,[1000]);assert.equal(test.messages.at(-1).ready,true);assert.equal(test.messages.at(-1).error,undefined);assertFetchSecurity(test);

 for(const status of [408,429,500,599]){
  test=fixture(attempt=>attempt===1?failedResponse(status,test.cancelled):success());await test.asset();assert.equal(test.calls.length,2,'Retries HTTP '+status);assert.deepEqual(test.cancelled,[status]);
 }
 for(const failure of ['fetch','http']){
  test=fixture(()=>{if(failure==='fetch')throw new TypeError('Network or integrity failure');return failedResponse(503,test.cancelled);});
  await assert.rejects(test.asset());assert.equal(test.calls.length,3,'Persistent '+failure+' failure is bounded at three attempts');assert.deepEqual(test.delays,[1000,3000]);assert.equal(test.entries.size,0);assertFetchSecurity(test);
 }
 test=fixture(()=>failedResponse(404,test.cancelled));await assert.rejects(test.asset());assert.equal(test.calls.length,1,'Missing files are not retried');assert.deepEqual(test.delays,[]);assert.deepEqual(test.cancelled,[404]);

 const quota=Object.assign(new Error('Storage unavailable'),{name:'QuotaExceededError'});
 test=fixture(success,{putError:quota});await assert.rejects(test.asset(),error=>error===quota);assert.equal(test.calls.length,1,'Cache writes are not retried');assert.deepEqual(test.delays,[]);
 test=fixture(success,{openError:quota});await assert.rejects(test.install(),error=>error===quota);assert.equal(test.calls.length,0,'Cache-open failure does not start network retries');assert.deepEqual(test.delays,[]);

 for(const failure of ['fetch','http']){
  test=fixture(()=>{if(failure==='fetch')throw new TypeError('Network or integrity failure');return failedResponse(503,test.cancelled);});
  assert.equal((await test.runtime()).status,503);assert.equal(test.calls.length,1,'Runtime '+failure+' failures still return immediately');assert.deepEqual(test.delays,[]);
 }
 test=fixture(()=>assert.fail('Cached files must not be fetched'));const cached=success();test.entries.set(base+'asset.bin',cached);assert.equal(await(await test.asset()).text(),await cached.clone().text());assert.deepEqual(test.delays,[]);

 let finish,settled=false;test=fixture(()=>new Promise(resolve=>{finish=resolve;}));const pending=test.asset().then(result=>{settled=true;return result;});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);assert.equal(test.calls.length,1);assert.deepEqual(test.delays,[],'A pending download has no timeout or retry timer');finish(success());await pending;assert.equal(settled,true);assert.equal(test.calls.length,1);

 let fail=true;test=fixture((_attempt,url)=>url.endsWith('second.bin')&&fail?failedResponse(503,test.cancelled):success(),{files:['first.bin','second.bin']});
 await assert.rejects(test.install());assert.ok(test.entries.has(base+'first.bin'),'Verified partial downloads survive a failed install');fail=false;await test.install();
 assert.equal(test.calls.filter(call=>call.url.endsWith('first.bin')).length,1,'A retry uses previously verified files');assert.equal(test.entries.size,3);assert.deepEqual(test.deleted,[],'Installing never removes the active version cache');assertFetchSecurity(test);
 console.log('PASS: active-only metadata repair/retirement, bounded install/offline retries, fetch integrity, non-retriable storage/404 errors, pending downloads, runtime isolation and verified partial-cache reuse.');
})().catch(error=>{console.error(error);process.exitCode=1;});
