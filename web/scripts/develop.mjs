// SPDX-License-Identifier: AGPL-3.0-or-later
// The development server watches authored sources; tests use serve.cjs directly.
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createStaticServer} from './serve.cjs';
import {inputFingerprint} from './i18n/catalogues.mjs';
let child,server,timer,stopping=false;
const build=()=>new Promise(resolve=>{
 child=spawn(process.execPath,[path.join(import.meta.dirname,'build-offline.cjs')],{windowsHide:true,stdio:'inherit'});
 child.once('error',error=>{console.error(error.message);resolve(false);});child.once('close',code=>{child=null;resolve(code===0);});
});
async function stop(){stopping=true;clearTimeout(timer);if(child)child.kill();server?.close();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
let last='';
async function poll(){
 if(stopping)return;
 try{const current=inputFingerprint();if(current!==last){
  const success=await build();last=success?inputFingerprint():current;
 }}catch(error){console.error(error.message);}
 if(!stopping)timer=setTimeout(poll,1500);
}
if(await build()){
 last=inputFingerprint();server=createStaticServer();server.listen(Number(process.env.PORT??4173),'127.0.0.1',()=>console.log('PalmoEMU development: http://127.0.0.1:'+server.address().port+' (automatic localization enabled)'));timer=setTimeout(poll,1500);
}else process.exitCode=1;
