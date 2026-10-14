// SPDX-License-Identifier: AGPL-3.0-or-later
// Original ROM-free browser input inspector; does not dispatch game actions.
import {tr} from '../i18n/index.js';
import {gameInputsFor,inputLabels} from '../input/input-controls.js';
import {builtinDpadDirections} from '../input/dpad-input.js';
import {configureBuiltinTouchTargets} from '../input/touch-targets.js';
import {createSkinPointers} from '../skins/skin-pointers.js';
const directions=['up','down','left','right'];
export function inputTestMarkup(system){
 return tr`<p class="sheet-note">キーやゲームパッド、下の画面ボタンを押して確認できます。ゲームは動きません。</p><div class="input-test-preview">
 <button class="skin-button input-test-dpad" aria-label="十字キー">${directions.map(action=>`<span data-test-action="${action}" class="input-test-direction input-test-${action}">${inputLabels[action]}</span>`).join('')}</button>
 <div class="input-test-buttons">${gameInputsFor(system).filter(action=>!directions.includes(action)).map(action=>`<button class="skin-button input-test-button" data-test-button="${action}" data-test-action="${action}">${inputLabels[action]}</button>`).join('')}</div></div>
 <p class="input-test-status" id="input-test-status" role="status" aria-live="polite">入力なし</p><p class="sheet-note input-test-devices" id="input-test-devices"></p>`;
}
export function mountInputTest({container,controls,system,settings={}}){
 const session=controls.startTest(system,snapshot=>{
  for(const element of container.querySelectorAll('[data-test-action]'))element.classList.toggle('input-test-active',snapshot.actions.includes(element.dataset.testAction));
  container.querySelector('#input-test-status').textContent=snapshot.actions.length?snapshot.actions.map(action=>inputLabels[action]||action).join(' + '):tr('入力なし');
  container.querySelector('#input-test-devices').textContent=[snapshot.keyboard.join(' + '),...snapshot.gamepads.map(pad=>pad.name+(pad.inputs.length?'：'+pad.inputs.join(' + '):''))].filter(Boolean).join(' / ');
 });
 const pointers=createSkinPointers(),preview=container.querySelector('.input-test-preview');
 for(const button of preview.querySelectorAll('.skin-button')){
  const input=event=>{const rect=button.getBoundingClientRect();session.setTouch(event.pointerId,button.dataset.testButton?[button.dataset.testButton]:builtinDpadDirections((event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height,settings));};
  button.onpointerdown=event=>{if(event.button>0)return;event.preventDefault();pointers.start(button,event,{move:button.dataset.testButton?undefined:input,end:()=>session.setTouch(event.pointerId,[])});input(event);};
 }
 configureBuiltinTouchTargets(preview,settings);
 return ()=>{configureBuiltinTouchTargets(preview,null);pointers.destroy();session.stop();};
}
