// ═══════════════════════════════════════════════════════════════════
// js/08a-quality-governor.js — adaptive quality governor
// LOAD ORDER: after 08-stats-panel.js (any time before 05 finishes is fine;
//   05's hooks all guard on window.QualityGovernor)
// PROVIDES: window.QualityGovernor
// HOOKS (all in 05-fluid-sim.js, marked // [GOVERNOR HOOK]):
//   1. pressure Jacobi loop uses effIters(config.PRESSURE_ITERATIONS)
//   2. initFramebuffers multiplies dye/sim base resolution by dyeScale()/simScale()
//   3. sharpen / micro-detail / sunrays passes gated by fxOn()
//   4. onFrame(nowMs, cpuMs) called once per rendered frame before RAF re-arm
//   5. initFramebuffers preserves dye via clearProg copy (also fixes the
//      long-standing "resolution change wipes artwork" bug)
//
// The governor NEVER writes config or slider DOM — it only provides
// effective values. Saving a preset mid-throttle captures the user's true
// settings.
//
// Interaction with 14-battery-manager.js (audited): battery tiers/profiles
// write config.PRESSURE_ITERATIONS / SIM_RESOLUTION / DYE_RESOLUTION
// directly (14:394,400-401,566-573). Those writes are user intent — they
// change config — and the governor's multipliers stack on top of whatever
// config currently holds.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    // Step-down order: pressure iterations → resolution → post-FX.
    // With allowResolution OFF the resolution tiers are skipped
    // (ladder becomes L0, L1, L2, L5) and dye/sim scales stay 1.
    var LEVELS = [
        { iterCap: Infinity, dye: 1.0,  sim: 1.0,  fx: true,  res: false }, // L0 nominal
        { iterCap: 20,       dye: 1.0,  sim: 1.0,  fx: true,  res: false }, // L1
        { iterCap: 12,       dye: 1.0,  sim: 1.0,  fx: true,  res: false }, // L2
        { iterCap: 12,       dye: 0.75, sim: 1.0,  fx: true,  res: true  }, // L3 [resolution tier]
        { iterCap: 12,       dye: 0.5,  sim: 0.75, fx: true,  res: true  }, // L4 [resolution tier]
        { iterCap: 12,       dye: 0.5,  sim: 0.75, fx: false, res: true  }  // L5 (+post-FX off)
    ];

    var enabled = true;
    var allowResolution = false;
    var level = 0;

    // 1 Hz evaluation state
    var frameCount = 0;
    var lastEvalMs = 0;
    var cpuEma = 0;
    var lowStreak = 0;       // consecutive evals below target
    var highStreak = 0;      // consecutive evals comfortably at target
    var freezeUntilMs = 0;   // hysteresis: no evals for 3s after a change
    var upDwell = 5;         // evals required at-target before stepping up
    var lastStepUpMs = 0;    // for flap detection

    // Fast paint-relief state (sub-second; only steps the no-pop iteration tiers)
    var fastFrameCount = 0;
    var fastLastMs = 0;
    var fastFreezeUntil = 0;

    function settings() { return window.settingsManager || null; }

    function targetFps() {
        var cap = (typeof window.fpsCap === 'number' && window.fpsCap > 0) ? window.fpsCap : 0;
        if (cap > 0) return cap;
        var s = window.__stats; // reassigned each frame — always read fresh
        return (s && s.displayHz) || 60;
    }

    function effectiveScales(lv) {
        var L = LEVELS[lv];
        if (!allowResolution) return { dye: 1, sim: 1 };
        return { dye: L.dye, sim: L.sim };
    }

    function scalesDiffer(a, b) {
        var sa = effectiveScales(a), sb = effectiveScales(b);
        return sa.dye !== sb.dye || sa.sim !== sb.sim;
    }

    function setLevel(next, nowMs, why) {
        next = Math.max(0, Math.min(LEVELS.length - 1, next));
        if (next === level) return;
        var needReinit = scalesDiffer(level, next);
        console.log('[Governor] L' + level + ' → L' + next + ' (' + why + ')' +
            (needReinit ? ' [framebuffer reinit, dye preserved]' : ''));
        level = next;
        if (needReinit) window.needsFramebufferReinit = true;
        freezeUntilMs = nowMs + 3000;
        lowStreak = 0;
        highStreak = 0;
        updateStatusLine();
    }

    function nextDown(from) {
        var n = from + 1;
        while (n < LEVELS.length && LEVELS[n].res && !allowResolution) n++;
        return Math.min(n, LEVELS.length - 1);
    }

    function nextUp(from) {
        var n = from - 1;
        while (n > 0 && LEVELS[n].res && !allowResolution) n--;
        return Math.max(n, 0);
    }

    function evaluate(nowMs) {
        var elapsed = nowMs - lastEvalMs;
        var fps = frameCount * 1000 / elapsed;
        frameCount = 0;
        lastEvalMs = nowMs;

        if (nowMs < freezeUntilMs) return;

        var target = targetFps();
        var budgetMs = 1000 / target;

        if (fps < 0.90 * target) {
            lowStreak++;
            highStreak = 0;
            if (lowStreak >= 2 && level < LEVELS.length - 1) {
                // Flap detection: stepping down soon after stepping up → back off
                if (lastStepUpMs && nowMs - lastStepUpMs < 10000) {
                    upDwell = Math.min(upDwell * 2, 30);
                    console.log('[Governor] flap detected — upDwell now', upDwell, 'evals');
                }
                setLevel(nextDown(level), nowMs, 'fps ' + fps.toFixed(1) + ' < 90% of ' + target);
            }
        } else if (fps >= 0.98 * target && cpuEma < 0.7 * budgetMs) {
            highStreak++;
            lowStreak = 0;
            if (highStreak >= upDwell && level > 0) {
                // Resolution-tier recovery reinitializes framebuffers, which
                // resamples the dye and visibly pops mid-artwork. Hold those
                // transitions until painting has been idle long enough that
                // the canvas has mostly faded — the reinit is then invisible.
                var up = nextUp(level);
                var recentPaint = window.__lastPaintMs && (nowMs - window.__lastPaintMs) < 10000;
                if (recentPaint && scalesDiffer(level, up)) return;
                lastStepUpMs = nowMs;
                setLevel(up, nowMs, 'recovered (fps ' + fps.toFixed(1) + ', cpu ' + cpuEma.toFixed(1) + 'ms)');
            }
        } else {
            lowStreak = 0;
            highStreak = 0;
        }
        updateStatusLine();
    }

    // Highest quality level that does NOT change resolution — stepping through these
    // reinits nothing, so it's visually seamless (used by the fast paint path).
    var MAX_NONRES_LEVEL = (function () {
        var m = 0;
        for (var i = 0; i < LEVELS.length; i++) if (!LEVELS[i].res) m = i;
        return m;
    })();

    // Fast relief while ACTIVELY painting. The 1 Hz evaluator can't react within a
    // single stroke, so on a ~300 ms window we drop the iteration-cap tiers when fps
    // tanks mid-paint. Those tiers don't reinit framebuffers (no visible pop);
    // resolution tiers are left to the slow path, which only touches them once
    // painting has gone idle (so its reinit pop stays invisible).
    function maybeFastRelief(nowMs) {
        var elapsed = nowMs - fastLastMs;
        if (elapsed < 300) return;
        var fps = fastFrameCount * 1000 / elapsed;
        fastFrameCount = 0;
        fastLastMs = nowMs;
        var painting = window.__lastPaintMs && (nowMs - window.__lastPaintMs) < 250;
        if (!painting || level >= MAX_NONRES_LEVEL || nowMs < fastFreezeUntil) return;
        if (fps >= 0.85 * targetFps()) return;
        fastFreezeUntil = nowMs + 700; // brief settle before another step
        setLevel(level + 1, nowMs, 'paint relief — fps ' + fps.toFixed(1));
    }

    function updateStatusLine() {
        var el = document.getElementById('stat-governor');
        if (!el) return;
        if (!enabled) { el.textContent = 'off'; return; }
        var L = LEVELS[level];
        var sc = effectiveScales(level);
        var iters = window.config
            ? Math.min(window.config.PRESSURE_ITERATIONS, L.iterCap) + '/' + window.config.PRESSURE_ITERATIONS
            : (isFinite(L.iterCap) ? String(L.iterCap) : 'full');
        el.textContent = 'L' + level + ' — iters ' + iters + ', dye ×' + sc.dye +
            (sc.sim !== 1 ? ', sim ×' + sc.sim : '') + (L.fx ? '' : ', fx off');
    }

    window.QualityGovernor = {
        onFrame: function (nowMs, cpuMs) {
            if (!enabled) return;
            frameCount++;
            fastFrameCount++;
            cpuEma = cpuEma === 0 ? cpuMs : cpuEma * 0.95 + cpuMs * 0.05;
            if (lastEvalMs === 0) { lastEvalMs = nowMs; fastLastMs = nowMs; return; }
            maybeFastRelief(nowMs);
            if (nowMs - lastEvalMs >= 1000) evaluate(nowMs);
        },
        effIters: function (n) {
            if (!enabled) return n;
            return Math.min(n, LEVELS[level].iterCap);
        },
        dyeScale: function () { return enabled ? effectiveScales(level).dye : 1; },
        simScale: function () { return enabled ? effectiveScales(level).sim : 1; },
        fxOn: function () { return enabled ? LEVELS[level].fx : true; },
        reset: function () {
            if (level !== 0 && scalesDiffer(level, 0)) window.needsFramebufferReinit = true;
            level = 0;
            frameCount = 0;
            lastEvalMs = 0;
            cpuEma = 0;
            lowStreak = 0;
            highStreak = 0;
            freezeUntilMs = 0;
            fastFreezeUntil = 0;
            updateStatusLine();
        },
        setEnabled: function (b) {
            b = !!b;
            if (b === enabled) return;
            enabled = b;
            if (!b) this.reset(); // kill switch: back to nominal instantly
            var s = settings();
            if (s) s.set('governor.enabled', b);
            updateStatusLine();
            console.log('[Governor]', b ? 'enabled' : 'disabled');
        },
        setAllowResolution: function (b) {
            b = !!b;
            if (b === allowResolution) return;
            // Changing this while throttled at a resolution tier changes scales
            if (LEVELS[level].res) window.needsFramebufferReinit = true;
            allowResolution = b;
            var s = settings();
            if (s) s.set('governor.allowResolution', b);
            updateStatusLine();
        },
        getState: function () {
            return { enabled: enabled, allowResolution: allowResolution, level: level, cpuEma: cpuEma, upDwell: upDwell };
        }
    };

    // ── UI wiring + persistence (controls live in the stats panel) ──
    function initUI() {
        var s = settings();
        if (s) {
            enabled = s.get('governor.enabled', true) !== false;
            allowResolution = !!s.get('governor.allowResolution', true);
        }
        var toggle = document.getElementById('governorToggle');
        var resToggle = document.getElementById('governorAllowRes');
        if (toggle) {
            toggle.checked = enabled;
            toggle.addEventListener('change', function () {
                window.QualityGovernor.setEnabled(toggle.checked);
            });
        }
        if (resToggle) {
            resToggle.checked = allowResolution;
            resToggle.addEventListener('change', function () {
                window.QualityGovernor.setAllowResolution(resToggle.checked);
            });
        }
        updateStatusLine();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }
})();
