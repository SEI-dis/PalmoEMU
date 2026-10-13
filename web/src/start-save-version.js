// SPDX-License-Identifier: AGPL-3.0-or-later
import {START_SOURCE_VERSIONS} from './start-save-migration.js';
// A filename selects a default only; save structure/stamps are still validated.
export function startVersionFromName(...names){
 const versions=new Set(START_SOURCE_VERSIONS.map(entry=>entry.version));
 for(const name of names){
  if(typeof name!=='string')continue;
  const matches=[...name.matchAll(/(?:^|[^\d.])v?(0\.\d+(?:\.\d+)?)(?!\d|\.\d)/gi)],found=new Set();
  for(const [,value] of matches){
   const normalized=[value,value+'.0',value.endsWith('.0')?value.slice(0,-2):''].find(candidate=>versions.has(candidate));
   if(normalized)found.add(normalized);
  }
  if(found.size===1)return [...found][0];
  if(found.size>1)return null;
 }
 return null;
}
