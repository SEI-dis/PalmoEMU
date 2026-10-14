// SPDX-License-Identifier: AGPL-3.0-or-later
// API availability is detectable; a physical vibration motor is not.
import {tr} from '../i18n/index.js';
export const supportsHaptics=()=>typeof navigator.vibrate==='function';
export function tapHaptic(settings){
  if(!settings.haptics||!supportsHaptics()||document.hidden)return false;
  const duration=settings.hapticStrength===20?20:8;
  try{return navigator.vibrate(duration)!==false;}catch{return false;}
}
export function stopHaptics(){if(supportsHaptics())try{navigator.vibrate(0);}catch{}}
export function hapticNote(){return supportsHaptics()?tr('対応端末で振動します。端末設定により動作しない場合があります。'):tr('このブラウザは振動に対応していません。');}
