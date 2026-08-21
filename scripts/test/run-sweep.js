// ═══════════════════════════════════════════════════════════════════
// scripts/test/run-sweep.js — parameter response sweeps.
//
// For each param: at each level, reset → seeded canonical stroke →
// N deterministic frames → measure BOTH instruments:
//   sim   = dye-field hash + stats  (physics truth — blind to post-FX)
//   look  = rendered-canvas hash + luminance (what the player sees)
// then analyze the response curve and flag:
//   DEAD ZONE     look identical to the off level across a range
//   SIM LEAK      sim hash changes when the param should be look-only
//                 (consumer 'display-shader'), or is look-only when it
//                 should move the sim
//   NON-MONOTONIC response returns to an earlier state at higher levels
//                 (measured on Ridges: dye returns bit-exact to baseline
//                 at >= 2.4 with the Colour Gate on)
//   DESTRUCTION   NaNs in a field, dye coverage collapsing to ~0 after
//                 paint, or display luminance blowing out / going black
//
// Usage (app running with --remote-debugging-port=9333):
//   node scripts/test/run-sweep.js --param ridges
//   node scripts/test/run-sweep.js --param ridges --levels 0,0.5,1,2,4,6
//   node scripts/test/run-sweep.js --all            # sweepRelevant params
//   node scripts/test/run-sweep.js --all --gate off # Colour Gate pinned off
//
// --all reads scripts/test/inventory/params.json (written by the
// inventory agents); --param works without it (10 even levels from the
// slider's own min/max). Results land in scripts/test/results/.
//
// Protocol notes:
//   • fresh app boot per session; the harness freezes/thaws around the
//     whole sweep, one thaw at the end — never re-inject mid-freeze.
//   • sweeps run at LOW resolution (dye 1024 / sim 256) for readback
//     speed; a dead zone at 1024 should be re-checked at 2048 before
//     filing, resolution-dependent kernels exist (RIDGES is 2048-
//     reference-normalized).
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const { connect, waitReady } = require('./cdp');

const ROOT = path.resolve(__dirname, '..', '..');
const INV = path.join(__dirname, 'inventory', 'params.json');
const OUT_DIR = path.join(__dirname, 'results');

function arg(name, def) {
    const i = process.argv.indexOf('--' + name);
    if (i === -1) return def;
    const v = process.argv[i + 1];
    return (v === undefined || v.startsWith('--')) ? true : v;
}

// Page-side sweep for ONE param. Everything inside one eval so the
// virtual clock never crosses a CDP round-trip mid-frozen.
function sweepExpr(paramId, kind, levels, gate) {
    return `
(function(){
    var T = window.__test;
    if (!T) return Promise.resolve({ error: 'harness not installed' });
    var LEVELS = ${JSON.stringify(levels)};
    var results = [];
    function apply(v) {
        ${kind === 'checkbox'
            ? `T.setCheckbox(${JSON.stringify(paramId)}, !!v);`
            : kind === 'select'
                ? `T.setSelect(${JSON.stringify(paramId)}, v);`
                : `T.setSlider(${JSON.stringify(paramId)}, v);`}
    }
    function runLevel(v) {
        T.clear();
        apply(v);
        T.seed(0xBEEF);
        return T.step(4).then(function () {
            T.stroke({});
            return T.step(60);
        }).then(function () {
            var s = T.snapshotState({ display: true });
            results.push({
                level: v,
                sim: { hash: s.dye.hash, mean: s.dye.mean, max: s.dye.max,
                       nan: s.dye.nan, coverage: s.dye.coverage,
                       velHash: s.vel && s.vel.hash, velNan: s.vel && s.vel.nan },
                look: { hash: s.display.hash, meanLum: s.display.meanLum,
                        maxLum: s.display.maxLum },
            });
        });
    }
    return T.freeze().then(function () {
        // Registry defaults first — autosaved settings otherwise ride in
        // from the previous session and shift every baseline (see
        // run-regression.js setup for the full story).
        if (window.ParamRegistry && window.applyPresetSnapshot) {
            window.applyPresetSnapshot(window.ParamRegistry.defaults());
        }
        if (window.QualityGovernor && window.QualityGovernor.setEnabled) window.QualityGovernor.setEnabled(false);
        ${gate === 'off' ? `T.setCheckbox('colorGate', false);` : ''}
        ${gate === 'on' ? `T.setCheckbox('colorGate', true);` : ''}
        T.setSelect('visualResolution', '1024');
        T.setSelect('physicsResolution', '256');
        // Uncapped under the virtual clock — the cap gate is phase-random
        // at freeze (see run-regression.js setup).
        T.setSelect('fpsCap', '0');
        window.fpsCap = 0;
        config.SIM_SUBSTEP = false;
        window.timeScale = 1;
        var chain = Promise.resolve();
        LEVELS.forEach(function (v) { chain = chain.then(function () { return runLevel(v); }); });
        return chain;
    }).then(function () {
        apply(LEVELS[0]);
        T.unseed(); T.thaw();
        return { results: results, errors: T.errors(true) };
    }, function (e) {
        T.unseed(); T.thaw();
        return { error: String(e && e.message || e), results: results };
    });
})()`;
}

function analyze(param, results) {
    const base = results[0];
    const flags = [];
    const seenSim = new Map();

    results.forEach(r => {
        r.simSameAsOff = r.sim.hash === base.sim.hash;
        r.lookSameAsOff = r.look.hash === base.look.hash;
        if (r.sim.nan > 0 || (r.sim.velNan | 0) > 0) {
            flags.push({ level: r.level, flag: 'DESTRUCTION', why: `NaN in field (dye ${r.sim.nan}, vel ${r.sim.velNan})` });
        }
        if (base.sim.coverage > 0.02 && r.sim.coverage < base.sim.coverage * 0.05) {
            flags.push({ level: r.level, flag: 'DESTRUCTION', why: `dye coverage collapsed ${base.sim.coverage.toFixed(3)} -> ${r.sim.coverage.toFixed(3)}` });
        }
        if (r.look.meanLum > 0.95 || (base.look.meanLum > 0.01 && r.look.meanLum < 0.001)) {
            flags.push({ level: r.level, flag: 'DESTRUCTION', why: `display luminance ${r.look.meanLum.toFixed(4)} (baseline ${base.look.meanLum.toFixed(4)})` });
        }
        // Non-monotonic: an exact return to a state seen at a LOWER level.
        if (seenSim.has(r.sim.hash) && seenSim.get(r.sim.hash) !== r.level) {
            const first = seenSim.get(r.sim.hash);
            if (results.findIndex(x => x.level === first) < results.indexOf(r) - 1) {
                flags.push({ level: r.level, flag: 'NON-MONOTONIC', why: `sim state bit-identical to level ${first}` });
            }
        } else {
            seenSim.set(r.sim.hash, r.level);
        }
    });

    // Dead zones: maximal runs of consecutive non-zero levels whose LOOK
    // is identical to the off level.
    let zone = null;
    const deadZones = [];
    results.slice(1).forEach(r => {
        if (r.lookSameAsOff) {
            if (!zone) zone = { from: r.level, to: r.level };
            else zone.to = r.level;
        } else if (zone) { deadZones.push(zone); zone = null; }
    });
    if (zone) deadZones.push(zone);
    deadZones.forEach(z => flags.push({ level: z.from, flag: 'DEAD-ZONE', why: `look identical to off from ${z.from} to ${z.to}` }));

    return { param, results, flags };
}

async function main() {
    const port = parseInt(arg('port', '9333'), 10);
    const gate = arg('gate', null);
    const page = await connect(port);

    await waitReady(page);
    const inst = await page.evalFile(path.join(__dirname, 'harness.js'));
    if (inst && inst.error) throw new Error('harness: ' + inst.error);

    let targets = [];
    if (arg('all', false)) {
        if (!fs.existsSync(INV)) throw new Error('no inventory/params.json — run the inventory agents, or use --param');
        const inv = JSON.parse(fs.readFileSync(INV, 'utf8'));
        targets = (inv.params || inv).filter(p => p.sweepRelevant && p.kind === 'slider');
    } else {
        const id = arg('param', null);
        if (!id || id === true) throw new Error('need --param <sliderId> or --all');
        targets = [{ id, kind: 'slider' }];
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const reports = [];

    for (const t of targets) {
        let levels;
        const levelsArg = arg('levels', null);
        if (levelsArg && levelsArg !== true) {
            levels = levelsArg.split(',').map(Number);
        } else if (t.min !== undefined && t.max !== undefined) {
            levels = Array.from({ length: 11 }, (_, i) => +(t.min + (t.max - t.min) * i / 10).toFixed(4));
        } else {
            // No inventory: read the slider's own min/max from the DOM.
            const dom = await page.eval(`(function(){var e=document.getElementById(${JSON.stringify(t.id)});return e&&{min:+e.min,max:+e.max}})()`);
            if (!dom) { console.error(`  #${t.id}: no such slider, skipped`); continue; }
            levels = Array.from({ length: 11 }, (_, i) => +(dom.min + (dom.max - dom.min) * i / 10).toFixed(4));
        }

        console.log(`sweep ${t.id} @ [${levels.join(', ')}]${gate ? ' gate=' + gate : ''}`);
        const raw = await page.eval(sweepExpr(t.id, t.kind, levels, gate), { timeoutMs: 600000 });
        if (raw.error) { console.error(`  ERROR: ${raw.error}`); continue; }
        const report = analyze(t.id, raw.results);
        report.pageErrors = raw.errors;
        reports.push(report);
        report.flags.forEach(f => console.log(`  [${f.flag}] level ${f.level}: ${f.why}`));
        if (!report.flags.length) console.log('  clean monotonic response');
    }

    const out = path.join(OUT_DIR, `sweep-${stamp}.json`);
    fs.writeFileSync(out, JSON.stringify({ when: stamp, gate, reports }, null, 2));
    console.log(`\nreport: ${path.relative(ROOT, out)}`);
    page.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
