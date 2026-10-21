// SPDX-License-Identifier: AGPL-3.0-or-later
// App build: eb73db9772e24a90
// Message keys are localized by the requesting page.
const tr=source=>source;
importScripts('./offline-manifest.js');
importScripts('./src/updates/auto-update-worker.js');
const base=new URL('./',self.location.href),prefix='manic-web:'+base.pathname+':',cacheName=prefix+APP_OFFLINE.version;
const autoUpdate=automaticUpdateCoordinator(base);
const urls=APP_OFFLINE.files.map(f=>new URL(f,base).href),allowed=new Set(urls);
const integrities=new Map(APP_OFFLINE.files.map(file=>[new URL(file,base).href,APP_OFFLINE.integrity?.[file]]));
const releaseKey=new URL('.offline-release.json',base).href;
const failureKey=new URL('.offline-failure.json',base).href;
const progress={done:0,total:0,bytes:0,totalBytes:0,reused:0,downloaded:0};
const assetSize=url=>APP_OFFLINE.sizes?.[url.slice(base.href.length)]||1;
const previousCaches=async()=> (await caches.keys()).filter(name=>name.startsWith(prefix)&&name!==cacheName);
async function readRelease(cache){
 try{const value=await(await cache.match(releaseKey))?.json();return value?.format===1&&Array.isArray(value.files)&&value.integrity&&typeof value.integrity==='object'?value:null;}catch{return null;}
}
async function writeRelease(cache,active,full=false,predecessors){
 const old=await readRelease(cache);
 await cache.put(releaseKey,new Response(JSON.stringify({format:1,version:APP_OFFLINE.version,files:APP_OFFLINE.files,integrity:APP_OFFLINE.integrity,active,full:full||old?.full===true,predecessors:predecessors??old?.predecessors??[]}),{headers:{'Content-Type':'application/json'}}));
}
async function readFailure(cache){try{return await(await cache.match(failureKey))?.json()||null;}catch{return null;}}
async function recordFailure(names,error){
 const reason=error?.name==='QuotaExceededError'?'quota':'download',now=Date.now();let estimate;
 try{estimate=await self.navigator?.storage?.estimate();}catch{}
 // Persist in the active/older cache, not the failed candidate cache which
 // WebKit may discard. Only app-update metadata, never game storage.
 for(const name of names)try{
  const cache=await caches.open(name),old=await readFailure(cache);
  const retryAfter=reason==='quota'?(old?.version===APP_OFFLINE.version&&old.retryAfter>now?old.retryAfter:now+30*60*1000):0;
  await cache.put(failureKey,new Response(JSON.stringify({version:APP_OFFLINE.version,reason,at:now,retryAfter,usage:estimate?.usage,quota:estimate?.quota}),{headers:{'Content-Type':'application/json'}}));
 }catch{}
}
async function verifiedCached(cache,url){
 const response=await cache.match(url);if(!response?.ok||response.status!==200||response.type==='opaque'||response.redirected)return null;
 // Never trust a previous manifest or a filename alone. Check the actual body
 // against THIS release, including legacy and interrupted-install caches.
 const bytes=await response.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',bytes);
 const digest='sha256-'+btoa(String.fromCharCode(...new Uint8Array(hash)));
 if(digest!==integrities.get(url))return null;
 // Materialize an independent, verified body. These bytes are already decoded;
 // retain MIME/CSP but not transport encoding/length.
 const headers=new Headers(response.headers);headers.delete('Content-Encoding');headers.delete('Content-Length');
 return new Response(bytes,{status:200,statusText:response.statusText,headers});
}
async function cacheSources(names,index=false){
 const sources=[];
 for(const name of names){
  try{
   const cache=await caches.open(name);
   sources.push({name,cache,...(index?{keys:new Set((await cache.keys()).map(key=>key.url)),record:await readRelease(cache)}:{})});
  }catch(error){if(index)throw error;}
 }
 return sources;
}
async function reuseAsset(cache,url,sources,requireCopy=true){
 for(const source of sources){
  if(source.keys&&!source.keys.has(url))continue;
  let response;try{response=await verifiedCached(source.cache,url);}catch{continue;}
  if(response){try{await cache.delete(url);await cache.put(url,response.clone());}catch(error){if(requireCopy)throw error;}return response;}
 }
 return null;
}
function installationPlan(sources){
 if(!sources.length)return APP_OFFLINE.shell.map(file=>new URL(file,base).href);
 const stored=new Set();let previous;
 for(const {name,keys,record} of [...sources].reverse()){
  for(const url of keys)if(allowed.has(url))stored.add(url);
  if(!previous&&record?.active&&name===prefix+record.version)previous={record,keys};
 }
 // Old workers did not record their manifest. One migration retains their
 // full staging policy, while still reusing all matching cached bodies.
 if(!previous)return urls;
 const {record,keys}=previous;
 if(record.full||record.files.every(file=>keys.has(new URL(file,base).href)))return urls;
 const shell=new Set(APP_OFFLINE.shell.map(file=>new URL(file,base).href));
 // Stage changed optional resources even if not used yet: the old page can
 // start using one AFTER this snapshot. Unchanged late arrivals can be carried
 // across activation without any network request; changed ones are ready now.
 return urls.filter(url=>shell.has(url)||stored.has(url)||record.integrity[url.slice(base.href.length)]!==integrities.get(url));
}
async function carryForward(cache,names){
 const present=new Set((await cache.keys()).map(request=>request.url)),retired=[];
 for(const name of names){
  let copied=true;
  try{const old=await caches.open(name);for(const request of await old.keys())if(allowed.has(request.url)&&!present.has(request.url)){
   const response=await verifiedCached(old,request.url);if(response){await cache.put(request.url,response);present.add(request.url);}
  }}catch{copied=false;}
  if(copied)retired.push(name);
 }
 return retired;
}
async function finishRetirement(cache,retired){
 const record=await readRelease(cache);if(!record?.active)return;
 const existing=new Set(await caches.keys()),names=(record.predecessors||[]).filter(name=>name.startsWith(prefix)&&name!==cacheName&&existing.has(name));
 retired??=await carryForward(cache,names);
 for(const name of retired)if(names.includes(name))try{await caches.delete(name);}catch{}
 const remaining=new Set(await caches.keys());await writeRelease(cache,true,false,names.filter(name=>remaining.has(name)));
}
async function ownsActiveRelease(){
 const worker=self.registration?.active;if(!worker||worker.state!=='activated')return false;
 // All versions use the same script URL. Ask the registered active worker for
 // its content version; a stale or waiting worker must never repair metadata
 // or retire caches merely because a page still holds its message endpoint.
 return new Promise(resolve=>{
  const channel=new MessageChannel(),finish=value=>{clearTimeout(timer);channel.port1.close();channel.port2.close();resolve(value);};
  const timer=setTimeout(()=>finish(false),2000);
  channel.port1.onmessage=event=>finish(event.data?.version===APP_OFFLINE.version&&worker===self.registration.active&&worker.state==='activated');
  try{worker.postMessage({type:'app-version',probe:true},[channel.port2]);}catch{finish(false);}
 });
}
async function cacheAsset(cache,url,retry=false){
 const hit=await cache.match(url);if(hit)return hit;
 const integrity=integrities.get(url);
 if(!/^sha256-[A-Za-z0-9+/]{43}=$/.test(integrity||''))throw new Error(tr('アプリのファイルを確認できませんでした。アプリを更新してから、もう一度お試しください。'));
 // Integrity is checked by fetch before any bytes reach the cache or a caller.
 // An old worker must never execute newly deployed core/vendor files alongside
 // its old shell. Missing old resources require an application update instead.
 let response;
 for(let attempt=0;;attempt++){
  response=null;
  try{response=await fetch(url,{cache:'no-cache',integrity,redirect:'error'});}catch{
   // Fetch does not distinguish transport failures from an integrity mismatch.
   if(!retry||attempt===2)throw new Error(tr('アプリのファイルを確認できませんでした。アプリを更新してから、もう一度お試しください。'));
  }
  if(response?.ok)break;
  // Release an unsuccessful response before retrying, without delaying failure.
  try{void response?.body?.cancel().catch(()=>{});}catch{}
  const transient=!response||[408,429].includes(response.status)||(response.status>=500&&response.status<=599);
  if(!retry||!transient||attempt===2)throw new Error(tr('ダウンロードに失敗しました。接続を確認してください。'));
  response=null;
  await new Promise(resolve=>setTimeout(resolve,attempt===0?1000:3000));
 }
 await cache.put(url,response.clone());return response;
}
// Update reuse is content-verified, independent of HTTP freshness or ETags.
self.addEventListener('install',e=>e.waitUntil((async()=>{
 const names=await previousCaches();try{
 const sources=await cacheSources(names,true);
 for(const {cache} of sources){const failure=await readFailure(cache);if(failure?.version===APP_OFFLINE.version&&failure.reason==='quota'&&failure.retryAfter>Date.now())throw new DOMException('Update storage retry deferred','QuotaExceededError');}
 const needed=installationPlan(sources),cache=await caches.open(cacheName),present=new Set((await cache.keys()).map(key=>key.url));
 Object.assign(progress,{done:0,total:needed.length,bytes:0,totalBytes:needed.reduce((sum,url)=>sum+assetSize(url),0),reused:0,downloaded:0});
 // Keep successful, verified downloads for a retry of this exact build. Only a
 // fully staged install can activate; a failed attempt leaves the old worker.
 let next=0,failure;await Promise.all(Array.from({length:4},async()=>{while(!failure&&next<needed.length){const url=needed[next++];try{
  // Snapshot only presence, never trust it as proof of valid contents. Each
  // reused body still passes this build's hash check. Missing entries need no
  // per-file Cache Storage lookup; late arrivals are preserved at activation.
  const local=present.has(url)?await verifiedCached(cache,url):null;
  // Recommit verified partial entries. WebKit can retain an in-worker view of
  // a failed install's records after dropping their persistent backing store.
  if(local){await cache.delete(url);await cache.put(url,local.clone());}
  const cached=local||await reuseAsset(cache,url,sources);
  if(cached)progress.reused++;else{await cache.delete(url);await cacheAsset(cache,url,true);progress.downloaded++;}
  progress.done++;progress.bytes+=assetSize(url);
 }catch(error){failure=error;}}}));
 if(failure)throw failure;
 await writeRelease(cache,false,false,names);
 }catch(error){await recordFailure(names,error);throw error;}
})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 const cache=await caches.open(cacheName),record=await readRelease(cache);
 // All old pages have stopped, or the coordinator holds their version leases.
 // Preserve assets acquired while this worker was installing/waiting. No
 // activation-time network dependency, including natural last-tab activation.
 const names=(record?.predecessors||[]).filter(name=>name.startsWith(prefix)&&name!==cacheName);
 let retired=[];try{retired=await carryForward(cache,names);}catch{}
 // On a storage error retain fallback caches. Runtime verifies their bodies;
 // a later startup retries cleanup from this durable predecessor list.
 try{await writeRelease(cache,true);}catch{}
 await self.clients.claim();
 try{await finishRetirement(cache,retired);}catch{}
 autoUpdate.activated();
})()));
self.addEventListener('fetch',e=>{
 // Reject accidental writes before they reach any HTTP server once this worker
 // controls the page. First-load protection still depends on the app and CSP.
 if(!['GET','HEAD'].includes(e.request.method)){e.respondWith(new Response(null,{status:405,headers:{Allow:'GET, HEAD'}}));return;}
 const u=new URL(e.request.url);u.hash=''; // Tab/game fragments are local UI state, not a different app file.
 // Fixed public metadata GETs. Recreate them so caller-provided credentials,
 // headers, query strings and bodies cannot be forwarded. Never cache PKS/ROMs.
 const metadataAccept=e.request.url==='https://api.github.com/repos/pm-start/PokemonStart/git/trees/main'?'application/json':e.request.url==='https://raw.githubusercontent.com/pm-start/PokemonStart/main/README.md'?'text/plain':null;
 if(e.request.method==='GET'&&metadataAccept){
  e.respondWith(fetch(e.request.url,{method:'GET',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store',headers:{Accept:metadataAccept}}).catch(()=>new Response(null,{status:503})));return;
 }
 if(e.request.mode!=='navigate'&&(u.origin!==base.origin||u.search)){e.respondWith(new Response(null,{status:403}));return;}
 if(e.request.method!=='GET'||u.origin!==base.origin||u.search)return;
 if(u.href===base.href)u.pathname+='index.html';if(!allowed.has(u.href))return;
 e.respondWith((async()=>{try{const cache=await caches.open(cacheName);return await cache.match(u.href)||await reuseAsset(cache,u.href,await cacheSources(await previousCaches()),false)||await cacheAsset(cache,u.href);}catch{return new Response(null,{status:503,statusText:'Application file unavailable for this version'});}})());
});
self.addEventListener('message',e=>{
 const port=e.ports[0];if(!port)return;
 if(e.data?.type==='app-version'){
  port.postMessage({version:APP_OFFLINE.version});
  if(e.data.probe===true)return;
  // Only recorded predecessors are retired, never a newer installing worker.
  // Activation may have succeeded while its active metadata write failed. Once
  // storage recovers, repair that marker before retrying verified carry-over.
  e.waitUntil((async()=>{
   const cache=await caches.open(cacheName),record=await readRelease(cache);
   if(record?.version!==APP_OFFLINE.version||!record.predecessors?.length||!await ownsActiveRelease())return;
   if(!record.active)await writeRelease(cache,true);
   await finishRetirement(cache);
  })().catch(()=>{}));return;
 }
 if(e.data?.type==='update-progress'){port.postMessage({...progress});return;}
 if(e.data?.type==='update-failure'){e.waitUntil(caches.open(cacheName).then(readFailure).then(failure=>port.postMessage(failure)));return;}
 if(e.data?.type==='retry-update'){
  if(!e.source?.url?.startsWith(base.href)){port.postMessage(null);return;}
  e.waitUntil((async()=>{for(const name of [cacheName,...await previousCaches()])await(await caches.open(name)).delete(failureKey);port.postMessage({ok:true});})().catch(()=>port.postMessage(null)));return;
 }
 if(e.data?.type==='auto-update'){
  e.waitUntil(autoUpdate.apply(e.source).then(applied=>port.postMessage({applied})).catch(()=>port.postMessage({applied:false})));
  return;
 }
 if(e.data?.type==='activate-update'){
  e.waitUntil((async()=>{const sender=e.source?.url?new URL(e.source.url):null;if(!sender||sender.href!==new URL('update.html',base).href)throw new Error(tr('更新画面から操作してください。'));const open=await self.clients.matchAll({type:'window',includeUncontrolled:true});if(open.some(c=>c.id!==e.source.id&&c.url.startsWith(base.href)))throw new Error(tr('この画面以外のアプリのタブを閉じてください。'));port.postMessage({ok:true});await self.skipWaiting();})().catch(err=>port.postMessage({error:err.message})));
  return;
 }
 e.waitUntil((async()=>{const cache=await caches.open(cacheName),selection=e.data?.selection;let needed=urls;
 if(selection!==undefined){
  if(!selection||!Array.isArray(selection.cores)||!Array.isArray(selection.files)||selection.cores.length>32||selection.files.length>APP_OFFLINE.files.length)throw Error(tr('オフライン保存を開始できませんでした。画面を開き直してください。'));
  if(selection.cores.some(name=>typeof name!=='string'||!/^[a-z0-9-]+$/.test(name))||selection.files.some(file=>typeof file!=='string'||!APP_OFFLINE.files.includes(file)))throw Error(tr('オフライン保存を開始できませんでした。画面を開き直してください。'));
  const selected=new Set([...(APP_OFFLINE.playback||APP_OFFLINE.shell),...selection.files]);
  for(const file of APP_OFFLINE.files)if(selection.cores.some(name=>file.startsWith('cores/'+name+'/')))selected.add(file);
  needed=[...selected].map(file=>new URL(file,base).href);
 }
 if(e.data?.type==='download'){
   let done=0;for(const url of needed){await cacheAsset(cache,url,true);port.postMessage({progress:++done,total:needed.length});}await writeRelease(cache,true,selection===undefined);
 }else if(e.data?.type!=='status')throw new Error(tr('オフライン保存を開始できませんでした。画面を開き直してください。'));
 // Completeness depends on presence, not the response bodies. One key snapshot
 // avoids opening every cached core/asset just to count the available files.
 const present=new Set((await cache.keys()).map(key=>key.url));
 let count=0,missingBytes=0;for(const url of needed)if(present.has(url))count++;else missingBytes+=assetSize(url);port.postMessage({done:true,ready:count===needed.length,cached:count,total:needed.length,bytes:needed.reduce((sum,url)=>sum+assetSize(url),0),missingBytes,version:APP_OFFLINE.version});
 })().catch(err=>port.postMessage({done:true,error:err.message})));
});
