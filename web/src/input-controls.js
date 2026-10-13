// SPDX-License-Identifier: AGPL-3.0-or-later
// Browser implementation informed by ManicEMU ControllerMapping / Trigger
// (Daiuno, 2025) and DeltaCore input mappings (Riley Testut, 2017).
// Native source is not copied. See the input-controls references in NOTICES.md.
import {tr} from './i18n/index.js';
const directions=['up','down','left','right'];
const buttons={gb:['a','b','start','select'],gbc:['a','b','start','select'],nes:['a','b','start','select'],gba:['a','b','l','r','start','select'],snes:['a','b','x','y','l','r','start','select'],md:['a','b','c','x','y','z','start'],nds:['a','b','x','y','l','r','start','select'],'3ds':['a','b','x','y','l','r','start','select']};
export const specialInputs=['menu','save','load','speed','rewind'];
export const inputLabels={up:tr('上'),down:tr('下'),left:tr('左'),right:tr('右'),a:'A',b:'B',c:'C',x:'X',y:'Y',z:'Z',l:'L',r:'R',start:'START',select:'SELECT',menu:tr('メニュー'),save:tr('ステート保存'),load:tr('クイックロード'),speed:tr('速度切り替え'),rewind:tr('巻き戻し')};
export const assistModes=[['off',tr('通常')],['turbo',tr('連射')],['hold',tr('押しっぱなし')],['turboHold',tr('連射＋押しっぱなし')]];
export const inputSystems=Object.keys(buttons);
export const gameInputsFor=system=>[...directions,...buttons[system]||buttons.gba];
const validSystem=system=>Object.hasOwn(buttons,system)?system:'gba';
const keyboardCode=code=>typeof code==='string'&&(/^(Key[A-Z]|Digit\d|Numpad\d|F(?:[1-9]|1[0-2])|Arrow(?:Up|Down|Left|Right)|Shift(?:Left|Right))$/.test(code)||['Enter','Space','Tab','Escape','Backspace','Delete','Insert','Home','End','PageUp','PageDown','Backquote','Minus','Equal','BracketLeft','BracketRight','Backslash','Semicolon','Quote','Comma','Period','Slash','NumpadAdd','NumpadSubtract','NumpadMultiply','NumpadDivide','NumpadDecimal','NumpadEnter'].includes(code));
const padCode=code=>typeof code==='string'&&/^(b(?:[0-9]|[12][0-9]|3[01])|a[0-7][+-])$/.test(code);
const deviceCode=device=>device==='keyboard'||device==='gamepad'||typeof device==='string'&&/^pad:[0-9a-f]{8}$/.test(device);
export function deviceKey(pad){let hash=2166136261;for(const c of String(pad.id||'').slice(0,256))hash=Math.imul(hash^c.charCodeAt(0),16777619);return 'pad:'+(hash>>>0).toString(16).padStart(8,'0');}
export function inputName(code){
 if(code.startsWith('b'))return tr('ボタン ')+(Number(code.slice(1))+1);
 if(/^a\d[+-]$/.test(code))return tr('軸 ')+(Number(code[1])+1)+' '+code[2];
 return ({ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Space:'Space',ShiftLeft:tr('左Shift'),ShiftRight:tr('右Shift'),Escape:'Esc'})[code]||code.replace(/^Key|^Digit/,'');
}
export function defaultBindings(system,device='keyboard'){
 const map=device==='keyboard'?{KeyX:'a',KeyZ:'b',KeyA:'l',KeyS:'r',KeyW:'x',KeyQ:'y',KeyC:'c',KeyE:'z',Enter:'start',ShiftLeft:'select',ShiftRight:'select',ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',Escape:'menu',Tab:'speed',F5:'save',F8:'load',KeyR:'rewind'}:{b0:'a',b1:'b',b2:'y',b3:'x',b4:system==='md'?'c':'l',b5:system==='md'?'z':'r',b8:'select',b9:'start',b12:'up',b13:'down',b14:'left',b15:'right',b16:'menu','a0-':'left','a0+':'right','a1-':'up','a1+':'down'};
 const allowed=new Set([...gameInputsFor(system),...specialInputs]);return Object.fromEntries(Object.entries(map).filter(([,action])=>allowed.has(action)));
}
export function sanitizeInputControls(value){
 const result={version:1,profiles:{},assist:{}};
 for(const system of inputSystems){
  const allowed=new Set([...gameInputsFor(system),...specialInputs]),profiles=value?.profiles?.[system];
  if(profiles&&typeof profiles==='object')for(const device of Object.keys(profiles).filter(deviceCode).slice(0,16)){
   const map=profiles[device];if(!map||typeof map!=='object'||Array.isArray(map))continue;
   const clean=Object.fromEntries(Object.entries(map).slice(0,128).filter(([code,action])=>(device==='keyboard'?keyboardCode(code):padCode(code))&&allowed.has(action)));
   (result.profiles[system]??={})[device]=clean;
  }
  const assist=value?.assist?.[system];if(assist&&typeof assist==='object'){
   const interval=Number.isInteger(assist.interval)&&assist.interval>=50&&assist.interval<=1000?assist.interval:100;
   const modes={};for(const action of gameInputsFor(system))if(assistModes.some(([id])=>id===assist.modes?.[action])&&assist.modes[action]!=='off')modes[action]=assist.modes[action];
   result.assist[system]={interval,modes};
  }
 }
 for(const system of ['nes','snes','md']){const source=value?.players?.[system];if(!source||typeof source!=='object')continue;
  const choices={};for(const [key,player] of Object.entries(source).slice(0,34))if((['keyboard','touch'].includes(key)||/^pad:[0-9a-f]{8}:\d{1,2}$/.test(key))&&[1,2].includes(player))choices[key]=player;
  if(Object.keys(choices).length)(result.players??={})[system]=choices;
 }return result;
}
export function createInputControls(api){
 const {settings,keybits,pressed,updateKeys}=api;
 let held=new Map(),blockedKeys=new Set(),blockedPads=new Set(),previousPads=new Set(),padIds='',capture=null,captureFrame=0,latched=0,previousRaw=0,starts=new Map(),lastSystem='',lastLinked=false,destroyed=false;
 let config=sanitizeInputControls(settings.inputControls),configSource=settings.inputControls;
 const state=()=>{try{return api.getState();}catch{return {system:'gba',active:false,paused:true};}};
 const configuration=()=>{if(settings.inputControls!==configSource){config=sanitizeInputControls(settings.inputControls);configSource=settings.inputControls;}return config;};
 const mapping=(system,device)=>{const p=configuration().profiles[validSystem(system)];return {...p?.[device]??p?.[device==='keyboard'?'keyboard':'gamepad']??defaultBindings(system,device)};};
 const assist=system=>configuration().assist[validSystem(system)]||{interval:100,modes:{}};
 const pads=()=>{try{return [...navigator.getGamepads?.()||[]].filter(p=>p&&p.connected!==false);}catch{return [];}};
 const padInputs=(pad,deadZone=.4)=>{
  const out=[];for(let i=0;i<Math.min(32,pad.buttons?.length||0);i++)if(pad.buttons[i]?.pressed||pad.buttons[i]?.value>.5)out.push('b'+i);
  const zone=typeof deadZone==='number'&&deadZone>=.05&&deadZone<=.95?deadZone:.4;
  for(let i=0;i<Math.min(8,pad.axes?.length||0);i++){if(pad.axes[i]<-zone)out.push('a'+i+'-');if(pad.axes[i]>zone)out.push('a'+i+'+');}return out;
 };
 function release(){
  for(const code of held.keys())blockedKeys.add(code);held.clear();pressed.clear();latched=0;previousRaw=0;starts.clear();
  blockedPads=new Set(pads().flatMap(p=>padInputs(p,state().deadZone).map(code=>p.index+':'+code)));previousPads.clear();
 }
 function save(){settings.inputControls=sanitizeInputControls(config);configSource=settings.inputControls;config=configSource;release();api.saveSettings?.();updateKeys();}
 function runAction(action){const s=state();if(!s.active||s.paused&&action!=='menu'||s.linked&&action!=='menu')return;api.action?.(action);}
 function keyboardMask(){let mask=0;for(const action of held.values())if(keybits[action]!==undefined)mask|=1<<keybits[action];pressed.set('mapped-keyboard',mask);updateKeys();}
 const editable=target=>target?.closest?.('input,textarea,select,[contenteditable=true]');
 function keydown(event){
  if(capture?.device==='keyboard'){
   event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;
   if(event.code==='Escape'){finishCapture(null);return;}if(keyboardCode(event.code)&&!event.metaKey&&!event.ctrlKey&&!event.altKey)finishCapture(event.code);return;
  }
  const s=state();if(!s.active||capture||editable(event.target)||api.ignoreEvent?.(event)||event.ctrlKey||event.altKey||event.metaKey||event.code==='Tab'&&event.shiftKey)return;
  const action=mapping(s.system,'keyboard')[event.code];if(!action||s.paused&&action!=='menu')return;event.preventDefault();
  if(event.repeat||held.has(event.code)||blockedKeys.has(event.code))return;
  held.set(event.code,action);api.unlockAudio?.();if(specialInputs.includes(action)){runAction(action);return;}keyboardMask();
 }
 function keyup(event){blockedKeys.delete(event.code);if(held.delete(event.code)){keyboardMask();}}
 function transform(raw,time=performance.now()){
  const s=state(),system=validSystem(s.system);raw&=0x3fff;
  if(system!==lastSystem||!!s.linked!==lastLinked){latched=0;previousRaw=0;starts.clear();lastSystem=system;lastLinked=!!s.linked;}
  if(!s.active||s.paused||capture){latched=0;previousRaw=0;starts.clear();return 0;}
  if(s.linked){latched=0;previousRaw=raw;starts.clear();return raw;}
  const pref=assist(system);let holdMask=0,turboMask=0;
  for(const [action,mode]of Object.entries(pref.modes)){const bit=1<<keybits[action];if(mode==='hold'||mode==='turboHold')holdMask|=bit;if(mode==='turbo'||mode==='turboHold')turboMask|=bit;}
  const rising=raw&~previousRaw;latched^=rising&holdMask;previousRaw=raw;
  let output=(raw&~holdMask)|(latched&holdMask);
  for(const action of gameInputsFor(system)){const bit=1<<keybits[action];if(!(output&bit)||!(turboMask&bit)){starts.delete(bit);continue;}if(!starts.has(bit))starts.set(bit,time);if((time-starts.get(bit))%pref.interval>=pref.interval/2)output&=~bit;}
  return output;
 }
 function poll(time=performance.now()){
  const s=state(),connected=pads(),ids=connected.map(p=>p.index+':'+deviceKey(p)).join('|');
  if(padIds&&ids!==padIds){release();}padIds=ids;
  const active=new Set();let mask=0,second=0;
  for(const pad of connected)for(const code of padInputs(pad,s.deadZone)){
   const token=pad.index+':'+code;active.add(token);if(blockedPads.has(token))continue;
   if(capture&&capture.device!=='keyboard'&&(capture.device==='gamepad'||capture.device===deviceKey(pad))){if(!previousPads.has(token)){finishCapture(code);return;}continue;}
   if(!s.active||s.paused||capture)continue;
   const action=mapping(s.system,deviceKey(pad))[code];if(specialInputs.includes(action)){if(!previousPads.has(token))runAction(action);}else if(keybits[action]!==undefined){if(player(s.system,deviceKey(pad)+':'+pad.index)===2)second|=1<<keybits[action];else mask|=1<<keybits[action];}
  }
  for(const token of blockedPads)if(!active.has(token))blockedPads.delete(token);previousPads=active;
  pressed.set('mapped-gamepad',mask);pressed.set('mapped-gamepad-2',second);updateKeys(time);
 }
 function player(system,device){
  if(!['nes','snes','md'].includes(system))return 1;
  const stored=configuration().players?.[system]?.[device];if(stored)return stored;
  const index=pads().findIndex(p=>deviceKey(p)+':'+p.index===device);return index===1?2:1;
 }
 function finishCapture(code){if(!capture)return;const done=capture.done;capture=null;cancelAnimationFrame(captureFrame);release();updateKeys();done(code);}
 function startCapture(device,done){if(!deviceCode(device))return;finishCapture(null);release();capture={device,done};
  const tick=()=>{if(!capture||destroyed)return;if(device!=='keyboard')poll();if(capture)captureFrame=requestAnimationFrame(tick);};captureFrame=requestAnimationFrame(tick);
 }
 const onBlur=()=>{finishCapture(null);release();updateKeys();},onVisibility=()=>{if(document.hidden)onBlur();};
 window.addEventListener('keydown',keydown,true);window.addEventListener('keyup',keyup,true);window.addEventListener('blur',onBlur);window.addEventListener('gamepaddisconnected',onBlur);document.addEventListener('visibilitychange',onVisibility);
 return {
  poll,transform,release,player,
  playerDevices:system=>[{key:'touch',name:tr('画面ボタン')},{key:'keyboard',name:tr('キーボード')},...pads().map(p=>({key:deviceKey(p)+':'+p.index,name:String(p.id||tr('ゲームパッド')).slice(0,100)+' #'+(p.index+1)}))].map(d=>({...d,player:player(system,d.key)})),
  assignPlayer(system,device,value){if(!['nes','snes','md'].includes(system)||![1,2].includes(value))return;(config.players??={})[system]??={};config.players[system][device]=value;save();},
  capture:startCapture,cancelCapture:()=>finishCapture(null),isCapturing:()=>!!capture,
  devices:()=>[{key:'keyboard',name:tr('キーボード')},{key:'gamepad',name:tr('ゲームパッド（共通）')},...pads().map(p=>({key:deviceKey(p),name:String(p.id||tr('ゲームパッド')).slice(0,100)})).filter((p,i,list)=>list.findIndex(x=>x.key===p.key)===i)],
  bindings:(system,device)=>mapping(validSystem(system),device),assist:system=>structuredClone(assist(validSystem(system))),
  assign(system,device,action,code){system=validSystem(system);if(!deviceCode(device)||![...gameInputsFor(system),...specialInputs].includes(action)||code!==null&&!(device==='keyboard'?keyboardCode(code):padCode(code)))return false;
   config=configuration();const map=mapping(system,device);for(const input of Object.keys(map))if(map[input]===action)delete map[input];if(code!==null)map[code]=action;
   const profiles=config.profiles[system]??={};if(!Object.hasOwn(profiles,device)&&Object.keys(profiles).length>=16)delete profiles[Object.keys(profiles).find(k=>!['keyboard','gamepad'].includes(k))];profiles[device]=map;save();return true;
  },
  reset(system,device){if(!deviceCode(device))return;system=validSystem(system);config=configuration();(config.profiles[system]??={})[device]=defaultBindings(system,device);save();},
  setAssist(system,action,mode){system=validSystem(system);if(!gameInputsFor(system).includes(action)||!assistModes.some(([id])=>id===mode))return;config=configuration();const pref=structuredClone(assist(system));if(mode==='off')delete pref.modes[action];else pref.modes[action]=mode;config.assist[system]=pref;save();},
  setInterval(system,interval){if(!Number.isInteger(interval)||interval<50||interval>1000)return;system=validSystem(system);config=configuration();config.assist[system]={...assist(system),interval};save();},
  destroy(){destroyed=true;finishCapture(null);release();window.removeEventListener('keydown',keydown,true);window.removeEventListener('keyup',keyup,true);window.removeEventListener('blur',onBlur);window.removeEventListener('gamepaddisconnected',onBlur);document.removeEventListener('visibilitychange',onVisibility);}
 };
}
