// SPDX-License-Identifier: AGPL-3.0-or-later
// PalmoEMU safety facade. Upstream migration code has separate provenance;
// this module's license does not relicense ../../vendor/start-save-migrate/.
import {inspectInput,migrateSave,normalizeVersion,readSave,getVariable} from './provider.js';
import {START_COMPONENT,START_SOURCE_VERSIONS} from './definition.js';
import {tr} from '../i18n/index.js';
import {startSaveCompatibility,selectStartMigrationVersion,START_MIGRATION_VERSION} from './compatibility.js';
import {startVersionNumber,startVersionFromStamp} from './version.js';
import {readStartROMProfile,isStartROMFamily} from './rom-profile.js';
import {inspectFormatSave,convertFormatSave,containsFormatL} from './format-l.js';
import {START_FORMAT_STAMP,isStartFormatTarget,startFormatTarget,formatSourceVersion} from './format-version.js';

export {START_MIGRATION_VERSION,START_SOURCE_VERSIONS};
// The legacy provider keeps its own 6 MiB limit. Only the modern reader/writer
// understands the independently reviewed 16 MiB container and slot offsets.
const sizes=new Set([...START_COMPONENT.saveSizes,16777216,16777232]),maxSaveBytes=16777232;
const sources=new Map(START_COMPONENT.versions.map(source=>[source.version,source]));
const stamps=new Map(START_COMPONENT.versions.filter(source=>source.saveVersionStamp!==undefined).map(source=>[source.saveVersionStamp,source.version]));
const {output,versionVariable}=START_COMPONENT;
const failures={input:()=>tr('通常セーブのデータを選択してください。'),size:()=>tr('128KiB・1MiB・6MiB・16MiBの通常セーブを選択してください。'),version:()=>tr('移行元のバージョンを選択してください。'),mismatch:()=>tr('セーブ内のバージョンと選択した移行元が一致しません。'),slot:()=>tr('有効なセーブを選択してください。'),output:()=>tr('移行結果の検証に失敗しました。原本は変更されていません。')};
function fail(code){const error=new Error(failures[code]());error.code=`START_${code.toUpperCase()}`;throw error;}
function view(value){
 if(value instanceof Uint8Array)return value;
 if(value instanceof ArrayBuffer)return new Uint8Array(value);
 fail('input');
}
function checkedSave(value){const bytes=view(value);if(bytes.byteLength>maxSaveBytes||!sizes.has(bytes.byteLength))fail('size');return bytes;}
function copySave(value){return Uint8Array.from(checkedSave(value));}
// Synchronous readers never write or yield. The vendor owns its working copies;
// only shared memory needs an entry snapshot against another thread's writes.
function inspectionSave(value){const bytes=checkedSave(value);return typeof SharedArrayBuffer!=='undefined'&&bytes.buffer instanceof SharedArrayBuffer?Uint8Array.from(bytes):bytes;}
function sourceVersion(value){if(typeof value!=='string'||value.length>16)fail('version');const source=sources.get(normalizeVersion(value));if(!source)fail('version');return source;}
function cancelled(signal){if(signal?.aborted){const error=new Error('Migration cancelled');error.name='AbortError';throw error;}}
const crcTable=Uint32Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});

// Identification only: CRC32 is neither proof of origin nor authorization to use a ROM.
export function identifyStartROM(value){
 const bytes=view(value);if(bytes.length<192||bytes.length>128*1048576)return null;
 let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);crc=(crc^0xffffffff)>>>0;
 const profile=readStartROMProfile(bytes);if(profile)return {...profile,crc32:crc};
 const matches=START_SOURCE_VERSIONS.filter(source=>source.crc32===crc);
 if(!matches.length)return isStartROMFamily(bytes)?{version:null,minimumSaveVersion:null,unverified:true,crc32:crc}:null;
 return matches.length===1?{version:matches[0].version,crc32:crc}:{version:null,versions:matches.map(source=>source.version),crc32:crc};
}

function inspect(bytes,source){
 // The legacy reader reports L/W slots as invalid. Never let that hide an
 // existing/newer adventure when classifying or copying the entire save.
 if(containsFormatL(bytes))fail('mismatch');
 const slots=inspectInput(bytes,source.inspectionVersion||source.version).map(slot=>{
  if(!slot.valid)return {slot:slot.slot,valid:false};
  const state=readSave(bytes,slot.slot),stamp=getVariable(state,versionVariable),detectedVersion=stamps.get(stamp)||(state.version===output.family&&state.encrypted===output.encrypted&&state.boxCount===output.boxes?startVersionFromStamp(stamp):null);
  // Early releases do not define a stamp. Only known stamps are identification
  // evidence; zero/unrecognised old fields must not masquerade as a version.
  if(detectedVersion&&detectedVersion!==source.version)fail('mismatch');
  if(source.saveVersionStamp!==undefined&&stamp!==source.saveVersionStamp)fail('mismatch');
  return {...slot,versionStamp:stamp,detectedVersion,encrypted:state.encrypted};
 });
 return {sourceVersion:source.version,targetVersion:selectStartMigrationVersion(undefined,source.version),sampleTested:source.saveSampleTested===true,slots};
}
function inspectModern(bytes,from){
 const info=inspectFormatSave(bytes),slots=info.slots.filter(slot=>!slot.unused);
 if(!slots.length||slots.some(slot=>!slot.valid||!['L','W'].includes(slot.format)))fail('slot');
 if(slots.some(slot=>formatSourceVersion(slot.versionStamp,slot.format)!==from))fail('mismatch');
 return {sourceVersion:from,targetVersion:from,sampleTested:false,layout:info.layout,slots:info.slots.map(slot=>({...slot,boxes:50,encrypted:true,detectedVersion:slot.valid?from:null}))};
}
export function inspectStartSave(value,from){const bytes=inspectionSave(value);return startVersionNumber(from)>=START_FORMAT_STAMP?inspectModern(bytes,from):inspect(bytes,sourceVersion(from));}
export function detectStartSaveVersion(value){
 const bytes=inspectionSave(value),versions=[];
 // The official converter writes 0x31ff to leave the game's first-load update
 // pending (0x34ff for W). Identify bridge markers only after layout validation.
 if(containsFormatL(bytes)){
  try{const used=inspectFormatSave(bytes).slots.filter(slot=>!slot.unused);
   if(used.length&&used.every(slot=>slot.valid&&['L','W'].includes(slot.format))){
    const found=used.map(slot=>formatSourceVersion(slot.versionStamp,slot.format));
    return found[0]&&found.every(version=>version===found[0])?found[0]:null;
   }
  }catch{}
  return null;
 }
 for(let slot=0;slot<(bytes.length>=START_COMPONENT.flashBytes?2:1);slot++){
  let state;try{state=readSave(bytes,slot);}catch{continue;}
  versions.push(state.version===output.family&&state.encrypted===output.encrypted&&state.boxCount===output.boxes?startVersionFromStamp(getVariable(state,versionVariable)):null);
 }
 // A converted save may still carry the bridge stamp until the new game saves.
 // Do not guess when slots disagree or an older slot has no version stamp.
 return versions.length&&versions[0]&&versions.every(version=>version===versions[0])?versions[0]:null;
}
export function inspectStartUpdate(value,from,target=START_MIGRATION_VERSION){
 const number=startVersionNumber(from);
 if(number>=START_FORMAT_STAMP){
  const info=inspectModern(inspectionSave(value),from),compatibility=startSaveCompatibility(from,target),destination=startFormatTarget(target);
  if(destination&&compatibility.status!=='downgrade'){
   if(info.layout.version>(destination.storageLayout||1))compatibility.status='downgrade';
   else if(destination.storageLayout===2&&info.layout.needsMigration)compatibility.status='convert';
  }
  return {...info,targetVersion:selectStartMigrationVersion(target,from),compatibility};
 }
 // New releases can retain the existing serialized layout. Only inspect them;
 // the old converter must never rewrite a source it does not understand.
 const source=sources.get(normalizeVersion(from))||(number>startVersionNumber(START_MIGRATION_VERSION)?{...sources.get(START_MIGRATION_VERSION),version:from,inspectionVersion:START_MIGRATION_VERSION,saveVersionStamp:number,saveSampleTested:false}:sourceVersion(from));
 const info=inspect(inspectionSave(value),source);
 // A filename or ROM revision alone cannot establish the actual save format.
 if(info.slots.some(slot=>slot.valid&&(slot.boxes!==source.boxes||slot.encrypted!==source.encrypted)))fail('mismatch');
 return {...info,targetVersion:selectStartMigrationVersion(target,source.version),compatibility:startSaveCompatibility(source.version,target)};
}

export async function migrateStartSave(value,{from,target,onProgress,signal,selection='all'}={}){
 cancelled(signal);
 if(isStartFormatTarget(target))return migrateModern(value,{from,target,onProgress,signal,selection});
 const bytes=copySave(value),source=sourceVersion(from),info=inspect(bytes,source);
 const destination=sources.get(selectStartMigrationVersion(target,source.version));
 if(!destination){const error=new Error(tr('このROMへのセーブ変換には未対応です。元のデータは変更していません。'));error.code='START_TARGET';throw error;}
 if(selection!=='all'&&(!Number.isInteger(selection)||!info.slots.find(slot=>slot.slot===selection&&slot.valid)))fail('slot');
 const chosen=info.slots.filter(slot=>slot.valid&&(selection==='all'||slot.slot===selection));
 const result=await migrateSave(bytes,source.version,selection,progress=>{
  cancelled(signal);onProgress?.(progress);cancelled(signal);
 },destination.version);
 cancelled(signal);
 if(!(result.data instanceof Uint8Array)||!sizes.has(result.data.length)||result.report.to!==destination.version)fail('output');
 for(const slot of chosen){
  const after=readSave(result.data,slot.slot);
  // Unselected slots may intentionally retain an older format/stamp.
  if(after.version!==destination.family||after.boxCount!==destination.boxes||after.encrypted!==destination.encrypted||getVariable(after,versionVariable)!==destination.saveVersionStamp)fail('output');
 }
 // The vendor verifies all existing records, untouched slots and the RTC tail.
 // Output ownership is independent from the caller and from worker input buffers.
 return {bytes:result.data,report:{...result.report,sourceSampleTested:source.saveSampleTested===true,fullGameplayTest:false}};
}

async function migrateModern(value,{from,target,onProgress,signal,selection}){
 const original=copySave(value),number=startVersionNumber(from),destination=startFormatTarget(target);
 if(!canMigrateModern(from,target))fail('version');
 let bytes=original,legacyReport=null;
 const info=inspectStartSave(bytes,from);
 if(selection!=='all'&&(!Number.isInteger(selection)||!info.slots.find(slot=>slot.slot===selection&&slot.valid)))fail('slot');
 if(number<START_FORMAT_STAMP){
  // Apply the existing reviewed old-game corrections before changing the
  // serialization. Do not advance through stamp-only recent definitions.
  const source=sourceVersion(from);
  // Raising the stamp to 0x31ff would skip the native 0.38.1 variable table.
  // Use the existing reviewed bridge to apply those seven initializations.
  if(number<0x2601||source.family!==23||info.slots.some(slot=>slot.valid&&(slot.boxes!==50||!slot.encrypted))){
   const bridge=await migrateStartSave(bytes,{from,target:{version:'0.49.0',minimumSaveVersion:'0.36.2'},onProgress,signal,selection});
   bytes=bridge.bytes;legacyReport=bridge.report;
  }
 }
 cancelled(signal);
 // 1 MiB mGBA containers use the same offsets; pad the unused flash and
 // relocate only the RTC trailer, before handing it to the official format.
 if(bytes.length-bytes.length%4096===1048576){const rtc=bytes.slice(1048576),expanded=new Uint8Array(6291456+rtc.length).fill(255);expanded.set(bytes.subarray(0,1048576));expanded.set(rtc,6291456);bytes=expanded;}
 const converted=await convertFormatSave(bytes,{selection,to:destination.format,storageLayout:destination.storageLayout||1,onProgress:progress=>{cancelled(signal);if(progress.total>0)onProgress?.({...progress,index:progress.done});cancelled(signal);},signal});
 cancelled(signal);
 const checked=inspectFormatSave(converted.bytes),chosen=info.slots.filter(slot=>slot.valid&&(selection==='all'||slot.slot===selection));
 if(chosen.some(slot=>!checked.slots[slot.slot]?.valid||checked.slots[slot.slot].format!==destination.format||formatSourceVersion(checked.slots[slot.slot].versionStamp,checked.slots[slot.slot].format)!==(number<destination.stamp?destination.version:from)))fail('output');
 return {bytes:converted.bytes,report:{...converted.report,from,to:number<destination.stamp?destination.version:from,legacy:legacyReport,sourceSampleTested:false,fullGameplayTest:false}};
}
function canMigrateModern(from,target){return selectStartMigrationVersion(target,from)!==null;}
