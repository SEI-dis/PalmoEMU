// Derived from START Save Migrate 1.0.5, author: くりーぱー.
// Imported with user-authorized permission; no upstream license identifier was supplied.
// PalmoEMU modifications: migration-only ESM extraction, unused editor/assets removed,
// strict old-bank counters/IDs. See README.md for provenance and permission scope.
import {MANIFEST} from './manifest.js';
const PROFILE={"charMap":{"0":"　","1":"あ","2":"い","3":"う","4":"え","5":"お","6":"か","7":"き","8":"く","9":"け","11":"さ","12":"し","13":"す","14":"せ","15":"そ","16":"た","17":"ち","18":"つ","19":"て","20":"と","21":"な","22":"に","23":"ぬ","25":"の","26":"は","27":"ひ","28":"ふ","29":"へ","30":"ほ","32":"み","33":"む","34":"め","35":"も","36":"や","37":"ゆ","38":"よ","39":"ら","40":"り","41":"る","42":"れ","43":"ろ","45":"を","46":"ん","53":"ゅ","54":"ょ","81":"ア","82":"イ","90":"コ","91":"サ","92":"シ","93":"ス","104":"ネ","111":"マ","133":"ュ","134":"ョ","161":"0","162":"1","163":"2","164":"3","165":"4","166":"5","167":"6","168":"7","169":"8","170":"9","171":"！","172":"？","173":"。","174":"ー","175":"·","176":"‥","177":"“","178":"”","179":"‘","180":"’","181":"♂","182":"♀","183":"¥","184":",","185":"×","186":"/","187":"A","188":"B","189":"C","190":"D","191":"E","192":"F","193":"G","194":"H","195":"I","196":"J","197":"K","198":"L","199":"M","200":"N","201":"O","202":"P","203":"Q","204":"R","205":"S","206":"T","207":"U","208":"V","209":"W","210":"X","211":"Y","212":"Z","213":"a","214":"b","215":"c","216":"d","217":"e","218":"f","219":"g","220":"h","221":"i","222":"j","223":"k","224":"l","225":"m","226":"n","227":"o","228":"p","229":"q","230":"r","231":"s","232":"t","233":"u","234":"v","235":"w","236":"x","237":"y","238":"z","239":"▶","240":":","241":"Ä","242":"Ö","243":"Ü","244":"ä","245":"ö","246":"ü","255":"$","10":"こ","24":"ね","31":"ま","44":"わ","47":"ぁ","48":"ぃ","49":"ぅ","50":"ぇ","51":"ぉ","52":"ヴ","55":"が","56":"ぎ","57":"ぐ","58":"げ","59":"ご","60":"ざ","61":"じ","62":"ず","63":"ぜ","64":"ぞ","65":"だ","66":"ぢ","67":"づ","68":"で","69":"ど","70":"ば","71":"び","72":"ぶ","73":"べ","74":"ぼ","75":"ぱ","76":"ぴ","77":"ぷ","78":"ぺ","79":"ぽ","80":"っ","83":"ウ","84":"エ","85":"オ","86":"カ","87":"キ","88":"ク","89":"ケ","94":"セ","95":"ソ","96":"タ","97":"チ","98":"ツ","99":"テ","100":"ト","101":"ナ","102":"ニ","103":"ヌ","105":"ノ","106":"ハ","107":"ヒ","108":"フ","109":"ヘ","110":"ホ","112":"ミ","113":"ム","114":"メ","115":"モ","116":"ヤ","117":"ユ","118":"ヨ","119":"ラ","120":"リ","121":"ル","122":"レ","123":"ロ","124":"ワ","125":"ヲ","126":"ン","127":"ァ","128":"ィ","129":"ゥ","130":"ェ","131":"ォ","132":"ャ","135":"ガ","136":"ギ","137":"グ","138":"ゲ","139":"ゴ","140":"ザ","141":"ジ","142":"ズ","143":"ゼ","144":"ゾ","145":"ダ","146":"ヂ","147":"ヅ","148":"デ","149":"ド","150":"バ","151":"ビ","152":"ブ","153":"ベ","154":"ボ","155":"パ","156":"ピ","157":"プ","158":"ペ","159":"ポ","160":"ッ"},"boxPointers":[33722960,33724700,33726440,33728180,33729920,33731660,33733400,33735140,33736880,33738620,33740360,33742100,33743840,33745580,33747320,33749060,33750800,33752540,33754280,33802940,33804680,33806420,33713524,33715264,33703392],"speciesCount":1494,"movesCount":1004,"itemsCount":858};
const LEN=[0xf24,0xff0,0xff0,0xff0,0xd98,...Array(8).fill(0xff0),0x450];
const dv=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const u16=(b,o)=>dv(b).getUint16(o,true),u32=(b,o)=>dv(b).getUint32(o,true);
const w16=(b,o,n)=>dv(b).setUint16(o,n,true),w32=(b,o,n)=>dv(b).setUint32(o,n>>>0,true);
function checksum(b,o,n){let s=0;for(let i=0;i<n;i+=4)s=(s+u32(b,o+i))>>>0;return ((s&65535)+(s>>>16))&65535}
function saveBank(b,base){let sections=[],counter;for(let i=0;i<14;i++){let o=base+i*4096,id=u16(b,o+4084);if(id>13||sections[id]!==undefined||u32(b,o+4088)!==0x08012025||checksum(b,o,LEN[id])!==u16(b,o+4086))return null;let c=u32(b,o+4092);if(counter!==undefined&&c!==counter)return null;counter=c;sections[id]=o;}return {sections,counter,base}}
function readSave(bytes){if(bytes.length!==131072)throw Error('128KBの .sav が必要です。エミュレーターのステートセーブは使えません。');let banks=[saveBank(bytes,0),saveBank(bytes,57344)].filter(Boolean);if(!banks.length)throw Error('有効なセーブブロックがありません。形式またはチェックサムが一致しません。');let bank=banks[0];if(banks[1]&&((banks[1].counter-bank.counter)>>>0)<0x80000000)bank=banks[1];return {bytes:bytes.slice(),bank,changes:new Map(),flagChanges:new Map()}}
function storageMap(state,address){let sec=state.bank.sections;
 if(address>=0x202924c&&address<0x203161c){let x=address-0x202924c,id=5+Math.floor(x/4080);return sec[id]+x%4080}
 if(address>=0x202548c&&address<0x20291f4){let x=address-0x202548c;return sec[1+Math.floor(x/4080)]+x%4080}
 if(address>=0x20244e8&&address<0x202540c)return sec[0]+address-0x20244e8;
 if(address>=0x203bfac&&address<0x203df8c){let x=address-0x203bfac;return (30+Math.floor(x/4080))*4096+x%4080}
 if(address>=0x203b0e8&&address<0x203b1b4)return sec[0]+0xf24+address-0x203b0e8;
 if(address>=0x203b1b4&&address<0x203b40c)return sec[4]+0xd98+address-0x203b1b4;
 if(address>=0x203b40c&&address<0x203bfac)return sec[13]+0x450+address-0x203b40c;
 throw Error('未対応の保存アドレス: '+address.toString(16));}
function readRecord(state,index){let a=PROFILE.boxPointers[Math.floor(index/30)]+index%30*58;let p=new Uint8Array(58);for(let i=0;i<58;i++)p[i]=state.bytes[storageMap(state,a+i)];return p}
function exportSave(state){let b=state.bytes.slice();for(let o of state.bank.sections){let id=u16(b,o+4084);w16(b,o+4086,checksum(b,o,LEN[id]));}let verified=saveBank(b,state.bank.base);if(!verified)throw Error('書き出し後の検証に失敗しました');return b}
function getMoves(p){let bits=0n;for(let i=0;i<5;i++)bits|=BigInt(p[39+i])<<BigInt(i*8);return Array.from({length:4},(_,i)=>Number((bits>>BigInt(i*10))&1023n))}
function setMoves(p,m){let bits=0n;m.forEach((v,i)=>bits|=BigInt(v)<<BigInt(i*10));for(let i=0;i<5;i++)p[39+i]=Number((bits>>BigInt(i*8))&255n)}
function decodeText(p){return Array.from(p.slice(0,p.indexOf(255)<0?p.length:p.indexOf(255)),b=>PROFILE.charMap[b]||'□').join('')}
const SAVE1=0x202548c,SAVE2=0x20244e8;
const baseReadSave=readSave,baseReadRecord=readRecord;
readSave=function(bytes){if(![131072,131088].includes(bytes.length))throw Error('128KiBの通常セーブ、または時計情報16バイト付きセーブを選択してください。');let s=baseReadSave(bytes.slice(0,131072));s.bytes=bytes.slice();s.initial=bytes.slice();s.banks=[saveBank(s.bytes,0),saveBank(s.bytes,57344)].filter(Boolean);s.history=[];return s};
function intRange(n,min,max,name='値'){if(!Number.isInteger(n)||n<min||n>max)throw Error(name+'は'+min+'～'+max+'の整数にしてください');return n}
function readMemory(s,address,n){intRange(n,1,65536,'長さ');return Uint8Array.from({length:n},(_,i)=>s.bytes[storageMap(s,address+i)])}
function writeMemory(s,address,data){let positions=Array.from(data,(_,i)=>storageMap(s,address+i));positions.forEach((p,i)=>s.bytes[p]=data[i])}
function mem16(s,a){return u16(readMemory(s,a,2),0)}function mem32(s,a){return u32(readMemory(s,a,4),0)}
function put16(s,a,v){let b=new Uint8Array(2);w16(b,0,intRange(v,0,65535));writeMemory(s,a,b)}function put32(s,a,v){let b=new Uint8Array(4);w32(b,0,intRange(v,0,4294967295));writeMemory(s,a,b)}
function changedBytes(s){let n=0;for(let i=0;i<s.bytes.length;i++)if(s.bytes[i]!==s.initial[i])n++;return n}
exportSave=function(s){let b=s.bytes.slice();for(let bank of s.banks){for(let o of bank.sections){let id=u16(b,o+4084);if(id>13)throw Error('セクションIDが不正です。生データ変更を見直してください。');w16(b,o+4086,checksum(b,o,LEN[id]))}if(!saveBank(b,bank.base))throw Error('保存ブロックが不整合です。ヘッダーや保存番号の変更を見直してください。')}return b};
function variableAddress(id){if(id>=0x4000&&id<=0x40ff)return SAVE1+0x1000+(id-0x4000)*2;if(id>=0x5000&&id<=0x51ff)return 0x203b2e8+(id-0x5000)*2;throw Error('永続変数IDは0x4000～0x40FFまたは0x5000～0x51FFです。特殊変数はRAM専用です。')}
function getVariable(s,id){return mem16(s,variableAddress(id))}function setVariable(s,id,value){put16(s,variableAddress(id),value)}
function readTrainer(s){let b=readMemory(s,SAVE2,24),key=mem32(s,SAVE2+0xf20);return {name:decodeText(b.slice(0,7)),gender:b[8],tid:u16(b,10),sid:u16(b,12),hours:u16(b,14),minutes:b[16],seconds:b[17],money:(mem32(s,SAVE1+0x290)^key)>>>0,coins:mem16(s,SAVE1+0x294)^(key&65535)}}
function partyCount(s){return readMemory(s,SAVE1+0x34,1)[0]}function readPartyRaw(s,index){return readMemory(s,SAVE1+0x38+intRange(index,0,5)*100,100)}
function partyToCompressed(p){let b=new Uint8Array(58);b.set(p.slice(0,28));b.set(p.slice(32,43),28);setMoves(b,Array.from({length:4},(_,i)=>u16(p,44+i*2)));b.set(p.slice(56,62),44);b.set(p.slice(68,76),50);return b}
readRecord=function(s,index){return index<750?baseReadRecord(s,index):partyToCompressed(readPartyRaw(s,intRange(index,750,755)-750))};
function boxSlots(s){return s?.version===23?1170:750}
function bank23(b,base){let sections=[],counter;for(let i=0;i<5;i++){let o=base+i*4096,id=u16(b,o+4084);if(id>4||sections[id]!==undefined||u32(b,o+4088)!==0x08012025||checksum(b,o,LEN[id])!==u16(b,o+4086))return null;let c=u32(b,o+4092);if(counter!==undefined&&c!==counter)return null;counter=c;sections[id]=o}if(u32(b,sections[2]+0x410)!==0x4c454853)return null;return {sections,counter,base}}
const V23_WORK=131088;
const oldRead20=readSave,oldMap20=storageMap,oldExport20=exportSave,oldReadMon20=readRecord;
readSave=function(b){if(b.length>=4&&u32(b,0)===0x31534b50)throw Error('PKS1形式は編集対象外です。通常セーブの .sav を選択してください。');if(![131072,131088].includes(b.length))throw Error('通常の128KiBセーブを選択してください');let banks=[bank23(b,0),bank23(b,20480)].filter(Boolean);if(!banks.length){for(let i=0;i<10;i++){let o=i*4096;if(u16(b,o+4084)===2&&u32(b,o+0x410)===0x4c454853)throw Error('23保存ブロックのチェックサムが不正です。20としての読み込みを中止します')}return oldRead20(b);}let bank=banks[0];if(banks[1]&&((banks[1].counter-bank.counter)>>>0)<0x80000000)bank=banks[1];let bytes=new Uint8Array(V23_WORK+17*4080);bytes.set(b);let map=b.slice(bank.sections[2]+0x418,bank.sections[2]+0x429),used=new Set();for(let i=0;i<17;i++){let sec=map[i];if(sec===255)continue;if(sec<10||sec>31||used.has(sec))throw Error('23のPCセクター割当が不正です');used.add(sec);let o=sec*4096;if(u16(b,o+4084)!==0x40+i||u32(b,o+4088)!==0x08012025||checksum(b,o,4080)!==u16(b,o+4086))throw Error('23のPCデータが破損しています');bytes.set(b.slice(o,o+4080),V23_WORK+i*4080)}return {bytes,initial:bytes.slice(),fileLength:b.length,version:23,bank,banks,changes:new Map(),flagChanges:new Map(),history:[]}}
function virtualPosition(i){let box=Math.floor(i/30),slot=i%30,n=(box<19?box:box-6)*30+slot;return V23_WORK+(n<12?3371+n*58:(1+Math.floor((n-12)/70))*4080+((n-12)%70)*58)}
storageMap=function(s,a){if(s.version!==23)return oldMap20(s,a);let sec=s.bank.sections;if(a>=0x202548c&&a<0x20291f4){let x=a-0x202548c;return sec[1+Math.floor(x/4080)]+x%4080}if(a>=0x20244e8&&a<0x202540c)return sec[0]+a-0x20244e8;if(a>=0x203b0e8&&a<0x203b1b4)return sec[0]+0xf24+a-0x203b0e8;if(a>=0x203b1b4&&a<0x203b40c)return sec[4]+0xd98+a-0x203b1b4;if(a>=0x203b40c&&a<0x203bfac)return V23_WORK+395+a-0x203b40c;if(a>=0x203bfac&&a<0x203df8c)return V23_WORK+15*4080+a-0x203bfac;if(a>=0x202924c&&a<0x2029250)return V23_WORK+a-0x202924c;if(a>=0x2031374&&a<0x203140c)return V23_WORK+4+a-0x2031374;if(a>=0x203152d&&a<0x203161c)return V23_WORK+156+a-0x203152d;throw Error('23では未対応の保存アドレス: '+a.toString(16))};
readRecord=function(s,i){intRange(i,0,boxSlots(s)+5,'個体枠');if(s.version!==23)return oldReadMon20(s,i);if(i>=1170)return partyToCompressed(readPartyRaw(s,i-1170));let box=Math.floor(i/30);if(box>=19&&box<25)return baseReadRecord(s,i);return s.bytes.slice(virtualPosition(i),virtualPosition(i)+58)};
exportSave=function(s){if(s.version!==23)return oldExport20(s);if(!changedBytes(s))return s.bytes.slice(0,s.fileLength);for(let bank of s.banks)for(let o of bank.sections)for(let j=4084;j<4096;j++)if(j!==4086&&j!==4087&&s.bytes[o+j]!==s.initial[o+j])throw Error('保存ヘッダーの生データ変更は書き出せません');let b=s.bytes.slice(0,s.fileLength),map=new Uint8Array(17).fill(255),count=(s.bank.counter+1)>>>0;for(let i=0;i<17;i++){let page=s.bytes.slice(V23_WORK+i*4080,V23_WORK+(i+1)*4080);if(!page.some(x=>x))continue;map[i]=10+i;let sector=new Uint8Array(4096);sector.set(page);w16(sector,4084,0x40+i);w16(sector,4086,checksum(sector,0,4080));w32(sector,4088,0x08012025);w32(sector,4092,count);b.set(sector,(10+i)*4096)}for(let base of [0,20480])for(let id=0;id<5;id++){let sector=s.bytes.slice(s.bank.sections[id],s.bank.sections[id]+4096);if(id===2){w32(sector,0x410,0x4c454853);w32(sector,0x414,count);sector.set(map,0x418)}w16(sector,4084,id);w16(sector,4086,checksum(sector,0,LEN[id]));w32(sector,4088,0x08012025);w32(sector,4092,count);b.set(sector,base+id*4096)}readSave(b);return b};
// START 0.35.1: per-sector SaveCrypt, extended flash and 50 PC boxes.
// The second flash area and unrecognised sectors are preserved byte for byte.
const START_SECTOR=4096, START_PAYLOAD=4080, START_SIG=0x08012025;
const SAVECRYPT_KEY=Uint8Array.from({length:START_SECTOR},(_,i)=>{let x=(Math.imul(i,0x9e3779b1)+0x504b5354)>>>0;x^=x>>>15;x=Math.imul(x,0x2c1b3c6d)>>>0;x^=x>>>12;x=Math.imul(x,0x297a2d39)>>>0;x^=x>>>15;return x>>>24});
function cryptSector(b){let out=new Uint8Array(b);for(let i=0;i<out.length;i++)out[i]^=SAVECRYPT_KEY[i];return out}
function decodeSaveCrypt(raw){let bytes=new Uint8Array(raw),encoded=new Set();for(let o=0;o+4096<=raw.length;o+=4096){if(u32(raw,o+4088)===START_SIG||((u32(raw,o+4088)^u32(SAVECRYPT_KEY,4088))>>>0)!==START_SIG)continue;let sector=cryptSector(raw.slice(o,o+4096));if(u32(sector,4088)===START_SIG){bytes.set(sector,o);encoded.add(o/4096)}}return {bytes,encoded}}
const readPre35=readSave,mapPre35=storageMap,exportPre35=exportSave,readMonPre35=readRecord,slotsPre35=boxSlots;
boxSlots=function(s){return s?.boxCount?s.boxCount*30:slotsPre35(s)};
function workOffset(s){return s.workBase??V23_WORK}
function streamPosition35(s,i){let box=Math.floor(i/30),slot=i%30,n=(box<19?box:box-6)*30+slot;let page,offset;if(n<12){page=0;offset=3371+n*58}else if(n<990){page=1+Math.floor((n-12)/70);offset=((n-12)%70)*58}else{page=17+Math.floor((n-990)/70);offset=((n-990)%70)*58}return workOffset(s)+page*4080+offset}
readSave=function(raw){raw=new Uint8Array(raw);if(![131072,131088,1048576,1048592,6291456,6291472].includes(raw.length))throw Error('128KiB・1MiB・6MiBの通常セーブ（末尾の時計情報16バイトにも対応）を選択してください。');let decoded=decodeSaveCrypt(raw),s=readPre35(decoded.bytes.slice(0,131072)),flashLength=raw.length-(raw.length%4096),base=Math.max(V23_WORK,raw.length);s.originalRaw=raw.slice();s.originalDecoded=decoded.bytes;s.encodedSectors=decoded.encoded;s.encrypted=Array.from(decoded.encoded).some(i=>i<10);s.fileLength=raw.length;s.flashLength=flashLength;s.workBase=base;
 if(s.version===23){let pages=s.bytes.slice(V23_WORK,V23_WORK+17*4080),extended=flashLength>=1048576&&pages[0xfe3]===0x58;s.boxCount=extended?50:39;s.pageCount=extended?22:17;s.bytes=new Uint8Array(base+s.pageCount*4080);s.bytes.set(decoded.bytes);s.bytes.set(pages,base);if(extended){let used=new Set();for(let i=17;i<22;i++){let ref=pages[0xfe4+i-17];if(ref===255)continue;if(ref<8||ref>23||used.has(ref))throw Error('追加ボックスの保存先が不正です。');used.add(ref);let o=(32+ref)*4096;if(o+4096>flashLength||u16(decoded.bytes,o+4084)!==0x40+i||u32(decoded.bytes,o+4088)!==START_SIG||checksum(decoded.bytes,o,4080)!==u16(decoded.bytes,o+4086))throw Error('追加ボックスのチェックサムまたは保存ヘッダーが不正です。');s.bytes.set(decoded.bytes.slice(o,o+4080),base+i*4080)}}
 }else{s.boxCount=25;s.pageCount=0;s.bytes=decoded.bytes.slice()}
 s.initial=s.bytes.slice();s.history=[];return s;
};
storageMap=function(s,a){if(s.version===23&&s.boxCount===50&&a>=0x020314ac&&a<0x0203151a)return workOffset(s)+21*4080+0xb54+a-0x020314ac;let o=mapPre35(s,a);if(s.version===23&&o>=V23_WORK)return workOffset(s)+o-V23_WORK;return o};
readRecord=function(s,i){intRange(i,0,boxSlots(s)+5,'個体枠');if(s.version!==23)return readMonPre35(s,i);if(i>=boxSlots(s))return partyToCompressed(readPartyRaw(s,i-boxSlots(s)));let box=Math.floor(i/30);if(box>=19&&box<25)return baseReadRecord(s,i);let o=streamPosition35(s,i);return s.bytes.slice(o,o+58)};
exportSave=function(s){if(!s.originalRaw)return exportPre35(s);if(!changedBytes(s))return s.originalRaw.slice();let out=s.originalRaw.slice();const emit=(index,sector)=>out.set(s.encrypted||s.encodedSectors.has(index)?cryptSector(sector):sector,index*4096);
 if(s.version!==23){let plain=exportPre35(s);for(let o=0;o+4096<=s.flashLength;o+=4096){let part=plain.slice(o,o+4096);if(part.some((x,i)=>x!==s.originalDecoded[o+i]))emit(o/4096,part)}out.set(plain.slice(s.flashLength,s.fileLength),s.flashLength);readSave(out);return out}
 for(let bank of s.banks)for(let o of bank.sections)for(let j=4084;j<4096;j++)if(j!==4086&&j!==4087&&s.bytes[o+j]!==s.initial[o+j])throw Error('保存ヘッダーの生データ変更は書き出せません');
 let pages=Array.from({length:s.pageCount},(_,i)=>s.bytes.slice(workOffset(s)+i*4080,workOffset(s)+(i+1)*4080)),map=new Uint8Array(17).fill(255),count=(s.bank.counter+1)>>>0;
 if(s.boxCount===50){pages[0][0xfe3]=0x58;for(let i=17;i<22;i++)pages[0][0xfe4+i-17]=pages[i].some(x=>x)?8+i-17:255}
 for(let i=0;i<pages.length;i++){if(!pages[i].some(x=>x))continue;let physical=i<17?10+i:40+i-17;if(i<17)map[i]=physical;let sector=new Uint8Array(4096);sector.set(pages[i]);w16(sector,4084,0x40+i);w16(sector,4086,checksum(sector,0,4080));w32(sector,4088,START_SIG);w32(sector,4092,count);emit(physical,sector)}
 for(let base of [0,20480])for(let id=0;id<5;id++){let sector=s.bytes.slice(s.bank.sections[id],s.bank.sections[id]+4096);if(id===2){w32(sector,0x410,0x4c454853);w32(sector,0x414,count);sector.set(map,0x418)}w16(sector,4084,id);w16(sector,4086,checksum(sector,0,LEN[id]));w32(sector,4088,START_SIG);w32(sector,4092,count);emit(base/4096+id,sector)}
 out.set(s.bytes.slice(s.flashLength,s.fileLength),s.flashLength);readSave(out);return out;
};
// ROM SLT2 selects banks +0x30 (48 * 64KiB): two independent 3MiB save slots.
const START_SLOT_BYTES=3*1024*1024;
const readPre36=readSave,exportPre36=exportSave;
function saveSlotCount(raw){return raw.length-(raw.length%4096)===2*START_SLOT_BYTES?2:1}
function localSlotBytes(raw,slot){let local=new Uint8Array(raw);if(slot){local.set(raw.subarray(START_SLOT_BYTES,2*START_SLOT_BYTES),0);local.set(raw.subarray(0,START_SLOT_BYTES),START_SLOT_BYTES)}return local}
function saveSlotInfo(raw){raw=new Uint8Array(raw);return Array.from({length:saveSlotCount(raw)},(_,slot)=>{try{let s=readPre36(localSlotBytes(raw,slot)),t=readTrainer(s);return {slot,valid:true,name:t.name,hours:t.hours,minutes:t.minutes,tid:t.tid,boxes:boxSlots(s)/30,counter:s.bank.counter}}catch(e){return {slot,valid:false,error:e.message}}})}
function firstValidSaveSlot(raw){let info=saveSlotInfo(raw),first=info.find(x=>x.valid);if(!first)throw Error('読み込めるセーブがありません。'+info.map(x=>'セーブ'+(x.slot+1)+': '+x.error).join(' / '));return first.slot}
readSave=function(raw,slot=0){raw=new Uint8Array(raw);intRange(slot,0,saveSlotCount(raw)-1,'セーブ番号');let s=readPre36(localSlotBytes(raw,slot));s.saveSlot=slot;s.slotCount=saveSlotCount(raw);s.containerRaw=raw.slice();return s};
function exportSlot(s){let local=exportPre36(s);if(s.slotCount!==2)return local;let out=s.containerRaw.slice(),offset=s.saveSlot*START_SLOT_BYTES;out.set(local.subarray(0,START_SLOT_BYTES),offset);if(s.fileLength>s.flashLength)out.set(local.subarray(s.flashLength,s.fileLength),s.flashLength);return out}
exportSave=exportSlot;
var SaveMigrate = (function () {
var SECTOR = 0x1000, DATA = 0xFF0, SIG = 0x08012025, OLD_N = 14, NEW_N = 5;
var SIZES = [0xF24, 0xFF0, 0xFF0, 0xFF0, 0xD98, 0xFF0, 0xFF0, 0xFF0, 0xFF0, 0xFF0, 0xFF0, 0xFF0, 0xFF0, 0x450];
var OFFS = [0, 0, 0xFF0, 0xFF0 * 2, 0xFF0 * 3, 0, 0xFF0, 0xFF0 * 2, 0xFF0 * 3, 0xFF0 * 4, 0xFF0 * 5, 0xFF0 * 6, 0xFF0 * 7, 0x7F80];
var PARASITE = { 0: 0xCC, 4: 0x258, 13: 0xBA0 };
var SHELF_FIRST = 10, SHELF_PAGES = 17, BOX_PAGES = 15, MON = 58, PAGE0_MONS = 12, PAGE_MONS = 70;
var P0_TAIL_A = 4, P0_TAIL_B = 4 + 0x98, P0_PARASITE = P0_TAIL_B + 0xEF, P0_MONS = P0_PARASITE + 0xBA0;
var MAP_OFF = 0x1400, MAP_MAGIC = 0x4C454853;
function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (u16(b, o) | (u16(b, o + 2) << 16)) >>> 0; }
function put16(b, o, v) { b[o] = v & 0xFF; b[o + 1] = (v >>> 8) & 0xFF; }
function put32(b, o, v) { put16(b, o, v & 0xFFFF); put16(b, o + 2, (v >>> 16) & 0xFFFF); }
function checksum(b, off, size) {
var s = 0;
for (var i = 0; i < (size & ~3); i += 4)
s = (s + u32(b, off + i)) >>> 0;
return ((s >>> 16) + s) & 0xFFFF;
}
function sectorInfo(sav, n) {
var o = n * SECTOR;
return { o: o, id: u16(sav, o + 0xFF4), chk: u16(sav, o + 0xFF6), sig: u32(sav, o + 0xFF8), cnt: u32(sav, o + 0xFFC) };
}
function readOld(sav) {
 var best = null;
 for (var slot = 0; slot < 2; slot++) {
  var got = {}, cnt = null, valid = true;
  for (var k = 0; k < OLD_N; k++) {
   var s = sectorInfo(sav, slot * OLD_N + k);
   if (s.sig !== SIG || s.id >= OLD_N || s.id in got || s.chk !== checksum(sav,s.o,SIZES[s.id]) || cnt !== null && cnt !== s.cnt) { valid = false; break; }
   got[s.id] = s.o; cnt = s.cnt;
  }
  if (valid && (best === null || ((cnt - best.cnt) >>> 0) < 0x80000000)) best = {cnt:cnt,got:got};
 }
 return best;
}
function isNew(sav) {
var slots = [{}, {}], n = [0, 0];
for (var i = 0; i < 2 * NEW_N; i++) {
var s = sectorInfo(sav, i);
if (s.sig !== SIG || s.id >= NEW_N || s.chk !== checksum(sav, s.o, SIZES[s.id]))
continue;
var k = Math.floor(i / NEW_N);
if (!(s.id in slots[k]))
n[k]++;
slots[k][s.id] = s;
}
for (var k2 = 0; k2 < 2; k2++) {
if (n[k2] !== NEW_N)
continue;
var sec = slots[k2][2];
if (u32(sav, sec.o + (MAP_OFF - 0xFF0)) === MAP_MAGIC)
return true;
}
return false;
}
function kind(sav) {
if (sav.length < 32 * SECTOR)
return 'small';
if (isNew(sav))
return 'new';
if (readOld(sav))
return 'old';
return 'bad';
}
function migrate(sav) {
var best = readOld(sav);
if (!best)
throw new Error('古い形のセーブが見つかりません。');
var cnt = best.cnt, got = best.got, i, p;
var sb2 = sav.slice(got[0], got[0] + SIZES[0]);
var sb1 = new Uint8Array(0x3D98);
for (i = 1; i < 5; i++)
sb1.set(sav.subarray(got[i], got[i] + SIZES[i]), OFFS[i]);
var storage = new Uint8Array(0x83D0);
for (i = 5; i < 14; i++)
storage.set(sav.subarray(got[i], got[i] + SIZES[i]), OFFS[i]);
var par = {};
[0, 4, 13].forEach(function (k) { par[k] = sav.slice(got[k] + DATA - PARASITE[k], got[k] + DATA); });
var stream = new Uint8Array(33 * 30 * MON);
stream.set(storage.subarray(4, 4 + 19 * 30 * MON), 0);
var pages = [];
var p0 = new Uint8Array(DATA);
p0.set(storage.subarray(0, 4), 0);
p0.set(storage.subarray(0x8128, 0x81C0), P0_TAIL_A);
p0.set(storage.subarray(0x82E1, 0x83D0), P0_TAIL_B);
p0.set(par[13], P0_PARASITE);
p0.set(stream.subarray(0, PAGE0_MONS * MON), P0_MONS);
pages.push(p0);
for (p = 1; p < BOX_PAGES; p++) {
var g = PAGE0_MONS + (p - 1) * PAGE_MONS;
var pg = new Uint8Array(DATA);
pg.set(stream.subarray(g * MON, Math.min(stream.length, (g + PAGE_MONS) * MON)), 0);
pages.push(pg);
}
[30, 31].forEach(function (k) { pages.push(sav.slice(k * SECTOR, k * SECTOR + DATA)); });
put32(sb1, MAP_OFF, MAP_MAGIC);
put32(sb1, MAP_OFF + 4, cnt);
for (p = 0; p < SHELF_PAGES; p++)
sb1[MAP_OFF + 8 + p] = SHELF_FIRST + p;
var out = new Uint8Array(sav.length).fill(0xFF);
var chunks = [sb2];
for (i = 1; i < 5; i++)
chunks.push(sb1.subarray(OFFS[i], OFFS[i] + SIZES[i]));
var base = NEW_N * (cnt % 2);
for (i = 0; i < NEW_N; i++) {
var sec = new Uint8Array(SECTOR);
sec.set(chunks[i], 0);
if (i === 0 || i === 4)
sec.set(par[i], DATA - PARASITE[i]);
put16(sec, 0xFF4, i);
put16(sec, 0xFF6, checksum(sec, 0, SIZES[i]));
put32(sec, 0xFF8, SIG);
put32(sec, 0xFFC, cnt);
out.set(sec, (base + i) * SECTOR);
}
for (p = 0; p < pages.length; p++) {
var b = new Uint8Array(SECTOR);
b.set(pages[p], 0);
put16(b, 0xFF4, 0x40 + p);
put16(b, 0xFF6, checksum(b, 0, DATA));
put32(b, 0xFF8, SIG);
put32(b, 0xFFC, cnt);
out.set(b, (SHELF_FIRST + p) * SECTOR);
}
out.set(sav.subarray(32 * SECTOR), 32 * SECTOR);
var mons = 0;
for (i = 0; i < 19 * 30; i++)
if (u16(storage, 4 + i * MON + 0x1C))
mons++;
return { data: out, counter: cnt, mons: mons };
}
return { kind: kind, migrate: migrate };
})();

// Adjacent-version migration. Never alter the caller's original array.
function normalizeVersion(v){v=String(v).replace(/^v/i,'');const aliases={'0.34':'0.34.0','0.35':'0.35.0','0.36':'0.36.0','0.37':'0.37.0','0.38':'0.38.0','0.39':'0.39.0','0.40':'0.40.0','0.41':'0.41.0','0.42':'0.42.0','0.30.0':'0.30'};return aliases[v]||v}
function inferVersion(name){let match=String(name).match(/(?:START[-_]?v?)(0\.\d+(?:\.\d+)?)/i);let v=match&&normalizeVersion(match[1]);return MANIFEST.versions.some(x=>x.version===v)?v:null}
function equalBytes(a,b){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true}
function snapshot(s){let common=readMemory(s,SAVE1,0x3d68);common.fill(0,0x1400,0x1429);return {trainer:readMemory(s,SAVE2,0xf24),common,extra:readMemory(s,0x203b0e8,0x2ea4),party:Array.from({length:6},(_,i)=>readPartyRaw(s,i)),pc:Array.from({length:boxSlots(s)},(_,i)=>readRecord(s,i)),trainerInfo:readTrainer(s),partyCount:partyCount(s),boxes:boxSlots(s)/30}}
function verifyPreserved(before,after,label){before=compatibilityMasked(before);after=compatibilityMasked(after);for(let key of ['trainer','common','extra'])if(!equalBytes(before[key],after[key]))throw Error(label+'：'+key+'の保持検証に失敗しました。');if(before.partyCount!==after.partyCount)throw Error(label+'：手持ち数が変わりました。');for(let i=0;i<6;i++)if(!equalBytes(before.party[i],after.party[i]))throw Error(label+'：手持ち'+(i+1)+'の保持検証に失敗しました。');for(let i=0;i<before.pc.length;i++)if(!equalBytes(before.pc[i],after.pc[i]))throw Error(label+'：ボックス個体'+(i+1)+'の保持検証に失敗しました。');if(after.boxes<before.boxes)throw Error('ボックス数が減少しました。')}
function compatibilityMasked(s){let t={...s,trainer:s.trainer.slice(),common:s.common.slice(),extra:s.extra.slice()};t.trainer[9]=0;t.common.fill(0,12,20);t.extra.fill(0,0x3de,0x3e0);t.extra.fill(0,0x480,0x48e);return t}
function applyNativeCompatibility(data,slot,to){if(to.version!=='0.38.1'&&to.saveVersionStamp===undefined)return {data,actions:[],changed:[]};let s=readSave(data,slot),actions=[],before=snapshot(s);
 if(to.version==='0.38.1'){for(let id of MANIFEST.nativeCompatibility.newVariables.ids)setVariable(s,id,0);actions.push('ROMの更新表に従い新設変数0x5140〜0x5146を初期化')}
 if(to.resumeMaxSourceStamp!==undefined&&getVariable(s,0x50ef)>0&&getVariable(s,0x50ef)<=to.resumeMaxSourceStamp){let w=readMemory(s,SAVE1+0x1c,8);if(w[0]||u16(w,4)||u16(w,6)){let target=readMemory(s,SAVE1+12,8);target[0]=w[0];target[1]=w[1];target[2]=255;target[4]=w[4];target[5]=w[4]&128?255:0;target[6]=w[6];target[7]=w[6]&128?255:0;writeMemory(s,SAVE1+12,target);writeMemory(s,SAVE2+9,new Uint8Array([readMemory(s,SAVE2+9,1)[0]|1]));actions.push('ROMの更新処理に従い再開用ワープ情報を更新')}}
 if(to.saveVersionStamp!==undefined&&getVariable(s,0x50ef)!==to.saveVersionStamp){setVariable(s,0x50ef,to.saveVersionStamp);actions.push('ROMの記録値に合わせ保存バージョンを更新（'+to.saveVersionStamp.toString(16)+'）')}
 let out=actions.length?exportSave(s):data;let after=snapshot(readSave(out,slot)),changed=[];for(let region of ['trainer','common','extra'])for(let i=0;i<before[region].length;i++)if(before[region][i]!==after[region][i])changed.push({region,offset:i,before:before[region][i],after:after[region][i]});return {data:out,actions,changed};
}
function expandFlash(raw){if(raw.length-raw.length%4096===6291456)return raw.slice();let size=raw.length-raw.length%4096,rtc=raw.length-size,out=new Uint8Array(6291456+rtc).fill(255);out.set(raw.subarray(0,size));if(rtc)out.set(raw.subarray(size),6291456);return out}
function encodeSlot(raw,slot){let out=raw.slice(),offset=raw.length-raw.length%4096===6291456?slot*START_SLOT_BYTES:0,end=Math.min(offset+START_SLOT_BYTES,raw.length-raw.length%4096);for(let o=offset;o<end;o+=4096)if(u32(out,o+4088)===START_SIG)out.set(cryptSector(out.slice(o,o+4096)),o);return out}
function extendPC(raw,slot){let s=readSave(raw,slot);if(s.version!==23)throw Error('39ボックス形式が必要です。');if(s.boxCount===50)return raw.slice();let pages=s.bytes.slice(workOffset(s),workOffset(s)+17*4080),bytes=new Uint8Array(s.workBase+22*4080);bytes.set(s.bytes.subarray(0,s.workBase));bytes.set(pages,s.workBase);bytes[s.workBase+0xfe3]=0x58;bytes.fill(255,s.workBase+0xfe4,s.workBase+0xfe9);s.bytes=bytes;s.boxCount=50;s.pageCount=22;return exportSave(s)}
function stepSlot(raw,slot,to){let data=raw.slice(),s=readSave(data,slot),before=snapshot(s),actions=[];
 if(to.family===23&&s.version!==23){let local=localSlotBytes(data,slot),decoded=decodeSaveCrypt(local).bytes,result=SaveMigrate.migrate(decoded).data;if(s.slotCount===2){data.set(result.subarray(0,START_SLOT_BYTES),slot*START_SLOT_BYTES)}else data=result;actions.push('25→39ボックスの保存領域へ変換')}
 if(to.boxes===50){let expanded=expandFlash(data);if(expanded.length!==data.length)actions.push('保存領域を6MiBへ拡張');data=expanded;let next=readSave(data,slot);if(next.boxCount!==50){data=extendPC(data,slot);actions.push('39→50ボックスへ拡張（追加枠は空）')}}
 if(to.encrypted){let encrypted=encodeSlot(data,slot);if(!equalBytes(data,encrypted))actions.push('SaveCrypt形式へ変換');data=encrypted}
 let compat=applyNativeCompatibility(data,slot,to);data=compat.data;actions.push(...compat.actions);let after=snapshot(readSave(data,slot));verifyPreserved(before,after,to.version);
 return {data,actions:actions.length?actions:['保存構造は互換・全データ保持を確認'],boxes:after.boxes,compatibilityChanges:compat.changed};
}
// START compressed 58-byte records: low 10 bits are the held item; high 6
// carry individual metadata decoded by the ROM. Never clear them in the record.
function compressedHeldItemId(record){return u16(record,30)&0x03ff}
function inspectInput(raw,version){version=normalizeVersion(version);const source=MANIFEST.versions.find(x=>x.version===version);if(!source)throw Error('移行元のバージョンを選んでください。');let info=saveSlotInfo(raw);if(!info.some(x=>x.valid))throw Error('有効なレポートがありません。未保存・破損・ステートセーブを確認してください。');for(let x of info.filter(x=>x.valid)){let s=readSave(raw,x.slot);if((source.family===20)!==(s.version!==23))throw Error('選択した版とセーブの保存形式が異なります。移行元の版を選び直してください。');if(partyCount(s)>6)throw Error('手持ち数が不正です。');for(let i=0;i<boxSlots(s);i++){let p=readRecord(s,i),sp=u16(p,28);if(sp>=PROFILE.speciesCount)throw Error('種族IDが読み取れる範囲外です（ボックス'+(1+Math.floor(i/30))+'）。');if(sp){if(compressedHeldItemId(p)>=PROFILE.itemsCount)throw Error('持ち物IDが範囲外です。');if(getMoves(p).some(x=>x>=PROFILE.movesCount))throw Error('技IDが範囲外です。')}}}return info}
async function migrateSave(raw,from,selection='all',progress=()=>{}){raw=new Uint8Array(raw);from=normalizeVersion(from);let info=inspectInput(raw,from),slots=selection==='all'?info.filter(x=>x.valid).map(x=>x.slot):[Number(selection)];for(let slot of slots)if(!info[slot]?.valid)throw Error('選択したセーブに有効なレポートがありません。');let sourceIndex=MANIFEST.versions.findIndex(x=>x.version===from),steps=MANIFEST.versions.slice(sourceIndex+1),data=raw.slice(),logs=[],originalSnapshots=slots.map(slot=>snapshot(readSave(raw,slot))),originalRTC=raw.slice(raw.length-raw.length%4096),untouched=info.filter(x=>!slots.includes(x.slot)).map(x=>({slot:x.slot,bytes:raw.slice(x.slot*START_SLOT_BYTES,(x.slot+1)*START_SLOT_BYTES)}));
 // Source files from a 128KiB emulator can still contain a 39-box layout at a later release.
 // Normalize the destination format at the first real edge, keeping every adjacent edge in the log.
 if(!steps.length)steps=[MANIFEST.versions[sourceIndex]];
 let prev=from;
 for(let index=0;index<steps.length;index++){let to=steps[index],row={from:prev,to:to.version,slots:[]};for(let slot of slots){let result=stepSlot(data,slot,to);data=result.data;row.slots.push({slot,actions:result.actions,boxes:result.boxes,compatibilityChanges:result.compatibilityChanges})}logs.push(row);progress({index:index+1,total:steps.length,row});prev=to.version;await new Promise(resolve=>setTimeout(resolve,0))}
 for(let i=0;i<slots.length;i++)verifyPreserved(originalSnapshots[i],snapshot(readSave(data,slots[i])),'最終検証');for(let x of untouched)if(!equalBytes(x.bytes,data.slice(x.slot*START_SLOT_BYTES,(x.slot+1)*START_SLOT_BYTES)))throw Error('選択していないセーブが変わりました。');if(!equalBytes(originalRTC,data.slice(data.length-data.length%4096)))throw Error('時計情報が変わりました。');
 return {data,report:{toolVersion:MANIFEST.toolVersion,from,to:MANIFEST.latest,slots:slots.map((slot,i)=>({slot:slot+1,...originalSnapshots[i].trainerInfo,originalBoxes:originalSnapshots[i].boxes,finalBoxes:readSave(data,slot).boxCount})),steps:logs,preserved:['トレーナー','所持金','手持ち6枠','既存の全ボックス個体','ROMの更新対象以外のフラグ・変数を含む保存領域','拡張バッグを含む保存領域','時計情報','未選択セーブ'],fullGameplayTest:false,compatibilityFieldExceptions:["保存バージョン0x50EF","新設変数0x5140〜0x5146","ROM指定の再開用ワープ情報と状態"]}};
}
export {MANIFEST,readSave,inspectInput,migrateSave,normalizeVersion,getVariable,boxSlots,readRecord,readPartyRaw,snapshot};
