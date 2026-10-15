// SPDX-License-Identifier: AGPL-3.0-or-later
// Public distribution metadata only. No ROM, save, filename or local identity
// is ever used in a network request. This is not a compatibility decision.
import {isStartName,startVersionFromName} from '../start-save/version.js';

export const startUpdateURL='https://api.github.com/repos/pm-start/PokemonStart/git/trees/main';
export const startDistributionURL='https://github.com/pm-start/PokemonStart';
export const startChangelogURL=startDistributionURL+'/blob/main/CHANGELOG.md';
export const startUpdateStorageKey='palmo-start-updates-v1';
export const startUpdateInterval=3600000;
const sha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const parts=value=>typeof value==='string'&&/^(?:0|[1-9]\d{0,3})\.(?:0|[1-9]\d{0,3})\.(?:0|[1-9]\d{0,3})$/.test(value)?value.split('.').map(Number):null;
export function compareStartVersions(a,b){
 const x=parts(a),y=parts(b);if(!x||!y)return null;
 for(let i=0;i<3;i++)if(x[i]!==y[i])return Math.sign(x[i]-y[i]);return 0;
}
export function startUpdateGames(games){
 return games.filter(game=>game.system==='gba'&&!game.romMissing&&isStartName(game.filename,game.name)).map(game=>({game,version:startVersionFromName(game.filename,game.name)})).sort((a,b)=>(compareStartVersions(b.version,a.version)||0)||(b.game.lastPlayed||0)-(a.game.lastPlayed||0));
}
export function needsStartUpdate(games,release){
 if(!parts(release?.version))return false;
 const known=startUpdateGames(games).filter(item=>parts(item.version));
 // Kept old ROMs must not keep notifying after the latest (or newer) version
 // has already been added. Unknown versions are never reported as current.
 return known.length>0&&known.every(item=>compareStartVersions(item.version,release.version)<0);
}
export function parseStartRelease(data){
 if(!data||data.truncated!==false||!sha(data.sha)||!Array.isArray(data.tree)||data.tree.length>512)throw Error('Invalid distribution metadata');
 const releases=[];
 for(const entry of data.tree){
  const match=typeof entry?.path==='string'&&/^PokemonStart_v(\d+\.\d+\.\d+)\.pks$/.exec(entry.path);
  if(!match)continue;
  if(!parts(match[1])||entry.type!=='blob'||entry.mode!=='100644'||!sha(entry.sha)||!Number.isSafeInteger(entry.size)||entry.size<=0||entry.size>256*1048576)throw Error('Invalid distribution entry');
  releases.push({version:match[1],sha:entry.sha});
 }
 if(!releases.length||new Set(releases.map(item=>item.version)).size!==releases.length)throw Error('No unambiguous release');
 return releases.sort((a,b)=>compareStartVersions(b.version,a.version))[0];
}
async function readMetadata(response){
 const limit=131072;if(Number(response.headers.get('content-length'))>limit)throw Error('Metadata too large');
 if(!response.body)throw Error('Empty metadata');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('Metadata too large');chunks.push(value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return parseStartRelease(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
}
export function createStartUpdateService({storage,fetcher=(...args)=>fetch(...args),now=()=>Date.now(),online=()=>navigator.onLine!==false,onChange=()=>{},locks=globalThis.navigator?.locks}={}){
 if(!storage)try{storage=globalThis.localStorage;}catch{}
 let memory={enabled:true,release:null,checkedAt:0,retryAt:0,failed:false,dismissed:''},pending=null,controller=null,status='idle';
 function read(){
  try{const value=JSON.parse(storage?.getItem(startUpdateStorageKey)||'null');if(value&&typeof value==='object'){
   const time=n=>Number.isSafeInteger(n)&&n>0&&n<=now()+86400000?n:0;
   memory={enabled:value.enabled!==false,release:parts(value.release?.version)&&sha(value.release?.sha)?{version:value.release.version,sha:value.release.sha}:null,checkedAt:time(value.checkedAt),retryAt:time(value.retryAt),failed:value.failed===true,dismissed:typeof value.dismissed==='string'&&value.dismissed.length<70?value.dismissed:''};
  }}catch{}return memory;
 }
 const write=changes=>{memory={...read(),...changes};try{storage?.setItem(startUpdateStorageKey,JSON.stringify(memory));}catch{}};
 const snapshot=()=>{const state=read();return {...state,status:status==='checking'?status:!online()?'offline':state.failed?'error':state.checkedAt?'ready':'idle',stale:!state.checkedAt||now()-state.checkedAt>=startUpdateInterval};};
 function setEnabled(enabled){write({enabled:!!enabled});if(!enabled)controller?.abort('disabled');onChange(snapshot());}
 function dismiss(){const release=read().release;if(release)write({dismissed:release.version+':'+release.sha});onChange(snapshot());}
 async function perform(force){
  const state=read(),time=now();
  if(!online()||!force&&!state.enabled||time<state.retryAt||!force&&time-state.checkedAt<startUpdateInterval&&state.checkedAt)return snapshot();
  write({retryAt:time+60000});status='checking';onChange(snapshot());
  controller=new AbortController();const timer=setTimeout(()=>controller?.abort(),10000);let retryAt=time+300000;
  try{
   const response=await fetcher(startUpdateURL,{method:'GET',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
   if(!response.ok){
    if(response.status===403||response.status===429){const seconds=Number(response.headers.get('retry-after')),reset=Number(response.headers.get('x-ratelimit-reset'))*1000;retryAt=Math.min(time+86400000,Math.max(retryAt,seconds>0?time+seconds*1000:0,reset>time?reset:time+startUpdateInterval));}
    await response.body?.cancel().catch(()=>{});throw Error('Distribution unavailable');
   }
   const release=await readMetadata(response);
   if(!controller.signal.aborted)write({release,checkedAt:now(),failed:false});
  }catch{if(controller.signal.reason!=='disabled')write({failed:true,retryAt});}
  finally{clearTimeout(timer);controller=null;status='idle';onChange(snapshot());}
  return snapshot();
 }
 function check({force=false}={}){
  if(pending)return pending;
  const run=()=>perform(force);
  pending=(locks?locks.request('palmo-start-update-check',{ifAvailable:true},lock=>lock?run():snapshot()):run()).catch(()=>snapshot()).finally(()=>{pending=null;});
  return pending;
 }
 return {snapshot,check,setEnabled,dismiss};
}
