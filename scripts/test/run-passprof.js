// ═══════════════════════════════════════════════════════════════════
// scripts/test/run-passprof.js — where does the frame actually go?
//
// run-perf.js says whether a tier fits. This says what it is spending on,
// pass by pass, so an optimisation can be aimed rather than guessed.
//
// Same protocol as run-perf.js and for the same reasons — vsync off, one
// instance, scratch document:
//   electron.exe . --remote-debugging-port=9333 \
//                  --disable-gpu-vsync --disable-frame-rate-limit
//
// Usage:
//   node scripts/test/run-passprof.js --tier overkill
//   node scripts/test/run-passprof.js --tier overkill --paint
//   node scripts/test/run-passprof.js --tier cinematic,overkill,absurd
//   node scripts/test/run-passprof.js --tier overkill --frames 60
//
// Read the output as PERCENTAGES, not absolute times: one timer query per
// draw call serialises passes the driver would otherwise overlap, so the
// column total runs above what run-perf.js measures for the same tier.
// The shape is what is being measured, not the magnitude.
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const { connect, waitReady } = require('./cdp');

const OUT_DIR = path.join(__dirname, 'results');
const PERF = path.join(__dirname, 'perf-harness.js');
const PROF = path.join(__dirname, 'pass-profiler.js');
const INV = path.join(__dirname, 'inventory', 'shaders.json');

function arg(name, def) {
    const i = process.argv.indexOf('--' + name);
    if (i === -1) return def;
    const v = process.argv[i + 1];
    return (v === undefined || v.startsWith('--')) ? true : v;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
    const port = Number(arg('port', 9333));
    const frames = Number(arg('frames', 40));
    const paint = !!arg('paint', false);
    const tiers = String(arg('tier', 'overkill')).split(',').map(s => s.trim()).filter(Boolean);

    const page = await connect(port);
    await waitReady(page);
    await page.evalFile(PERF);
    // The profiler needs the shader table in the page before it installs.
    const inv = fs.readFileSync(INV, 'utf8');
    await page.eval(`window.__shaderTable = ${inv}; true`);
    const inst = await page.evalFile(PROF);
    if (!inst || inst.error) throw new Error('profiler failed to install: ' + (inst && inst.error));

    const probe = await page.eval('window.__perf.probe()');
    console.log('');
    console.log('═'.repeat(96));
    console.log('  PASS PROFILE — where the frame goes');
    console.log('═'.repeat(96));
    console.log('  GPU  ', probe.renderer || '(unavailable)');
    console.log('  ' + inst.signatures + ' shader signatures loaded, ' + frames + ' frames per tier' +
                (paint ? ', painting' : ', idle'));
    await page.eval('window.__perf.pin({})');

    const out = [];
    for (const tier of tiers) {
        const applied = await page.eval(
            `window.PerfTiers.apply(${JSON.stringify(tier)}, {maxMB: 12000})`);
        if (applied.error) { console.log(`\n  ${tier}: SKIPPED — ${applied.error}`); continue; }
        await sleep(2500); // let the reinit and shader warmup settle

        if (paint) await page.eval('window.__perf.measure({seconds:0.4, warmupSeconds:0, workload:"paint"})');

        const r = await page.eval(
            `window.__passProf.profile(${JSON.stringify({ frames, paint })})`,
            { timeoutMs: 180000 });
        if (paint) await page.eval('window.__perf.painterStop()');
        r.tier = tier;
        out.push(r);
        print(r);
    }

    await page.eval('window.PerfTiers.reset()');
    await page.eval('window.__perf.restore()');

    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = arg('json', null) ||
        path.join(OUT_DIR, 'passprof-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
    fs.writeFileSync(file, JSON.stringify({ when: new Date().toISOString(), machine: probe, runs: out }, null, 2));
    console.log('\n  report → ' + path.relative(process.cwd(), file) + '\n');
    page.close();
    process.exit(0);
}

function print(r) {
    const st = r.state || {};
    console.log('');
    console.log('─'.repeat(96));
    console.log(`  ${r.tier}  —  dye ${st.dyeLive}  sim ${st.simLive}  oversample x${st.oversample}` +
                `  buffer ${st.buffer}  (${r.frames} frames)`);
    console.log('─'.repeat(96));
    console.log('  ' + 'pass'.padEnd(20) + 'ms/frame'.padStart(10) + '%'.padStart(7) +
                'draws/f'.padStart(9) + 'Mtexel/f'.padStart(10) + '  resolutions ×per-frame');
    let shown = 0;
    for (const row of r.rows) {
        if (row.msPerFrame < 0.005 && shown > 14) continue;
        shown++;
        console.log('  ' + row.pass.padEnd(20) +
            row.msPerFrame.toFixed(3).padStart(10) +
            (row.pctOfGpu + '%').padStart(7) +
            String(row.drawsPerFrame).padStart(9) +
            String(row.mtexelsPerFrame).padStart(10) +
            '  ' + row.res.join('  '));
    }
    console.log('  ' + 'TOTAL'.padEnd(20) + r.totalMsPerFrame.toFixed(3).padStart(10));
    if (r.droppedQueries) console.log(`  (${r.droppedQueries} queries dropped to GPU_DISJOINT)`);
    if (r.unnamed) console.log(`  (${r.unnamed} unnamed pass group — regenerate inventory/shaders.json)`);
}

main().catch(e => { console.error('\n  FAILED: ' + e.message + '\n'); process.exit(1); });
