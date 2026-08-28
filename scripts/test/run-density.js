// ═══════════════════════════════════════════════════════════════════
// scripts/test/run-density.js — does a full canvas cost more than an
// empty one, and if so, which pass?
//
// Every pass in this engine is a fullscreen (or scissored) draw over a
// fixed-size buffer, so to a first approximation the frame should cost
// the same whether the canvas is blank or packed. It does not — dense
// sessions slow down — so something is content-dependent, and only two
// mechanisms can do that on a GPU:
//
//   BRANCHING   a shader that skips work where there is no dye does more
//               work when there is dye everywhere.
//   LOCALITY    semi-Lagrangian advection reads from wherever the
//               velocity field points. Slow flow reads neighbours (cache
//               hits); fast flow reads far away (cache misses). Dense
//               painting also means fast painting, so the two arrive
//               together and have to be separated deliberately.
//
// The separation is the point of this script. Dye and velocity decay at
// very different rates, so letting a canvas SETTLE holds the dye roughly
// still while the velocity field drains away. Comparing the same dye at
// high and low velocity tells the two hypotheses apart:
//
//   settled ≈ active   -> the cost follows DYE       (branching)
//   active  >> settled -> the cost follows VELOCITY  (locality)
//
// Same protocol as the other perf tools — vsync off, one instance:
//   electron.exe . --remote-debugging-port=9333 \
//                  --disable-gpu-vsync --disable-frame-rate-limit
//
// Usage:
//   node scripts/test/run-density.js --tier cinematic
//   node scripts/test/run-density.js --tier overkill --steps 4
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
const HARN = path.join(__dirname, 'harness.js');
const INV = path.join(__dirname, 'inventory', 'shaders.json');

function arg(name, def) {
    const i = process.argv.indexOf('--' + name);
    if (i === -1) return def;
    const v = process.argv[i + 1];
    return (v === undefined || v.startsWith('--')) ? true : v;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Dye and velocity state, so a cost can be plotted against what is
// actually on the canvas rather than against "how long we painted".
const STATE = `(function(){
  var s = window.__test.snapshotState({});
  return { cov: +s.dye.coverage.toFixed(4), dyeMean: +s.dye.mean.toFixed(4),
           dyeMax: +s.dye.max.toFixed(3),
           velMean: +s.vel.mean.toFixed(4), velMax: +s.vel.max.toFixed(3) };
})()`;

async function main() {
    const port = Number(arg('port', 9333));
    const tier = String(arg('tier', 'cinematic'));
    const steps = Number(arg('steps', 3));
    const paintSec = Number(arg('paint', 4));
    const frames = Number(arg('frames', 30));

    const page = await connect(port);
    await waitReady(page);
    await page.evalFile(PERF);
    await page.evalFile(HARN);
    await page.eval(`window.__shaderTable = ${fs.readFileSync(INV, 'utf8')}; true`);
    const inst = await page.evalFile(PROF);
    if (!inst || inst.error) throw new Error('profiler failed: ' + (inst && inst.error));

    const probe = await page.eval('window.__perf.probe()');
    console.log('');
    console.log('═'.repeat(100));
    console.log('  DENSITY RAMP — what gets more expensive as the canvas fills');
    console.log('═'.repeat(100));
    console.log('  GPU  ', probe.renderer || '(unavailable)');
    await page.eval('window.__perf.pin({})');
    await page.eval(`window.PerfTiers.apply(${JSON.stringify(tier)}, {maxMB: 12000})`);
    await sleep(3000);

    const rows = [];

    // Hold the dye. Density is the independent variable, and the shipped
    // dissipation drains it between samples fast enough that "how dense is
    // the canvas" would otherwise be decided by how long the measurement
    // took. Restored at the end.
    const prevDiss = await page.eval('window.config.DENSITY_DISSIPATION');
    await page.eval('window.config.DENSITY_DISSIPATION = 1.0; true');
    console.log('  dye dissipation pinned to 1.0 for the ramp (was ' + prevDiss + ')');
    console.log('');
    console.log('  ' + 'stage'.padEnd(22) + 'dyeCov'.padStart(8) + 'dyeMean'.padStart(9) +
                'velMean'.padStart(9) + 'p95 cost'.padStart(10) + 'fps'.padStart(8) + '  verdict');

    // measure() carries its own uncapped warmup, which is what keeps the GPU
    // at boost clocks — the confound that made the first version of this
    // script report that painting made the frame faster.
    async function sample(label, workload) {
        const r = await page.eval(
            `window.__perf.measure(${JSON.stringify({ seconds: 5, warmupSeconds: 3, workload, targetFps: 144 })})`,
            { timeoutMs: 90000 });
        await page.eval('window.__perf.painterStop()');
        const st = JSON.parse(await page.eval('JSON.stringify(' + STATE + ')'));
        const row = { label, workload, ...st, costP95: r.frameCostP95, fps: r.fps,
                      gpuP95: r.gpuMs && r.gpuMs.p95, cpuP95: r.cpuMs && r.cpuMs.p95 };
        rows.push(row);
        console.log('  ' + label.padEnd(22) +
            (st.cov * 100).toFixed(1).padStart(8) +
            st.dyeMean.toFixed(3).padStart(9) +
            st.velMean.toFixed(4).padStart(9) +
            String(row.costP95).padStart(10) + 'ms' +
            String(row.fps).padStart(8));
        return row;
    }

    await page.eval('window.clearCanvas && window.clearCanvas()');
    await sleep(1500);
    // Throwaway. measure()'s own warmup is not enough from a COLD card: the
    // very first sample after a tier apply still lands mid clock-ramp, and
    // measured 16.5ms against 4.8-5.2ms for every identical sample after it
    // — a 3x error, on the baseline row every other row is compared to.
    await page.eval(
        `window.__perf.measure({seconds:3, warmupSeconds:3, workload:'idle', targetFps:144})`,
        { timeoutMs: 90000 });
    await sample('empty · idle', 'idle');

    for (let i = 1; i <= steps; i++) {
        await page.eval(
            `window.__perf.measure({seconds:${paintSec}, warmupSeconds:0, workload:'paint', targetFps:144})`,
            { timeoutMs: (paintSec + 40) * 1000 });
        await page.eval('window.__perf.painterStop()');
        await sample(`load ${i} · idle`, 'idle');
    }
    // Same canvas, but with the brush down: separates "dye is on screen"
    // from "the brush is running" as cost drivers.
    await sample('loaded · painting', 'paint');

    await page.eval(`window.config.DENSITY_DISSIPATION = ${prevDiss}; true`);

    await page.eval('window.PerfTiers.reset()');
    await page.eval('window.__perf.restore()');

    summary(rows);

    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = arg('json', null) ||
        path.join(OUT_DIR, 'density-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
    fs.writeFileSync(file, JSON.stringify({ when: new Date().toISOString(), tier, machine: probe, rows }, null, 2));
    console.log('\n  report → ' + path.relative(process.cwd(), file) + '\n');
    page.close();
    process.exit(0);
}

function summary(rows) {
    const base = rows[0];
    console.log('');
    console.log('─'.repeat(100));
    console.log('  COST vs DENSITY');
    console.log('─'.repeat(100));
    for (const r of rows) {
        const d = base.costP95 ? ((r.costP95 - base.costP95) / base.costP95 * 100) : 0;
        console.log('  ' + r.label.padEnd(22) +
            ('cov ' + (r.cov * 100).toFixed(1) + '%').padStart(12) +
            (r.costP95 + 'ms').padStart(11) +
            ((d >= 0 ? '+' : '') + d.toFixed(1) + '% vs empty').padStart(20));
    }
    console.log('');
    console.log('  If cost is flat across the loads, dye on the canvas is not what');
    console.log('  costs — every pass is a fixed-size draw and content does not change it.');
    console.log('  In that case the density slowdown lives somewhere else: the dab path,');
    console.log('  the layer stack, or the collider rebuild.');
}

main().catch(e => { console.error('\n  FAILED: ' + e.message + '\n'); process.exit(1); });
