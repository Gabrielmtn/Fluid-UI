// PhotoSafe limiter regression (js/05b photoSafe* shaders, js/05i applyPhotoSafe),
// headless Chrome against the repo's own files:
//   node scripts/test/photosafe/run.js            (all)
//   node scripts/test/photosafe/run.js square     (cases whose name starts so)
// Reuses the radial menu's driver (own static server, clean profile, the
// warning already answered). REPORT= writes the markdown report there.
// Exit code 1 if any check failed.
//
// How it drives the limiter: each case runs inside ONE page evaluation (the
// live rAF loop would otherwise release the envelope between calls). Every
// frame it clears safeFrame to the case's colour, runs applyPhotoSafe() with
// config.PHOTOSAFE_DT_OVERRIDE pinned to the case's refresh rate, and reads
// back what was presented (safeOut.read, the frame blitted to the canvas)
// plus the limiter state. The measurement is NOT the shader's own: presented
// pixels go through the real sRGB curve into WCAG relative luminance, and
// flashes are counted the way WCAG 2.3.1 defines them: opposing swings of
// 10% or more between local extremes, the darker state under 0.80; red
// transitions are 0.20 swings of linear red where one end is saturated red
// (R/(R+G+B) >= 0.8). Pass = at most 3 flashes (6 transitions) in every
// sliding one-second window once the first second is over. The first
// second is reported, not judged: the limiter detects flicker by its rate,
// so it cannot act before the flicker has started.
//
// The paint controls run the real frame loop instead (harness.js frozen
// clock): a stroke laid down dab by dab must pass through bit-identical, and
// four seconds of hard scribbling must never engage suppression.
// REPORT.md beside this file has the before/after table for the v3 detector.
'use strict';
const fs = require('fs');
const path = require('path');
const { boot, sleep } = require('../radial-menu/driver');

const results = [];
const report = [];
function check(name, ok, detail) {
    results.push({ name, ok: !!ok });
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}

const WHITE = [1, 1, 1], BLACK = [0, 0, 0], RED = [1, 0, 0];
// Pure green at the luminance of pure red: only the red rule can see this one.
const GREEN_ISO = [0, 0.533, 0];

// kind: square | sine. a/b: display (sRGB-encoded) colours. area: fraction of
// the canvas that strobes (centred rectangle, rest black). Seconds: 3, so two
// full judged seconds follow the first.
const CASES = [
    { name: 'square 3 Hz white/black (at the line)', kind: 'square', hz: 3, fps: 60, a: WHITE, b: BLACK, atLine: true },
    { name: 'square 6 Hz white/black', kind: 'square', hz: 6, fps: 60, a: WHITE, b: BLACK, envelope: true },
    { name: 'square 10 Hz white/black', kind: 'square', hz: 10, fps: 60, a: WHITE, b: BLACK, envelope: true },
    { name: 'square 20 Hz white/black', kind: 'square', hz: 20, fps: 60, a: WHITE, b: BLACK, envelope: true },
    { name: 'square 6 Hz white/black at 144 Hz', kind: 'square', hz: 6, fps: 144, a: WHITE, b: BLACK, envelope: true },
    { name: 'square 6 Hz on 10% of the canvas', kind: 'square', hz: 6, fps: 60, a: WHITE, b: BLACK, area: 0.10, envelope: true },
    { name: 'red 6 Hz red/black', kind: 'square', hz: 6, fps: 60, a: RED, b: BLACK, red: true },
    { name: 'red 6 Hz red/green, equal luminance', kind: 'square', hz: 6, fps: 60, a: RED, b: GREEN_ISO, red: true },
    { name: 'sine 4 Hz white/black', kind: 'sine', hz: 4, fps: 60, a: WHITE, b: BLACK },
    { name: 'sine 6 Hz white/black', kind: 'sine', hz: 6, fps: 60, a: WHITE, b: BLACK },
    { name: 'sine 4 Hz white/black at 144 Hz', kind: 'sine', hz: 4, fps: 144, a: WHITE, b: BLACK },
    { name: 'sine 6 Hz white/black at 144 Hz', kind: 'sine', hz: 6, fps: 144, a: WHITE, b: BLACK },
    { name: 'sine 4 Hz mid-grey swing', kind: 'sine', hz: 4, fps: 60, a: [0.85, 0.85, 0.85], b: [0.45, 0.45, 0.45] },
    { name: 'sine 4 Hz mid-grey swing at 144 Hz', kind: 'sine', hz: 4, fps: 144, a: [0.85, 0.85, 0.85], b: [0.45, 0.45, 0.45] },
    { name: 'sine 4 Hz light-grey swing', kind: 'sine', hz: 4, fps: 60, a: [0.85, 0.85, 0.85], b: [0.55, 0.55, 0.55] },
    { name: 'sine 2.5 Hz white/black (permitted)', kind: 'sine', hz: 2.5, fps: 60, a: WHITE, b: BLACK, permitted: true },
];
const SECONDS = 3;

// ── Page side: one case, one evaluation ──────────────────────────────
function pageCase(spec) {
    return `(function (spec) {
        var ps = window.__getPhotoSafe();
        if (!ps || !ps.frame) return { error: 'no PhotoSafe buffers (protection off at boot?)' };
        var W = ps.frame.width, H = ps.frame.height;
        var rx = 0, ry = 0, rw = W, rh = H;
        if (spec.area) { var s = Math.sqrt(spec.area); rw = Math.round(W * s); rh = Math.round(H * s); rx = (W - rw) >> 1; ry = (H - rh) >> 1; }
        var sx = rx + (rw >> 1), sy = ry + (rh >> 1);
        var dt = 1 / spec.fps, n = Math.round(spec.seconds * spec.fps);
        config.PHOTOSAFE_DT_OVERRIDE = dt;
        resetPhotoSafeState();
        var px = new Uint8Array(4), st = new Float32Array(8);
        var inp = [], out = [], env = [], rate = [];
        for (var i = 0; i < n; i++) {
            var t = i * dt, k;
            if (spec.kind === 'square') k = (Math.floor(t * spec.hz * 2) % 2 === 0) ? 1 : 0;
            else k = 0.5 + 0.5 * Math.sin(2 * Math.PI * spec.hz * t);
            var c = [0, 1, 2].map(function (j) { return spec.b[j] + (spec.a[j] - spec.b[j]) * k; });
            gl.bindFramebuffer(gl.FRAMEBUFFER, ps.frame.fbo);
            gl.disable(gl.SCISSOR_TEST);
            if (spec.area) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.enable(gl.SCISSOR_TEST); gl.scissor(rx, ry, rw, rh); }
            gl.clearColor(c[0], c[1], c[2], 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.disable(gl.SCISSOR_TEST);
            gl.bindFramebuffer(gl.FRAMEBUFFER, ps.frame.fbo);
            gl.readPixels(sx, sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            inp.push([px[0], px[1], px[2]]);
            applyPhotoSafe();
            gl.bindFramebuffer(gl.FRAMEBUFFER, ps.out.read.fbo);
            gl.readPixels(sx, sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
            out.push([px[0], px[1], px[2]]);
            gl.bindFramebuffer(gl.FRAMEBUFFER, ps.stats.read.fbo);
            gl.readPixels(0, 0, 2, 1, gl.RGBA, gl.FLOAT, st);
            env.push(st[0]); rate.push(st[6]);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        delete config.PHOTOSAFE_DT_OVERRIDE;
        resetPhotoSafeState();
        return { inp: inp, out: out, env: env, rate: rate, size: W + 'x' + H };
    })(${JSON.stringify(spec)})`;
}

// ── Measurement: WCAG relative luminance and flash counting ──────────
const lin8 = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = (p) => 0.2126 * lin8(p[0]) + 0.7152 * lin8(p[1]) + 0.0722 * lin8(p[2]);
const satRed = (p) => { const r = lin8(p[0]), g = lin8(p[1]), b = lin8(p[2]); return r + g + b > 0 && r / (r + g + b) >= 0.8; };

// Opposing swings between local extremes ("zig-zag"): a transition is
// recorded when the value moves `thr` or more against the running extreme.
function transitions(vals, ok, thr) {
    const out = [];
    let ext = vals[0], extI = 0, dir = 0;
    for (let i = 1; i < vals.length; i++) {
        const v = vals[i];
        if ((dir === 1 && v > ext) || (dir === -1 && v < ext)) { ext = v; extI = i; continue; }
        const d = v - ext;
        if (Math.abs(d) >= thr && ok(i, extI)) {
            const nd = Math.sign(d);
            if (nd !== dir) { out.push({ i, swing: Math.abs(d) }); dir = nd; ext = v; extI = i; }
        }
    }
    return out;
}
function flashStats(tr, fps, n) {
    const win = fps, judgeFrom = fps;
    let maxJudged = 0, first = 0;
    for (let s = 0; s + win <= n; s++) {
        const c = tr.filter((x) => x.i >= s && x.i < s + win).length / 2;
        if (s === 0) first = c;
        if (s >= judgeFrom) maxJudged = Math.max(maxJudged, c);
    }
    const judged = tr.filter((x) => x.i >= judgeFrom);
    return { maxFlashesPerSec: maxJudged, firstSecond: first, maxSwing: judged.reduce((m, x) => Math.max(m, x.swing), 0) };
}
function measure(frames, fps) {
    const L = frames.map(lum);
    const R = frames.map((p) => lin8(p[0]));
    const general = transitions(L, (i, j) => Math.min(L[i], L[j]) < 0.80, 0.10);
    const red = transitions(R, (i, j) => satRed(frames[i]) || satRed(frames[j]), 0.20);
    return { general: flashStats(general, fps, frames.length), red: flashStats(red, fps, frames.length) };
}
const r3 = (x) => Math.round(x * 1000) / 1000;

// ── Paint controls: the real loop, frozen clock ──────────────────────
// gentle: one stroke drawn over a second, must be bit-identical.
// hard: four seconds of fast scribbling in alternating bright colours
// across the whole canvas, the motion most likely to read as flicker.
// Painting must never engage the limiter (that was the v1 ghosting bug).
const HARNESS = fs.readFileSync(path.join(__dirname, '..', 'harness.js'), 'utf8');
const PAINT = (mode) => `(async function (mode) {
    var ps = window.__getPhotoSafe();
    await __test.freeze();
    __test.seed(0xC0FFEE);
    __test.clear();
    await __test.step(30);
    var W = ps.frame.width, H = ps.frame.height;
    var a = new Uint8Array(W * H * 4), b = new Uint8Array(W * H * 4), st = new Float32Array(8);
    var frames = 0, differing = 0, worst = 0, maxEnv = 0, envFrames = 0, lit = 0;
    var pts = [[0.15, 0.70], [0.40, 0.40], [0.62, 0.62], [0.88, 0.32]];
    function bez(t) { var u = 1 - t; return [0, 1].map(function (k) { return u*u*u*pts[0][k] + 3*u*u*t*pts[1][k] + 3*u*t*t*pts[2][k] + t*t*t*pts[3][k]; }); }
    var cols = [[1, 1, 1], [1, 0.1, 0.1], [0.1, 0.9, 1]];
    var total = mode === 'hard' ? 270 : 90;
    for (var f = 0; f < total; f++) {
        if (mode === 'gentle' && f < 60) {
            // two dabs a frame: a stroke drawn over a second, not stamped at once
            for (var d = 0; d < 2; d++) {
                var t0 = (f * 2 + d) / 120, p = bez(t0), q = bez(Math.min(1, t0 + 0.01));
                var dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
                window.applyMultiSplatWith(p[0] * canvas.width, p[1] * canvas.height, dx / len * 300, dy / len * 300, [0.95, 0.85, 0.3], 1, 0.004, true);
            }
        } else if (mode === 'hard' && f < 240) {
            // a scribble sweeping the width ~3 times a second, drifting down
            // and back; a new colour every 1.3 s, like picking the next one
            // between strokes (a colour change several times a second is a
            // strobe, and suppressing that is the feature working)
            for (var d = 0; d < 6; d++) {
                var s = (f * 6 + d) / 360, ph = s * 3 * 2 * Math.PI;
                var x = 0.5 + 0.42 * Math.sin(ph), y = 0.5 + 0.35 * Math.sin(s * 2.1 * Math.PI) + 0.05 * Math.cos(ph * 2.3);
                var vx = Math.cos(ph) * 2600, vy = Math.sin(ph * 2.3) * 900;
                var col = cols[Math.floor(s / 1.3) % 3];
                window.applyMultiSplatWith(x * canvas.width, y * canvas.height, vx, vy, col, 1, 0.012, true);
            }
        }
        await __test.step(1);
        gl.bindFramebuffer(gl.FRAMEBUFFER, ps.frame.fbo);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, a);
        gl.bindFramebuffer(gl.FRAMEBUFFER, ps.out.read.fbo);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b);
        gl.bindFramebuffer(gl.FRAMEBUFFER, ps.stats.read.fbo);
        gl.readPixels(0, 0, 2, 1, gl.RGBA, gl.FLOAT, st);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        var n = 0, m = 0, on = 0;
        for (var i = 0; i < a.length; i += 4) {
            if (a[i] + a[i + 1] + a[i + 2] > 30) on++;
            for (var c = 0; c < 3; c++) { var e = Math.abs(a[i + c] - b[i + c]); if (e) { n++; if (e > m) m = e; } }
        }
        frames++; if (n) differing++; if (m > worst) worst = m; if (st[0] > maxEnv) maxEnv = st[0]; if (st[0] > 0) envFrames++;
        lit = Math.max(lit, on / (W * H));
    }
    __test.thaw();
    return { frames: frames, differing: differing, worstDelta: worst, maxEnvelope: maxEnv, envelopeFrames: envFrames, paintedShare: lit };
})(${JSON.stringify(mode)})`;

(async () => {
    const only = process.argv[2];
    const d = await boot();
    try {
        await d.ev('(function(){ if (typeof isPaused !== "undefined" && isPaused) togglePause(); if (window.QualityGovernor && QualityGovernor.setEnabled) QualityGovernor.setEnabled(false); return 1; })()');
        check('protection is on in a fresh profile', await d.ev('window.config.PHOTOSAFE === true && !!window.__getPhotoSafe().frame'));
        report.push('| case | refresh | judged max flashes/s | first second | max judged swing | red flashes/s | envelope @1s / @2s |', '|---|---|---|---|---|---|---|');
        for (const c of CASES) {
            if (only && !c.name.startsWith(only)) continue;
            const spec = Object.assign({ seconds: SECONDS }, c);
            const r = await d.ev(pageCase(spec));
            if (!r || r.error) { check(c.name + ': ran', false, r && r.error); continue; }
            const m = measure(r.out, c.fps);
            const raw = measure(r.inp, c.fps);
            const e1 = r3(r.env[c.fps - 1]), e2 = r3(r.env[2 * c.fps - 1]);
            report.push(`| ${c.name} | ${c.fps} Hz | ${m.general.maxFlashesPerSec} (raw ${raw.general.maxFlashesPerSec}) | ${m.general.firstSecond} | ${r3(m.general.maxSwing)} | ${m.red.maxFlashesPerSec} (raw ${raw.red.maxFlashesPerSec}) | ${e1} / ${e2} |`);
            if (c.permitted) {
                check(c.name + ': left alone (envelope stays under 0.1)', Math.max(...r.env) < 0.1, { maxEnvelope: r3(Math.max(...r.env)) });
                continue;
            }
            if (!c.atLine) check(c.name + ': the source really flashes (instrument check)', raw.general.maxFlashesPerSec > 3 || raw.red.maxFlashesPerSec > 3, { raw: raw.general.maxFlashesPerSec, rawRed: raw.red.maxFlashesPerSec });
            check(c.name + ': at most 3 flashes in any second after the first', m.general.maxFlashesPerSec <= 3, { flashes: m.general.maxFlashesPerSec, maxSwing: r3(m.general.maxSwing), firstSecond: m.general.firstSecond });
            if (c.red) check(c.name + ': at most 3 red flashes in any second after the first', m.red.maxFlashesPerSec <= 3, { red: m.red.maxFlashesPerSec, firstSecond: m.red.firstSecond });
            if (c.envelope) check(c.name + ': suppression fully engaged by 2 s', e2 >= 0.9, { at1s: e1, at2s: e2 });
        }

        if (!only || 'paint'.startsWith(only)) {
            const inst = await d.ev(HARNESS);
            if (!inst || inst.error) check('paint: harness installed', false, inst);
            else {
                const p = await d.ev(PAINT('gentle'));
                report.push('', `Paint control: ${p.frames} frames, ${p.differing} differing, worst channel delta ${p.worstDelta}, max envelope ${r3(p.maxEnvelope)}, painted ${(p.paintedShare * 100).toFixed(1)}% of the canvas.`);
                check('paint: the stroke is really on the canvas', p.paintedShare > 0.005, { paintedShare: r3(p.paintedShare) });
                check('paint: a stroke passes through bit-identical (envelope 0, no frame differs)', p.differing === 0 && p.maxEnvelope === 0, p);
                const h = await d.ev(PAINT('hard'));
                report.push(`Hard scribbling: ${h.frames} frames, ${h.differing} differing, worst channel delta ${h.worstDelta}, max envelope ${r3(h.maxEnvelope)} (${h.envelopeFrames} frames above 0), painted ${(h.paintedShare * 100).toFixed(1)}%.`);
                check('paint: hard scribbling never engages suppression', h.maxEnvelope === 0, h);
            }
        }

        const errs = d.events.filter((m) => m.method === 'Runtime.exceptionThrown').map((m) => m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text);
        check('no page exceptions', errs.length === 0, errs.slice(0, 3));
    } catch (e) {
        check('threw', false, e.message);
    } finally {
        await d.close();
    }
    console.log('\n' + report.join('\n'));
    if (process.env.REPORT) fs.writeFileSync(process.env.REPORT, '# PhotoSafe limiter regression\n\n' + report.join('\n') + '\n');
    const failed = results.filter((x) => !x.ok).length;
    console.log((results.length - failed) + '/' + results.length + ' pass');
    process.exit(failed ? 1 : 0);
})();
