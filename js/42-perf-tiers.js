// ═══════════════════════════════════════════════════════════════════
// js/42-perf-tiers.js — named max-fidelity tiers (branch: perf-max-tiers)
// LOAD ORDER: after 08a-quality-governor.js and 05h-slider-bindings.js
//   (it drives their controls); anywhere in the tail is fine.
// PROVIDES: window.PerfTiers
//
// WHY THIS EXISTS
// The app's quality machinery only ever steps DOWN. QualityGovernor's
// ladder sheds iterations, then resolution, then post-FX, and its boot
// ascent climbs no higher than whatever config already said. Nothing in
// the app could answer "this machine has budget left — what should it
// spend it on?", so the answer defaulted to the desktop boot config
// (dye 2048 / sim 512) on a 4090 exactly as on a laptop iGPU.
//
// A tier here is a BUNDLE, not a resolution number, because the four
// axes buy different things and saturate at different points:
//
//   dye resolution     — how fine the pigment itself is recorded.
//                        Quadratic in VRAM; the axis that runs out of
//                        memory first.
//   sim resolution     — how fine the MOTION is. Quadratic in fill for
//                        every projection pass, and the pressure solve
//                        runs many passes.
//   sim oversample     — how small the timestep is. Linear in the whole
//                        physics cost, and the only axis that reduces
//                        numerical diffusion rather than just sampling
//                        it more finely. Cheapest real fidelity per
//                        pixel on a canvas that is not resolution-bound.
//   render scale       — supersampling of the DISPLAY pass. Quadratic
//                        in that one pass only. The only anti-aliasing
//                        the kaleido seams, collider edges and shading
//                        relief can get, because that pass is the sole
//                        stage that runs per output pixel.
//
// Plus the pressure solve, which has a threshold rather than a curve:
// 05j gates the full-shape multigrid V-cycle behind PRESSURE_ITERATIONS
// >= 24 (`_mgBudgetLow`). Below that, MG_CYCLES / MG_PRE / MG_POST /
// MG_COARSE are read and DISCARDED — the solver runs a fixed light
// 2x(1,1,4). At the shipped default of 17 iterations they do nothing at
// all, so every tier from Cinematic up crosses 24 first and only then
// shapes the cycle.
//
// NOTHING here runs on its own. Tiers apply on an explicit call; the
// default config is untouched and a stock boot is bit-identical to the
// pre-branch build. Measure with scripts/test/run-perf.js.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    // ── The ladder ───────────────────────────────────────────────────
    // 'stock' is the shipped desktop default, recorded here so a run can
    // return to it exactly and so the table has a baseline row. Each
    // higher tier states what it is FOR, because "more" is not a reason.
    var TIERS = {
        stock: {
            label: 'Stock (shipped default)',
            about: 'What desktop boots with today. The baseline every measurement is relative to.',
            dye: 2048, sim: 512, iters: 17, oversample: 1, renderScale: 1.0,
            // Stated explicitly rather than left alone: a baseline row that
            // inherits whatever the last session saved is not a baseline.
            // (Measured: a run started from mg pre 0 / post 1 / coarse 27.)
            mg: { cycles: 2, pre: 2, post: 2, coarse: 8 }, glow: 256, scatter: 512
        },
        high: {
            label: 'High',
            about: 'Stock dye, finer motion, and the first real supersample. ' +
                   'Cheapest visible step: the display pass stops aliasing and ' +
                   'the sim grid stops being the thing you can see.',
            dye: 2048, sim: 768, iters: 24, oversample: 1, renderScale: 1.25,
            mg: { cycles: 2, pre: 2, post: 2, coarse: 8 }, glow: 320, scatter: 768
        },
        cinematic: {
            label: 'Cinematic',
            about: '4K pigment, 1K motion, halved timestep. The first tier where ' +
                   'the fluid holds small vorticity instead of smearing it, and ' +
                   'the first that unlocks a properly shaped V-cycle.',
            dye: 4096, sim: 1024, iters: 28, oversample: 2, renderScale: 1.5,
            mg: { cycles: 3, pre: 2, post: 2, coarse: 8 }, glow: 384, scatter: 1024
        },
        cinematicPlus: {
            label: 'Cinematic+',
            about: 'Same pigment, half again the motion detail, timestep down to a ' +
                   'third. Aimed at a 4090 holding 60fps rather than 165.',
            dye: 4096, sim: 1536, iters: 32, oversample: 3, renderScale: 1.75,
            mg: { cycles: 3, pre: 3, post: 3, coarse: 12 }, glow: 512, scatter: 1536
        },
        overkill: {
            label: 'Overkill',
            about: '6K pigment, 2K motion, 4x oversample, 2x supersample. Everything ' +
                   'past here is a VRAM experiment, not a setting.',
            dye: 6144, sim: 2048, iters: 40, oversample: 4, renderScale: 2.0,
            mg: { cycles: 4, pre: 3, post: 3, coarse: 16 }, glow: 512, scatter: 2048
        },
        absurd: {
            label: 'Absurd (24GB probe)',
            about: '8K pigment / 3K motion. A deliberate ceiling probe: the point is ' +
                   'to find out WHERE it breaks and how, not to paint here.',
            dye: 8192, sim: 3072, iters: 44, oversample: 4, renderScale: 2.0,
            mg: { cycles: 4, pre: 3, post: 3, coarse: 16 }, glow: 512, scatter: 2048
        }
    };

    var ORDER = ['stock', 'high', 'cinematic', 'cinematicPlus', 'overkill', 'absurd'];

    function cfg() { return window.config || {}; }

    // ── VRAM estimate ────────────────────────────────────────────────
    // Models the buffer set 05c actually allocates, so a tier can be
    // priced BEFORE it is applied and an 8K probe does not simply lose
    // the GL context on a card that was never going to hold it. It is a
    // FLOOR: drivers pad allocations, the compositor keeps its own
    // copies of the drawing buffer, and layer/mask buffers scale with
    // however many the user has open. window.__fboAlloc() reports what
    // was really allocated after the fact.
    function estimateVRAM(t, box) {
        t = typeof t === 'string' ? TIERS[t] : t;
        if (!t) return null;
        var b = box || currentBox();
        var aspect = b.w / Math.max(1, b.h);
        function grid(base) {
            return aspect >= 1
                ? { w: base, h: Math.max(1, Math.round(base / aspect)) }
                : { w: Math.max(1, Math.round(base * aspect)), h: base };
        }
        var dye = grid(t.dye), sim = grid(t.sim);
        var dyeTexels = dye.w * dye.h, simTexels = sim.w * sim.h;

        // dye res: density(x2) + sharpened + detailed + lit, all RGBA16F
        var bytes = dyeTexels * 8 * 5;

        // raster paint layers + mask coverage, RGBA8 at dye res — priced
        // off what is actually open, since an empty canvas has none
        var nRaster = (window.layers && window.layers.length) || 0;
        var nMask = (window.Masks && window.Masks.list && window.Masks.list().length) || 0;
        bytes += dyeTexels * 4 * (nRaster + nMask);

        // sim res, per texel: velocity(2xRG16F=8) + wetness(2xR16F=4) +
        // divergence(2) + curl(2) + pressure(2xR16F=4) + obstacle(2) +
        // obstacleScratch(2) + mgRes0(2)
        bytes += simTexels * 26;
        // multigrid pyramid: 5 R16F per level, each level a quarter of
        // the last — the geometric sum converges to a third of one level
        bytes += simTexels * 10 / 3;

        // fixed-base buffers: glow + its mip chain (+1/3), scatter,
        // shadeForm x2 — all RGBA16F
        var glow = grid(Math.min(t.glow || 256, Math.max(b.w, b.h)));
        var scat = grid(Math.min(t.scatter || 512, Math.max(b.w, b.h)));
        var shade = grid((cfg().SHADE_FORM_RESOLUTION | 0) || 256);
        bytes += glow.w * glow.h * 8 * 4 / 3;
        bytes += scat.w * scat.h * 8;
        bytes += shade.w * shade.h * 8 * 2;

        // the drawing buffer itself, at the supersample factor. RGBA8,
        // and the compositor holds ~2 of them (front + back).
        var rs = t.renderScale || 1;
        bytes += b.w * rs * b.h * rs * 4 * 2;
        // PhotoSafe adds 3 more RGBA8 buffers at drawing-buffer size
        if (cfg().PHOTOSAFE) bytes += b.w * rs * b.h * rs * 4 * 3;

        return {
            mb: +(bytes / 1048576).toFixed(1),
            dye: dye.w + 'x' + dye.h,
            sim: sim.w + 'x' + sim.h,
            buffer: Math.round(b.w * rs) + 'x' + Math.round(b.h * rs),
            layers: nRaster, masks: nMask
        };
    }

    function currentBox() {
        var wrap = document.getElementById('canvas-wrapper');
        if (wrap && wrap.clientWidth) return { w: wrap.clientWidth, h: wrap.clientHeight };
        var c = document.getElementById('canvas');
        return { w: (c && c.width) || 1920, h: (c && c.height) || 1080 };
    }

    // Drive a control through its OWN handler, the same contract user
    // interaction uses, so config, UI and framebuffers stay in step.
    // (Same reasoning as the governor's rescue path — writing config
    // behind a control's back leaves the visible number lying.)
    function setCtl(id, value, evt) {
        var el = document.getElementById(id);
        if (!el) return false;
        if (el.tagName === 'SELECT' && window.setResolutionDropdown) {
            window.setResolutionDropdown(el, value);
        } else {
            el.value = String(value);
        }
        el.dispatchEvent(new Event(evt || 'change', { bubbles: true }));
        return true;
    }

    // ── Apply ────────────────────────────────────────────────────────
    // opts.governor: 'off' (default for measurement — an adaptive ladder
    //   silently walking a tier back down is the one thing that makes a
    //   perf number meaningless), 'keep' to leave it alone.
    // opts.maxMB: refuse the tier if the estimate exceeds this. The
    //   8K probe can ask a driver for more than it has, and losing the
    //   GL context takes the artwork with it.
    function apply(name, opts) {
        opts = opts || {};
        var t = typeof name === 'string' ? TIERS[name] : name;
        if (!t) return { error: 'unknown tier: ' + name, tiers: ORDER.slice() };

        var est = estimateVRAM(t);
        if (opts.maxMB && est && est.mb > opts.maxMB) {
            return { error: 'tier needs ~' + est.mb + ' MB, limit is ' + opts.maxMB + ' MB',
                     estimate: est, applied: false };
        }

        if (opts.governor !== 'keep' && window.QualityGovernor) {
            // Not a preference — a correctness requirement for measuring.
            window.QualityGovernor.setEnabled(false);
        }

        // Config-only keys first (no control owns them), then the ones
        // that do, so a single reinit at the end covers everything.
        var c = cfg();
        c.SIM_OVERSAMPLE = Math.max(1, Math.min(8, t.oversample || 1));
        // The two substep mechanisms MULTIPLY in 05j, and they are answers to
        // opposite problems: the SIM_SUBSTEP gate adds steps because the panel
        // is slow, this adds them because the machine is fast. Stacking them is
        // never what anyone meant, and it feeds back — a heavy tier pushes the
        // frame past the gate's 20ms threshold, the gate then multiplies the
        // tier's own oversample, and the frame gets heavier still. MEASURED on
        // a 30Hz panel: 'overkill' asked for 4 steps and ran 12.
        // A tier that sets the timestep explicitly owns it, so the gate is off
        // for the duration; 'stock' (oversample 1) restores the shipped default.
        if (c.SIM_OVERSAMPLE > 1) c.SIM_SUBSTEP = false;
        else c.SIM_SUBSTEP = true;
        c.GLOW_RESOLUTION = t.glow || 256;
        c.SCATTER_RESOLUTION = t.scatter || 512;
        if (t.shadeForm) c.SHADE_FORM_RESOLUTION = t.shadeForm;

        setCtl('pressureIteration', t.iters, 'input');
        if (t.mg) {
            setCtl('mgCycles', t.mg.cycles, 'input');
            setCtl('mgPre', t.mg.pre, 'input');
            setCtl('mgPost', t.mg.post, 'input');
            setCtl('mgCoarse', t.mg.coarse, 'input');
            // The sliders may not exist in every build of the panel;
            // config is the contract 05j actually reads.
            c.MG_CYCLES = t.mg.cycles; c.MG_PRE = t.mg.pre;
            c.MG_POST = t.mg.post; c.MG_COARSE = t.mg.coarse;
        }
        c.PRESSURE_ITERATIONS = t.iters;

        // Resolution last: each of these flags a framebuffer reinit, and
        // pinResolution stops the governor's boot ascent from quietly
        // running the tier at half of what was asked for.
        setCtl('visualResolution', t.dye, 'change');
        setCtl('physicsResolution', t.sim, 'change');
        c.DYE_RESOLUTION = t.dye;
        c.SIM_RESOLUTION = t.sim;

        if (window.setRenderScale) window.setRenderScale(t.renderScale || 1);
        else { c.RENDER_SCALE = t.renderScale || 1; }

        if (window.QualityGovernor && window.QualityGovernor.pinResolution) {
            window.QualityGovernor.pinResolution();
        }
        window.needsFramebufferReinit = true;

        return { applied: true, tier: t.label, estimate: est, config: describe() };
    }

    function describe() {
        var c = cfg();
        return {
            dye: c.DYE_RESOLUTION, sim: c.SIM_RESOLUTION,
            dyeLive: window.dyeTexWidth + 'x' + window.dyeTexHeight,
            simLive: window.simTexWidth + 'x' + window.simTexHeight,
            iters: c.PRESSURE_ITERATIONS,
            mgShaped: (c.PRESSURE_ITERATIONS >= 24),
            mg: { cycles: c.MG_CYCLES, pre: c.MG_PRE, post: c.MG_POST, coarse: c.MG_COARSE },
            oversample: c.SIM_OVERSAMPLE || 1,
            // What the sim ACTUALLY ran last frame: the low-refresh substep
            // gate multiplies with the oversample knob (05j), so on a 30Hz
            // panel "oversample 4" is 12 steps and costs like it.
            substepsEffective: window.__lastSubSteps || 1,
            substepGate: !!c.SIM_SUBSTEP,
            renderScale: c.RENDER_SCALE || 1,
            buffer: (function () { var el = document.getElementById('canvas');
                                   return el ? el.width + 'x' + el.height : null; })(),
            glow: c.GLOW_RESOLUTION, scatter: c.SCATTER_RESOLUTION,
            shadeForm: c.SHADE_FORM_RESOLUTION,
            vramMB: window.__fboAlloc ? window.__fboAlloc().mb : null,
            governor: window.QualityGovernor ? window.QualityGovernor.getState() : null
        };
    }

    window.PerfTiers = {
        TIERS: TIERS,
        order: function () { return ORDER.slice(); },
        get: function (n) { return TIERS[n] || null; },
        apply: apply,
        estimateVRAM: estimateVRAM,
        describe: describe,
        reset: function () { return apply('stock', { governor: 'keep' }); },
        // Human-readable ladder for the console.
        list: function () {
            return ORDER.map(function (k) {
                var t = TIERS[k], e = estimateVRAM(t);
                return { key: k, label: t.label, dye: t.dye, sim: t.sim,
                         oversample: t.oversample, renderScale: t.renderScale,
                         iters: t.iters, estMB: e && e.mb };
            });
        }
    };
})();
