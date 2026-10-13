// SPDX-License-Identifier: AGPL-3.0-or-later
// Classic worker: MIT-licensed RomPatcher.js modules keep their original scope.
importScripts('../vendor/rom-patcher/HashCalculator.js','../vendor/rom-patcher/BinFile.js','../vendor/rom-patcher/RomPatcher.format.ips.js','../vendor/rom-patcher/RomPatcher.format.bps.js','../vendor/rom-patcher/RomPatcher.format.ups.js');
// Bound every record before passing untrusted input to the upstream parser.
function preflight(bytes,romSize){
 const limit=64*1048576,magic=new TextDecoder().decode(bytes.subarray(0,5));let pos=0,end=bytes.length,records=0;
 const bad=()=>{throw Error('invalid');},take=n=>{if(!Number.isSafeInteger(n)||n<0||pos+n>end)bad();const at=pos;pos+=n;return at;};
 const byte=()=>bytes[take(1)],be=n=>{let v=0;while(n--)v=v*256+byte();return v;};
 const vlv=()=>{let v=0,shift=1;for(let n=0;n<5;n++){const b=byte();v+=(b&127)*shift;if(v>0x7fffffff)bad();if(b&128)return v;shift*=128;v+=shift;}bad();};
 const count=()=>{if(++records>250000)bad();};
 if(!romSize||romSize>limit||end>limit)bad();
 if(magic==='PATCH'){
  pos=5;let max=romSize;
  while(true){const offset=be(3);if(offset===0x454f46)break;count();let length=be(2);if(length)take(length);else{length=be(2);byte();if(!length)bad();}max=Math.max(max,offset+length);if(max>limit)bad();}
  if(pos!==end){if(end-pos!==3)bad();const size=be(3);if(!size||size>limit)bad();}return IPS;
 }
 const kind=magic.slice(0,4);if(!['BPS1','UPS1'].includes(kind)||end<18)bad();
 end-=12;pos=4;const source=vlv(),target=vlv();if(source!==romSize)throw Error('source');if(!target||target>limit)bad();
 if(kind==='BPS1'){
  take(vlv());let output=0,sourceAt=0,targetAt=0;
  while(pos<end){count();const data=vlv(),type=data&3,length=Math.floor(data/4)+1;if(output+length>target)bad();
   if(type===0){if(output+length>source)bad();}
   else if(type===1)take(length);
   else{const value=vlv(),relative=(value&1?-1:1)*Math.floor(value/2);if(type===2){sourceAt+=relative;if(sourceAt<0||sourceAt+length>source)bad();sourceAt+=length;}else{targetAt+=relative;if(targetAt<0||targetAt>=output)bad();targetAt+=length;}}
   output+=length;
  }if(pos!==end||output!==target)bad();return BPS;
 }
 let offset=0;while(pos<end){count();offset+=vlv();if(offset>=Math.max(source,target))bad();let length=0;while(byte()){length++;if(offset+length>Math.max(source,target))bad();}offset+=length+1;}if(pos!==end)bad();return UPS;
}
self.onmessage=event=>{
 try{
  const {rom,patch}=event.data;if(!(rom instanceof ArrayBuffer)||!(patch instanceof ArrayBuffer))throw Error('invalid');
  const bytes=new Uint8Array(patch),Type=preflight(bytes,rom.byteLength),patchFile=new BinFile(patch);
  // UPS's upstream reader does not verify its own checksum. Check both formats.
  if(Type!==IPS){const expected=new DataView(patch).getUint32(patch.byteLength-4,true);if(patchFile.hashCRC32(0,patch.byteLength-4)!==expected)throw Error('invalid');}
  const parsed=Type.fromFile(patchFile),source=new BinFile(rom);if(Type!==IPS&&!parsed.validateSource(source))throw Error('source');
  const result=parsed.apply(source,true)._u8array;self.postMessage({bytes:result},[result.buffer]);
 }catch(error){self.postMessage({error:error.message==='source'?'source':'invalid'});}
};
