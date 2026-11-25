// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from './i18n/index.js';
import {lucideIcons} from '../vendor/lucide/icons.js';
import {development3DS} from './core/development.js';
export const systems = {
  ...(development3DS?{'3ds':{name:tr('ニンテンドー3DS（開発版）'),short:'3DS',core:'azahar',ext:['3ds','cci','cxi','3dsx'],color:'#d85569'}}:{}),
  nds:{name:tr('ニンテンドーDS'),short:'NDS',core:'desmume2015',ext:['nds'],color:'#a5adbb'},
  gba:{name:'Game Boy Advance',short:'GBA',core:'mgba64',ext:['gba'],color:'#7984ff'},
  gb:{name:'Game Boy',short:'GB',core:'mgba64',ext:['gb'],color:'#b4c596'},
  gbc:{name:'Game Boy Color',short:'GBC',core:'mgba64',ext:['gbc'],color:'#ff9762'},
  nes:{name:tr('ファミリーコンピュータ'),short:'FC',core:'fceumm',ext:['nes'],color:'#ed536a'},
  snes:{name:tr('スーパーファミコン'),short:'SFC',core:'mesen-s',ext:['sfc','smc'],color:'#06d58f'},
  md:{name:tr('メガドライブ'),short:'MD',core:'clownmdemu',ext:['md','gen','smd','bin'],color:'#33a9ff'}
};
export function detectSystem(name){const ext=name.toLowerCase().split('.').pop();return Object.keys(systems).find(k=>systems[k].ext.includes(ext));}
export function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export const bytesLabel=n=>n>=1048576?`${(n/1048576).toFixed(n%1048576?1:0)} MB`:`${Math.ceil(n/1024)} KB`;
export async function hash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}
const iconNames={
 camera:'camera',wifi:'wifi',copy:'copy',info:'info',pencil:'pencil',starCircle:'circle-star',arrowUpRight:'arrow-up-right',
 shirt:'shirt',state:'file-clock',saveImport:'file-input',saveExport:'file-output',core:'cpu',code:'code',book:'book-open',
 fast:'fast-forward',haptic:'vibrate',joystick:'joystick',layers:'layers',shortcuts:'command',link:'link',share:'share-2',hide:'eye-off',
 power:'power',reload:'refresh-cw',game:'gamepad-2',import:'download',settings:'settings',history:'rotate-ccw-clock',search:'search',
 arrowUp:'arrow-up',arrowDown:'arrow-down',record:'circle',stop:'square',grip:'grip-horizontal',chevronDown:'chevron-down',
 plus:'plus',close:'x',chevron:'chevron-right',play:'play',pause:'pause',heart:'heart',more:'ellipsis',folder:'folder',save:'save',
 volume:'volume-2',expand:'maximize',trash:'trash',image:'image',check:'check',back:'chevron-left',bolt:'zap'
};
export const icon=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${lucideIcons[iconNames[name]]||lucideIcons['gamepad-2']}</svg>`;
