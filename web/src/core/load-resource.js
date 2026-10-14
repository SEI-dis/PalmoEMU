// SPDX-License-Identifier: AGPL-3.0-or-later
import {tr} from '../i18n/index.js';

// Wrap only JS/Wasm initialization. Invalid ROMs and incompatible/corrupt saves
// must keep their own recovery path rather than be presented as update failures.
export async function loadCoreResource(load){
 try{return await load();}
 catch(cause){throw Object.assign(new Error(tr('コアを読み込めませんでした。'),{cause}),{code:'CORE_LOAD_FAILED'});}
}
