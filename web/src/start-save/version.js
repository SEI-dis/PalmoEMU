// SPDX-License-Identifier: AGPL-3.0-or-later
import {START_COMPONENT} from './definition.js';
import {startVersionNumber} from './contract.js';
export {startVersionNumber};
const versions=new Set(START_COMPONENT.versions.map(entry=>entry.version));
export const isStartName=(...names)=>names.some(name=>typeof name==='string'&&/(?:pokemon[\s_-]*start|(?:^|[\s_-])start[\s_-]*v?0\.)/i.test(name));
export function startVersionFromStamp(stamp){
 if(!Number.isInteger(stamp)||stamp<START_COMPONENT.minimumStampedVersion||stamp>0xffff)return null;
 return `0.${stamp>>>8}.${stamp&255}`;
}
// A filename selects a default only; save structure/stamps are still validated.
export function startVersionFromName(...names){
 for(const name of names){
  if(typeof name!=='string')continue;
  const matches=[...name.matchAll(/(?:^|[^\d.])v?(0\.\d+(?:\.\d+)?)(?!\d|\.\d)/gi)],found=new Set();
  for(const [,value] of matches){
   const normalized=[value,value+'.0',value.endsWith('.0')?value.slice(0,-2):''].find(candidate=>versions.has(candidate));
   if(normalized)found.add(normalized);
   else if(startVersionNumber(value)!==null)found.add(value.split('.').length===2?value+'.0':value);
  }
  if(found.size===1)return [...found][0];
  if(found.size>1)return null;
 }
 return null;
}
