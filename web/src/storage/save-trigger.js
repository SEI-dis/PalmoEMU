// SPDX-License-Identifier: AGPL-3.0-or-later
// Poll only small native counters. Never clone/hash a save to discover a write.
const QUIET_MS=1000,MIN_INTERVAL_MS=5000,RETRY_MS=30000,MAX_RETRY_MS=120000;
export class SaveTrigger {
 constructor(){this.reset();}
 reset(core=null,epoch=null){this.core=core;this.epoch=epoch;this.revision=0;this.committed=0;this.stableAt=0;this.nextAt=0;this.failures=0;}
 read(core){
  let progress;try{progress=core?.saveProgress?.();}catch{return null;}
  if(!progress||!Number.isSafeInteger(progress.epoch)||!Number.isSafeInteger(progress.revision)||progress.revision<0)return null;
  return progress;
 }
 observe(core,now){
  const progress=this.read(core);if(!progress){this.reset();return null;}
  if(this.core!==core||this.epoch!==progress.epoch)this.reset(core,progress.epoch);
  if(this.revision!==progress.revision||progress.pending){this.revision=progress.revision;this.stableAt=now;}
  if(!this.revision||this.revision===this.committed||progress.pending||now-this.stableAt<QUIET_MS||now<this.nextAt)return null;
  return {core,epoch:this.epoch,revision:this.revision};
 }
 matches(token){const value=this.read(token?.core);return !!value&&token.core===this.core&&token.epoch===this.epoch&&value.epoch===token.epoch&&value.revision===token.revision&&!value.pending;}
 committedSave(token,now){if(token?.core!==this.core||token.epoch!==this.epoch)return;this.committed=token.revision;this.failures=0;this.nextAt=now+MIN_INTERVAL_MS;}
 failed(token,now){if(token?.core!==this.core||token.epoch!==this.epoch)return;this.failures=Math.min(3,this.failures+1);this.nextAt=now+Math.min(MAX_RETRY_MS,RETRY_MS*2**(this.failures-1));}
}
