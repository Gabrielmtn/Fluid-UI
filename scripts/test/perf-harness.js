// ═══════════════════════════════════════════════════════════════════
// scripts/test/perf-harness.js — window.__perf, the real-clock instrument.
//
// PAGE code. Standalone: it needs neither harness.js nor stage.js, and
// deliberately does NOT use them, because they are the opposite tool.
// harness.js FREEZES the clock and pumps frames by hand — that is what
// makes correctness reproducible, and it is exactly what makes a timing
// number meaningless. This file measures the app running for real.
//
// WHAT IT MEASURES, AND WHY NOT JUST FPS
// Under vsync, rAF hands out frames at the panel's rate no matter how
// much headroom is left, so fps saturates at 165 (or 60) and stops being
// an answer. A tier that finishes in 3ms and one that finishes in 5.9ms
// both report "165fps" and look identical in the stats panel — right up
// until the frame that doesn't fit, when the difference is the whole
// story. So the primary metric here is TIME PER FRAME, not frames per
// second, and it is measured on both sides of the CPU/GPU split:
//
//   cpuMs   — the JS half, straight from the app's own __stats.lastCpuMs.
//             Command submission only: WebGL calls return long before the
//             GPU has done anything, so on this app cpuMs is usually the
//             SMALL half and a CPU-only measurement will tell you a 4090
//             is bored when it is saturated.
//   gpuMs   — the GPU half, from EXT_disjoint_timer_query_webgl2 where the
//             driver exposes it. Real device nanoseconds, no stall.
//   drainMs — gl.finish() round-trip. Kept as a LAST RESORT and labelled
//             untrustworthy, because measuring it against the timer query
//             showed it is not a work measurement at all. Same machine,
//             same tier, idle workload:
//               vsync on  @30Hz : drain 2.34ms   (timer says 0.19ms)
//               vsync off        : drain 0.00ms  (timer says 0.19ms)
//             With vsync on it reports the wait for the next present; with
//             vsync off Chrome's finish() returns before the work lands.
//             It is off whenever timer queries work, both because it adds
//             nothing and because a per-frame full pipeline drain changes
//             the thing being measured.
//
// So: RUN WITH VSYNC OFF. The app is GPU-bound, and with vsync off the
// measured GPU time per frame comes out equal to the wall-clock frame
// interval (verified across all six tiers: 0.17 vs 0.3ms at stock, 12.9
// vs 12.0ms at the 8K probe) — two independent instruments agreeing,
// which is the only reason to believe either.
//
//   electron.exe . --remote-debugging-port=9333 //                  --disable-gpu-vsync --disable-frame-rate-limit
//
// The number that answers "how far can I push this" is headroomFps:
//   1000 / p95(frameCost), frameCost = cpuMs + (gpuMs or drainMs)
// i.e. the rate the machine could sustain with vsync out of the way,
// computed off the 95th percentile so one hitch does not flatter it.
//
// WORKLOADS
// Steady-state cost and cost-under-the-brush are different questions and
// a tier can pass one and fail the other, so the runs are separate:
//   idle   — warm canvas, no input. The floor: advection, projection,
//            post-FX and the display pass, every frame, forever.
//   paint  — a continuous stroke for the whole window. Adds the splat
//            passes, the dab walker and the brush cursor. This is the
//            one users feel.
//   storm  — paint with every post-FX stage on at once. The ceiling.
// The stroke is parameterised by WALL TIME, not frame index, so it
// covers the same canvas per second at 30fps as at 165 and the tiers
// stay comparable.
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var GL = window.gl || null;

    // ── GPU timer queries ────────────────────────────────────────────
    // Chrome gates this extension and has shipped it disabled for long
    // stretches, so it is strictly a bonus: everything below works
    // without it, on drainMs alone. Queries are asynchronous — the
    // result of frame N is collected several frames later, which is the
    // entire reason they cost nothing.
    var timerExt = null;
    var timerQueue = [];      // in-flight queries, oldest first
    var timerResults = [];    // resolved GPU ms
    var activeQuery = null;
    var realRaf = window.requestAnimationFrame.bind(window);
    var rafPatched = false;
    var lastBeginT = -1;      // rAF timestamp of the frame whose query is open

    // ── Bracketing the query correctly ───────────────────────────────
    // TIME_ELAPSED_EXT measures GPU time between two markers, INCLUDING
    // any idle inside them. The first version of this file opened the
    // query at the bottom of the harness callback and closed it at the
    // top of the next one, so the bracket spanned the browser's present
    // and its vsync wait — and the measurement said so: the same tier on
    // the same machine read 2.34ms vsync-on and 0.19ms vsync-off, a 12x
    // spread that was entirely waiting.
    //
    // So the begin marker has to sit immediately before the app's frame
    // work, not after the previous one. requestAnimationFrame is patched
    // for the duration of a run: the app re-arms itself through the
    // global (05j), so wrapping it puts a hook directly in front of
    // update(), while the harness's own callback re-arms through the
    // saved original and stays unwrapped — which is what makes it the
    // one that runs last and can close the bracket.
    function patchRaf() {
        if (rafPatched) return;
        window.requestAnimationFrame = function (cb) {
            return realRaf(function (t) {
                // Only the FIRST wrapped callback of a frame opens the
                // bracket. Every rAF callback in one frame shares a
                // timestamp, so it is a free frame token — and without it a
                // module whose callback happens to run after the harness's
                // (the jank monitor, layer animation) would reopen a query
                // that the next frame then closes, putting the present back
                // inside the bracket that this whole mechanism exists to
                // keep it out of.
                if (t !== lastBeginT && !activeQuery) { lastBeginT = t; timerBegin(); }
                return cb(t);
            });
        };
        rafPatched = true;
    }
    function unpatchRaf() {
        if (!rafPatched) return;
        window.requestAnimationFrame = realRaf;
        rafPatched = false;
    }

    function initTimer() {
        if (!GL) return false;
        try {
            timerExt = GL.getExtension('EXT_disjoint_timer_query_webgl2');
        } catch (_) { timerExt = null; }
        return !!timerExt;
    }

    function timerBegin() {
        if (!timerExt || activeQuery) return;
        try {
            activeQuery = GL.createQuery();
            GL.beginQuery(timerExt.TIME_ELAPSED_EXT, activeQuery);
        } catch (_) { activeQuery = null; }
    }

    function timerEnd() {
        if (!timerExt || !activeQuery) return;
        try {
            GL.endQuery(timerExt.TIME_ELAPSED_EXT);
            timerQueue.push(activeQuery);
        } catch (_) {}
        activeQuery = null;
        drainTimer();
    }

    function drainTimer() {
        if (!timerExt) return;
        // A GPU context switch (another app, a compositor hiccup)
        // invalidates every query in flight — the spec's DISJOINT bit.
        // Keeping those samples would put phantom 40ms frames in the
        // percentiles, so the whole queue goes.
        var disjoint = GL.getParameter(timerExt.GPU_DISJOINT_EXT);
        if (disjoint) {
            timerQueue.forEach(function (q) { try { GL.deleteQuery(q); } catch (_) {} });
            timerQueue = [];
            return;
        }
        while (timerQueue.length) {
            var q = timerQueue[0];
            var ready = GL.getQueryParameter(q, GL.QUERY_RESULT_AVAILABLE);
            if (!ready) break;
            timerQueue.shift();
            var ns = GL.getQueryParameter(q, GL.QUERY_RESULT);
            timerResults.push(ns / 1e6);
            try { GL.deleteQuery(q); } catch (_) {}
        }
    }

    // ── Statistics ───────────────────────────────────────────────────
    function pct(sorted, p) {
        if (!sorted.length) return null;
        var i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
        return +sorted[i].toFixed(3);
    }

    function summarize(arr) {
        if (!arr.length) return null;
        var s = arr.slice().sort(function (a, b) { return a - b; });
        var sum = 0;
        for (var i = 0; i < s.length; i++) sum += s[i];
        return {
            n: s.length,
            mean: +(sum / s.length).toFixed(3),
            p50: pct(s, 50), p95: pct(s, 95), p99: pct(s, 99),
            min: pct(s, 0), max: pct(s, 100)
        };
    }

    // ── The synthetic painter ────────────────────────────────────────
    // A Lissajous path over the canvas, sampled at the frame rate but
    // POSITIONED by elapsed seconds, so the stroke sweeps the same area
    // per second whatever the fps. Dispatched as real pointer events on
    // the canvas so it goes through the app's actual input path (05d) —
    // dab spacing walker, brush cursor, multiplayer broadcast and all —
    // rather than calling splat() behind their backs and measuring a
    // workload no user can produce.
    var painter = { on: false, down: false, t0: 0 };

    function pointAt(sec) {
        var c = document.getElementById('canvas');
        var r = c.getBoundingClientRect();
        var u = 0.5 + 0.34 * Math.sin(sec * 1.7);
        var v = 0.5 + 0.34 * Math.sin(sec * 2.3 + 1.1);
        return { x: r.left + u * r.width, y: r.top + v * r.height, r: r };
    }

    function firePointer(type, pt, buttons) {
        var c = document.getElementById('canvas');
        var ev = new PointerEvent(type, {
            bubbles: true, cancelable: true,
            pointerId: 7, pointerType: 'mouse', isPrimary: true,
            button: 0, buttons: buttons,
            clientX: pt.x, clientY: pt.y,
            pressure: buttons ? 0.5 : 0
        });
        c.dispatchEvent(ev);
    }

    function painterStart() {
        painter.on = true;
        painter.t0 = performance.now();
        var pt = pointAt(0);
        firePointer('pointerdown', pt, 1);
        painter.down = true;
    }

    function painterTick(nowMs) {
        if (!painter.on || !painter.down) return;
        firePointer('pointermove', pointAt((nowMs - painter.t0) / 1000), 1);
    }

    function painterStop() {
        if (painter.down) {
            firePointer('pointerup', pointAt((performance.now() - painter.t0) / 1000), 0);
        }
        painter.on = false;
        painter.down = false;
    }

    // ── Post-FX toggles for the 'storm' workload ─────────────────────
    // Driven through the controls, not config, so each stage takes the
    // same path a user's click would. Saved and restored around the run.
    var FX_IDS = ['glowToggle', 'scatterToggle', 'displayShadingToggle', 'microDetailToggle'];

    function fxSnapshot() {
        var out = {};
        FX_IDS.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) out[id] = !!el.checked;
        });
        return out;
    }

    function fxSet(state) {
        Object.keys(state).forEach(function (id) {
            var el = document.getElementById(id);
            if (el && el.checked !== state[id]) {
                el.checked = state[id];
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    }

    function fxAllOn() {
        var want = {};
        FX_IDS.forEach(function (id) { if (document.getElementById(id)) want[id] = true; });
        fxSet(want);
    }

    // ── The measurement loop ─────────────────────────────────────────
    // Piggybacks on rAF rather than patching the app's frame loop: our
    // callback is registered after update()'s and both re-arm from
    // inside themselves, so the relative order is stable and ours always
    // runs immediately AFTER the frame's work has been submitted. That
    // is the only place a drain measurement means anything.
    function measure(opts) {
        opts = opts || {};
        var seconds = opts.seconds || 6;
        var warmup = opts.warmupSeconds != null ? opts.warmupSeconds : 2;
        var workload = opts.workload || 'idle';
        var useDrain = opts.drain !== false;

        if (!GL) GL = window.gl;
        if (!GL) return Promise.resolve({ error: 'no GL context on window.gl' });

        var haveTimer = initTimer();
        timerResults = [];
        timerQueue = [];
        // Never both: the drain perturbs the pipeline and, as the header
        // records, does not measure work in either vsync state.
        if (haveTimer && opts.drain !== true) useDrain = false;
        if (haveTimer) patchRaf();

        var prevFx = fxSnapshot();
        var prevCap = window.fpsCap;
        // Uncapped: an fps cap makes the loop early-return most ticks, and
        // the cost of a frame that did no work is not a measurement.
        if (opts.uncap !== false) window.fpsCap = 0;
        if (workload === 'storm') fxAllOn();

        var stateBefore = window.PerfTiers ? window.PerfTiers.describe() : null;
        var intervals = [], cpus = [], drains = [], lastT = 0;
        var started = 0, measuring = false, frames = 0;
        var longFrames = 0;      // frames over 2x the running median
        var t0 = performance.now();

        return new Promise(function (resolve) {
            function tick(now) {
                // Warmup: let the FBO rebuild, shader compile and cache
                // warm settle before a single sample is kept. The first
                // frames after a resolution change include the whole
                // reallocation and would dominate every percentile.
                if (!measuring && now - t0 >= warmup * 1000) {
                    measuring = true;
                    started = now;
                    lastT = 0;
                    if (workload === 'paint' || workload === 'storm') painterStart();
                }

                // Close the query opened at the end of the PREVIOUS callback.
                // rAF order is [app update()] then [this callback], and both
                // re-arm from inside themselves, so the commands between the
                // last timerBegin() and this timerEnd() are exactly one frame
                // of the app's work — nothing of ours, since our own reads
                // happen after this line.
                timerEnd();

                if (painter.on) painterTick(now);

                if (measuring) {
                    if (lastT) intervals.push(now - lastT);
                    lastT = now;
                    frames++;

                    var st = window.__stats;
                    if (st && typeof st.lastCpuMs === 'number') cpus.push(st.lastCpuMs);

                    if (useDrain) {
                        var d0 = performance.now();
                        GL.finish();
                        drains.push(performance.now() - d0);
                    }
                    if (haveTimer) drainTimer();
                }

                if (measuring && now - started >= seconds * 1000) {
                    painterStop();
                    unpatchRaf();
                    fxSet(prevFx);
                    window.fpsCap = prevCap;
                    // Let any straggling timer queries land before we read.
                    setTimeout(function () {
                        drainTimer();
                        resolve(report(now - started));
                    }, 120);
                    return;
                }
                realRaf(tick);
            }

            function report(elapsedMs) {
                var st2 = window.PerfTiers ? window.PerfTiers.describe() : null;
                var iv = summarize(intervals);
                var cpu = summarize(cpus);
                var drain = summarize(drains);
                var gpu = summarize(timerResults);

                // Cost of a frame = the JS half plus the device half. Prefer
                // the timer query; fall back to the drain, which carries the
                // IPC round trip with it.
                var gpuP95 = gpu ? gpu.p95 : (drain ? drain.p95 : null);
                var cpuP95 = cpu ? cpu.p95 : 0;
                var costP95 = gpuP95 != null ? +(cpuP95 + gpuP95).toFixed(3) : null;

                // Share of frames that would NOT have fitted the target
                // budget. A median-relative rule was the first attempt and
                // it is useless with vsync off: at 3000fps the median frame
                // is 0.3ms, so ordinary scheduling noise trips "twice the
                // median" and stock scored worse than the 8K probe. An
                // absolute budget is what the question actually was.
                var budgetMs = 1000 / (opts.targetFps || 60);
                var perFrame = gpu ? timerResults : intervals;
                var cpuTypical = cpu ? cpu.p50 : 0;
                var over = perFrame.filter(function (x) { return x + cpuTypical > budgetMs; });
                longFrames = over.length;
                var overOf = perFrame.length || 1;

                return {
                    workload: workload,
                    seconds: +(elapsedMs / 1000).toFixed(2),
                    frames: frames,
                    fps: +(frames / (elapsedMs / 1000)).toFixed(1),
                    interval: iv,
                    cpuMs: cpu,
                    gpuMs: gpu,
                    drainMs: drain,
                    gpuSource: gpu ? 'timer-query' : (drain ? 'gl.finish' : 'none'),
                    frameCostP95: costP95,
                    // The headline: sustainable rate with vsync out of the
                    // way. Compare against the panel, not against 60.
                    headroomFps: costP95 ? +(1000 / costP95).toFixed(1) : null,
                    budgetMs: +budgetMs.toFixed(2),
                    overBudget: longFrames,
                    overBudgetPct: +(100 * longFrames / overOf).toFixed(2),
                    state: st2,
                    // The app autoloads the PREVIOUS session's settings a
                    // moment after boot, and that restore lands on top of an
                    // applied tier. MEASURED: a 'stock' row that reported
                    // 2048 on entry was measured at dye 8192, the resolution
                    // the last session left saved. A run whose configuration
                    // changed under it is not a measurement of either tier.
                    drifted: !!(stateBefore && st2 &&
                        (stateBefore.dye !== st2.dye || stateBefore.sim !== st2.sim ||
                         stateBefore.renderScale !== st2.renderScale)),
                    stateBefore: stateBefore,
                    // Validity invariant: real GPU work per frame can never
                    // exceed the wall-clock interval between frames. When it
                    // does, TIME_ELAPSED has absorbed the present's vsync
                    // back-pressure — the GPU stalls acquiring a back buffer
                    // BETWEEN our two markers, and no bracketing can separate
                    // that out. Such a run reports waiting, not work.
                    // Threshold, not equality. The two series are not sampled
                    // 1:1 — intervals come from this callback, GPU samples
                    // from queries that resolve a few frames later and get
                    // dropped wholesale on a DISJOINT — so their percentiles
                    // disagree by a few percent even on a clean run. MEASURED:
                    // the worst honest ratio across a full vsync-off ladder was
                    // 1.09, while the vsync-locked run that motivated this check
                    // sat at 1.87 (7.0ms interval against 13.1ms of "GPU").
                    // 1.35 sits in the gap with room on both sides.
                    vsyncContaminated: !!(gpu && iv && gpu.p50 > iv.p50 * 1.35),
                    vram: window.__fboAlloc ? window.__fboAlloc() : null
                };
            }

            realRaf(tick);
        });
    }

    // ── Capability probe ─────────────────────────────────────────────
    function probe() {
        var g = window.gl;
        var out = {
            gl: !!g,
            timerQuery: false,
            maxTextureSize: null,
            renderer: null, vendor: null,
            displayHz: (window.__stats && window.__stats.displayHz) || null,
            deviceMemoryGB: navigator.deviceMemory || null,
            cores: navigator.hardwareConcurrency || null,
            canvas: null, wrapper: null
        };
        if (g) {
            out.maxTextureSize = g.getParameter(g.MAX_TEXTURE_SIZE);
            out.maxRenderbufferSize = g.getParameter(g.MAX_RENDERBUFFER_SIZE);
            try {
                var dbg = g.getExtension('WEBGL_debug_renderer_info');
                if (dbg) {
                    out.renderer = g.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
                    out.vendor = g.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
                }
            } catch (_) {}
            out.timerQuery = !!(function () {
                try { return g.getExtension('EXT_disjoint_timer_query_webgl2'); }
                catch (_) { return null; }
            })();
        }
        var c = document.getElementById('canvas');
        var w = document.getElementById('canvas-wrapper');
        if (c) out.canvas = c.width + 'x' + c.height;
        if (w) out.wrapper = w.clientWidth + 'x' + w.clientHeight;
        out.tiers = window.PerfTiers ? window.PerfTiers.list() : null;
        return out;
    }

    // Put the app in a known, comparable state before a run. Deliberately
    // NOT stage.js: that pins for bit-identity (governor off, substeps off,
    // uncapped) inside a frozen clock, and half of those pins are the very
    // things being measured. This pins only what would otherwise make two
    // tiers incomparable — the canvas box, which every buffer is sized off,
    // and the adaptive ladder, which exists to walk a tier back down.
    function pin(opts) {
        opts = opts || {};
        var box = opts.box || null;
        if (box) {
            var wrap = document.getElementById('canvas-wrapper');
            if (wrap) {
                wrap.style.width = box[0] + 'px';
                wrap.style.height = box[1] + 'px';
                if (window.initializeCanvasPosition) window.initializeCanvasPosition();
                if (window.updateCanvasSize) window.updateCanvasSize();
            }
        }
        if (window.QualityGovernor) window.QualityGovernor.setEnabled(false);
        return {
            pinned: true,
            wrapper: (function () { var w = document.getElementById('canvas-wrapper');
                                    return w ? w.clientWidth + 'x' + w.clientHeight : null; })(),
            canvas: (function () { var c = document.getElementById('canvas');
                                   return c ? c.width + 'x' + c.height : null; })()
        };
    }

    window.__perf = {
        probe: probe,
        pin: pin,
        measure: measure,
        painterStop: painterStop,
        installed: true
    };

    return { installed: true, gl: !!GL };
})()
