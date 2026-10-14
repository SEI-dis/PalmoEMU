// SPDX-License-Identifier: AGPL-3.0-or-later
// Runtime-only correction for a structurally verified blank-flash alias test.
// No ROM, save, or game source is distributed. See the compatibility section in README.md.
import {tr} from '../i18n/index.js';
import {findExtendedSaveProbe} from './mgba-save-probe.js';

export async function loadCompatibleMGBA(m,bytes){
  // Work on the core's temporary copy, not the caller's bytes or IndexedDB.
  // Checking and loading this same copy also avoids trusting a stale library ID.
  const p=m._malloc(bytes.length);
  if(!p)throw new Error(tr('メモリを確保できませんでした。'));
  try{
    m.HEAPU8.set(bytes,p);
    const correction=findExtendedSaveProbe(m.HEAPU8.subarray(p,p+bytes.length));
    const load=()=>{if(!m._web_load(p,bytes.length))throw new Error(tr('このROMを読み込めませんでした。形式を確認してください。'));};
    load();
    // Query the loaded core before altering even its temporary ROM. No emulated
    // frames, user saves, or states have run/loaded yet. Unknown cores stay intact.
    const limit=correction?m._web_save_limit?.():0;
    if(!correction||!Number.isFinite(limit)||limit<correction.requiredSaveBytes)return null;
    // Only the equality-result changes: distinct blank banks must not be
    // classified as aliased banks on a verified extended-flash core. All other
    // game checks remain intact. Reload before executing the first instruction.
    // Reacquire HEAPU8: web_load may have grown/detached the previous WASM view.
    m.HEAPU8[p+correction.offset]=1;
    load();
    return 'expanded-save-detection';
  }finally{m._free(p);}
}
