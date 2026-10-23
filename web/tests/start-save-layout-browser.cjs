// SPDX-License-Identifier: AGPL-3.0-or-later
// Reuse the actual ROM-update/Worker/backup assertions for the 16MiB boundary.
require('./start-save-format-browser.cjs')([[59,0,'0.49.0'],[59,0,'0.57.0']])
 .then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
