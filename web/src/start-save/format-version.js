// SPDX-License-Identifier: AGPL-3.0-or-later
// The 0.50 layout is separate from the legacy author's version definitions.
import {startVersionNumber} from './contract.js';
export const START_FORMAT_VERSION='0.50.0';
export const START_FORMAT_STAMP=0x3200;
export const START_FORMAT_BRIDGE=0x31ff;
export function isStartFormatTarget(target){
 const version=startVersionNumber(target?.version),minimum=startVersionNumber(target?.minimumSaveVersion);
 return !target?.unverified&&target?.saveFormat==='L'&&version!==null&&version>=START_FORMAT_STAMP&&minimum!==null&&minimum<=START_FORMAT_BRIDGE;
}
export function formatSourceVersion(stamp){
 if(stamp===START_FORMAT_BRIDGE)return START_FORMAT_VERSION;
 return Number.isInteger(stamp)&&stamp>=START_FORMAT_STAMP&&stamp<=0xffff?`0.${stamp>>>8}.${stamp&255}`:null;
}
