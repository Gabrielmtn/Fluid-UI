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
        // exactColor: programmatic splat sources (path layers, audio scenes,
        // animations) pass true so their configured color is deposited as-is on
        // every arm. Pointer strokes, stroke replay, and remote-peer strokes
        // leave it false — they ARE user strokes, so arm color modes apply.
        function multiSplat(x, y, dx, dy, color, shouldBroadcast, exactColor) {
            // Kaleidoscope behavior
            const centerX = canvas.width * 0.5;
            const centerY = canvas.height * 0.5;
            for (let i = 0; i < animationMultiplier; i++) {
                const angle = (Math.PI * 2 * i) / animationMultiplier;
                const relX = x - centerX;
                const relY = y - centerY;
                const rotatedX = relX * Math.cos(angle) - relY * Math.sin(angle);
                const rotatedY = relX * Math.sin(angle) + relY * Math.cos(angle);
                const finalX = rotatedX + centerX;
                const finalY = rotatedY + centerY;
                const rotatedDx = dx * Math.cos(angle) - dy * Math.sin(angle);
                const rotatedDy = dx * Math.sin(angle) + dy * Math.cos(angle);
                const armColor = exactColor ? color : resolveArmColor(i, color);
                splat(finalX, finalY, rotatedDx, rotatedDy, armColor);
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
                const rnd = document.getElementById('randomColor');
                if (rnd) rnd.checked = false;
                const stepEl = document.getElementById('stepPalette');
                if (stepEl) stepEl.checked = false;
                applyPickerColor();
                updatePaletteStepIndicator();
                // Two-way sync, picker → arm 0: if the brush's arm 0 holds a
                // fixed color, an explicit pick IS that color changing (panel →
                // picker direction lives in the brush-colors panel, 20-mixer).
                var arm0 = (window.multiArmColors || [])[0];
                if (arm0 && arm0.mode === 'fixed' && arm0.color !== colorPickerEl.value) {
                    arm0.color = colorPickerEl.value;
                    // refresh the panel's swatch if it's open
                    var armPicker = document.querySelector('.arm-colors-panel .arm-row .arm-picker');
                    if (armPicker) armPicker.value = colorPickerEl.value;
                    if (typeof window.persistArmColors === 'function') window.persistArmColors();
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
            });
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
            while ((0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) < 0.22 && light < 0.78) {
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
        // Expose globally for other scripts
        window.generateVibrantColor = generateVibrantColor;
