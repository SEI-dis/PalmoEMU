// SPDX-License-Identifier: AGPL-3.0-or-later
// Local, opt-out diagnostics. Never retain messages, raw stacks, URLs, file
// names supplied by users, ROM identities, saves, screenshots or raw UA text.
import {coreRegistry} from './core-registry.js';
import {videoFilters} from './video.js';

const key='palmo-diagnostics-v1',limit=5,frameLimit=8;
const sources=new Set(['handled','global-error','unhandled-rejection','core','startup','import','save','previous-session','update']);
const updateReasons=new Set(['offline','worker-redundant']);
const updatePhases=new Set(['startup','downloading','ready','waiting','applying']);
const workerStates=new Set(['parsed','installing','installed','activating','activated','redundant']);
const phases=new Set(['idle','importing','launching','playing','paused','exiting']);
const links=new Set(['none','online','local','usb']),filters=new Set(videoFilters.map(([id])=>id));
const cores=Object.values(coreRegistry).flat(),systems=new Set(Object.keys(coreRegistry));
const browsers=new Set(['Chrome','Edge','Firefox','Safari','Other']),oses=new Set(['Android','iOS','Windows','macOS','Linux','Other']);
const errorNames=new Set(['Error','TypeError','RangeError','ReferenceError','SyntaxError','URIError','EvalError','AggregateError','DOMException','AbortError','QuotaExceededError','NotAllowedError','NotFoundError','NetworkError','DataCloneError','NotReadableError','SecurityError','InvalidStateError','OperationError','TimeoutError','UnknownError','RuntimeError','CompileError','LinkError']);
// Exact source names prevent a fabricated stack from exporting a ROM filename
// disguised as src/<private-name>.js. New source files can be added explicitly.
const sourceNames=('library library-view startup-input backup backup-view game-preferences game-preferences-view input-controls input-controls-view rewind rewind-session app auto-update auto-update-worker bundled-skins celio-device celio-serial control-alignment control-editor control-layout core-factory core-registry cover-dialog development diagnostics diagnostics-view direct-link floating-panel game-info haptics import-progress jgenesis link-controls link-safety local-link-core local-link-save manic-ui mgba nds nds-skin offline peer-link retro rom-import rom-import-worker room-link save-safety settings-view shared skin-art skin-drawing skin-format skin-inputs skin-layout skin-preview skin-profiles skin-screens skin-selection skin-settings skin-zip skins state-dialogs storage three-ds three-ds-save three-ds-worker time-stretch ui update update-activity video').split(' ');
const files=new Set(sourceNames.map(name=>'src/'+name+'.js'));
for(const core of cores)for(const name of ['core.js','core.wasm',...(core.key==='mgba'?['mgba.js','mgba.wasm']:[]),...(core.key==='jgenesis'?['core_bg.wasm']:[])])files.add(`cores/${core.directory}/${name}`);
const base=new URL('../',import.meta.url);
let context=()=>({phase:'idle'}),seen=new WeakSet(),recording=false,memory={enabled:true,reports:[]},storageUnavailable=false;
const field=(object,name)=>{try{return object?.[name];}catch{return undefined;}};
const member=(value,set,fallback)=>typeof value==='string'&&set.has(value)?value:fallback;
const number=(value,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=max?Math.round(value*10)/10:undefined;
function safeContext(value){
 const result={phase:member(field(value,'phase'),phases,'idle')};
 for(const [name,set]of [['system',systems],['link',links],['filter',filters]]){const v=member(field(value,name),set);if(v!==undefined)result[name]=v;}
 const core=cores.find(c=>c.key===field(value,'core'));
 if(core)result.core=core.key;
 const coreId=field(value,'coreId');if(cores.some(c=>c.id===coreId))result.coreId=coreId;
 const speed=field(value,'speed');if(Number.isInteger(speed)&&speed>=1&&speed<=5)result.speed=speed;
 for(const name of ['romMiB','memoryMiB']){const v=number(field(value,name),name==='romMiB'?4096:1048576);if(v!==undefined)result[name]=v;}
 return result;
}
function current(){try{return safeContext(context());}catch{return {phase:'idle'};}}
function safeApp(value){const version=field(value,'version'),build=field(value,'build');return {
 version:typeof version==='string'&&/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(version)?version:'unknown',
 build:typeof build==='string'&&/^[a-f0-9]{16}$/.test(build)?build:'unknown'
};}
function app(){try{return safeApp({version:document.querySelector('meta[name="app-version"]')?.content,build:document.querySelector('meta[name="app-build"]')?.content});}catch{return safeApp();}}
function safeEnvironment(value){return {browser:member(field(value,'browser'),browsers,'Other'),os:member(field(value,'os'),oses,'Other')};}
function environment(){
 const raw=field(navigator,'userAgent'),ua=typeof raw==='string'?raw.slice(0,2048):'';
 const browser=/Edg(?:e|A|iOS)?\//.test(ua)?'Edge':/Firefox\/|FxiOS\//.test(ua)?'Firefox':/Chrome\/|CriOS\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Other';
 const os=/Android/.test(ua)?'Android':/iPhone|iPad|iPod/.test(ua)||(/Macintosh/.test(ua)&&field(navigator,'maxTouchPoints')>1)?'iOS':/Windows/.test(ua)?'Windows':/Macintosh|Mac OS X/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'Other';
 return {browser,os};
}
function path(value){
 if(typeof value!=='string'||value.length>2048)return;
 try{const url=new URL(value,base);if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return;const relative=url.pathname.slice(base.pathname.length);if(files.has(relative))return relative;}catch{}
}
function safeFrame(value){
 const file=path(field(value,'file')),line=field(value,'line'),column=field(value,'column');
 if(file&&Number.isSafeInteger(line)&&line>0&&line<=10000000&&Number.isSafeInteger(column)&&column>=0&&column<=10000000)return {file,line,column};
 const wasmFunction=field(value,'wasmFunction'),offset=field(value,'offset');
 if(Number.isSafeInteger(wasmFunction)&&wasmFunction>=0&&wasmFunction<=10000000&&typeof offset==='string'&&/^0x[0-9a-f]{1,12}$/.test(offset))return {wasmFunction,offset};
}
function frames(error){
 const result=[],stack=field(error,'stack');
 if(typeof stack==='string')for(const line of stack.slice(0,16384).split('\n').slice(0,40)){
  // Keep coordinates only; never function names, source text or WASM URL IDs.
  const wasm=line.match(/wasm-function\[(\d+)\]:(0x[0-9a-f]+)/i);
  const location=line.match(/((?:https?:\/\/|\/?src\/|\/?cores\/)[^\s()]+):(\d+):(\d+)\)?\s*$/);
  const frame=safeFrame(wasm?{wasmFunction:Number(wasm[1]),offset:wasm[2].toLowerCase()}:location?{file:location[1],line:Number(location[2]),column:Number(location[3])}:null);
  if(frame)result.push(frame);if(result.length===frameLimit)break;
 }
 if(!result.length){const frame=safeFrame({file:field(error,'filename'),line:field(error,'lineno'),column:field(error,'colno')});if(frame)result.push(frame);}
 return result;
}
function safeError(value,source){
 if(source==='previous-session')return {name:'SessionInterruption',category:'interrupted-session'};
 const name=member(field(value,'name'),errorNames,'Error');
 if(source==='update')return {name,category:'update',reason:member(field(value,'reason'),updateReasons,'unknown'),phase:member(field(value,'phase'),updatePhases,'unknown'),worker:member(field(value,'worker'),workerStates,'unknown'),online:typeof field(value,'online')==='boolean'?field(value,'online'):null};
 const category=({QuotaExceededError:'storage-quota',DataCloneError:'storage-clone',NotReadableError:'file-read',AbortError:'aborted',SecurityError:'permission',NotAllowedError:'permission',NetworkError:'network',RuntimeError:'wasm',CompileError:'wasm',LinkError:'wasm',RangeError:'range',TypeError:'type'})[name]||'runtime';
 return {name,category};
}
function safeReport(value){
 const time=field(value,'time');if(typeof time!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(time)||!Number.isFinite(Date.parse(time)))return;
 const source=member(field(value,'source'),sources,'handled'),rawFrames=field(value,'frames');
 return {time,source,error:safeError(field(value,'error'),source),app:safeApp(field(value,'app')),environment:safeEnvironment(field(value,'environment')),context:safeContext(field(value,'context')),frames:Array.isArray(rawFrames)?rawFrames.slice(0,frameLimit).map(safeFrame).filter(Boolean):[]};
}
function state(value){
 const reports=field(value,'reports');return {enabled:field(value,'enabled')!==false,reports:Array.isArray(reports)?reports.slice(-limit).map(safeReport).filter(Boolean):[]};
}
function read(){
 if(!storageUnavailable)try{
  const raw=localStorage.getItem(key);try{memory=raw&&raw.length<=65536?state(JSON.parse(raw)):{enabled:true,reports:[]};}catch{memory={enabled:true,reports:[]};}
 }catch{storageUnavailable=true;}
 return state(memory);
}
function write(value){
 memory=state(value);
 if(!storageUnavailable)try{localStorage.setItem(key,JSON.stringify({schemaVersion:1,...memory}));}catch{storageUnavailable=true;}
}
export const diagnostics=Object.freeze({
 setContext(fn){context=typeof fn==='function'?fn:()=>({phase:'idle'});},
 isEnabled(){return read().enabled;},
 persistenceAvailable(){read();return !storageUnavailable;},
 setEnabled(enabled){try{const value=read();value.enabled=!!enabled;write(value);}catch{}},
 list(){try{return read().reports;}catch{return [];}},
 clear(){try{const enabled=read().enabled;memory={enabled,reports:[]};seen=new WeakSet();if(!storageUnavailable){if(enabled)localStorage.removeItem(key);else write(memory);}}catch{storageUnavailable=true;}},
 record(error,source='handled'){
  if(recording)return;recording=true;
  try{
   const value=read();if(!value.enabled)return;
   const object=error!==null&&(typeof error==='object'||typeof error==='function');if(object&&seen.has(error))return;if(object)seen.add(error);
   source=member(source,sources,'handled');
   const report=safeReport({time:new Date().toISOString(),source,error:safeError(error,source),app:app(),environment:environment(),context:current(),frames:source==='previous-session'?[]:frames(error)});
   if(report){value.reports.push(report);write(value);return report;}
  }catch{}finally{recording=false;}
 },
 snapshot(){return {schemaVersion:1,app:app(),environment:environment(),current:current(),reports:diagnostics.list()};}
});
window.addEventListener('error',event=>{diagnostics.record(event.error||event,'global-error');});
window.addEventListener('unhandledrejection',event=>{diagnostics.record(event.reason,'unhandled-rejection');});
