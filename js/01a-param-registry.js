// ═══════════════════════════════════════════════════════════════════
// js/01a-param-registry.js — single source of truth for UI parameters
// LOAD ORDER: after 01-config.js, before everything that reads params
// PROVIDES: window.ParamRegistry
// CONSUMERS: 12-save-load.js (clamping on preset apply), 04-ui-interactions.js
//   (clampConfigObject in applyPreset), 05-fluid-sim.js (toSliderConfig),
//   25-mutation-engine.js (toMutationSchemas)
//
// Data is keyed by DOM control id (the universal join key across
// index.html attrs, 05's sliderConfig, 12's SLIDER_IDS and the mutation
// schema). `ui` mirrors index.html input attrs; `hard` is the clamp range
// and is deliberately wider wherever a built-in preset (04) or the
// mutation schema (25) goes outside the ui range, so clamping never
// changes how existing presets look. Entries with ui:null are controls
// created dynamically by JS — their bounds are hydrated from the DOM on
// first use.
//
// Regenerate the data maps with the audit script (see git history of
// tmp-gen-registry.js) if sliders are added or ranges change; or set
// localStorage.debugParams = '1' to have verifyDom() report drift.
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    // Dynamically-created controls (no static markup; hydrated from DOM at runtime):
    // ["audioSensitivity","audioBeatThreshold","brushRefreshRate","audioReactToggle","arMapAutoSplat","arMapSize","arMapKaleido","arMapColor","focusModeToggle","streamFormatLock","audioReactSource","audioAutoSplatMode","splatInMode","splatOutMode"]
    var SLIDERS = {
        densityDissipation: {configKey: "DENSITY_DISSIPATION", ui: {min: 0.85, max: 1.005, step: 0.0001}, hard: {min: 0.85, max: 1.005}, def: 0.993, decimals: 4, category: "simulation", perfTier: 0, simSlider: true, mut: {min: 0.85, max: 1.005, step: 0.0001, scope: "basic"}},
        velocityDissipation: {configKey: "VELOCITY_DISSIPATION", ui: {min: 0.9, max: 1.0009, step: 0.0001}, hard: {min: 0.9, max: 1.0009}, def: 0.999, decimals: 4, category: "simulation", perfTier: 0, simSlider: true, mut: {min: 0.9, max: 1.0009, step: 0.0001, scope: "basic"}},
        pressureDissipation: {configKey: "PRESSURE_DISSIPATION", ui: {min: 0.9, max: 1.0333, step: 0.001}, hard: {min: 0.75, max: 1.0333}, def: 0.944, decimals: 3, category: "simulation", perfTier: 0, simSlider: true, mut: {min: 0.9, max: 1.0333, step: 0.001, scope: "basic"}},
        pressureIteration: {configKey: "PRESSURE_ITERATIONS", ui: {min: 1, max: 50, step: 1}, hard: {min: 1, max: 50}, def: 32, decimals: 0, category: "simulation", perfTier: 3, simSlider: true, mut: {min: 1, max: 50, step: 1, scope: "basic"}},
        velocityInfluence: {configKey: "VELOCITY_INFLUENCE", ui: {min: 1, max: 5, step: 0.001}, hard: {min: 1, max: 5}, def: 2.5, decimals: 3, category: "simulation", perfTier: 0, simSlider: true, mut: {min: 1, max: 5, step: 0.001, scope: "extended"}},
        curl: {configKey: "CURL", ui: {min: 0, max: 60, step: 1}, hard: {min: 0, max: 60}, def: 25, decimals: 0, category: "simulation", perfTier: 0, simSlider: true, mut: {min: 0, max: 60, step: 1, scope: "basic"}},
        sharpness: {configKey: "SHARPNESS", ui: {min: 0, max: 2, step: 0.1}, hard: {min: 0, max: 2}, def: 0.8, decimals: 1, category: "simulation", perfTier: 1, simSlider: true, mut: {min: 0, max: 2, step: 0.1, scope: "basic"}},
        brushSize: {configKey: null, ui: {min: 0.1, max: 30, step: 0.1}, hard: {min: 0.1, max: 30}, def: 11, decimals: 1, category: "brush", perfTier: 0, simSlider: false, mut: {min: 0.1, max: 30, step: 0.1, scope: "extended"}},
        multiplier: {configKey: null, ui: {min: 1, max: 8, step: 1}, hard: {min: 1, max: 8}, def: 1, decimals: 0, category: "brush", perfTier: 2, simSlider: false, mut: {min: 1, max: 8, step: 1, scope: "basic"}},
        timeScale: {configKey: null, ui: {min: 0.01, max: 3, step: 0.01}, hard: {min: 0.01, max: 3}, def: 1, decimals: 2, category: "simulation", perfTier: 0, simSlider: false, mut: {min: 0.01, max: 3, step: 0.01, scope: "extended"}},
        canvasOpacity: {configKey: null, ui: {min: 0, max: 100, step: 1}, hard: {min: 0, max: 100}, def: 100, decimals: 0, category: "display", perfTier: 0, simSlider: false, mut: {min: 0, max: 100, step: 1, scope: "extended"}},
        captureDimming: {configKey: null, ui: {min: 0, max: 100, step: 1}, hard: {min: 0, max: 100}, def: 80, decimals: 0, category: "display", perfTier: 0, simSlider: false, mut: {min: 0, max: 100, step: 1, scope: "extended"}},
        kSpinSpeed: {configKey: null, ui: {min: -180, max: 180, step: 1}, hard: {min: -180, max: 180}, def: 30, decimals: 0, category: "kaleidoscope", perfTier: 0, simSlider: false, mut: {min: -180, max: 180, step: 1, scope: "basic"}},
        kTwist: {configKey: null, ui: {min: 0, max: 10, step: 0.1}, hard: {min: 0, max: 10}, def: 0, decimals: 1, category: "kaleidoscope", perfTier: 0, simSlider: false, mut: {min: 0, max: 10, step: 0.1, scope: "basic"}},
        kZoom: {configKey: null, ui: {min: 0.5, max: 2, step: 0.01}, hard: {min: 0.5, max: 2}, def: 1, decimals: 2, category: "kaleidoscope", perfTier: 0, simSlider: false, mut: {min: 0.5, max: 2, step: 0.01, scope: "basic"}},
        kBlend: {configKey: null, ui: {min: 0, max: 1, step: 0.01}, hard: {min: 0, max: 1}, def: 1, decimals: 2, category: "kaleidoscope", perfTier: 0, simSlider: false, mut: {min: 0, max: 1, step: 0.01, scope: "basic"}},
        kAngle: {configKey: null, ui: {min: -180, max: 180, step: 1}, hard: {min: -180, max: 180}, def: 0, decimals: 0, category: "kaleidoscope", perfTier: 0, simSlider: false, mut: {min: -180, max: 180, step: 1, scope: "basic"}},
        kaleidoSegments: {configKey: null, ui: {min: 1, max: 24, step: 1}, hard: {min: 1, max: 24}, def: 12, decimals: 0, category: "kaleidoscope", perfTier: 0, simSlider: false, mut: {min: 1, max: 24, step: 1, scope: "basic"}},
        lightSpeed: {configKey: null, ui: {min: 0.1, max: 2, step: 0.1}, hard: {min: 0.1, max: 2}, def: 0.5, decimals: 1, category: "light", perfTier: 0, simSlider: false, mut: {min: 0.1, max: 2, step: 0.1, scope: "extended"}},
        lightIntensity: {configKey: null, ui: {min: 0, max: 1, step: 0.01}, hard: {min: 0, max: 1}, def: 0.5, decimals: 2, category: "light", perfTier: 0, simSlider: false, mut: {min: 0, max: 1, step: 0.01, scope: "extended"}},
        lightAmbient: {configKey: null, ui: {min: 0, max: 1, step: 0.01}, hard: {min: 0, max: 1}, def: 0.3, decimals: 2, category: "light", perfTier: 0, simSlider: false, mut: {min: 0, max: 1, step: 0.01, scope: "extended"}},
        lightShiftSpeed: {configKey: null, ui: {min: 0.1, max: 2, step: 0.1}, hard: {min: 0.05, max: 2}, def: 0.5, decimals: 1, category: "lightShift", perfTier: 0, simSlider: false, mut: {min: 0.05, max: 0.5, step: 0.05, scope: "extended"}},
        lightShiftThreshold: {configKey: null, ui: {min: 0.5, max: 1, step: 0.01}, hard: {min: 0.5, max: 1}, def: 0.85, decimals: 2, category: "lightShift", perfTier: 0, simSlider: false, mut: {min: 0.5, max: 1, step: 0.01, scope: "extended"}},
        lightShiftIntensity: {configKey: null, ui: {min: 0, max: 1, step: 0.01}, hard: {min: 0, max: 1}, def: 0.5, decimals: 2, category: "lightShift", perfTier: 0, simSlider: false, mut: {min: 0, max: 1, step: 0.01, scope: "extended"}},
        lightShiftSaturation: {configKey: null, ui: {min: 0, max: 1, step: 0.01}, hard: {min: 0, max: 1}, def: 1, decimals: 2, category: "lightShift", perfTier: 0, simSlider: false, mut: {min: 0, max: 1, step: 0.01, scope: "extended"}},
        clarity: {configKey: "CLARITY", ui: {min: 0, max: 1, step: 0.05}, hard: {min: 0, max: 1}, def: 0, decimals: 2, category: "microDetail", perfTier: 1, simSlider: true, mut: {min: 0, max: 1, step: 0.05, scope: "extended"}},
        vibrance: {configKey: "VIBRANCE", ui: {min: 0, max: 1, step: 0.05}, hard: {min: 0, max: 1}, def: 0, decimals: 2, category: "microDetail", perfTier: 1, simSlider: true, mut: {min: 0, max: 1, step: 0.05, scope: "extended"}},
        sunraysWeight: {configKey: null, ui: {min: 0, max: 1, step: 0.05}, hard: {min: 0, max: 3}, def: 0.5, decimals: 2, category: "sunrays", perfTier: 1, simSlider: false, mut: {min: 0.1, max: 3, step: 0.1, scope: "extended"}},
        ssFrequency: {configKey: null, ui: {min: 0.2, max: 8, step: 0.1}, hard: {min: 0.2, max: 8}, def: 2, decimals: 1, category: "shootingStar", perfTier: 0, simSlider: false, mut: {min: 0.2, max: 8, step: 0.1, scope: "extended"}},
        ssAngle: {configKey: null, ui: {min: 0, max: 360, step: 1}, hard: {min: 0, max: 360}, def: 120, decimals: 0, category: "shootingStar", perfTier: 0, simSlider: false, mut: {min: 0, max: 360, step: 1, scope: "extended"}},
        ssLength: {configKey: null, ui: {min: 0.1, max: 3, step: 0.05}, hard: {min: 0.1, max: 3}, def: 0.4, decimals: 2, category: "shootingStar", perfTier: 0, simSlider: false, mut: {min: 0.1, max: 3, step: 0.05, scope: "extended"}},
        ssSize: {configKey: null, ui: {min: 0.1, max: 2, step: 0.05}, hard: {min: 0.1, max: 2}, def: 0.5, decimals: 2, category: "shootingStar", perfTier: 0, simSlider: false, mut: {min: 0.1, max: 2, step: 0.05, scope: "extended"}},
        ssVariance: {configKey: null, ui: {min: 0, max: 60, step: 1}, hard: {min: 0, max: 60}, def: 15, decimals: 0, category: "shootingStar", perfTier: 0, simSlider: false, mut: {min: 0, max: 60, step: 1, scope: "extended"}},
        ssGravity: {configKey: null, ui: {min: 0, max: 1, step: 0.01}, hard: {min: 0, max: 1}, def: 0.1, decimals: 2, category: "shootingStar", perfTier: 0, simSlider: false, mut: {min: 0, max: 1, step: 0.01, scope: "extended"}},
        audioSensitivity: {configKey: null, ui: null, hard: {min: 0.1, max: 3}, def: null, decimals: 1, category: "audio", perfTier: 0, simSlider: false, mut: {min: 0.1, max: 3, step: 0.1, scope: "extended"}},
        audioBeatThreshold: {configKey: null, ui: null, hard: {min: 0.1, max: 1}, def: null, decimals: 2, category: "audio", perfTier: 0, simSlider: false, mut: {min: 0.1, max: 1, step: 0.05, scope: "extended"}},
        brushRefreshRate: {configKey: null, ui: null, hard: {min: 0, max: 100}, def: null, decimals: 0, category: "brush", perfTier: 0, simSlider: false, mut: {min: 0, max: 100, step: 1, scope: "extended"}},
        shadingIntensity: {configKey: null, ui: {min: 0, max: 2, step: 0.1}, hard: {min: 0, max: 2}, def: 0.8, decimals: 1, category: "display", perfTier: 1, simSlider: false, mut: {min: 0, max: 2, step: 0.1, scope: "extended"}}
    };
    var CHECKBOXES = {
        cursorToggle: {def: true, mutScope: null},
        showCanvasHandles: {def: true, mutScope: null},
        lockCanvasBorders: {def: false, mutScope: null},
        // Display plumbing, not an aesthetic param: never mutate. A mutation
        // flipping this off makes splats erase the canvas alpha ("layer
        // fades out on click"), which reads as a bug, not a style variant.
        preserveFluidOpacity: {def: true, mutScope: null},
        statsToggle: {def: false, mutScope: null},
        transparentMode: {def: false, mutScope: null},
        randomColor: {def: true, mutScope: "basic"},
        stepPalette: {def: false, mutScope: "basic"},
        kaleidoToggle: {def: false, mutScope: "basic"},
        kAnimateRot: {def: false, mutScope: "basic"},
        enableLighting: {def: false, mutScope: "extended"},
        enableLightShift: {def: false, mutScope: "extended"},
        microDetailToggle: {def: false, mutScope: "extended"},
        sunraysToggle: {def: false, mutScope: "extended"},
        turbulenceMode: {def: false, mutScope: "basic"},
        ascendToggle: {def: false, mutScope: "extended"},
        ascendRandomness: {def: false, mutScope: "extended"},
        shootingStarToggle: {def: false, mutScope: "extended"},
        hoverCaptureToggle: {def: false, mutScope: null},
        detachCaptureToggle: {def: false, mutScope: null},
        audioReactToggle: {def: null, mutScope: null},
        arMapAutoSplat: {def: null, mutScope: null},
        arMapSize: {def: null, mutScope: null},
        arMapKaleido: {def: null, mutScope: null},
        arMapColor: {def: null, mutScope: null},
        focusModeToggle: {def: null, mutScope: null},
        streamFormatLock: {def: null, mutScope: null},
        autoloadSettings: {def: false, mutScope: null},
        displayShadingToggle: {def: false, mutScope: "extended"}
    };
    var SELECTS = {
        visualResolution: {options: ["4096", "2048", "1024", "512", "256"], def: "4096", mut: null},
        physicsResolution: {options: ["1024", "512", "384", "256", "128", "64"], def: "1024", mut: null},
        kaleidoMode: {options: ["1", "2", "3", "4", "5", "0"], def: "1", mut: {options: ["0", "1", "2", "3", "4", "5"], scope: "basic"}},
        fpsCap: {options: ["30", "60", "120", "144", "165", "240", "native", "0"], def: "30", mut: null},
        lightMode: {options: ["manual", "random"], def: "manual", mut: {options: null, scope: "extended"}},
        lightShiftMode: {options: ["replace", "tint", "overlay", "multiply", "screen", "add"], def: "replace", mut: {options: null, scope: "extended"}},
        recMode: {options: ["off", "min", "full"], def: "off", mut: null},
        recPlaybackSpeed: {options: ["0.25", "0.5", "1", "2", "4"], def: "0.25", mut: null},
        audioReactSource: {options: null, def: null, mut: null},
        audioAutoSplatMode: {options: null, def: null, mut: null},
        splatInMode: {options: null, def: null, mut: null},
        splatOutMode: {options: null, def: null, mut: null}
    };

    // Config-space hard bounds for clampConfigObject (built-in presets write
    // these keys directly). Slider-space == config-space for sliderConfig
    // keys; SPLAT_RADIUS is brushSize/1000.
    var CONFIG_BOUNDS = {};
    Object.keys(SLIDERS).forEach(function (id) {
        var s = SLIDERS[id];
        if (s.configKey && s.hard) CONFIG_BOUNDS[s.configKey] = { min: s.hard.min, max: s.hard.max };
    });
    CONFIG_BOUNDS.SPLAT_RADIUS = { min: SLIDERS.brushSize.hard.min / 1000, max: SLIDERS.brushSize.hard.max / 1000 };
    CONFIG_BOUNDS.DYE_RESOLUTION = { min: 64, max: 4096 };
    CONFIG_BOUNDS.SIM_RESOLUTION = { min: 32, max: 2048 };
    CONFIG_BOUNDS.TEXTURE_DOWNSAMPLE = { min: 0, max: 4 };

    function _round(v, step) {
        if (!step) return v;
        var r = Math.round(v / step) * step;
        // Avoid float dust (0.30000000000000004)
        var d = String(step).split('.')[1];
        return d ? Number(r.toFixed(d.length)) : r;
    }

    // Hydrate ui/hard/def for dynamically-created controls from the live DOM
    function _hydrate(id, entry) {
        if (entry.ui) return entry;
        var el = document.getElementById(id);
        if (!el || el.min === undefined || el.min === '') return entry;
        var min = Number(el.min), max = Number(el.max);
        var step = el.step === 'any' || el.step === '' ? 0 : Number(el.step);
        if (!isFinite(min) || !isFinite(max)) return entry;
        entry.ui = { min: min, max: max, step: step };
        entry.hard = {
            min: Math.min(min, entry.hard ? entry.hard.min : min),
            max: Math.max(max, entry.hard ? entry.hard.max : max)
        };
        if (entry.def === null && el.defaultValue !== '') entry.def = Number(el.defaultValue);
        return entry;
    }

    function clampSlider(id, value) {
        var entry = SLIDERS[id];
        if (!entry) return null; // unknown id — caller should warn + skip
        _hydrate(id, entry);
        var v = Number(value);
        if (!isFinite(v)) {
            if (entry.def !== null && entry.def !== undefined) return entry.def;
            return null;
        }
        if (entry.hard) v = Math.max(entry.hard.min, Math.min(entry.hard.max, v));
        if (entry.ui && entry.ui.step) v = _round(v, entry.ui.step);
        if (entry.hard) v = Math.max(entry.hard.min, Math.min(entry.hard.max, v));
        return v;
    }

    function coerceCheckbox(id, value) {
        if (!CHECKBOXES.hasOwnProperty(id)) return null;
        return !!value;
    }

    function coerceSelect(id, value) {
        var entry = SELECTS[id];
        if (!entry) return null;
        var v = String(value);
        if (entry.options === null) {
            // Dynamic select — validate against live DOM if present
            var el = document.getElementById(id);
            if (el && el.tagName === 'SELECT') {
                var ok = Array.prototype.some.call(el.options, function (o) { return o.value === v; });
                return ok ? v : (entry.def !== null ? entry.def : null);
            }
            return v;
        }
        if (entry.options.indexOf(v) !== -1) return v;
        return entry.def !== null ? entry.def : null;
    }

    // For 04's applyPreset: clamp known config keys, drop unknown ones.
    function clampConfigObject(obj) {
        var out = {};
        Object.keys(obj || {}).forEach(function (key) {
            var v = obj[key];
            var b = CONFIG_BOUNDS[key];
            if (b) {
                var n = Number(v);
                if (!isFinite(n)) { console.warn('[ParamRegistry] dropping non-numeric config value', key, v); return; }
                out[key] = Math.max(b.min, Math.min(b.max, n));
                if (out[key] !== n) console.warn('[ParamRegistry] clamped config.' + key, n, '→', out[key]);
            } else {
                console.warn('[ParamRegistry] dropping unknown config key from preset:', key);
            }
        });
        return out;
    }

    // Exact shape 05-fluid-sim.js expects for its sliderConfig
    function toSliderConfig() {
        var out = {};
        Object.keys(SLIDERS).forEach(function (id) {
            var s = SLIDERS[id];
            if (s.simSlider && s.configKey) out[id] = { key: s.configKey, decimals: s.decimals };
        });
        return out;
    }

    // Exact shapes 25-mutation-engine.js expects
    function toMutationSchemas() {
        var sliders = [];
        Object.keys(SLIDERS).forEach(function (id) {
            var m = SLIDERS[id].mut;
            if (m) sliders.push({ id: id, min: m.min, max: m.max, step: m.step, scope: m.scope });
        });
        var checkboxes = [];
        Object.keys(CHECKBOXES).forEach(function (id) {
            var sc = CHECKBOXES[id].mutScope;
            if (sc) checkboxes.push({ id: id, scope: sc });
        });
        var selects = [];
        Object.keys(SELECTS).forEach(function (id) {
            var m = SELECTS[id].mut;
            if (m) selects.push({ id: id, options: m.options, scope: m.scope });
        });
        return { sliders: sliders, checkboxes: checkboxes, selects: selects };
    }

    // Dev check: report drift between registry and live DOM attributes.
    // Enable with localStorage.debugParams = '1'.
    function verifyDom() {
        var issues = [];
        Object.keys(SLIDERS).forEach(function (id) {
            var s = SLIDERS[id];
            var el = document.getElementById(id);
            if (!el) { if (s.ui) issues.push(id + ': in registry with static ui but missing from DOM'); return; }
            if (!s.ui) return; // dynamic control, nothing static to compare
            if (Number(el.min) !== s.ui.min) issues.push(id + ': min DOM=' + el.min + ' registry=' + s.ui.min);
            if (Number(el.max) !== s.ui.max) issues.push(id + ': max DOM=' + el.max + ' registry=' + s.ui.max);
            var domStep = el.step === 'any' || el.step === '' ? 0 : Number(el.step);
            if (domStep !== s.ui.step) issues.push(id + ': step DOM=' + el.step + ' registry=' + s.ui.step);
        });
        if (issues.length) {
            console.warn('[ParamRegistry] DOM drift detected (' + issues.length + '):');
            issues.forEach(function (i) { console.warn('  ' + i); });
        } else {
            console.log('[ParamRegistry] verifyDom: no drift');
        }
        return issues;
    }

    window.ParamRegistry = {
        SLIDERS: SLIDERS,
        CHECKBOXES: CHECKBOXES,
        SELECTS: SELECTS,
        CONFIG_BOUNDS: CONFIG_BOUNDS,
        clampSlider: clampSlider,
        coerceCheckbox: coerceCheckbox,
        coerceSelect: coerceSelect,
        clampConfigObject: clampConfigObject,
        toSliderConfig: toSliderConfig,
        toMutationSchemas: toMutationSchemas,
        verifyDom: verifyDom
    };

    try {
        if (localStorage.getItem('debugParams') === '1') {
            // DOM may not be parsed yet when this script runs
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function () { verifyDom(); });
            } else {
                verifyDom();
            }
        }
    } catch (_) {}
})();
