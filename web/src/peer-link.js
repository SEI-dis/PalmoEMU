// SPDX-License-Identifier: AGPL-3.0-or-later
// Transport accepts only 32 serial words or a fixed status. No ROM/storage API.
import {tr} from './i18n/index.js';
import {CelioDevice,LinkStatus as S} from './celio-device.js';
const protocol='manic-celio-1',statuses=new Set(Object.values(S));
export class PeerLink {
  constructor(io,{internet=false,onStatus=()=>{},onEnd=()=>{}}={}){
    this.onStatus=onStatus;this.onEnd=onEnd;this.io=io;this.closed=false;this.sent=0;this.received=0;
    this.pc=new RTCPeerConnection({iceServers:internet?[{urls:'stun:stun.l.google.com:19302'}]:[]});
    this.pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(this.pc.connectionState))this.close(tr('接続が終了しました。'));else if(this.pc.connectionState==='disconnected')this.onStatus(tr('接続が途切れています…'));};
    this.pc.ondatachannel=e=>{if(this.channel){e.channel.close();return;}this.bind(e.channel);};
    this.device=new CelioDevice(io,v=>this.localStatus(v),words=>this.send({t:'data',words}));
  }
  bind(channel){
    if(channel.label!==protocol||channel.ordered!==true){channel.close();throw new Error(tr('対応する通信方式ではありません。'));}
    this.channel=channel;
    channel.onopen=()=>{this.lastMessage=performance.now();this.send({t:'hello',protocol});this.onStatus(tr('相手を確認しています…'));this.heartbeat=setInterval(()=>{if(performance.now()-this.lastMessage>15000)this.close(tr('相手からの応答がありません。'));else this.send({t:'ping'});},2000);};
    channel.onclose=()=>this.close(tr('接続が終了しました。'));channel.onerror=()=>this.close(tr('通信に失敗しました。'));
    channel.onmessage=e=>{try{this.message(e.data);}catch(error){this.close(error.message);}};
  }
  message(raw){
    if(typeof raw!=='string'||raw.length>512)throw new Error(tr('通信データが不正です。'));
    const m=JSON.parse(raw);if(!m||typeof m!=='object'||Array.isArray(m))throw new Error(tr('通信データが不正です。'));
    if(m.t==='hello'){
      if(m.protocol!==protocol)throw new Error(tr('通信機能のバージョンが違います。双方のアプリを更新してください。'));
      if(!this.started){this.started=true;this.io.enable(true);this.io.event=k=>{try{this.device.event(k);}catch(e){this.close(e.message);}};this.device.mode(this.host);this.onStatus(tr('相手と接続しました。両方のゲームで通信受付へ進んでください。'));}
    }else if(m.t==='ping'){}else if(!this.started)throw new Error(tr('通信の開始順序が不正です。'));
    else if(m.t==='data'){if(!Array.isArray(m.words))throw new Error(tr('通信データが不正です。'));this.device.receive(m.words);this.received+=64;}
    else if(m.t==='status'){
      if(!statuses.has(m.value))throw new Error(tr('通信状態が不正です。'));this.remote=m.value;
      if(m.value===S.connected)this.device.command(0x13);
      this.coordinate();
    }else throw new Error(tr('対応していない通信データです。'));
    this.lastMessage=performance.now();
  }
  localStatus(value){this.local=value;this.send({t:'status',value});this.coordinate();if(value===S.connected)this.onStatus(tr('ゲーム内の通信が始まりました。交換・対戦の結果はゲーム内で確認してください。'));}
  coordinate(){if(this.local===S.handshake&&this.remote===S.handshake)this.device.command(0x12);if(this.local===S.closed&&this.remote===S.closed)this.finishTimer??=setTimeout(()=>this.close(tr('ゲームの通信が終了しました。')),2000);}
  send(message){if(this.closed||this.channel?.readyState!=='open')return;if(this.channel.bufferedAmount>65536){this.close(tr('通信が遅れています。接続し直してください。'));return;}const text=JSON.stringify(message);if(text.length>512){this.close(tr('通信データが大きすぎます。'));return;}try{this.channel.send(text);if(message.t==='data')this.sent+=64;}catch{this.close(tr('通信に失敗しました。'));}}
  async gather(){if(this.pc.iceGatheringState==='complete')return;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{clean();reject(new Error(tr('接続コードを作成できませんでした。ネット接続を確認してください。')));},15000);const check=()=>{if(this.pc.iceGatheringState==='complete'){clean();resolve();}};const clean=()=>{clearTimeout(timer);this.pc.removeEventListener('icegatheringstatechange',check);};this.pc.addEventListener('icegatheringstatechange',check);check();});}
  encode(){return btoa(JSON.stringify({v:protocol,type:this.pc.localDescription.type,sdp:this.pc.localDescription.sdp}));}
  decode(text,type){if(text.length>65536)throw new Error(tr('接続コードが長すぎます。'));let v;try{v=JSON.parse(atob(text.trim()));}catch{throw new Error(tr('接続コードを確認してください。'));}if(v?.v!==protocol||v.type!==type||typeof v.sdp!=='string'||v.sdp.length>32768||!v.sdp.includes('m=application')||/^m=(audio|video)/m.test(v.sdp))throw new Error(tr('このWeb版の接続コードではありません。'));return {type,sdp:v.sdp};}
  async offer(){this.host=true;this.bind(this.pc.createDataChannel(protocol,{ordered:true}));await this.pc.setLocalDescription(await this.pc.createOffer());await this.gather();return this.encode();}
  async answer(text){this.host=false;await this.pc.setRemoteDescription(this.decode(text,'offer'));await this.pc.setLocalDescription(await this.pc.createAnswer());await this.gather();return this.encode();}
  async accept(text){if(!this.host||this.pc.signalingState!=='have-local-offer')throw new Error(tr('先に接続コードを作成してください。'));await this.pc.setRemoteDescription(this.decode(text,'answer'));}
  close(reason=tr('接続を終了しました。')){if(this.closed)return;this.closed=true;clearInterval(this.heartbeat);clearTimeout(this.finishTimer);this.device.close();this.io.event=null;this.io.enable(false);this.channel?.close();this.pc.close();this.onEnd(reason);}
}
