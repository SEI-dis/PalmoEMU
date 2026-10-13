// SPDX-License-Identifier: AGPL-3.0-or-later
import {MANIFEST} from '../vendor/start-save-migrate/manifest.js';

// Evidence: PokemonStart CHANGELOG.md, v0.42.3 (0.38.x+ can be read directly)
// and v0.40.0 (saves older than 0.36.2 cannot continue).
// https://github.com/pm-start/PokemonStart/blob/7563326f48f795d89b726a05ca1455d5bf9d7217/CHANGELOG.md
// Conversion coverage is not proof that conversion is necessary. Do not extend
// this policy to future targets just because the converter manifest grows.
const versions=MANIFEST.versions.map(entry=>entry.version);
export function startSaveCompatibility(from,to='0.42.3'){
 const index=versions.indexOf(from);
 let status='unknown';
 if(to==='0.42.3'&&index>=0){
  if(index>=versions.indexOf('0.38.0')&&index<=versions.indexOf('0.42.3'))status='compatible';
  else if(index<versions.indexOf('0.36.2'))status='convert';
 }
 return {status,from:from||null,to};
}
