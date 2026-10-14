/* SPDX-License-Identifier: MPL-2.0 OR AGPL-3.0-or-later
 * Adapted from liru55/mgba-celio-web web/link-session.js (58d463ebe230), MPL-2.0.
 * Modified 2026-10-09: local/USB transport separated from UI and save ownership,
 * bounded packets, deferred completion and repeatable cleanup.
 * Under MPL 2.0 section 3.3 this modified file is also offered under AGPL-3.0-or-later
 * in this combined work. Original MPL rights retained. See NOTICES.md and
 * MPL_SECONDARY_LICENSE.md. No ROM/save/storage/network API in this module.
 */
import {tr} from '../i18n/index.js';
import {CelioDevice,LinkStatus} from './celio-device.js';
import {CelioSerial} from './celio-serial.js';
export class DirectLink {
  constructor(ios,{port,onStatus=()=>{},onClosing=()=>{},onEnd=()=>{}}={}){
    this.ios=ios;this.port=port;this.kind=port?'usb':'local';this.onStatus=onStatus;this.onClosing=onClosing;this.onEnd=onEnd;
    this.closed=false;this.connected=false;this.statuses=[0,0];this.masterSelected=false;this.sent=0;
    this.devices=ios.map((io,i)=>new CelioDevice(io,value=>this.status(i,value),words=>this.data(i,words)));
  }
  command(i,value){if(this.closed)return;if(i===1&&this.serial)this.serial.command(value);else this.devices[i].command(value);}
  data(i,words){if(this.closed)return;this.sent+=64;if(i===0&&this.serial)this.serial.data(words);else this.devices[1-i].receive(words);}
  status(i,value){
    if(this.closed)return;const other=1-i;
    if(value===0xFF02){this.command(i,this.masterSelected?0x11:0x10);this.masterSelected=true;}
    else if(value===0xFF01)this.command(i,0x11);
    else if(value===LinkStatus.handshake){this.statuses[i]=value;if(this.statuses.every(v=>v===value)){this.command(0,0x12);this.command(1,0x12);}}
    else if(value===LinkStatus.connected){this.statuses[i]=value;this.command(other,0x13);this.onStatus(tr('ケーブル通信中'));}
    else if(value===LinkStatus.closed){this.statuses[i]=value;if(this.statuses.every(v=>v===value)&&!this.endTimer)this.endTimer=setTimeout(()=>this.close(tr('通信が完了しました。'),{keep:true}),2000);}
  }
  async start(){
    if(this.closed||this.started)throw Error(tr('通信を終了してからやり直してください。'));this.started=true;
    try{
      this.ios.forEach((io,i)=>{io.enable(true);io.event=kind=>{try{this.devices[i].event(kind);}catch(e){this.close(e.message);}};});
      if(this.port){
        this.serial=new CelioSerial(this.port,(channel,payload)=>{
          if(this.closed)return;
          if(channel===2&&payload.length===2)this.status(1,payload[0]|payload[1]<<8);
          else if(channel===1&&payload.length===64)this.devices[0].receive(Array.from({length:32},(_,i)=>payload[i*2]|payload[i*2+1]<<8));
          else if(channel===1||channel===2)throw Error(tr('USB通信パケットの長さが不正です。'));
        },e=>this.close(e.message));
        await this.serial.open();if(this.closed)return;
        this.serial.command(0x0F);this.command(0,1);this.command(1,1);
      }
      this.connected=true;
      this.onStatus(this.port?tr('実機とゲームでケーブル通信の受付へ進んでください。'):tr('1P・2Pを切り替えて、両方のゲームでケーブル通信の受付へ進んでください。'));
      this.modeTimer=setTimeout(()=>{if(!this.closed)try{this.command(0,0);this.command(1,0);}catch(e){this.close(e.message);}},this.port?500:0);
    }catch(e){await this.close(e.message);throw e;}
  }
  close(reason=tr('通信を中止しました。'),{keep=false}={}){
    if(this.completion)return this.completion;this.closed=true;clearTimeout(this.modeTimer);clearTimeout(this.endTimer);
    this.onClosing();
    this.ios.forEach(io=>io.event=null);
    // Unwind any in-progress WASM callback before destroying device registers or
    // restoring emulator memory. Keep the game stopped during asynchronous saves.
    this.completion=Promise.resolve().then(async()=>{
      try{this.devices.forEach(d=>d.close());this.ios.forEach(io=>io.enable(false));}
      finally{await this.serial?.close();await this.onEnd(reason,{keep});}
    });return this.completion;
  }
}
