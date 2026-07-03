/**
 * Mutation Engine — Fractal-style parameter exploration for Fluid UI.
 *
 * Takes the current preset snapshot, applies controlled random mutations,
 * and presents a grid of variants the user can select from.  The selected
 * variant becomes the new base for further mutations, forming a chain.
 *
 * Designed for future local-LLM integration: the mutate() function accepts
 * an optional external delta object so an LLM can drive mutations directly.
 */
(function () {
    'use strict';

    // ── Parameter Schema ────────────────────────────────────────────
    // Each entry: { id, type, min, max, step, scope }
    // scope: 'basic' = high visual impact, 'extended' = everything else
    //         Selecting "All" uses both; "Basic" uses only 'basic'.

    // Schemas are derived from the param registry (js/01a-param-registry.js),
    // the single source of truth for parameter bounds and mutation scopes.
    var _schemas = (window.ParamRegistry && window.ParamRegistry.toMutationSchemas)
        ? window.ParamRegistry.toMutationSchemas()
        : (console.warn('[Mutation] ParamRegistry missing — mutation disabled'),
           { sliders: [], checkboxes: [], selects: [] });
    var SLIDER_SCHEMA = _schemas.sliders;
    var CHECKBOX_SCHEMA = _schemas.checkboxes;
    var SELECT_SCHEMA = _schemas.selects;
    // Build lookup maps
    var _sliderMap = {};
    SLIDER_SCHEMA.forEach(function (s) { _sliderMap[s.id] = s; });
    var _checkboxSet = {};
    CHECKBOX_SCHEMA.forEach(function (c) { _checkboxSet[c.id] = c; });
    var _selectMap = {};
    SELECT_SCHEMA.forEach(function (s) { _selectMap[s.id] = s; });

    // ── Utilities ───────────────────────────────────────────────────

    // Gaussian random (Box-Muller)
    function gaussRandom() {
        var u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    // Clamp value to slider range, quantised to step
    function clampToSchema(schema, value) {
        var clamped = Math.max(schema.min, Math.min(schema.max, value));
        if (schema.step >= 1) return Math.round(clamped);
        var inv = 1 / schema.step;
        return Math.round(clamped * inv) / inv;
    }

    // Random hex colour with optional hue shift from a base
    function mutateColor(baseHex, strength) {
        var r, g, b;
        if (baseHex && baseHex.length >= 7) {
            r = parseInt(baseHex.substr(1, 2), 16);
            g = parseInt(baseHex.substr(3, 2), 16);
            b = parseInt(baseHex.substr(5, 2), 16);
        } else {
            r = 128; g = 128; b = 128;
        }
        // Convert to HSL, shift, convert back
        var hsl = rgbToHsl(r, g, b);
        hsl[0] = (hsl[0] + gaussRandom() * strength * 0.3 + 1) % 1;
        hsl[1] = Math.max(0, Math.min(1, hsl[1] + gaussRandom() * strength * 0.3));
        hsl[2] = Math.max(0.05, Math.min(0.95, hsl[2] + gaussRandom() * strength * 0.2));
        var rgb = hslToRgb(hsl[0], hsl[1], hsl[2]);
        return '#' + toHex(rgb[0]) + toHex(rgb[1]) + toHex(rgb[2]);
    }

    function toHex(n) { var h = Math.round(Math.max(0, Math.min(255, n))).toString(16); return h.length < 2 ? '0' + h : h; }

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var h, s, l = (max + min) / 2;
        if (max === min) { h = s = 0; }
        else {
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            else if (max === g) h = ((b - r) / d + 2) / 6;
            else h = ((r - g) / d + 4) / 6;
        }
        return [h, s, l];
    }

    function hslToRgb(h, s, l) {
        if (s === 0) { var v = l * 255; return [v, v, v]; }
        function hue2rgb(p, q, t) {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        return [hue2rgb(p, q, h + 1/3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1/3) * 255];
    }

    // ── Core Mutation Logic ─────────────────────────────────────────

    /**
     * Generate a mutated copy of a preset snapshot.
     *
     * @param {Object} base    - Snapshot from capturePresetSnapshot()
     * @param {Object} opts
     *   @param {number} opts.strength  - 0..1 (subtle → wild)
     *   @param {string} opts.scope     - 'basic' | 'all'
     *   @param {Object} [opts.locks]   - { sliderId: true } params to skip
     *   @param {Object} [opts.delta]   - External delta (for future LLM use)
     * @returns {Object} Mutated snapshot (deep copy, safe to apply)
     */
    function mutate(base, opts) {
        if (!base) return null;
        opts = opts || {};
        var strength = typeof opts.strength === 'number' ? opts.strength : 0.3;
        var scope    = opts.scope || 'basic';
        var locks    = opts.locks || {};
        var delta    = opts.delta || null;

        // Deep copy the base
        var out = JSON.parse(JSON.stringify(base));

        // ── Sliders ──
        if (out.sliders) {
            SLIDER_SCHEMA.forEach(function (schema) {
                if (locks[schema.id]) return;
                if (scope === 'basic' && schema.scope !== 'basic') return;
                if (out.sliders[schema.id] === undefined) return;

                if (delta && delta.sliders && delta.sliders[schema.id] !== undefined) {
                    out.sliders[schema.id] = clampToSchema(schema, delta.sliders[schema.id]);
                    return;
                }

                var range = schema.max - schema.min;
                var noise = gaussRandom() * strength * range * 0.3;
                out.sliders[schema.id] = clampToSchema(schema, out.sliders[schema.id] + noise);
            });
        }

        // ── Checkboxes ──
        if (out.checkboxes) {
            CHECKBOX_SCHEMA.forEach(function (schema) {
                if (locks[schema.id]) return;
                if (scope === 'basic' && schema.scope !== 'basic') return;
                if (out.checkboxes[schema.id] === undefined) return;

                if (delta && delta.checkboxes && delta.checkboxes[schema.id] !== undefined) {
                    out.checkboxes[schema.id] = !!delta.checkboxes[schema.id];
                    return;
                }

                // Flip probability scales with strength (max ~25% at full strength)
                if (Math.random() < strength * 0.25) {
                    out.checkboxes[schema.id] = !out.checkboxes[schema.id];
                }
            });
        }

        // ── Selects ──
        if (out.selects) {
            SELECT_SCHEMA.forEach(function (schema) {
                if (locks[schema.id]) return;
                if (scope === 'basic' && schema.scope !== 'basic') return;
                if (out.selects[schema.id] === undefined) return;

                if (delta && delta.selects && delta.selects[schema.id] !== undefined) {
                    out.selects[schema.id] = delta.selects[schema.id];
                    return;
                }

                var options = schema.options;
                if (!options) {
                    // Read options from DOM
                    var el = document.getElementById(schema.id);
                    if (el && el.tagName === 'SELECT') {
                        options = Array.from(el.options).map(function (o) { return o.value; });
                    }
                }
                if (!options || options.length < 2) return;

                if (Math.random() < strength * 0.3) {
                    out.selects[schema.id] = options[Math.floor(Math.random() * options.length)];
                }
            });
        }

        // ── Colors ──
        if (out.colors && scope !== 'extended_only') {
            if (!locks['color.background'] && out.colors.background) {
                if (delta && delta.colors && delta.colors.background) {
                    out.colors.background = delta.colors.background;
                } else if (scope === 'basic' || scope === 'all') {
                    out.colors.background = mutateColor(out.colors.background, strength);
                }
            }
            if (!locks['color.brush'] && out.colors.brush) {
                if (delta && delta.colors && delta.colors.brush) {
                    out.colors.brush = delta.colors.brush;
                } else if (scope === 'basic' || scope === 'all') {
                    out.colors.brush = mutateColor(out.colors.brush, strength);
                }
            }
        }

        // ── Kaleidoscope runtime ──
        if (out.kaleido && (scope === 'basic' || scope === 'all')) {
            if (!locks['kaleido.mode'] && Math.random() < strength * 0.3) {
                out.kaleido.mode = Math.floor(Math.random() * 6);
            }
            if (!locks['kaleido.segments']) {
                out.kaleido.segments = Math.max(1, Math.min(24,
                    Math.round((out.kaleido.segments || 6) + gaussRandom() * strength * 6)));
            }
            if (!locks['kaleido.angle']) {
                out.kaleido.angle = Math.round(((out.kaleido.angle || 0) + gaussRandom() * strength * 60) % 360);
            }
            if (!locks['kaleido.twist']) {
                out.kaleido.twist = Math.max(0, Math.min(10,
                    (out.kaleido.twist || 0) + gaussRandom() * strength * 2));
            }
            if (!locks['kaleido.zoom']) {
                out.kaleido.zoom = Math.max(0.5, Math.min(2,
                    (out.kaleido.zoom || 1) + gaussRandom() * strength * 0.3));
            }
            if (!locks['kaleido.blend']) {
                out.kaleido.blend = Math.max(0, Math.min(1,
                    (out.kaleido.blend || 1) + gaussRandom() * strength * 0.3));
            }
        }

        // ── Light source position ──
        if (out.lightPos && !locks['lightPos'] && (scope === 'all')) {
            if (delta && delta.lightPos) {
                out.lightPos = delta.lightPos;
            } else {
                out.lightPos.x = Math.max(0, Math.min(1,
                    (out.lightPos.x || 0.5) + gaussRandom() * strength * 0.25));
                out.lightPos.y = Math.max(0, Math.min(1,
                    (out.lightPos.y || 0.5) + gaussRandom() * strength * 0.25));
            }
        }

        // ── Shooting star origin ──
        if (out.ssOrigin && !locks['ssOrigin'] && (scope === 'all')) {
            if (delta && delta.ssOrigin) {
                out.ssOrigin = delta.ssOrigin;
            } else {
                out.ssOrigin.xPct = Math.max(-50, Math.min(150,
                    (out.ssOrigin.xPct || 50) + gaussRandom() * strength * 30));
                out.ssOrigin.yPct = Math.max(-50, Math.min(150,
                    (out.ssOrigin.yPct || 50) + gaussRandom() * strength * 30));
            }
        }

        // ── Palette index ──
        if (!locks['palette'] && (scope === 'basic' || scope === 'all')) {
            if (delta && typeof delta.paletteIndex === 'number') {
                out.paletteIndex = delta.paletteIndex;
            } else if (Math.random() < strength * 0.3) {
                var paletteCount = 1;
                try {
                    if (window.curatedPalettes) paletteCount = window.curatedPalettes.length;
                } catch (_) {}
                if (paletteCount > 1) {
                    out.paletteIndex = Math.floor(Math.random() * paletteCount);
                    try {
                        out.paletteName = window.curatedPalettes[out.paletteIndex]
                            ? window.curatedPalettes[out.paletteIndex].name : '';
                    } catch (_) { out.paletteName = ''; }
                }
            }
        }

        // ── Light shift color path (procedural) ──
        if (!locks['lightShiftPath'] && (scope === 'all')) {
            if (delta && delta.lightShiftPath) {
                out.lightShiftPath = delta.lightShiftPath;
            } else if (Math.random() < strength * 0.4) {
                out.lightShiftPath = generateProceduralColorPath(strength);
                // Pair with a gentle speed so the arc sweeps slowly
                if (out.sliders && !locks['lightShiftSpeed']) {
                    out.sliders.lightShiftSpeed = 0.1 + Math.random() * 0.2; // 0.1-0.3
                }
            }
        }

        // Stamp metadata
        out._mutationMeta = {
            strength: strength,
            scope: scope,
            parentTimestamp: base.timestamp,
            timestamp: Date.now()
        };

        return out;
    }

    // ── Procedural Color Path Generator ──────────────────────────────
    // Generates a path on the light shift HSL canvas (180×180 default)
    // Each point: { x, y, hue, saturation, lightness }
    // x maps to hue (0-360 across canvas width)
    // y maps to saturation (100 at top, 0 at bottom)

    function generateProceduralColorPath(strength) {
        var CANVAS = 180; // standard canvas size
        // Fewer points = smoother curve (6-10)
        var pointCount = 6 + Math.floor(Math.random() * 5);
        var path = [];

        // Single strategy: smooth swooping arc through hue space.
        // Gentle sinusoidal saturation modulation gives a nice organic curve.
        var startHue = Math.random() * 360;
        // Moderate hue span — enough colour variety without wrapping jaggedly
        var hueSpan = 90 + Math.random() * 120 * strength; // 90-210°
        // Direction: clockwise or counter-clockwise
        var dir = Math.random() < 0.5 ? 1 : -1;
        // Saturation band
        var satCenter = 50 + Math.random() * 25;          // 50-75
        var satAmplitude = 10 + Math.random() * 15;        // gentle wave 10-25
        // Phase offset for the saturation wave so arcs feel different each time
        var satPhase = Math.random() * Math.PI * 2;

        for (var i = 0; i < pointCount; i++) {
            var t = i / (pointCount - 1);  // 0 → 1
            // Smooth ease-in-out progression (cubic hermite)
            var ease = t * t * (3 - 2 * t);
            var hue = ((startHue + dir * ease * hueSpan) % 360 + 360) % 360;
            var sat = satCenter + Math.sin(satPhase + ease * Math.PI) * satAmplitude;
            sat = Math.max(15, Math.min(90, sat));
            var x = (hue / 360) * CANVAS;
            var y = (1 - sat / 100) * CANVAS;
            path.push({ x: x, y: y, hue: hue, saturation: sat, lightness: 50 });
        }

        return path;
    }

    /**
     * Generate N mutations from a base snapshot.
     */
    function generateVariations(base, count, opts) {
        var results = [];
        for (var i = 0; i < count; i++) {
            results.push(mutate(base, opts));
        }
        return results;
    }

    // ── Chain History ───────────────────────────────────────────────

    var _chain = [];       // Array of { snapshot, label, timestamp }
    var _chainIndex = -1;  // Current position in chain

    function chainPush(snapshot, label) {
        // Trim future if we branched
        if (_chainIndex < _chain.length - 1) {
            _chain = _chain.slice(0, _chainIndex + 1);
        }
        _chain.push({
            snapshot: JSON.parse(JSON.stringify(snapshot)),
            label: label || ('Step ' + (_chain.length + 1)),
            timestamp: Date.now()
        });
        _chainIndex = _chain.length - 1;

        // Cap history at 50 entries
        if (_chain.length > 50) {
            _chain.shift();
            _chainIndex--;
        }
    }

    function chainBack() {
        if (_chainIndex > 0) {
            _chainIndex--;
            return _chain[_chainIndex];
        }
        return null;
    }

    function chainForward() {
        if (_chainIndex < _chain.length - 1) {
            _chainIndex++;
            return _chain[_chainIndex];
        }
        return null;
    }

    function chainCurrent() {
        return _chain[_chainIndex] || null;
    }

    function chainGetAll() {
        return _chain.map(function (entry, i) {
            return { label: entry.label, timestamp: entry.timestamp, active: i === _chainIndex, index: i };
        });
    }

    function chainJump(index) {
        if (index >= 0 && index < _chain.length) {
            _chainIndex = index;
            return _chain[_chainIndex];
        }
        return null;
    }

    function chainClear() {
        _chain = [];
        _chainIndex = -1;
    }

    // ── Diff Summary ────────────────────────────────────────────────
    // Returns a human-readable list of what changed between base and variant

    function diffSummary(base, variant) {
        var changes = [];
        if (!base || !variant) return changes;

        // Sliders
        if (base.sliders && variant.sliders) {
            Object.keys(variant.sliders).forEach(function (id) {
                if (base.sliders[id] === undefined) return;
                var bv = base.sliders[id], vv = variant.sliders[id];
                if (bv !== vv) {
                    var schema = _sliderMap[id];
                    var pct = schema ? Math.round(Math.abs(vv - bv) / (schema.max - schema.min) * 100) : 0;
                    changes.push({ param: id, from: bv, to: vv, pct: pct, type: 'slider' });
                }
            });
        }

        // Checkboxes
        if (base.checkboxes && variant.checkboxes) {
            Object.keys(variant.checkboxes).forEach(function (id) {
                if (base.checkboxes[id] !== variant.checkboxes[id]) {
                    changes.push({ param: id, from: base.checkboxes[id], to: variant.checkboxes[id], type: 'checkbox' });
                }
            });
        }

        // Selects
        if (base.selects && variant.selects) {
            Object.keys(variant.selects).forEach(function (id) {
                if (base.selects[id] !== variant.selects[id]) {
                    changes.push({ param: id, from: base.selects[id], to: variant.selects[id], type: 'select' });
                }
            });
        }

        // Colors
        if (base.colors && variant.colors) {
            ['background', 'brush'].forEach(function (k) {
                if (base.colors[k] !== variant.colors[k]) {
                    changes.push({ param: 'color.' + k, from: base.colors[k], to: variant.colors[k], type: 'color' });
                }
            });
        }

        // Light position
        if (base.lightPos && variant.lightPos) {
            if (base.lightPos.x !== variant.lightPos.x || base.lightPos.y !== variant.lightPos.y) {
                changes.push({ param: 'lightPos', from: 'x:' + (base.lightPos.x||0).toFixed(2) + ' y:' + (base.lightPos.y||0).toFixed(2),
                    to: 'x:' + (variant.lightPos.x||0).toFixed(2) + ' y:' + (variant.lightPos.y||0).toFixed(2), type: 'slider' });
            }
        }

        // Shooting star origin
        if (base.ssOrigin && variant.ssOrigin) {
            if (base.ssOrigin.xPct !== variant.ssOrigin.xPct || base.ssOrigin.yPct !== variant.ssOrigin.yPct) {
                changes.push({ param: 'ssOrigin', from: Math.round(base.ssOrigin.xPct||0) + '%,' + Math.round(base.ssOrigin.yPct||0) + '%',
                    to: Math.round(variant.ssOrigin.xPct||0) + '%,' + Math.round(variant.ssOrigin.yPct||0) + '%', type: 'slider' });
            }
        }

        // Palette
        if (base.paletteIndex !== variant.paletteIndex) {
            changes.push({ param: 'palette', from: base.paletteName || ('#' + base.paletteIndex),
                to: variant.paletteName || ('#' + variant.paletteIndex), type: 'select' });
        }

        // Light shift path
        if (JSON.stringify(base.lightShiftPath || null) !== JSON.stringify(variant.lightShiftPath || null)) {
            var bLen = (base.lightShiftPath && base.lightShiftPath.length) || 0;
            var vLen = (variant.lightShiftPath && variant.lightShiftPath.length) || 0;
            changes.push({ param: 'lightShiftPath', from: bLen + ' pts', to: vLen + ' pts', type: 'select' });
        }

        return changes;
    }

    // ── Schema Access (for future LLM integration) ──────────────────

    function getSchema() {
        return {
            sliders: SLIDER_SCHEMA.map(function (s) { return { id: s.id, min: s.min, max: s.max, step: s.step, scope: s.scope }; }),
            checkboxes: CHECKBOX_SCHEMA.map(function (c) { return { id: c.id, scope: c.scope }; }),
            selects: SELECT_SCHEMA.map(function (s) { return { id: s.id, options: s.options, scope: s.scope }; }),
            colors: ['background', 'brush'],
            extras: ['lightPos', 'ssOrigin', 'palette', 'lightShiftPath']
        };
    }

    // ── Public API ──────────────────────────────────────────────────

    window.mutationEngine = {
        mutate: mutate,
        generateVariations: generateVariations,
        diffSummary: diffSummary,
        getSchema: getSchema,

        // Chain
        chain: {
            push: chainPush,
            back: chainBack,
            forward: chainForward,
            current: chainCurrent,
            jump: chainJump,
            getAll: chainGetAll,
            clear: chainClear,
            get index() { return _chainIndex; },
            get length() { return _chain.length; }
        }
    };

    console.log('[MutationEngine] Ready — ' + SLIDER_SCHEMA.length + ' sliders, ' +
        CHECKBOX_SCHEMA.length + ' checkboxes, ' + SELECT_SCHEMA.length + ' selects');
})();
