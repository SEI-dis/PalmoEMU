// SPDX-License-Identifier: AGPL-3.0-or-later
// PalmoEMU facade only. The format implementation has separate provenance and
// project-specific permission in vendor/start-save-format/README.md.
import {inspectFormatSave as inspect,convertFormatSave as convert} from '../../vendor/start-save-format/engine.js';
import {tr} from '../i18n/index.js';
export {containsFormatL} from '../../vendor/start-save-format/engine.js';
function localized(error){
 if(error?.name==='AbortError')return error;
 const code=error?.code;
 if(!code?.startsWith('START_FORMAT_'))return error;
 const message=code==='START_FORMAT_SIZE'?tr('128KiB・6MiBの通常セーブを選択してください。'):code==='START_FORMAT_INPUT'?tr('通常セーブのデータを選択してください。'):code==='START_FORMAT_SELECTION'||code==='START_FORMAT_EMPTY'?tr('有効なセーブを選択してください。'):code==='START_FORMAT_OUTPUT'?tr('移行結果の検証に失敗しました。原本は変更されていません。'):tr('セーブを変換できませんでした。元のデータは残っています。');
 const translated=new Error(message,{cause:error});translated.code=code;if(error.slot!==undefined)translated.slot=error.slot;return translated;
}
export function inspectFormatSave(bytes){try{return inspect(bytes);}catch(error){throw localized(error);}}
export async function convertFormatSave(bytes,options={}){try{return await convert(bytes,options);}catch(error){throw localized(error);}}
