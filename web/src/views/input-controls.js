// SPDX-License-Identifier: AGPL-3.0-or-later
// Original Web settings UI following ManicEMU/Delta's choose-action then
// capture-controller-input interaction. No native assets or source are copied.
import {tr} from '../i18n/index.js';
import {systems,escapeHTML as esc} from '../shared.js';
import {row,nativeAction} from '../components/rows.js';
import {gameInputsFor,specialInputs,inputLabels,inputName,assistModes} from '../input-controls.js';
export function createInputControlsView({controls,sheet,onClose,getSystem=()=> 'gba',isPlaying=()=>false}){
 return function showInputControls(initial=getSystem()){
  let system=systems[initial]?initial:'gba',device='keyboard',tab='mapping',alive=true;
  const find=s=>document.querySelector(s);
  const cancel=()=>controls.cancelCapture();
  function render(){
   cancel();const devices=controls.devices(),bindings=controls.bindings(system,device),assist=controls.assist(system);
   if(!devices.some(d=>d.key===device))device='gamepad';
   sheet(tr('コントローラーと操作補助'),tr`<div class="input-controls-view">
    <div class="settings-group">${row(tr('機種'),tr`<select id="input-system" aria-label="機種">${Object.entries(systems).map(([id,s])=>`<option value="${id}" ${system===id?'selected':''}>${s.short}</option>`).join('')}</select>`,'game')}</div>
    <div class="segmented" role="group" aria-label="操作の設定"><button data-input-tab="mapping" aria-pressed="${tab==='mapping'}">ボタン割り当て</button><button data-input-tab="assist" aria-pressed="${tab==='assist'}">連射・押しっぱなし</button></div>
    ${tab==='mapping'?tr`<div class="settings-group">${row(tr('入力機器'),tr`<select id="input-device" aria-label="入力機器">${devices.map(d=>`<option value="${d.key}" ${d.key===device?'selected':''}>${esc(d.name)}</option>`).join('')}</select>`,'game')}</div>
    <p class="sheet-note">変更する操作を選んで、キーやコントローラーのボタンを押してください。同じ機種・入力機器で使用します。</p>
    <div id="input-capture" class="input-capture" hidden><p id="input-capture-status" role="status" aria-live="polite"></p><div class="two"><button class="secondary" id="input-capture-cancel">キャンセル</button><button class="secondary" id="input-capture-clear">割り当てを解除</button></div></div>
    <div class="settings-group">${[...gameInputsFor(system),...specialInputs].map(action=>nativeAction(inputLabels[action],'map-'+action,'game',Object.entries(bindings).filter(([,mapped])=>mapped===action).map(([code])=>inputName(code)).join(' / ')||tr('未設定'))).join('')}</div>
    <button class="secondary" id="input-reset">割り当てを初期設定に戻す</button><p class="sheet-note">ゲームパッドが表示されない場合は、接続してボタンを押してからこの画面を開き直してください。</p>`:
    tr`<p class="sheet-note">タッチ・キーボード・ゲームパッドに適用します。「押しっぱなし」は一度押すと固定し、もう一度押すと解除します。一時停止や切断でも解除します。通信中は通常操作になります。</p>
    <div class="settings-group">${row(tr('連射の間隔'),tr`<select id="input-turbo-interval" aria-label="連射の間隔">${[50,75,100,150,200,300,500,1000].map(n=>tr`<option value="${n}" ${assist.interval===n?'selected':''}>${n} ms（毎秒${(1000/n).toFixed(n===300?1:0)}回）</option>`).join('')}</select>`,'bolt')}</div>
    <div class="settings-group">${gameInputsFor(system).map(action=>row(inputLabels[action],tr`<select data-input-assist="${action}" aria-label="${esc(inputLabels[action])}の操作補助">${assistModes.map(([mode,name])=>`<option value="${mode}" ${(assist.modes[action]||'off')===mode?'selected':''}>${name}</option>`).join('')}</select>`,'game')).join('')}</div>`}
    </div>`,isPlaying());
   alive=true;onClose(()=>{alive=false;cancel();});
   find('#input-system').onchange=e=>{system=e.target.value;render();};
   document.querySelectorAll('[data-input-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.inputTab;render();});
   if(tab==='mapping'){
    find('#input-device').onchange=e=>{device=e.target.value;render();};
    find('#input-reset').onclick=()=>{controls.reset(system,device);render();};
    document.querySelectorAll('[data-action^="map-"]').forEach(button=>button.onclick=()=>{
     cancel();const action=button.dataset.action.slice(4),panel=find('#input-capture');panel.hidden=false;
     find('#input-capture-status').textContent=tr`${inputLabels[action]}：${device==='keyboard'?tr('キー'):tr('コントローラーのボタン・スティック')}を押してください（Escでキャンセル）`;
     panel.scrollIntoView({block:'nearest'});controls.capture(device,code=>{if(!alive)return;if(code!==null){controls.assign(system,device,action,code);render();}else panel.hidden=true;});
     find('#input-capture-cancel').onclick=cancel;
     find('#input-capture-clear').onclick=()=>{cancel();controls.assign(system,device,action,null);render();};
    });
   }else{
    find('#input-turbo-interval').onchange=e=>controls.setInterval(system,Number(e.target.value));
    document.querySelectorAll('[data-input-assist]').forEach(select=>select.onchange=()=>controls.setAssist(system,select.dataset.inputAssist,select.value));
   }
  }
  render();
 };
}
