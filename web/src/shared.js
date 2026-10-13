// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from './i18n/index.js';
import {development3DS} from './development.js';
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
const paths={
 camera:'M3 6h4l2-3h6l2 3h4v15H3V6Zm9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
 wifi:'M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0m-4 4h.01',
 copy:'M9 8h11v13H9V8ZM5 16H3V3h11v2',
 info:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v6m0-10h.01',
 pencil:'m4 16-1 5 5-1L21 7l-4-4L4 16Zm10-10 4 4M4 16l4 4',
 starCircle:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4 1.8 3.7 4.2.6-3 2.9.7 4.1-3.7-2-3.7 2 .7-4.1-3-2.9 4.2-.6L12 6Z',
 arrowUpRight:'M6 18 18 6M6 6h12v12',
 shirt:'m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4c0 4-8 4-8 0Z',
 state:'M4 3h12l4 4v5M16 3v5h4M7 7h5M7 11h4M4 3v18h7m0-5s3-4 6-4 6 4 6 4-3 4-6 4-6-4-6-4Zm6-1a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',
 saveImport:'M8 6h3l2 3h8v12H3v-7M3 10h11m-4-4 4 4-4 4',
 saveExport:'M3 8V5h8l2 3h8v12H10M3 15h11m-7-4-4 4 4 4',
 core:'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm-7-7c-4 4 10 22 14 18S9-1 5 3Zm14 0c4 4-10 22-14 18S15-1 19 3Z',
 code:'M5 2h10l4 4v16H5V2Zm10 0v5h4M10 11l-3 3 3 3m4-6 3 3-3 3',
 book:'M5 3h14v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm-2 14h16M8 7h6',
 fast:'m2 5 9 7-9 7V5Zm11 0 9 7-9 7V5Z',
 haptic:'M7 3h10v18H7V3ZM3 7l-2 3 2 2-2 2 2 3m18-10 2 3-2 2 2 2-2 3',
 joystick:'M12 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 6v7M5 17h14l2 4H3l2-4Z',
 layers:'m12 2 10 6-10 6L2 8l10-6ZM2 12l10 6 10-6M2 16l10 6 10-6',
 shortcuts:'M8 8H5a3 3 0 1 1 3-3v14a3 3 0 1 1-3-3h14a3 3 0 1 1-3 3V5a3 3 0 1 1 3 3H8Z',
 link:'m9 15 6-6m-7 3-2 2a4 4 0 0 0 6 6l3-3m-6-9 3-3a4 4 0 0 1 6 6l-2 2',
 share:'M14 3h7v7m0-7L10 14m1-10a9 9 0 1 0 9 9',
 hide:'M3 3l18 18M9 5a12 12 0 0 1 13 7 15 15 0 0 1-4 5M6 6a15 15 0 0 0-4 6 12 12 0 0 0 13 7M9 9a4 4 0 0 0 6 6',
 power:'M12 3v9M7 5a9 9 0 1 0 10 0',
 reload:'M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 2M4 17l2 2a8 8 0 0 0 13-3',
 game:'M6 8h12c2 0 3 2 3 4l1 5c.4 2-1.5 3-3 2l-3-2H8l-3 2c-1.5 1-3.4 0-3-2l1-5c0-2 1-4 3-4ZM7 11v5m-2.5-2.5h5m6-1h.01m3 3h.01',
 import:'M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5', settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Zm3 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
 history:'M3 4v6h6M3 10a9 9 0 1 1 0 5m9-8v6l4 2',search:'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM16 16l5 5',
 plus:'M12 4v16M4 12h16',close:'m6 6 12 12M6 18 18 6',chevron:'m9 5 7 7-7 7',play:'m8 4 12 8-12 8V4Z',pause:'M8 5v14M16 5v14',
 heart:'M12 21 3 12C-2 5 7-1 12 6c5-7 14-1 9 6l-9 9Z',more:'M5 12h.01M12 12h.01M19 12h.01',folder:'M3 6h7l2 3h9v11H3V6Z',
 save:'M4 3h13l4 4v14H3V3h1Zm3 0v7h10V3M7 21v-7h10v7',volume:'M3 9h4l5-5v16l-5-5H3V9Zm13-2a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16',
 expand:'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M9 10v7m6-7v7',
 image:'M3 3h18v18H3V3Zm0 14 6-6 4 4 3-3 5 5M15 7h.01',check:'m4 12 5 5L20 6',back:'m14 5-7 7 7 7',bolt:'m13 2-9 12h7l-1 8 10-13h-7l1-7Z'};
export const icon=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.game}"/></svg>`;
