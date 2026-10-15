// SPDX-License-Identifier: AGPL-3.0-or-later
// Metadata fixtures only. No actual ROMs, patches, tokens or external requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
(async()=>{
 const {parseStartRelease,needsStartUpdate,compareStartVersions,createStartUpdateService,startUpdateURL,startUpdateInterval,startUpdateStorageKey}=await import('../src/library/start-updates.js');
 const sha='a'.repeat(40),entry=(version='0.47.1')=>({path:`PokemonStart_v${version}.pks`,type:'blob',mode:'100644',size:21701997,sha});
 const tree=(entries=[entry()])=>({sha:'b'.repeat(40),truncated:false,tree:entries});
 const response=(data=tree())=>new Response(JSON.stringify(data));
 const game=(version,extra={})=>({id:version,system:'gba',filename:`PokemonStart_v${version}.gba`,...extra});
 assert.deepEqual(parseStartRelease(tree([entry('0.9.1'),entry('0.47.1'),entry('0.100.0')])),{version:'0.100.0',sha});
 assert.equal(compareStartVersions('0.47.10','0.47.2'),1);assert.equal(compareStartVersions('0.047.1','0.47.1'),null);
 for(const value of [{...tree(),truncated:true},tree([]),tree([entry(),entry()]),tree([{...entry(),type:'tree'}]),tree([{...entry(),sha:'<script>'}]),tree([{...entry(),mode:'120000'}]),tree([{...entry(),size:1e12}])])assert.throws(()=>parseStartRelease(value));
 const release=parseStartRelease(tree());
 assert(needsStartUpdate([game('0.46.0')],release));
 assert(!needsStartUpdate([game('0.46.0'),game('0.47.1')],release),'Retained old ROMs do not trigger repeat notices');
 assert(!needsStartUpdate([game('0.48.0')],release));
 assert(!needsStartUpdate([game('unknown')],release),'Unknown local version is not guessed');
 assert(!needsStartUpdate([game('0.46.0',{system:'nds'})],release));
 assert(!needsStartUpdate([game('0.46.0',{romMissing:true})],release));
 let time=100000000,online=true,calls=[],mode='ok';const store=new Map(),storage={getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)};
 const fetcher=async(url,options)=>{calls.push({url,options});if(mode==='bad')return response(tree([]));if(mode==='rate')return new Response('',{status:429,headers:{'retry-after':'7200'}});if(mode==='large')return new Response('x'.repeat(131073));if(mode==='reject')throw new TypeError('Offline');return response();};
 const service=()=>createStartUpdateService({storage,fetcher,now:()=>time,online:()=>online,locks:null});let client=service();
 await client.check();assert.equal(calls.length,1);assert.equal(client.snapshot().status,'ready');
 await client.check();await client.check({force:true});assert.equal(calls.length,1,'Initial one-minute throttle also applies to manual checks');
 client=service();await client.check();assert.equal(calls.length,1,'Reload reuses local metadata cache');
 time+=60001;await client.check({force:true});assert.equal(calls.length,2);
 online=false;time+=startUpdateInterval;await client.check({force:true});assert.equal(calls.length,2);assert.equal(client.snapshot().status,'offline');
 online=true;client.setEnabled(false);await client.check();assert.equal(calls.length,2);await client.check({force:true});assert.equal(calls.length,3,'Manual check works with auto check disabled');
 client.setEnabled(true);client.dismiss();assert.equal(client.snapshot().dismissed,'0.47.1:'+sha);
 for(const failure of ['bad','large','reject']){time+=startUpdateInterval;mode=failure;await client.check();assert.equal(client.snapshot().status,'error');assert.deepEqual(client.snapshot().release,release,'Failed checks preserve prior metadata without claiming it is current');const count=calls.length;await client.check({force:true});assert.equal(calls.length,count,'Backoff after failure');}
 time+=startUpdateInterval;mode='rate';await client.check();assert.equal(client.snapshot().retryAt,time+7200000);time+=startUpdateInterval;const count=calls.length;await client.check({force:true});assert.equal(calls.length,count);time+=startUpdateInterval;mode='ok';await client.check();assert.equal(client.snapshot().status,'ready');
 for(const call of calls){assert.equal(call.url,startUpdateURL);assert.equal(call.options.method,'GET');assert.equal(call.options.credentials,'omit');assert.equal(call.options.referrerPolicy,'no-referrer');assert.equal(call.options.redirect,'error');assert.equal(call.options.body,undefined);assert.deepEqual(call.options.headers,{Accept:'application/json'});}
 assert.deepEqual([...store.keys()],[startUpdateStorageKey]);assert(!store.get(startUpdateStorageKey).includes('.gba'));
 let unblock;const pendingClient=createStartUpdateService({storage:{getItem:()=>null,setItem(){}},now:()=>time,online:()=>true,locks:null,fetcher:()=>new Promise(resolve=>{unblock=resolve;})});
 const one=pendingClient.check(),two=pendingClient.check();assert.strictEqual(one,two);unblock(response());await one;
 const events=new Map(),network=[];const context={URL,Response,importScripts(){},automaticUpdateCoordinator:()=>({}),APP_OFFLINE:{files:[],version:'test'},self:{location:{href:'https://example.test/app/sw.js'},addEventListener:(type,handler)=>events.set(type,handler)},fetch:async(url,options)=>{network.push({url,options});return response();}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'),context);
 const request=(url,method='GET')=>{let promise;events.get('fetch')({request:{url,method,mode:'cors',headers:{Authorization:'private'},credentials:'include'},respondWith:value=>{promise=value;}});return promise;};
 assert.equal((await request(startUpdateURL)).status,200);assert.equal(network.length,1);assert.equal(network[0].options.credentials,'omit');assert.equal(network[0].options.referrerPolicy,'no-referrer');assert.equal(network[0].options.redirect,'error');assert.deepEqual(Object.keys(network[0].options.headers),['Accept']);
 for(const url of [startUpdateURL+'?rom=private',startUpdateURL+'#private',startUpdateURL+'/extra','https://api.github.com/repos/other/private','https://raw.githubusercontent.com/pm-start/PokemonStart/main/example.pks'])assert.equal((await request(url)).status,403);
 for(const method of ['POST','PUT','DELETE','PATCH'])assert.equal((await request(startUpdateURL,method)).status,405);
 assert.equal(network.length,1,'Only fixed metadata GET reaches the network');
 console.log('PASS: release parsing, numeric versions, retained ROM/unknown handling, cache/reload/offline/opt-out, manual throttling, failure/rate backoff, deduplication and strict SW metadata-only requests.');
})().catch(error=>{console.error(error);process.exitCode=1;});
