// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';
import {nativeSelect} from '../manic-ui.js';
export function showGBAOptions({sheet,engine,settings,applySettings,toast,onClose}){
 const sliders=[['tiltX',tr('左右の傾き')],['tiltY',tr('前後の傾き')],['gyro',tr('回転')]];
 sheet(tr('GBAカートリッジ'),tr`<div class="settings-group">${nativeSelect(tr('CPU速度'),'overclock','bolt',[[1,tr('標準')],[2,'2×'],[4,'4×'],[8,'8×']],settings.overclock||1)}${nativeSelect(tr('太陽センサー'),'sunlight','image',Array.from({length:11},(_,i)=>[i,String(i)]),settings.sunlight||0)}</div><p class="sheet-note">CPU速度を上げると負荷が増えます。通信中は標準速度になります。センサーは対応ゲームで使えます。</p><div class="settings-group">${sliders.map(([key,label])=>`<label class="row"><span>${label}</span><input type="range" data-sensor="${key}" aria-label="${label}" min="-1" max="1" step=".05" value="${settings[key]||0}"></label>`).join('')}</div><button class="secondary" id="motion-toggle"></button>`,true);
 document.querySelector('#sheet').classList.add('native-menu');
 const button=document.querySelector('#motion-toggle'),render=()=>{button.textContent=engine.sensors.enabled?tr('端末の傾きを使わない'):tr('端末の傾きを使う');document.querySelectorAll('[data-sensor]').forEach(el=>el.disabled=engine.sensors.enabled);};render();
 document.querySelectorAll('[data-setting],[data-sensor]').forEach(el=>el.onchange=()=>{settings[el.dataset.setting||el.dataset.sensor]=Number(el.value);const value=el.closest('.native-select')?.querySelector('.native-value');if(value)value.textContent=el.selectedOptions[0].textContent;applySettings();});
 let closed=false;onClose(()=>{closed=true;});button.onclick=async()=>{button.disabled=true;try{if(engine.sensors.enabled)engine.sensors.disable();else if(!await engine.sensors.enable())toast(tr('端末の傾きを取得できません。スライダーで調整できます。'));if(!closed)render();}catch{if(!closed)toast(tr('端末の傾きを取得できません。スライダーで調整できます。'));}finally{button.disabled=false;}};
}
