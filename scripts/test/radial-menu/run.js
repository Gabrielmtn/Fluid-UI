// Runs the three radial menu checks one after another:
//   node scripts/test/radial-menu/run.js
// Each boots its own headless Chrome and serves the repo itself, so nothing
// else has to be running. Exit code 1 if any check failed.
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
let failed = 0;
['wheel.js', 'settings.js', 'regressions.js'].forEach((f) => {
    console.log('');
    console.log('== ' + f + ' ==');
    const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
    if (r.status !== 0) failed++;
});
process.exit(failed ? 1 : 0);
