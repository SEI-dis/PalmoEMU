// SPDX-License-Identifier: AGPL-3.0-or-later
const assert=require('node:assert/strict');
(async()=>{
 const {validateUpdate,validateChanges}=await import('../scripts/core-auto.mjs');
 const base='a'.repeat(40),upstream='b'.repeat(40);
 const checks=Object.fromEntries(['local-patches','license-policy','build','corresponding-source','synthetic-core','upgrade-compatibility','mgba-rom128','mgba-hgx','mgba-memory','mgba-logging','mgba-allocation','mgba-save-completion','mgba-peripherals','gb-link-core'].map(name=>[name,true]));
 const report={status:'verified',candidateCommit:upstream,checks,adoption:{baseCommit:base,automatic:true,policy:'preserve-local-patches-and-compatible-saves-v1'}};
 assert.equal(validateUpdate(report,{base,upstream}),report);
 for(const key of Object.keys(checks)){const bad=structuredClone(report);bad.checks[key]=false;assert.throws(()=>validateUpdate(bad));delete bad.checks[key];assert.throws(()=>validateUpdate(bad));}
 // Pre-rom128 reports must not pass promotion merely because every present
 // check is true. The adopted capacity requires its own successful check.
 const withoutCapacity=structuredClone(report);delete withoutCapacity.checks['mgba-rom128'];
 assert.throws(()=>validateUpdate(withoutCapacity,{base,upstream}),/checks are incomplete/);
 assert.throws(()=>validateUpdate(report,{base:'c'.repeat(40)}));
 assert.throws(()=>validateUpdate({...report,status:'checking'}));
 assert.throws(()=>validateUpdate({...report,adoption:{...report.adoption,automatic:false}}));
 validateChanges(['web/cores/mgba/mgba.wasm','web/SOURCES.json']);
 for(const names of [[],['.github/workflows/ci.yml'],['web/src/app.js'],['../file']])assert.throws(()=>validateChanges(names));
 console.log('PASS: core adoption requires exact identity, complete checks and bounded changes.');
})().catch(error=>{console.error(error);process.exitCode=1;});
