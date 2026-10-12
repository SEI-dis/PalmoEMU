/* SPDX-License-Identifier: MPL-2.0 OR AGPL-3.0-or-later
 * Adapted from liru55/mgba-celio-web web/celio-serial.js, revision
 * 58d463ebe2302e4fc70098760dcfc84ca69329db (MPL-2.0).
 * Original notice: Web Serial port of upstream CelioNet.cpp 01eb03516.
 * Modified 2026-10-09: bounded queues, validation and cancellable shutdown.
 * Under MPL 2.0 section 3.3 this modified file is also offered under AGPL-3.0-or-later
 * as part of this combined work. Original MPL rights retained; see NOTICES.md
 * and MPL_SECONDARY_LICENSE.md. This module has no ROM/save/storage API.
 */
import {tr} from './i18n/index.js';
export class CelioSerial {
  constructor(port,onFrame,onError){Object.assign(this,{port,onFrame,onError,buffer:[],pending:0,closed:false,queue:Promise.resolve()});}
  static frame(channel,payload){
    if(![0,1,2].includes(channel)||payload.length>64||Array.from(payload).some(v=>!Number.isInteger(v)||v<0||v>255))throw Error(tr('USB通信データが不正です。'));
    return Uint8Array.from([71,66,channel,payload.length,0,...payload]);
  }
  feed(chunk){
    for(const byte of chunk){
      this.buffer.push(byte);
      while(this.buffer.length>=5){
        if(this.buffer[0]!==71||this.buffer[1]!==66){this.buffer.shift();continue;}
        const n=this.buffer[3]|this.buffer[4]<<8;
        if(n>64)throw Error(tr('USB通信データが大きすぎます。'));
        if(this.buffer.length<n+5)break;
        const frame=this.buffer.splice(0,n+5);this.onFrame(frame[2],Uint8Array.from(frame.slice(5)));
      }
    }
  }
  open(){
    if(this.closed||this.openTask)throw Error(tr('USB接続を終了してからやり直してください。'));
    this.openTask=(async()=>{
      await this.port.open({baudRate:115200});this.opened=true;
      if(this.closed){await this.closePort();return;}
      try{await this.port.setSignals({dataTerminalReady:true,requestToSend:true});}catch{}
      if(this.closed){await this.closePort();return;}
      if(!this.port.readable||!this.port.writable)throw Error(tr('このUSB変換器を開けません。'));
      this.writer=this.port.writable.getWriter();this.reader=this.port.readable.getReader();this.readTask=this.read();
    })();return this.openTask;
  }
  async read(){
    try{while(!this.closed){const {value,done}=await this.reader.read();if(done)break;if(value)this.feed(value);}if(!this.closed)this.onError(Error(tr('USB変換器が外れました。')));}
    catch(e){if(!this.closed)this.onError(e);}
    finally{try{this.reader.releaseLock();}catch{}}
  }
  send(channel,payload){
    if(this.closed)return;
    if(this.pending>=256){this.onError(Error(tr('USB通信が追いつきません。')));return;}
    const frame=CelioSerial.frame(channel,payload);this.pending++;
    this.queue=this.queue.then(()=>{if(!this.closed)return this.writer.write(frame);}).catch(e=>{if(!this.closed)this.onError(e);}).finally(()=>this.pending--);
  }
  command(value){this.send(0,value===0?[0,1]:[value&255]);}
  data(words){
    if(words.length!==32||words.some(v=>!Number.isInteger(v)||v<0||v>65535))throw Error(tr('USB通信データが不正です。'));
    this.send(1,words.flatMap(v=>[v&255,v>>8]));
  }
  close(){
    if(this.completion)return this.completion;this.closed=true;
    this.completion=(async()=>{
      // Serial open/write/abort can be delayed by the OS or adapter. Recovery
      // must finish even then; a port which opens late closes itself above.
      await settleWithin(this.openTask);
      const cancel=this.queue.then(()=>this.writer?.write(CelioSerial.frame(0,[1])));
      await settleWithin(cancel,250);
      await settleWithin(Promise.allSettled([this.reader?.cancel(),this.writer?.abort()]));
      await settleWithin(Promise.allSettled([this.readTask,this.queue]));
      try{this.reader?.releaseLock();}catch{}
      try{this.writer?.releaseLock();}catch{}
      await settleWithin(this.closePort());
    })();return this.completion;
  }
  closePort(){if(this.opened&&!this.portClosing)this.portClosing=Promise.resolve().then(()=>this.port.close()).catch(()=>{});return this.portClosing;}
}
function settleWithin(task,ms=500){
  let timer;return Promise.race([Promise.resolve(task).catch(()=>{}),new Promise(resolve=>{timer=setTimeout(resolve,ms);})]).finally(()=>clearTimeout(timer));
}
