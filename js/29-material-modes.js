// ═══════════════════════════════════════════════════════════════════
// js/29-material-modes.js — material selector on the Curl slider
// LOAD ORDER: last in the async chain (after 06-multiplayer.js);
//   needs config (04a), the #curl slider bindings (05h) and DOM.
// PROVIDES: window.MaterialModes { active, onSlider, displayValue, setMode,
//   yieldToExternal }
//
// The Curl label is a <select id="materialMode">; the slider's role follows:
//   Fluid           → Vorticity (the classic curl control, untouched behavior)
//   Acrylic – Thin  → Flow: surface shading @0.8 + micro detail maxed; the
//             slider drives paint body (sharpness) and velocity damping.
//             (internal key 'acrylic')
//   Acrylic – Thick → Depth: inverse-chiaroscuro surface shading (shadeInvert)
//             so strokes read as carved relief; the slider drives depth + dab
//             size, and the value display becomes a clickable brush-shape
//             icon (blob / chisel / streak stamp shapes in the splat shader).
//             (internal key 'clay' — kept for saved-settings compatibility)
// 05h delegates the slider's input here while a material is active.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';
    var LS_MODE = 'fluidui.materialMode';
    var LS_AMOUNT = 'fluidui.materialAmount';
    var LS_SHAPE = 'fluidui.stampShape';
    // Every config key a material bundle may touch; snapshotted when leaving
    // 'fluid' mode so returning restores the user's hand-tuned values.
    var TOUCHED = ['CURL', 'VELOCITY_DISSIPATION', 'PRESSURE_ITERATIONS', 'PRESSURE_DISSIPATION',
                   'STAMP_NOISE', 'STAMP_RADIUS_SCALE', 'SHARPNESS', 'CLARITY', 'VIBRANCE'];
    var mode = 'fluid';
    var snapshot = null; // config values + effect-toggle UI state from fluid mode
    var sel = null, slider = null, span = null;

    var SHAPES = [
        { glyph: '⬤', name: 'Blob' },    // ⬤ noise-notched round dab
        { glyph: '■', name: 'Chisel' },  // ■ squared press
        { glyph: '▬', name: 'Streak' }   // ▬ elongated smear
    ];
    var shapeIdx = 0;

    function setCheckbox(id, on) {
        var el = document.getElementById(id);
        if (el && el.checked !== on) { el.checked = on; el.dispatchEvent(new Event('change')); }
    }
    function setUISlider(id, v) {
        var el = document.getElementById(id);
        if (el && el.value !== String(v)) { el.value = String(v); el.dispatchEvent(new Event('input')); }
    }

    // t = macro amount 0..1 (slider reuses its native 0..60 range)
    var MATERIALS = {
        acrylic: {
            macro: 'Flow', def: 30,
            apply: function (t) {
                // Paint look: relief shading + maxed micro detail
                setCheckbox('displayShadingToggle', true);
                setUISlider('shadingIntensity', 0.8);
                setCheckbox('microDetailToggle', true);
                setUISlider('clarity', 1);
                setUISlider('vibrance', 1);
                window.displayShadingInvert = 0;
                // Flow: low = stiff paint (crisp, heavy damping), high = runny
                setUISlider('sharpness', (1.8 - 1.4 * t).toFixed(1)); // the "Viscosity" slider
                config.VELOCITY_DISSIPATION = 0.97 + t * 0.029;
                config.CURL = 0; // any vorticity confinement chews the smooth paint edges
                config.PRESSURE_ITERATIONS = 26;
                config.PRESSURE_DISSIPATION = 0.94;
                config.STAMP_NOISE = 0;
                config.STAMP_RADIUS_SCALE = 1;
            }
        },
        clay: {
            macro: 'Flow', def: 30,
            apply: function (t) {
                // Carved relief look is FIXED for this material: surface shading
                // with inverted normals (chiaroscuro — strokes read as dents).
                // The slider is a body control like Thin's Flow, NOT a lighting
                // knob: it drives viscosity (sharpness) + velocity damping in a
                // much heavier register (~0.90, where motion dies in under a
                // second — thick paint barely travels).
                setCheckbox('displayShadingToggle', true);
                setUISlider('shadingIntensity', 1.2);
                setCheckbox('microDetailToggle', false);
                window.displayShadingInvert = 1;
                setUISlider('sharpness', (2.0 - 1.2 * t).toFixed(1)); // the "Viscosity" slider
                config.VELOCITY_DISSIPATION = 0.90 + t * 0.03;        // 0.90 → 0.93
                config.CURL = 0;
                config.PRESSURE_ITERATIONS = 6;
                config.PRESSURE_DISSIPATION = 0.93;
                config.STAMP_NOISE = 0.7;            // textured dab edges: part of the material, not the slider
                config.STAMP_RADIUS_SCALE = 1.3;
                config.STAMP_SHAPE = shapeIdx;
            }
        }
    };

    function amount() {
        var max = parseFloat(slider.max) || 60;
        return Math.max(0, Math.min(1, parseFloat(slider.value) / max));
    }

    // Reflect material-driven values in the standalone sliders WITHOUT
    // dispatching 'input': clay's VELOCITY_DISSIPATION sits below that
    // slider's min, and a dispatch would clamp it and write the clamped
    // value straight back into config.
    function syncSideSliders() {
        [['velocityDissipation', 'velocityValue', config.VELOCITY_DISSIPATION, 4],
         ['pressureIteration', 'iterationValue', config.PRESSURE_ITERATIONS, 0],
         ['pressureDissipation', 'pressureValue', config.PRESSURE_DISSIPATION, 3]
        ].forEach(function (row) {
            var s = document.getElementById(row[0]);
            var v = document.getElementById(row[1]);
            if (s) { s.value = row[2]; s.style.setProperty('--val', s.value); }
            if (v) v.textContent = row[3] === 0 ? String(Math.round(row[2])) : Number(row[2]).toFixed(row[3]);
        });
    }

    function displayValue() {
        if (mode === 'clay') return SHAPES[shapeIdx].glyph;
        if (mode === 'fluid') return String(Math.round(parseFloat(slider.value) || 0));
        return Math.round(amount() * 100) + '%';
    }

    function refreshSpan() {
        if (!span) return;
        span.textContent = displayValue();
        if (mode === 'clay') {
            span.style.cursor = 'pointer';
            span.title = 'Brush shape: ' + SHAPES[shapeIdx].name + ' (click to change)';
        } else {
            span.style.cursor = '';
            span.title = '';
        }
    }

    function applyMaterial() {
        var m = MATERIALS[mode];
        if (!m) return;
        m.apply(amount());
        syncSideSliders();
        refreshSpan();
        slider.title = m.macro;
        // The value display just changed width (e.g. "83%" → "100%") — keep the
        // select's collision clamp in sync while dragging.
        sizeSelectToLabel();
    }

    function takeSnapshot() {
        snapshot = { cfg: {}, ui: {} };
        TOUCHED.forEach(function (k) { snapshot.cfg[k] = config[k]; });
        ['displayShadingToggle', 'microDetailToggle'].forEach(function (id) {
            var el = document.getElementById(id);
            snapshot.ui[id] = el ? el.checked : false;
        });
        ['shadingIntensity', 'sharpness', 'clarity', 'vibrance'].forEach(function (id) {
            var el = document.getElementById(id);
            snapshot.ui[id] = el ? el.value : null;
        });
    }

    function restoreSnapshot() {
        window.displayShadingInvert = 0;
        config.STAMP_NOISE = 0;
        config.STAMP_RADIUS_SCALE = 1;
        if (!snapshot) return;
        // Sliders BEFORE checkboxes: the shadingIntensity input handler sets
        // window.displayShading unconditionally (05e), so the toggle's change
        // handler must run last to have the final say on on/off.
        ['shadingIntensity', 'sharpness', 'clarity', 'vibrance'].forEach(function (id) {
            if (snapshot.ui[id] != null) setUISlider(id, snapshot.ui[id]);
        });
        setCheckbox('displayShadingToggle', snapshot.ui.displayShadingToggle);
        setCheckbox('microDetailToggle', snapshot.ui.microDetailToggle);
        TOUCHED.forEach(function (k) {
            if (snapshot.cfg[k] !== undefined) config[k] = snapshot.cfg[k];
        });
        syncSideSliders();
    }

    // Size the select to the SELECTED option's text: a bare <select> sizes to
    // its widest option, which strands the dropdown arrow far right of short
    // labels like "Fluid". The arrow (8px, right-anchored) then always sits
    // 15px after the text — see the padding in 21-sidebar.css.
    var _measureCtx = null;
    function sizeSelectToLabel() {
        if (!sel) return;
        var opt = sel.options[sel.selectedIndex];
        if (!opt) return;
        if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d');
        var cs = getComputedStyle(sel);
        _measureCtx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        var text = cs.textTransform === 'uppercase' ? opt.textContent.toUpperCase() : opt.textContent;
        var w = _measureCtx.measureText(text).width;
        var ls = parseFloat(cs.letterSpacing);
        if (ls) w += ls * text.length;
        sel.style.width = Math.ceil(w + 23) + 'px'; // text + 15px gap + 8px arrow
        // Sharing a header row with the value display: if the ideal width would
        // collide, give back gap pixels rather than overlap the value.
        if (span) {
            var sr = sel.getBoundingClientRect();
            var vr = span.getBoundingClientRect();
            if (sr.width > 0 && vr.left > 0 && sr.right > vr.left - 4) {
                sel.style.width = Math.max(40, Math.floor(sr.width - (sr.right - (vr.left - 4)))) + 'px';
            }
        }
    }

    function setMode(next) {
        if (!slider || next === mode) return;
        if (mode === 'fluid' && next !== 'fluid') takeSnapshot();
        mode = next;
        if (sel && sel.value !== mode) sel.value = mode; // keep UI honest on programmatic calls
        if (mode === 'fluid') {
            restoreSnapshot();
            slider.value = String(config.CURL);
            slider.style.setProperty('--val', slider.value);
            slider.title = 'Vorticity';
            refreshSpan();
        } else {
            var saved = parseFloat(localStorage.getItem(LS_AMOUNT + '.' + mode));
            slider.value = String(isFinite(saved) ? saved : MATERIALS[mode].def);
            slider.style.setProperty('--val', slider.value);
            applyMaterial();
        }
        // Fit AFTER the value display updated: the collision clamp measures the
        // span's rect, and the span just changed width (e.g. "25" → "75%").
        sizeSelectToLabel();
        try { localStorage.setItem(LS_MODE, mode); } catch (e) { /* private mode */ }
    }

    // An external sim-state writer (preset apply, session
    // load) is about to write raw CURL and friends: material mode must yield,
    // NOT reinterpret those raw values as macro amounts — and must NOT restore
    // its snapshot over the state the writer is installing.
    function yieldToExternal() {
        if (mode === 'fluid') return;
        mode = 'fluid';
        snapshot = null;
        config.STAMP_NOISE = 0;
        config.STAMP_RADIUS_SCALE = 1;
        window.displayShadingInvert = 0;
        if (sel) {
            sel.value = 'fluid';
            // Announce the silent write so mirrors (the strip's segmented
            // switch) resync immediately instead of on their poll. A custom
            // event, NOT 'change' — 'change' would re-enter setMode.
            try { sel.dispatchEvent(new Event('mm-sync')); } catch (e) { /* noop */ }
        }
        if (slider) slider.title = 'Vorticity';
        refreshSpan();
        sizeSelectToLabel();
        try { localStorage.setItem(LS_MODE, 'fluid'); } catch (e) { /* noop */ }
    }

    window.MaterialModes = {
        active: function () { return mode !== 'fluid'; },
        // 05h's curl binding delegates here while a material is active
        onSlider: function () {
            applyMaterial();
            try { localStorage.setItem(LS_AMOUNT + '.' + mode, slider.value); } catch (e) { /* noop */ }
        },
        displayValue: displayValue,
        setMode: setMode,
        yieldToExternal: yieldToExternal,
        // Snapshot support (presets + the multiplayer look mirror). Material
        // used to be invisible to snapshots — its core effects live in config
        // keys with no captured control (STAMP_NOISE/RADIUS_SCALE/SHAPE,
        // displayShadingInvert), so a peer or a restored preset stayed on
        // plain fluid while the painter was in Paint-Thick. State travels as
        // {mode, amount, shape} and re-enters through the same setMode path a
        // user click takes.
        getState: function () {
            return {
                mode: mode,
                amount: (mode !== 'fluid' && slider) ? parseFloat(slider.value) : null,
                shape: shapeIdx
            };
        },
        applyState: function (st) {
            if (!slider || !sel) return;
            var next = (st && typeof st.mode === 'string') ? st.mode : 'fluid';
            if (next !== 'fluid' && !MATERIALS[next]) return;
            if (st && typeof st.shape === 'number' && st.shape >= 0 && st.shape < SHAPES.length) {
                shapeIdx = Math.floor(st.shape);
                try { localStorage.setItem(LS_SHAPE, String(shapeIdx)); } catch (e) { /* noop */ }
            }
            if (next === 'fluid') { yieldToExternal(); return; }
            // Entering from fluid snapshots the (just-applied) raw baseline, so
            // leaving the material later restores the snapshot's fluid state.
            setMode(next);
            if (st && typeof st.amount === 'number' && isFinite(st.amount)) {
                slider.value = String(st.amount);
                slider.style.setProperty('--val', slider.value);
                try { localStorage.setItem(LS_AMOUNT + '.' + mode, slider.value); } catch (e) { /* noop */ }
            }
            applyMaterial();
        },
        // Re-measure the select after a layout move (the mixer strip adopts it
        // into a label with a different font than the sidebar's)
        resizeLabel: sizeSelectToLabel
    };

    function init() {
        sel = document.getElementById('materialMode');
        slider = document.getElementById('curl');
        span = document.getElementById('curlValue');
        if (!sel || !slider) return;
        slider.title = 'Vorticity';
        var savedShape = parseInt(localStorage.getItem(LS_SHAPE), 10);
        if (savedShape >= 0 && savedShape < SHAPES.length) shapeIdx = savedShape;
        sel.addEventListener('change', function () { setMode(sel.value); });
        sizeSelectToLabel();
        // In clay mode the value display is the brush-shape picker
        if (span) span.addEventListener('click', function () {
            if (mode !== 'clay') return;
            shapeIdx = (shapeIdx + 1) % SHAPES.length;
            config.STAMP_SHAPE = shapeIdx;
            refreshSpan();
            try { localStorage.setItem(LS_SHAPE, String(shapeIdx)); } catch (e) { /* noop */ }
        });
        var saved = localStorage.getItem(LS_MODE);
        if (saved === 'curl' || saved === 'ooze') saved = 'fluid'; // migrate v1 names
        if (saved && saved !== 'fluid' && MATERIALS[saved]) {
            sel.value = saved;
            setMode(saved);
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
