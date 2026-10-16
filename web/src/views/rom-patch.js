// SPDX-License-Identifier: AGPL-3.0-or-later
// Local file flow following ManicEMU RomPatcherView; no ROM is uploaded.
import {tr} from '../i18n/index.js';
import {applyROMPatch} from '../library/rom-patch.js';
import {guardUpdateTask} from '../updates/update-activity.js';
export function showROMPatch({sheet,onClose,download,error}){
 sheet(tr('ROMパッチ'),tr('<p class="sheet-note">IPS・BPS・UPSに対応。元のROMとセーブは変更しません。</p><div class="settings-group"><label class="row"><span>元のROM</span><input id="patch-rom" type="file"></label><label class="row"><span>パッチ</span><input id="patch-file" type="file"></label></div><p class="sheet-note">各64 MiBまで。IPSにはROMの一致確認がありません。パッチ作者の指定するROMを選んでください。</p><button class="primary" id="apply-patch" disabled>適用して保存</button>'));
 const rom=document.querySelector('#patch-rom'),patch=document.querySelector('#patch-file'),button=document.querySelector('#apply-patch'),controller=new AbortController();let closed=false;
 onClose(()=>{closed=true;controller.abort();});rom.onchange=patch.onchange=()=>{button.disabled=!rom.files.length||!patch.files.length;};
 button.onclick=guardUpdateTask(async()=>{button.disabled=true;rom.disabled=patch.disabled=true;button.textContent=tr('適用中…');try{const file=rom.files[0];let bytes=await applyROMPatch(file,patch.files[0],{signal:controller.signal});if(!closed){const task=download(bytes,file.name.replace(/(\.[^.]+)?$/,'.patched$1'));bytes=null;await task;}}catch(e){if(!closed)error(e);}finally{if(!closed){rom.disabled=patch.disabled=false;button.disabled=false;button.textContent=tr('適用して保存');}}});
}
