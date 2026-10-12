// SPDX-License-Identifier: AGPL-3.0-or-later
const localization=import('./i18n/index.js');let tr;
// Development-only source-built core. File/Blob and saves stay in this worker.
const coreBase=new URL('../__dev3ds__/',self.location.href);
importScripts(new URL('local_3ds.js',coreBase).href);
const originalFetch=self.fetch.bind(self),wasmURL=new URL('local_3ds.wasm',coreBase).href;
self.fetch=(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url,self.location.href).href;
 if(url!==wasmURL||(init.method||input?.method||'GET')!=='GET')return Promise.reject(Error('Core network access is disabled'));
 return originalFetch(input,init);
};
for(const name of ['WebSocket','XMLHttpRequest','WebTransport'])self[name]=class{constructor(){throw Error('Core network access is disabled');}};
let core,canvas,paused=true,closed=false,timer,keys=0,speed=1,frames=0,bitmapPending=false,volume=.7,keyboard;
const log=[];
const describe=e=>typeof e==='number'&&core?.getExceptionMessage?core.getExceptionMessage(e).join(': '):e?.message||String(e);
const fail=e=>{paused=true;clearTimeout(timer);postMessage({type:'fatal',error:describe(e)});};
function localKeyboard(hint,maxLength,password){
 const flags=new Int32Array(keyboard,0,4);flags.fill(0);
 postMessage({type:'keyboard',hint,maxLength:Math.max(1,Math.min(256,maxLength||32)),password:!!password});
 if(Atomics.wait(flags,0,0,180000)==='timed-out'||Atomics.load(flags,0)!==1)return 0;
 const length=Atomics.load(flags,1);if(length<0||length>1024)return 0;
 const pointer=core._malloc(length+1);if(!pointer)return 0;
 core.HEAPU8.set(new Uint8Array(keyboard,16,length),pointer);core.HEAPU8[pointer+length]=0;return pointer;
}
function tick(){
 if(paused||closed)return;
 try{
  const start=performance.now();core._web_frame(keys);
  if(core._web_failed())throw Error(core.UTF8ToString(core._web_error())||tr('3DSコアが停止しました。'));
  frames++;
  const count=core._web_audio_read();
  if(count&&volume){const offset=core._web_audio()>>1,pcm=core.HEAP16.slice(offset,offset+count*2);postMessage({type:'audio',pcm,rate:core._web_audio_rate()},[pcm.buffer]);}
  if(!bitmapPending){const bitmap=canvas.transferToImageBitmap();bitmapPending=true;postMessage({type:'frame',bitmap,frames},[bitmap]);}
  timer=setTimeout(tick,Math.max(0,1000/core._web_fps()/speed-(performance.now()-start)));
 }catch(e){fail(e);}
}
function setPaused(value){paused=value;clearTimeout(timer);input(0);core?._web_touch(0,0,0);if(!paused)tick();}
function input(mask){
 const map=[8,0,2,3,7,6,4,5,11,10,9,1];keys=map.reduce((out,id,i)=>out|((mask&(1<<i))?1<<id:0),0);
 // The built-in directional control also drives Circle Pad for games using analog movement.
 core?._web_analog(0,((mask&(1<<4))?32767:0)-((mask&(1<<5))?32767:0));
 core?._web_analog(1,((mask&(1<<7))?32767:0)-((mask&(1<<6))?32767:0));
}
const saveModule=import('./three-ds-save.js');
async function request(message){
 const {type,id}=message;
 const i18n=await localization;i18n.setWorkerLanguage(message.language);tr=i18n.tr;
 try{
  let result;
  if(type==='load'){
   if(core)throw Error(tr('コアは既に起動しています。'));
   if(!crossOriginIsolated||typeof OffscreenCanvas!=='function')throw Error(tr('3DSに必要なブラウザ機能が使えません。'));
   keyboard=message.keyboard;canvas=new OffscreenCanvas(400,480);
   core=await createLocal3DS({canvas,localKeyboard,mainScriptUrlOrBlob:new URL('local_3ds.js',coreBase).href,
    locateFile:p=>new URL(p,coreBase).href,print:()=>{},printErr:s=>{if(log.length<20)log.push(String(s));}});
   core.FS.mkdir('/roms');const extension=/\.(3ds|3dsx|cci|cxi)$/i.exec(message.filename)?.[1]?.toLowerCase();
   if(!extension||!(message.blob instanceof Blob))throw Error(tr('3DSのROM形式を確認してください。'));
   const name='game.'+extension;core.FS.mount(core.FS.filesystems.WORKERFS,{blobs:[{name,data:message.blob}]},'/roms');
   const pointer=core.stringToNewUTF8('/roms/'+name);let loaded;
   try{loaded=core._web_load(pointer,0);}finally{core._free(pointer);}
   if(!loaded)throw Error(core.UTF8ToString(core._web_error())||tr('ROMを起動できません。復号済みの形式か確認してください。'));
   result={fps:core._web_fps()};
  }else if(type==='pause'){setPaused(!!message.value);}
  else if(type==='keys'){input(message.mask);}
  else if(type==='touch'){core?._web_touch(Math.round(message.x*65535-32768),Math.round(message.y*32767),message.down?1:0);}
  else if(type==='speed'){speed=Math.max(1,Math.min(5,message.value||1));}
  else if(type==='volume'){volume=message.value;}
  else if(type==='ack'){bitmapPending=false;}
  else if(type==='save'){core._web_flush();result=(await saveModule).packSave(core.FS);}
  else if(type==='restore'){(await saveModule).unpackSave(core.FS,message.bytes);}
  else if(type==='checkpoint'){
   const archive=await saveModule;core._web_flush();result={save:archive.packSave(core.FS),state:null,stateError:null};
   try{const size=core._web_state_export();if(!size)throw Error(tr('中断状態を保存できませんでした。'));result.state=core.HEAPU8.slice(core._web_state_data(),core._web_state_data()+size);}catch(e){result.stateError=describe(e);}
  }else if(type==='state'){
   const size=core._web_state_export();if(!size)throw Error(tr('中断状態を保存できませんでした。'));
   result=core.HEAPU8.slice(core._web_state_data(),core._web_state_data()+size);
  }else if(type==='loadState'){
   const bytes=message.bytes;if(!bytes?.length||bytes.length>128*1048576)throw Error(tr('ステート形式を確認してください。'));
   const pointer=core._malloc(bytes.length);if(!pointer)throw Error(tr('メモリーを確保できませんでした。'));
   try{core.HEAPU8.set(bytes,pointer);if(!core._web_state_import(pointer,bytes.length))throw Error(tr('このコアで読み込めるステートではありません。'));}finally{core._free(pointer);}
  }else if(type==='reset'){core._web_reset();}
  else if(type==='close'){closed=true;clearTimeout(timer);core?._web_close();core?.PThread.terminateAllThreads();}
  if(id)postMessage({type:'reply',id,result},result instanceof Uint8Array?[result.buffer]:type==='checkpoint'?[result.state?.buffer,result.save?.buffer].filter(Boolean):[]);
  if(closed)self.close();
 }catch(error){if(id)postMessage({type:'reply',id,error:describe(error)});else fail(error);}
}
let queue=Promise.resolve();self.onmessage=({data})=>{queue=queue.then(()=>request(data)).catch(fail);};
