/* PokemonStart v0.53.1 save-format migration, extracted and adapted for PalmoEMU.
 * Source distributor: pm-start/PokemonStart. See README.md and component.json.
 * Project-specific permission; no standardized upstream license was supplied.
 * This component is separate from the earlier START Save Migrate component.
 */

const SECTOR=0x1000,DATA=0xff0,SIGNATURE=0x08012025,SLOT_BYTES=3*1024*1024;
const FULL_BYTES=2*SLOT_BYTES,SMALL_BYTES=32*SECTOR,VERSION_OFFSET=0xba,VERSION_GUARD=0x31ff,WIDE_VERSION_GUARD=0x34ff;
const SECTION_SIZES=[0xf24,DATA,DATA,DATA,0xd98],MAP_OFFSET=0x1400;
const PAGE0_MON=4+0x98+0xef+0xba0,EXT_META_SIZE=110,REGION_BOX_OFFSET=0x0203cabc-0x0203bfac;
const SB1_BOX_OFFSET=0x18e8,SB2_BOX_OFFSET=0xf8,MON_BYTES=58,BOX_COUNT=50,BOX_SLOTS=30;
const u16=(b,o)=>b[o]|b[o+1]<<8,u32=(b,o)=>(u16(b,o)|u16(b,o+2)<<16)>>>0;
const put16=(b,o,n)=>{b[o]=n&255;b[o+1]=(n>>>8)&255;};
const put32=(b,o,n)=>{put16(b,o,n);put16(b,o+2,n>>>16);};
const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const nonzero=b=>b.some(value=>value!==0),erased=b=>b.every(value=>value===255);
const key=Uint8Array.from({length:SECTOR},(_,i)=>{
 let x=(Math.imul(i,0x9e3779b1)+0x504b5354)>>>0;x^=x>>>15;x=Math.imul(x,0x2c1b3c6d)>>>0;
 x^=x>>>12;x=Math.imul(x,0x297a2d39)>>>0;x^=x>>>15;return x>>>24;
});
function fail(code,slot){const error=new Error(code);error.code='START_FORMAT_'+code;if(slot!==undefined)error.slot=slot;throw error;}
function abort(signal){if(signal?.aborted){const error=new Error('Migration cancelled');error.name='AbortError';throw error;}}
function input(value){
 const bytes=value instanceof Uint8Array?value:value instanceof ArrayBuffer?new Uint8Array(value):null;
 if(!bytes)fail('INPUT');
 const rtcBytes=bytes.length%SECTOR,bodyBytes=bytes.length-rtcBytes;
 if(![SMALL_BYTES,FULL_BYTES].includes(bodyBytes)||![0,16].includes(rtcBytes))fail('SIZE');
 return {raw:Uint8Array.from(bytes),bodyBytes,rtcBytes};
}
function checksum(bytes,offset,size){let sum=0;for(let i=0;i<(size&~3);i+=4)sum=(sum+u32(bytes,offset+i))>>>0;return ((sum>>>16)+sum)&65535;}
function xor(bytes){const out=bytes.slice();for(let i=0;i<SECTOR;i++)out[i]^=key[i];return out;}
function decode(raw){
 const out=raw.slice();
 for(let o=0;o+SECTOR<=out.length;o+=SECTOR){
  if(u32(out,o+0xff8)===SIGNATURE)continue;
  if(((u32(out,o+0xff8)^u32(key,0xff8))>>>0)===SIGNATURE)out.set(xor(out.subarray(o,o+SECTOR)),o);
 }
 return out;
}
function format(name,magic,mon,p0Mons,pageMons,boxPages,shelfPages,extPages,extFirst,extMons,overflowCount,overflowFirst=24,extPhysicalCount=16){
 const p0Ext=PAGE0_MON+p0Mons*mon,extMetaOffset=(extMons-(extPages-1)*pageMons)*mon;
 return {name,magic,mon,p0Mons,pageMons,boxPages,shelfPages,extPages,extFirst,p0Ext,p0Overflow:p0Ext+1+extPages,
  extMetaOffset,overflowOffset:extMetaOffset+EXT_META_SIZE,overflowCount,overflowFirst,extPhysicalCount,
  monAt(index){if(index>=extFirst){index-=extFirst;return [shelfPages+Math.floor(index/pageMons),(index%pageMons)*mon];}
   if(index<p0Mons)return [0,PAGE0_MON+index*mon];index-=p0Mons;return [1+Math.floor(index/pageMons),(index%pageMons)*mon];}};
}
const OLD=format('old',0x4c454853,58,12,70,15,17,5,990,330,28);
const LARGE=format('L',0x324c4853,60,11,68,16,18,8,1020,480,30);
const WIDE=format('W',0x334c4853,63,11,64,16,18,9,960,540,30,26,18);
// Modular serial arithmetic. The half-range difference is intrinsically
// ambiguous and must never be resolved by an arbitrary bank/page preference.
function compareCounter(a,b){const delta=(a-b)>>>0;if(delta===0x80000000)fail('COUNTER_AMBIGUOUS');return delta===0?0:delta<0x80000000?1:-1;}
function mainBank(img,bank){
 const block=img.subarray(bank*5*SECTOR,(bank+1)*5*SECTOR);if(erased(block))return null;
 const sections=[];let counter;
 for(let physical=bank*5;physical<(bank+1)*5;physical++){
  const offset=physical*SECTOR,id=u16(img,offset+0xff4),count=u32(img,offset+0xffc);
  if(id>=5||sections[id]!==undefined||u32(img,offset+0xff8)!==SIGNATURE||checksum(img,offset,SECTION_SIZES[id])!==u16(img,offset+0xff6))fail('MAIN');
  if(counter!==undefined&&counter!==count)fail('MAIN_COUNTER');counter=count;sections[id]=offset;
 }
 return {bank,sections,counter};
}
function chooseMain(img){
 const banks=[mainBank(img,0),mainBank(img,1)].filter(Boolean);if(!banks.length)fail('MAIN');
 if(banks.length===1)return banks[0];
 const order=compareCounter(banks[1].counter,banks[0].counter);
 if(order===0){
  // Equal counters occur in the old converter's duplicated main banks. Only
  // identical payloads are unambiguous; footer order need not be identical.
  for(let id=0;id<5;id++)if(!equal(img.subarray(banks[0].sections[id],banks[0].sections[id]+DATA),img.subarray(banks[1].sections[id],banks[1].sections[id]+DATA)))fail('MAIN_CONFLICT');
 }
 return order>0?banks[1]:banks[0];
}
function sb1(sections){const out=new Uint8Array(DATA*3+0xd98);let pos=0;for(let id=1;id<5;id++){out.set(sections[id].subarray(0,SECTION_SIZES[id]),pos);pos+=SECTION_SIZES[id];}return out;}
function setSb1(sections,bytes){let pos=0;for(let id=1;id<5;id++){sections[id].set(bytes.subarray(pos,pos+SECTION_SIZES[id]));pos+=SECTION_SIZES[id];}}
function readLogical(img){
 const main=chooseMain(img),magic=u32(img,main.sections[2]+MAP_OFFSET-DATA),fmt=magic===OLD.magic?OLD:magic===LARGE.magic?LARGE:magic===WIDE.magic?WIDE:null;
 if(!fmt)fail('LAYOUT');
 const sections=main.sections.map(offset=>img.slice(offset,offset+DATA)),body=sb1(sections);
 if(u32(body,MAP_OFFSET+4)!==main.counter)fail('MAP_COUNTER');
 const pages=new Map(),counters=new Map(),used=new Set(),references=[];
 function readPage(page,physical,min,max){
  if(!Number.isInteger(physical)||physical<min||physical>max||used.has(physical)||physical*SECTOR+SECTOR>img.length)fail('PAGE_MAP');
  used.add(physical);const offset=physical*SECTOR;
  if(u16(img,offset+0xff4)!==0x40+page||u32(img,offset+0xff8)!==SIGNATURE||checksum(img,offset,DATA)!==u16(img,offset+0xff6))fail('PAGE');
  references.push(physical);return {data:img.slice(offset,offset+DATA),counter:u32(img,offset+0xffc)};
 }
 for(let page=0;page<fmt.shelfPages;page++){
  const physical=body[MAP_OFFSET+8+page];if(physical===255)continue;
  const entry=readPage(page,physical,10,31);pages.set(page,entry.data);counters.set(page,entry.counter);
 }
 const p0=pages.get(0);if(!p0)fail('PAGE_ZERO');
 const extension=p0[fmt.p0Ext];
 if(extension===0x58){
  for(let i=0;i<fmt.extPages;i++){
   const physical=p0[fmt.p0Ext+1+i];if(physical===255)continue;
   const entry=readPage(fmt.shelfPages+i,32+physical,40,39+fmt.extPhysicalCount);pages.set(fmt.shelfPages+i,entry.data);counters.set(fmt.shelfPages+i,entry.counter);
  }
 }else if(![0,255].includes(extension)||fmt!==OLD)fail('EXT_MAP');
 const last=fmt.shelfPages+fmt.extPages-1,lastPage=pages.get(last),overflow=lastPage?.[fmt.overflowOffset];
 if(overflow===0x59){
  for(let page=1;page<fmt.boxPages;page++){
   const physical=lastPage[fmt.overflowOffset+page];if(physical===255)continue;
   const entry=readPage(page,32+physical,32+fmt.overflowFirst,31+fmt.overflowFirst+fmt.overflowCount),old=pages.get(page);
   const order=old?compareCounter(entry.counter,counters.get(page)):1;
   if(order===0&&!equal(old,entry.data))fail('PAGE_CONFLICT');
   if(order>0){pages.set(page,entry.data);counters.set(page,entry.counter);}
  }
 }else if(overflow!==undefined&&![0,255].includes(overflow))fail('OVERFLOW_MAP');
 const zero=new Uint8Array(DATA),pageData=page=>pages.get(page)||zero,region=new Uint8Array(2*DATA);
 region.set(pageData(fmt.boxPages));region.set(pageData(fmt.boxPages+1),DATA);
 const logical={format:fmt.name,bank:main.bank,counter:main.counter,sections,
  p0Head:p0.slice(0,4),p0A:p0.slice(4,4+0x98),p0B:p0.slice(4+0x98,4+0x98+0xef),
  parasite:p0.slice(4+0x98+0xef,PAGE0_MON),region,extMeta:pageData(last).slice(fmt.extMetaOffset,fmt.extMetaOffset+EXT_META_SIZE),boxes:[],references};
 for(let box=0;box<BOX_COUNT;box++)for(let position=0;position<BOX_SLOTS;position++){
  let source,offset,ext=0,hi=0;
  if(fmt===OLD&&box>=19&&box<25){
   if(box<22){source=region;offset=REGION_BOX_OFFSET+(box-19)*BOX_SLOTS*MON_BYTES+position*MON_BYTES;}
   else if(box<24){source=body;offset=SB1_BOX_OFFSET+(box-22)*BOX_SLOTS*MON_BYTES+position*MON_BYTES;}
   else{source=sections[0];offset=SB2_BOX_OFFSET+position*MON_BYTES;}
  }else{
   const streamBox=fmt!==OLD?box:box<19?box:box<39?box-6:33+box-39;
   const [page,at]=fmt.monAt(streamBox*BOX_SLOTS+position);source=pageData(page);offset=at;if(fmt!==OLD)ext=u16(source,offset+MON_BYTES);
   if(fmt===WIDE)hi=source[offset+60]|source[offset+61]<<8|source[offset+62]<<16;
  }
  if(offset+MON_BYTES>source.length)fail('RECORD');logical.boxes.push({bytes:source.slice(offset,offset+MON_BYTES),ext,hi});
 }
 // These regions held six old-format boxes. Their logical records above are
 // preserved separately; clearing them frees the old layout without losing
 // party data or any neighbouring fields.
 if(fmt===OLD){
  region.fill(0,REGION_BOX_OFFSET,REGION_BOX_OFFSET+3*BOX_SLOTS*MON_BYTES);
  body.fill(0,SB1_BOX_OFFSET,SB1_BOX_OFFSET+2*BOX_SLOTS*MON_BYTES);setSb1(sections,body);
  sections[0].fill(0,SB2_BOX_OFFSET,SB2_BOX_OFFSET+BOX_SLOTS*MON_BYTES);
 }
 return logical;
}
function convertRecord(record){
 const bytes=record.bytes.slice();let ext=0;
 if(u16(bytes,0x1c)!==0&&(bytes[0x10]&0x40)){
  const level=(u16(bytes,0x34)&0x7f)+127;
  put16(bytes,0x34,(u16(bytes,0x34)&~0x7f)|(level&0x7f));ext=(level>>>7)<<8;bytes[0x10]&=~0x40;
 }
 return {bytes,ext,hi:0};
}
function convertedLogical(before,to){
 const boxes=before.boxes.map(record=>{
  const converted=before.format==='old'?convertRecord(record):{...record,bytes:record.bytes.slice()};
  if(to==='W'){
   let hi=0;if(u16(converted.bytes,0x1c)!==0)for(let k=0;k<4;k++)hi|=((converted.ext>>>(9+k))&1)<<(6*k);
   converted.ext=u16(converted.bytes,0x1c)===0?0:converted.ext&~0x1e00;converted.hi=hi;
  }
  return converted;
 });
 const after={...before,format:to,sections:before.sections.map(bytes=>bytes.slice()),parasite:before.parasite.slice(),boxes};
 // Leave the destination game's first-run migration pending.
 const guard=to==='W'?WIDE_VERSION_GUARD:VERSION_GUARD,version=u16(after.parasite,VERSION_OFFSET);
 if(version&&version<guard)put16(after.parasite,VERSION_OFFSET,guard);
 return after;
}
function seal(img,physical,payload,id,counter,size=DATA){
 const sector=new Uint8Array(SECTOR);sector.set(payload);put16(sector,0xff4,id);put16(sector,0xff6,checksum(sector,0,size));put32(sector,0xff8,SIGNATURE);put32(sector,0xffc,counter);img.set(sector,physical*SECTOR);
}
function writeLogical(img,logical){
 const fmt=logical.format==='W'?WIDE:LARGE,pages=new Map(),page=id=>{if(!pages.has(id))pages.set(id,new Uint8Array(DATA));return pages.get(id);};
 // The source tool owns these layout regions. Extended non-layout sectors
 // outside the selected target layout are neither cleared nor re-encrypted.
 img.fill(255,0,32*SECTOR);img.fill(255,40*SECTOR,(32+fmt.overflowFirst+fmt.overflowCount)*SECTOR);
 for(let i=0;i<logical.boxes.length;i++){
  const record=logical.boxes[i],bytes=new Uint8Array(fmt.mon);bytes.set(record.bytes);put16(bytes,58,record.ext);
  if(fmt===WIDE){bytes[60]=record.hi&255;bytes[61]=(record.hi>>>8)&255;bytes[62]=(record.hi>>>16)&255;}
  if(nonzero(bytes)){const [id,offset]=fmt.monAt(i);page(id).set(bytes,offset);}
 }
 const p0=page(0);p0.set(logical.p0Head);p0.set(logical.p0A,4);p0.set(logical.p0B,4+0x98);p0.set(logical.parasite,4+0x98+0xef);
 for(let i=0;i<2;i++){const bytes=logical.region.subarray(i*DATA,(i+1)*DATA);if(nonzero(bytes))page(fmt.boxPages+i).set(bytes);}
 const last=fmt.shelfPages+fmt.extPages-1;
 if(nonzero(logical.extMeta)||[...pages.keys()].some(id=>id>=fmt.shelfPages)){
  const bytes=page(last);bytes.set(logical.extMeta,fmt.extMetaOffset);bytes[fmt.overflowOffset]=0x59;bytes.fill(255,fmt.overflowOffset+1,fmt.overflowOffset+fmt.boxPages);
 }
 const map=new Uint8Array(fmt.shelfPages).fill(255),extMap=new Uint8Array(fmt.extPages).fill(255);
 for(const id of pages.keys())if(id<fmt.shelfPages)map[id]=10+id;else extMap[id-fmt.shelfPages]=8+id-fmt.shelfPages;
 p0[fmt.p0Ext]=0x58;p0.set(extMap,fmt.p0Ext+1);p0[fmt.p0Overflow]=0;
 for(const [id,bytes] of pages)seal(img,id<fmt.shelfPages?10+id:40+id-fmt.shelfPages,bytes,0x40+id,logical.counter);
 const sections=logical.sections.map(bytes=>bytes.slice()),body=sb1(sections);
 put32(body,MAP_OFFSET,fmt.magic);put32(body,MAP_OFFSET+4,logical.counter);body.fill(0,MAP_OFFSET+8,MAP_OFFSET+32);body.set(map,MAP_OFFSET+8);setSb1(sections,body);
 const bank=5*(logical.counter%2);for(let id=0;id<5;id++)seal(img,bank+id,sections[id],id,logical.counter,SECTION_SIZES[id]);
 // Upstream 0.50.1: keep both low-flash probe sectors distinguishable from
 // unused extended flash, before the first in-game save. The extra main bank
 // is older; the unreferenced page-zero backup never replaces a box page.
 if(logical.counter>0)for(let id=0;id<5;id++)seal(img,5-bank+id,sections[id],id,logical.counter-1,SECTION_SIZES[id]);
 if(!pages.has(6))seal(img,16,p0,0x40,Math.max(logical.counter-1,0));
}
function verifyLogical(expected,actual){
 if(actual.format!==expected.format||actual.counter!==expected.counter)fail('OUTPUT');
 for(const name of ['p0Head','p0A','p0B','parasite','region','extMeta'])if(!equal(expected[name],actual[name]))fail('OUTPUT');
 for(let id=0;id<5;id++){
  const left=expected.sections[id].slice(),right=actual.sections[id].slice();
  // Only the shelf pointer structure changes inside the main sections.
  if(id===2){left.fill(0,MAP_OFFSET-DATA,MAP_OFFSET-DATA+32);right.fill(0,MAP_OFFSET-DATA,MAP_OFFSET-DATA+32);}
  if(!equal(left,right))fail('OUTPUT');
 }
 if(actual.boxes.length!==1500)fail('OUTPUT');
 for(let i=0;i<1500;i++)if(expected.boxes[i].ext!==actual.boxes[i].ext||expected.boxes[i].hi!==actual.boxes[i].hi||!equal(expected.boxes[i].bytes,actual.boxes[i].bytes))fail('OUTPUT');
}
function image(raw,bodyBytes,slot){const out=new Uint8Array(SLOT_BYTES).fill(255),offset=slot*SLOT_BYTES;if(offset<bodyBytes)out.set(raw.subarray(offset,Math.min(offset+SLOT_BYTES,bodyBytes)));return decode(out);}
function inspectSlot(raw,bodyBytes,slot){
 const img=image(raw,bodyBytes,slot);
 if(erased(img))return {slot,valid:false,unused:true,format:null,versionStamp:null,counter:null,bank:null,mons:0,reason:null};
 try{
  const logical=readLogical(img);
  return {slot,valid:true,unused:false,format:logical.format,versionStamp:u16(logical.parasite,VERSION_OFFSET),counter:logical.counter,bank:logical.bank,mons:logical.boxes.filter(record=>u16(record.bytes,0x1c)!==0).length,reason:null,logical,img};
 }catch(error){return {slot,valid:false,unused:false,format:null,versionStamp:null,counter:null,bank:null,mons:0,reason:error.code||'START_FORMAT_INVALID'};}
}
const publicSlot=({logical,img,...slot})=>slot;
// Identification hint only: inspectFormatSave must validate a detected slot.
// Read the few keyed header bytes directly, without decoding a 6MiB save.
export function containsFormatL(value){
 const bytes=value instanceof Uint8Array?value:value instanceof ArrayBuffer?new Uint8Array(value):null;
 if(!bytes||bytes.length>FULL_BYTES+16)return false;
 for(const base of [0,SLOT_BYTES])for(let index=0;index<10;index++){
  const offset=base+index*SECTOR;if(offset+SECTOR>bytes.length)break;
  const signature=u32(bytes,offset+0xff8),encrypted=signature!==SIGNATURE;
  if(encrypted&&((signature^u32(key,0xff8))>>>0)!==SIGNATURE)continue;
  const id=u16(bytes,offset+0xff4)^(encrypted?u16(key,0xff4):0);
  if(id===2&&[LARGE.magic,WIDE.magic].includes((u32(bytes,offset+MAP_OFFSET-DATA)^(encrypted?u32(key,MAP_OFFSET-DATA):0))>>>0))return true;
 }
 return false;
}
export function inspectFormatSave(value){const {raw,bodyBytes,rtcBytes}=input(value);return {size:raw.length,bodyBytes,rtcBytes,slots:[0,1].map(slot=>publicSlot(inspectSlot(raw,bodyBytes,slot)))};}
export async function convertFormatSave(value,{selection='all',to='L',onProgress,signal}={}){
 abort(signal);const {raw,bodyBytes,rtcBytes}=input(value);
 if(!['L','W'].includes(to))fail('TARGET');
 if(selection!=='all'&&selection!==0&&selection!==1)fail('SELECTION');
 const slots=[0,1].map(slot=>inspectSlot(raw,bodyBytes,slot));
 const chosen=slots.filter(slot=>selection==='all'?!slot.unused:slot.slot===selection);
 if(!chosen.length)fail('EMPTY');
 for(const slot of chosen)if(!slot.valid){const code=(slot.reason||'START_FORMAT_EMPTY').replace(/^START_FORMAT_/,'');fail(code,slot.slot);}
 if(to==='L'&&chosen.some(slot=>slot.format==='W'))fail('DOWNGRADE');
 const outputs=new Map(),changed=chosen.filter(slot=>slot.format!==to);let done=0,grow=false;
 onProgress?.({stage:'inspect',done,total:changed.length});abort(signal);
 for(const slot of changed){
  const expected=convertedLogical(slot.logical,to),out=slot.img.slice();writeLogical(out,expected);
  verifyLogical(expected,readLogical(out));
  if(bodyBytes===SMALL_BYTES&&!erased(out.subarray(32*SECTOR)))grow=true;
  outputs.set(slot.slot,out);done++;onProgress?.({stage:'convert',slot:slot.slot,done,total:changed.length});abort(signal);
  await Promise.resolve();
 }
 abort(signal);const outputBody=grow?FULL_BYTES:bodyBytes,bytes=new Uint8Array(outputBody+rtcBytes).fill(255);bytes.set(raw.subarray(0,bodyBytes));bytes.set(raw.subarray(bodyBytes),outputBody);
 for(const [slot,img] of outputs)for(const [first,last] of [[0,32],[40,to==='W'?88:86]])for(let physical=first;physical<last;physical++){
  const target=slot*SLOT_BYTES+physical*SECTOR;if(target+SECTOR>outputBody)continue;
  const sector=img.subarray(physical*SECTOR,(physical+1)*SECTOR);bytes.set(u32(sector,0xff8)===SIGNATURE?xor(sector):sector,target);
 }
 // Validate the published representation, not just an intermediate plaintext.
 const after=inspectFormatSave(bytes);for(const slot of chosen){const actual=after.slots[slot.slot];if(!actual.valid||actual.format!==to)fail('OUTPUT');}
 abort(signal);
 const versionStamp=after.slots[chosen[0].slot].versionStamp;
 return {bytes,report:{fromFormat:chosen.every(slot=>slot.format===chosen[0].format)?chosen[0].format:'mixed',toFormat:to,versionStamp:chosen.every(slot=>after.slots[slot.slot].versionStamp===versionStamp)?versionStamp:null,
  convertedSlots:changed.map(slot=>slot.slot),unchangedSlots:slots.filter(slot=>!outputs.has(slot.slot)).map(slot=>slot.slot),grew:grow,
  slots:after.slots,recordsVerified:changed.length*1500,fullGameplayTest:false}};
}
