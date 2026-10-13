// SPDX-License-Identifier: AGPL-3.0-or-later
import {startVersionNumber} from './start-save-version.js';

// The converter's output version is a bridge, not an exact destination-ROM gate.
export const START_MIGRATION_VERSION='0.42.3';
// Changelog evidence for known ROMs; newer ROMs supply their own validated
// native minimum-save-version gate. Never infer that gate from a filename.
// https://github.com/pm-start/PokemonStart/blob/a9848a797893f909d7f2c50f3bc4ea5ce71fc804/CHANGELOG.md
export function startSaveCompatibility(from,target=START_MIGRATION_VERSION){
 const to=typeof target==='object'?target?.version:target;
 const source=startVersionNumber(from),destination=startVersionNumber(to);
 const nativeMinimum=typeof target==='object'?startVersionNumber(target?.minimumSaveVersion):null;
 let status='unknown';
 if(!target?.unverified&&source!==null&&destination!==null&&source<=destination){
  if(nativeMinimum!==null)status=source<nativeMinimum?'convert':'compatible';
  else if(!Object.hasOwn(target||{},'minimumSaveVersion')&&destination>=0x2701&&destination<=0x2a05){
   if(source<0x2402)status='convert';
   else if(source>=0x2600)status='compatible';
  }
 }
 return {status,from:from||null,to};
}
export function canApplyStartMigration(target){
 return startSaveCompatibility(START_MIGRATION_VERSION,target).status==='compatible';
}
