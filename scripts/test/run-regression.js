// ═══════════════════════════════════════════════════════════════════
// scripts/test/run-regression.js — golden-state regression suite.
//
// Runs the scenarios in scripts/test/scenarios.json, each one a
// deterministic recipe (seeded, frozen clock, fixed frame counts), and
// snapshots sim hashes + display hashes at checkpoints.
//
//   --record     write the results as the new goldens
//   (default)    compare against scripts/test/goldens/goldens.json and
//                exit 1 on a FAIL (see the verdicts below)
//   --strict     a NEAR counts as a FAIL (the pre-2026-08-26 gate)
//   --gl-errors  turn the harness's gl.getError() sweep on for every
//                scenario; any GL error is a FAIL
//   --tol-lum-rel / --tol-cov-rel / --tol-lum-abs / --tol-cov-abs
//                widen or tighten the scalar tolerances for one run
//                (env: FLUID_TEST_TOL_LUM_REL and friends)
//
// The point: after the open-source refactor, `--record` on the last
// pre-refactor commit and a plain run on the refactored tree answers
// "did any feature change behaviour" in minutes, feature by feature.
// A sim-hash mismatch means the physics changed; a display-hash
// mismatch with matching sim hashes means the look pipeline changed.
//
// THREE VERDICTS, not two. Hash equality alone made this gate useless:
// it has not been green since the goldens were recorded 2026-08-21, and
// the two open determinism residuals in GUIDANCE §4 mean it may not be
// for a while. Measured over every run in results/: three back-to-back
// runs in ONE boot give a different dye hash every time while their
// coverage and meanLum agree to all five recorded decimals. A gate that
// says "changed" to that is not measuring the app.
//
//   PASS  all three hashes identical to the golden — bit-identity, the
//         strictest signal, unchanged in meaning
//   NEAR  a hash moved but every scalar is inside tolerance — reported
//         with the actual deltas, exits 0, printed loudly
//   FAIL  a scalar left tolerance, or NaNs appeared, or the page logged
//         an error, or (with --gl-errors) GL did
//
// NEAR exits 0 deliberately: the alternative is a gate that is red
// forever, which is a gate nobody reads. It is never silent — every NEAR
// prints its deltas and the summary banner counts them.
//
// INVARIANTS. scenarios.json also carries an `invariants` list: cross-
// checkpoint and cross-scenario relations that must hold WITHIN a run
// (kaleido is display-only, so its sim hashes must equal plain-stroke's).
// They need no goldens, so they are checked in --record mode too — a
// recording that violates its own invariants is a bad recording, and
// this suite shipped one (see the freeze invariant's note).
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
// CLI beats env beats default, so a one-off run can widen a tolerance
// without editing the file and CI can pin one without editing the
// command. A garbage value is worse than no value: fall through rather
// than silently comparing against NaN (NaN <= anything is false, which
// would turn every NEAR into a FAIL and look like a real regression).
function tol(flag, envName, def) {
    const raw = argv(flag, process.env[envName]);
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : def;
}

// ── Scalar tolerances ──────────────────────────────────────────────────
// Applied as the numpy-allclose form: |actual - golden| <= ABS + REL·
// |golden|. REL carries the decision at these magnitudes (meanLum runs
// 0.08–0.49, coverage 0.22–0.74); ABS only keeps a near-zero checkpoint
// from being judged on a ratio of noise to noise.
//
// MEASURED, 2026-08-26, over every regression-*.json in results/ against
// goldens/goldens.json (see the two comparisons below; nothing here is a
// guess):
//
//   Same boot, back-to-back runs (08-23 09-33/34/35, 08-24 15-05/06/06,
//   and six single-scenario runs at 08-24 15-07/08). The dye hash
//   differs on EVERY checkpoint of EVERY pair — and the scalars agree to
//   the recorded 5 decimals on 9 of 11 checkpoints, |Δ| <= 0.00001.
//   The two that move: multi-arm-radial (|Δcov| 0.00241 = 0.28%,
//   |Δlum| 0.00021 = 0.04%) and pointer-stroke, which is not noise at
//   all — see its scenario comment.
//
//   Cross-boot, same code (goldens 08-21T08-11-22 vs the 08-21T08-21-29
//   run ten minutes later): 8 of 11 checkpoints exactly 0.00000 on both
//   scalars, the rest at plain-stroke +1.00% cov / +1.04% lum and
//   multi-arm-radial -0.40% cov / -1.02% lum. That 1.04% is the highest
//   same-code figure in the whole results/ directory and is the noise
//   floor these numbers are set above.
//
// So: REL 2%, a shade under 2× the measured floor. For contrast, the
// runs that carried real code change (08-23, 08-24) sit at 15–55% cov
// and 27–116% lum — two orders away from the tolerance, so nothing about
// this softens the gate's ability to see an actual regression.
const TOL_MEANLUM_REL  = tol('tol-lum-rel', 'FLUID_TEST_TOL_LUM_REL', 0.02);
const TOL_MEANLUM_ABS  = tol('tol-lum-abs', 'FLUID_TEST_TOL_LUM_ABS', 0.001);
const TOL_COVERAGE_REL = tol('tol-cov-rel', 'FLUID_TEST_TOL_COV_REL', 0.02);
const TOL_COVERAGE_ABS = tol('tol-cov-abs', 'FLUID_TEST_TOL_COV_ABS', 0.001);
// dyeMean/velMean are recorded from 2026-08-26 on and are NOT in the
// committed goldens, so they are skipped on every comparison until the
// next recording. No measured floor exists for them yet; they ride the
// coverage numbers until one does. velMean matters most: velocity has no
// other magnitude instrument, which is why the freeze invariant can
// currently only say "the hash moved" about the field that freeze is
// supposed to be holding still.
const TOL_FIELDMEAN_REL = tol('tol-mean-rel', 'FLUID_TEST_TOL_MEAN_REL', 0.02);
const TOL_FIELDMEAN_ABS = tol('tol-mean-abs', 'FLUID_TEST_TOL_MEAN_ABS', 0.001);

// The scalars a checkpoint carries, and which instrument each belongs to
// — the sim/look split is the suite's central mental model (GUIDANCE §2)
// and the report keeps them labelled so "did this dim the image?" and
// "did the physics move?" stay separate questions.
const SCALARS = [
    { key: 'coverage', side: 'sim',  rel: TOL_COVERAGE_REL,  abs: TOL_COVERAGE_ABS },
    { key: 'dyeMean',  side: 'sim',  rel: TOL_FIELDMEAN_REL, abs: TOL_FIELDMEAN_ABS },
    { key: 'velMean',  side: 'sim',  rel: TOL_FIELDMEAN_REL, abs: TOL_FIELDMEAN_ABS },
    { key: 'meanLum',  side: 'look', rel: TOL_MEANLUM_REL,   abs: TOL_MEANLUM_ABS },
];

// One scalar, compared and rendered. `within` is the whole judgement;
// `text` is the line a reviewer reads to answer "how much".
function compareScalar(spec, g, a) {
    if (typeof g !== 'number' || typeof a !== 'number') return null;  // absent in an older golden
    const d = a - g;
    const limit = spec.abs + spec.rel * Math.abs(g);
    const pct = g !== 0 ? (d / g) * 100 : (d !== 0 ? Infinity : 0);
    const sign = v => (v >= 0 ? '+' : '');
    return {
        key: spec.key, side: spec.side, delta: d, within: Math.abs(d) <= limit,
        text: `${spec.key} ${g.toFixed(5)} → ${a.toFixed(5)}, Δ${sign(d)}${d.toFixed(5)} ` +
              `(${sign(pct)}${pct.toFixed(2)}%, limit ±${limit.toFixed(5)})`,
    };
}

// PASS / NEAR / FAIL for one checkpoint against its golden.
function classify(cp, gcp) {
    const simDiff = cp.dye !== gcp.dye || cp.vel !== gcp.vel;
    const lookDiff = cp.display !== gcp.display;
    const scalars = SCALARS.map(s => compareScalar(s, gcp[s.key], cp[s.key])).filter(Boolean);
    const out = { simDiff, lookDiff, scalars, reasons: [] };

    // NaN first and unconditionally. A NaN field is not a magnitude
    // question — it is the destruction class this suite was built to
    // catch, and fp16 pressure blowups (04a:416) produce exactly this.
    if (cp.nan > 0) {
        out.verdict = 'FAIL';
        out.reasons.push(`${cp.nan} NaN texel(s) in the fields (golden had ${gcp.nan || 0})`);
        return out;
    }
    if (!simDiff && !lookDiff) { out.verdict = 'PASS'; return out; }

    const outside = scalars.filter(s => !s.within);
    if (outside.length) {
        out.verdict = 'FAIL';
        outside.forEach(s => out.reasons.push(s.text));
        return out;
    }
    // Hashes moved, every scalar held. Either a genuine sub-tolerance
    // change or one of the GUIDANCE §4 residuals; the deltas say which.
    out.verdict = scalars.length ? 'NEAR' : 'FAIL';
    if (!scalars.length) out.reasons.push('hashes differ and the golden carries no scalars to fall back on');
    return out;
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
            case 'glcheck':  if (T.glErrorCheck) T.glErrorCheck(a.on !== false); return Promise.resolve();
            case 'snapshot': {
                var s = T.snapshotState({ display: true });
                checkpoints.push({
                    name: a.name || ('cp' + checkpoints.length),
                    dye: s.dye.hash, vel: s.vel && s.vel.hash,
                    display: s.display.hash,
                    nan: (s.dye.nan || 0) + ((s.vel && s.vel.nan) || 0),
                    coverage: +s.dye.coverage.toFixed(5),
                    // Field means, recorded from 2026-08-26. coverage is a
                    // THRESHOLD count (texels over 0.01) — it says how far
                    // the dye spread, never how strong it is, so a uniform
                    // dimming moves it not at all. velMean is the only
                    // magnitude the velocity field has ever had here; until
                    // it lands in a golden, every velocity question in this
                    // suite can only be answered "the hash moved".
                    dyeMean: +s.dye.mean.toFixed(5),
                    velMean: s.vel ? +s.vel.mean.toFixed(5) : undefined,
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
    // GL sweep on BEFORE setup, not after: the shared policy does real GL
    // work — the resolution selects realloc every FBO, layers are deleted
    // by index, the obstacle texture is wiped — and an error raised in
    // there is a finding, not background to be discarded. Off again on
    // the way out so the next scenario is not silently paying for it.
    if (S.glErrors && T.glErrorCheck) T.glErrorCheck(true);
    function finish(extra) {
        T.unseed();
        if (S.glErrors && T.glErrorCheck) T.glErrorCheck(false);
        var out = { name: S.name, checkpoints: checkpoints, pageErrors: T.errors(true) };
        if (S.glErrors && T.glErrors) out.glErrors = T.glErrors(true);
        if (extra) out.error = extra;
        return out;
    }
    return T.freeze().then(setup).then(function () {
        var chain = Promise.resolve();
        (S.actions || []).forEach(function (a) {
            chain = chain.then(function () { return doAction(a); });
        });
        return chain;
    }).then(function () {
        return finish(null);
    }, function (e) {
        return finish(String(e && e.message || e));
    });
})()`;
}

// ── Cross-checkpoint invariants ────────────────────────────────────────
// Relations that must hold WITHIN one run, whatever the goldens say —
// "kaleido is a display pass, so its sim hashes are plain-stroke's".
// Two of these were written as prose comments in scenarios.json the day
// the suite was built and never checked by anything; the freeze one has
// been false in the committed goldens since the minute they were
// recorded, and nobody could see it because nothing looked.
//
// They are the only assertions in this file that a stale golden cannot
// invalidate, which is why they also run under --record: a recording
// that contradicts its own invariants is a recording of a broken build,
// and shipping one is how a suite starts lying.
const FIELD_SCALARS = { dye: ['coverage', 'dyeMean'], vel: ['velMean'], display: ['meanLum'] };
const SCALAR_SPEC = SCALARS.reduce((m, s) => { m[s.key] = s; return m; }, {});

function findCheckpoint(results, ref) {
    const r = results.find(x => x.name === (ref || {}).scenario);
    return r ? (r.checkpoints || []).find(c => c.name === ref.checkpoint) || null : null;
}

function checkInvariant(inv, results) {
    const A = findCheckpoint(results, inv.left);
    const B = findCheckpoint(results, inv.right);
    if (!A || !B) {
        const miss = A ? inv.right : inv.left;
        return { verdict: 'SKIP', lines: [`${miss.scenario}/${miss.checkpoint} did not run (--only?)`] };
    }
    const RANK = { PASS: 0, NEAR: 1, FAIL: 2 };
    let verdict = 'PASS';
    const worse = v => { if (RANK[v] > RANK[verdict]) verdict = v; };
    const lines = [];

    for (const field of Object.keys(inv.assert || {})) {
        const want = inv.assert[field];
        const same = A[field] === B[field];
        if (want === 'differ') {
            if (same) { worse('FAIL'); lines.push(`${field}: expected DIFFERENT, both are ${A[field]}`); }
            else lines.push(`${field}: differs as required (${A[field]} vs ${B[field]})`);
            continue;
        }
        if (want !== 'equal') { worse('FAIL'); lines.push(`${field}: unknown assertion '${want}'`); continue; }
        if (same) { lines.push(`${field}: identical (${A[field]})`); continue; }
        // The hash moved. Size it with whatever magnitude the field has —
        // and say plainly when it has none rather than implying a verdict
        // the data does not support.
        const backing = (FIELD_SCALARS[field] || [])
            .map(k => compareScalar(SCALAR_SPEC[k], A[k], B[k])).filter(Boolean);
        if (!backing.length) {
            worse('FAIL');
            lines.push(`${field}: ${A[field]} → ${B[field]}, and no scalar in these checkpoints can size it`);
            continue;
        }
        worse(backing.some(s => !s.within) ? 'FAIL' : 'NEAR');
        lines.push(`${field}: ${A[field]} → ${B[field]} — ` + backing.map(s => s.text).join('; '));
    }
    return { verdict, lines };
}

function reportInvariants(invariants, results, strict) {
    if (!invariants.length) return { fail: 0, near: 0 };
    console.log('\ninvariants (checked against THIS run, not the goldens)');
    let fail = 0, near = 0, pass = 0, skip = 0;
    for (const inv of invariants) {
        const raw = checkInvariant(inv, results);
        // --strict means bit-identity or nothing, and an invariant NEAR is
        // the same animal as a checkpoint NEAR — hashes apart, scalars
        // together. Escalating both keeps one flag from meaning two things.
        const r = (strict && raw.verdict === 'NEAR')
            ? { verdict: 'FAIL', lines: raw.lines.concat(['--strict: a NEAR is a FAIL']) } : raw;
        const mark = { PASS: '✓', NEAR: '≈', FAIL: '✗', SKIP: '~' }[r.verdict];
        console.log(`${mark} ${r.verdict.padEnd(4)} ${inv.name}`);
        r.lines.forEach(l => console.log(`         ${l}`));
        // The notes are long by design — they carry the mechanism and the
        // source refs so a failure explains itself without a code read.
        // A SKIP has no finding to explain, so it does not get one.
        if ((r.verdict === 'NEAR' || r.verdict === 'FAIL') && inv.note) console.log(`         note: ${inv.note}`);
        if (r.verdict === 'FAIL') fail++;
        else if (r.verdict === 'NEAR') near++;
        else if (r.verdict === 'SKIP') skip++;
        else pass++;
    }
    console.log(`  ${pass} held, ${near} near, ${fail} broken, ${skip} skipped`);
    return { fail, near };
}

async function main() {
    const port = parseInt(argv('port', '9333'), 10);
    const only = argv('only', null);
    const strict = arg('strict');
    const glSweep = arg('gl-errors');
    const spec = JSON.parse(fs.readFileSync(SCEN, 'utf8'));
    const scenarios = spec.scenarios
        .filter(s => !only || s.name === only)
        .map(s => (glSweep ? Object.assign({}, s, { glErrors: true }) : s));
    const invariants = (spec.invariants || []);

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
            (r.pageErrors.length ? ` (${r.pageErrors.length} console errors!)` : '') +
            (r.glErrors && r.glErrors.length ? ` (${r.glErrors.length} GL errors!)` : ''));
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
        // Invariants still run: they compare this run to itself, so they
        // are the one check that says anything about a build with no
        // reference yet. Recording over a broken relation is how the
        // 2026-08-21 goldens froze a false freeze invariant into the
        // repo, and the exit code is the only thing that would have
        // stopped it. The file is written either way — the caller asked
        // for a recording and got one; the code says whether to trust it.
        const inv = reportInvariants(invariants, results, strict);
        if (inv.fail) {
            console.log(`\n⚠ the goldens above were WRITTEN, but ${inv.fail} invariant(s) do not hold in`);
            console.log('  the build that produced them. Fix the build or the invariant before');
            console.log('  treating this file as a reference.');
        }
        process.exit(inv.fail ? 1 : 0);
    }

    if (!fs.existsSync(GOLD)) {
        console.log('\nno goldens yet — run with --record on a known-good build first');
        process.exit(2);
    }
    const gold = JSON.parse(fs.readFileSync(GOLD, 'utf8'));
    // Goldens recorded before 2026-08-26 have no dyeMean/velMean. Say so
    // once: a scalar that is silently skipped looks exactly like a scalar
    // that passed, and "the velocity field was checked" is the kind of
    // thing a reader will assume unless told otherwise.
    const goldHasFieldMeans = gold.results.some(r =>
        (r.checkpoints || []).some(c => typeof c.dyeMean === 'number'));
    if (!goldHasFieldMeans) {
        console.log(`\nnote: goldens (${gold.recorded}) predate dyeMean/velMean — those two are`);
        console.log('      skipped below, so velocity is judged on hash equality alone.');
    }

    let fail = 0, near = 0, pass = 0;
    for (const r of results) {
        // A scenario that threw never produced the checkpoints it was
        // meant to; the old loop walked its (empty) list and counted
        // nothing, so a scenario could die in silence and the suite still
        // exit 0. It cannot now.
        if (r.error) { fail++; console.log(`✗ FAIL ${r.name}: scenario errored — ${r.error}`); }
        // Errors are judged before the golden lookup, not after it: a brand
        // new scenario has no golden to compare against, and under the old
        // ordering its `continue` skipped these too — so the first run of a
        // scenario was the one run that could not report a console error.
        if (r.pageErrors && r.pageErrors.length) {
            fail++;
            console.log(`✗ FAIL ${r.name}: console errors: ${r.pageErrors.join(' | ').slice(0, 300)}`);
        }
        if (r.glErrors && r.glErrors.length) {
            fail++;
            // First few only: one bad bind usually raises the same flag on
            // every frame after it, and 60 identical lines bury the frame
            // index that actually localizes it.
            const shown = r.glErrors.slice(0, 5)
                .map(e => `${e.name} at ${e.where} ${e.frame}`).join(', ');
            console.log(`✗ FAIL ${r.name}: ${r.glErrors.length} GL error(s): ${shown}` +
                (r.glErrors.length > 5 ? ` … (+${r.glErrors.length - 5} more)` : ''));
        }
        const g = gold.results.find(x => x.name === r.name);
        if (!g) { console.log(`~ ${r.name}: no golden (new scenario)`); continue; }
        for (const cp of r.checkpoints) {
            const gcp = (g.checkpoints || []).find(x => x.name === cp.name);
            if (!gcp) { console.log(`~ ${r.name}/${cp.name}: no golden checkpoint`); continue; }
            const v = classify(cp, gcp);
            const verdict = (v.verdict === 'NEAR' && strict) ? 'FAIL' : v.verdict;
            if (verdict === 'PASS') { pass++; continue; }
            verdict === 'FAIL' ? fail++ : near++;
            const mark = verdict === 'FAIL' ? '✗' : '≈';
            console.log(`${mark} ${verdict} ${r.name}/${cp.name}: ` +
                (v.simDiff ? `SIM moved (dye ${gcp.dye}→${cp.dye}, vel ${gcp.vel}→${cp.vel})` : 'sim identical') +
                ', ' + (v.lookDiff ? `LOOK moved (${gcp.display}→${cp.display})` : 'look identical'));
            // Every scalar, not only the offending one: "meanLum held at
            // +0.02% while coverage jumped 40%" is a different diagnosis
            // from "both moved together", and the reader needs both to
            // tell a dimming from a spreading.
            v.scalars.forEach(s => console.log(`         ${s.within ? ' ' : '!'} [${s.side}] ${s.text}`));
            v.reasons.filter(x => !v.scalars.some(s => s.text === x))
                .forEach(x => console.log(`         ! ${x}`));
            if (v.verdict === 'NEAR' && strict) console.log('         ! --strict: a NEAR is a FAIL');
        }
    }

    const inv = reportInvariants(invariants, results, strict);
    fail += inv.fail;
    near += inv.near;

    console.log(`\n${pass} pass, ${near} near, ${fail} fail` +
        `  (tolerance: |Δ| <= abs + rel·|golden|; meanLum ${TOL_MEANLUM_ABS} + ` +
        `${(TOL_MEANLUM_REL * 100).toFixed(1)}%, coverage ${TOL_COVERAGE_ABS} + ` +
        `${(TOL_COVERAGE_REL * 100).toFixed(1)}%)`);
    // A NEAR exits 0 so the gate can be green and therefore worth
    // reading — but silence would make it worthless in the other
    // direction, so it gets its own banner and never merges into the
    // pass count.
    if (near && !fail) {
        console.log(`\n≈ ${near} NEAR — hashes moved, every scalar held inside tolerance.`);
        console.log('  Exiting 0. This is either sub-tolerance drift or one of the two open');
        console.log('  determinism residuals (GUIDANCE §4); the deltas above say which.');
        console.log('  --strict fails on these instead.');
    }
    if (!fail && !near) console.log('all scenarios match goldens');
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
