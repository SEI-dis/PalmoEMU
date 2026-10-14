/* SPDX-License-Identifier: GPL-3.0-only
 * JavaScript port of Celio-Link/Celio-mGBA-Link celio_device.lua (GPLv3),
 * with register integration following mGBA_celio_edition CelioNet.cpp (MPL2).
 * Original projects and revisions are recorded in SOURCES.json / NOTICES.md.
 * Modified 2026-10-08: bounded word queues; Celio relay commands; no logging.
 */
import {tr} from '../i18n/index.js';
export const LinkStatus={handshake:0xFF03,connected:0xFF05,reconnecting:0xFF06,closed:0xFF07};
export class CelioDevice {
  constructor(io,emitStatus,emitData){this.io=io;this.emitStatus=emitStatus;this.emitData=emitData;this.master=false;this.reset();}
  reset(listening=false){this.handshake=listening?1:0;this.phase=0;this.emuReconnect=false;this.gbaReconnect=false;this.keepAlive=true;this.startResponse=false;this.startConnect=false;this.received=[];this.transmit=[];this.tx=[];this.rx=[];this.emptyStreak=0;this.checksum=0;this.timerEnabled=false;this.timerCount=0;}
  mode(master){this.master=master;this.handshake=1;this.io.mask(master?0x601F:0x600B);}
  command(command){
    if(command===0||command===0xFF0A)this.emitStatus(0xFF02);
    else if(command===0x10)this.mode(true);
    else if(command===0x11)this.mode(false);
    else if(command===0x12)this.startResponse=true;
    else if(command===0x13)this.startConnect=true;
    // 0x01 (Cancel) is a no-op in the upstream emulator adapter too.
  }
  receive(words){if(words.length!==32||words.some(v=>!Number.isInteger(v)||v<0||v>65535))throw new Error(tr('通信データの形式が一致しません。'));if(this.received.length+32>16384)throw new Error(tr('通信が遅れています。接続し直してください。'));this.received.push(...words);}
  flush(){const words=this.transmit.splice(0,32);while(words.length<32)words.push(0);this.emitData(words);}
  disableTimer(){this.timerEnabled=false;this.timerCount=0;this.io.write(0x10E,0);this.io.write(0x10C,0);}
  transfer(rx){let tx=0;
    if(this.phase===0){
      if(rx===0xB9A0&&this.handshake===1){this.handshake=2;this.emitStatus(LinkStatus.handshake);}
      if(this.startConnect){this.phase=1;this.emitStatus(LinkStatus.connected);return 0x8FFF;}
      if(rx===0x8FFF){this.phase=1;this.emitStatus(LinkStatus.connected);}
      if(this.handshake===3)return 0xB9A0;
      if(this.startResponse)this.handshake=3;
      return 0xD15E;
    }
    if(this.phase===1){
      if(this.emuReconnect&&this.gbaReconnect){this.flush();if(this.keepAlive){this.reset(true);this.emitStatus(LinkStatus.reconnecting);}else this.emitStatus(LinkStatus.closed);this.disableTimer();}
      else this.phase=2;
      tx=this.checksum;this.checksum=0;return tx;
    }
    this.rx.push(rx);
    if(!this.tx.length){this.tx=this.received.length?this.received.splice(0,8):Array(8).fill(0);if(this.tx[0]===0xCAFE&&this.tx[1]===0x17)this.keepAlive=false;if(this.tx[0]===0x5FFF)this.emuReconnect=true;}
    if(this.rx.length===8){
      if(this.rx[0]===0x5FFF)this.gbaReconnect=true;
      if(this.rx[0]===0xCAFE&&this.rx[1]===0x11){if(++this.emptyStreak>1){this.rx[0]=0;this.rx[1]=0;}}else this.emptyStreak=0;
      if(this.transmit.length||this.rx.some(Boolean))this.transmit.push(...this.rx);
      this.rx=[];this.phase=1;
    }
    if(this.transmit.length>=32)this.flush();
    tx=this.tx.shift();this.checksum=(this.checksum+tx+rx)&65535;return tx;
  }
  event(kind){
    if(kind===0){const rx=this.io.read(0x12A),tx=this.transfer(rx);this.io.write(0x120,this.master?tx:rx);this.io.write(0x122,this.master?rx:tx);this.io.write(0x124,65535);this.io.write(0x126,65535);return;}
    const ie=this.io.read(0x200);
    if(!this.master||!(ie&0x80)){if(kind===1&&this.timerEnabled)this.disableTimer();return;}
    if(kind===1){this.io.write(0x202,this.io.read(0x202)|0x80);if(this.phase===1&&!this.timerEnabled){this.timerEnabled=true;this.io.write(0x10C,0xFED0);this.io.write(0x10E,0xC1);}}
    if(kind===2){this.io.write(0x202,(this.io.read(0x202)&0xFFBF)|0x80);if(this.timerCount===7)this.disableTimer();else this.timerCount++;}
  }
  close(){if(this.timerEnabled)this.disableTimer();}
}
