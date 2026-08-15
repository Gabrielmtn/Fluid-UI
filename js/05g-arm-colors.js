// ═══════════════════════════════════════════════════════════════════
// js/05g-arm-colors.js — part 7/14 of former 05-fluid-sim.js (lines 2194–2439)
// LOAD ORDER: after 05f-kaleido-controls.js, before 05h-slider-bindings.js
// PROVIDES: multiArmColors, resolveArmColor, advanceArmColors, multiSplat, applyMultiSplatWith, color pickers, generateVibrantColor, advanceColor; calls initPaletteUI/preseedPaletteOnLoad (01-config)
// REQUIRES: splatWithRadius (05d), config (04), palettes (01/02)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        // Per-arm color configuration: array of {mode, color, stepIndex}
        // mode: 'main' = use pointer color, 'fixed' = use .color hex, 'random', 'step'
        var multiArmColors = [];
        window.multiArmColors = multiArmColors;
        function resolveArmColor(armIndex, fallbackColor) {
            // Arm 0's color mode applies at EVERY multiplier (2026-07-13): the
            // brush-colors panel now renders arm 0 at 1x, and two-way sync with
            // the main #colorPicker keeps the solo brush coherent (the old
            // hijack this gate prevented — a stale non-'main' arm 0 from a
            // multi session overriding the picker — can't happen when the
            // panel and picker mirror each other).
            var cfg = multiArmColors[armIndex];
            if (!cfg || cfg.mode === 'main') return fallbackColor;
            // Arm 0's random/step DEFER to the legacy pointer.color pipeline:
            // advanceColor drives the single RNG and the picker "next" preview,
            // so the top-nav toggles and this per-arm path never draw two
            // different colours for the same stroke. Arms >0 keep their own
            // cache below. Rainbow can't defer — it changes per splat — so it
            // stays on the per-arm generateVibrantColor path even for arm 0.
            if (armIndex === 0 && (cfg.mode === 'random' || cfg.mode === 'step')) return fallbackColor;
            if (cfg.mode === 'fixed') {
                var hex = cfg.color || '#ffffff';
                return [
                    parseInt(hex.slice(1, 3), 16) / 255,
                    parseInt(hex.slice(3, 5), 16) / 255,
                    parseInt(hex.slice(5, 7), 16) / 255
                ];
            }
            if (cfg.mode === 'rainbow') {
                // New color on every single splat call
                return generateVibrantColor();
            }
            if (cfg.mode === 'random') {
                // Color set once on mouseup; held for the whole stroke
                if (!cfg.cachedColor) cfg.cachedColor = generateVibrantColor();
                return cfg.cachedColor;
            }
            if (cfg.mode === 'step') {
                // Color set once on mouseup; held for the whole stroke
                if (!cfg.cachedColor) {
                    var list0 = (typeof getStepColorList === 'function') ? getStepColorList() : [];
                    if (!list0.length) return fallbackColor;
                    var idx0 = (cfg.stepIndex || 0) % list0.length;
                    var h0 = list0[idx0];
                    cfg.cachedColor = [
                        parseInt(h0.slice(1, 3), 16) / 255,
                        parseInt(h0.slice(3, 5), 16) / 255,
                        parseInt(h0.slice(5, 7), 16) / 255
                    ];
                }
                return cfg.cachedColor;
            }
            return fallbackColor;
        }
        // Called on mouseup — advances random/step cached colors for next stroke
        function advanceArmColors() {
            var arr = window.multiArmColors;
            if (!arr) return;
            for (var i = 0; i < arr.length; i++) {
                var cfg = arr[i];
                if (!cfg) continue;
                // Arm 0's random/step ride the legacy pipeline (see
                // resolveArmColor) — its cache is never read, so don't advance
                // it (keeps the RNG draw count deterministic).
                if (i === 0 && (cfg.mode === 'random' || cfg.mode === 'step')) continue;
                if (cfg.mode === 'random') {
                    cfg.cachedColor = generateVibrantColor();
                }
                if (cfg.mode === 'step') {
                    var list = (typeof getStepColorList === 'function') ? getStepColorList() : [];
                    if (!list.length) { cfg.cachedColor = null; continue; }
                    cfg.stepIndex = ((cfg.stepIndex || 0) + 1) % list.length;
                    var hex = list[cfg.stepIndex];
                    cfg.cachedColor = [
                        parseInt(hex.slice(1, 3), 16) / 255,
                        parseInt(hex.slice(3, 5), 16) / 255,
                        parseInt(hex.slice(5, 7), 16) / 255
                    ];
                }
            }
        }
        window.advanceArmColors = advanceArmColors;

        // ── Multi-Brush symmetry (2026-08-11) ─────────────────────────────
        // The arm loop in multiSplat used to be hardcoded C_n: n copies of the
        // dab rotated about the canvas centre. Every mode is now that SAME
        // loop with a different transform list, so a new mode is data, not
        // code.
        //
        // A transform is a 2x3 affine [m00,m01,m02, m10,m11,m12] in
        // CENTRE-RELATIVE space. Position maps through the whole affine;
        // velocity through the LINEAR part only — velocity is a direction, not
        // a point, so a translation (rake) must leave it alone, while a
        // reflection has to flip it or the mirrored dye would swim the wrong
        // way. `arm` is the SOURCE arm index: a mirrored twin reuses its
        // source's colour, so a mirror reads as one brush folded over rather
        // than as two unrelated brushes.
        //
        // 'radial' deliberately keeps m02/m12 at exactly 0 and multiplies in
        // the same order as the pre-mode code, so it stays bit-identical to
        // what shipped before symmetry existed.
        var SYM_MIRROR_X  = [-1, 0, 0,  0,  1, 0];   // across the vertical axis
        var SYM_MIRROR_Y  = [ 1, 0, 0,  0, -1, 0];   // across the horizontal axis
        var SYM_MIRROR_XY = [-1, 0, 0,  0, -1, 0];   // both (= point reflection)

        function symCfg(key, def) {
            var c = window.config;
            return (c && typeof c[key] === 'number') ? c[key] : def;
        }
        function symRot(ang) {
            var c = Math.cos(ang), s = Math.sin(ang);
            return [c, -s, 0, s, c, 0];
        }
        function symCompose(A, B) {   // A applied after B
            return [
                A[0]*B[0] + A[1]*B[3], A[0]*B[1] + A[1]*B[4], A[0]*B[2] + A[1]*B[5] + A[2],
                A[3]*B[0] + A[4]*B[3], A[3]*B[1] + A[4]*B[4], A[3]*B[2] + A[4]*B[5] + A[5]
            ];
        }
        // Approximate brush DIAMETER in canvas px — the same estimate the dab
        // walker uses (05d0), so rake spacing opens and closes with the Size
        // fader instead of drifting out of scale.
        function symBrushDiameterPx() {
            var h = (typeof canvas !== 'undefined' && canvas && canvas.height) || 1080;
            return Math.max(4, 2 * Math.sqrt(symCfg('SPLAT_RADIUS', 0.011)) * h);
        }

        // Centre-based lists depend only on (mode, arms) and this runs per dab,
        // so build them once per change. Rake is travel-dependent and stays
        // uncached (it is a handful of adds).
        var symCacheKey = '';
        var symCacheList = null;

        function symmetryTransforms(mode, n, dx, dy) {
            n = Math.max(1, n | 0);
            if (mode === 'rake') {
                // Local, not centre-based: copies ride alongside the stroke like
                // the bristles of a rake. Pure translation, so every bristle
                // pushes the fluid exactly the way the real tip does.
                var gap = symCfg('SYM_RAKE_SPACING', 1) * symBrushDiameterPx();
                var sp = Math.hypot(dx, dy);
                // The initial press has no travel to be perpendicular to; spread
                // it horizontally so the rake still reads as a rake instead of
                // stacking n dabs on one spot.
                var px = sp > 1e-6 ? -dy / sp : 0;
                var py = sp > 1e-6 ?  dx / sp : 1;
                var rk = [];
                for (var r = 0; r < n; r++) {
                    var off = (r - (n - 1) / 2) * gap;
                    rk.push({ m: [1, 0, px * off, 0, 1, py * off], arm: r });
                }
                return rk;
            }
            var key = mode + '|' + n;
            if (symCacheKey === key && symCacheList) return symCacheList;

            var out = [];
            if (mode === 'spiral') {
                // Similarity symmetry: each copy turns AND shrinks toward the
                // centre, so the arms trace a logarithmic spiral instead of a
                // ring. The golden-angle default is what keeps them from
                // collapsing into spokes.
                var turn = symCfg('SYM_SPIRAL_TURN', 2.39996);
                var shrink = symCfg('SYM_SPIRAL_SCALE', 0.82);
                var k = 1;
                for (var i = 0; i < n; i++) {
                    var ca = Math.cos(turn * i), sa = Math.sin(turn * i);
                    out.push({ m: [ca * k, -sa * k, 0, sa * k, ca * k, 0], arm: i });
                    k *= shrink;
                }
            } else {
                // Rotational family. Adding the mirrors to C_n generates the
                // dihedral group, so 'mirrorX' at 8 arms IS a proper D8
                // kaleidoscope rather than eight independent tips.
                var mirrors = mode === 'mirrorX' ? [SYM_MIRROR_X]
                            : mode === 'mirrorY' ? [SYM_MIRROR_Y]
                            : mode === 'mirrorQuad' ? [SYM_MIRROR_X, SYM_MIRROR_Y, SYM_MIRROR_XY]
                            : null;   // 'radial' and any unknown/stale mode
                var seen = mirrors ? Object.create(null) : null;
                for (var a = 0; a < n; a++) {
                    var R = symRot((Math.PI * 2 * a) / n);
                    var variants = [R];
                    if (mirrors) {
                        for (var j = 0; j < mirrors.length; j++) variants.push(symCompose(mirrors[j], R));
                    }
                    for (var v = 0; v < variants.length; v++) {
                        if (seen) {
                            // A mirror can land back on a rotation already in the
                            // set — Quad at an even arm count is the loud case,
                            // since D_n has 2n elements, not 4n. Without this the
                            // duplicates double-dose dye on those arms.
                            var dk = variants[v].map(function (q) { return Math.round(q * 1e6); }).join(',');
                            if (seen[dk]) continue;
                            seen[dk] = 1;
                        }
                        out.push({ m: variants[v], arm: a });
                    }
                }
            }
            symCacheKey = key;
            symCacheList = out;
            return out;
        }
        // Exposed for the dropdown's dab-count hint (and console poking)
        window.symmetryTransforms = symmetryTransforms;

        // The select lives in the Multi-Brush dropdown (20-mixer-layout moves it
        // there). config is the single source of truth, so presets, session
        // autoload and the multiplayer lock all land through this one 'change'
        // — no second restore path to keep in sync.
        (function initSymmetryMode() {
            var el = document.getElementById('symmetryMode');
            if (!el) return;
            function applySymmetryMode() { config.SYMMETRY_MODE = el.value || 'radial'; }
            el.addEventListener('change', applySymmetryMode);
            applySymmetryMode();
        })();
        // exactColor: programmatic splat sources (path layers, audio scenes,
        // animations) pass true so their configured color is deposited as-is on
        // every arm. Pointer strokes, stroke replay, and remote-peer strokes
        // leave it false — they ARE user strokes, so arm color modes apply.
        function multiSplat(x, y, dx, dy, color, shouldBroadcast, exactColor) {
            // Brush tip (D1) rides the exactColor split: user strokes (live
            // pointer, replay, remote peers — exactColor falsy) stamp with the
            // configured BRUSH_TIP; programmatic sources (path layers, audio
            // scenes, animations) stay classic gaussian. splat() reads the
            // flag; cleared in finally so direct splat() callers never
            // inherit it.
            window.__unsavedWork = true; // every dye source funnels through here
            window.__brushTipOn = !exactColor;
            try {
            // Multi-Brush arms: one dab per symmetry transform (see the
            // symmetryTransforms block above for what each mode builds).
            const centerX = canvas.width * 0.5;
            const centerY = canvas.height * 0.5;
            const transforms = symmetryTransforms(config.SYMMETRY_MODE, animationMultiplier, dx, dy);
            const relX = x - centerX;
            const relY = y - centerY;
            for (let i = 0; i < transforms.length; i++) {
                const m = transforms[i].m;
                const finalX = (m[0] * relX + m[1] * relY + m[2]) + centerX;
                const finalY = (m[3] * relX + m[4] * relY + m[5]) + centerY;
                // Linear part only: velocity is a direction, so it must not
                // pick up the translation (rake) — but it MUST take the flip
                // (mirrors), or the reflected dye swims the wrong way.
                const armDx = m[0] * dx + m[1] * dy;
                const armDy = m[3] * dx + m[4] * dy;
                const armColor = exactColor ? color : resolveArmColor(transforms[i].arm, color);
                splat(finalX, finalY, armDx, armDy, armColor);
            }
            if (shouldBroadcast && typeof broadcastSplat === 'function') {
                broadcastSplat(
                    x / canvas.width,
                    y / canvas.height,
                    dx / canvas.width,
                    dy / canvas.height,
                    color,
                    (typeof animationMultiplier === 'number' ? animationMultiplier : 1),
                    config.SPLAT_RADIUS
                );
            }
            } finally { window.__brushTipOn = false; }
        }
        // Helper to apply a multiSplat with specific multiplier and radius, restoring after
        window.applyMultiSplatWith = function(x, y, dx, dy, color, mult, radius, exactColor) {
            const prevM = (typeof animationMultiplier === 'number') ? animationMultiplier : 1;
            const prevR = config.SPLAT_RADIUS;
            animationMultiplier = Math.max(1, Math.round(mult || 1));
            config.SPLAT_RADIUS = (typeof radius === 'number') ? radius : prevR;
            try { multiSplat(x, y, dx, dy, color, false, exactColor); } finally {
                animationMultiplier = prevM;
                config.SPLAT_RADIUS = prevR;
            }
        };
        const cursorToggle = document.getElementById('cursorToggle');
        cursorToggle.addEventListener('change', (e) => {
            showCursor = e.target.checked;
            if (!showCursor && !isReplayActive) {
                customCursor.style.opacity = '0';
            }
            // Toggle cursor visibility on non-UI elements
            const nonUIElements = [
                document.getElementById('canvas-area'),
                document.getElementById('canvas-wrapper'),
                document.getElementById('canvas'),
                document.getElementById('canvas-size-display'),
                document.getElementById('layers-container'),
                ...document.querySelectorAll('.background-layer'),
                ...document.querySelectorAll('.resize-handle'),
                ...document.querySelectorAll('.corner-lock'),
                ...document.querySelectorAll('.layer-resize-handle')
            ];
            nonUIElements.forEach(element => {
                if (element) {
                    if (showCursor) {
                        element.classList.remove('hide-cursor');
                    } else {
                        element.classList.add('hide-cursor');
                    }
                }
            });
        });
        // Initialize cursor state on page load
        cursorToggle.dispatchEvent(new Event('change'));
        colorStorage.load();
        initPaletteUI();
        preseedPaletteOnLoad();
        const colorPickerEl = document.getElementById('colorPicker');
        if (colorPickerEl) {
            colorPickerEl.addEventListener('input', () => {
                // The reflector is writing the value — don't re-enter.
                if (window.__brushColorSyncing) return;
                // Programmatic restore (save/load) writes color.brush directly;
                // read it into pointer.color but DON'T hijack arm0.mode — the
                // canonical armColors restore that follows owns the mode.
                if (window.__brushColorRestoring) {
                    applyPickerColor();
                    updatePaletteStepIndicator();
                    return;
                }
                // A user pick IS the active brush's new prevailing colour:
                // switch arm 0 to a fixed swatch (clearing Rnd/Step/Rainbow).
                // The controller sets arm0.color, applies pointer.color,
                // persists, and reflects into both colour UIs.
                if (typeof window.setActiveBrushColorMode === 'function') {
                    window.setActiveBrushColorMode('fixed', { color: colorPickerEl.value });
                } else {
                    const rnd = document.getElementById('randomColor');
                    if (rnd) rnd.checked = false;
                    const stepEl = document.getElementById('stepPalette');
                    if (stepEl) stepEl.checked = false;
                    applyPickerColor();
                    updatePaletteStepIndicator();
                }
            });
        }
        const randomColorCheckboxEl = document.getElementById('randomColor');
        if (randomColorCheckboxEl) {
            randomColorCheckboxEl.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const stepEl = document.getElementById('stepPalette');
                    if (stepEl) stepEl.checked = false;
                    advanceColor();
                }
                updatePaletteStepIndicator();
                mirrorCheckboxToArm0('random', e.target.checked);
            });
        }
        const stepPaletteCheckboxEl = document.getElementById('stepPalette');
        if (stepPaletteCheckboxEl) {
            stepPaletteCheckboxEl.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const rnd = document.getElementById('randomColor');
                    if (rnd) rnd.checked = false;
                    advanceColor();
                }
                updatePaletteStepIndicator();
                mirrorCheckboxToArm0('step', e.target.checked);
            });
        }
        // The single hub every LEGACY colour path funnels through: hotkeys
        // ('r'/'a' via toggleCheckbox), applyPalette's auto-step, and snapshot
        // restore all dispatch 'change' on these checkboxes and land here, so
        // arm0.mode (canonical for painting + recording) stays in step without
        // each caller knowing about it. Guarded so the reflector's own
        // property writes and programmatic restore don't re-enter.
        function mirrorCheckboxToArm0(mode, checked) {
            if (window.__brushColorSyncing || window.__brushColorRestoring) return;
            var a0 = ensureArm0();
            if (checked) a0.mode = mode;
            else if (a0.mode === mode) a0.mode = 'fixed';
            a0.cachedColor = null;
            if (typeof window.persistArmColors === 'function') window.persistArmColors();
            syncBrushColorUI();
        }
        // Generate vibrant random color (avoids washed out/pale/gloomy colors)
        function generateVibrantColor() {
            // Use HSL to control saturation and lightness
            const hue = Math.random() * 360; // Full spectrum
            const sat = 0.85 + Math.random() * 0.15; // 85-100% saturation (sharp, clear hues)
            let light = 0.5 + Math.random() * 0.15; // 50-65% lightness (luminous, never muddy)
            function hslToRgb(h, s, l) {
                const c = (1 - Math.abs(2 * l - 1)) * s;
                const x = c * (1 - Math.abs((h / 60) % 2 - 1));
                const m = l - c / 2;
                let r, g, b;
                if (h < 60) { r = c; g = x; b = 0; }
                else if (h < 120) { r = x; g = c; b = 0; }
                else if (h < 180) { r = 0; g = c; b = x; }
                else if (h < 240) { r = 0; g = x; b = c; }
                else if (h < 300) { r = x; g = 0; b = c; }
                else { r = c; g = 0; b = x; }
                return [r + m, g + m, b + m];
            }
            let rgb = hslToRgb(hue, sat, light);
            // Equal HSL lightness is not equal perceived brightness: a deep blue at
            // L 0.5 reads near-black on the dark canvas while a yellow glows. Lift
            // lightness until the color clears a luma floor so every hue lands legible.
            //   Gate needs a HIGHER floor. Ungated, dye ACCUMULATES (additive) and
            // washes any hue bright, so a deep blue/red/purple rescues itself — the
            // 0.22 floor is fine. Gated, the colour is deposited AS PAINTED (the
            // splat CONVERGES to it, no build-up), so an intrinsically-dark hue
            // stays dark: measured Gate screen-luma of random hues spanned 53
            // (blue) … 194 (yellow), so a random stroke on top of a bright area
            // could HALVE its brightness — "the next ones on top look too dark".
            // A 0.40 floor lifts the dark end (blue/red/purple ~64→~93 screen-luma)
            // while barely moving saturation (only the dark hues get lightened;
            // bright hues already clear it — measured avg sat 0.81→0.76). Both
            // console-tunable; 0 disables. See [[fluid-ui-roadmap]] Gate notes.
            var lumaFloor = config.COLOR_GATE
                ? ((typeof config.RANDOM_LUMA_FLOOR_GATE === 'number') ? config.RANDOM_LUMA_FLOOR_GATE : 0.40)
                : ((typeof config.RANDOM_LUMA_FLOOR === 'number') ? config.RANDOM_LUMA_FLOOR : 0.22);
            while ((0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) < lumaFloor && light < 0.82) {
                light += 0.04;
                rgb = hslToRgb(hue, sat, light);
            }
            return rgb;
        }
        function rgbToHex(r, g, b) {
            var hr = Math.round(r * 255).toString(16).padStart(2, '0');
            var hg = Math.round(g * 255).toString(16).padStart(2, '0');
            var hb = Math.round(b * 255).toString(16).padStart(2, '0');
            return '#' + hr + hg + hb;
        }
        function syncPickerIndicator(r, g, b) {
            var cp = document.getElementById('colorPicker');
            if (cp) cp.value = rgbToHex(r, g, b);
        }
        // Read whatever the picker currently shows into pointer.color
        var firstPaintColorFreshened = false;
        function applyPickerColor() {
            // The session's first stroke would otherwise paint whatever the picker
            // was left holding (palette preseed / restored state) — a color that
            // never went through generateVibrantColor, since advanceColor only runs
            // on mouseup. In random mode, advance once up front so the vibrancy
            // guarantee covers the very first paint too.
            if (!firstPaintColorFreshened) {
                firstPaintColorFreshened = true;
                const rndEl = document.getElementById('randomColor');
                if (rndEl && rndEl.checked) advanceColor();
            }
            const hex = document.getElementById('colorPicker').value;
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            pointer.color = [r, g, b];
        }
        // Advance step/random to the NEXT color and sync the picker
        // (called on mouseup so the picker shows what's coming next)
        function advanceColor() {
            const stepEl = document.getElementById('stepPalette');
            const rndEl = document.getElementById('randomColor');
            if (stepEl && stepEl.checked) {
                const list = getStepColorList();
                if (list.length > 0) {
                    const len = list.length;
                    const idx = paletteStepIndex % len;
                    const col = list[idx];
                    paletteStepIndex = (paletteStepIndex + 1) % len;
                    if (col) {
                        syncPickerIndicator(
                            parseInt(col.slice(1, 3), 16) / 255,
                            parseInt(col.slice(3, 5), 16) / 255,
                            parseInt(col.slice(5, 7), 16) / 255
                        );
                    }
                    if (typeof updatePaletteStepIndicator === 'function') {
                        updatePaletteStepIndicator();
                    }
                    return;
                }
            }
            if (rndEl && rndEl.checked) {
                var c = generateVibrantColor();
                syncPickerIndicator(c[0], c[1], c[2]);
                return;
            }
        }
        // Legacy wrapper — reads picker then advances (used by non-pointer callers)
        function updateColor() {
            applyPickerColor();
            advanceColor();
        }
        // ── Active-brush colour: one source of truth (arm 0) ──────────────
        // The top-nav Color channel and the Brush Colors panel's arm-0 row are
        // two VIEWS of multiArmColors[0].mode. setActiveBrushColorMode is the
        // single UI writer of that mode; syncBrushColorUI reflects it back into
        // every widget by PROPERTY (never dispatches events), so nothing loops.
        // Recording already treats arm0.mode as canonical (03-recording.js).
        function ensureArm0() {
            var arr = window.multiArmColors;
            if (!arr) { arr = []; window.multiArmColors = arr; }
            if (!arr[0]) arr[0] = { mode: 'main', color: '#ffffff', stepIndex: 0 };
            return arr[0];
        }
        window.ensureArm0 = ensureArm0;
        // Reflect arm0.mode into all colour widgets WITHOUT dispatching events.
        function syncBrushColorUI(opts) {
            if (window.__brushColorSyncing) return;
            window.__brushColorSyncing = true;
            try {
                opts = opts || {};
                var a0 = ensureArm0();
                var m = a0.mode;
                var rnd = document.getElementById('randomColor');
                var stepEl = document.getElementById('stepPalette');
                if (rnd) rnd.checked = (m === 'random');
                if (stepEl) stepEl.checked = (m === 'step');
                // Top-nav chips (built in 20-mixer with data-brush-mode).
                var chips = document.querySelectorAll('[data-brush-mode]');
                for (var i = 0; i < chips.length; i++) {
                    var bm = chips[i].getAttribute('data-brush-mode');
                    var on = (bm === 'rnd' && m === 'random')
                          || (bm === 'step' && m === 'step')
                          || (bm === 'rainbow' && m === 'rainbow');
                    chips[i].classList.toggle('active', on);
                }
                // Picker shows the fixed swatch (no 'input' dispatch).
                if ((m === 'fixed' || m === 'main') && a0.color) {
                    var cp = document.getElementById('colorPicker');
                    if (cp && cp.value !== a0.color) cp.value = a0.color;
                }
                if (typeof updatePaletteStepIndicator === 'function') updatePaletteStepIndicator();
                // Panel arm-0 row: rebuild only when open, and not when the
                // panel itself initiated the change (skipPanel).
                if (!opts.skipPanel && typeof window.rebuildArmColorRows === 'function') {
                    // Must match the ARM-COLORS popup specifically: the brush
                    // drawer and the presets popup also carry .arm-colors-panel
                    // (shared skin) and the drawer is now built FIRST, so a bare
                    // '.arm-colors-panel' query hit the drawer and rebuilt every
                    // arm row on each palette change even with the popup closed.
                    var panel = document.querySelector('.arm-colors-panel.arm-colors-rows');
                    if (panel && panel.style.display !== 'none') window.rebuildArmColorRows();
                }
            } finally {
                window.__brushColorSyncing = false;
            }
        }
        window.syncBrushColorUI = syncBrushColorUI;
        // The one action. mode ∈ 'fixed' | 'random' | 'step' | 'rainbow'.
        function setActiveBrushColorMode(mode, opts) {
            opts = opts || {};
            if (mode !== 'random' && mode !== 'step' && mode !== 'rainbow') mode = 'fixed';
            var a0 = ensureArm0();
            a0.mode = mode;
            a0.cachedColor = null;
            if (mode === 'fixed') {
                // Adopt the given swatch, or whatever the picker currently shows
                // (so toggling a generative mode OFF keeps the visible colour).
                if (opts.color) a0.color = opts.color;
                else {
                    var cp = document.getElementById('colorPicker');
                    if (cp && cp.value) a0.color = cp.value;
                }
            }
            if (typeof window.persistArmColors === 'function') window.persistArmColors();
            syncBrushColorUI(opts.skipPanel ? { skipPanel: true } : undefined);
            // Side effects AFTER the checkboxes reflect the new mode (advanceColor
            // reads them): seed the picker "next" preview for random/step, set
            // pointer.color for fixed. Rainbow needs nothing — resolveArmColor
            // draws per splat.
            if (mode === 'random' || mode === 'step') {
                advanceColor();
                if (typeof updatePaletteStepIndicator === 'function') updatePaletteStepIndicator();
            } else if (mode === 'fixed') {
                applyPickerColor();
            }
        }
        window.setActiveBrushColorMode = setActiveBrushColorMode;
        // Expose globally for other scripts
        window.generateVibrantColor = generateVibrantColor;
