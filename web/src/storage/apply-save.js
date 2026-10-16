// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';

// The caller pauses the core and drains its save queue before entering here.
// Keep a volatile rollback copy: a failed import must not pair new save RAM
// with the old running game, or resume a partially restored core.
export async function applyPausedSave(core,bytes,commit){
 const state=new Uint8Array(await core.state());
 if(!state.length)throw Error(tr('中断状態を取得できませんでした。'));
 const save=core.stateIncludesSave?null:(await core.save())?.slice();
 try{
  await core.restore(bytes);await core.reset();
  return await commit();
 }catch(error){
  // A confirmed save with a secondary failure is not a rolled-back import.
  if(error.saveCommitted)throw error;
  // A lost worker acknowledgment may already have committed the new save.
  // Never resume the old RAM and overwrite that uncertain result on exit.
  if(error.saveOutcomeUnknown){error.saveImportUnsafe=true;throw error;}
  try{await core.loadState(state);if(save?.length)await core.restore(save);}
  catch(rollbackError){error.saveImportUnsafe=true;error.saveImportRecoveryError=rollbackError;}
  throw error;
 }
}
