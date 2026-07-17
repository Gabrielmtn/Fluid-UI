// ═══════════════════════════════════════════════════════════════════
// js/08b-jank-monitor.js — Phase 2 Stage 0 instrumentation (TODO.md)
// LOAD ORDER: after 08a-quality-governor.js
// PROVIDES: window.JankMonitor — attributes dropped frames + long tasks
//   to the UI interaction that caused them (hover/click on mixer-strip
//   channels, sidebar sections, drawers), so every Stage 1/2 audit item
//   gets a before/after number instead of a feeling.
// PROVIDES: window.LookWatchdog — polls every look-affecting piece of
//   state (config keys, live FBO resolutions, material mode, fps cap,
//   governor/boot state, freeze) and logs exactly what changed and when.
//   Purpose: NOTHING may change the shader aesthetic without user input
//   (principle in TODO.md); whatever does gets named in the log.
// Dev instrumentation: passive capture-phase listeners + one extra rAF
// callback; zero cost to the sim path and no behavior changes.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';
    var DROP_FACTOR = 1.6;   // frame gap > 1.6× the display's median = dropped frame(s)
    var WINDOW_MS = 600;     // how long after an interaction we attribute jank to it

    var MAX_WINDOW_MS = 4000; // continuous mousing splits into ≤4s windows

    var lastT = 0;
    // Expected gap = p90 of recent gaps, NOT the median: with an FPS cap
    // below the display Hz the update loop early-returns most rAF ticks
    // (fast cadence) and does real work on cap-interval ticks (slow
    // cadence). A median adapts to the fast mode and then counts every
    // legitimate render tick as 1-2 "drops" — the phantom 82 drops/sec
    // baseline of 2026-07-09. p90 adopts the slow structural mode as
    // normal; only gaps beyond it (real stalls) count.
    var expected = 16.7;
    var gapMedian = 16.7;
    var deltas = [];
    var interactions = [];   // ring buffer of closed interaction windows
    var current = null;      // open interaction window
    var totals = { frames: 0, dropped: 0, longTasks: 0, worstTask: 0 };
    // Baseline: what the sim drops on its own with NO ui interaction open.
    // Without this, long merged hover windows soak up the sim's ambient
    // drops and the counts lie (field data 2026-07-09: thousands of
    // "attributed" drops that were really ambient load).
    var baseline = { ms: 0, dropped: 0 };

    // ── Frame cadence observer ─────────────────────────────────────
    function tick(t) {
        if (lastT) {
            var d = t - lastT;
            totals.frames++;
            if (d < 100) { deltas.push(d); if (deltas.length > 120) deltas.shift(); }
            if (deltas.length >= 30) {
                var s = deltas.slice().sort(function (a, b) { return a - b; });
                gapMedian = s[s.length >> 1];
                expected = s[Math.min(s.length - 1, Math.floor(s.length * 0.9))];
            }
            var dropped = d > expected * DROP_FACTOR ? Math.round(d / expected) - 1 : 0;
            if (current) {
                if (dropped > 0) {
                    totals.dropped += dropped;
                    current.dropped += dropped;
                    if (d > current.worstGap) current.worstGap = d;
                    // fine attribution: what was under the pointer when the
                    // frame actually dropped (merged hover windows span many
                    // targets; this pins the damage to the right one)
                    current.dropAt[hoverLabel] = (current.dropAt[hoverLabel] || 0) + dropped;
                }
            } else {
                baseline.ms += d;
                if (dropped > 0) { totals.dropped += dropped; baseline.dropped += dropped; }
            }
        }
        lastT = t;
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    // ── Long-task observer (main-thread stalls ≥50ms) ──────────────
    try {
        var po = new PerformanceObserver(function (list) {
            list.getEntries().forEach(function (e) {
                totals.longTasks++;
                if (e.duration > totals.worstTask) totals.worstTask = e.duration;
                if (current) {
                    current.longTasks++;
                    if (e.duration > current.worstTask) current.worstTask = e.duration;
                }
            });
        });
        po.observe({ entryTypes: ['longtask'] });
    } catch (_) { /* older engines: frame-gap detection still works */ }

    // ── Event Timing: slow event dispatches below the longtask radar ──
    // duration = input delay + handler processing + presentation delay.
    // proc >> 0 → a JS handler is the cost (and its target names it);
    // proc ≈ 0 with big duration → presentation-bound (compositor/GPU),
    // and no JS hunting will find it. This split is the diagnosis the
    // 2026-07-09 field data (188 drops/s, zero long tasks) needs.
    var slowEvents = [];
    try {
        var eo = new PerformanceObserver(function (list) {
            list.getEntries().forEach(function (e) {
                var rec = {
                    type: e.name,
                    dur: Math.round(e.duration),
                    proc: Math.round((e.processingEnd || 0) - (e.processingStart || 0)),
                    target: e.target
                        ? (e.target.id ? '#' + e.target.id
                            : (e.target.className ? String(e.target.className).split(' ')[0] : e.target.tagName))
                        : '?'
                };
                slowEvents.push(rec);
                if (slowEvents.length > 300) slowEvents.shift();
                if (current) {
                    current.slowEvents.push(rec);
                    if (current.slowEvents.length > 25) current.slowEvents.shift();
                }
            });
        });
        eo.observe({ type: 'event', durationThreshold: 24 });
    } catch (_) { /* Event Timing unsupported: drops + long tasks still work */ }

    // ── Interaction windows ─────────────────────────────────────────
    function begin(label) {
        var t = performance.now();
        if (current && t < current.deadline && (t - current.start) < MAX_WINDOW_MS) {
            // rapid-fire (hover storms): extend the window, merge labels —
            // but cap total length so long mousing sessions keep temporal
            // resolution instead of merging into one giant record
            current.deadline = t + WINDOW_MS;
            if (current.label.indexOf(label) === -1 && current.label.length < 80) {
                current.label += ' + ' + label;
            }
            return;
        }
        finish();
        current = { label: label, start: t, deadline: t + WINDOW_MS,
                    dropped: 0, longTasks: 0, worstTask: 0, worstGap: 0, dropAt: {},
                    slowEvents: [] };
    }
    function baselineRate() { // ambient drops/sec with no interaction open
        return baseline.ms > 2000 ? baseline.dropped / (baseline.ms / 1000) : 0;
    }
    function finish() {
        if (!current) return;
        var rec = current;
        current = null;
        rec.end = performance.now();
        rec.duration = rec.end - rec.start;
        // excess = drops beyond what the sim was already dropping ambiently
        // over the same span — THIS is the interaction's real cost
        rec.excess = Math.max(0, Math.round(rec.dropped - baselineRate() * (rec.duration / 1000)));
        interactions.push(rec);
        if (interactions.length > 100) interactions.shift();
        if (rec.excess || rec.longTasks) {
            console.debug('[Jank] ' + rec.label + ': +' + rec.excess + ' excess dropped frame(s) over '
                + Math.round(rec.duration) + 'ms (' + rec.dropped + ' raw), '
                + rec.longTasks + ' long task(s)'
                + (rec.worstTask ? ' (worst ' + Math.round(rec.worstTask) + 'ms)' : ''));
        }
        renderStats();
    }
    setInterval(function () {
        if (current && performance.now() > current.deadline) finish();
    }, 250);

    // ── Sim health: achieved render rate vs the FPS cap ────────────
    // 05j's lastDrawTimeMs advances by exactly one cap-interval per
    // rendered frame (drift-aligned), so its slope IS the render rate —
    // sampled read-only here, no changes to the loop. This is the number
    // that says whether the sim is actually missing ITS deadline, as
    // opposed to rAF-cadence noise.
    var simHealth = { lastVal: 0, lastAt: 0, fps: -1 };
    setInterval(function () {
        try {
            if (typeof lastDrawTimeMs === 'number') {
                var t = performance.now();
                var cap = (typeof window.fpsCap === 'number' && window.fpsCap > 0) ? window.fpsCap : 0;
                if (simHealth.lastAt && cap > 0) {
                    var frames = (lastDrawTimeMs - simHealth.lastVal) / (1000 / cap);
                    simHealth.fps = Math.max(0, +(frames / ((t - simHealth.lastAt) / 1000)).toFixed(1));
                } else if (!cap) {
                    simHealth.fps = -1; // uncapped: rAF cadence IS the sim rate
                }
                simHealth.lastVal = lastDrawTimeMs;
                simHealth.lastAt = t;
            }
        } catch (_) {}
    }, 1000);

    // ── Delegated interaction hooks (capture phase, passive) ───────
    function labelFor(el) {
        var sec = el.closest && el.closest('.sidebar-section');
        if (sec) {
            var h = sec.querySelector('.section-header');
            return 'sidebar:' + (h && h.textContent ? h.textContent.trim().slice(0, 24) : 'section');
        }
        var ch = el.closest && el.closest('.mixer-channel');
        if (ch) {
            var l = ch.querySelector('.ch-label');
            return 'strip:' + (l && l.textContent ? l.textContent.trim().slice(0, 16) : 'channel');
        }
        if (el.id) return '#' + el.id;
        return (el.tagName || 'node').toLowerCase();
    }
    function inUI(el) {
        return !!(el.closest && (el.closest('#sidebar-right') || el.closest('#mixer-strip')
            || el.closest('.rec-drawer') || el.closest('#statsPanel')));
    }
    var hoverLabel = '(none)'; // whatever is under the pointer right now
    document.addEventListener('mouseover', function (e) {
        var t = e.target;
        if (!t || t.nodeType !== 1) return;
        hoverLabel = labelFor(t);
        if (inUI(t)) begin('hover ' + hoverLabel);
    }, { capture: true, passive: true });
    document.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.nodeType === 1 && inUI(t)) begin('click ' + labelFor(t));
    }, { capture: true, passive: true });

    // ── Stats For Nerds section (lazy: panel exists at load, section
    //    appended once; cheap textContent updates only) ──────────────
    var rows = null;
    function ensureSection() {
        if (rows) return true;
        var content = document.querySelector('#statsPanel .stats-content');
        if (!content) return false;
        var sec = document.createElement('div');
        sec.className = 'stats-section';
        sec.innerHTML = '<div class="stats-title">UI Jank</div>'
            + '<div class="stat-row"><span class="stat-label">Dropped frames:</span> <span id="stat-jank-dropped">0</span></div>'
            + '<div class="stat-row"><span class="stat-label">Long tasks:</span> <span id="stat-jank-tasks">0</span></div>'
            + '<div class="stat-row"><span class="stat-label">Worst task:</span> <span id="stat-jank-worst">--</span></div>'
            + '<div class="stat-row"><span class="stat-label">Last interaction:</span> <span id="stat-jank-last">--</span></div>';
        content.appendChild(sec);
        rows = {
            dropped: sec.querySelector('#stat-jank-dropped'),
            tasks: sec.querySelector('#stat-jank-tasks'),
            worst: sec.querySelector('#stat-jank-worst'),
            last: sec.querySelector('#stat-jank-last')
        };
        return true;
    }
    function renderStats() {
        if (!ensureSection()) return;
        rows.dropped.textContent = totals.dropped;
        rows.tasks.textContent = totals.longTasks;
        rows.worst.textContent = totals.worstTask ? Math.round(totals.worstTask) + 'ms' : '--';
        var last = interactions[interactions.length - 1];
        rows.last.textContent = last
            ? last.label.slice(0, 30) + ' — +' + last.excess + ' excess / ' + last.longTasks + ' task'
            : '--';
    }
    setInterval(renderStats, 1000);

    // ── Public API for the audit ────────────────────────────────────
    window.JankMonitor = {
        totals: totals,
        interactions: interactions,
        // last n interactions with their damage
        report: function (n) {
            return interactions.slice(-(n || 10)).map(function (r) {
                return { label: r.label, excess: r.excess, dropped: r.dropped,
                         durationMs: Math.round(r.duration), longTasks: r.longTasks,
                         worstTask: Math.round(r.worstTask), worstGap: Math.round(r.worstGap),
                         dropAt: r.dropAt };
            });
        },
        // the offenders, ranked by EXCESS over ambient baseline —
        // this list IS the Stage 1/2 work queue
        worst: function (n) {
            return interactions.slice()
                .sort(function (a, b) { return (b.excess + b.longTasks) - (a.excess + a.longTasks); })
                .slice(0, n || 10)
                .map(function (r) {
                    return { label: r.label, excess: r.excess, dropped: r.dropped,
                             durationMs: Math.round(r.duration), longTasks: r.longTasks,
                             worstTask: Math.round(r.worstTask), dropAt: r.dropAt,
                             slowEvents: r.slowEvents };
                });
        },
        // one-line health check: ambient drop rate vs in-interaction rate
        summary: function () {
            var uiMs = 0, uiDrops = 0, uiExcess = 0;
            interactions.forEach(function (r) { uiMs += r.duration; uiDrops += r.dropped; uiExcess += r.excess; });
            // aggregate slow events by type: the proc-vs-duration split says
            // whether jank is JS handlers (proc high) or presentation/GPU
            var byType = {};
            slowEvents.forEach(function (e) {
                var t = byType[e.type] || (byType[e.type] = { count: 0, worstDur: 0, worstProc: 0, worstTarget: '' });
                t.count++;
                if (e.dur > t.worstDur) { t.worstDur = e.dur; t.worstTarget = e.target; }
                if (e.proc > t.worstProc) t.worstProc = e.proc;
            });
            return {
                // cadence diagnostics: interpret drop counts with these.
                // gapMedianMs ≈ display frame time; expectedGapMs = what a
                // "normal" gap looks like here (p90 — absorbs the FPS-cap
                // skip/render bimodal pattern); simFps = achieved sim rate
                // vs fpsCap (-1 when uncapped/unknown). If simFps ≈ fpsCap,
                // the sim is healthy regardless of the drop counts.
                cadence: {
                    gapMedianMs: +gapMedian.toFixed(1),
                    expectedGapMs: +expected.toFixed(1),
                    displayHzEst: +(1000 / Math.max(1, gapMedian)).toFixed(0),
                    // OS-reported panel rate (Electron screen API via 05i).
                    // displayHzOS >> displayHzEst = the OS knows the panel is
                    // fast but Chromium is presenting slow — renderer-side
                    // problem (flags/ANGLE/monitor assignment), not Windows
                    // settings. Both at 60 = check Windows refresh-rate
                    // setting / cable first.
                    displayHzOS: window.__displayHz || 'unknown',
                    fpsCap: (typeof window.fpsCap === 'number') ? window.fpsCap : 'unknown',
                    simFps: simHealth.fps
                },
                slowEventsByType: byType,
                baselineDropsPerSec: +baselineRate().toFixed(2),
                baselineMinutes: +(baseline.ms / 60000).toFixed(1),
                interactionDropsPerSec: uiMs > 500 ? +((uiDrops / (uiMs / 1000))).toFixed(2) : 0,
                interactionMinutes: +(uiMs / 60000).toFixed(1),
                totalExcess: uiExcess,
                verdict: uiMs > 500 && baseline.ms > 2000
                    ? ((uiDrops / (uiMs / 1000)) > baselineRate() * 1.3
                        ? 'UI interactions measurably worsen frame drops'
                        : 'UI interactions ≈ ambient — the drops are sim load, not UI')
                    : 'not enough data yet'
            };
        },
        // M5 grain meter (2026-07-17): the collider-fuzz-round readback
        // metrics made permanent. vHF = mean |v − 4-neighbor mean| over the
        // sim grid (grid-scale velocity noise — the grain engine); dyeHF =
        // same on the dye's dominant channel ×1000 (visible speckle);
        // vMax/pMax for cap and fp16 headroom. Sync readbacks (one sim-res +
        // one dye-res) — an on-demand instrument, never call it per frame.
        grain: function () {
            try {
                var v = window.velocity, d = window.density, p = window.pressure;
                if (!v || !v.read || typeof gl === 'undefined') return { error: 'sim not ready' };
                var sw = window.simTexWidth, sh = window.simTexHeight;
                var buf = new Float32Array(sw * sh * 4);
                gl.bindFramebuffer(gl.FRAMEBUFFER, v.read.fbo);
                gl.readPixels(0, 0, sw, sh, gl.RGBA, gl.FLOAT, buf);
                var vHF = 0, vMax = 0, n = 0, row = sw * 4;
                for (var y = 1; y < sh - 1; y++) {
                    for (var x = 1; x < sw - 1; x++) {
                        var i = (y * sw + x) * 4;
                        var vx = buf[i], vy = buf[i + 1];
                        var spd = Math.sqrt(vx * vx + vy * vy);
                        if (spd > vMax) vMax = spd;
                        var ax = (buf[i - 4] + buf[i + 4] + buf[i - row] + buf[i + row]) * 0.25;
                        var ay = (buf[i - 3] + buf[i + 5] + buf[i - row + 1] + buf[i + row + 1]) * 0.25;
                        vHF += Math.hypot(vx - ax, vy - ay);
                        n++;
                    }
                }
                vHF /= Math.max(1, n);
                var pMax = 0;
                if (p && p.read) {
                    gl.bindFramebuffer(gl.FRAMEBUFFER, p.read.fbo);
                    gl.readPixels(0, 0, sw, sh, gl.RGBA, gl.FLOAT, buf);
                    for (var k = 0; k < sw * sh * 4; k += 4) {
                        var pa = Math.abs(buf[k]);
                        if (pa > pMax) pMax = pa;
                    }
                }
                var dyeHF = 0;
                if (d && d.read && window.dyeTexWidth) {
                    var dw = window.dyeTexWidth, dh = window.dyeTexHeight, drow = dw * 4;
                    var db = new Float32Array(dw * dh * 4);
                    gl.bindFramebuffer(gl.FRAMEBUFFER, d.read.fbo);
                    gl.readPixels(0, 0, dw, dh, gl.RGBA, gl.FLOAT, db);
                    var m = 0, dn = 0;
                    for (var yy = 1; yy < dh - 1; yy += 2) {
                        for (var xx = 1; xx < dw - 1; xx += 2) {
                            var j = (yy * dw + xx) * 4;
                            var c = Math.max(db[j], db[j + 1], db[j + 2]);
                            var cav = (Math.max(db[j - 4], db[j - 3], db[j - 2])
                                     + Math.max(db[j + 4], db[j + 5], db[j + 6])
                                     + Math.max(db[j - drow], db[j - drow + 1], db[j - drow + 2])
                                     + Math.max(db[j + drow], db[j + drow + 1], db[j + drow + 2])) * 0.25;
                            m += Math.abs(c - cav);
                            dn++;
                        }
                    }
                    dyeHF = m / Math.max(1, dn);
                }
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                // M3 units: velocity is stored in UV/s now — report vHF/vMax
                // in CURRENT-GRID texels/s (×simTexWidth) so readings stay
                // comparable with the pre-M3 baselines in TODO/commits.
                return {
                    vHF: +(vHF * sw).toFixed(2),
                    vMax: Math.round(vMax * sw),
                    pMax: +pMax.toFixed(3),
                    dyeHF: +(dyeHF * 1000).toFixed(2),
                    capSpd: window.config ? Math.round((window.config.VELOCITY_CAP || 30) * sw) : null,
                    srcGate: window.config ? window.config.VEL_SOURCE_GATE !== false : null
                };
            } catch (e) { return { error: String(e) }; }
        },
        reset: function () {
            totals.frames = 0; totals.dropped = 0; totals.longTasks = 0; totals.worstTask = 0;
            baseline.ms = 0; baseline.dropped = 0;
            interactions.length = 0;
            renderStats();
        }
    };

    // ═══════════════════════════════════════════════════════════════
    // LookWatchdog — catches ANY change to look-affecting state.
    // Getter-based and try/catch-guarded so missing globals (load
    // order, web build) simply read as undefined until they exist.
    // Watching EFFECTS (config values, live FBO sizes) rather than
    // actors means every mutator is caught: governor,
    // boot ascent, settings autoload, material modes, presets, user.
    // ═══════════════════════════════════════════════════════════════
    var lwBootMs = performance.now();
    var lwWatch = {
        // sim + effect config (the look)
        densityDiss: function () { return window.config && window.config.DENSITY_DISSIPATION; },
        velocityDiss: function () { return window.config && window.config.VELOCITY_DISSIPATION; },
        pressureDiss: function () { return window.config && window.config.PRESSURE_DISSIPATION; },
        pressureIters: function () { return window.config && window.config.PRESSURE_ITERATIONS; },
        curl: function () { return window.config && window.config.CURL; },
        splatRadius: function () { return window.config && window.config.SPLAT_RADIUS; },
        sharpness: function () { return window.config && window.config.SHARPNESS; },
        clarity: function () { return window.config && window.config.CLARITY; },
        vibrance: function () { return window.config && window.config.VIBRANCE; },
        ridges: function () { return window.config && window.config.RIDGES; },
        swirl: function () { return window.config && window.config.SWIRL; },
        macCormack: function () { return window.config && window.config.MACCORMACK; },
        multigrid: function () { return window.config && window.config.MULTIGRID; },
        sunrays: function () { return window.config && window.config.SUNRAYS; },
        bloomCeiling: function () { return window.config && window.config.BLOOM_CEILING; },
        velInfluence: function () { return window.config && window.config.VELOCITY_INFLUENCE; },
        // configured vs LIVE resolutions (live catches every FBO reinit,
        // including the boot ascent, whoever ordered it)
        dyeResConfig: function () { return window.config && window.config.DYE_RESOLUTION; },
        simResConfig: function () { return window.config && window.config.SIM_RESOLUTION; },
        dyeResLive: function () { return window.dyeTexWidth + 'x' + window.dyeTexHeight; },
        simResLive: function () { return window.simTexWidth + 'x' + window.simTexHeight; },
        // pacing (dt changes advection/decay character)
        fpsCap: function () { return window.fpsCap; },
        timeScale: function () { return window.timeScale; },
        // modes + gates
        materialMode: function () { var el = document.getElementById('materialMode'); return el && el.value; },
        displayShading: function () { var el = document.getElementById('displayShadingToggle'); return el && el.checked; },
        microDetail: function () { var el = document.getElementById('microDetailToggle'); return el && el.checked; },
        lighting: function () { return !!(window.lightSource && window.lightSource.enabled); },
        lightShift: function () { return !!(window.lightShift && window.lightShift.enabled); },
        frozen: function () { return !!window.__fluidFrozen; },
        governorFx: function () { return window.QualityGovernor ? window.QualityGovernor.fxOn() : undefined; },
        governorIters: function () {
            return (window.QualityGovernor && window.config)
                ? window.QualityGovernor.effIters(window.config.PRESSURE_ITERATIONS) : undefined;
        },
        governorState: function () {
            try { return JSON.stringify(window.QualityGovernor.getState()); } catch (_) { return undefined; }
        },
        // wrapper vs canvas divergence: the init-size / monitor-move bug
        // class. Healthy = buffer matches wrapper layout AND the painted
        // rect matches the wrapper rect (within 2px). A persistent BUFFER
        // divergence = the update-loop tracker isn't healing; a persistent
        // VISUAL divergence with matching buffers = zoom/DPR class.
        canvasSync: function () {
            var w = document.getElementById('canvas-wrapper');
            var c = document.getElementById('canvas');
            if (!w || !c) return undefined;
            var bufOk = (c.width === w.clientWidth && c.height === w.clientHeight);
            var visOk = true;
            try {
                var wr = w.getBoundingClientRect();
                var cr = c.getBoundingClientRect();
                if (wr.height > 0) { // hidden pages report zero rects — skip
                    visOk = Math.abs(wr.width - cr.width) <= 2 && Math.abs(wr.height - cr.height) <= 2;
                }
            } catch (_) {}
            if (bufOk && visOk) return 'in-sync';
            var msg = [];
            if (!bufOk) msg.push('BUFFER ' + c.width + 'x' + c.height + ' vs wrapper ' + w.clientWidth + 'x' + w.clientHeight);
            if (!visOk) msg.push('VISUAL canvas-rect ≠ wrapper-rect');
            return 'DIVERGED ' + msg.join(' + ');
        }
    };
    var lwPrev = {};
    var lwHistory = [];
    var lwArmed = false;
    setInterval(function () {
        var t = +((performance.now() - lwBootMs) / 1000).toFixed(1);
        for (var key in lwWatch) {
            var v;
            try { v = lwWatch[key](); } catch (_) { v = undefined; }
            if (v === undefined || v === null || (typeof v === 'number' && isNaN(v))) continue;
            if (!(key in lwPrev)) { lwPrev[key] = v; continue; } // first sighting = baseline
            if (lwPrev[key] !== v) {
                // coalesce same-key runs within 1.5s (slider drags)
                var last = lwHistory[lwHistory.length - 1];
                if (last && last.key === key && (t - last.t) < 1.5) {
                    last.to = v; last.t = t;
                } else {
                    var entry = { t: t, key: key, from: lwPrev[key], to: v };
                    lwHistory.push(entry);
                    if (lwHistory.length > 200) lwHistory.shift();
                    console.warn('[LookWatchdog] ' + key + ': ' + lwPrev[key] + ' → ' + v + '  @ ' + t + 's');
                }
                lwPrev[key] = v;
            }
        }
        if (!lwArmed && Object.keys(lwPrev).length > 5) {
            lwArmed = true;
            console.log('[LookWatchdog] armed — any look-state change will be logged');
        }
    }, 250);
    window.LookWatchdog = {
        history: lwHistory,
        snapshot: function () {
            var out = {};
            for (var key in lwWatch) { try { out[key] = lwWatch[key](); } catch (_) {} }
            return out;
        },
        reset: function () { lwHistory.length = 0; }
    };
})();
