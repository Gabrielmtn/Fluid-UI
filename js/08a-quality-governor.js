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

    // ── Boot quality ascent ──────────────────────────────────────────
    // Desktop boots with config at Ultra (2048 dye / 512 sim), but rendering
    // that cold makes load janky on rigs that can't do it — and the ladder
    // only sheds quality slowly, through visible jank. So invert it: the sim
    // STARTS at a light effective resolution (the old balanced-boot workload)
    // and steps UP to the config target once measured fps proves out. Dye is
    // preserved across the reinit; on a just-loaded canvas the step is
    // invisible. If fps doesn't hold, the ascent parks at the light stage for
    // the session. Any explicit resolution change (user dropdown, preset,
    // rescue) wins exactly: the boot factor snaps to 1 the moment config
    // diverges from the boot values.
    var BOOT_STAGES = [
        { dye: 0.5, sim: 0.5 },   // ≈1024/256 at the 2048/512 default — snappy load
        { dye: 1.0, sim: 1.0 }    // full Ultra
    ];
    var bootStage = 0;
    var bootDone = false;          // stop stepping (complete, parked, or overridden)
    var bootInit = false;
    var bootHighStreak = 0;
    var bootLowStreak = 0;
    var bootDye0 = 0, bootSim0 = 0; // config at ascent start (override detection)

    function bootFactors() {
        if (!bootInit) {
            // Lazy eligibility check on first use — config doesn't exist yet
            // when this file loads. Only a cinematic-class boot target needs
            // the ramp; mobile / modest configs already load fast.
            bootInit = true;
            // Late re-read of the persisted toggle: initUI's DCL-time restore
            // can lose to async settings hydration in Electron, leaving the
            // ascent running under a stale enabled=true even though the user
            // saved it off — every launch then flashed the half-res look and
            // visibly "snapped" to full res moments later. By the time the
            // first framebuffer init lands here, settings are hydrated.
            try {
                var _s = settings();
                if (_s && _s.get('governor.enabled', true) === false) enabled = false;
            } catch (_) {}
            if (!enabled || !window.config || window.config.DYE_RESOLUTION < 2048) {
                bootStage = BOOT_STAGES.length - 1;
                bootDone = true;
            } else {
                bootDye0 = window.config.DYE_RESOLUTION;
                bootSim0 = window.config.SIM_RESOLUTION;
            }
        } else if (!bootDone && window.config &&
                   (window.config.DYE_RESOLUTION !== bootDye0 ||
                    window.config.SIM_RESOLUTION !== bootSim0)) {
            // Explicit resolution change mid-ascent (dropdown/preset/rescue):
            // the chosen values must apply exactly. The change already queued
            // its own framebuffer reinit, which is what called us.
            bootStage = BOOT_STAGES.length - 1;
            bootDone = true;
            console.log('[Governor] boot ascent ended — resolution set explicitly');
        }
        return BOOT_STAGES[bootStage];
    }

    function maybeBootAscent(nowMs, fps, target) {
        var bf = bootFactors(); // also runs override detection
        if (bootDone) return false;
        // Judge purely by measured fps — the ladder level is NOT a signal here:
        // a load-transient dip parks the ladder at L1 for a long time (its 98%
        // recovery bar sits above what a frame-skip fps cap jitters at), and
        // gating on it deadlocked the ascent at stage 0 with fps at target.
        if (fps < 0.90 * target) {
            bootHighStreak = 0;
            // Only a climb we made can be "undone"; at stage 0 a low eval is
            // load-transient jank or a genuinely weak rig — either way just
            // keep waiting (a weak rig simply never climbs, which is already
            // the parked state, and the ladder provides any further relief).
            if (bootStage > 0 && ++bootLowStreak >= 2) {
                bootStage--;
                window.needsFramebufferReinit = true;
                freezeUntilMs = nowMs + 3000;
                bootDone = true;
                console.log('[Governor] boot ascent parked at dye ×' + BOOT_STAGES[bootStage].dye +
                    ' (fps ' + fps.toFixed(1) + ' vs target ' + target + ')');
                return true;
            }
            return false;
        }
        bootLowStreak = 0;
        if (fps >= 0.95 * target) {
            bootHighStreak++;
            // Hold reinit steps while a fresh stroke is on screen — the
            // resample pop stays invisible on a settled canvas.
            var recentPaint = window.__lastPaintMs && (nowMs - window.__lastPaintMs) < 4000;
            if (bootHighStreak >= 2 && !recentPaint) {
                bootHighStreak = 0;
                bootStage++;
                window.needsFramebufferReinit = true;
                freezeUntilMs = nowMs + 3000;
                lowStreak = 0;
                highStreak = 0;
                if (bootStage >= BOOT_STAGES.length - 1) {
                    bootDone = true;
                    console.log('[Governor] boot ascent complete — full quality (fps ' + fps.toFixed(1) + ')');
                } else {
                    console.log('[Governor] boot ascent → dye ×' + BOOT_STAGES[bootStage].dye +
                        ' (fps ' + fps.toFixed(1) + ')');
                }
                updateStatusLine();
                return true;
            }
        } else {
            bootHighStreak = 0;
        }
        return false;
    }

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
        var s = window.__stats; // reassigned each frame — always read fresh
        var t = cap > 0 ? cap : ((s && s.displayHz) || 60);
        // Quality decisions must not chase a high-refresh display: against a
        // 240 Hz target a session rendering a fluid 165-210 fps reads as
        // "failing" forever, and the ladder sheds real quality (with reinit
        // churn) to chase it. Above ~90 fps painting is already smooth —
        // judge quality there; the render loop itself stays uncapped.
        return Math.min(t, 90);
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

        // Rescue detection runs even during step-change hysteresis freezes —
        // a toxic workload shouldn't wait out the ladder to be noticed
        maybeOfferRescue(nowMs, fps);

        if (nowMs < freezeUntilMs) return;

        var target = targetFps();
        var budgetMs = 1000 / target;

        // Boot ascent gets first claim on this eval; if it stepped (either
        // direction) the fps sample predates the reinit — skip the ladder.
        if (maybeBootAscent(nowMs, fps, target)) return;

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

    // ── Performance rescue: an escape hatch for toxic workloads ─────────
    // If the ladder is fully shed and fps is still unusable (heavy legacy
    // preset: huge resolutions + iterations + stacked FX), no amount of
    // adaptation will save the session — offer the user a one-click way out.
    // "Severe" means genuinely unusable (≈<15-20 fps), NOT merely missing an
    // ambitious 240 fps cap; a catastrophic fast-path (<8 fps) offers rescue
    // immediately without waiting for the ladder to bottom out.
    var severeStreak = 0;
    var rescueCooldownUntil = 0;
    var rescueEl = null;

    function atLadderBottom() { return nextDown(level) === level; }

    function severeThreshold() {
        var t = targetFps();
        return Math.min(20, Math.max(10, 0.5 * t));
    }

    function maybeOfferRescue(nowMs, fps) {
        var severe = fps < severeThreshold();
        severeStreak = severe ? severeStreak + 1 : 0;
        if (!severe) { hideRescue(false); return; } // performance recovered — retract quietly
        if (nowMs < rescueCooldownUntil) return;
        if ((severeStreak >= 4 && atLadderBottom()) || (severeStreak >= 4 && fps < 8)) {
            showRescue();
        }
    }

    function buildRescue() {
        if (rescueEl) return;
        rescueEl = document.createElement('div');
        rescueEl.id = 'perfRescueToast';
        rescueEl.style.cssText =
            'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:10005;' +
            'display:none;align-items:center;gap:10px;padding:10px 12px;' +
            'background:linear-gradient(180deg,#2a2016,#1c1610);border:1px solid rgba(255,178,71,0.55);' +
            'border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,0.6);color:#e6edf3;' +
            'font-size:13px;font-family:inherit;';
        rescueEl.innerHTML =
            '<span>🐌 Running very slowly</span>' +
            '<button id="perfRescueBtn" style="padding:6px 12px;border-radius:8px;cursor:pointer;' +
                'font-weight:700;font-size:12px;background:linear-gradient(#4a3a1a,#33280f);' +
                'color:#ffd699;border:1px solid rgba(255,178,71,0.6);">Boost performance</button>' +
            '<button id="perfRescueClose" title="Dismiss" style="padding:4px 8px;border-radius:6px;' +
                'cursor:pointer;background:transparent;color:rgba(255,255,255,0.5);border:none;font-size:13px;">✕</button>';
        document.body.appendChild(rescueEl);
        rescueEl.querySelector('#perfRescueBtn').addEventListener('click', applyRescue);
        rescueEl.querySelector('#perfRescueClose').addEventListener('click', function () {
            hideRescue(true); // user said no — don't nag for a while
        });
    }

    function showRescue() {
        buildRescue();
        rescueEl.style.display = 'flex';
    }

    function hideRescue(withCooldown) {
        if (rescueEl) rescueEl.style.display = 'none';
        if (withCooldown) rescueCooldownUntil = performance.now() + 60000;
        severeStreak = 0;
    }

    // Set a control through its OWN handlers so UI, config, and framebuffers
    // stay in sync (same contract as user interaction)
    function setCtl(id, value, evt) {
        var el = document.getElementById(id);
        if (!el) return;
        el.value = String(value);
        el.dispatchEvent(new Event(evt || 'change', { bubbles: true }));
    }

    function applyRescue() {
        // Resolution dominates cost — drop to modest-but-fine values; ease the
        // pressure solve too. Artwork survives (initFramebuffers preserves dye).
        setCtl('visualResolution', '1024', 'change');
        setCtl('physicsResolution', '256', 'change');
        setCtl('pressureIteration', 20, 'input');
        if (typeof window.clearActivePreset === 'function') window.clearActivePreset();
        // The workload just dropped massively and deliberately — a HARD reset
        // to full tier is correct here (unlike preset clicks, which soft-reset)
        window.QualityGovernor.reset();
        rescueCooldownUntil = performance.now() + 20000;
        hideRescue(false);
        console.log('[Governor] performance rescue applied (dye 1024, sim 256, iters 20)');
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
        var bf = bootInit ? BOOT_STAGES[bootStage] : { dye: 1, sim: 1 };
        var dyeX = sc.dye * bf.dye;
        var simX = sc.sim * bf.sim;
        var iters = window.config
            ? Math.min(window.config.PRESSURE_ITERATIONS, L.iterCap) + '/' + window.config.PRESSURE_ITERATIONS
            : (isFinite(L.iterCap) ? String(L.iterCap) : 'full');
        el.textContent = 'L' + level + ' — iters ' + iters + ', dye ×' + dyeX +
            (simX !== 1 ? ', sim ×' + simX : '') + (L.fx ? '' : ', fx off') +
            (bootInit && !bootDone ? ' ↑warming' : '');
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
        dyeScale: function () { return enabled ? effectiveScales(level).dye * bootFactors().dye : 1; },
        simScale: function () { return enabled ? effectiveScales(level).sim * bootFactors().sim : 1; },
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
        // For workload changes (preset apply, snapshot restore): the OLD
        // adaptation statistics are stale, but the hardware didn't get any
        // faster — keep the current quality tier and just re-learn from here.
        // The hard reset() above snapped to L0 on every preset click, which
        // meant seconds of over-budget frames (plus a framebuffer reinit)
        // until the 1 Hz evaluator crawled back down the ladder.
        softReset: function () {
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
