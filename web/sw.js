// SPDX-License-Identifier: AGPL-3.0-or-later
// App build: e548a9bac3fc4afb
// Message keys are localized by the requesting page.
const tr=source=>source;
importScripts('./offline-manifest.js');
importScripts('./src/updates/auto-update-worker.js');
const base=new URL('./',self.location.href),prefix='manic-web:'+base.pathname+':',cacheName=prefix+APP_OFFLINE.version;
const autoUpdate=automaticUpdateCoordinator(base);
const urls=APP_OFFLINE.files.map(f=>new URL(f,base).href),allowed=new Set(urls);
const integrities=new Map(APP_OFFLINE.files.map(file=>[new URL(file,base).href,APP_OFFLINE.integrity?.[file]]));
async function cacheAsset(cache,url){
 const hit=await cache.match(url);if(hit)return hit;
 const integrity=integrities.get(url);
 if(!/^sha256-[A-Za-z0-9+/]{43}=$/.test(integrity||''))throw new Error(tr('アプリのファイルを確認できませんでした。アプリを更新してから、もう一度お試しください。'));
 // Integrity is checked by fetch before any bytes reach the cache or a caller.
 // An old worker must never execute newly deployed core/vendor files alongside
 // its old shell. Missing old resources require an application update instead.
 let response;try{response=await fetch(url,{cache:'no-cache',integrity,redirect:'error'});}catch{throw new Error(tr('アプリのファイルを確認できませんでした。アプリを更新してから、もう一度お試しください。'));}
 if(!response.ok)throw new Error(tr('ダウンロードに失敗しました。接続を確認してください。'));
 await cache.put(url,response.clone());return response;
}
// A new Cache Storage version must not inherit still-fresh files from the HTTP cache.
self.addEventListener('install',e=>e.waitUntil((async()=>{
 // First install loads the shell; updates stage the complete application.
 // A core or offline download may finish in the old page during installation.
 // Staging every app file avoids losing those resources when old caches retire.
 const isUpdate=(await caches.keys()).some(name=>name.startsWith(prefix)&&name!==cacheName);
 const needed=isUpdate?urls:APP_OFFLINE.shell.map(f=>new URL(f,base).href);
 const cache=await caches.open(cacheName);
 // Keep successful, verified downloads for a retry of this exact build. Only a
 // fully staged install can activate; a failed attempt leaves the old worker.
 let next=0,failure;await Promise.all(Array.from({length:4},async()=>{while(!failure&&next<needed.length){const url=needed[next++];try{await cacheAsset(cache,url);}catch(error){failure=error;}}}));
 if(failure)throw failure;
})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith(prefix)&&name!==cacheName)await caches.delete(name);await self.clients.claim();autoUpdate.activated();})()));
self.addEventListener('fetch',e=>{
 // Reject accidental writes before they reach any HTTP server once this worker
 // controls the page. First-load protection still depends on the app and CSP.
 if(!['GET','HEAD'].includes(e.request.method)){e.respondWith(new Response(null,{status:405,headers:{Allow:'GET, HEAD'}}));return;}
 const u=new URL(e.request.url);u.hash=''; // Tab/game fragments are local UI state, not a different app file.
 if(e.request.mode!=='navigate'&&(u.origin!==base.origin||u.search)){e.respondWith(new Response(null,{status:403}));return;}
 if(e.request.method!=='GET'||u.origin!==base.origin||u.search)return;
 if(u.href===base.href)u.pathname+='index.html';if(!allowed.has(u.href))return;
 e.respondWith((async()=>{try{return await cacheAsset(await caches.open(cacheName),u.href);}catch{return new Response(null,{status:503,statusText:'Application file unavailable for this version'});}})());
});
self.addEventListener('message',e=>{
 const port=e.ports[0];if(!port)return;
 if(e.data?.type==='app-version'){port.postMessage({version:APP_OFFLINE.version});return;}
 if(e.data?.type==='auto-update'){
  e.waitUntil(autoUpdate.apply(e.source).then(applied=>port.postMessage({applied})).catch(()=>port.postMessage({applied:false})));
  return;
 }
 if(e.data?.type==='activate-update'){
  e.waitUntil((async()=>{const sender=e.source?.url?new URL(e.source.url):null;if(!sender||sender.href!==new URL('update.html',base).href)throw new Error(tr('更新画面から操作してください。'));const open=await self.clients.matchAll({type:'window',includeUncontrolled:true});if(open.some(c=>c.id!==e.source.id&&c.url.startsWith(base.href)))throw new Error(tr('この画面以外のアプリのタブを閉じてください。'));port.postMessage({ok:true});await self.skipWaiting();})().catch(err=>port.postMessage({error:err.message})));
  return;
 }
 e.waitUntil((async()=>{const cache=await caches.open(cacheName);if(e.data?.type==='download'){
   let done=0;for(const url of urls){await cacheAsset(cache,url);port.postMessage({progress:++done,total:urls.length});}
 }else if(e.data?.type!=='status')throw new Error(tr('オフライン保存を開始できませんでした。画面を開き直してください。'));
 let count=0;for(const url of urls)if(await cache.match(url))count++;port.postMessage({done:true,ready:count===urls.length,cached:count,total:urls.length,bytes:APP_OFFLINE.bytes,version:APP_OFFLINE.version});
 })().catch(err=>port.postMessage({done:true,error:err.message})));
});
