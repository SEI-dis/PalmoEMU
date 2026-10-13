// SPDX-License-Identifier: AGPL-3.0-or-later
// Lightweight local statistics only. ROM/save payloads never enter this model.
export const trainerProfileKey='\u0001palmo-trainer-profile';
export const playRecordPrefix='\u0001palmo-play-record:';
const identity=value=>value&&typeof value.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value.id)&&typeof value.system==='string'&&/^[a-z0-9-]{1,32}$/.test(value.system);
const duration=value=>Number.isSafeInteger(value)&&value>=0?value:0;
const timestamp=(value,now)=>Number.isSafeInteger(value)&&value>0&&value<=now?value:0;
const plus=(a,b)=>Math.min(Number.MAX_SAFE_INTEGER,a+b);
const text=(a,b)=>a<b?-1:a>b?1:0;
function record(game,previous,now){
 if(!identity(game))throw new TypeError('Invalid play record identity');
 if(!identity(previous)||previous.id!==game.id||previous.system!==game.system)previous=null;
 const added=[timestamp(previous?.added,now),timestamp(game.added,now)].filter(Boolean);
 const previousIds=new Set([...(Array.isArray(previous?.previousIds)?previous.previousIds:[]),...(Array.isArray(game.previousIds)?game.previousIds:[]),game.romUpdate?.previousId].filter(id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id)&&id!==game.id));
 const name=typeof game.name==='string'&&game.name.trim()?game.name.trim():typeof previous?.name==='string'&&previous.name.trim()?previous.name.trim():game.id;
 return {id:game.id,system:game.system,name:name.slice(0,120),added:added.length?Math.min(...added):0,
  lastPlayed:Math.max(timestamp(previous?.lastPlayed,now),timestamp(game.lastPlayed,now)),
  playDuration:Math.max(duration(previous?.playDuration),duration(game.playDuration)),
  updatedAt:Math.max(timestamp(previous?.updatedAt,now),timestamp(game.updatedAt,now),timestamp(game.romUpdate?.at,now),...added),
  previousIds:[...previousIds].sort(text)};
}
export function playRecord(game,previousRecord){return record(game,previousRecord,Date.now());}

export function trainerStats(records,games){
 const now=Date.now(),saved=(Array.isArray(records)?records:[]).filter(identity),live=(Array.isArray(games)?games:[]).filter(identity);
 // The live library is authoritative if damaged metadata assigns one ROM ID
 // to different systems. Otherwise choose deterministically, never count it twice.
 const systems=new Map();
 for(const rows of [live,saved])for(const row of [...rows].sort((a,b)=>text(a.system,b.system)))if(!systems.has(row.id))systems.set(row.id,row.system);
 const byId=new Map(),liveIds=new Set();
 const age=row=>Math.max(timestamp(row.updatedAt,now),timestamp(row.romUpdate?.at,now),timestamp(row.added,now));
 const order=(a,b)=>age(a)-age(b)||text(String(a.name||''),String(b.name||''));
 for(const rows of [saved,live])for(const value of [...rows].sort(order)){
  if(systems.get(value.id)!==value.system)continue;
  byId.set(value.id,record(value,byId.get(value.id),now));
  if(rows===live)liveIds.add(value.id);
 }
 const roots=new Map([...byId.keys()].map(id=>[id,id]));
 function root(id){let current=id;while(roots.get(current)!==current)current=roots.get(current);while(id!==current){const next=roots.get(id);roots.set(id,current);id=next;}return current;}
 const parents=new Map();
 for(const row of byId.values()){
  const related=row.previousIds.filter(id=>byId.get(id)?.system===row.system);parents.set(row.id,related);
  for(const id of related){const left=root(row.id),right=root(id);if(left!==right)roots.set(left,right);}
 }
 const groups=new Map();
 for(const row of byId.values()){const key=root(row.id),group=groups.get(key)||[];group.push(row);groups.set(key,group);}
 const ancestry=new Map();
 function ancestors(id){
  if(ancestry.has(id))return ancestry.get(id);
  const found=new Set(),pending=[...(parents.get(id)||[])];
  while(pending.length){const previous=pending.pop();if(previous===id||found.has(previous))continue;found.add(previous);pending.push(...(parents.get(previous)||[]));}
  ancestry.set(id,found);return found;
 }
 const newest=(a,b)=>b.updatedAt-a.updatedAt||b.added-a.added||b.lastPlayed-a.lastPlayed||text(a.id,b.id);
 let total=0;const rankings=[];
 for(const group of groups.values()){
  const played=group.reduce((sum,row)=>plus(sum,row.playDuration),0);if(!played)continue;
  const present=group.filter(row=>liveIds.has(row.id)),candidates=present.length?present:group;
  // Re-adding an old cartridge must not outrank an explicitly newer version.
  // Cyclic or branched updates fall back to stable metadata/date ordering.
  const latest=candidates.filter(row=>!candidates.some(other=>other.id!==row.id&&ancestors(other.id).has(row.id)&&!ancestors(row.id).has(other.id)));
  const representative=latest.sort(newest)[0];
  rankings.push({id:representative.id,name:representative.name,system:representative.system,playDuration:played});total=plus(total,played);
 }
 rankings.sort((a,b)=>b.playDuration-a.playDuration||text(a.name,b.name)||text(a.id,b.id));
 return {total,rankings};
}

export function initialTrainerProfile(games,{now=Date.now(),fresh=false}={}){
 if(!Number.isSafeInteger(now)||now<0||now>8640000000000000)now=Date.now();
 const dates=(Array.isArray(games)?games:[]).map(game=>timestamp(game?.added,now)).filter(Boolean);
 return {nickname:'',joinedAt:fresh?now:dates.length?Math.min(...dates):now,joinSource:fresh?'first-use':dates.length?'estimated':'recorded'};
}
