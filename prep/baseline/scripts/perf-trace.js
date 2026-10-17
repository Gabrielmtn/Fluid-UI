// prep/baseline/scripts/perf-trace.js — F2 baseline: frame time, long tasks,
// layout / style / paint work per frame and forced synchronous layouts of the
// shipping UI, from a CDP performance trace of the web build in headless Chrome
// (prep/briefs/F-baselines.md, F2). Reads nothing the user owns, changes nothing
// outside prep/.
//
//   node prep/baseline/scripts/perf-trace.js            capture: 3 runs -> prep/baseline/perf/
//                                                       (run-<n>.json, trace-<n>.json.gz, summary.md)
//   node prep/baseline/scripts/perf-trace.js --check    one more run -> prep/work/perf-check/, then every
//                                                       gated metric is compared with the baseline:
//                                                       worse than mean + noise (noise = max - min over the
//                                                       three runs) is flagged; timing rows also need to
//                                                       clear a 2 % floor (--tolerance-pct N; 0 = the literal
//                                                       rule); exit 1 on any flag
//   --runs N            capture N runs instead of 3
//   --phase-seconds S   S seconds per phase instead of 20 (a smoke run; --check refuses a baseline
//                       captured with a different S)
//   --out DIR           write somewhere else (a smoke run that must not touch the baseline)
//   --summarize         rebuild summary.md from the run-<n>.json already in the output dir (no Chrome)
//   --check --baseline DIR     compare against another capture's run-<n>.json instead of prep/baseline/perf
//   --check --compare FILE     no new capture: compare that run JSON (an earlier --check's run-check.json)
//
// One run = one fresh headless Chrome through the repo driver
// (scripts/test/radial-menu/driver.js: own static server on the repo root, scratch
// profile with PhotoSafe / the startup fork / the first-run hint / the Reset-app
// note already answered, trusted input over CDP), closed in a finally. The run:
//
//   1. Emulation.setDeviceMetricsOverride 1440x900 @1 and a reload, so --ui-scale
//      and the canvas are computed for that viewport.
//   2. Environment: Browser.getVersion, the GPU renderer string
//      (WEBGL_debug_renderer_info UNMASKED_RENDERER_WEBGL and gl.RENDERER), viewport,
//      DPR, --ui-scale, fps cap, measured Hz, resolutions, the quality governor's
//      state, and window.__perf.probe() from scripts/test/perf-harness.js (injected
//      for its probe only; measure() and pin() are never called, pin() persists).
//   3. Wait for the governor's boot quality ascent to finish (dyeScale and simScale
//      back at 1, no framebuffer reinit pending, the sim drawing, no CSS animations)
//      and hold still for 3 s, or give up after 30 s and record the state it parked in.
//   4. One trusted mouse stroke across the canvas (Input.dispatchMouseEvent), so the
//      sim has dye to move.
//   5. Tracing.start with the brief's five categories (ReturnAsStream), then three
//      phases of PHASE_S seconds, each bracketed by performance.mark() so the trace
//      itself carries the boundaries (blink.user_timing):
//        idle1  nothing but the sim and the UI's own timers
//        drag   the left button held on the Fluid fader (#curl, the canonical range
//               input inside .mixer-channel[data-ui-key="Fluid"] .ch-fader) with ~60
//               trusted mouse moves a second sweeping its track (one full sweep every
//               4 s), the way a user drags a top-bar control
//        idle2  idle again (does the UI settle after the drag?)
//      A page-side timer samples window.__stats, the governor level and #curl every
//      500 ms for the whole trace (the same TimerFire in every phase and every run).
//   6. Tracing.end -> IO.read the stream -> trace-<n>.json.gz, then the metrics below.
//
// Nothing here calls an app setter that persists (GUIDANCE.md §2b): the only state
// changes are trusted pointer events on real controls inside the scratch profile.
// The governor is left exactly as shipped (QualityGovernor.setEnabled persists
// through settingsManager, so it is read, never written); its level is recorded at
// every phase boundary so a level change reads as what it is.
//
// Metrics per phase (renderer main thread, 'X' events plus paired B/E, nested by
// time; the compositor thread for DrawFrame):
//   interval        DrawFrame-to-DrawFrame (compositor) median / p95 / mean / max;
//                   also FireAnimationFrame starts and BeginMainThreadFrame
//   rafDur          FireAnimationFrame duration (the app's frame work on the main thread)
//   longTasks       top-level main-thread events longer than 50 ms (RunTask when the
//                   trace has it, else depth-0 events of any name)
//   perFrame        Layout, UpdateLayoutTree, Paint, PrePaint, Layerize, Commit,
//                   CompositeLayers, UpdateLayerTree, HitTest, EventDispatch,
//                   FunctionCall, TimerFire counts / FireAnimationFrame count
//   msPerFrame      the same as summed duration / frame, plus mainBusy (all depth-0 ms)
//   forced          Layout events nested inside a script event (FunctionCall,
//                   EventDispatch, TimerFire, FireAnimationFrame, ...) = forced
//                   synchronous layouts; Layout events carrying a stack trace
//                   (DevTools' "forced reflow" signal); UpdateLayoutTree inside
//                   script = forced style recalcs; InvalidateLayout and
//                   ScheduleStyleRecalculation counts
//   stats           window.__stats samples (fps, frametime, lastCpuMs, budgetPct)
//
// HEADLESS NUMBERS ARE RELATIVE. Headless Chrome paces rAF from its own 60 Hz
// BeginFrame source and renders on whatever GPU/ANGLE path it picks (recorded in
// env.glRenderer). The absolute values say nothing about Gabriel's machine or the
// Electron build; the point is the same capture before and after a CSS step on the
// same machine, with the run-to-run noise measured by three runs.
//
// electron-builder drops scripts/ and prep/ is untracked; nothing here ships.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const v8 = require('v8');
const { execSync, spawnSync } = require('child_process');

// A 60 s trace parses into well over a gigabyte of objects. Re-run with a big heap
// when the default would not hold it (the child inherits stdio and the exit code).
if (!process.env.PERF_TRACE_CHILD && v8.getHeapStatistics().heap_size_limit < 6 * 1024 * 1024 * 1024) {
    const r = spawnSync(process.execPath, ['--max-old-space-size=8192', __filename].concat(process.argv.slice(2)),
        { stdio: 'inherit', env: Object.assign({}, process.env, { PERF_TRACE_CHILD: '1' }) });
    process.exit(r.status == null ? 1 : r.status);
}

const { boot, sleep } = require('../../../scripts/test/radial-menu/driver');

const ROOT = path.resolve(__dirname, '../../..');
const BASE_DIR = path.join(ROOT, 'prep', 'baseline', 'perf');
const CHECK_DIR = path.join(ROOT, 'prep', 'work', 'perf-check');
const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
function argValue(flag, def) { const i = argv.indexOf(flag); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : def; }
const RUNS = CHECK ? 1 : Math.max(1, parseInt(argValue('--runs', '3'), 10) || 3);
const PHASE_S = Math.max(1, parseFloat(argValue('--phase-seconds', '20')) || 20);
const OUT_DIR = argValue('--out', null) ? path.resolve(argValue('--out', null)) : (CHECK ? CHECK_DIR : BASE_DIR);
// --check: timing rows (interval.*, frameWork.*, msPerFrame.*) get a relative floor on
// top of mean + noise; count rows (per-frame counts, forced layouts, long tasks) do not.
// MEASURED: the literal mean + noise rule failed 3 of 51 metrics on the second check of
// an unchanged app, by +0.2 %, +0.3 % and +0.8 % of the gate (28 µs on a 15.3 ms median,
// 1 µs on frame-work p95, 70 ns per frame of style recalc). Three runs bound 51 metrics
// too tightly for microsecond scheduling noise; 2 % lets those through and still flags a
// per-frame style recalc that grows by 0.05 ms (+200 %). Both verdicts are reported.
const TOL_PCT = Math.max(0, parseFloat(argValue('--tolerance-pct', '2')) || 0);
const TIMING_ROW = /^(interval|frameWork|msPerFrame)\./;
const VIEW = { w: 1440, h: 900 };
const MOVE_HZ = 60;             // trusted mouse moves per second while dragging
const SWEEP_S = 4;              // one full sweep of the fader's track every SWEEP_S seconds
const SAMPLE_MS = 500;          // page-side __stats sampler
const PHASES = ['idle1', 'drag', 'idle2'];
const CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink.user_timing', 'v8.execute'];
// Same extra seed as F0 / F3 / F4: the one-time Reset-app note (js/60-reset-app.js) would
// otherwise appear ~4 s into a quiet boot and add its own layout work to idle1.
const SEED = { 'swirlResetHint.v1': '1' };
// Faders to drag, in order of preference (the brief names #curl; the rest are the
// strip's other canonical faders, js/20-mixer-layout.js:829-853, used only if the
// Fluid cell is parked in the More panel at this width).
const FADER_PREFERENCE = ['curl', 'viscosity', 'velocityInfluence', 'colorBlend', 'timeScale', 'densityDissipation', 'velocityDissipation'];
const PERF_HARNESS = fs.readFileSync(path.join(ROOT, 'scripts', 'test', 'perf-harness.js'), 'utf8');

// Script-execution events: a Layout nested inside one of these is a forced
// synchronous layout (JS asked for geometry before the frame's own layout).
const SCRIPT_EVENTS = new Set(['FunctionCall', 'EvaluateScript', 'EventDispatch', 'TimerFire', 'FireAnimationFrame', 'RunMicrotasks',
    'v8.callFunction', 'V8.Execute', 'v8.run', 'v8.evaluateModule', 'FireIdleCallback', 'v8.compile', 'EvaluateModule']);
const COUNTED = ['Layout', 'UpdateLayoutTree', 'Paint', 'PrePaint', 'Layerize', 'Commit', 'CompositeLayers', 'UpdateLayerTree', 'HitTest', 'EventDispatch', 'FunctionCall', 'TimerFire'];
const MS_COUNTED = ['Layout', 'UpdateLayoutTree', 'Paint', 'PrePaint', 'Layerize', 'Commit', 'CompositeLayers', 'FunctionCall', 'EventDispatch'];

// The gate (--check): per phase, each of these is compared with baseline mean + noise;
// higher is worse for all of them.
const GATED = [
    ['interval.median', 'frame interval median (ms)'],
    ['interval.p95', 'frame interval p95 (ms)'],
    ['frameWork.p95', 'rAF frame work per tick p95 (ms)'],
    ['longTasks.count', 'long tasks > 50 ms'],
    ['perFrame.Layout', 'Layout / frame'],
    ['perFrame.UpdateLayoutTree', 'UpdateLayoutTree (style recalc) / frame'],
    ['perFrame.Paint', 'Paint / frame'],
    ['perFrame.PrePaint', 'PrePaint / frame'],
    ['perFrame.Layerize', 'Layerize / frame'],
    ['perFrame.Commit', 'Commit / frame'],
    ['perFrame.CompositeLayers', 'CompositeLayers / frame'],
    ['msPerFrame.Layout', 'Layout ms / frame'],
    ['msPerFrame.UpdateLayoutTree', 'UpdateLayoutTree ms / frame'],
    ['msPerFrame.Paint', 'Paint ms / frame'],
    ['msPerFrame.mainBusy', 'main thread busy ms / frame'],
    ['forced.layoutsPerFrame', 'forced synchronous layouts / frame'],
    ['forced.styleRecalcsPerFrame', 'forced style recalcs / frame']
];
const INFO = [
    ['frames.main', 'main-thread frames (BeginMainThreadFrame)'], ['frames.draw', 'DrawFrame count (compositor)'], ['frames.rafTicks', 'rAF ticks'], ['frames.rafCallbacks', 'rAF callbacks (FireAnimationFrame)'], ['frames.drawSerial', 'app frames drawn (__drawSerial delta)'],
    ['interval.mean', 'frame interval mean (ms)'], ['interval.max', 'frame interval max (ms)'],
    ['tickInterval.median', 'rAF tick interval median (ms)'], ['tickInterval.p95', 'rAF tick interval p95 (ms)'],
    ['frameWork.median', 'rAF frame work per tick median (ms)'], ['frameWork.max', 'rAF frame work per tick max (ms)'], ['rafCallbackDur.p95', 'single rAF callback p95 (ms)'],
    ['longTasks.maxMs', 'longest top-level task (ms)'],
    ['perFrame.UpdateLayerTree', 'UpdateLayerTree / frame'], ['perFrame.HitTest', 'HitTest / frame'], ['perFrame.EventDispatch', 'EventDispatch / frame'],
    ['perFrame.FunctionCall', 'FunctionCall / frame'], ['perFrame.TimerFire', 'TimerFire / frame'],
    ['msPerFrame.FunctionCall', 'FunctionCall ms / frame'], ['msPerFrame.EventDispatch', 'EventDispatch ms / frame'],
    ['forced.layoutsInScript', 'forced synchronous layouts (count)'], ['forced.layoutsWithStack', 'Layout events with a stack trace (count)'],
    ['forced.styleRecalcsInScript', 'forced style recalcs (count)'], ['forced.invalidateLayout', 'InvalidateLayout (count)'], ['forced.scheduleStyleRecalc', 'ScheduleStyleRecalculation (count)'],
    ['stats.fps.mean', '__stats.fps mean'], ['stats.frametime.median', '__stats.frametime median (ms)'], ['stats.cpu.median', '__stats.lastCpuMs median'], ['stats.cpu.p95', '__stats.lastCpuMs p95'], ['stats.budgetPct.median', '__stats.budgetPct median']
];

const problems = [];
function problem(msg) { problems.push(msg); console.log('PROBLEM ' + msg); }
function log(msg) { console.log(msg); }
function stamp() { return new Date().toISOString(); }

// ─── statistics ─────────────────────────────────────────────────────────────
function pct(sorted, p) {
    if (!sorted.length) return null;
    const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
    return sorted[i];
}
function summarize(arr) {
    if (!arr || !arr.length) return { n: 0, mean: null, median: null, p95: null, min: null, max: null };
    const s = arr.slice().sort((a, b) => a - b);
    let sum = 0; for (const x of s) sum += x;
    const r3 = x => x == null ? null : +x.toFixed(3);
    return { n: s.length, mean: r3(sum / s.length), median: r3(pct(s, 50)), p95: r3(pct(s, 95)), min: r3(s[0]), max: r3(s[s.length - 1]) };
}
function intervals(tsList) {
    const out = [];
    for (let i = 1; i < tsList.length; i++) out.push((tsList[i] - tsList[i - 1]) / 1000);
    return out;
}
function get(obj, dotted) {
    return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function fmt(v) {
    if (v == null) return '—';
    if (typeof v !== 'number') return String(v);
    if (Number.isInteger(v)) return String(v);
    return Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3);
}

// ─── page-side pieces ───────────────────────────────────────────────────────
const SAMPLER = `(function(){
    var P = window.__pt = window.__pt || {};
    P.samples = [];
    P.start = function () {
        P.samples = [];
        if (P.timer) clearInterval(P.timer);
        P.timer = setInterval(function () {
            var s = window.__stats || {};
            var Q = window.QualityGovernor;
            var c = document.getElementById('curl');
            P.samples.push({ t: performance.now(), fps: s.fps, frametime: s.frametime, cpu: s.lastCpuMs, budgetPct: s.budgetPct,
                draw: window.__drawSerial | 0, level: Q ? Q.getState().level : null, dyeScale: Q ? Q.dyeScale() : null, curl: c ? c.value : null });
        }, ${SAMPLE_MS});
        return true;
    };
    P.stop = function () { if (P.timer) clearInterval(P.timer); P.timer = null; return P.samples; };
    P.boundary = function (name) {
        performance.mark(name);
        var Q = window.QualityGovernor;
        var c = document.getElementById('curl');
        return { mark: name, perfNow: performance.now(), drawSerial: window.__drawSerial | 0,
            governor: Q ? Q.getState() : null, dyeScale: Q ? Q.dyeScale() : null, simScale: Q ? Q.simScale() : null,
            curl: c ? c.value : null, slowdownCell: !!document.getElementById('slowdownCell'),
            reinitPending: !!window.needsFramebufferReinit, anims: document.getAnimations().length };
    };
    return true;
})()`;

const ENV_EXPR = `(function(){
    var g = window.gl || null, unmasked = null, vendor = null, plain = null, version = null;
    try {
        if (g) { plain = g.getParameter(g.RENDERER); version = g.getParameter(g.VERSION);
            var dbg = g.getExtension('WEBGL_debug_renderer_info');
            if (dbg) { unmasked = g.getParameter(dbg.UNMASKED_RENDERER_WEBGL); vendor = g.getParameter(dbg.UNMASKED_VENDOR_WEBGL); } }
    } catch (_) {}
    var c = document.getElementById('canvas'), w = document.getElementById('canvas-wrapper');
    var Q = window.QualityGovernor, cfg = window.config || {};
    return { innerWidth: innerWidth, innerHeight: innerHeight, dpr: devicePixelRatio,
        uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim() || null,
        glRenderer: unmasked, glRendererPlain: plain, glVendor: vendor, glVersion: version,
        webgl2: !!(window.WebGL2RenderingContext && g instanceof window.WebGL2RenderingContext),
        canvas: c ? c.width + 'x' + c.height : null, wrapper: w ? w.clientWidth + 'x' + w.clientHeight : null,
        fpsCap: window.fpsCap, fpsCapLocked: !!window.__fpsCapLocked, displayHz: window.__displayHz, displayHzKnown: !!window.__displayHzKnown,
        dyeRes: cfg.DYE_RESOLUTION, simRes: cfg.SIM_RESOLUTION, pressureIters: cfg.PRESSURE_ITERATIONS, curlConfig: cfg.CURL,
        governor: Q ? Q.getState() : null, dyeScale: Q ? Q.dyeScale() : null, simScale: Q ? Q.simScale() : null,
        tiers: window.PerfTiers && window.PerfTiers.describe ? window.PerfTiers.describe() : null,
        leftFolded: !!(window.Sidebars && window.Sidebars.left && window.Sidebars.left.isCollapsed()),
        bodyClasses: document.body.className,
        openSections: Array.prototype.filter.call(document.querySelectorAll('.sidebar-section'), function (s) { return !s.classList.contains('collapsed'); }).map(function (s) { var t = s.querySelector('.section-title'); return t ? t.textContent.trim() : '?'; }),
        materialMode: (document.getElementById('materialMode') || {}).value || null, curl: (document.getElementById('curl') || {}).value || null,
        localStorageKeys: Object.keys(localStorage).length, hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory || null,
        userAgent: navigator.userAgent, stripParked: Array.prototype.map.call(document.querySelectorAll('#mixer-more-panel .mixer-channel'), function (ch) { return ch.dataset.uiKey; }) };
})()`;

const FADER_EXPR = `(function(prefs){
    for (var i = 0; i < prefs.length; i++) {
        var canonical = document.getElementById(prefs[i]);
        if (!canonical) continue;
        var ch = canonical.closest('.mixer-channel');
        if (!ch || !ch.closest('#mixer-strip')) continue;
        var inputs = Array.prototype.slice.call(ch.querySelectorAll('.ch-fader input[type="range"]'));
        var vis = inputs.filter(function (el) { return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; });
        if (!vis.length) continue;
        var el = vis[0], r = el.getBoundingClientRect();
        return { id: el.id, canonicalId: canonical.id, channel: ch.dataset.uiKey, label: ch.dataset.uiLabel || null, proxy: el !== canonical,
            rect: { x: r.left, y: r.top, w: r.width, h: r.height }, min: el.min, max: el.max, step: el.step, value: el.value,
            canonicalValue: canonical.value, name: el.getAttribute('aria-label') || null, fallback: i > 0 };
    }
    return null;
})(${JSON.stringify(FADER_PREFERENCE)})`;

// ─── waiting for a settled app ───────────────────────────────────────────────
// The governor boots the sim at a light effective resolution and steps up to the
// config target once measured fps proves out (js/08a-quality-governor.js BOOT_STAGES);
// the step is a framebuffer reinit. The trace must not start inside that.
async function waitSettled(d, maxMs) {
    const t0 = Date.now(); let stableSince = Date.now(); let last = null; const transitions = [];
    let s = null;
    while (Date.now() - t0 < maxMs) {
        s = await d.ev(`(function(){ var Q = window.QualityGovernor, st = window.__stats || {};
            return { dye: Q ? Q.dyeScale() : 1, sim: Q ? Q.simScale() : 1, level: Q ? Q.getState().level : 0, reinit: !!window.needsFramebufferReinit,
                     fps: st.fps || 0, draw: window.__drawSerial | 0, anims: document.getAnimations().length }; })()`);
        const key = [s.dye, s.sim, s.level, s.reinit, s.anims === 0].join('/');
        if (key !== last) { last = key; stableSince = Date.now(); transitions.push(Object.assign({ atS: +((Date.now() - t0) / 1000).toFixed(2) }, s)); }
        if (s.dye === 1 && s.sim === 1 && !s.reinit && s.fps > 0 && s.anims === 0 && Date.now() - stableSince >= 3000) {
            return { settled: true, seconds: +((Date.now() - t0) / 1000).toFixed(2), final: s, transitions };
        }
        await sleep(250);
    }
    return { settled: false, seconds: +((Date.now() - t0) / 1000).toFixed(2), final: s, transitions };
}

// ─── the stroke and the drag ─────────────────────────────────────────────────
// A move while the left button is held must say so in BOTH fields: `buttons: 1`
// is what the app's pointer handlers read, and `button: 'left'` is what Blink's
// native range-input drag needs to keep moving the thumb (MEASURED: with the
// driver's default `button: 'none'` the press snapped #curl to the click point
// and 175 held moves changed nothing; with 'left' the same moves dragged it).
// Same as Puppeteer's Mouse.move while a button is down.
const dragMove = (d, x, y) => d.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1, clickCount: 0, pointerType: 'mouse' });

async function paintStroke(d) {
    const r = await d.ev(`(function(){ var c = document.getElementById('canvas'); var b = c.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
    const N = 48; const pts = [];
    for (let i = 0; i <= N; i++) { const u = i / N; pts.push({ x: r.x + r.w * (0.2 + 0.6 * u), y: r.y + r.h * (0.5 + 0.22 * Math.sin(u * Math.PI * 2)) }); }
    const draw0 = await d.ev('window.__drawSerial | 0');
    await d.move(pts[0].x, pts[0].y); await d.down(pts[0].x, pts[0].y); await sleep(30);
    for (let i = 1; i < pts.length; i++) { await dragMove(d, pts[i].x, pts[i].y); await sleep(16); }
    await d.up(pts[N].x, pts[N].y);
    await sleep(300);
    const draw1 = await d.ev('window.__drawSerial | 0');
    return { canvasRect: r, points: pts.length, from: pts[0], to: pts[N], framesDrawnDuring: draw1 - draw0 };
}

function makeDragDriver(d, fader) {
    return async function (endAt) {
        const cy = fader.rect.y + fader.rect.h / 2;
        const x0 = fader.rect.x + 2, span = Math.max(1, fader.rect.w - 4);
        let x = x0 + span * 0.5;
        await d.move(x, cy); await d.down(x, cy); await sleep(20);
        const t0 = Date.now(); const period = 1000 / MOVE_HZ; let i = 0, maxGap = 0, last = t0;
        while (Date.now() < endAt - 60) {           // the release stays inside the phase
            const t = (Date.now() - t0) / 1000;
            const u = 0.5 + 0.48 * Math.sin(2 * Math.PI * t / SWEEP_S);
            x = x0 + u * span;
            await dragMove(d, x, cy);
            i++;
            const now = Date.now(); if (now - last > maxGap) maxGap = now - last; last = now;
            const wait = t0 + i * period - Date.now(); if (wait > 0) await sleep(wait);
        }
        await d.up(x, cy);
        const elapsed = (Date.now() - t0) / 1000;
        return { target: fader, moves: i, seconds: +elapsed.toFixed(2), achievedHz: +(i / elapsed).toFixed(1), targetHz: MOVE_HZ, maxGapMs: maxGap, sweepSeconds: SWEEP_S };
    };
}

// ─── tracing ─────────────────────────────────────────────────────────────────
async function startTracing(d) {
    await d.send('Tracing.start', {
        traceConfig: { recordMode: 'recordUntilFull', includedCategories: CATEGORIES },
        transferMode: 'ReturnAsStream', streamFormat: 'json', streamCompression: 'none', bufferUsageReportingInterval: 1000
    });
}
async function stopTracing(d) {
    await d.send('Tracing.end');
    let done = null;
    for (let i = 0; i < 1200 && !done; i++) { await sleep(100); done = d.events.find(e => e.method === 'Tracing.tracingComplete'); }
    if (!done) throw new Error('Tracing.tracingComplete never arrived');
    const usage = d.events.filter(e => e.method === 'Tracing.bufferUsage').map(e => (e.params && (e.params.percentFull != null ? e.params.percentFull : e.params.value)) || 0);
    const parts = [];
    for (;;) {
        const r = await d.send('IO.read', { handle: done.params.stream, size: 1 << 20 });
        parts.push(r.base64Encoded ? Buffer.from(r.data, 'base64') : Buffer.from(r.data, 'utf8'));
        if (r.eof) break;
    }
    await d.send('IO.close', { handle: done.params.stream }).catch(() => {});
    const buf = Buffer.concat(parts);
    return { text: buf.toString('utf8'), bytes: buf.length, bufferMaxPercent: usage.length ? Math.max.apply(null, usage) : null, dataLoss: !!done.params.dataLossOccurred };
}

// ─── analysis ────────────────────────────────────────────────────────────────
function analyse(events, boundaries, phaseSeconds) {
    const procNames = new Map(), threadNames = new Map(), fafByPid = new Map();
    let started = null;
    for (const e of events) {
        if (e.ph === 'M') {
            if (e.name === 'process_name' && e.args) procNames.set(e.pid, e.args.name);
            else if (e.name === 'thread_name' && e.args) threadNames.set(e.pid + ':' + e.tid, e.args.name);
            continue;
        }
        if (!started && e.name === 'TracingStartedInBrowser') started = e;
        if (e.name === 'FireAnimationFrame') fafByPid.set(e.pid, (fafByPid.get(e.pid) || 0) + 1);
    }
    let rendererPid = null, pidSource = null;
    if (started && started.args && started.args.data && Array.isArray(started.args.data.frames)) {
        const f = started.args.data.frames.find(fr => /index\.html/.test(fr.url || '')) || started.args.data.frames[0];
        if (f && f.processId != null) { rendererPid = f.processId; pidSource = 'TracingStartedInBrowser'; }
    }
    if (rendererPid == null || !fafByPid.has(rendererPid)) {
        let best = -1; for (const [pid, n] of fafByPid) if (n > best) { best = n; rendererPid = pid; }
        pidSource = 'most FireAnimationFrame events';
    }
    let mainTid = null, compositorTid = null;
    for (const [k, name] of threadNames) {
        const [pid, tid] = k.split(':').map(Number);
        if (pid !== rendererPid) continue;
        if (name === 'CrRendererMain') mainTid = tid; else if (name === 'Compositor') compositorTid = tid;
    }
    if (mainTid == null) {
        const byTid = new Map();
        for (const e of events) if (e.pid === rendererPid && e.name === 'FireAnimationFrame') byTid.set(e.tid, (byTid.get(e.tid) || 0) + 1);
        let best = -1; for (const [tid, n] of byTid) if (n > best) { best = n; mainTid = tid; }
    }

    // Phase windows from the user-timing marks (same clock as every other event).
    const marks = {};
    let traceStartTs = Infinity, traceEndTs = -Infinity;
    for (const e of events) {
        if (e.ph === 'M') continue;
        if (typeof e.ts === 'number') { if (e.ts < traceStartTs) traceStartTs = e.ts; const end = e.ts + (e.dur || 0); if (end > traceEndTs) traceEndTs = end; }
        if (e.pid === rendererPid && typeof e.name === 'string' && e.name.indexOf('pt:') === 0 && marks[e.name] == null) marks[e.name] = e.ts;
    }
    const windows = {}; let phaseSource = 'marks';
    for (const p of PHASES) {
        const a = marks['pt:' + p + ':start'], b = marks['pt:' + p + ':end'];
        if (a != null && b != null) windows[p] = { ts0: a, ts1: b };
    }
    if (Object.keys(windows).length !== PHASES.length) {
        // Fallback: the wall clock. boundaries[p].wallMs is Date.now() at each mark;
        // traceStartTs maps to the first boundary within ~100 ms.
        phaseSource = 'wallclock (marks missing: ' + PHASES.filter(p => !windows[p]).join(', ') + ')';
        const first = boundaries.idle1 && boundaries.idle1.begin && boundaries.idle1.begin.wallMs;
        for (const p of PHASES) {
            const b = boundaries[p];
            if (!b || !b.begin || !b.end || first == null) continue;
            windows[p] = { ts0: traceStartTs + (b.begin.wallMs - first) * 1000, ts1: traceStartTs + (b.end.wallMs - first) * 1000 };
        }
    }

    // Main-thread events, nested by time.
    const raw = [];
    for (const e of events) if (e.pid === rendererPid && e.tid === mainTid && (e.ph === 'X' || e.ph === 'B' || e.ph === 'E' || e.ph === 'I' || e.ph === 'i' || e.ph === 'R')) raw.push(e);
    raw.sort((a, b) => a.ts - b.ts);
    const main = []; const beStack = [];
    const KEEP_ARGS = new Set(['Layout', 'UpdateLayoutTree', 'FunctionCall', 'EventDispatch', 'TimerFire']);
    for (const e of raw) {
        const keepArgs = KEEP_ARGS.has(e.name) ? e.args : undefined;
        if (e.ph === 'X') main.push({ name: e.name, ts: e.ts, dur: e.dur || 0, args: keepArgs });
        else if (e.ph === 'B') beStack.push(e);
        else if (e.ph === 'E') { const b = beStack.pop(); if (b) main.push({ name: b.name, ts: b.ts, dur: Math.max(0, e.ts - b.ts), args: KEEP_ARGS.has(b.name) ? Object.assign({}, b.args, e.args) : undefined }); }
        else main.push({ name: e.name, ts: e.ts, dur: 0, instant: true });
    }
    main.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
    // "Where did this come from": the script event that was running, as a
    // readable site (function url:line for FunctionCall, the event type for
    // EventDispatch), so a forced layout names the code path that forced it.
    const site = ev => {
        const dd = ev.args && ev.args.data || {};
        if (ev.name === 'FunctionCall') return 'FunctionCall ' + (dd.functionName || '(anonymous)') + ' ' + String(dd.url || '').split('/').pop() + ':' + (dd.lineNumber != null ? dd.lineNumber + 1 : '?');
        if (ev.name === 'EventDispatch') return 'EventDispatch ' + (dd.type || '?');
        if (ev.name === 'TimerFire') return 'TimerFire';
        return ev.name;
    };
    const stack = [];
    for (const ev of main) {
        while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur <= ev.ts) stack.pop();
        ev.depth = stack.length;
        let inScript = false, parent = stack.length ? stack[stack.length - 1].name : null;
        const chain = [];
        for (let i = stack.length - 1; i >= 0; i--) if (SCRIPT_EVENTS.has(stack[i].name)) { inScript = true; if (chain.length < 3) chain.push(site(stack[i])); }
        ev.inScript = inScript; ev.parent = parent; ev.scriptSite = chain.length ? chain.join(' <- ') : null;
        if (!ev.instant && ev.dur > 0) stack.push(ev);
    }
    const drawFrames = [];
    for (const e of events) if (e.pid === rendererPid && e.tid === compositorTid && e.name === 'DrawFrame') drawFrames.push(e.ts);
    drawFrames.sort((a, b) => a - b);
    const hasRunTask = main.some(ev => ev.name === 'RunTask' || ev.name === 'ThreadControllerImpl::RunTask');

    const phases = {};
    for (const p of PHASES) {
        const w = windows[p];
        if (!w) { phases[p] = null; continue; }
        const inPhase = main.filter(ev => ev.ts >= w.ts0 && ev.ts < w.ts1);
        const counts = {}, durs = {};
        for (const ev of inPhase) { counts[ev.name] = (counts[ev.name] || 0) + 1; durs[ev.name] = (durs[ev.name] || 0) + ev.dur; }
        const fafs = inPhase.filter(ev => ev.name === 'FireAnimationFrame');
        const bmtf = inPhase.filter(ev => ev.name === 'BeginMainThreadFrame').map(ev => ev.ts);
        const draws = drawFrames.filter(ts => ts >= w.ts0 && ts < w.ts1);
        // One rAF tick fires every registered callback back to back (MEASURED:
        // 6.4 FireAnimationFrame per tick: 05j update, the jank monitor, light
        // source / shift, the audio editors, the brush cursor...). A gap over 2 ms
        // between consecutive callbacks is a new tick; the tick's work is the sum
        // of its callbacks.
        const tickStarts = [], tickWork = []; let lastEnd = -Infinity;
        for (const f of fafs) {
            if (f.ts - lastEnd > 2000 || !tickStarts.length) { tickStarts.push(f.ts); tickWork.push(0); }
            tickWork[tickWork.length - 1] += f.dur / 1000;
            lastEnd = f.ts + f.dur;
        }
        // "Per frame" divides by the main-thread frames (BeginMainThreadFrame):
        // the unit in which style, layout, paint and commit happen. Falls back to
        // rAF ticks, then to compositor DrawFrames.
        const den = bmtf.length || tickStarts.length || draws.length;
        const denSource = bmtf.length ? 'BeginMainThreadFrame' : (tickStarts.length ? 'rAF ticks' : 'DrawFrame');
        const perFrame = {}, msPerFrame = {};
        for (const n of COUNTED) perFrame[n] = den ? +((counts[n] || 0) / den).toFixed(4) : null;
        for (const n of MS_COUNTED) msPerFrame[n] = den ? +(((durs[n] || 0) / 1000) / den).toFixed(4) : null;
        let busy = 0; for (const ev of inPhase) if (ev.depth === 0 && !ev.instant) busy += ev.dur;
        msPerFrame.mainBusy = den ? +((busy / 1000) / den).toFixed(4) : null;
        const longSrc = hasRunTask ? inPhase.filter(ev => (ev.name === 'RunTask' || ev.name === 'ThreadControllerImpl::RunTask') && ev.dur > 50000)
                                   : inPhase.filter(ev => ev.depth === 0 && !ev.instant && ev.dur > 50000);
        const topLevel = inPhase.filter(ev => ev.depth === 0 && !ev.instant);
        const longest = topLevel.slice().sort((a, b) => b.dur - a.dur).slice(0, 5).map(ev => {
            const kids = {}; for (const c of inPhase) if (c.depth === 1 && c.ts >= ev.ts && c.ts < ev.ts + ev.dur) kids[c.name] = (kids[c.name] || 0) + c.dur;
            return { ms: +(ev.dur / 1000).toFixed(2), atS: +((ev.ts - w.ts0) / 1e6).toFixed(3), name: ev.name,
                     children: Object.entries(kids).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, d]) => n + ' ' + (d / 1000).toFixed(2) + ' ms') };
        });
        const layouts = inPhase.filter(ev => ev.name === 'Layout');
        const layoutsInScript = layouts.filter(ev => ev.inScript);
        const layoutsWithStack = layouts.filter(ev => ev.args && ev.args.beginData && Array.isArray(ev.args.beginData.stackTrace) && ev.args.beginData.stackTrace.length);
        const recalcs = inPhase.filter(ev => ev.name === 'UpdateLayoutTree');
        const recalcsInScript = recalcs.filter(ev => ev.inScript);
        const parentHist = list => { const h = {}; for (const ev of list) { const k = ev.parent || '(top level)'; h[k] = (h[k] || 0) + 1; } return h; };
        const siteHist = list => { const h = {}; for (const ev of list) { const k = ev.scriptSite || '(not inside script)'; h[k] = (h[k] || 0) + 1; } return h; };
        const histogram = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([n, c]) => ({ name: n, count: c, ms: +((durs[n] || 0) / 1000).toFixed(1) }));
        const ivDraw = summarize(intervals(draws));
        const ivTick = summarize(intervals(tickStarts));
        const ivBmtf = summarize(intervals(bmtf));
        const headline = draws.length >= 10 ? { source: 'DrawFrame (compositor thread)', stats: ivDraw } : { source: 'rAF tick starts (main thread; DrawFrame absent)', stats: ivTick };
        phases[p] = {
            window: { ts0: w.ts0, ts1: w.ts1, seconds: +((w.ts1 - w.ts0) / 1e6).toFixed(3) },
            frames: { main: bmtf.length, draw: draws.length, rafTicks: tickStarts.length, rafCallbacks: fafs.length, drawSerial: null, denominator: denSource, den },
            interval: Object.assign({ source: headline.source }, headline.stats),
            drawInterval: ivDraw, tickInterval: ivTick, beginMainThreadInterval: ivBmtf,
            frameWork: summarize(tickWork),
            rafCallbackDur: summarize(fafs.map(ev => ev.dur / 1000)),
            longTasks: { count: longSrc.length, maxMs: topLevel.length ? +(Math.max.apply(null, topLevel.map(ev => ev.dur)) / 1000).toFixed(2) : null,
                         source: hasRunTask ? 'RunTask > 50 ms' : 'top-level (depth 0) main-thread events > 50 ms; no RunTask in these categories', longest },
            perFrame, msPerFrame,
            forced: { layoutsInScript: layoutsInScript.length, layoutsPerFrame: den ? +(layoutsInScript.length / den).toFixed(4) : null,
                      layoutsWithStack: layoutsWithStack.length, layoutsTotal: layouts.length, layoutParents: parentHist(layouts), layoutSites: siteHist(layoutsInScript),
                      styleRecalcsInScript: recalcsInScript.length, styleRecalcsPerFrame: den ? +(recalcsInScript.length / den).toFixed(4) : null,
                      styleRecalcsTotal: recalcs.length, styleRecalcParents: parentHist(recalcs), styleRecalcSites: siteHist(recalcsInScript),
                      invalidateLayout: counts.InvalidateLayout || 0, scheduleStyleRecalc: counts.ScheduleStyleRecalculation || 0 },
            counts: Object.fromEntries(COUNTED.concat(['FireAnimationFrame', 'RunTask', 'InvalidateLayout', 'ScheduleStyleRecalculation', 'BeginMainThreadFrame']).map(n => [n, counts[n] || 0])),
            histogram
        };
    }
    return {
        rendererPid, pidSource, mainTid, compositorTid, processName: procNames.get(rendererPid) || null,
        threads: Array.from(threadNames.entries()).filter(([k]) => Number(k.split(':')[0]) === rendererPid).map(([k, n]) => n + ' (' + k.split(':')[1] + ')'),
        events: events.length, mainEvents: main.length, drawFrames: drawFrames.length,
        traceSeconds: +((traceEndTs - traceStartTs) / 1e6).toFixed(2), phaseSource, marks, hasRunTask, phaseSeconds,
        phases
    };
}

function summarizeSamples(samples, begin, end) {
    const inWin = samples.filter(s => begin && end && s.t >= begin.perfNow && s.t < end.perfNow);
    const pick = k => inWin.map(s => s[k]).filter(v => typeof v === 'number' && isFinite(v));
    const levels = Array.from(new Set(inWin.map(s => s.level)));
    const dye = Array.from(new Set(inWin.map(s => s.dyeScale)));
    const curls = inWin.map(s => parseFloat(s.curl)).filter(v => isFinite(v));
    return { n: inWin.length, fps: summarize(pick('fps')), frametime: summarize(pick('frametime')), cpu: summarize(pick('cpu')), budgetPct: summarize(pick('budgetPct')),
             governorLevels: levels, dyeScales: dye, curlMin: curls.length ? Math.min.apply(null, curls) : null, curlMax: curls.length ? Math.max.apply(null, curls) : null };
}

// ─── one run ─────────────────────────────────────────────────────────────────
async function captureRun(n, label, head) {
    const started = new Date();
    const out = { run: n, label, date: started.toISOString(), config: { viewport: VIEW, phaseSeconds: PHASE_S, moveHz: MOVE_HZ, sweepSeconds: SWEEP_S, sampleMs: SAMPLE_MS, categories: CATEGORIES, seed: SEED },
                  env: {}, settle: null, stroke: null, fader: null, boundaries: {}, trace: {}, analysis: null, phases: {}, stats: {}, problems: [], pageExceptions: 0 };
    const nProblemsBefore = problems.length;
    log('[' + stamp() + '] run ' + label + ': booting headless Chrome');
    const d = await boot({ seed: SEED });
    try {
        await d.send('Emulation.setDeviceMetricsOverride', { width: VIEW.w, height: VIEW.h, deviceScaleFactor: 1, mobile: false });
        await d.load();
        const ver = await d.send('Browser.getVersion');
        const inst = await d.ev(PERF_HARNESS);
        const probe = await d.ev('window.__perf && window.__perf.probe ? window.__perf.probe() : null');
        if (probe && probe.tiers) probe.tiers = probe.tiers.map(t => t.id || t.name || t.key || JSON.stringify(t).slice(0, 40));
        const pageEnv = await d.ev(ENV_EXPR);
        out.env = Object.assign({ headCommit: head, chrome: ver.product, userAgent: ver.userAgent, protocol: ver.protocolVersion, jsVersion: ver.jsVersion, node: process.version,
            build: 'web build in headless Chrome (Emulation.setDeviceMetricsOverride ' + VIEW.w + 'x' + VIEW.h + ' @1, scratch profile)', perfHarness: inst, perfProbe: probe }, pageEnv);
        log('  Chrome ' + ver.product + ', viewport ' + pageEnv.innerWidth + 'x' + pageEnv.innerHeight + ' @' + pageEnv.dpr + ', --ui-scale ' + pageEnv.uiScale + ', canvas ' + pageEnv.canvas);
        log('  GPU: ' + pageEnv.glRenderer + ' | ' + pageEnv.glRendererPlain + ' | ' + pageEnv.glVendor);
        log('  fpsCap ' + pageEnv.fpsCap + ' (locked ' + pageEnv.fpsCapLocked + '), displayHz ' + pageEnv.displayHz + ' (known ' + pageEnv.displayHzKnown + '), dye ' + pageEnv.dyeRes + ' sim ' + pageEnv.simRes + ', governor L' + (pageEnv.governor && pageEnv.governor.level) + ' scales ' + pageEnv.dyeScale + '/' + pageEnv.simScale);
        if (pageEnv.innerWidth !== VIEW.w || pageEnv.innerHeight !== VIEW.h) problem(label + ': viewport is ' + pageEnv.innerWidth + 'x' + pageEnv.innerHeight + ', not ' + VIEW.w + 'x' + VIEW.h);
        if (pageEnv.stripParked && pageEnv.stripParked.length) log('  note: strip cells parked in More at this width: ' + pageEnv.stripParked.join(', '));

        out.settle = await waitSettled(d, 30000);
        log('  settled ' + out.settle.settled + ' after ' + out.settle.seconds + ' s: scales ' + out.settle.final.dye + '/' + out.settle.final.sim + ', level ' + out.settle.final.level + ', fps ' + out.settle.final.fps + ', transitions ' + out.settle.transitions.length);
        if (!out.settle.settled) problem(label + ': the app did not settle within 30 s (scales ' + out.settle.final.dye + '/' + out.settle.final.sim + ', reinit ' + out.settle.final.reinit + ', fps ' + out.settle.final.fps + ', anims ' + out.settle.final.anims + ')');

        out.stroke = await paintStroke(d);
        log('  stroke: ' + out.stroke.points + ' points, ' + out.stroke.framesDrawnDuring + ' frames drawn meanwhile');
        await sleep(1500);

        out.fader = await d.ev(FADER_EXPR);
        if (!out.fader) throw new Error('no visible strip fader to drag (none of ' + FADER_PREFERENCE.join(', ') + ' is in #mixer-strip and rendered)');
        if (out.fader.fallback) problem(label + ': the Fluid fader was not draggable in the strip; dragging #' + out.fader.id + ' instead');
        log('  drag target: #' + out.fader.id + ' (channel ' + out.fader.channel + ', value ' + out.fader.value + ', rect ' + Math.round(out.fader.rect.x) + ',' + Math.round(out.fader.rect.y) + ' ' + Math.round(out.fader.rect.w) + 'x' + Math.round(out.fader.rect.h) + ')');

        await d.ev(SAMPLER);
        const exceptionsBefore = d.events.filter(e => e.method === 'Runtime.exceptionThrown').length;
        await startTracing(d);
        await sleep(500);                                   // let the tracing start-up events land before the first mark
        await d.ev('window.__pt.start()');
        const drive = makeDragDriver(d, out.fader);
        for (const p of PHASES) {
            const begin = await d.ev('window.__pt.boundary(' + JSON.stringify('pt:' + p + ':start') + ')');
            begin.wallMs = Date.now();
            log('  [' + stamp() + '] phase ' + p + ' (' + PHASE_S + ' s): governor L' + (begin.governor && begin.governor.level) + ', scales ' + begin.dyeScale + '/' + begin.simScale + ', curl ' + begin.curl);
            let driveResult = null;
            if (p === 'drag') driveResult = await drive(begin.wallMs + PHASE_S * 1000);
            else await sleep(PHASE_S * 1000);
            const end = await d.ev('window.__pt.boundary(' + JSON.stringify('pt:' + p + ':end') + ')');
            end.wallMs = Date.now();
            out.boundaries[p] = { begin, end, wallSeconds: +((end.wallMs - begin.wallMs) / 1000).toFixed(2), drive: driveResult };
            if (driveResult) log('    drag: ' + driveResult.moves + ' trusted moves in ' + driveResult.seconds + ' s = ' + driveResult.achievedHz + ' Hz (target ' + MOVE_HZ + '), max gap ' + driveResult.maxGapMs + ' ms, curl ' + begin.curl + ' -> ' + end.curl);
            if (begin.governor && end.governor && begin.governor.level !== end.governor.level) problem(label + ': governor level changed during ' + p + ' (L' + begin.governor.level + ' -> L' + end.governor.level + ')');
            if (begin.dyeScale !== end.dyeScale || begin.simScale !== end.simScale) problem(label + ': effective resolution changed during ' + p + ' (' + begin.dyeScale + '/' + begin.simScale + ' -> ' + end.dyeScale + '/' + end.simScale + ')');
        }
        const samples = await d.ev('window.__pt.stop()');
        await sleep(300);
        log('  [' + stamp() + '] Tracing.end, reading the stream');
        const tr = await stopTracing(d);
        out.pageExceptions = d.events.filter(e => e.method === 'Runtime.exceptionThrown').length - exceptionsBefore;
        const after = await d.ev('(function(){ return { slowdownCell: !!document.getElementById("slowdownCell"), governor: window.QualityGovernor ? window.QualityGovernor.getState() : null, curl: (document.getElementById("curl")||{}).value }; })()');
        out.after = after;
        if (after.slowdownCell) problem(label + ': the governor\'s slowdown button appeared during the run');

        // Save the raw trace, then parse it.
        const gzName = 'trace-' + label + '.json.gz';
        const gz = zlib.gzipSync(Buffer.from(tr.text, 'utf8'), { level: 6 });
        fs.writeFileSync(path.join(OUT_DIR, gzName), gz);
        out.trace = { file: gzName, bytes: tr.bytes, gzBytes: gz.length, bufferMaxPercent: tr.bufferMaxPercent, dataLoss: tr.dataLoss, categories: CATEGORIES };
        if (tr.dataLoss) problem(label + ': Chrome reported trace data loss (buffer full)');
        log('  trace ' + (tr.bytes / 1048576).toFixed(1) + ' MB -> ' + (gz.length / 1048576).toFixed(1) + ' MB gz, buffer max ' + tr.bufferMaxPercent + '%');
        let parsed = JSON.parse(tr.text);
        tr.text = null;
        const events = Array.isArray(parsed) ? parsed : (parsed.traceEvents || []);
        out.trace.metadata = Array.isArray(parsed) ? null : (parsed.metadata ? { product: parsed.metadata['product-version'], os: parsed.metadata['os-name'], cpu: parsed.metadata['cpu-brand'], gpu: parsed.metadata['gpu-gl-renderer'] || null } : null);
        const an = analyse(events, out.boundaries, PHASE_S);
        parsed = null;
        out.analysis = { rendererPid: an.rendererPid, pidSource: an.pidSource, mainTid: an.mainTid, compositorTid: an.compositorTid, processName: an.processName, threads: an.threads,
                         events: an.events, mainEvents: an.mainEvents, drawFrames: an.drawFrames, traceSeconds: an.traceSeconds, phaseSource: an.phaseSource, hasRunTask: an.hasRunTask };
        if (an.phaseSource !== 'marks') problem(label + ': phase boundaries came from ' + an.phaseSource);
        for (const p of PHASES) {
            const ph = an.phases[p];
            if (!ph) { problem(label + ': no trace window for phase ' + p); continue; }
            const b = out.boundaries[p];
            ph.frames.drawSerial = b && b.begin && b.end ? b.end.drawSerial - b.begin.drawSerial : null;
            out.phases[p] = ph;
            out.stats[p] = summarizeSamples(samples, b && b.begin, b && b.end);
            log('  ' + p + ': ' + ph.frames.main + ' main frames, ' + ph.frames.rafTicks + ' rAF ticks (' + ph.frames.rafCallbacks + ' callbacks), ' + ph.frames.draw + ' DrawFrame, app drew ' + ph.frames.drawSerial + '; interval median ' + fmt(ph.interval.median) + ' p95 ' + fmt(ph.interval.p95) + ' ms (' + ph.interval.source + '); tick ' + fmt(ph.tickInterval.median) + ' ms; frame work p95 ' + fmt(ph.frameWork.p95) + ' ms; long tasks ' + ph.longTasks.count +
                '; /frame Layout ' + fmt(ph.perFrame.Layout) + ' style ' + fmt(ph.perFrame.UpdateLayoutTree) + ' Paint ' + fmt(ph.perFrame.Paint) + ' Commit ' + fmt(ph.perFrame.Commit) + ' CompositeLayers ' + fmt(ph.perFrame.CompositeLayers) +
                '; forced layouts ' + ph.forced.layoutsInScript + ' (' + fmt(ph.forced.layoutsPerFrame) + '/frame' + (ph.forced.layoutsInScript ? '; ' + Object.entries(ph.forced.layoutSites).map(([k, v]) => v + 'x ' + k).join(', ') : '') + '), forced style recalcs ' + ph.forced.styleRecalcsInScript +
                '; __stats fps ' + fmt(out.stats[p].fps.mean) + ' cpu p95 ' + fmt(out.stats[p].cpu.p95));
        }
        if (!an.hasRunTask) log('  note: no RunTask events in these categories; long tasks are depth-0 main-thread events > 50 ms');
        if (out.pageExceptions) problem(label + ': ' + out.pageExceptions + ' page exception(s) during the run');
    } finally {
        await d.close();
    }
    out.problems = problems.slice(nProblemsBefore);
    out.durationS = +((Date.now() - started.getTime()) / 1000).toFixed(1);
    fs.writeFileSync(path.join(OUT_DIR, 'run-' + label + '.json'), JSON.stringify(out, null, 1));
    log('[' + stamp() + '] run ' + label + ' done in ' + out.durationS + ' s -> ' + path.relative(ROOT, path.join(OUT_DIR, 'run-' + label + '.json')));
    return out;
}

// ─── reports ─────────────────────────────────────────────────────────────────
function metricRows(runs, phase, list) {
    const rows = [];
    for (const [key, labelText] of list) {
        const vals = runs.map(r => valueOf(r, phase, key));
        const nums = vals.filter(v => typeof v === 'number');
        const mean = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
        const noise = nums.length ? Math.max.apply(null, nums) - Math.min.apply(null, nums) : null;
        rows.push({ key, label: labelText, vals, mean, noise, gate: mean != null && noise != null ? mean + noise : null, complete: nums.length === runs.length && runs.length > 0 });
    }
    return rows;
}
function valueOf(run, phase, key) {
    if (key.indexOf('stats.') === 0) return run.stats[phase] ? get({ stats: run.stats[phase] }, key) : undefined;
    return run.phases[phase] ? get(run.phases[phase], key) : undefined;
}

function writeSummary(runs, outPath) {
    const r1 = runs[0];
    const L = [];
    L.push('# Frame time and layout baseline (F2)');
    L.push('');
    L.push('Captured ' + r1.date.slice(0, 10) + ' at HEAD `' + String(r1.env.headCommit).slice(0, 7) + '` with ' + r1.env.chrome + ' (headless), viewport ' + r1.env.innerWidth + '×' + r1.env.innerHeight + ' CSS px, DPR ' + r1.env.dpr + ', `--ui-scale` ' + r1.env.uiScale + ', Node ' + r1.env.node + '. Written by `prep/baseline/scripts/perf-trace.js`; ' + runs.length + ' run' + (runs.length === 1 ? '' : 's') + ', each a fresh boot, one stroke, then one ' + (PHASE_S * 3) + ' s CDP trace in three phases of ' + PHASE_S + ' s: **idle1** (sim running, no input), **drag** (left button held on the `#' + (r1.fader && r1.fader.id) + '` fader with ~' + MOVE_HZ + ' trusted mouse moves/s sweeping its track), **idle2**.');
    L.push('');
    L.push('**Headless numbers are relative, not the user\'s machine.** Headless Chrome paces requestAnimationFrame from its own synthetic BeginFrame source, not a display (the rAF tick interval it produced here is under *Informational metrics*), the app\'s own FPS Limit decides which ticks draw, and rendering goes through the GPU path named under *GPU renderer* below; absolute frame times say nothing about Gabriel\'s 144 Hz panel or the Electron build. The gate is the same capture before and after a CSS step on the same machine, read against the run-to-run noise measured here (noise = max − min over the runs; gate = mean + noise).');
    L.push('');
    L.push('## Environment (run 1' + (runs.length > 1 ? '; the other runs agree unless noted under *Run-to-run differences*' : '') + ')');
    L.push('');
    L.push('| Fact | Value |');
    L.push('|---|---|');
    const e = r1.env;
    const envRows = [
        ['Date', r1.date], ['HEAD', e.headCommit], ['Chrome', e.chrome + ' (protocol ' + e.protocol + ', V8 ' + e.jsVersion + ')'], ['Build', e.build],
        ['Viewport / DPR / --ui-scale', e.innerWidth + '×' + e.innerHeight + ' / ' + e.dpr + ' / ' + e.uiScale], ['Canvas (drawing buffer) / wrapper', e.canvas + ' / ' + e.wrapper],
        ['GPU renderer (UNMASKED_RENDERER_WEBGL)', '`' + e.glRenderer + '`'], ['gl.RENDERER / vendor / version', '`' + e.glRendererPlain + '` / `' + e.glVendor + '` / `' + e.glVersion + '`'], ['WebGL2', e.webgl2],
        ['fpsCap / locked / measured Hz (known)', e.fpsCap + ' / ' + e.fpsCapLocked + ' / ' + e.displayHz + ' (' + e.displayHzKnown + ')'], ['Dye / sim resolution (config), pressure iterations', e.dyeRes + ' / ' + e.simRes + ', ' + e.pressureIters],
        ['Governor at boot (level, scales)', e.governor ? 'L' + e.governor.level + ', enabled ' + e.governor.enabled + ', allowResolution ' + e.governor.allowResolution + ', scales ' + e.dyeScale + '/' + e.simScale : '—'],
        ['Boot ascent settled', r1.settle ? (r1.settle.settled + ' after ' + r1.settle.seconds + ' s (final scales ' + r1.settle.final.dye + '/' + r1.settle.final.sim + ', level ' + r1.settle.final.level + ', ' + r1.settle.transitions.length + ' state changes)') : '—'],
        ['PerfTiers.describe()', e.tiers ? '`' + JSON.stringify(e.tiers) + '`' : '—'],
        ['__perf.probe()', e.perfProbe ? 'timerQuery ' + e.perfProbe.timerQuery + ', maxTextureSize ' + e.perfProbe.maxTextureSize + ', cores ' + e.perfProbe.cores + ', deviceMemory ' + e.perfProbe.deviceMemoryGB + ' GB, canvas ' + e.perfProbe.canvas : '—'],
        ['Material type / curl at boot', e.materialMode + ' / ' + e.curl], ['Left bar folded / open sections', e.leftFolded + ' / ' + (e.openSections || []).join(', ')],
        ['Strip cells parked in More', (e.stripParked || []).length ? e.stripParked.join(', ') : 'none'], ['Stroke', r1.stroke ? r1.stroke.points + ' trusted points across the canvas, ' + r1.stroke.framesDrawnDuring + ' frames drawn meanwhile' : '—'],
        ['Drag target', r1.fader ? '`#' + r1.fader.id + '` (channel ' + r1.fader.channel + ', ' + (r1.fader.proxy ? 'perceptual proxy' : 'canonical input') + ', rect ' + Math.round(r1.fader.rect.w) + '×' + Math.round(r1.fader.rect.h) + ' at ' + Math.round(r1.fader.rect.x) + ',' + Math.round(r1.fader.rect.y) + ')' : '—'],
        ['Trace', runs.map(r => r.trace.file + ' (' + (r.trace.bytes / 1048576).toFixed(1) + ' MB raw, ' + (r.trace.gzBytes / 1048576).toFixed(1) + ' MB gz, ' + r.analysis.events + ' events, ' + r.analysis.traceSeconds + ' s, buffer max ' + (r.trace.bufferMaxPercent == null ? '?' : (+r.trace.bufferMaxPercent).toFixed(2)) + '%)').join('; ')],
        ['Trace categories', '`' + CATEGORIES.join(',') + '`'], ['Renderer process / threads', (r1.analysis.processName || 'pid ' + r1.analysis.rendererPid) + ' (' + r1.analysis.pidSource + '); ' + r1.analysis.threads.join(', ')],
        ['Phase boundaries', runs.map(r => r.analysis.phaseSource).join('; ')], ['Long-task source', r1.phases.idle1 ? r1.phases.idle1.longTasks.source : '—'],
        ['Trace metadata', r1.trace.metadata ? JSON.stringify(r1.trace.metadata) : '(stream carried no metadata block)']
    ];
    for (const [k, v] of envRows) L.push('| ' + k + ' | ' + String(v).replace(/\|/g, '\\|') + ' |');
    L.push('');
    if (runs.length > 1) {
        L.push('### Run-to-run differences in the environment');
        L.push('');
        const diffs = [];
        for (const k of ['chrome', 'innerWidth', 'innerHeight', 'dpr', 'uiScale', 'glRenderer', 'glVendor', 'canvas', 'wrapper', 'fpsCap', 'displayHz', 'dyeRes', 'simRes', 'materialMode', 'curl']) {
            const vals = runs.map(r => JSON.stringify(r.env[k]));
            if (new Set(vals).size > 1) diffs.push('`' + k + '`: ' + vals.join(' / '));
        }
        const settle = runs.map(r => r.settle ? 'settled ' + r.settle.settled + ', scales ' + r.settle.final.dye + '/' + r.settle.final.sim + ', level ' + r.settle.final.level : '—');
        if (new Set(settle).size > 1) diffs.push('boot ascent: ' + settle.join(' / '));
        L.push('- boot ascent settled after ' + runs.map(r => r.settle ? r.settle.seconds + ' s' : '—').join(' / ') + ' (outcome ' + (new Set(settle).size > 1 ? 'DIFFERS' : 'identical') + ')');
        const faders = runs.map(r => r.fader && r.fader.id); if (new Set(faders).size > 1) diffs.push('drag target: ' + faders.join(' / '));
        L.push(diffs.length ? diffs.map(x => '- ' + x).join('\n') : '- none: Chrome build, viewport, DPR, `--ui-scale`, GPU renderer, canvas size, fps cap, measured Hz, resolutions, material type, boot-ascent outcome and drag target agree in every run');
        L.push('');
    }
    L.push('## Gated metrics, ' + (runs.length > 1 ? 'the runs side by side' : 'one run'));
    L.push('');
    L.push('`--check` re-captures once and flags a metric whose value is **above** gate = mean + noise, noise = max − min over these runs (higher is worse for every row); the timing rows (`interval.*`, `frameWork.*`, `msPerFrame.*`) also have to exceed the gate by 2 % of it (`--tolerance-pct`, see NOTES.md for why), the count rows fail on anything above it. **Frame** = a main-thread frame (`BeginMainThreadFrame` on the renderer main thread, the unit in which style recalc, layout, paint and commit run); "/ frame" divides by its count. rAF ticks and rAF callbacks are reported separately: every tick fires every registered callback (about six: 05j `update`, the jank monitor, light source / light shift, the audio editors, the brush cursor), so `FireAnimationFrame` counts callbacks, not frames. The **frame interval** is DrawFrame-to-DrawFrame on the renderer\'s Compositor thread, i.e. the frames that were actually drawn under the app\'s FPS Limit (cross-checked against the app\'s own `__drawSerial`). **Frame work per tick** is the sum of one tick\'s rAF callback durations. **Forced synchronous layouts** are Layout events nested inside a script event (FunctionCall, EventDispatch, TimerFire, FireAnimationFrame, …): JavaScript asked for geometry before the frame\'s own layout; forced style recalcs the same for UpdateLayoutTree. (Layout events carry no stack trace without the `disabled-by-default-devtools.timeline.stack` category, so DevTools\' own "forced reflow" flag is not available here; nesting is the signal.)');
    L.push('');
    const head = '| metric | ' + runs.map(r => 'run ' + r.label).join(' | ') + (runs.length > 1 ? ' | mean | noise (max−min) | gate (mean+noise) |' : ' |');
    const sep = '|---|' + runs.map(() => '---:').join('|') + (runs.length > 1 ? '|---:|---:|---:|' : '|');
    for (const p of PHASES) {
        L.push('### ' + p + (p === 'drag' ? ' (dragging the fader)' : ' (idle, sim running)'));
        L.push('');
        L.push(head); L.push(sep);
        for (const row of metricRows(runs, p, GATED)) {
            L.push('| ' + row.label + ' (`' + row.key + '`) | ' + row.vals.map(fmt).join(' | ') + (runs.length > 1 ? ' | ' + fmt(row.mean) + ' | ' + fmt(row.noise) + ' | ' + fmt(row.gate) + ' |' : ' |'));
        }
        L.push('');
        const drags = runs.map(r => r.boundaries[p] && r.boundaries[p].drive).filter(Boolean);
        if (drags.length) L.push('Drag: ' + drags.map(dr => dr.moves + ' moves in ' + dr.seconds + ' s = ' + dr.achievedHz + ' Hz (max gap ' + dr.maxGapMs + ' ms)').join('; ') + '. Curl value seen: ' + runs.map(r => r.stats[p] ? r.stats[p].curlMin + '–' + r.stats[p].curlMax : '—').join('; ') + '.');
        L.push('Governor level / effective dye scale during the phase: ' + runs.map(r => r.stats[p] ? 'L' + r.stats[p].governorLevels.join('→') + ' / ' + r.stats[p].dyeScales.join('→') : '—').join('; ') + '. App frames drawn (`__drawSerial`): ' + runs.map(r => r.phases[p] ? r.phases[p].frames.drawSerial : '—').join(' / ') + '.');
        L.push('');
    }
    L.push('## Informational metrics (reported, not gated)');
    L.push('');
    for (const p of PHASES) {
        L.push('### ' + p);
        L.push('');
        L.push(head); L.push(sep);
        for (const row of metricRows(runs, p, INFO)) {
            L.push('| ' + row.label + ' (`' + row.key + '`) | ' + row.vals.map(fmt).join(' | ') + (runs.length > 1 ? ' | ' + fmt(row.mean) + ' | ' + fmt(row.noise) + ' | ' + fmt(row.gate) + ' |' : ' |'));
        }
        L.push('');
    }
    L.push('## Where the Layout and UpdateLayoutTree events sit (parent event → count, every run)');
    L.push('');
    L.push('A Layout whose parent is `RunTask` is the frame\'s own layout (BeginMainThreadFrame → UpdateLayoutTree → Layout → PrePaint → Paint → Commit); one whose parent is `FunctionCall` / `EventDispatch` / `TimerFire` was forced by script.');
    L.push('');
    L.push('| run | phase | Layout parents | UpdateLayoutTree parents |');
    L.push('|---|---|---|---|');
    const fmtH = h => Object.entries(h || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v).join(', ') || '—';
    for (const r of runs) for (const p of PHASES) { const ph = r.phases[p]; if (!ph) continue; L.push('| ' + r.label + ' | ' + p + ' | ' + fmtH(ph.forced.layoutParents) + ' | ' + fmtH(ph.forced.styleRecalcParents) + ' |'); }
    L.push('');
    L.push('## The script sites that forced them (innermost script event first, every run)');
    L.push('');
    L.push('| run | phase | forced Layout sites | forced UpdateLayoutTree sites |');
    L.push('|---|---|---|---|');
    for (const r of runs) for (const p of PHASES) { const ph = r.phases[p]; if (!ph) continue; L.push('| ' + r.label + ' | ' + p + ' | ' + fmtH(ph.forced.layoutSites).replace(/</g, '&lt;') + ' | ' + fmtH(ph.forced.styleRecalcSites).replace(/</g, '&lt;') + ' |'); }
    L.push('');
    L.push('## Longest top-level main-thread tasks per phase (run 1)');
    L.push('');
    L.push('| phase | ms | at (s into phase) | event | biggest children |');
    L.push('|---|---:|---:|---|---|');
    for (const p of PHASES) { const ph = r1.phases[p]; if (!ph) continue; for (const t of ph.longTasks.longest) L.push('| ' + p + ' | ' + t.ms + ' | ' + t.atS + ' | ' + t.name + ' | ' + t.children.join('; ') + ' |'); }
    L.push('');
    L.push('## What the trace contains (run 1, main thread, top 40 event names by count)');
    L.push('');
    L.push('| event | ' + PHASES.map(p => p + ' count | ' + p + ' ms').join(' | ') + ' |');
    L.push('|---|' + PHASES.map(() => '---:|---:').join('|') + '|');
    const names = new Set(); for (const p of PHASES) if (r1.phases[p]) for (const h of r1.phases[p].histogram) names.add(h.name);
    const lookup = (p, n) => { const ph = r1.phases[p]; const h = ph && ph.histogram.find(x => x.name === n); return h ? h.count + ' | ' + h.ms : '0 | 0'; };
    const ordered = Array.from(names).sort((a, b) => (lookup('drag', b).split(' | ')[0] | 0) - (lookup('drag', a).split(' | ')[0] | 0));
    for (const n of ordered.slice(0, 40)) L.push('| ' + n + ' | ' + PHASES.map(p => lookup(p, n)).join(' | ') + ' |');
    L.push('');
    L.push('## Problems recorded by the runs');
    L.push('');
    const probs = runs.flatMap(r => r.problems.map(x => 'run ' + r.label + ': ' + x));
    L.push(probs.length ? probs.map(x => '- ' + x).join('\n') : '- none');
    L.push('');
    fs.writeFileSync(outPath, L.join('\n'));
}

function compareWithBaseline(baseRuns, check) {
    const rows = []; let flagged = 0, flaggedStrict = 0, compared = 0, skipped = 0;
    for (const p of PHASES) {
        for (const row of metricRows(baseRuns, p, GATED)) {
            const v = valueOf(check, p, row.key);
            if (!row.complete || typeof v !== 'number') { rows.push({ phase: p, key: row.key, label: row.label, skipped: true, baseline: row.vals, value: v }); skipped++; continue; }
            const timing = TIMING_ROW.test(row.key);
            const floor = timing ? row.gate * TOL_PCT / 100 : 0;
            const worseStrict = v > row.gate + 1e-9;               // the brief's rule: above mean + noise
            const worse = v > row.gate + floor + 1e-9;             // the verdict: timing rows also need to clear the floor
            rows.push({ phase: p, key: row.key, label: row.label, baseline: row.vals, mean: row.mean, noise: row.noise, gate: row.gate, floor, timing, value: v, worse, worseStrict,
                        over: worseStrict ? v - row.gate : 0, overPct: worseStrict ? (row.gate > 0 ? +(100 * (v - row.gate) / row.gate).toFixed(1) : null) : 0 });
            compared++; if (worse) flagged++; if (worseStrict) flaggedStrict++;
        }
    }
    return { rows, flagged, flaggedStrict, compared, skipped, tolPct: TOL_PCT };
}

function writeCheckReport(baseRuns, check, cmp, outPath, verdict) {
    const L = [];
    L.push('# Perf trace `--check` (F2)');
    L.push('');
    L.push('Re-capture ' + check.date + ' at HEAD `' + String(check.env.headCommit).slice(0, 7) + '`, ' + check.env.chrome + ', GPU `' + check.env.glRenderer + '`, against the baseline runs ' + baseRuns.map(r => r.label + ' (' + r.date.slice(0, 16) + 'Z, HEAD ' + String(r.env.headCommit).slice(0, 7) + ')').join(', ') + '.');
    L.push('');
    L.push('**' + verdict + '**: ' + cmp.flagged + ' of ' + cmp.compared + ' gated metrics worse than baseline mean + noise' + (cmp.tolPct ? ' beyond the ' + cmp.tolPct + ' % floor on timing rows' : '') + ' (the literal mean + noise rule: ' + cmp.flaggedStrict + ' worse)' + (cmp.skipped ? ', ' + cmp.skipped + ' skipped (null in the baseline or the re-capture)' : '') + '. Gate = mean + (max − min) of the baseline runs; higher is worse for every gated metric. Count rows (per-frame counts, forced layouts, long tasks) fail on anything above the gate; timing rows (`interval.*`, `frameWork.*`, `msPerFrame.*`) also have to exceed it by ' + cmp.tolPct + ' % of the gate, because microsecond scheduling noise otherwise fails an unchanged app (see NOTES.md).');
    L.push('');
    L.push('| phase | metric | ' + baseRuns.map(r => 'run ' + r.label).join(' | ') + ' | mean | noise | gate | check | result |');
    L.push('|---|---|' + baseRuns.map(() => '---:').join('|') + '|---:|---:|---:|---:|---|');
    for (const r of cmp.rows) {
        const res = r.skipped ? 'skipped'
            : r.worse ? '**WORSE** (+' + fmt(r.over) + (r.overPct != null ? ', +' + r.overPct + ' % of the gate' : ', gate was 0') + ')'
            : r.worseStrict ? 'above the gate by +' + fmt(r.over) + ' (+' + r.overPct + ' %), within the ' + cmp.tolPct + ' % floor'
            : 'ok';
        L.push('| ' + r.phase + ' | ' + r.label + ' (`' + r.key + '`) | ' + (r.baseline || []).map(fmt).join(' | ') + ' | ' + fmt(r.mean) + ' | ' + fmt(r.noise) + ' | ' + fmt(r.gate) + ' | ' + fmt(r.value) + ' | ' + res + ' |');
    }
    L.push('');
    const envDiff = [];
    for (const k of ['chrome', 'innerWidth', 'innerHeight', 'dpr', 'uiScale', 'glRenderer', 'canvas', 'fpsCap', 'displayHz', 'dyeRes', 'simRes', 'materialMode']) {
        const b = JSON.stringify(baseRuns[0].env[k]), c = JSON.stringify(check.env[k]);
        if (b !== c) envDiff.push('`' + k + '`: baseline ' + b + ', check ' + c);
    }
    if (check.fader && baseRuns[0].fader && check.fader.id !== baseRuns[0].fader.id) envDiff.push('drag target: baseline `#' + baseRuns[0].fader.id + '`, check `#' + check.fader.id + '`');
    L.push('## Environment differences');
    L.push('');
    L.push(envDiff.length ? envDiff.map(x => '- ' + x).join('\n') : '- none (Chrome, viewport, DPR, `--ui-scale`, GPU renderer, canvas, fps cap, measured Hz, resolutions, material type, drag target all agree with run 1 of the baseline)');
    L.push('');
    L.push('## Problems in the re-capture');
    L.push('');
    L.push(check.problems.length ? check.problems.map(x => '- ' + x).join('\n') : '- none');
    L.push('');
    fs.writeFileSync(outPath, L.join('\n'));
}

// ─── main ────────────────────────────────────────────────────────────────────
(async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    let head = null;
    try { head = execSync('git rev-parse HEAD', { cwd: ROOT }).toString().trim(); } catch (_) { head = '(git unavailable)'; }
    log('perf-trace ' + (CHECK ? '--check' : 'capture') + ': ' + RUNS + ' run(s), ' + PHASE_S + ' s per phase, out ' + path.relative(ROOT, OUT_DIR) + ', HEAD ' + head.slice(0, 7));

    // --summarize: rebuild summary.md from the run-<n>.json already in OUT_DIR (no Chrome).
    if (argv.includes('--summarize')) {
        const files = fs.readdirSync(OUT_DIR).filter(f => /^run-\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10));
        if (!files.length) { console.log('no run-<n>.json in ' + path.relative(ROOT, OUT_DIR)); process.exit(1); }
        const runs = files.map(f => JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8')));
        writeSummary(runs, path.join(OUT_DIR, 'summary.md'));
        log('summary rebuilt from ' + files.join(', ') + ' -> ' + path.relative(ROOT, path.join(OUT_DIR, 'summary.md')));
        process.exit(0);
    }

    if (CHECK) {
        // --baseline DIR compares against another capture's run-<n>.json (default: the
        // shipped baseline); --compare FILE skips the capture and compares that run's
        // JSON (a re-read of an earlier --check, or a gate self-test against a mutated
        // copy of the baseline).
        const baseDir = argValue('--baseline', null) ? path.resolve(argValue('--baseline', null)) : BASE_DIR;
        const baseFiles = fs.readdirSync(baseDir).filter(f => /^run-\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10));
        if (!baseFiles.length) { console.log('CHECK FAIL: no baseline runs in ' + path.relative(ROOT, baseDir)); process.exit(1); }
        const baseRuns = baseFiles.map(f => JSON.parse(fs.readFileSync(path.join(baseDir, f), 'utf8')));
        const bad = baseRuns.filter(r => !r.config || r.config.phaseSeconds !== PHASE_S || r.config.moveHz !== MOVE_HZ);
        if (bad.length) { console.log('CHECK FAIL: baseline run(s) ' + bad.map(r => r.label).join(', ') + ' were captured with a different phase length or move rate than this run (' + PHASE_S + ' s, ' + MOVE_HZ + ' Hz); re-capture or pass the same --phase-seconds'); process.exit(1); }
        log('baseline: ' + baseRuns.length + ' run(s) in ' + path.relative(ROOT, baseDir) + ': ' + baseRuns.map(r => r.label + ' @ ' + r.date).join(', '));
        const compareFile = argValue('--compare', null);
        const check = compareFile ? JSON.parse(fs.readFileSync(path.resolve(compareFile), 'utf8')) : await captureRun(1, 'check', head);
        if (compareFile) log('comparing the existing run ' + path.relative(ROOT, path.resolve(compareFile)) + ' (captured ' + check.date + '), no new capture');
        const cmp = compareWithBaseline(baseRuns, check);
        const verdict = cmp.flagged ? 'CHECK FAIL' : 'CHECK PASS';
        writeCheckReport(baseRuns, check, cmp, path.join(OUT_DIR, 'check.md'), verdict);
        for (const r of cmp.rows) {
            if (r.worse) console.log('  WORSE ' + r.phase + ' ' + r.key + ': ' + fmt(r.value) + ' > gate ' + fmt(r.gate) + ' (+' + fmt(r.over) + (r.overPct != null ? ', +' + r.overPct + '% of the gate' : ', gate was 0') + '; baseline ' + r.baseline.map(fmt).join(' / ') + ', mean ' + fmt(r.mean) + ', noise ' + fmt(r.noise) + ')');
            else if (r.worseStrict) console.log('  above gate, within the ' + cmp.tolPct + '% floor: ' + r.phase + ' ' + r.key + ': ' + fmt(r.value) + ' vs gate ' + fmt(r.gate) + ' (+' + fmt(r.over) + ', +' + r.overPct + '%)');
        }
        console.log(verdict + ': ' + cmp.flagged + ' of ' + cmp.compared + ' gated metrics worse than baseline mean + noise' + (cmp.tolPct ? ' beyond the ' + cmp.tolPct + '% floor on timing rows' : '') + ' (literal rule: ' + cmp.flaggedStrict + ' worse)' + (cmp.skipped ? ' (' + cmp.skipped + ' skipped)' : '') + ((check.problems || []).length ? '; ' + check.problems.length + ' problem(s) in the re-capture' : '') + ' -> ' + path.relative(ROOT, path.join(OUT_DIR, 'check.md')));
        process.exit(cmp.flagged ? 1 : 0);
    }

    const runs = [];
    for (let n = 1; n <= RUNS; n++) {
        runs.push(await captureRun(n, String(n), head));
        if (n < RUNS) await sleep(2000);
    }
    writeSummary(runs, path.join(OUT_DIR, 'summary.md'));
    log('summary -> ' + path.relative(ROOT, path.join(OUT_DIR, 'summary.md')));
    if (problems.length) { log(problems.length + ' problem(s) recorded (listed in summary.md and each run-<n>.json)'); }
    process.exit(0);
})().catch(err => { console.error('perf-trace failed: ' + (err && err.stack || err)); process.exit(2); });
