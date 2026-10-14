// SPDX-License-Identifier: AGPL-3.0-or-later
// Copy persisted artwork only along an explicit ROM-update relationship.
const localCover=game=>typeof game?.cover==='string'&&/^data:image\/(png|jpeg|webp);base64,/i.test(game.cover);
export function inheritedROMCover(target,source){
 if(!localCover(source)||target.system!==source.system)return null;
 // A chosen target cover wins. A source screenshot never replaces another cover.
 if(target.cover&&(target.coverSource!=='screenshot'||source.coverSource==='screenshot'))return null;
 const cover={cover:source.cover,coverSource:source.coverSource||'custom',coverTitle:source.coverTitle||'',coverUrl:source.coverUrl||''};
 return Object.entries(cover).some(([key,value])=>target[key]!==value)?cover:null;
}
export function repairROMUpdateCovers(games){
 const byId=new Map(games.map(game=>[game.id,game])),changed=[];
 for(const game of games){
  if(game.cover&&game.coverSource!=='screenshot')continue;
  const visited=new Set([game.id]),previous=[];let row=game,cycle=false;
  while(row.romUpdate?.previousId){
   const id=row.romUpdate.previousId;if(visited.has(id)){cycle=true;break;}visited.add(id);
   row=byId.get(id);if(!row||row.system!==game.system)break;previous.push(row);
  }
  if(cycle)continue;
  // Prefer the nearest selected artwork over automatically captured gameplay.
  const source=previous.find(row=>localCover(row)&&row.coverSource!=='screenshot')||previous.find(localCover);
  const cover=inheritedROMCover(game,source);if(cover){Object.assign(game,cover);changed.push(game);}
 }
 return changed;
}
