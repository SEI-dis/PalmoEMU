// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {languages} from '../src/i18n/languages.js';
import english from '../src/i18n/locales/en.js';
const keys=Object.keys(english).sort();
const slots=text=>[...text.matchAll(/⟪\d+⟫/g)].map(m=>m[0]).sort();
const codes=languages.filter(item=>!['ja','en'].includes(item.code)).map(item=>item.code);
for(const code of codes) {
 const {default:messages}=await import(`../src/i18n/locales/${code}.js`);
 assert.deepEqual(Object.keys(messages).sort(),keys,`${code}: catalogue coverage`);
 for(const [key,value] of Object.entries(messages)) {
  assert.equal(typeof value,'string',`${code}: ${key}`);
  assert.ok(value.trim(),`${code}: empty translation`);
  assert.deepEqual(slots(value),slots(key),`${code}: interpolation in ${key}`);
  assert.ok(!/991\d{3}|857[1-9]|858\d|<unk>|<0x[0-9A-F]+>|▁|�/.test(value),`${code}: unfinished translation in ${key}`);
  for(const term of english[key].match(/\b(?:AGPL|MPL|GPL|Apache)-\d\.\d(?:-or-later)?|\b(?:MiB|KiB|MB)\b/g)||[]) {
   assert.ok(value.includes(term),`${code}: preserve ${term} in ${key}`);
  }
 }
}
const {releases}=JSON.parse(fs.readFileSync(new URL('../release-notes.json',import.meta.url)));
for(const entry of releases) {
 assert.deepEqual(Object.keys(entry.translations).sort(),[...codes].sort(),`${entry.version}: release languages`);
}
console.log(`PASS: ${languages.length} languages, ${keys.length} messages per catalogue, placeholders and release notes.`);
