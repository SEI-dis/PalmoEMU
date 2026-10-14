// SPDX-License-Identifier: AGPL-3.0-or-later
// Host contract, separate from the author's conversion algorithm.
export function startVersionNumber(version){
 const match=typeof version==='string'&&version.match(/^0\.(\d{1,3})(?:\.(\d{1,3}))?$/);
 if(!match||Number(match[1])>255||Number(match[2]||0)>255)return null;
 return Number(match[1])*256+Number(match[2]||0);
}

export function defineStartComponent(manifest){
 const fail=detail=>{throw Error('Unsupported START migration component metadata: '+detail);};
 if(!manifest||typeof manifest.toolVersion!=='string'||!manifest.toolVersion.trim()||!Array.isArray(manifest.versions)||!manifest.versions.length)fail('tool version or version list');
 let previous=-1;
 const versions=manifest.versions.map(entry=>{
  const number=startVersionNumber(entry?.version);
  if(number===null||number<=previous||![20,23].includes(entry.family)||!Number.isInteger(entry.boxes)||entry.boxes<1||entry.boxes>50||typeof entry.encrypted!=='boolean')fail('version order or layout at '+entry?.version);
  if(entry.saveVersionStamp!==undefined&&entry.saveVersionStamp!==number)fail('save stamp at '+entry.version);
  if(entry.crc32!==null&&entry.crc32!==undefined&&(!Number.isInteger(entry.crc32)||entry.crc32<0||entry.crc32>0xffffffff))fail('CRC32 at '+entry.version);
  previous=number;return Object.freeze({...entry});
 });
 const output=versions.at(-1);
 // A new output layout needs explicit host/fixture review, even if its version
 // is newer. Never infer support for a new layout from the version alone.
 if(output.version!==manifest.latest||output.family!==23||output.boxes!==50||!output.encrypted||output.saveVersionStamp!==startVersionNumber(output.version))fail('latest output must use the reviewed v23 / 50-box / SaveCrypt layout');
 const stamped=versions.filter(entry=>entry.saveVersionStamp!==undefined);
 if(!stamped.length||manifest.nativeCompatibility?.versionVariable!==0x50ef)fail('save-version variable or stamped versions');
 return Object.freeze({
  toolVersion:manifest.toolVersion,output,versions:Object.freeze(versions),
  versionVariable:manifest.nativeCompatibility.versionVariable,
  minimumStampedVersion:Math.min(...stamped.map(entry=>entry.saveVersionStamp)),
  saveSizes:Object.freeze([131072,131088,1048576,1048592,6291456,6291472]),
  flashBytes:6291456,maxSaveBytes:6291472,
  layout:'start-v23-50-savecrypt',
 });
}
