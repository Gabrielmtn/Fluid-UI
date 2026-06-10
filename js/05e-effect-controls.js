// ═══════════════════════════════════════════════════════════════════
// js/05e-effect-controls.js — part 5/14 of former 05-fluid-sim.js (lines 1741–1965)
// LOAD ORDER: after 05d-input-replay.js, before 05f-kaleido-controls.js
// PROVIDES: turbulence/microDetail/sunrays/spin control wiring, background color, canvas opacity, display shading, capture dimming, multiplier, timeScale, setMultiplierHotkey
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
            microDetailToggle.addEventListener('change', (e) => {
                const on = e.target.checked;
                if (microDetailPanel) microDetailPanel.style.display = on ? '' : 'none';
                if (!on) {
                    // Reset to zero when disabled
                    config.CLARITY = 0;
                    config.VIBRANCE = 0;
                    ['clarity', 'vibrance'].forEach(id => {
                        const sl = document.getElementById(id);
                        if (sl) { sl.value = 0; sl.style.setProperty('--val', 0); }
                        const sp = document.getElementById(id + 'Value');
                        if (sp) sp.textContent = '0.00';
                    });
                } else {
                    // Set sensible defaults on enable
                    const defaults = { clarity: 0.35, vibrance: 0.25 };
                    Object.entries(defaults).forEach(([id, val]) => {
                        config[id.toUpperCase()] = val;
                        const sl = document.getElementById(id);
                        if (sl) { sl.value = val; sl.style.setProperty('--val', val); }
                        const sp = document.getElementById(id + 'Value');
                        if (sp) sp.textContent = val.toFixed(2);
                    });
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
        // ── Spin (Balatro idea) effect controls ──
        window.spinEffect = window.spinEffect || {
            enabled: false,
            spinSpeed: 7.0, spinRotation: -2.0, contrast: 3.5,
            lighting: 0.4, spinAmount: 0.25, pixelFilter: 745.0,
            spinEase: 1.0, opacity: 1.0,
            colour1: [0.871, 0.267, 0.231, 1.0],
            colour2: [0.0,   0.420, 0.706, 1.0],
            colour3: [0.086, 0.137, 0.145, 1.0]
        };
        function hexToRgb01(hex) {
            const h = hex.replace('#', '');
            return [
                parseInt(h.slice(0,2), 16) / 255,
                parseInt(h.slice(2,4), 16) / 255,
                parseInt(h.slice(4,6), 16) / 255,
                1.0
            ];
        }
        const spinToggleEl = document.getElementById('spinToggle');
        const spinPanelEl  = document.getElementById('spinPanel');
        if (spinToggleEl) {
            spinToggleEl.addEventListener('change', (e) => {
                window.spinEffect.enabled = e.target.checked;
                if (spinPanelEl) spinPanelEl.style.display = e.target.checked ? '' : 'none';
                try { window.settingsManager && window.settingsManager.set('spinEffect.enabled', e.target.checked); } catch(_){}
            });
        }
        const spinSpeedEl = document.getElementById('spinSpeed');
        if (spinSpeedEl) { spinSpeedEl.addEventListener('input', (e) => { const v = parseFloat(e.target.value); window.spinEffect.spinSpeed = v; const d = document.getElementById('spinSpeedValue'); if(d) d.textContent = v.toFixed(1); }); }
        const spinRotationEl = document.getElementById('spinRotation');
        if (spinRotationEl) { spinRotationEl.addEventListener('input', (e) => { const v = parseFloat(e.target.value); window.spinEffect.spinRotation = v; const d = document.getElementById('spinRotationValue'); if(d) d.textContent = v.toFixed(1); }); }
        const spinContrastEl = document.getElementById('spinContrast');
        if (spinContrastEl) { spinContrastEl.addEventListener('input', (e) => { const v = parseFloat(e.target.value); window.spinEffect.contrast = v; const d = document.getElementById('spinContrastValue'); if(d) d.textContent = v.toFixed(1); }); }
        const spinLightingEl = document.getElementById('spinLighting');
        if (spinLightingEl) { spinLightingEl.addEventListener('input', (e) => { const v = parseFloat(e.target.value); window.spinEffect.lighting = v; const d = document.getElementById('spinLightingValue'); if(d) d.textContent = v.toFixed(2); }); }
        const spinAmountEl = document.getElementById('spinAmount');
        if (spinAmountEl) { spinAmountEl.addEventListener('input', (e) => { const v = parseFloat(e.target.value); window.spinEffect.spinAmount = v; const d = document.getElementById('spinAmountValue'); if(d) d.textContent = v.toFixed(2); }); }
        const spinPixelFilterEl = document.getElementById('spinPixelFilter');
        if (spinPixelFilterEl) { spinPixelFilterEl.addEventListener('input', (e) => { const v = parseFloat(e.target.value); window.spinEffect.pixelFilter = v; const d = document.getElementById('spinPixelFilterValue'); if(d) d.textContent = Math.round(v).toString(); }); }
        const spinEaseEl = document.getElementById('spinEase');
        if (spinEaseEl) { spinEaseEl.addEventListener('input', (e) => { const v = parseFloat(e.target.value); window.spinEffect.spinEase = v; const d = document.getElementById('spinEaseValue'); if(d) d.textContent = v.toFixed(1); }); }
        const spinMixEl = document.getElementById('spinMix');
        if (spinMixEl) { spinMixEl.addEventListener('input', (e) => { const v = parseFloat(e.target.value); window.spinEffect.opacity = v; const d = document.getElementById('spinMixValue'); if(d) d.textContent = v.toFixed(2); }); }
        const spinColour1El = document.getElementById('spinColour1');
        if (spinColour1El) { spinColour1El.addEventListener('input', (e) => { window.spinEffect.colour1 = hexToRgb01(e.target.value); }); }
        const spinColour2El = document.getElementById('spinColour2');
        if (spinColour2El) { spinColour2El.addEventListener('input', (e) => { window.spinEffect.colour2 = hexToRgb01(e.target.value); }); }
        const spinColour3El = document.getElementById('spinColour3');
        if (spinColour3El) { spinColour3El.addEventListener('input', (e) => { window.spinEffect.colour3 = hexToRgb01(e.target.value); }); }
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
