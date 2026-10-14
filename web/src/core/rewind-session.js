// SPDX-License-Identifier: AGPL-3.0-or-later
// Coordinates volatile rewind with the application's persistent-save queue.
import {tr} from '../i18n/index.js';
import {createRewind,supportsRewind} from './rewind.js';
export {supportsRewind};
export function createRewindSession({getState,setPause,waitForSaves,toast,error,onChange=()=>{}}){
 let controller=null,restoring=false,wasPaused=true,fatal=false,restoreTask=null,generation=0;
 const blocked=()=>{const state=getState();return !!(state.linked||state.exiting||state.hidden);};
 const notify=()=>onChange(controller?.status);
 return {
  get busy(){return restoring||!!restoreTask||!!controller?.status.busy;},get status(){return controller?.status;},
  attach(nextCore,game){
   if(controller)throw Error(tr('前の巻き戻し記録の終了を待ってください。'));
   generation++;
   controller=createRewind({core:nextCore,system:game.system,coreKey:game.coreKey||'mgba',isBlocked:blocked,
    beforeRestore:async()=>{const state=getState();wasPaused=state.paused;restoring=true;setPause(true);await waitForSaves();},
    afterRestore:async(result)=>{fatal ||= !!result.fatal;},
    onChange:notify,onError:error});
  },
  configure(enabled){if(!controller?.status.supported||restoreTask)return;if(controller.status.enabled!==!!enabled&&!controller.status.reason)controller.setEnabled(enabled);if(!enabled&&controller.status.reason)controller.setEnabled(false);},
  frame(){if(controller&&!restoring&&!blocked())void controller.frame();},
  pause(value){return controller?.pause(value)||Promise.resolve();},
  async clear({halt=false}={}){fatal ||= halt;await restoreTask;await controller?.clear();},
  async rewind(){
   if(!controller?.status.supported){toast(tr('巻き戻しはGB・GBC・GBAで使えます。'));return false;}
   if(blocked()||restoring||restoreTask)return false;
   if(!controller.status.enabled){toast(controller.status.reason||tr('ゲームの設定で「巻き戻しを記録」をオンにしてください。'));return false;}
   const version=generation;fatal=false;restoring=false;
   restoreTask=controller.rewind(3);
   try{
    const restored=await restoreTask;
    if(restored)toast(tr('過去の状態へ戻しました。'));else if(!controller?.status.reason)toast(tr('巻き戻し用の記録がまだありません。少しプレイしてください。'));
    return restored;
   }finally{
    const resume=restoring&&version===generation&&!fatal&&!wasPaused&&!blocked();restoring=false;restoreTask=null;
    if(resume)setPause(false);
   }
  },
  async dispose(){generation++;const old=controller;controller=null;await old?.dispose();restoring=false;}
 };
}
