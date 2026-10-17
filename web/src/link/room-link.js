/* SPDX-License-Identifier: MPL-2.0 OR AGPL-3.0-or-later
 * Adapted from liru55/mgba-celio-web web/link-session.js,
 * revision 58d463ebe2302e4fc70098760dcfc84ca69329db (MPL-2.0).
 * Original notice: Browser transport for upstream CelioNet, rom64 c5a0ba984.
 * Modified 2026-10-08: separate bounded transport, pinned relay, explicit start,
 * promise-based shutdown, and existing JS device adapter. See ../../NOTICES.md.
 * Modified 2026-10-09: clarified the secondary-license offer below.
 * Modified 2026-10-12: negotiate legacy/batched Celio events, acknowledge
 * commands/session events, and bound ordered delivery and outgoing retries.
 * Modified 2026-10-14: accept explicitly selected, validated secure relays.
 * Modified 2026-10-17: defer device startup while sharing a room in another app;
 * retain the pre-handshake lobby without changing the upstream wire protocol.
 * This Source Code Form remains subject to the Mozilla Public License 2.0.
 * Under MPL 2.0 section 3.3, this file (including this port's modifications)
 * is also offered under GNU Affero General Public License version 3 or later
 * as part of this combined work. No warranty. See ../../LICENSE and
 * ../../MPL_SECONDARY_LICENSE.md; the original MPL rights are retained.
 * This module has no ROM, save, storage, or file API.
 */
import {tr} from '../i18n/index.js';
import {CelioDevice,LinkStatus} from './celio-device.js';
import {CELIO_RELAY,validateRelayURL} from './relay-settings.js';
export {CELIO_RELAY} from './relay-settings.js';
const commands=new Set([0,1,0x10,0x11,0x12,0x13,0xFF0A]);
const validWords=data=>Array.isArray(data)&&data.length===32&&data.every(v=>Number.isInteger(v)&&v>=0&&v<=65535);
const validPacket=p=>p&&Number.isSafeInteger(p.sequence)&&p.sequence>=0&&p.sequence<Number.MAX_SAFE_INTEGER&&validWords(p.data);
const validUUID=value=>typeof value==='string'&&value.length>0&&value.length<=128;
export class RoomLink {
  constructor(io,{onStatus=()=>{},onEnd=()=>{},server=CELIO_RELAY}={}){
    this.server=validateRelayURL(server,{loopback:globalThis.location?.hostname==='127.0.0.1'});this.io=io;this.onStatus=onStatus;this.onEnd=onEnd;
    this.closed=false;this.joined=false;this.connected=false;this.room='';this.sent=0;this.received=0;
    this.backgrounded=false;this.deviceStarted=false;this.gameStarted=false;
    this.lobbyCommands=[];this.lobbyData=[];
    this.sequence=0;this.expected=0;this.pending=new Map();this.seen=new Set();
    this.batched=false;this.nextAck=1;this.outgoing=[];this.inFlight=new Map();this.outgoingCount=0;
    this.device=new CelioDevice(io,value=>this.status(value),data=>this.sendData(data));
  }
  start(room=''){
    if(room&&!/^\d{4}$/.test(room))throw new Error(tr('4桁の部屋番号を入力してください。'));
    if(this.socket||this.closed)throw new Error(tr('通信を終了してからやり直してください。'));
    this.room=room;this.host=!room;this.lastReceive=performance.now();
    const socket=this.socket=new WebSocket(this.server);
    socket.onmessage=e=>{if(this.closed)return;try{this.message(e.data);}catch(error){this.close(error.message);}};
    socket.onerror=()=>this.close(tr('中継サーバーに接続できませんでした。'));
    socket.onclose=()=>this.close(tr('接続が切れました。'));
    this.heartbeat=setInterval(()=>{if(performance.now()-this.lastReceive>20000)this.close(tr('サーバーから応答がありません。'));},2000);
    this.onStatus(tr('接続中…'));
  }
  wire(text){if(this.closed)return;if(this.socket?.readyState!==WebSocket.OPEN||this.socket.bufferedAmount>65536)throw new Error(tr('通信が追いつきませんでした。'));this.socket.send(text);}
  sendEvent(event,value){
    if(!this.batched){this.wire('42'+JSON.stringify([event,value]));return;}
    if(this.outgoingCount>=1024)throw new Error(tr('通信が追いつきませんでした。'));
    this.outgoing.push({event,value});this.outgoingCount++;this.scheduleSend();
  }
  scheduleSend(){
    if(this.sendScheduled||this.closed)return;this.sendScheduled=true;
    // Pack words produced in the same emulation turn together, without waiting
    // for a frame/timer or for earlier ACKs (bounded to 64 events in flight).
    queueMicrotask(()=>{this.sendScheduled=false;try{this.flushOutgoing();}catch(error){this.close(error.message);}});
  }
  flushOutgoing(){
    while(!this.closed&&this.outgoing.length&&this.inFlight.size<64){
      const {event,value}=this.outgoing.shift();let payload=value,count=1;
      if(event==='deviceData'){
        payload=[value];while(payload.length<32&&this.outgoing[0]?.event===event){payload.push(this.outgoing.shift().value);count++;}
      }
      if(this.nextAck>1e9)throw new Error(tr('通信番号の上限に達しました。'));
      const id=this.nextAck++,request={text:'42'+id+JSON.stringify([event,payload]),count,attempt:0,timer:null};
      this.inFlight.set(id,request);this.transmit(id,request);
    }
  }
  transmit(id,request){
    if(this.closed)return;
    this.wire(request.text);request.attempt++;
    request.timer=setTimeout(()=>{
      if(this.closed||!this.inFlight.has(id))return;
      if(request.attempt>=6){this.close(tr('通信の受信確認が届きませんでした。'));return;}
      // Keep the same sequence/UUID and ACK ID so a retry cannot act twice.
      try{this.transmit(id,request);}catch(error){this.close(error.message);}
    },1000+(request.attempt-1)*100);
  }
  acknowledge(id){if(id>=0)this.wire('43'+id+'[true]');}
  sendData(data){
    if(!this.joined||this.closed)return;
    if(!validWords(data)||this.sequence>=Number.MAX_SAFE_INTEGER)throw new Error(tr('通信データが不正です。'));
    this.sendEvent('deviceData',{sequence:this.sequence++,data:[...data]});this.sent+=64;
  }
  status(value){
    if(!this.joined||this.closed)return;
    if([LinkStatus.handshake,LinkStatus.connected,LinkStatus.reconnecting,LinkStatus.closed].includes(value)){
      this.gameStarted=true;
      if(this.backgrounded||globalThis.document?.hidden){this.close(tr('画面を離れたため接続を終了しました。'));return;}
    }
    if(value===LinkStatus.closed)this.gameClosed=true;
    if(value===LinkStatus.connected)this.onStatus(tr('通信中'));
    if([0xFF02,...Object.values(LinkStatus)].includes(value))this.sendEvent('deviceStatus',{uuid:crypto.randomUUID(),linkStatus:value});
  }
  startDevice(){
    if(this.closed)return;
    this.connected=true;
    if(this.backgrounded||globalThis.document?.hidden){this.onStatus(tr('画面に戻るまで通信開始を待っています。'));return;}
    if(!this.deviceStarted){
      this.deviceStarted=true;this.io.enable(true);this.device.reset();
      this.io.event=kind=>{try{this.device.event(kind);}catch(error){this.close(error.message);}};
    }
    for(const command of this.lobbyCommands){if(command===0x12||command===0x13)this.gameStarted=true;this.device.command(command);}
    this.lobbyCommands=[];
    for(const data of this.lobbyData){this.gameStarted=true;this.device.receive(data);}this.lobbyData=[];
    this.requestMode();
    this.onStatus(tr('接続しました。両方のゲームでケーブル通信の受付へ進んでください。'));
  }
  get canWait(){return !this.closed&&!this.gameStarted;}
  setBackground(hidden){
    if(this.closed||this.backgrounded===hidden)return;
    this.backgrounded=hidden;
    if(hidden){
      if(!this.canWait){this.close(tr('画面を離れたため接続を終了しました。'));return;}
      clearTimeout(this.modeTimer);this.modeTimer=null;
      if(this.connected)this.onStatus(tr('画面に戻るまで通信開始を待っています。'));
    }else if(this.connected){
      try{this.startDevice();}catch(error){this.close(error.message);}
    }
  }
  requestMode(){
    if(this.modeRequested||this.modeTimer||!this.deviceStarted||this.backgrounded||globalThis.document?.hidden)return;
    this.modeTimer=setTimeout(()=>{
      this.modeTimer=null;if(this.closed||this.backgrounded||globalThis.document?.hidden)return;
      this.modeRequested=true;try{this.device.command(0);}catch(error){this.close(error.message);}
    },500);
  }
  get deferLobby(){return this.canWait&&(!this.deviceStarted||this.backgrounded||globalThis.document?.hidden);}
  receive(data){
    if(this.deferLobby){
      // A peer already at the cable desk may send before our CPU starts.
      // ACK validated packets, retaining the same bounded device queue limit.
      if(this.lobbyData.length>=512)throw new Error(tr('通信が遅れています。接続し直してください。'));
      this.lobbyData.push(data);return;
    }
    this.gameStarted=true;this.device.receive(data);
  }
  deliver(packet){
    const seq=packet.sequence;if(seq<this.expected)return;
    if(seq>this.expected){if(this.pending.has(seq))return;if(seq-this.expected>1024||this.pending.size>=1024)throw new Error(tr('通信の順序を復元できませんでした。'));this.pending.set(seq,packet.data);return;}
    this.receive(packet.data);this.received+=64;this.expected++;
    while(this.pending.has(this.expected)){this.receive(this.pending.get(this.expected));this.received+=64;this.pending.delete(this.expected++);}
  }
  message(raw){
    // The upstream batch limit is 1024 packets of 32 uint16 words.
    if(typeof raw!=='string'||raw.length>262144)throw new Error(tr('通信メッセージが不正です。'));
    this.lastReceive=performance.now();
    if(raw[0]==='0'){if(this.authSent)throw new Error(tr('接続の手順が不正です。'));this.authSent=true;this.wire('40'+JSON.stringify({clientId:crypto.randomUUID()}));return;}
    if(raw==='2'){this.wire('3');return;}
    if(raw[0]==='1')throw new Error(tr('接続が終了しました。'));
    const match=/^4([0-4])(\d*)(.*)$/s.exec(raw);if(!match)return;
    const type=match[1],id=match[2]===''?-1:Number(match[2]);
    if(!Number.isSafeInteger(id)||id>1e9)throw new Error(tr('通信番号が不正です。'));
    if(type==='0'){if(this.requested||!this.authSent)throw new Error(tr('接続の手順が不正です。'));this.requested=true;this.wire('420'+JSON.stringify(this.host?['sessionCreate',null]:['sessionJoin',this.room]));return;}
    if(type==='1'||type==='4')throw new Error(tr('サーバーに接続できませんでした。'));
    const args=JSON.parse(match[3]);if(!Array.isArray(args))throw new Error(tr('通信イベントが不正です。'));
    if(type==='3'){
      if(id>0){
        const request=this.inFlight.get(id);if(!request)return;
        if(args.length!==1||args[0]!==true)throw new Error(tr('通信データが受け付けられませんでした。'));
        clearTimeout(request.timer);this.inFlight.delete(id);this.outgoingCount-=request.count;this.scheduleSend();return;
      }
      if(id!==0||this.joined)return;
      const reply=args[0];if(reply?.variant!=='Ok')throw new Error(reply?.error==='Session not found'?tr('その部屋はありません。'):reply?.error==='Session is full'?tr('その部屋は満員です。'):tr('部屋に入れませんでした。'));
      const room=reply.value?.id||reply.id;if(typeof room!=='string'||!/^\d{4}$/.test(room))throw new Error(tr('部屋番号を確認できませんでした。'));
      this.room=room;this.joined=true;this.onStatus(this.host?tr('相手に部屋番号を伝えてください。'):tr('接続しました。'));
      if(!this.host)this.startDevice();return;
    }
    const [event,data]=args;
    if(!this.joined)throw new Error(tr('部屋に入る前に通信を受信しました。'));
    if(event==='deviceData'){
      if(!this.connected)throw new Error(tr('接続前の通信です。'));
      const packets=Array.isArray(data)?data:[data];
      // Validate the whole batch before giving any of it to the emulated device.
      if(!packets.length||packets.length>1024||!packets.every(validPacket))throw new Error(tr('通信データが不正です。'));
      if(!this.canWait&&(this.backgrounded||globalThis.document?.hidden)){this.acknowledge(id);this.close(tr('画面を離れたため接続を終了しました。'));return;}
      if(Array.isArray(data))this.batched=true;
      for(const packet of packets)this.deliver(packet);this.acknowledge(id);
    }
    else if(event==='deviceCommand'){
      if(!this.connected||!data||!commands.has(data.command)||!validUUID(data.uuid))throw new Error(tr('通信コマンドが不正です。'));
      // Celio added batched data before ACK-bearing commands. Its mode command
      // arrives before the game can send data. Legacy RxJS handlers must NOT
      // receive an extra ACK callback (it changes their event payload shape).
      if(id>=0)this.batched=true;
      if(!this.seen.has(data.uuid)){
        if(this.seen.size>=4096)throw new Error(tr('通信コマンドが多すぎます。'));this.seen.add(data.uuid);
        // A mode reply may arrive while the lobby is backgrounded. It does not
        // advance the paused CPU. Handshake/connect commands do start gameplay.
        if(this.deferLobby){
          if(this.lobbyCommands.length>=32)throw new Error(tr('通信コマンドが多すぎます。'));
          this.lobbyCommands.push(data.command);this.acknowledge(id);return;
        }
        if(data.command===0x12||data.command===0x13){
          this.gameStarted=true;
          if(this.backgrounded||globalThis.document?.hidden){this.acknowledge(id);this.close(tr('画面を離れたため接続を終了しました。'));return;}
        }
        this.device.command(data.command);
      }
      this.acknowledge(id);
    }else if(['partnerJoined','partnerLeft','sessionClose'].includes(event)){
      if(id>=0&&!validUUID(data?.uuid))throw new Error(tr('通信イベントが不正です。'));
      if(event==='partnerJoined')this.startDevice();
      // Send before closing the WebSocket; duplicate joins cannot reset a device.
      this.acknowledge(id);
      if(event==='partnerLeft')this.close(tr('相手が部屋を離れました。'));
      if(event==='sessionClose')this.close(this.gameClosed?tr('通信が完了しました。'):tr('通信が終了しました。'),{keep:!!this.gameClosed,notify:false});
    }
  }
  close(reason=tr('通信を中止しました。'),{keep=false,notify=true}={}){
    if(this.closed)return this.completion;
    this.closed=true;clearInterval(this.heartbeat);clearTimeout(this.modeTimer);
    for(const request of this.inFlight.values())clearTimeout(request.timer);
    this.inFlight.clear();this.outgoing=[];this.outgoingCount=0;this.pending.clear();this.seen.clear();this.lobbyCommands=[];this.lobbyData=[];
    if(notify&&this.socket?.readyState===WebSocket.OPEN)try{this.socket.send('42["sessionLeft"]');}catch{}
    this.socket?.close();this.device.close();this.io.event=null;if(this.deviceStarted)this.io.enable(false);
    this.completion=Promise.resolve(this.onEnd(reason,{keep}));return this.completion;
  }
}
