// SPDX-License-Identifier: AGPL-3.0-or-later
let pending=0;
export const updateTasksPending=()=>pending>0;
// Keep synchronous event handlers synchronous, and await all asynchronous work.
export function guardUpdateTask(handler){return function(...args){
 pending++;
 try{const result=handler.apply(this,args);if(result?.then)return Promise.resolve(result).finally(()=>pending--);pending--;return result;}
 catch(error){pending--;throw error;}
};}
