// ═══════════════════════════════════════════════════════════════════
// js/05e-effect-controls.js — part 5/14 of former 05-fluid-sim.js (lines 1741–1965)
// LOAD ORDER: after 05d-input-replay.js, before 05f-kaleido-controls.js
// PROVIDES: turbulence/microDetail/sunrays control wiring, background color, canvas opacity, display shading, capture dimming, multiplier, timeScale, setMultiplierHotkey
// REQUIRES: config (04)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
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
        // Crisp Advection (MacCormack) toggle — checkbox follows the config
        // default (04a flips it off on mobile), then drives it on change.
        const macCormackToggle = document.getElementById('macCormackToggle');
        if (macCormackToggle) {
            macCormackToggle.checked = !!config.MACCORMACK;
            macCormackToggle.addEventListener('change', (e) => {
                config.MACCORMACK = e.target.checked;
            });
        }
        // Multigrid Pressure toggle — same pattern as Crisp Advection above.
        // The tuning panel follows the checkbox (hidden when the V-cycle is
        // off — its sliders would be dead controls on the Jacobi path).
        const multigridToggle = document.getElementById('multigridToggle');
        const multigridPanel = document.getElementById('multigridPanel');
        if (multigridToggle) {
            multigridToggle.checked = !!config.MULTIGRID;
            if (multigridPanel) multigridPanel.style.display = config.MULTIGRID ? '' : 'none';
            multigridToggle.addEventListener('change', (e) => {
                config.MULTIGRID = e.target.checked;
                if (multigridPanel) multigridPanel.style.display = e.target.checked ? '' : 'none';
            });
        }
        // Multigrid tuning sliders (V-cycle shape + smoother damping)
        [
            { id: 'mgCycles', key: 'MG_CYCLES', decimals: 0 },
            { id: 'mgPre', key: 'MG_PRE', decimals: 0 },
            { id: 'mgPost', key: 'MG_POST', decimals: 0 },
            { id: 'mgCoarse', key: 'MG_COARSE', decimals: 0 },
            { id: 'mgRelax', key: 'MG_RELAX', decimals: 2 }
        ].forEach(({ id, key, decimals }) => {
            const sl = document.getElementById(id);
            if (!sl) return;
            sl.addEventListener('input', (e) => {
                config[key] = parseFloat(e.target.value);
                const sp = document.getElementById(id + 'Value');
                if (sp) sp.textContent = parseFloat(e.target.value).toFixed(decimals);
            });
        });
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
        // Swirl slider (curl-noise micro-swirl in dye advection)
        const swirlSlider = document.getElementById('swirl');
        if (swirlSlider) {
            swirlSlider.addEventListener('input', (e) => {
                config.SWIRL = parseFloat(e.target.value);
                const sp = document.getElementById('swirlValue');
                if (sp) sp.textContent = parseFloat(e.target.value).toFixed(2);
            });
        }
        // Wetness slider (P15-1: dry paint holds, wet paint flows)
        const wetInfluenceSlider = document.getElementById('wetInfluence');
        if (wetInfluenceSlider) {
            wetInfluenceSlider.addEventListener('input', (e) => {
                config.WET_INFLUENCE = parseFloat(e.target.value);
                const sp = document.getElementById('wetInfluenceValue');
                if (sp) sp.textContent = parseFloat(e.target.value).toFixed(2);
            });
        }
        // Dry Time slider (P15-1: wetness half-life in seconds)
        const wetDryingSlider = document.getElementById('wetDrying');
        if (wetDryingSlider) {
            wetDryingSlider.addEventListener('input', (e) => {
                config.WET_DRYING = parseFloat(e.target.value);
                const sp = document.getElementById('wetDryingValue');
                if (sp) sp.textContent = parseFloat(e.target.value).toFixed(1);
            });
        }
        // Max Speed slider (velocity ceiling, canvas-widths/s — soft knee)
        const velocityCapSlider = document.getElementById('velocityCap');
        if (velocityCapSlider) {
            velocityCapSlider.addEventListener('input', (e) => {
                config.VELOCITY_CAP = parseFloat(e.target.value);
                const sp = document.getElementById('velocityCapValue');
                if (sp) sp.textContent = Math.round(parseFloat(e.target.value));
            });
        }
        // Ridges slider (sharpen kernel scale, 2048-reference texels)
        const ridgesSlider = document.getElementById('ridges');
        if (ridgesSlider) {
            ridgesSlider.addEventListener('input', (e) => {
                config.RIDGES = parseFloat(e.target.value);
                const sp = document.getElementById('ridgesValue');
                if (sp) sp.textContent = parseFloat(e.target.value).toFixed(1);
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
        // Surface Shading — Relief & Gloss (2026-07-21). The two luminance-
        // preserving shading tunables (config.SHADE_RELIEF / SHADE_GLOSS, read in
        // 05j) exposed as sliders. They live inside shadingIntensityGroup, so the
        // Surface Shading checkbox reveals/hides them alongside Intensity. Registry-
        // backed (01a) for clamp + preset persistence; wired bespoke here like
        // Intensity because they are display sliders, not simSliders (so the generic
        // registry→config binding in 05h intentionally skips them).
        const shadeReliefSlider = document.getElementById('shadeRelief');
        const shadeReliefValue = document.getElementById('shadeReliefValue');
        if (shadeReliefSlider) {
            shadeReliefSlider.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                config.SHADE_RELIEF = v;
                if (shadeReliefValue) shadeReliefValue.textContent = v.toFixed(2);
            });
        }
        const shadeGlossSlider = document.getElementById('shadeGloss');
        const shadeGlossValue = document.getElementById('shadeGlossValue');
        if (shadeGlossSlider) {
            shadeGlossSlider.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                config.SHADE_GLOSS = v;
                if (shadeGlossValue) shadeGlossValue.textContent = v.toFixed(2);
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
