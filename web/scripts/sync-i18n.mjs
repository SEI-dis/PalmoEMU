// SPDX-License-Identifier: AGPL-3.0-or-later
import fs from 'node:fs';
import path from 'node:path';
import {webRoot} from './i18n/extract.mjs';
import {createPlan,assertCurrent,synchronize} from './i18n/catalogues.mjs';
import {createTranslator} from './i18n/translator.mjs';
const args=process.argv.slice(2);
if(args.some(a=>a!=='--check'))throw Error('Usage: node scripts/sync-i18n.mjs [--check]');
let lock;
try{
 const plan=createPlan();
 if(args.includes('--check')){assertCurrent(plan);console.log('PASS: all authored UI and release notes have current translations.');}
 else if(!plan.jobs.length){assertCurrent(plan);console.log('Translations are current; no model is needed.');}
 else{
  lock=path.join(webRoot,'scripts/i18n/.sync.lock');
  try{fs.writeFileSync(lock,String(process.pid),{flag:'wx'});}catch{
   const file=lock;lock=null;const value=fs.readFileSync(file,'utf8');const pid=Number(value);
   if(!Number.isSafeInteger(pid)||pid<=0)throw Error('Invalid localization lock; inspect scripts/i18n/.sync.lock.');
   try{process.kill(pid,0);throw Error('Another localization build is running (PID '+pid+').');}
   catch(error){if(error.code!=='ESRCH')throw error;}
   if(fs.readFileSync(file,'utf8')!==value)throw Error('Localization lock changed; retry.');
   fs.unlinkSync(file);fs.writeFileSync(file,String(process.pid),{flag:'wx'});lock=file;
  }
  console.log('Translating '+plan.jobs.length+' new/changed messages locally.');
  const translator=await createTranslator();
  try{await synchronize(plan,translator.translate,{onProgress:(code,n,total)=>console.log(code+': '+n+'/'+total)});}finally{await translator.close();}
  assertCurrent(createPlan());console.log('Updated all languages. Review generated wording before publication.');
 }
}catch(error){console.error(error.message);process.exitCode=1;}
finally{if(lock)fs.unlinkSync(lock);}
