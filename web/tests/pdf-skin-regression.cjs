// SPDX-License-Identifier: AGPL-3.0-or-later
// Original malformed fixtures; no upstream PDFs, fonts or user skins are used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const runtime=require('./browser-runtime.cjs'),{zip}=require('./skin-fixture.cjs');
const kind=process.env.BROWSER_ENGINE||'chromium',base=process.env.TEST_URL||'http://127.0.0.1:4173/';

function document(objects){
 let text='%PDF-1.4\n',offsets=[0];
 objects.forEach((body,index)=>{offsets.push(text.length);text+=`${index+1} 0 obj\n${body}\nendobj\n`;});
 const start=text.length;
 text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
 return Buffer.from(text);
}
const stream=(data,entries='')=>`<< /Length ${data.length} ${entries} >>\nstream\n${data}\nendstream`;
function shading(code){
 return document(['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 1 /Kids [3 0 R] >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /Shading << /Shade 5 0 R >> >> /Contents 4 0 R >>',stream('/Shade sh'),'<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [0 0 100 0] /Function 6 0 R /Extend [true true] >>',stream(code,'/FunctionType 4 /Domain [0 1] /Range [0 1 0 1 0 1]')]);
}
function skin(name,pdf){
 const representation={mappingSize:{width:100,height:100},assets:{resizable:'controller.pdf'},gameScreenFrame:{x:5,y:5,width:90,height:60},items:[]};
 const info={name,gameTypeIdentifier:'com.rileytestut.Delta.game.gba',representations:{iphone:{standard:{portrait:representation}}}};
 return zip({'info.json':JSON.stringify(info),'controller.pdf':pdf});
}

// The bundled parser used to spin forever after a format-1 charset ended early.
// Run only that method in a bounded VM; the normal PDF browser case is below.
function truncatedCharset(){
 const source=fs.readFileSync(path.join(__dirname,'../vendor/pdfjs/pdf.worker.mjs'),'utf8');
 const start=source.indexOf('  parseCharsets(pos, length, strings, cid) {'),end=source.indexOf('  parseEncoding(',start);
 assert(start>0&&end>start,'Locate the bundled CFF charset parser');
 const code=`class CFFCharset {constructor(predefined,format,charset){this.charset=charset;}};class Parser {${source.slice(start,end)}};const parser=new Parser();parser.bytes=Uint8Array.from([0,0,0,1]);parser.parseCharsets(3,2,null,true).charset`;
 assert.equal(vm.runInNewContext(code,{warn(){}},{timeout:1000}).length,1,'Truncated CFF input must terminate without inventing glyphs');
}

(async()=>{
 truncatedCharset();
 const browser=await runtime[kind].launch({headless:true,...(kind==='chromium'?{channel:process.env.BROWSER_CHANNEL||'msedge'}:{})});
 try{
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),requests=[];
  page.on('request',request=>requests.push(request.url()));await page.goto(base);await page.locator('[data-tab=settings]').waitFor();
  const importFixture=async(name,pdf)=>{
   const result=await page.evaluate(async({bytes})=>{
    const {importSkin}=await import('./src/skins/skins.js');let timer;
    try{return await Promise.race([importSkin(new File([new Uint8Array(bytes)],'fixture.deltaskin')).then(record=>({ok:true,id:record.id,type:record.images['controller.pdf'].type,size:record.images['controller.pdf'].size})),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('PDF skin import timed out')),10000);})]);}
    catch(error){return {ok:false,error:error.message};}finally{clearTimeout(timer);}
   },{bytes:[...skin(name,pdf)]});
   assert(!/timed out/.test(result.error||''),name+' must finish');return result;
  };
  const ordinary=await importFixture('Valid PDF shading',shading('{ dup dup }'));assert.equal(ordinary.ok,true);assert.equal(ordinary.type,'image/png');assert(ordinary.size>0);
  const snapshot=await page.evaluate(async id=>{const db=await import('./src/storage/storage.js'),record=await db.get('skins',id),{hash}=await import('./src/shared.js');return hash(record.images['controller.pdf'].bytes);},ordinary.id);
  // '.' and an overflowing number previously left the lexer cursor unchanged.
  for(const code of ['{ . . . }','{ 1e999 0 0 }','{ '.repeat(1100)+'0'+' }'.repeat(1100)]){
   const result=await importFixture('Malformed PostScript '+code.slice(0,20),shading(code));
   if(result.ok){assert.equal(result.type,'image/png');assert(result.size>0);}
  }
  const broken=await importFixture('Broken PDF',Buffer.from('not a PDF'));assert.equal(broken.ok,false,'Unparseable PDFs must be rejected');
  const after=await page.evaluate(async id=>{const db=await import('./src/storage/storage.js'),record=await db.get('skins',id),{hash}=await import('./src/shared.js');return hash(record.images['controller.pdf'].bytes);},ordinary.id);assert.equal(after,snapshot,'Failed imports must not change existing skin bytes');
  assert(!requests.some(url=>/pdf\.renderer|\.wasm|standard_fonts|cmaps/.test(url)),'Existing opt-out settings must not introduce new optional PDF assets');
  assert(requests.filter(url=>/^https?:/.test(url)).every(url=>new URL(url).origin===new URL(base).origin),'PDF imports remain local');
  await context.close();console.log('PASS '+kind+': truncated CFF terminates, malformed Type 4 PDF skin imports settle, normal PDF renders, existing skin bytes are unchanged and no optional codecs/renderer are fetched.');
 }finally{await browser.close();}
})().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
