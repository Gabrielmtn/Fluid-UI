// ═══════════════════════════════════════════════════════════════════
// scripts/test/run-perf.js — the max-fidelity perf harness.
//
// Answers one question: on THIS machine, how high can the quality tier
// go before a frame stops fitting? Not "is it slow" — the point is to
// find the ceiling and stop just below it.
//
// It is the timing counterpart to run-regression.js / run-sweep.js, and
// it works the opposite way on purpose. Those freeze the clock and pump
// frames so results are bit-identical; this one runs the app for real,
// because a frozen frame has no duration. The two share cdp.js and
// nothing else.
//
// RUN IT WITH VSYNC OFF. Not a preference — a correctness requirement:
//
//   node_modules/electron/dist/electron.exe . --remote-debugging-port=9333 //        --disable-gpu-vsync --disable-frame-rate-limit
//
// With vsync on, the GPU stalls acquiring a back buffer, and that stall
// falls between the timer query's own markers — no bracketing can lift it
// out. MEASURED on a 143Hz panel: every tier from stock to the 8K probe
// reported a 7.0ms frame interval while their GPU times ranged 3.4-13.8ms,
// which cannot be true of any of them. With vsync off the same ladder gives
// GPU time equal to the frame interval at every rung (0.17 vs 0.3ms at
// stock, 12.9 vs 12.0ms at the probe) — two independent instruments
// agreeing, which is the only reason to believe either. Runs that trip the
// invariant are reported VSYNC and their numbers discarded.
//
// Usage (app running with --remote-debugging-port=9333):
//   node scripts/test/run-perf.js                  # every tier, idle + paint
//   node scripts/test/run-perf.js --find-max       # climb until a tier misses
//   node scripts/test/run-perf.js --tier cinematic
//   node scripts/test/run-perf.js --tier cinematic --workload storm
//   node scripts/test/run-perf.js --target 120     # judge against 120fps
//   node scripts/test/run-perf.js --seconds 10 --box 2560x1440
//
// Options:
//   --tier <name|all>   one tier, or the whole ladder (default: all)
//   --find-max          stop at the first tier that misses --target, and
//                       report the last one that held
//   --target <fps>      the bar a tier must clear (default: the panel's
//                       refresh rate, floored at 60)
//   --workload <list>   idle,paint,storm (default: idle,paint)
//   --seconds <n>       measured window per workload (default 6)
//   --warmup <n>        discarded settle window (default 2.5)
//   --box <WxH>         pin the canvas box — every buffer is sized off
//                       it, so comparing runs at different box sizes is
//                       comparing nothing (default: leave as-is)
//   --max-vram <MB>     skip tiers estimated above this (default 12000)
//   --port <n>          CDP port (default 9333)
//   --json <path>       where to write the report
//
// HOW A TIER IS JUDGED
// Not on fps: under vsync every tier with headroom reports the panel
// rate, so fps cannot see the difference between comfortable and about
// to break. The verdict comes from frameCostP95 — the 95th-percentile
// CPU+GPU time for one frame — turned into the rate the machine could
// hold with vsync out of the way:
//
//   HOLDS     headroomFps >= target, <1% of frames over budget
//   TIGHT     headroomFps >= target but >=1% of frames blow the budget
//             (fits on average, hitches under the brush — the state that
//             feels worse than the numbers look)
//   MISSES    headroomFps < target
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const { connect, waitReady } = require('./cdp');

const OUT_DIR = path.join(__dirname, 'results');
const HARNESS = path.join(__dirname, 'perf-harness.js');

function arg(name, def) {
    const i = process.argv.indexOf('--' + name);
    if (i === -1) return def;
    const v = process.argv[i + 1];
    return (v === undefined || v.startsWith('--')) ? true : v;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function fmt(n, w, pad) {
    const s = n === null || n === undefined ? '—' : String(n);
    return pad === 'l' ? s.padEnd(w) : s.padStart(w);
}

// ── Verdict ──────────────────────────────────────────────────────────
// Over-budget frames get their own verdict rather than folding into the
// pass bar: a tier whose p95 fits but whose worst 1% does not is exactly
// the tier that measures fine and paints badly, and collapsing it into
// HOLDS would hide the only thing worth knowing about it.
const OVER_BUDGET_PCT_BAR = 1.0;

function verdict(r, target) {
    if (!r || r.error) return 'ERROR';
    // Both of these mean the run did not measure what it claims to, so they
    // outrank the numbers rather than colouring them.
    if (r.drifted) return 'DRIFTED';
    if (r.vsyncContaminated) return 'VSYNC';
    if (r.headroomFps === null) return 'NO DATA';
    if (r.headroomFps < target) return 'MISSES';
    if (r.overBudgetPct >= OVER_BUDGET_PCT_BAR) return 'TIGHT';
    return 'HOLDS';
}

async function main() {
    const port = Number(arg('port', 9333));
    const seconds = Number(arg('seconds', 6));
    const warmup = Number(arg('warmup', 2.5));
    const wantTier = String(arg('tier', 'all'));
    const findMax = !!arg('find-max', false);
    const maxVram = Number(arg('max-vram', 12000));
    const workloads = String(arg('workload', 'idle,paint')).split(',').map(s => s.trim()).filter(Boolean);
    const boxArg = arg('box', null);
    const box = boxArg && typeof boxArg === 'string' && boxArg.includes('x')
        ? boxArg.split('x').map(Number) : null;

    const page = await connect(port);
    await waitReady(page);
    // waitReady only proves the sim exists. The settings autoload lands a
    // moment LATER and rewrites resolution from the previous session — it
    // overwrote an applied tier mid-measurement before this wait existed.
    // Wait for the configuration to stop moving rather than guessing a delay.
    await waitForStableConfig(page);
    const install = await page.evalFile(HARNESS);
    if (!install || !install.installed) throw new Error('perf harness failed to install');

    const probe = await page.eval('window.__perf.probe()');
    if (!probe.tiers) {
        throw new Error('window.PerfTiers missing — is js/42-perf-tiers.js loaded? ' +
                        '(this driver expects the perf-max-tiers branch)');
    }

    // The bar. Default to the panel: on a 165Hz monitor, "60 is fine" is
    // not what the machine is being asked for.
    const target = Number(arg('target', Math.max(60, probe.displayHz || 60)));

    console.log('');
    console.log('═'.repeat(78));
    console.log('  MAX-FIDELITY PERF HARNESS');
    console.log('═'.repeat(78));
    console.log('  GPU        ', probe.renderer || '(WEBGL_debug_renderer_info unavailable)');
    console.log('  Cores      ', probe.cores, ' Display', (probe.displayHz || '?') + 'Hz',
                ' MaxTexture', probe.maxTextureSize);
    console.log('  GPU timing ', probe.timerQuery
        ? 'EXT_disjoint_timer_query_webgl2 (device nanoseconds)'
        : '!! NO TIMER QUERY — falling back to gl.finish(), which measures the');
    if (!probe.timerQuery) {
        console.log('               vsync wait rather than the work. Treat gpu/headroom as');
        console.log('               indicative only.');
    }
    // Vsync-locked runs cannot answer "how much headroom is left" — the app
    // is idle most of each frame by construction, and every derived number
    // inherits the panel's pacing rather than the machine's capability.
    if ((probe.displayHz || 60) < 90) {
        console.log('');
        console.log('  ! Panel reports ' + probe.displayHz + 'Hz. If frames pace to it, relaunch with');
        console.log('    --disable-gpu-vsync --disable-frame-rate-limit for a true ceiling.');
    }
    console.log('  Target     ', target + 'fps   Workloads: ' + workloads.join(', '));
    if (box) console.log('  Canvas box ', box[0] + 'x' + box[1] + ' (pinned)');
    console.log('');

    const pinned = await page.eval(`window.__perf.pin(${JSON.stringify({ box })})`);
    console.log('  Pinned     ', 'wrapper ' + pinned.wrapper + ', buffer ' + pinned.canvas);

    // A tier sweep changes DYE_RESOLUTION repeatedly, and every change
    // reallocates the raster paint layers and mask coverage buffers at the
    // new size and bilinear-blits the old pixels across. That resample is
    // one-way: the solid core survives, but each pass widens the soft
    // apron around every stroke, and it never sharpens back. MEASURED on
    // this branch — a 2px/8px mask pattern went from 0% partial-coverage
    // texels to 50% after four resolution changes, while the fully-solid
    // fraction stayed put. For a mask driving a live collider that apron
    // is the part that leaks and drains dye, so a swept session leaves
    // painted colliders visibly worse than it found them.
    const authored = await page.eval(
        '({raster: (window.layers||[]).filter(function(l){return l&&l.isRaster;}).length,' +
        '  masks: (window.Masks && window.Masks.list) ? window.Masks.list().length : 0})');
    if (authored.raster || authored.masks) {
        console.log('');
        console.log('  ! ' + authored.raster + ' paint layer(s) and ' + authored.masks + ' mask(s) are open.');
        console.log('    Each tier change resamples them; painted colliders will come out');
        console.log('    softer than they went in. Sweep on a scratch document.');
    }
    console.log('');

    const order = wantTier === 'all' ? probe.tiers.map(t => t.key) : [wantTier];
    const rows = [];
    let lastHolding = null;

    for (const key of order) {
        const meta = probe.tiers.find(t => t.key === key);
        if (!meta) { console.log(`  ! unknown tier "${key}" — have: ${probe.tiers.map(t => t.key).join(', ')}`); continue; }

        const applied = await page.eval(
            `window.PerfTiers.apply(${JSON.stringify(key)}, ${JSON.stringify({ maxMB: maxVram })})`);
        if (applied.error) {
            console.log(`  ${meta.label.padEnd(26)} SKIPPED — ${applied.error}`);
            rows.push({ tier: key, label: meta.label, skipped: applied.error });
            continue;
        }

        // The reinit is flagged, not immediate: 05j rebuilds on its next
        // frame and an 8K realloc is not instant. Wait for the LIVE
        // buffer dims to match what was asked for before timing anything
        // — otherwise the first tier's numbers are the previous tier's.
        const ok = await waitForResolution(page, meta.dye, meta.sim);
        if (!ok) {
            console.log(`  ${meta.label.padEnd(26)} SKIPPED — buffers never reached ${meta.dye}/${meta.sim} ` +
                        `(driver refused the allocation?)`);
            rows.push({ tier: key, label: meta.label, skipped: 'allocation never landed' });
            continue;
        }

        const row = { tier: key, label: meta.label, estMB: meta.estMB, runs: {} };
        for (const w of workloads) {
            const r = await page.eval(
                `window.__perf.measure(${JSON.stringify({ seconds, warmupSeconds: warmup, workload: w, targetFps: target })})`,
                { timeoutMs: (seconds + warmup + 30) * 1000 });
            r.verdict = verdict(r, target);
            row.runs[w] = r;
            printRun(meta, w, r);
        }
        row.vramMB = (row.runs[workloads[0]] || {}).vram
            ? row.runs[workloads[0]].vram.mb : null;
        rows.push(row);

        const worst = workloads
            .map(w => row.runs[w])
            .filter(Boolean)
            .reduce((a, b) => (a && a.headroomFps <= b.headroomFps ? a : b), null);
        row.verdict = verdict(worst, target);

        // Only a tier that actually cleared the bar can be the recommendation.
        // An earlier version treated "not MISSES" as passing, which let a row
        // whose run was rejected outright (DRIFTED / VSYNC) be reported as the
        // highest holding tier — the 8K probe was recommended off a run the
        // driver had itself just declared invalid.
        if (row.verdict === 'HOLDS' || row.verdict === 'TIGHT') {
            lastHolding = row;
        } else if (row.verdict === 'MISSES' && findMax) {
            console.log('');
            console.log(`  ↑ first tier to miss ${target}fps — stopping the climb`);
            break;
        }
    }

    // Always leave the app somewhere sane rather than parked at whatever
    // the last tier was — an 8K probe left applied will greet the next
    // person with a two-second boot and a scared GPU.
    await page.eval('window.PerfTiers.reset()');
    await page.eval('window.__perf.painterStop()');
    // The governor toggle persists, so a run that left it off would rewrite
    // the user's saved preference on its way out.
    const restored = await page.eval('window.__perf.restore()');

    summary(rows, target, lastHolding, workloads);

    const out = {
        when: new Date().toISOString(),
        machine: probe, target, seconds, warmup, workloads,
        box: pinned, rows
    };
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = arg('json', null) ||
        path.join(OUT_DIR, 'perf-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
    fs.writeFileSync(file, JSON.stringify(out, null, 2));
    console.log('  report → ' + path.relative(process.cwd(), file));
    if (restored && restored.restored) {
        console.log('  adaptive quality governor restored to ' + restored.governor);
    }
    console.log('');

    page.close();
    // The CDP socket and its keep-alive agent hold the event loop open, so
    // an implicit exit never comes; without this the driver finishes its
    // work, writes the report, and then hangs a piped shell forever.
    process.exit(0);
}

// Block until the boot-time settings autoload has landed AND config has
// stopped moving. Waiting on quiet alone is not enough: 12-save-load defers
// the restore until the async chunk chain fires `fluidui:scripts-ready`, so
// a config that looks settled at t=3s can still be rewritten at t=6s — which
// is exactly how a 'stock' row came to be measured at dye 8192.
async function waitForStableConfig(page, quietMs = 2500, timeoutMs = 30000) {
    const t0 = Date.now();
    // Phase 1: the signal the autoload itself waits for.
    while (Date.now() - t0 < timeoutMs) {
        if (await page.eval('!!window.__scriptsReady').catch(() => false)) break;
        await sleep(250);
    }
    // Phase 2: quiet, to cover the restore's own async tail.
    let last = null, stableSince = Date.now();
    for (;;) {
        const cur = await page.eval(
            '({d: window.config.DYE_RESOLUTION, s: window.config.SIM_RESOLUTION,' +
            ' r: window.config.RENDER_SCALE})');
        const key = JSON.stringify(cur);
        if (key !== last) { last = key; stableSince = Date.now(); }
        else if (Date.now() - stableSince >= quietMs) return cur;
        if (Date.now() - t0 > timeoutMs) return cur;
        await sleep(250);
    }
}

// Poll the LIVE texture dimensions, not config: config is what was asked
// for, and on a refused allocation the two diverge silently.
async function waitForResolution(page, dye, sim, timeoutMs = 25000) {
    const t0 = Date.now();
    for (;;) {
        const s = await page.eval(
            '({dye: Math.max(window.dyeTexWidth||0, window.dyeTexHeight||0),' +
            '  sim: Math.max(window.simTexWidth||0, window.simTexHeight||0)})');
        if (s.dye === dye && s.sim === sim) return true;
        if (Date.now() - t0 > timeoutMs) return false;
        await sleep(250);
    }
}

function printRun(meta, workload, r) {
    if (r.error) { console.log(`  ${meta.label.padEnd(26)} ${workload.padEnd(6)} ERROR ${r.error}`); return; }
    const badge = {
        HOLDS: '✓ HOLDS', TIGHT: '~ TIGHT', MISSES: '✗ MISSES',
        DRIFTED: '! CONFIG DRIFTED MID-RUN', VSYNC: '! VSYNC-LOCKED, NOT A MEASUREMENT'
    }[r.verdict] || r.verdict;
    console.log(
        '  ' + fmt(meta.label, 26, 'l') +
        fmt(workload, 6, 'l') +
        ' fps ' + fmt(r.fps, 5) +
        ' | cpu ' + fmt(r.cpuMs ? r.cpuMs.p95 : null, 6) +
        ' gpu ' + fmt(r.gpuMs ? r.gpuMs.p95 : (r.drainMs ? r.drainMs.p95 : null), 7) +
        ' = ' + fmt(r.frameCostP95, 7) + 'ms' +
        ' | headroom ' + fmt(r.headroomFps, 6) +
        ' | over ' + fmt(r.overBudgetPct + '%', 6) +
        '  ' + badge);
}

function summary(rows, target, lastHolding, workloads) {
    console.log('');
    console.log('─'.repeat(78));
    console.log('  SUMMARY — p95 frame cost (CPU+GPU), vsync removed');
    console.log('─'.repeat(78));
    console.log('  ' + 'tier'.padEnd(16) + 'dye/sim'.padEnd(13) + 'over'.padEnd(6) +
                'ss'.padEnd(6) + 'VRAM'.padEnd(9) +
                workloads.map(w => (w + ' hdrm').padEnd(11)).join('') + 'verdict');
    for (const row of rows) {
        if (row.skipped) {
            console.log('  ' + row.tier.padEnd(16) + '— skipped: ' + row.skipped);
            continue;
        }
        const st = (row.runs[workloads[0]] || {}).state || {};
        console.log('  ' + row.tier.padEnd(16) +
            String(st.dye + '/' + st.sim).padEnd(13) +
            String('x' + (st.oversample || 1)).padEnd(6) +
            String((st.renderScale || 1) + 'x').padEnd(6) +
            String((row.vramMB != null ? row.vramMB + 'MB' : '—')).padEnd(9) +
            workloads.map(w => String((row.runs[w] && row.runs[w].headroomFps) || '—').padEnd(11)).join('') +
            row.verdict);
    }
    console.log('');
    if (lastHolding) {
        console.log(`  → Highest tier holding ${target}fps on every workload: ` +
                    `${lastHolding.label} (${lastHolding.tier})`);
        console.log(`    apply it in the app's console:  PerfTiers.apply('${lastHolding.tier}')`);
    } else {
        console.log(`  → No tier cleared ${target}fps on every workload.`);
    }
    console.log('');
    console.log('  Reading the columns: headroom is the fps the machine could sustain');
    console.log('  with vsync out of the way, off the p95 frame. "over" is the share of');
    console.log('  frames that blew the target budget outright.');
}

main().catch(e => { console.error('\n  FAILED: ' + e.message + '\n'); process.exit(1); });
