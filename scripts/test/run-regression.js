// ═══════════════════════════════════════════════════════════════════
// scripts/test/run-regression.js — golden-state regression suite.
//
// Runs the scenarios in scripts/test/scenarios.json, each one a
// deterministic recipe (seeded, frozen clock, fixed frame counts), and
// snapshots sim hashes + display hashes at checkpoints.
//
//   --record     write the results as the new goldens
//   (default)    compare against scripts/test/goldens/goldens.json and
//                exit 1 on any mismatch
//
// The point: after the open-source refactor, `--record` on the last
// pre-refactor commit and a plain run on the refactored tree answers
// "did any feature change behaviour" in minutes, feature by feature.
// A sim-hash mismatch means the physics changed; a display-hash
// mismatch with matching sim hashes means the look pipeline changed.
//
// Determinism policy each scenario gets for free (setup() below):
// governor pinned off, low test resolution, Colour Gate off, light
// shift off, material 'fluid', gate params at defaults, pressure and
// wetness wiped between scenarios. A scenario's own `setup` steps run
// on top and may override any of it — deliberately, so features ARE
// testable in their on states.
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');
const { connect, waitReady } = require('./cdp');

const SCEN = path.join(__dirname, 'scenarios.json');
const GOLD = path.join(__dirname, 'goldens', 'goldens.json');
const OUT_DIR = path.join(__dirname, 'results');

function arg(name) { return process.argv.includes('--' + name); }
function argv(name, def) {
    const i = process.argv.indexOf('--' + name);
    return i === -1 ? def : process.argv[i + 1];
}

// One scenario, wholly page-side. `actions` is the scenario's JSON
// action list, interpreted by the page expression — no string splicing
// of user data beyond JSON.stringify.
function scenarioExpr(scenario) {
    return `
(function(){
    var T = window.__test;
    if (!T) return Promise.resolve({ error: 'harness not installed' });
    var S = ${JSON.stringify(scenario)};
    var checkpoints = [];
    function doAction(a) {
        switch (a.do) {
            case 'slider':   T.setSlider(a.id, a.value); return Promise.resolve();
            case 'checkbox': T.setCheckbox(a.id, a.value); return Promise.resolve();
            case 'select':   T.setSelect(a.id, a.value); return Promise.resolve();
            case 'preset':   if (window.applyPreset) window.applyPreset(a.name); return Promise.resolve();
            case 'material': if (window.MaterialModes) window.MaterialModes.setMode(a.mode); return Promise.resolve();
            case 'eval':     (0, eval)(a.js); return Promise.resolve();
            case 'stroke':   T.stroke(a.opts || {}); return Promise.resolve();
            case 'pointerStroke': return T.pointerStroke(a.opts || {});
            case 'key':      T.key(a.spec); return Promise.resolve();
            case 'step':     return T.step(a.frames || 1);
            case 'clear':    T.clear(); return Promise.resolve();
            case 'snapshot': {
                var s = T.snapshotState({ display: true });
                checkpoints.push({
                    name: a.name || ('cp' + checkpoints.length),
                    dye: s.dye.hash, vel: s.vel && s.vel.hash,
                    display: s.display.hash,
                    nan: (s.dye.nan || 0) + ((s.vel && s.vel.nan) || 0),
                    coverage: +s.dye.coverage.toFixed(5),
                    meanLum: +s.display.meanLum.toFixed(5),
                });
                return Promise.resolve();
            }
            default: return Promise.reject(new Error('unknown action: ' + a.do));
        }
    }
    // Shared determinism policy, then the scenario's own setup.
    function setup() {
        // Registry defaults FIRST: the app autosaves its settings, so a
        // fresh boot autoloads the PREVIOUS session's state — cross-boot
        // goldens never matched until every registered param was pinned
        // (ParamRegistry.defaults() is snapshot-shaped for exactly this).
        if (window.ParamRegistry && window.applyPresetSnapshot) {
            window.applyPresetSnapshot(window.ParamRegistry.defaults());
        }
        if (window.QualityGovernor && window.QualityGovernor.setEnabled) window.QualityGovernor.setEnabled(false);
        // The brush colour picker is not registry-covered — pin it too.
        var cp = document.getElementById('colorPicker');
        if (cp) { cp.value = '#4090c0'; cp.dispatchEvent(new Event('input', { bubbles: true })); }
        // Pin the canvas BOX: texture dims are aspect-scaled off the
        // resolution budget, so a boot-to-boot window/wrapper size delta
        // silently changes every buffer. The bakers always setBox() —
        // consecutive boots agreed and a third diverged until this pin.
        var wrap = document.getElementById('canvas-wrapper');
        if (wrap) {
            wrap.style.width = '1280px';
            wrap.style.height = '720px';
            if (window.initializeCanvasPosition) window.initializeCanvasPosition();
            if (window.updateCanvasSize) window.updateCanvasSize();
        }
        T.setSelect('visualResolution', '1024');
        T.setSelect('physicsResolution', '256');
        // fpsCap MUST be uncapped under the virtual clock: lastDrawTimeMs
        // carries the REAL clock's sub-frame phase into the freeze, so with
        // a cap the first pumped frame randomly passes or skips the
        // cap gate per boot — the divergence probe caught boot 2's first
        // frame as a silent no-op (dye untouched) while boot 1 simmed.
        T.setSelect('fpsCap', '0');
        window.fpsCap = 0;
        // Sub-stepping off: the FIRST frozen frame's wallDt spans
        // virtualNow minus the last REAL frame time — phase-random per
        // boot — and when it crosses 20ms the loop runs ceil(wallDt/16)
        // physics sub-steps, a per-boot different count (probe: frame-1
        // means differing by ~7e-6, both frames simmed). With it off,
        // rawDt clamps to a constant 16ms whatever the phase.
        config.SIM_SUBSTEP = false;
        window.timeScale = 1;
        T.setCheckbox('colorGate', false);
        T.setCheckbox('randomColor', false);
        if (window.lightShift) window.lightShift.enabled = false;
        if (window.MaterialModes) window.MaterialModes.setMode('fluid');
        // Strip any live layers and colliders — by each layer's OWN index,
        // not array position (deleteLayer matches l.index). The app under
        // test doubles as a painting app; a layer someone added between
        // runs (measured: a fish) shifts every hash in the suite.
        if (window.layers && window.deleteLayer) {
            window.layers.map(function (l) { return l.index; })
                .forEach(function (id) { try { window.deleteLayer(id); } catch (_) {} });
        }
        if (window.collisionLayers) {
            if (window.collisionLayers.setProcedural) window.collisionLayers.setProcedural(null);
            window.collisionLayers.enabled = false;
        }
        if (typeof window.clearObstacleTexture === 'function') window.clearObstacleTexture();
        // Unregistered persisted state — MEASURED drifting across boots
        // (fingerprint diff 2026-08-21): STAMP_SHAPE 0 vs undefined flips
        // the splat shader's footprint branch (every dab changes), the
        // splat in/out ramp distances scale dab radii, and multiArmColors
        // arrived as 1 entry on one boot and 8 on the next.
        config.STAMP_SHAPE = 0;
        window.splatInDist = 0.15;
        window.splatOutDist = 0.15;
        if (window.multiArmColors) {
            for (var ai = 0; ai < 8; ai++) {
                window.multiArmColors[ai] = ai === 0
                    ? { mode: 'fixed', color: '#4090c0', stepIndex: 0, cachedColor: null }
                    : { mode: 'main', color: '#ffffff', stepIndex: 0 };
            }
            window.multiArmColors.length = 8;
        }
        // Zero the decay-debt accumulators (dyeDecayAccum/velDecayAccum,
        // lexical in 05j): they batch dt in SECONDS toward an fp16 flush
        // threshold and carry phase-random PRE-FREEZE debt across clear().
        // The only external reset hook is the loop's own guard — a
        // dissipation-value CHANGE zeroes the debt — so nudge each rate,
        // let one frame observe it, restore the canonical value, and let
        // one more frame observe that. From the second change on, the
        // accumulator path is deterministic. (Divergence probe: frame-1
        // hashes recurred in a small set of variants across boots — the
        // signature of a quantized phase, this one.)
        T.setSlider('densityDissipation', 0.992);   // stay >= 0.88: below wipes the sim
        T.setSlider('velocityDissipation', 0.998);
        return T.step(1).then(function () {
            T.setSlider('densityDissipation', 0.993);
            T.setSlider('velocityDissipation', 0.999);
            return T.step(1);
        }).then(function () {
            T.clear();
            T.seed(S.seed || 0xBEEF);
            return T.step(4);
        });
    }
    return T.freeze().then(setup).then(function () {
        var chain = Promise.resolve();
        (S.actions || []).forEach(function (a) {
            chain = chain.then(function () { return doAction(a); });
        });
        return chain;
    }).then(function () {
        T.unseed();
        var errs = T.errors(true);
        return { name: S.name, checkpoints: checkpoints, pageErrors: errs };
    }, function (e) {
        T.unseed();
        return { name: S.name, error: String(e && e.message || e), checkpoints: checkpoints, pageErrors: T.errors(true) };
    });
})()`;
}

async function main() {
    const port = parseInt(argv('port', '9333'), 10);
    const only = argv('only', null);
    const scenarios = JSON.parse(fs.readFileSync(SCEN, 'utf8')).scenarios
        .filter(s => !only || s.name === only);

    const page = await connect(port);
    await waitReady(page);
    const inst = await page.evalFile(path.join(__dirname, 'harness.js'));
    if (inst && inst.error) throw new Error('harness: ' + inst.error);

    const results = [];
    for (const s of scenarios) {
        process.stdout.write(`scenario ${s.name} ... `);
        const r = await page.eval(scenarioExpr(s), { timeoutMs: 600000 });
        results.push(r);
        console.log(r.error ? `ERROR: ${r.error}` : `${r.checkpoints.length} checkpoints` +
            (r.pageErrors.length ? ` (${r.pageErrors.length} console errors!)` : ''));
    }
    await page.eval('window.__test.thaw()');
    page.close();

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.writeFileSync(path.join(OUT_DIR, `regression-${stamp}.json`), JSON.stringify({ stamp, results }, null, 2));

    if (arg('record')) {
        fs.mkdirSync(path.dirname(GOLD), { recursive: true });
        fs.writeFileSync(GOLD, JSON.stringify({ recorded: stamp, results }, null, 2));
        console.log(`\ngoldens recorded: ${path.relative(process.cwd(), GOLD)}`);
        return;
    }

    if (!fs.existsSync(GOLD)) {
        console.log('\nno goldens yet — run with --record on a known-good build first');
        process.exit(2);
    }
    const gold = JSON.parse(fs.readFileSync(GOLD, 'utf8'));
    let failures = 0;
    for (const r of results) {
        const g = gold.results.find(x => x.name === r.name);
        if (!g) { console.log(`~ ${r.name}: no golden (new scenario)`); continue; }
        for (const cp of r.checkpoints) {
            const gcp = (g.checkpoints || []).find(x => x.name === cp.name);
            if (!gcp) { console.log(`~ ${r.name}/${cp.name}: no golden checkpoint`); continue; }
            const simDiff = cp.dye !== gcp.dye || cp.vel !== gcp.vel;
            const lookDiff = cp.display !== gcp.display;
            if (simDiff || lookDiff) {
                failures++;
                console.log(`✗ ${r.name}/${cp.name}: ` +
                    (simDiff ? `SIM changed (dye ${gcp.dye}→${cp.dye})` : 'sim identical') + ', ' +
                    (lookDiff ? `LOOK changed (${gcp.display}→${cp.display})` : 'look identical'));
            }
        }
        if (r.pageErrors && r.pageErrors.length) {
            failures++;
            console.log(`✗ ${r.name}: console errors: ${r.pageErrors.join(' | ').slice(0, 300)}`);
        }
    }
    console.log(failures ? `\n${failures} regression(s)` : '\nall scenarios match goldens');
    process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
