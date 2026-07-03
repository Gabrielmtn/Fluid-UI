// ═══════════════════════════════════════════════════════════════════
// js/05e-effect-controls.js — part 5/14 of former 05-fluid-sim.js (lines 1741–1965)
// LOAD ORDER: after 05d-input-replay.js, before 05f-kaleido-controls.js
// PROVIDES: turbulence/microDetail/sunrays control wiring, background color, canvas opacity, display shading, capture dimming, multiplier, timeScale, setMultiplierHotkey
// REQUIRES: config (04)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        // Turbulence mode toggle
        window.useTurbulenceMode = false;
        const turbulenceToggle = document.getElementById('turbulenceMode');
        if (turbulenceToggle) {
            turbulenceToggle.addEventListener('change', (e) => {
                window.useTurbulenceMode = e.target.checked;
            });
        }
        // Micro Detail toggle
        const microDetailToggle = document.getElementById('microDetailToggle');
        const microDetailPanel = document.getElementById('microDetailPanel');
        if (microDetailToggle) {
            // Last non-zero values from toggle-off, restored on toggle-on so
            // cycling the toggle doesn't discard what the user dialed in
            let mdRemembered = null;
            const applyMicroDetail = (vals) => {
                Object.entries(vals).forEach(([id, val]) => {
                    config[id.toUpperCase()] = val;
                    const sl = document.getElementById(id);
                    if (sl) { sl.value = val; sl.style.setProperty('--val', val); }
                    const sp = document.getElementById(id + 'Value');
                    if (sp) sp.textContent = val.toFixed(2);
                });
            };
            microDetailToggle.addEventListener('change', (e) => {
                const on = e.target.checked;
                if (microDetailPanel) microDetailPanel.style.display = on ? '' : 'none';
                if (!on) {
                    if (config.CLARITY > 0 || config.VIBRANCE > 0) {
                        mdRemembered = { clarity: config.CLARITY, vibrance: config.VIBRANCE };
                    }
                    applyMicroDetail({ clarity: 0, vibrance: 0 });
                } else {
                    applyMicroDetail(mdRemembered || { clarity: 0.35, vibrance: 0.25 });
                }
            });
        }
        // Sunrays toggle
        const sunraysToggle = document.getElementById('sunraysToggle');
        const sunraysPanel = document.getElementById('sunraysPanel');
        if (sunraysToggle) {
            sunraysToggle.addEventListener('change', (e) => {
                const on = e.target.checked;
                config.SUNRAYS = on;
                if (sunraysPanel) sunraysPanel.style.display = on ? '' : 'none';
            });
        }
        // Sunrays slider
        const sunraysWeightSlider = document.getElementById('sunraysWeight');
        if (sunraysWeightSlider) {
            sunraysWeightSlider.addEventListener('input', (e) => {
                config.SUNRAYS_WEIGHT = parseFloat(e.target.value);
                const sp = document.getElementById('sunraysWeightValue');
                if (sp) sp.textContent = parseFloat(e.target.value).toFixed(1);
            });
        }
        // DEBUG: Pointer leave tracking removed for performance
        // Background color picker
        const backgroundColorPicker = document.getElementById('backgroundColorPicker');
        let lastBackgroundColor = '#000000';
        if (backgroundColorPicker) {
            lastBackgroundColor = backgroundColorPicker.value || '#000000';
            backgroundColorPicker.addEventListener('input', (e) => {
                const color = e.target.value;
                lastBackgroundColor = color;
                if (!document.body.classList.contains('transparent-mode')) {
                    canvasArea.style.backgroundColor = color;
                }
            });
        }
        // Canvas opacity slider (for layer visibility)
        const canvasOpacitySlider = document.getElementById('canvasOpacity');
        const opacityValueDisplay = document.getElementById('opacityValue');
        if (canvasOpacitySlider) {
            canvasOpacitySlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                const opacity = value / 100;
                canvas.style.opacity = opacity;
                opacityValueDisplay.textContent = `${value}%`;
            });
        }
        // Preserve fluid opacity checkbox ("Empty Alpha Locked")
        const preserveFluidOpacityCheckbox = document.getElementById('preserveFluidOpacity');
        window.preserveFluidOpacity = preserveFluidOpacityCheckbox ? !!preserveFluidOpacityCheckbox.checked : true;
        if (preserveFluidOpacityCheckbox) {
            preserveFluidOpacityCheckbox.addEventListener('change', (e) => {
                window.preserveFluidOpacity = e.target.checked;
            });
        }
        // Display shading (Pavel-style pseudo-normal lighting)
        window.displayShading = 0.0;
        const shadingToggle = document.getElementById('displayShadingToggle');
        const shadingSlider = document.getElementById('shadingIntensity');
        const shadingValue = document.getElementById('shadingIntensityValue');
        const shadingGroup = document.getElementById('shadingIntensityGroup');
        if (shadingToggle) {
            shadingToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    window.displayShading = parseFloat(shadingSlider ? shadingSlider.value : 0.8);
                    if (shadingGroup) shadingGroup.style.display = '';
                } else {
                    window.displayShading = 0.0;
                    if (shadingGroup) shadingGroup.style.display = 'none';
                }
            });
        }
        if (shadingSlider) {
            shadingSlider.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                window.displayShading = v;
                if (shadingValue) shadingValue.textContent = v.toFixed(1);
            });
        }
        // Capture dimming slider (controls background transparency)
        window.backgroundTransparency = 0.8; // Default 80%
        const captureDimmingSlider = document.getElementById('captureDimming');
        const dimmingValueDisplay = document.getElementById('dimmingValue');
        if (captureDimmingSlider) {
            captureDimmingSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                window.backgroundTransparency = value / 100; // Convert to 0-1 range
                dimmingValueDisplay.textContent = `${value}%`;
            });
        }
        // Multiplier slider
        const multiplierSlider = document.getElementById('multiplier');
        const multiplierValue = document.getElementById('multiplierValue');
        if (multiplierSlider) {
            multiplierSlider.addEventListener('input', (e) => {
                animationMultiplier = parseInt(e.target.value);
                window.animationMultiplier = animationMultiplier; // Expose for stats
                multiplierValue.textContent = animationMultiplier + 'x';
            });
        }
        // Time Scale slider
        const timeScaleSlider = document.getElementById('timeScale');
        const timeScaleValueEl = document.getElementById('timeScaleValue');
        window.timeScale = 1.0;
        if (timeScaleSlider) {
            timeScaleSlider.addEventListener('input', (e) => {
                window.timeScale = parseFloat(e.target.value);
                if (timeScaleValueEl) timeScaleValueEl.textContent = window.timeScale.toFixed(2) + 'x';
            });
        }
        // Hotkeys: 1-8 set Multiplier 1x-8x
        function setMultiplierHotkey(val) {
            const n = Math.max(1, Math.min(8, parseInt(val)));
            if (!Number.isFinite(n)) return;
            animationMultiplier = n;
            window.animationMultiplier = n;
            if (multiplierSlider) {
                multiplierSlider.value = String(n);
                try { multiplierSlider.style.setProperty('--val', n); } catch (_) {}
            }
            if (multiplierValue) multiplierValue.textContent = n + 'x';
        }
        document.addEventListener('keydown', (e) => {
            // Ignore when typing in inputs/textareas or contenteditable
            const t = e.target;
            const tag = t && t.tagName ? t.tagName.toUpperCase() : '';
            const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable);
            if (isEditable) return;
            const code = e.code;
            if (code && (code.startsWith('Digit') || code.startsWith('Numpad'))) {
                const d = code.replace(/^(Digit|Numpad)/, '');
                const num = parseInt(d, 10);
                if (num >= 1 && num <= 8) {
                    e.preventDefault();
                    setMultiplierHotkey(num);
                }
            }
        });
        // Expose initial value
        window.animationMultiplier = animationMultiplier;
