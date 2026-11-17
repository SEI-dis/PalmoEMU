// SPDX-License-Identifier: AGPL-3.0-or-later
// Synthetic ROM gates and saves only; exercise the real Worker/storage UI.
const run=require('./start-save-format-browser.cjs');
module.exports=()=>run([[71,1,'0.49.0'],[71,1,'0.59.5'],[71,1,'0.62.0']]);
if(require.main===module)module.exports().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
