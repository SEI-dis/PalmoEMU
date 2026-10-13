// SPDX-License-Identifier: AGPL-3.0-or-later
// PalmoEMU safety facade. Upstream migration code has separate provenance;
// this module's license does not relicense ../vendor/start-save-migrate/.
import {MANIFEST,inspectInput,migrateSave,normalizeVersion,readSave,getVariable} from '../vendor/start-save-migrate/engine.js';
import {tr} from './i18n/index.js';
import {startSaveCompatibility} from './start-save-compatibility.js';

export const START_MIGRATION_VERSION='0.42.3';
export const START_SOURCE_VERSIONS=Object.freeze(MANIFEST.versions.map(source=>Object.freeze({version:source.version,sampleTested:source.saveSampleTested===true,boxes:source.boxes,encrypted:source.encrypted,crc32:source.crc32??null})));
const sizes=new Set([131072,131088,1048576,1048592,6291456,6291472]),maxSaveBytes=6291472;
const sources=new Map(MANIFEST.versions.map(source=>[source.version,source]));
const stamps=new Map(MANIFEST.versions.filter(source=>source.saveVersionStamp!==undefined).map(source=>[source.saveVersionStamp,source.version]));
const failures={input:()=>tr('通常セーブのデータを選択してください。'),size:()=>tr('128KiB・1MiB・6MiBの通常セーブを選択してください。'),version:()=>tr('移行元のバージョンを選択してください。'),mismatch:()=>tr('セーブ内のバージョンと選択した移行元が一致しません。'),slot:()=>tr('有効なセーブを選択してください。'),output:()=>tr('移行結果の検証に失敗しました。原本は変更されていません。')};
function fail(code){const error=new Error(failures[code]());error.code=`START_${code.toUpperCase()}`;throw error;}
function view(value){
 if(value instanceof Uint8Array)return value;
 if(value instanceof ArrayBuffer)return new Uint8Array(value);
 fail('input');
}
function copySave(value){const bytes=view(value);if(bytes.byteLength>maxSaveBytes||!sizes.has(bytes.byteLength))fail('size');return Uint8Array.from(bytes);}
function sourceVersion(value){if(typeof value!=='string'||value.length>16)fail('version');const source=sources.get(normalizeVersion(value));if(!source)fail('version');return source;}
function cancelled(signal){if(signal?.aborted){const error=new Error('Migration cancelled');error.name='AbortError';throw error;}}
const crcTable=Uint32Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});

// Identification only: CRC32 is neither proof of origin nor authorization to use a ROM.
export function identifyStartROM(value){
 const bytes=view(value);if(bytes.length<192||bytes.length>64*1048576)return null;
 let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);crc=(crc^0xffffffff)>>>0;
 const matches=START_SOURCE_VERSIONS.filter(source=>source.crc32===crc);if(!matches.length)return null;
 return matches.length===1?{version:matches[0].version,crc32:crc}:{version:null,versions:matches.map(source=>source.version),crc32:crc};
}

function inspect(bytes,source){
 const slots=inspectInput(bytes,source.version).map(slot=>{
  if(!slot.valid)return {slot:slot.slot,valid:false};
  const state=readSave(bytes,slot.slot),stamp=getVariable(state,0x50ef),detectedVersion=stamps.get(stamp)||null;
  // Early releases do not define a stamp. Only known stamps are identification
  // evidence; zero/unrecognised old fields must not masquerade as a version.
  if(detectedVersion&&detectedVersion!==source.version)fail('mismatch');
  if(source.saveVersionStamp!==undefined&&stamp!==source.saveVersionStamp)fail('mismatch');
  return {...slot,versionStamp:stamp,detectedVersion,encrypted:state.encrypted};
 });
 return {sourceVersion:source.version,targetVersion:START_MIGRATION_VERSION,sampleTested:source.saveSampleTested===true,slots};
}
export function inspectStartSave(value,from){return inspect(copySave(value),sourceVersion(from));}
export function inspectStartUpdate(value,from){
 const source=sourceVersion(from),info=inspectStartSave(value,from);
 // A filename or ROM revision alone cannot establish the actual save format.
 if(info.slots.some(slot=>slot.valid&&(slot.boxes!==source.boxes||slot.encrypted!==source.encrypted)))fail('mismatch');
 return {...info,compatibility:startSaveCompatibility(source.version,START_MIGRATION_VERSION)};
}

export async function migrateStartSave(value,{from,onProgress,signal,selection='all'}={}){
 cancelled(signal);
 const bytes=copySave(value),source=sourceVersion(from),info=inspect(bytes,source);
 if(selection!=='all'&&(!Number.isInteger(selection)||!info.slots.find(slot=>slot.slot===selection&&slot.valid)))fail('slot');
 const chosen=info.slots.filter(slot=>slot.valid&&(selection==='all'||slot.slot===selection));
 const result=await migrateSave(bytes,source.version,selection,progress=>{
  cancelled(signal);onProgress?.(progress);cancelled(signal);
 });
 cancelled(signal);
 if(!(result.data instanceof Uint8Array)||!sizes.has(result.data.length)||result.report.to!==START_MIGRATION_VERSION)fail('output');
 for(const slot of chosen){
  const after=readSave(result.data,slot.slot);
  // Unselected slots may intentionally retain an older format/stamp.
  if(after.version!==23||after.boxCount!==50||getVariable(after,0x50ef)!==sources.get(START_MIGRATION_VERSION).saveVersionStamp)fail('output');
 }
 // The vendor verifies all existing records, untouched slots and the RTC tail.
 // Output ownership is independent from the caller and from worker input buffers.
 return {bytes:result.data,report:{...result.report,sourceSampleTested:source.saveSampleTested===true,fullGameplayTest:false}};
}
