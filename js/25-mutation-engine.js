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

    // ── Feature Gates ───────────────────────────────────────────────
    // A param only mutates when its owning feature toggle is ON in the
    // VARIANT (checkboxes are rolled first, then selects, so a variant
    // that flips a feature on gets its params varied too). Mutating a
    // param whose feature is off inflates the card's change count while
    // altering nothing on screen — the "mutate did nothing" complaint.
    // A condition is a switch id, or 'selectId=value' / 'selectId!=value'
    // for a mode. Params not listed here are always eligible.
    //
    // The kaleidoscope shows only with its switch on AND a real mode: mode 0
    // is Off (05a doK). Mutate no longer deals it, but a user can pick it.
    var KALEIDO = ['kaleidoToggle', 'kaleidoMode!=0'];
    var FEATURE_GATES = {
        // switches that live inside another feature's panel
        kAnimateRot: KALEIDO,
        scatterToggle: ['glowToggle'],     // Scatter sits inside Glow's panel
        // sliders
        kSpinSpeed: KALEIDO.concat('kAnimateRot'),
        kTwist: KALEIDO,
        kZoom: KALEIDO,
        kBlend: KALEIDO,
        kAngle: KALEIDO,
        kaleidoSegments: KALEIDO,
        // Speed only drives Random mode's wander (13), and is hidden in Manual.
        lightSpeed: ['enableLighting', 'lightMode=random'],
        lightIntensity: ['enableLighting'],
        lightAmbient: ['enableLighting'],
        lightShiftSpeed: ['enableLightShift'],
        lightShiftThreshold: ['enableLightShift'],
        lightShiftIntensity: ['enableLightShift'],
        lightShiftSaturation: ['enableLightShift'],
        // Ridges and Vibrance sit under the Surface Shading switch (20): a
        // mutation there with shading off would change a hidden control.
        ridges: ['displayShadingToggle'],
        vibrance: ['displayShadingToggle'],
        glowIntensity: ['glowToggle'],
        glowThreshold: ['glowToggle'],
        // Two conditions, ANDed (see the loop in gateOpen): Scatter marches
        // Glow's prefilter buffer, so with Glow off the slider is doubly dead.
        scatterAmount: ['glowToggle', 'scatterToggle'],
        scatterReach: ['glowToggle', 'scatterToggle'],
        audioSensitivity: ['audioReactToggle'],
        audioBeatThreshold: ['audioReactToggle'],
        shadingIntensity: ['displayShadingToggle'],
        shadeRelief: ['displayShadingToggle'],
        shadeGloss: ['displayShadingToggle'],
        // selects
        kaleidoMode: ['kaleidoToggle'],
        lightMode: ['enableLighting'],
        lightShiftMode: ['enableLightShift'],
        // the light's pad position: Random mode moves the light itself and
        // overwrites a varied position on its first frame
        lightPos: ['enableLighting', 'lightMode=manual']
    };

    // What a Gloss Paint material drives itself (29-material-modes: its
    // TOUCHED config keys plus the shading controls its apply() writes).
    // applyPresetSnapshot re-enters the material LAST, so while one is active
    // a mutation to any of these is overwritten before it is ever seen — the
    // card listed "curl 20%, sharpness 15%" and nothing moved. The material's
    // own amount (the Curl slider as Flow / Thickness) is varied instead.
    var MATERIAL_OWNED = {
        curl: 1, sharpness: 1, vibrance: 1, velocityDissipation: 1,
        pressureIteration: 1, pressureDissipation: 1,
        shadingIntensity: 1, displayShadingToggle: 1
    };

    function materialActive(out) {
        return !!(out.material && out.material.mode && out.material.mode !== 'fluid');
    }

    // Variant checkbox state; params whose toggle was not captured in the
    // snapshot fail OPEN (mutate as before) rather than silently vanishing.
    function _cbOn(out, id) {
        var v = out.checkboxes ? out.checkboxes[id] : undefined;
        return v === undefined ? true : !!v;
    }

    // Same fail-open rule for a 'selectId=value' / 'selectId!=value' condition.
    function _condOn(out, cond) {
        var m = /^(\w+)(!?=)(.*)$/.exec(cond);
        if (!m) return _cbOn(out, cond);
        var v = out.selects ? out.selects[m[1]] : undefined;
        if (v === undefined) return true;
        return (String(v) === m[3]) === (m[2] === '=');
    }

    function gateOpen(out, id) {
        if (MATERIAL_OWNED[id] && materialActive(out)) return false;
        var gates = FEATURE_GATES[id];
        if (!gates) return true;
        for (var i = 0; i < gates.length; i++) {
            if (!_condOn(out, gates[i])) return false;
        }
        return true;
    }

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
        if (schema.step >= 1) clamped = Math.round(clamped);
        else {
            var inv = 1 / schema.step;
            clamped = Math.round(clamped * inv) / inv;
        }
        // Land on a value the control can actually hold: applyPresetSnapshot
        // re-clamps through the registry (its ui step, e.g. 0.1 against a
        // 0.05 mut step), so the card would otherwise promise one number and
        // the slider show another.
        var reg = window.ParamRegistry;
        if (reg && reg.clampSlider) {
            var held = reg.clampSlider(schema.id, clamped);
            if (held !== null) clamped = held;
        }
        return clamped;
    }

    // One random colour move per variant, applied to every colour the variant
    // shifts, so a multi-arm brush keeps its scheme and turns as a whole.
    function colorShift(strength) {
        return {
            h: gaussRandom() * strength * 0.3,
            s: gaussRandom() * strength * 0.3,
            l: gaussRandom() * strength * 0.2
        };
    }

    function shiftColor(baseHex, shift) {
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
        hsl[0] = ((hsl[0] + shift.h) % 1 + 1) % 1;
        hsl[1] = Math.max(0, Math.min(1, hsl[1] + shift.s));
        hsl[2] = Math.max(0.05, Math.min(0.95, hsl[2] + shift.l));
        var rgb = hslFrac01ToRgb255(hsl[0], hsl[1], hsl[2]);
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

    // h, s and l ALL as fractions (0-1) — the shape rgbToHsl above returns —
    // and returns 0-255 floats. See the naming note in 05g-arm-colors: the
    // other two hslToRgb functions here take degrees, and one takes percent.
    function hslFrac01ToRgb255(h, s, l) {
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
        // External deltas are exact instructions — apply once, no retry.
        if (opts.delta) return mutateOnce(base, opts);
        // Quantized mean-zero noise can round every slider straight back to
        // its base value (coarse steps + small ranges at low strength) — the
        // "mutate did nothing" outcome. Re-roll until the variant actually
        // differs; as a last resort push one random eligible slider visibly.
        var out = mutateOnce(base, opts);
        var tries = 0;
        while (tries < 4 && diffSummary(base, out).length === 0) {
            out = mutateOnce(base, opts);
            tries++;
        }
        if (diffSummary(base, out).length === 0) {
            forceNudge(out, opts);
            syncKaleido(base, out);   // the nudge may have moved a kaleido slider
        }
        return out;
    }

    // Last-resort guarantee for mutate(): one random unlocked, scope- and
    // gate-eligible slider gets a visible push (≥1 step, ~10% of range).
    function forceNudge(out, opts) {
        var scope = opts.scope || 'basic';
        var locks = opts.locks || {};
        var strength = typeof opts.strength === 'number' ? opts.strength : 0.3;
        var pool = SLIDER_SCHEMA.filter(function (s) {
            return !locks[s.id]
                && !(scope === 'basic' && s.scope !== 'basic')
                && out.sliders && out.sliders[s.id] !== undefined
                && gateOpen(out, s.id);
        });
        if (!pool.length) return;
        var s = pool[Math.floor(Math.random() * pool.length)];
        var mag = Math.max(s.step, (s.max - s.min) * 0.1 * Math.max(strength, 0.3));
        var dir = Math.random() < 0.5 ? -1 : 1;
        var v = clampToSchema(s, out.sliders[s.id] + dir * mag);
        // Clamped into no-op at a range edge — push the other way.
        if (v === out.sliders[s.id]) v = clampToSchema(s, out.sliders[s.id] - dir * mag);
        out.sliders[s.id] = v;
    }

    function mutateOnce(base, opts) {
        var strength = typeof opts.strength === 'number' ? opts.strength : 0.3;
        var scope    = opts.scope || 'basic';
        var locks    = opts.locks || {};
        var delta    = opts.delta || null;

        // Deep copy the base
        var out = JSON.parse(JSON.stringify(base));

        // ── Checkboxes ── (FIRST: feature gates below read the variant's
        // post-flip toggle state, so a variant that turns a feature on
        // also gets that feature's params varied)
        if (out.checkboxes) {
            CHECKBOX_SCHEMA.forEach(function (schema) {
                if (locks[schema.id]) return;
                if (scope === 'basic' && schema.scope !== 'basic') return;
                if (out.checkboxes[schema.id] === undefined) return;

                if (delta && delta.checkboxes && delta.checkboxes[schema.id] !== undefined) {
                    out.checkboxes[schema.id] = !!delta.checkboxes[schema.id];
                    return;
                }
                if (!gateOpen(out, schema.id)) return;

                // Flip probability scales with strength (max ~25% at full strength)
                if (Math.random() < strength * 0.25) {
                    out.checkboxes[schema.id] = !out.checkboxes[schema.id];
                }
            });
            settleBrushSwitches(base, out);
        }

        // ── Selects ── (SECOND, for the same reason: a mode is a gate too —
        // Light Speed only exists in Random mode)
        if (out.selects) {
            SELECT_SCHEMA.forEach(function (schema) {
                if (locks[schema.id]) return;
                if (scope === 'basic' && schema.scope !== 'basic') return;
                if (out.selects[schema.id] === undefined) return;

                if (delta && delta.selects && delta.selects[schema.id] !== undefined) {
                    out.selects[schema.id] = delta.selects[schema.id];
                    return;
                }
                if (!gateOpen(out, schema.id)) return;

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
                if (!gateOpen(out, schema.id)) return;

                var range = schema.max - schema.min;
                var noise = gaussRandom() * strength * range * 0.3;
                out.sliders[schema.id] = clampToSchema(schema, out.sliders[schema.id] + noise);
            });
        }

        // ── Colors ──
        // Background is a FUNDAMENTAL DISPLAY SETTING, not a style variant
        // (Gabriel 2026-08-05): random mutation kept washing black canvases
        // to grey — shiftColor's 0.05 lightness floor means black can only
        // get LIGHTER. Only an explicit external delta may set it now.
        if (out.colors && scope !== 'extended_only') {
            if (out.colors.background && delta && delta.colors && delta.colors.background) {
                out.colors.background = delta.colors.background;
            }
        }

        // Brush colour. Only a solid brush has a colour to vary: with Rnd or
        // Step on (after the flips above) every stroke picks its own, and a
        // varied picker would only be the next stroke's throwaway.
        var zeroMode = armZeroMode(out);
        var shift = (scope === 'basic' || scope === 'all') ? colorShift(strength) : null;
        if (out.colors && out.colors.brush && !locks['color.brush']) {
            if (delta && delta.colors && delta.colors.brush) {
                out.colors.brush = delta.colors.brush;
            } else if (shift && (zeroMode === 'fixed' || zeroMode === 'main')) {
                out.colors.brush = shiftColor(out.colors.brush, shift);
            }
        }
        // A multi-brush's other solid arms turn with it, keeping the scheme.
        if (shift && !locks['color.arms']) shiftSolidArms(out, shift);
        // Arm 0 is the brush's canonical colour (05g). The apply restores
        // armColors AFTER colors.brush and the Rnd/Step switches, then
        // reflects arm 0 back into the picker and both switches — so while
        // this only changed colors.brush, every colour change was reverted
        // on apply and the brush stayed the same colour.
        syncArmZero(out, zeroMode);

        // ── Light source position ──
        if (out.lightPos && !locks['lightPos'] && (scope === 'all') && gateOpen(out, 'lightPos')) {
            if (delta && delta.lightPos) {
                out.lightPos = delta.lightPos;
            } else {
                // typeof, not ||: a light parked on an edge (0) is a position,
                // not a missing one to re-centre.
                var lx = typeof out.lightPos.x === 'number' ? out.lightPos.x : 0.5;
                var ly = typeof out.lightPos.y === 'number' ? out.lightPos.y : 0.5;
                out.lightPos.x = Math.max(0, Math.min(1, lx + gaussRandom() * strength * 0.25));
                out.lightPos.y = Math.max(0, Math.min(1, ly + gaussRandom() * strength * 0.25));
            }
        }

        // ── Palette index ──
        if (!locks['palette'] && (scope === 'basic' || scope === 'all')) {
            if (delta && typeof delta.paletteIndex === 'number') {
                setPalette(out, delta.paletteIndex);
            } else if (Math.random() < strength * 0.3) {
                var paletteCount = 1;
                try {
                    if (window.curatedPalettes) paletteCount = window.curatedPalettes.length;
                } catch (_) {}
                if (paletteCount > 1) setPalette(out, Math.floor(Math.random() * paletteCount));
            }
        }

        // ── Light shift color path (procedural) ──
        if (!locks['lightShiftPath'] && (scope === 'all') && _cbOn(out, 'enableLightShift')) {
            if (delta && delta.lightShiftPath) {
                out.lightShiftPath = delta.lightShiftPath;
            } else if (Math.random() < strength * 0.4) {
                out.lightShiftPath = generateProceduralColorPath(strength);
                // Pair with a gentle speed so the arc sweeps slowly
                if (out.sliders && !locks['lightShiftSpeed'] && _sliderMap.lightShiftSpeed) {
                    out.sliders.lightShiftSpeed = clampToSchema(_sliderMap.lightShiftSpeed,
                        0.1 + Math.random() * 0.2); // 0.1-0.3
                }
            }
        }

        // ── Material amount ──
        // In a Gloss Paint material the Curl slider is the material's Flow /
        // Thickness macro and the params it drives are gated off above, so
        // this is the paint-body knob a variant varies instead.
        if (materialActive(out) && !locks['material.amount'] && (scope === 'basic' || scope === 'all')) {
            var cs = _sliderMap.curl || { min: 0, max: 60 };
            var amt = typeof out.material.amount === 'number' ? out.material.amount : 30;
            out.material.amount = Math.max(cs.min, Math.min(cs.max,
                Math.round(amt + gaussRandom() * strength * (cs.max - cs.min) * 0.3)));
        }

        syncKaleido(base, out);

        // Stamp metadata
        out._mutationMeta = {
            strength: strength,
            scope: scope,
            parentTimestamp: base.timestamp,
            timestamp: Date.now()
        };

        return out;
    }

    // ── Keeping a variant consistent with itself ────────────────────
    // A snapshot carries some state twice: a control and the live value the
    // apply restores after it. A variant has to change both, or the apply
    // quietly undoes the change the card promised.

    // Rnd and Step are exclusive in the UI (ticking one unticks the other);
    // independent flips can land both on — keep the one that just came on.
    function settleBrushSwitches(base, out) {
        var cb = out.checkboxes;
        if (!cb || !cb.randomColor || !cb.stepPalette) return;
        var was = (base && base.checkboxes) || {};
        if (was.randomColor && !was.stepPalette) cb.randomColor = false;
        else if (was.stepPalette && !was.randomColor) cb.stepPalette = false;
        else if (Math.random() < 0.5) cb.randomColor = false;
        else cb.stepPalette = false;
    }

    // Arm 0's mode once the variant is applied — what 05g's switch handlers
    // make of the variant's Rnd/Step state.
    function armZeroMode(out) {
        var cb = out.checkboxes || {};
        var a0 = Array.isArray(out.armColors) ? out.armColors[0] : null;
        var cur = a0 && a0.mode;
        if (cb.randomColor === undefined && cb.stepPalette === undefined) return cur || 'fixed';
        if (cb.randomColor) return 'random';
        if (cb.stepPalette) return 'step';
        return cur === 'main' ? 'main' : 'fixed';
    }

    function syncArmZero(out, mode) {
        var a0 = Array.isArray(out.armColors) ? out.armColors[0] : null;
        if (!a0) return;
        a0.mode = mode;
        if ((mode === 'fixed' || mode === 'main') && out.colors && out.colors.brush) {
            a0.color = out.colors.brush;
        }
    }

    // Solid arms past the first, as far as the variant's Multiply reaches:
    // an arm beyond it paints nothing, so moving it would be a silent change.
    function shiftSolidArms(out, shift) {
        if (!Array.isArray(out.armColors)) return;
        var mult = (out.sliders && out.sliders.multiplier) || 1;
        var n = Math.min(out.armColors.length, Math.max(1, Math.round(mult)));
        for (var i = 1; i < n; i++) {
            var a = out.armColors[i];
            if (a && a.mode === 'fixed' && a.color) a.color = shiftColor(a.color, shift);
        }
    }

    // A palette pick re-seeds the swatch tray (01 applyPalette) and Step
    // paints from the tray, but the apply restores savedColors straight after
    // the palette — so the tray has to change with it, or Step goes on
    // painting the old palette. The name travels too: the apply looks the
    // palette up by name first.
    function setPalette(out, idx) {
        var pals = window.curatedPalettes;
        out.paletteIndex = idx;
        out.paletteName = (pals && pals[idx]) ? pals[idx].name : '';
        if (typeof window.getPaletteColorsForIndex === 'function') {
            var tray = window.getPaletteColorsForIndex(idx);
            if (tray && tray.length) out.savedColors = tray.slice();
        }
    }

    // snapshot.kaleido holds the live globals behind the kaleido controls
    // (05f), written AFTER the sliders on apply. It used to be mutated on its
    // own: segments and mode came out different from the sliders, twist /
    // zoom / blend ran at values no slider showed, the angle was varied in
    // degrees on a radians value, and the spin switch never took. Now it
    // follows the controls — only the ones that moved, since the spin
    // animates kAngle away from its slider and an untouched one keeps its
    // live value.
    function syncKaleido(base, out) {
        var k = out.kaleido;
        if (!k || !base) return;
        function moved(sec, id) {
            return !!(out[sec] && base[sec]) && out[sec][id] !== undefined && out[sec][id] !== base[sec][id];
        }
        if (moved('sliders', 'kaleidoSegments')) k.segments = out.sliders.kaleidoSegments;
        if (moved('selects', 'kaleidoMode')) {
            var m = parseInt(out.selects.kaleidoMode, 10);
            if (isFinite(m)) k.mode = m;
        }
        if (moved('sliders', 'kAngle')) k.angle = out.sliders.kAngle * Math.PI / 180;
        if (moved('sliders', 'kTwist')) k.twist = out.sliders.kTwist;
        if (moved('sliders', 'kZoom')) k.zoom = out.sliders.kZoom;
        if (moved('sliders', 'kBlend')) k.blend = out.sliders.kBlend;
        if (moved('checkboxes', 'kAnimateRot')) k.animate = !!out.checkboxes.kAnimateRot;
    }

    // What a variant carries: the look sections of a snapshot — the set a
    // shared-settings link carries (50-look-links SECTIONS). Content (layers,
    // masks, text, recordings), libraries (user palettes) and the workspace
    // (canvas geometry, collapsed sections, focus mode) stay out, so picking
    // a variant, or Undo / Reset back to where you started, never rewinds a
    // layer painted or a canvas resized after Mutate was pressed.
    var LOOK_SECTIONS = ['version', 'timestamp', 'sliders', 'checkboxes', 'selects', 'colors',
        'kaleido', 'paletteIndex', 'paletteName', 'savedColors', 'armColors', 'lightPos',
        'lightShiftPath', 'brushState', 'material', 'brushTip', 'ssOrigin', 'cosOscillator'];

    function lookOf(snapshot) {
        if (!snapshot) return null;
        var look = {};
        LOOK_SECTIONS.forEach(function (k) {
            if (snapshot[k] !== undefined) look[k] = snapshot[k];
        });
        return look;
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

        // The other solid arms of a multi-brush (arm 0 is color.brush). The
        // kaleido runtime is not listed: it only ever follows its sliders now,
        // which are counted above.
        if (Array.isArray(base.armColors) && Array.isArray(variant.armColors)) {
            for (var ai = 1; ai < variant.armColors.length; ai++) {
                var ba = base.armColors[ai], va = variant.armColors[ai];
                if (ba && va && ba.color !== va.color) {
                    changes.push({ param: 'color.arms', from: ba.color, to: va.color, type: 'color' });
                    break;
                }
            }
        }

        // Material amount (Flow / Thickness)
        if (base.material && variant.material && base.material.amount !== variant.material.amount) {
            var amtRange = _sliderMap.curl ? (_sliderMap.curl.max - _sliderMap.curl.min) : 60;
            changes.push({ param: 'material.amount', from: base.material.amount, to: variant.material.amount, type: 'slider',
                pct: Math.round(Math.abs((variant.material.amount || 0) - (base.material.amount || 0)) / amtRange * 100) });
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
        lookOf: lookOf,
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
