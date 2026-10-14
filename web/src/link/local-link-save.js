// SPDX-License-Identifier: AGPL-3.0-or-later
// Commit both players in one IndexedDB transaction; never publish half a trade.
import {tr} from '../i18n/index.js';
import * as db from '../storage/storage.js';
import {hash} from '../shared.js';
export async function saveLinkPair(protections,cores){
  await Promise.all(protections.map(p=>p.queue));
  cores.forEach(core=>core.draw());
  const entries=await Promise.all(cores.map(async(core,i)=>{
    const p=protections[i],at=Date.now(),raw=core.save(),bytes=raw?.length?new Uint8Array(raw):null;
    const state=new Uint8Array(core.state());if(!state.length)throw Error(tr('通信後の中断状態を保存できません。'));
    const save=bytes?{bytes,at,hash:await hash(bytes),coreId:p.coreId,reason:'link-complete'}:null;
    const recovery={bytes:state,hash:await hash(state),save:bytes,saveHash:save?.hash||null,at,coreId:p.coreId,sessionId:p.id,image:core.screenshot()};
    return {id:p.storageKey,sessionId:p.id,save,recovery,clean:i===1};
  }));
  await db.commitProtectionBatch(entries);
  protections.forEach((p,i)=>{const e=entries[i];p.stateAt=e.recovery.at;p.status={at:e.save?.at||p.status?.at||0,stateAt:p.stateAt};p.onStatus(p.status);});
}
export function secondPlayerGame(game){return {...game,id:game.id+'@link-2p',name:game.name+' (2P)'};}
