// SPDX-License-Identifier: AGPL-3.0-or-later
// Layout boundaries, distinct from the converter revision and target ROM stamp.
import {startVersionNumber} from './contract.js';
export const START_FORMAT_VERSION='0.50.0';
export const START_FORMAT_STAMP=0x3200;
export const START_FORMAT_BRIDGE=0x31ff;
export const START_WIDE_VERSION='0.53.0';
export const START_WIDE_STAMP=0x3500;
export const START_WIDE_BRIDGE=0x34ff;
export const START_X_VERSION='0.59.2';
export const START_X_STAMP=0x3b02;
export function startFormatTarget(target){
 const version=startVersionNumber(target?.version),minimum=startVersionNumber(target?.minimumSaveVersion);
 if(target?.unverified||version===null||minimum===null)return null;
 if(target?.saveFormat==='L'&&version>=START_FORMAT_STAMP&&version<START_WIDE_STAMP&&minimum<=START_FORMAT_BRIDGE)return {format:'L',version:START_FORMAT_VERSION,stamp:START_FORMAT_STAMP};
 // 0.59.0 changes the physical adventure-slot spacing, not W box records.
 // Apply the boundary to later verified W ROMs too, never one exact patch.
 if(target?.saveFormat==='W'&&version>=START_WIDE_STAMP&&version<START_X_STAMP&&minimum<=START_WIDE_BRIDGE)return {format:'W',version:START_WIDE_VERSION,stamp:START_WIDE_STAMP,...(version>=0x3b00?{storageLayout:2}:{})};
 if(target?.saveFormat==='X'&&version>=START_X_STAMP&&minimum<=START_X_STAMP)return {format:'X',version:START_X_VERSION,stamp:START_X_STAMP,storageLayout:2};
 return null;
}
export function isStartFormatTarget(target){return startFormatTarget(target)!==null;}
export function formatSourceVersion(stamp,format='L'){
 if(!Number.isInteger(stamp)||stamp>0xffff)return null;
 if(format==='L'){
  if(stamp===START_FORMAT_BRIDGE)return START_FORMAT_VERSION;
  if(stamp<START_FORMAT_STAMP||stamp>=START_WIDE_STAMP)return null;
 }else if(format==='W'){
  if(stamp===START_WIDE_BRIDGE)return START_WIDE_VERSION;
  if(stamp<START_WIDE_STAMP||stamp>=START_X_STAMP)return null;
 }else if(format==='X'){
  if(stamp<START_X_STAMP)return null;
 }else return null;
 return `0.${stamp>>>8}.${stamp&255}`;
}
