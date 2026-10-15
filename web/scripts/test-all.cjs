// SPDX-License-Identifier: AGPL-3.0-or-later
// Run isolated synthetic tests; never attach to the user's browser profile.
const fs=require('node:fs'),path=require('node:path'),{spawn,fork}=require('node:child_process');
const root=path.resolve(__dirname,'..'),scripts=require('../package.json').scripts;
const cli=process.argv.slice(2),webkit=cli.includes('--webkit')||process.env.BROWSER_ENGINE==='webkit';
const engine=webkit?'webkit':'chromium';
const supported=new Set(['start-updates-browser','save-safety','core-teardown','core-load-failure','backup-errors','audio-activation','audio-startup','ui-navigation','security-policy','pause-exit','audio-lifecycle','save-rescue','update-safety','update-recovery','runtime-tools-browser','backup-enhancements','save-completion','relay-config','save-cadence','save-apply','start-save-ui','start-save-update-range','save-import-recovery','rom-update-artwork','input-dialog','recording','recording-ui','trainer-card','quick-start','save-worker','save-worker-fence','save-byte-comparison','save-history-limits','camera','input-test','nds-lid-browser','rom-update','backup-selection','state-transfer','gb-local-link','release-notice','video-strength','cartridge-options','rom-zip','dpad-feedback','upstream-features','two-player','languages','languages-offline','i18n','browser','visibility','state-ui','responsive-skins','layout-sizing','layout-alignment','runtime-performance','speed-control','pitch-audio','privacy','native-menu','nds-browser','nds-skin','nds-options-browser','system-skins','link-panel','direct-link','haptics','room-link','covers','multicore','skin-compatibility','skins','bundled-skins','skin-orientation','update','extended-save','rom-import','diagnostics','game-preferences','input-controls','rewind','backup','startup-input','game-navigation','library','library-bulk','player-selection','mgba-compatibility','touch-recovery','player-gestures','fceumm-update']);
function selectTests(){
 let shard=null;
 for(let i=0;i<cli.length;i++){
  const arg=cli[i];if(['--webkit','--serve','--list'].includes(arg))continue;
  if(arg!=='--shard'&&!arg.startsWith('--shard='))throw Error('Unknown option: '+arg);
  if(shard)throw Error('Specify --shard only once');
  const value=arg==='--shard'?cli[++i]:arg.slice('--shard='.length),match=value?.match(/^([1-9]\d*)\/([1-9]\d*)$/);
  if(!match)throw Error('Use --shard=1/3 (one-based index/count)');
  shard={index:Number(match[1]),count:Number(match[2])};
  if(!Number.isSafeInteger(shard.index)||!Number.isSafeInteger(shard.count)||shard.index>shard.count)throw Error('Shard index must be between 1 and count');
 }
 const all=[];
 for(const [name,command]of Object.entries(scripts)){
  if(name!=='test'&&(!name.startsWith('test:')||name==='test:all'))continue;
  const match=command.match(/^(node|python) (.+)$/);if(!match)throw Error('Unsupported test command: '+command);
  const args=match[2].split(' '),test=path.basename(args.at(-1),'.cjs');
  if(webkit&&!supported.has(test))continue;
  all.push({name,command,args,test,executable:match[1]==='node'?process.execPath:process.env.PYTHON||(process.platform==='win32'?'python':'python3')});
 }
 if(shard&&shard.count>all.length)throw Error('Shard count must not exceed the number of suites');
 const tests=shard?all.filter((_,i)=>i%shard.count===shard.index-1):all;
 return {shard,total:all.length,tests};
}
async function startServer(){
 if(!cli.includes('--serve'))return null;
 const server=fork(path.join(__dirname,'serve.cjs'),[],{env:{...process.env,PORT:'0'},windowsHide:true,stdio:['ignore','ignore','inherit','ipc']});
 try{
  const port=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Test server did not become ready')),10000);
   server.once('message',message=>{clearTimeout(timer);resolve(message.port);});
   server.once('error',error=>{clearTimeout(timer);reject(error);});
   server.once('exit',code=>{clearTimeout(timer);reject(Error('Test server exited: '+code));});
  });
  process.env.TEST_URL=`http://127.0.0.1:${port}/`;return server;
 }catch(error){server.kill();throw error;}
}
function runTest({executable,args,test},output){
 return new Promise(resolve=>{
  const log=fs.openSync(path.join(output,test+'.log'),'w');let failure;
  const child=spawn(executable,args,{cwd:root,env:{...process.env,BROWSER_ENGINE:engine,PYTHONUNBUFFERED:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  const timer=setTimeout(()=>{failure=Error('Test timed out after 300 seconds');child.kill();},300000);
  const write=(chunk,stream)=>{fs.writeSync(log,chunk);stream.write(chunk);};
  child.stdout.on('data',chunk=>write(chunk,process.stdout));child.stderr.on('data',chunk=>write(chunk,process.stderr));
  child.once('error',error=>{failure=error;});
  child.once('close',(code,signal)=>{
   clearTimeout(timer);
   if(failure||signal)write(Buffer.from((failure?.message||'Test terminated: '+signal)+'\n'),process.stderr);
   fs.closeSync(log);resolve(code===0&&!failure);
  });
 });
}
async function runSuite({shard,total,tests}){
 const suffix=shard?`-shard-${shard.index}-of-${shard.count}`:'',output=path.join(root,'test-results','suite-'+engine+suffix);fs.mkdirSync(output,{recursive:true});
 const results=[];console.log(`${engine}: ${tests.length}/${total} suites${shard?` (shard ${shard.index}/${shard.count})`:''}`);
 for(const test of tests){
  const start=Date.now();console.log(`RUN ${test.name}`);
  const passed=await runTest(test,output);results.push({name:test.name,passed,milliseconds:Date.now()-start});
  console.log(`${passed?'PASS':'FAIL'} ${test.name} (${((Date.now()-start)/1000).toFixed(1)}s)`);
  // Persist progress after each suite, so cancelled CI jobs retain diagnostics.
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({engine,shard,total,results},null,2)+'\n');
 }
 console.log(`${results.filter(r=>r.passed).length}/${results.length} suites passed. Logs: ${output}`);
 if(!results.length||results.some(r=>!r.passed))process.exitCode=1;
}
(async()=>{
 const selected=selectTests();
 if(cli.includes('--list')){console.log(JSON.stringify({engine,...selected,tests:selected.tests.map(({name,command})=>({name,command}))},null,2));return;}
 const server=await startServer();try{await runSuite(selected);}finally{server?.kill();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
