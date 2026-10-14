// SPDX-License-Identifier: AGPL-3.0-or-later
// Include worker/asset bases and HTML entry points, not just ESM imports.
const path=require('node:path');
require('./build-diagnostic-sources.cjs').buildDiagnosticSources(path.resolve(__dirname,'..'),{check:true});
(async()=>{
 const {checkModuleLinks}=await import('./lib/module-links.mjs');
 const {modules,resources,dynamicBases}=checkModuleLinks(path.resolve(__dirname,'..'));
 console.log(`PASS: ${modules} module imports, ${resources} resource/worker links, ${dynamicBases} dynamic asset bases.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
