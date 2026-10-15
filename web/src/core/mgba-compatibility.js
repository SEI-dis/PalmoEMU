// SPDX-License-Identifier: AGPL-3.0-or-later
// Runtime-only correction for a structurally verified blank-flash alias test.
// No ROM, save, or game source is distributed. See the compatibility section in README.md.
import {tr} from '../i18n/index.js';
import {findExtendedSaveProbe} from './mgba-save-probe.js';
import {allocateCoreMemory,romSizeClass,wasmMemoryBytes,withAllocation} from '../runtime/memory-diagnostics.js';

export async function loadCompatibleMGBA(m,bytes){
  // Work on the core's temporary copy, not the caller's bytes or IndexedDB.
  // Checking and loading this same copy also avoids trusting a stale library ID.
  const romClass=romSizeClass(bytes.length),p=allocateCoreMemory(m,bytes.length,'rom-load',romClass);
  let transferred=false;
  try{
    m.HEAPU8.set(bytes,p);
    const correction=findExtendedSaveProbe(m.HEAPU8.subarray(p,p+bytes.length));
    // New bridges consume the temporary allocation on success AND failure.
    // Query the compiled capability first: there is no second ROM copy/load.
    if(typeof m._web_load_owned==='function'&&typeof m._web_gba_save_capacity==='function'){
      const limit=correction?m._web_gba_save_capacity():0;
      const apply=!!correction&&Number.isFinite(limit)&&limit>=correction.requiredSaveBytes;
      if(apply)m.HEAPU8[p+correction.offset]=1;
      transferred=true;
      const memoryBytesBefore=wasmMemoryBytes(m);
      const result=m._web_load_owned(p,bytes.length);
      if(result===-1)throw withAllocation(new Error(tr('メモリを確保できませんでした。')),{operation:'rom-load',reason:'native-init',memoryBytesBefore,romSizeClass:romClass});
      if(result!==1)throw new Error(tr('このROMを読み込めませんでした。形式を確認してください。'));
      return apply?'expanded-save-detection':null;
    }
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
  }finally{if(!transferred)m._free(p);}
}
