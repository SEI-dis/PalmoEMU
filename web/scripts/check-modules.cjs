// SPDX-License-Identifier: AGPL-3.0-or-later
// Check local module links after moving UI components. No build dependency.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');let count=0;
function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
 const file=path.join(dir,entry.name);if(entry.isDirectory()){scan(file);continue;}
 if(!/\.m?js$/.test(entry.name))continue;
 const text=fs.readFileSync(file,'utf8');
 for(const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"](\.[^'"\n]+)['"]/g)){
  const target=path.resolve(path.dirname(file),match[1]);
  assert.ok(target.startsWith(root+path.sep),'Module outside web root: '+file);
  assert.ok(fs.statSync(target).isFile(),'Missing module: '+file+' → '+match[1]);count++;
 }
}}
scan(path.join(root,'src'));console.log(`PASS: ${count} local module imports resolve.`);
