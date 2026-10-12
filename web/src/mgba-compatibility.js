// SPDX-License-Identifier: AGPL-3.0-or-later
// Runtime-only correction for PokemonStart v0.40.0's blank-flash alias test.
// No ROM, save, or game source is distributed. See the compatibility section in README.md.
import {tr} from './i18n/index.js';
const correction=Object.freeze({
  id:'expanded-save-detection-v040',
  sha256:'74bfec1e57712f505a303fd1a0ad3e8977b05b86ff12c17952af16553249ce8a',
  size:64*1024*1024,
  offset:0x10d3a36,
  requiredSaveBytes:6*1024*1024
});

async function matches(bytes){
  if(bytes.length!==correction.size||bytes[correction.offset]!==0||bytes[correction.offset+1]!==0x20)return false;
  if(!globalThis.crypto?.subtle)return false;
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('')===correction.sha256;
}

export async function loadCompatibleMGBA(m,bytes){
  // Work on the core's temporary copy, not the caller's bytes or IndexedDB.
  // Checking and loading this same copy also avoids trusting a stale library ID.
  const p=m._malloc(bytes.length);
  if(!p)throw new Error(tr('メモリを確保できませんでした。'));
  try{
    m.HEAPU8.set(bytes,p);
    const known=await matches(m.HEAPU8.subarray(p,p+bytes.length));
    const load=()=>{if(!m._web_load(p,bytes.length))throw new Error(tr('このROMを読み込めませんでした。形式を確認してください。'));};
    load();
    // Query the loaded core before altering even its temporary ROM. No emulated
    // frames, user saves, or states have run/loaded yet. Unknown cores stay intact.
    const limit=known?m._web_save_limit?.():0;
    if(!known||!Number.isFinite(limit)||limit<correction.requiredSaveBytes)return null;
    // Only the equality-result changes: distinct blank banks must not be
    // classified as aliased banks on a verified extended-flash core. All other
    // game checks remain intact. Reload before executing the first instruction.
    // Reacquire HEAPU8: web_load may have grown/detached the previous WASM view.
    m.HEAPU8[p+correction.offset]=1;
    load();
    return correction.id;
  }finally{m._free(p);}
}
