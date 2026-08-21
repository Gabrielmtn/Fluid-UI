// ═══════════════════════════════════════════════════════════════════
// scripts/test/stage.js — window.__stage(), the canonical pinned stage.
//
// PAGE code. Install AFTER scripts/test/harness.js.
//
// One definition of "the app, in a known state" — shared by the test
// suite and by the store-photo bakers, because the two need exactly the
// same thing and drifting copies is how a baker silently starts baking
// from last session's autoloaded settings (measured: an About bake round
// began from thick-paint physics a previous round had leaked).
//
// Every pin below was established by measurement, not assumption; the
// determinism story is in GUIDANCE.md §4. Call it INSIDE a freeze:
//
//   await __test.freeze();
//   await __stage({ dye: '2048', sim: '512', box: [1920, 1080] });
//
// Options (all optional):
//   dye, sim   resolution select values — '1024'/'256' for fast tests,
//              '2048'/'512' for photography
//   box        [w, h] canvas-wrapper size in CSS px
//   seed       Math.random seed (default 0xBEEF)
//   keepLayers leave layers/colliders alone (a shot that STAGES layers
//              must not have them stripped out from under it)
//
// NOTE: run-regression.js still carries its own inline copy of this
// while the cross-boot determinism residuals are open — migrating it
// mid-hunt would churn goldens. Fold it in once those close.
//
// electron-builder drops scripts/, so nothing here ships.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    window.__stage = function (opts) {
        opts = opts || {};
        var T = window.__test;
        if (!T) return Promise.reject(new Error('install harness.js first'));

        // Registry defaults FIRST: the app autosaves settings, so a fresh
        // boot autoloads the PREVIOUS session's state.
        if (window.ParamRegistry && window.applyPresetSnapshot) {
            window.applyPresetSnapshot(window.ParamRegistry.defaults());
        }
        if (window.QualityGovernor && window.QualityGovernor.setEnabled) {
            window.QualityGovernor.setEnabled(false);
        }

        // Brush colour picker is not registry-covered.
        var cp = document.getElementById('colorPicker');
        if (cp) { cp.value = '#4090c0'; cp.dispatchEvent(new Event('input', { bubbles: true })); }

        // Canvas BOX: texture dims are aspect-scaled off the resolution
        // budget, so a window-size delta silently changes every buffer.
        var box = opts.box || [1280, 720];
        var wrap = document.getElementById('canvas-wrapper');
        if (wrap) {
            wrap.style.width = box[0] + 'px';
            wrap.style.height = box[1] + 'px';
            if (window.initializeCanvasPosition) window.initializeCanvasPosition();
            if (window.updateCanvasSize) window.updateCanvasSize();
        }

        T.setSelect('visualResolution', opts.dye || '1024');
        T.setSelect('physicsResolution', opts.sim || '256');

        // Uncapped: the cap gate carries the REAL clock's sub-frame phase
        // into the freeze, so the first pumped frame randomly passes or
        // skips it.
        T.setSelect('fpsCap', '0');
        window.fpsCap = 0;
        // Sub-stepping off: the first frozen frame's wallDt is phase-random
        // and crossing 20ms changes the sub-step COUNT.
        config.SIM_SUBSTEP = false;
        window.timeScale = 1;

        T.setCheckbox('colorGate', false);
        T.setCheckbox('randomColor', false);
        if (window.lightShift) window.lightShift.enabled = false;
        if (window.MaterialModes) window.MaterialModes.setMode('fluid');

        if (!opts.keepLayers) {
            // By each layer's OWN index — deleteLayer matches l.index, not
            // array position.
            if (window.layers && window.deleteLayer) {
                window.layers.map(function (l) { return l.index; })
                    .forEach(function (id) { try { window.deleteLayer(id); } catch (_) {} });
            }
            if (window.collisionLayers) {
                if (window.collisionLayers.setProcedural) window.collisionLayers.setProcedural(null);
                window.collisionLayers.enabled = false;
            }
            if (typeof window.clearObstacleTexture === 'function') window.clearObstacleTexture();
        }

        // Unregistered persisted state, measured drifting across boots.
        // Custom brush stamps persist in settings storage (brush.shapeId)
        // and an active stamp OVERRIDES every built-in tip, Ring included
        // (05i:126-135, 173) — measured: a stamp left active in a saved
        // session made brush tips 0 and 4 paint bit-identical dabs, which
        // would have silently baked five identical bands into a photo
        // whose entire subject is that the tips differ.
        // Cleared through CONFIG ONLY. BrushShapes.setActive(null) also
        // writes settingsManager 'brush.shapeId' (33:141) — i.e. it
        // DESTROYS the user's saved stamp selection, permanently, every
        // time the stage runs. It did exactly that during this session's
        // bakes before the difference was noticed. activeId() reads
        // config alone (33:52-55), so writing the config key disables the
        // stamp branch (05i:124-129) and the stampPending() dab-hold
        // (05g:255) while leaving the user's settings untouched.
        //
        // RULE for this whole file: a test/bake stage may write config
        // and window state freely, but must NEVER call an app setter
        // that persists. Check for a settingsManager/localStorage write
        // before using one.
        // ...but config-only is STILL not the whole story: 33:295-305
        // reconciles by reading config and calling setActive(), which
        // persists. So any later list change (an import, a remove) writes
        // our null straight into the user's settings. Stash the real value
        // ONCE per page and restore it through __stageRestore() at the end
        // of a bake or suite run.
        if (window.__stageOrig === undefined) {
            window.__stageOrig = {};
            try { window.__stageOrig.shapeId = window.settingsManager.get('brush.shapeId'); } catch (_) { window.__stageOrig.shapeId = null; }
        }
        config.BRUSH_SHAPE_ID = null;
        config.BRUSH_TIP = 0;
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

        // Decay-debt accumulators (lexical in 05j) batch dt toward an fp16
        // flush threshold and carry pre-freeze debt across clear(). Their
        // only external reset hook is the loop's own guard: a dissipation
        // CHANGE zeroes the debt. Nudge, observe, restore, observe.
        T.setSlider('densityDissipation', 0.992);   // >= 0.88 — below wipes the sim
        T.setSlider('velocityDissipation', 0.998);
        return T.step(1).then(function () {
            T.setSlider('densityDissipation', 0.993);
            T.setSlider('velocityDissipation', 0.999);
            return T.step(1);
        }).then(function () {
            T.clear();
            T.seed(opts.seed == null ? 0xBEEF : opts.seed);
            return T.step(4);
        }).then(function () {
            return {
                staged: true,
                canvas: canvas.width + 'x' + canvas.height,
                dye: window.dyeTexWidth + 'x' + window.dyeTexHeight,
                sim: window.simTexWidth + 'x' + window.simTexHeight,
            };
        });
    };

    // Put back every PERSISTED user setting the stage disturbed. Call it
    // once at the end of a bake or a suite run (the bakers do, in their
    // done() handler). Safe to call when nothing was stashed.
    window.__stageRestore = function () {
        var out = { restored: false };
        if (window.__stageOrig && window.BrushShapes && window.BrushShapes.setActive) {
            try {
                window.BrushShapes.setActive(window.__stageOrig.shapeId || null);
                out.shapeId = window.BrushShapes.activeId();
                out.restored = true;
            } catch (e) { out.error = String(e); }
        }
        return out;
    };

    return { installed: true };
})()
