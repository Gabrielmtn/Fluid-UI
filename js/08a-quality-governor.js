// ═══════════════════════════════════════════════════════════════════
// js/08a-quality-governor.js — adaptive quality governor
// LOAD ORDER: after 08-stats-panel.js (any time before 05 finishes is fine;
//   05's hooks all guard on window.QualityGovernor)
// PROVIDES: window.QualityGovernor
// HOOKS (in 05c and 05j, marked // [GOVERNOR HOOK]):
//   1. pressure Jacobi loop uses effIters(config.PRESSURE_ITERATIONS)
//   2. initFramebuffers multiplies dye/sim base resolution by dyeScale()/simScale()
//   3. sharpen / micro-detail / glow passes gated by fxOn()
//   4. onFrame(nowMs, cpuMs) called once per rendered frame before RAF re-arm
//   5. initFramebuffers preserves dye via clearProg copy (also fixes the
//      long-standing "resolution change wipes artwork" bug)
//
// The governor NEVER writes config or slider DOM — it only provides
// effective values. Saving a preset mid-throttle captures the user's true
// settings.
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
    // Effect shedding (the L5 fx:false rung) is OPT-IN, default off.
    // Principle (TODO.md, Gabriel 2026-07-09): quality machinery may trade
    // FPS and fidelity, NEVER the aesthetic. The fx gate turns off sharpen +
    // micro-detail + glow + MacCormack in one stroke — a wholesale look
    // change that used to fire ~15s into a heavy session with no user input
    // (caught by LookWatchdog: governorFx true→false @ L4→L5).
    var allowFx = false;
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
                if (_s) {
                    if (_s.get('governor.enabled', true) === false) enabled = false;
                    allowResolution = !!_s.get('governor.allowResolution', true);
                    allowFx = !!_s.get('governor.allowFx', false);
                    // keep the stats-panel checkboxes honest if they were
                    // wired before settings hydrated (the mismatch that made
                    // "Adaptive off" look true while the ladder was live)
                    var _t = document.getElementById('governorToggle');
                    var _r = document.getElementById('governorAllowRes');
                    var _f = document.getElementById('governorAllowFx');
                    if (_t) _t.checked = enabled;
                    if (_r) _r.checked = allowResolution;
                    if (_f) _f.checked = allowFx;
                }
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
                idleFps = 0;
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
                idleFps = 0;
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
        if (needReinit) { window.needsFramebufferReinit = true; idleFps = 0; }
        // Paint relief needs a moment to show before a stroke is judged slow.
        slowQuietUntil = nowMs + 1000;
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
    // immediately without waiting for the ladder to bottom out. It lights the
    // slowdown button red (below); a click there runs applyRescue.
    var severeStreak = 0;
    var rescueCooldownUntil = 0;
    var rescueUp = false;

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

    function showRescue() {
        if (rescueUp) return;
        rescueUp = true;
        renderSlow();
    }

    function hideRescue(withCooldown) {
        if (withCooldown) rescueCooldownUntil = performance.now() + 60000;
        severeStreak = 0;
        if (!rescueUp) return;
        rescueUp = false;
        renderSlow();
    }

    // Set a control through its OWN handlers so UI, config, and framebuffers
    // stay in sync (same contract as user interaction)
    function setCtl(id, value, evt) {
        var el = document.getElementById(id);
        if (!el) return;
        el.value = String(value);
        el.dispatchEvent(new Event(evt || 'change', { bubbles: true }));
    }

    // Only ever down: a rescue must not raise a setting already below its pick.
    function lowerCtl(id, value, current, evt) {
        if (isFinite(current) && current > value) setCtl(id, value, evt);
    }

    function applyRescue() {
        // Resolution dominates cost — drop to modest-but-fine values; ease the
        // pressure solve too. Artwork survives (initFramebuffers preserves dye).
        var c = window.config || {};
        lowerCtl('visualResolution', 1024, c.DYE_RESOLUTION, 'change');
        lowerCtl('physicsResolution', 256, c.SIM_RESOLUTION, 'change');
        lowerCtl('pressureIteration', 20, c.PRESSURE_ITERATIONS, 'input');
        if (typeof window.clearActivePreset === 'function') window.clearActivePreset();
        // The workload just dropped massively and deliberately — a HARD reset
        // to full tier is correct here (unlike preset clicks, which soft-reset)
        window.QualityGovernor.reset();
        rescueCooldownUntil = performance.now() + 20000;
        hideRescue(false);
        console.log('[Governor] performance rescue applied (dye 1024, sim 256, iters 20)');
    }

    // ── Slowdown button: under the canvas, yellow or red ────────────────
    // Gabriel 2026-10-15: the old "Running very slowly" toast is now one
    // button on the quality underbar, beside the pills it lowers. High GPU
    // settings hold their fps between strokes and chug once the brush adds
    // its splats, so the main test is painting: fps over half-second windows
    // of a stroke against the fps between strokes (capped at the target —
    // above it painting is smooth anyway). More than 10% under is yellow,
    // more than 25% red, judged on two windows in a row so one hitch is not
    // a slowdown. The rescue above lights it red too. Nothing changes until
    // it is clicked; 3 s of clean painting takes a paint warning back.
    var SLOW_WIN_MS = 500;
    var SLOW_YELLOW = 0.10;
    var SLOW_RED = 0.25;
    var SLOW_CLEAN_MS = 3000;
    var slowWin = { painting: false, frames: 0, startMs: 0, lastMs: 0 };
    var idleFps = 0;          // fps between strokes (EMA); 0 = not measured yet
    var lastPaintSev = 0;     // the previous paint window's verdict
    var cleanPaintMs = 0;
    var paintLevel = 0;       // 0 none, 1 yellow, 2 red
    var paintWavedOff = 0;    // the colour the user dismissed (until the workload changes)
    var slowQuietUntil = 0;   // a level change is still landing: windows wait
    var slowEl = null, slowBtn = null, slowPlacedMs = 0;

    function slowFrame(nowMs) {
        // The bar comes and goes without a resize (Simple layout, focus
        // mode): while the button is up, check its spot twice a second.
        if (slowEl && !slowEl.hidden && nowMs - slowPlacedMs > 500) placeSlow();
        var w = slowWin;
        var painting = !!(window.__lastPaintMs && (nowMs - window.__lastPaintMs) < 250);
        // A stall (hidden tab, reinit, long GC) is not a frame rate, and a
        // window never spans a stroke's start or end: begin a fresh one.
        if (!w.lastMs || nowMs - w.lastMs > 250 || painting !== w.painting || nowMs < slowQuietUntil) {
            w.painting = painting;
            w.frames = 0;
            w.startMs = nowMs;
            w.lastMs = nowMs;
            return;
        }
        w.frames++;
        w.lastMs = nowMs;
        var ms = nowMs - w.startMs;
        if (ms < SLOW_WIN_MS) return;
        var fps = w.frames * 1000 / ms;
        w.frames = 0;
        w.startMs = nowMs;
        if (!painting) idleFps = idleFps ? idleFps * 0.7 + fps * 0.3 : fps;
        else judgePaint(fps);
    }

    function judgePaint(fps) {
        if (!idleFps) return; // nothing to compare against until a pause between strokes
        var base = Math.min(idleFps, targetFps());
        var drop = 1 - fps / base;
        var sev = drop > SLOW_RED ? 2 : (drop > SLOW_YELLOW ? 1 : 0);
        var both = Math.min(sev, lastPaintSev);
        lastPaintSev = sev;
        if (!sev) {
            cleanPaintMs += SLOW_WIN_MS;
            if (paintLevel && cleanPaintMs >= SLOW_CLEAN_MS) { paintLevel = 0; renderSlow(); }
            return;
        }
        cleanPaintMs = 0;
        if (both > paintLevel) {
            paintLevel = both;
            console.log('[Governor] paint slowdown ' + Math.round(drop * 100) + '% (' + fps.toFixed(1) +
                ' fps painting vs ' + base.toFixed(1) + ' between strokes) - ' + (both === 2 ? 'red' : 'yellow'));
            renderSlow();
        }
    }

    // The settings changed under the measurements (resolution, preset,
    // ladder reinit): measure the pause between strokes again, and a colour
    // the user waved off may ask again.
    function slowRelearn() {
        idleFps = 0;
        lastPaintSev = 0;
        cleanPaintMs = 0;
        paintWavedOff = 0;
    }

    function slowLevel() {
        if (!enabled) return 0;
        if (rescueUp) return 2;
        return paintLevel > paintWavedOff && nextLower() ? paintLevel : 0;
    }

    // One step down on whichever of Motion Detail / Image Sharpness is set
    // higher (Motion on a tie: the pressure solve runs on its grid and is
    // most of the frame). Returns null when both are at their lowest.
    function nextLower() {
        var c = window.config || {};
        var pick = function (id, cur) {
            var sel = document.getElementById(id), best = null;
            if (!sel || !isFinite(cur)) return null;
            Array.prototype.forEach.call(sel.options, function (o) {
                var v = parseInt(o.value, 10);
                if (isFinite(v) && v < cur && (best === null || v > best)) best = v;
            });
            return best === null ? null : { id: id, from: cur, to: best };
        };
        var m = pick('physicsResolution', c.SIM_RESOLUTION);
        var i = pick('visualResolution', c.DYE_RESOLUTION);
        if (m && (!i || m.from >= i.from)) return m;
        return i;
    }

    function lowerQuality() {
        if (rescueUp) { applyRescue(); }
        else {
            var step = nextLower();
            if (step) {
                console.log('[Governor] slowdown button: ' + step.id + ' ' + step.from + ' -> ' + step.to);
                setCtl(step.id, step.to, 'change');
                if (typeof window.clearActivePreset === 'function') window.clearActivePreset();
            }
        }
        slowRelearn();
        paintLevel = 0;
        slowQuietUntil = performance.now() + 1500;
        renderSlow();
    }

    function buildSlow() {
        if (slowEl) return;
        slowEl = document.createElement('div');
        slowEl.id = 'slowdownCell';
        slowEl.className = 'slowdown-cell';
        // Body-floated when the bar is hidden, so it takes the group the
        // governor's own controls sit in (css/01-buttons.css).
        slowEl.dataset.group = 'system';
        slowEl.hidden = true;
        slowBtn = document.createElement('button');
        slowBtn.type = 'button';
        slowBtn.id = 'slowdownBtn';
        slowBtn.textContent = 'Slowdown detected, lower quality?';
        slowBtn.addEventListener('click', lowerQuality);
        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'btn--ghost slowdown-close';
        x.title = 'Dismiss';
        x.setAttribute('aria-label', 'Dismiss');
        x.textContent = '✕';
        x.addEventListener('click', function () {
            // No: this colour stays quiet until the settings change; the
            // rescue keeps its old minute.
            paintWavedOff = Math.max(paintWavedOff, paintLevel);
            if (rescueUp) hideRescue(true);
            renderSlow();
        });
        slowEl.appendChild(slowBtn);
        slowEl.appendChild(x);
    }

    // On the underbar when it is on screen; the painting's bottom-left
    // corner when it is not (Simple layout, focus mode, narrow windows).
    function placeSlow() {
        slowPlacedMs = performance.now();
        var bar = document.getElementById('quality-underbar');
        var shown = false;
        if (bar) { try { shown = getComputedStyle(bar).display !== 'none'; } catch (_) {} }
        var parent = shown ? bar : document.body;
        if (slowEl.parentElement !== parent) {
            // Before Reset app / the clock in the DOM too, so Tab meets it
            // where the eye does (22-overlays orders it there).
            parent.insertBefore(slowEl, shown ? bar.querySelector('.reset-app-btn, .demo-clock, .playtest-label') : null);
        }
        slowEl.classList.toggle('floating', !shown);
        var left = '';
        if (!shown) {
            var ca = document.getElementById('canvas-area');
            var r = ca ? ca.getBoundingClientRect() : null;
            left = ((r && r.left > 1 ? Math.round(r.left) : 0) + 14) + 'px';
        }
        if (slowEl.style.left !== left) slowEl.style.left = left;
    }

    function renderSlow() {
        var lv = slowLevel();
        if (!lv && !slowEl) return;
        buildSlow();
        slowEl.hidden = !lv;
        if (!lv) return;
        slowBtn.className = lv === 2 ? 'btn--slow-red' : 'btn--slow-yellow';
        slowEl.dataset.level = lv === 2 ? 'red' : 'yellow';
        placeSlow();
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
        setLevel(level + 1, nowMs, 'paint relief - fps ' + fps.toFixed(1));
    }

    function updateStatusLine() {
        var el = document.getElementById('stat-governor');
        if (!el) return;
        if (!enabled) { el.textContent = 'off'; return; }
        if (held) { el.textContent = 'held (exporting)'; return; }
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

    // Export hold (2026-09-02). A media export drags fps down from OUTSIDE
    // update() — its readback runs in its own rAF callback, so cpuMs stays
    // healthy while the frame count falls — and the ladder read that as sim
    // overload: pressure iterations shed within 300 ms of painting (fast
    // relief), a resolution tier with a framebuffer reinit ~10 s in, the
    // softer dye baked into the recording, and the level lingering after the
    // export until 10 s of no painting. Held, the governor counts nothing:
    // the frame that could not fit drops in the recording instead of
    // changing the look under the brush. Release re-learns from scratch.
    var held = false;

    window.QualityGovernor = {
        // hold(true) while an export captures frames; hold(false) after.
        hold: function (b) {
            b = !!b;
            if (b === held) return;
            held = b;
            frameCount = 0;
            fastFrameCount = 0;
            lastEvalMs = 0;
            fastLastMs = 0;
            lowStreak = 0;
            highStreak = 0;
            severeStreak = 0;
            if (!b) { freezeUntilMs = 0; fastFreezeUntil = 0; }
            updateStatusLine();
        },
        isHeld: function () { return held; },
        onFrame: function (nowMs, cpuMs) {
            if (!enabled || held) return;
            frameCount++;
            fastFrameCount++;
            cpuEma = cpuEma === 0 ? cpuMs : cpuEma * 0.95 + cpuMs * 0.05;
            if (lastEvalMs === 0) { lastEvalMs = nowMs; fastLastMs = nowMs; return; }
            slowFrame(nowMs);
            maybeFastRelief(nowMs);
            if (nowMs - lastEvalMs >= 1000) evaluate(nowMs);
        },
        effIters: function (n) {
            if (!enabled) return n;
            return Math.min(n, LEVELS[level].iterCap);
        },
        dyeScale: function () { return enabled ? effectiveScales(level).dye * bootFactors().dye : 1; },
        simScale: function () { return enabled ? effectiveScales(level).sim * bootFactors().sim : 1; },
        fxOn: function () { return (enabled && allowFx) ? LEVELS[level].fx : true; },
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
            slowRelearn();
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
            slowRelearn();
            updateStatusLine();
        },
        // WYSIWYG on an explicit Visual/Physics resolution pick: the user chose
        // a tier to SEE it, so honor it EXACTLY on this reinit. End the boot
        // quality ascent (which otherwise loads at 0.5x and climbs to target)
        // and drop any resolution-scaling ladder level, so config maps 1:1 to
        // the grid — no silent 0.5x/0.75x between the number picked and what
        // runs. The ladder may still ease back down LATER under sustained low
        // fps (unless Adaptive Resolution is off), but never below the pick on
        // the frame it lands; a short hold keeps it visible before the 1 Hz
        // evaluator can act again. The caller still flags its own reinit.
        pinResolution: function () {
            bootDone = true;
            bootStage = BOOT_STAGES.length - 1;
            if (level !== 0 && scalesDiffer(level, 0)) window.needsFramebufferReinit = true;
            level = 0;
            lowStreak = 0;
            highStreak = 0;
            fastFreezeUntil = 0;
            freezeUntilMs = performance.now() + 3000;
            slowRelearn();
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
            renderSlow();
            console.log('[Governor]', b ? 'enabled' : 'disabled');
        },
        setAllowFx: function (b) {
            b = !!b;
            if (b === allowFx) return;
            allowFx = b;
            var s = settings();
            if (s) s.set('governor.allowFx', b);
            updateStatusLine();
            console.log('[Governor] effect shedding', b ? 'allowed' : 'disallowed');
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
            return { enabled: enabled, allowResolution: allowResolution, level: level, cpuEma: cpuEma, upDwell: upDwell,
                slowdown: { shown: ['none', 'yellow', 'red'][slowLevel()], paintLevel: paintLevel, rescue: rescueUp,
                            idleFps: idleFps, wavedOff: paintWavedOff } };
        }
    };

    // ── UI wiring + persistence (controls live in the stats panel) ──
    function initUI() {
        var s = settings();
        if (s) {
            enabled = s.get('governor.enabled', true) !== false;
            allowResolution = !!s.get('governor.allowResolution', true);
            allowFx = !!s.get('governor.allowFx', false); // opt-in, default off
        }
        var toggle = document.getElementById('governorToggle');
        var resToggle = document.getElementById('governorAllowRes');
        var fxToggle = document.getElementById('governorAllowFx');
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
        if (fxToggle) {
            fxToggle.checked = allowFx;
            fxToggle.addEventListener('change', function () {
                window.QualityGovernor.setAllowFx(fxToggle.checked);
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
