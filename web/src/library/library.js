// SPDX-License-Identifier: AGPL-3.0-or-later
// Original Web library organization. Sorting and selection behavior informed by
// ManicEMU GameListView; progress categories are a PalmoEMU feature. See NOTICES.md.
import {tr,locale} from '../i18n/index.js';
export const libraryCategories=[['',tr('未分類')],['playing',tr('プレイ中')],['completed',tr('クリア済み')],['backlog',tr('あとで遊ぶ')]];
export const librarySorts=[['name',tr('名前順')],['name-desc',tr('名前の逆順')],['recent',tr('最近遊んだ順')],['added',tr('追加が新しい順')],['playtime',tr('プレイ時間が長い順')]];
const collator=new Intl.Collator(locale(),{numeric:true,sensitivity:'base'});
export const categoryOf=game=>libraryCategories.some(([id])=>id===game.category)?game.category:'';
export const categoryLabel=game=>libraryCategories.find(([id])=>id===categoryOf(game))[1];
export function libraryDisplay(value){
 return {sort:librarySorts.some(([id])=>id===value?.sort)?value.sort:'name',group:['system','category','none'].includes(value?.group)?value.group:'system'};
}
export function visibleGames(games,{system='all',category='all',favorites=false,query='',sort='name'}={}){
 const search=query.normalize('NFKC').toLocaleLowerCase('ja').trim();
 const number=(g,key)=>Number.isFinite(g[key])?g[key]:0;
 const name=(a,b)=>collator.compare(a.name,b.name)||String(a.id).localeCompare(String(b.id));
 return games.filter(g=>(system==='all'||g.system===system)&&(category==='all'||categoryOf(g)===category)&&(!favorites||g.favorite)&&g.name.normalize('NFKC').toLocaleLowerCase('ja').includes(search))
  .sort((a,b)=>sort==='name-desc'?-name(a,b):sort==='recent'?number(b,'lastPlayed')-number(a,'lastPlayed')||name(a,b):sort==='added'?number(b,'added')-number(a,'added')||name(a,b):sort==='playtime'?number(b,'playDuration')-number(a,'playDuration')||name(a,b):name(a,b));
}
export function groupGames(games,group,systems){
 if(group==='none')return [[tr('ゲーム'),games]];
 const groups=group==='category'?libraryCategories.map(([id,label])=>[label,games.filter(game=>categoryOf(game)===id)]):Object.entries(systems).map(([id,system])=>[system.short,games.filter(game=>game.system===id)]);
 return groups.filter(([,items])=>items.length);
}
