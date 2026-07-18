// ═══════════════════════════════════════════════════════════════════
// js/05h-slider-bindings.js — part 8/14 of former 05-fluid-sim.js (lines 2440–2941)
// LOAD ORDER: after 05g-arm-colors.js, before 05i-sim-stats.js
// PROVIDES: sliderConfig (registry-derived), brushSize, transparentMode, resolution selects, density snap, loadSavedSliderValues, updateSliderValues
// REQUIRES: ParamRegistry (01a), config (04), initFramebuffers (05c)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        // Derived from the param registry (single source of truth); the
        // object literal fallback matches the registry's simSlider entries.
        const sliderConfig = (window.ParamRegistry && window.ParamRegistry.toSliderConfig)
            ? window.ParamRegistry.toSliderConfig()
            : {
                densityDissipation: { key: 'DENSITY_DISSIPATION', decimals: 4 },
                velocityDissipation: { key: 'VELOCITY_DISSIPATION', decimals: 4 },
                pressureDissipation: { key: 'PRESSURE_DISSIPATION', decimals: 3 },
                pressureIteration: { key: 'PRESSURE_ITERATIONS', decimals: 0 },
                velocityInfluence: { key: 'VELOCITY_INFLUENCE', decimals: 3 },
                curl: { key: 'CURL', decimals: 0 },
                sharpness: { key: 'SHARPNESS', decimals: 1 },
                clarity: { key: 'CLARITY', decimals: 2 },
                vibrance: { key: 'VIBRANCE', decimals: 2 }
            };
        const brushSizeSlider = document.getElementById('brushSize');
        brushSizeSlider.addEventListener('input', (e) => {
            config.SPLAT_RADIUS = e.target.value / 1000;
        });
        // Transparent Mode checkbox (controls canvas-area transparency)
        const transparentModeCheckbox = document.getElementById('transparentMode');
        if (transparentModeCheckbox) {
            const applyTransparentMode = (enabled) => {
                if (enabled) {
                    document.body.classList.add('transparent-mode');
                    canvasArea.style.backgroundColor = 'transparent';
                } else {
                    document.body.classList.remove('transparent-mode');
                    const color = (backgroundColorPicker && backgroundColorPicker.value) || lastBackgroundColor || '#000000';
                    canvasArea.style.backgroundColor = color;
                }
            };
            transparentModeCheckbox.addEventListener('change', (e) => {
                applyTransparentMode(e.target.checked);
                // Save to settings
                if (window.Settings && typeof window.Settings.saveCheckbox === 'function') {
                    window.Settings.saveCheckbox('transparentMode', e.target.checked);
                }
            });
            // Load saved value
            if (window.Settings && typeof window.Settings.loadCheckbox === 'function') {
                const saved = window.Settings.loadCheckbox('transparentMode', false);
                transparentModeCheckbox.checked = saved;
                applyTransparentMode(saved);
            } else {
                // Ensure initial background matches picker when no settings are available
                if (canvasArea && backgroundColorPicker && !transparentModeCheckbox.checked) {
                    canvasArea.style.backgroundColor = backgroundColorPicker.value;
                }
            }
        }
        // Gate = no overflows, ever. Two clamps, no automatic motion:
        // (1) splat shader locks new dye at the stroke's own color, so
        //     repeated paint in one spot can't stack into white;
        // (2) advection shader caps the dominant channel at 3.0 (hue-
        //     preserving), so a user-set density above 1.0 blooms into the
        //     vibrant HDR zone and saturates there instead of whiting out.
        // Density dissipation itself stays entirely under user control.
        function applyGateState(on) {
            config.COLOR_GATE = on;
            config.BLOOM_CEILING = on ? (typeof window.gateMaxDensity === 'number' ? window.gateMaxDensity : 3.0) : 0;
        }
        window.applyGateState = applyGateState;
        const colorGateCheckbox = document.getElementById('colorGate');
        if (colorGateCheckbox) {
            colorGateCheckbox.addEventListener('change', (e) => {
                applyGateState(e.target.checked);
                if (window.Settings && typeof window.Settings.saveCheckbox === 'function') {
                    window.Settings.saveCheckbox('colorGate', e.target.checked);
                }
            });
            if (window.Settings && typeof window.Settings.loadCheckbox === 'function') {
                const savedGate = window.Settings.loadCheckbox('colorGate', false);
                colorGateCheckbox.checked = savedGate;
                applyGateState(savedGate);
            }
        }
        // Resolution dropdowns (absolute resolution, independent of display canvas size)
        // Set a resolution <select> to a value, INJECTING it as an option if it isn't
        // one of the presets. The FPS-adaptive tier may use non-standard
        // resolutions (dye 1536, sim 192); the markup has no 'custom' option or input,
        // so the old code set value='custom' and left the dropdown BLANK ("not
        // initializing properly"). Injecting keeps the dropdown showing the real value.
        window.setResolutionDropdown = function (sel, value) {
            if (!sel) return;
            var v = String(value);
            var has = false;
            for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].value === v) { has = true; break; } }
            if (!has) {
                var prev = sel.querySelector('option[data-injected]');
                if (prev) prev.remove();
                var opt = document.createElement('option');
                opt.value = v;
                opt.textContent = v + ' (custom)';
                opt.setAttribute('data-injected', '1');
                sel.appendChild(opt);
            }
            sel.value = v;
        };

        const visualResSel = document.getElementById('visualResolution');
        const visualResCustom = document.getElementById('visualResolutionCustom');
        if (visualResSel) {
            window.setResolutionDropdown(visualResSel, config.DYE_RESOLUTION);
            visualResSel.addEventListener('change', (e) => {
                if (e.target.value === 'custom') {
                    if (visualResCustom) {
                        visualResCustom.style.display = 'block';
                        // Restore from session or use current
                        const sessionVal = window.settingsManager?.getSession('temp.visualResolutionCustom');
                        visualResCustom.value = sessionVal || config.DYE_RESOLUTION;
                        visualResCustom.focus();
                    }
                } else {
                    if (visualResCustom) visualResCustom.style.display = 'none';
                    const v = parseInt(e.target.value, 10);
                    if (isFinite(v)) {
                        config.DYE_RESOLUTION = v;
                        window.needsFramebufferReinit = true;
                    }
                }
            });
            if (visualResCustom) {
                visualResCustom.addEventListener('input', (e) => {
                    const v = parseInt(e.target.value, 10);
                    if (isFinite(v) && v >= 64) {
                        config.DYE_RESOLUTION = v;
                        window.needsFramebufferReinit = true;
                        // Save to session storage
                        window.settingsManager?.setSession('temp.visualResolutionCustom', v);
                    }
                });
            }
        }
        const physicsResSel = document.getElementById('physicsResolution');
        const physicsResCustom = document.getElementById('physicsResolutionCustom');
        if (physicsResSel) {
            window.setResolutionDropdown(physicsResSel, config.SIM_RESOLUTION);
            physicsResSel.addEventListener('change', (e) => {
                if (e.target.value === 'custom') {
                    if (physicsResCustom) {
                        physicsResCustom.style.display = 'block';
                        // Restore from session or use current
                        const sessionVal = window.settingsManager?.getSession('temp.physicsResolutionCustom');
                        physicsResCustom.value = sessionVal || config.SIM_RESOLUTION;
                        physicsResCustom.focus();
                    }
                } else {
                    if (physicsResCustom) physicsResCustom.style.display = 'none';
                    const v = parseInt(e.target.value, 10);
                    if (isFinite(v)) {
                        config.SIM_RESOLUTION = v;
                        window.needsFramebufferReinit = true;
                    }
                }
            });
            if (physicsResCustom) {
                physicsResCustom.addEventListener('input', (e) => {
                    const v = parseInt(e.target.value, 10);
                    if (isFinite(v) && v >= 16) {
                        config.SIM_RESOLUTION = v;
                        window.needsFramebufferReinit = true;
                        // Save to session storage
                        window.settingsManager?.setSession('temp.physicsResolutionCustom', v);
                    }
                });
            }
        }
        // Scrollwheel to adjust brush size, density (Shift), or motion isolation (Ctrl+Shift) on canvas area
        let lastDensitySnapTime = 0;
        canvasArea.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.ctrlKey && e.shiftKey) {
                // Ctrl+Shift+Scroll: Adjust Motion Isolation (Velocity Influence)
                // Uses eased acceleration: faster scroll = bigger jumps
                const velSlider = document.getElementById('velocityInfluence');
                const velValueSpan = document.getElementById('velocityInfluenceValue');
                if (velSlider) {
                    let currentValue = parseFloat(velSlider.value);
                    const minValue = parseFloat(velSlider.min);
                    const maxValue = parseFloat(velSlider.max);
                    const range = maxValue - minValue;
                    // Eased step: base 0.1 + acceleration from scroll speed
                    // deltaY is typically 100-150 for normal scroll, higher for fast scroll
                    const scrollMagnitude = Math.min(Math.abs(e.deltaY) / 100, 3); // Cap at 3x
                    const easedStep = 0.1 + (scrollMagnitude - 1) * 0.15; // 0.1 to 0.4 range
                    const stepSize = easedStep * (range / 4); // Scale to slider range
                    let newValue;
                    if (e.deltaY < 0) {
                        newValue = Math.min(currentValue + stepSize, maxValue);
                    } else {
                        newValue = Math.max(currentValue - stepSize, minValue);
                    }
                    // Update slider and config
                    velSlider.value = String(newValue);
                    velSlider.style.setProperty('--val', newValue);
                    config.VELOCITY_INFLUENCE = newValue;
                    if (velValueSpan) velValueSpan.textContent = newValue.toFixed(3);
                }
            } else if (e.ctrlKey && e.altKey) {
                // Ctrl+Alt+Scroll: Adjust Curl (raw CURL only — in material mode
                // the slider is a macro and this shortcut would desync it)
                const cSlider = document.getElementById('curl');
                const cSpan = document.getElementById('curlValue');
                if (cSlider && !(window.MaterialModes && window.MaterialModes.active())) {
                    let currentValue = parseFloat(cSlider.value);
                    const minValue = parseFloat(cSlider.min);
                    const maxValue = parseFloat(cSlider.max);
                    const stepSize = parseFloat(cSlider.step) || 1;
                    let newValue;
                    if (e.deltaY < 0) {
                        newValue = currentValue + stepSize;
                        if (newValue > maxValue) newValue = maxValue;
                    } else {
                        newValue = currentValue - stepSize;
                        if (newValue < minValue) newValue = minValue;
                    }
                    cSlider.value = String(newValue);
                    cSlider.style.setProperty('--val', newValue);
                    config.CURL = newValue;
                    if (cSpan) cSpan.textContent = newValue.toFixed(0);
                }
            } else if (e.altKey && e.shiftKey) {
                // Alt+Shift+Scroll: Adjust Velocity Sustain (Velocity Dissipation) with higher sensitivity
                const vSlider = document.getElementById('velocityDissipation');
                const vSpan = document.getElementById('velocityValue');
                if (vSlider) {
                    let currentValue = parseFloat(vSlider.value);
                    const minValue = parseFloat(vSlider.min);
                    const maxValue = parseFloat(vSlider.max);
                    const baseStep = parseFloat(vSlider.step) || 0.0001;
                    const stepSize = baseStep * 10; // faster changes via scroll
                    let newValue;
                    if (e.deltaY < 0) {
                        // Scrolling up - increase sustain
                        newValue = currentValue + stepSize;
                        if (newValue > maxValue) newValue = maxValue;
                    } else {
                        // Scrolling down - decrease sustain
                        newValue = currentValue - stepSize;
                        if (newValue < minValue) newValue = minValue;
                    }
                    // Update slider and config
                    vSlider.value = String(newValue);
                    vSlider.style.setProperty('--val', newValue);
                    config.VELOCITY_DISSIPATION = newValue;
                    if (vSpan) vSpan.textContent = newValue.toFixed(4);
                }
            } else if (e.shiftKey) {
                // Shift+Scroll: Adjust density (less sensitive) with momentary stick at 1.0
                const densitySlider = document.getElementById('densityDissipation');
                const densityValueSpan = document.getElementById('densityValue');
                let currentValue = parseFloat(densitySlider.value);
                const minValue = parseFloat(densitySlider.min);
                const maxValue = parseFloat(densitySlider.max);
                const stepSize = 0.001; // reduced sensitivity
                // Stick parameters (reuse lastDensitySnapTime)
                const stickTarget = 1.0;
                const stickCooldown = 1500; // ms window to prevent overshoot past 1.0
                const now = Date.now();
                const stickActive = (now - lastDensitySnapTime) < stickCooldown;
                let newValue;
                if (e.deltaY < 0) {
                    // Scrolling up - increase density
                    newValue = currentValue + stepSize;
                    if (newValue > maxValue) newValue = maxValue;
                } else {
                    // Scrolling down - decrease density
                    newValue = currentValue - stepSize;
                    if (newValue < minValue) newValue = minValue;
                }
                // Momentary stick: simple debounce at 1.0 for stickCooldown ms
                if (!stickActive && newValue >= stickTarget) {
                    newValue = stickTarget;
                    lastDensitySnapTime = now; // start stick window
                } else if (stickActive) {
                    newValue = stickTarget; // hold at 1.0 until cooldown expires
                }
                // Update slider and config
                densitySlider.value = newValue;
                densitySlider.style.setProperty('--val', newValue);
                config.DENSITY_DISSIPATION = newValue;
                densityValueSpan.textContent = newValue.toFixed(4);
                // Auto-wipe simulation when density sustain gets very low
                if (newValue < 0.88) {
                    wipeSimulation();
                }
            } else {
                // Normal scroll: Adjust brush size with smooth proportional steps
                const brushSizeSlider = document.getElementById('brushSize');
                const currentValue = parseFloat(brushSizeSlider.value);
                const minValue = parseFloat(brushSizeSlider.min);
                const maxValue = parseFloat(brushSizeSlider.max);
                // Proportional step: ~8% of current value, clamped to [0.1, 2.0]
                // Gives fine control at small sizes, snappier at large sizes
                const scrollSpeed = Math.min(Math.abs(e.deltaY) / 100, 2); // 1–2× from scroll velocity
                const stepSize = Math.max(0.1, Math.min(currentValue * 0.08 * scrollSpeed, 2.0));
                let newValue;
                if (e.deltaY < 0) {
                    newValue = Math.min(currentValue + stepSize, maxValue);
                } else {
                    newValue = Math.max(currentValue - stepSize, minValue);
                }
                // Round to one decimal for clean slider display
                newValue = Math.round(newValue * 10) / 10;
                brushSizeSlider.value = newValue;
                brushSizeSlider.style.setProperty('--val', newValue);
                config.SPLAT_RADIUS = newValue / 1000;
            }
        }, { passive: false });
        // Magnetic snap state for density slider
        let densitySnapTimeout = null;
        let densityLastValue = null;
        let densityIsSnapped = false;
        Object.entries(sliderConfig).forEach(([id, cfg]) => {
            const slider = document.getElementById(id);
            if (!slider) return; // Skip if slider doesn't exist
            // Map slider IDs to their value span IDs
            const valueSpanMap = {
                'densityDissipation': 'densityValue',
                'velocityDissipation': 'velocityValue',
                'pressureDissipation': 'pressureValue',
                'pressureIteration': 'iterationValue',
                'velocityInfluence': 'velocityInfluenceValue',
                'curl': 'curlValue',
                'sharpness': 'sharpnessValue',
                'clarity': 'clarityValue',
                'vibrance': 'vibranceValue'
            };
            const valueSpanId = valueSpanMap[id] || (id + 'Value');
            const valueSpan = document.getElementById(valueSpanId);
            slider.addEventListener('input', (e) => {
                // 13.5: settings locked by the multiplayer host — swallow local
                // edits on registry-bound sim sliders (host's snapshot re-syncs
                // the thumb). Painting controls (brushSize etc.) are unaffected.
                if (window.__mpSettingsLocked && !window.__mpApplyingRemote) {
                    e.stopImmediatePropagation();
                    return;
                }
                let val = parseFloat(e.target.value);
                // Clear active preset and performance profile when manually adjusting sliders
                // (skip if a profile is currently being applied programmatically)
                if (!window._profileApplying) {
                    if (typeof window.clearActivePreset === 'function') {
                        window.clearActivePreset();
                    }
                }
                // Material modes own the curl slider when a material is selected:
                // the value is a macro amount, not CURL — delegate and skip the
                // direct config write below. Exception: a profile being applied
                // writes raw CURL values, so material mode yields to it.
                if (id === 'curl' && window.MaterialModes && window.MaterialModes.active()) {
                    if (window._profileApplying) {
                        window.MaterialModes.yieldToExternal();
                        // fall through: treat the value as raw CURL again
                    } else {
                        window.MaterialModes.onSlider(val);
                        if (valueSpan) valueSpan.textContent = window.MaterialModes.displayValue();
                        return;
                    }
                }
                // Magnetic snap to 1.0 for density slider
                if (id === 'densityDissipation') {
                    const snapTarget = 1.0;
                    const snapRange = 0.003; // How close you need to be to snap
                    const pushThrough = 0.008; // How far you need to push to break free
                    // Clear any pending snap timeout
                    if (densitySnapTimeout) {
                        clearTimeout(densitySnapTimeout);
                        densitySnapTimeout = null;
                    }
                    // Check if we're in the snap zone
                    if (Math.abs(val - snapTarget) < snapRange && !densityIsSnapped) {
                        // Snap to 1.0
                        val = snapTarget;
                        slider.value = snapTarget;
                        slider.style.setProperty('--val', snapTarget);
                        densityIsSnapped = true;
                        // Set a timeout to allow breaking free
                        densitySnapTimeout = setTimeout(() => {
                            densityIsSnapped = false;
                        }, 300); // 300ms to push through
                    } else if (densityIsSnapped && Math.abs(val - snapTarget) > pushThrough) {
                        // User pushed through the snap
                        densityIsSnapped = false;
                    } else if (densityIsSnapped && densityLastValue !== null) {
                        // While snapped, resist small movements
                        if (Math.abs(val - snapTarget) < pushThrough) {
                            val = snapTarget;
                            slider.value = snapTarget;
                            slider.style.setProperty('--val', snapTarget);
                        }
                    }
                    densityLastValue = val;
                }
                config[cfg.key] = cfg.decimals === 0 ? parseInt(val) : val;
                if (valueSpan) {
                    valueSpan.textContent = cfg.decimals === 0 ? val : val.toFixed(cfg.decimals);
                }
                // Auto-wipe simulation when density sustain gets very low
                if (id === 'densityDissipation' && val < 0.88) {
                    wipeSimulation();
                }
            });
            // Reset snap state when user releases the slider
            if (id === 'densityDissipation') {
                slider.addEventListener('mouseup', () => {
                    if (densitySnapTimeout) {
                        clearTimeout(densitySnapTimeout);
                        densitySnapTimeout = null;
                    }
                    densityIsSnapped = false;
                    densityLastValue = null;
                });
                slider.addEventListener('touchend', () => {
                    if (densitySnapTimeout) {
                        clearTimeout(densitySnapTimeout);
                        densitySnapTimeout = null;
                    }
                    densityIsSnapped = false;
                    densityLastValue = null;
                });
            }
        });
        // Load saved slider values from Settings
        function loadSavedSliderValues() {
            if (!window.Settings || typeof window.Settings.loadSlider !== 'function') return;
            // Session/settings restore writes raw sim params — material mode yields
            if (window.MaterialModes && window.MaterialModes.active()) window.MaterialModes.yieldToExternal();
            // Load main sliders
            Object.entries(sliderConfig).forEach(([id, cfg]) => {
                const savedValue = window.Settings.loadSlider(id, null);
                if (savedValue !== null) {
                    const slider = document.getElementById(id);
                    if (slider) {
                        slider.value = savedValue;
                        slider.style.setProperty('--val', savedValue);
                        config[cfg.key] = cfg.decimals === 0 ? parseInt(savedValue) : savedValue;
                        const valueSpanId = id === 'pressureIteration' ? 'iterationValue' : 
                                            id.replace('Dissipation', '') + 'Value';
                        const valueSpan = document.getElementById(valueSpanId);
                        if (valueSpan) {
                            valueSpan.textContent = cfg.decimals === 0 ? Math.round(savedValue) : savedValue.toFixed(cfg.decimals);
                        }
                    }
                }
            });
            // Load brush size
            const savedBrushSize = window.Settings.loadSlider('brushSize', null);
            if (savedBrushSize !== null && brushSizeSlider) {
                brushSizeSlider.value = savedBrushSize;
                brushSizeSlider.style.setProperty('--val', savedBrushSize);
                config.SPLAT_RADIUS = savedBrushSize / 1000;
            }
            // Load multiplier
            const savedMultiplier = window.Settings.loadSlider('multiplier', null);
            if (savedMultiplier !== null && multiplierSlider) {
                const val = parseInt(savedMultiplier);
                multiplierSlider.value = val;
                multiplierSlider.style.setProperty('--val', val);
                animationMultiplier = val;
                window.animationMultiplier = val;
                if (multiplierValue) multiplierValue.textContent = val + 'x';
            }
            // Load canvas opacity
            const savedCanvasOpacity = window.Settings.loadSlider('canvasOpacity', null);
            if (savedCanvasOpacity !== null && canvasOpacitySlider) {
                canvasOpacitySlider.value = savedCanvasOpacity;
                canvasOpacitySlider.style.setProperty('--val', savedCanvasOpacity);
                canvas.style.opacity = savedCanvasOpacity / 100;
                if (opacityValueDisplay) opacityValueDisplay.textContent = `${savedCanvasOpacity}%`;
            }
            // Load capture dimming
            const savedCaptureDimming = window.Settings.loadSlider('captureDimming', null);
            if (savedCaptureDimming !== null && captureDimmingSlider) {
                captureDimmingSlider.value = savedCaptureDimming;
                captureDimmingSlider.style.setProperty('--val', savedCaptureDimming);
                window.backgroundTransparency = savedCaptureDimming / 100;
                if (dimmingValueDisplay) dimmingValueDisplay.textContent = `${savedCaptureDimming}%`;
            }
            // Load kaleidoscope sliders
            const savedKaleidoSegments = window.Settings.loadSlider('kaleidoSegments', null);
            if (savedKaleidoSegments !== null && kaleidoSegmentsEl) {
                kaleidoSegmentsEl.value = savedKaleidoSegments;
                kaleidoSegmentsEl.style.setProperty('--val', savedKaleidoSegments);
                window.kaleidoSegments = parseInt(savedKaleidoSegments);
                if (kaleidoValueEl) kaleidoValueEl.textContent = String(savedKaleidoSegments);
            }
            const savedKAngle = window.Settings.loadSlider('kAngle', null);
            if (savedKAngle !== null && kAngleEl) {
                kAngleEl.value = savedKAngle;
                kAngleEl.style.setProperty('--val', savedKAngle);
                window.kAngle = savedKAngle * Math.PI / 180;
                if (kAngleValueEl) kAngleValueEl.textContent = savedKAngle + '°';
            }
            const savedKSpinSpeed = window.Settings.loadSlider('kSpinSpeed', null);
            if (savedKSpinSpeed !== null && kSpinSpeedEl) {
                kSpinSpeedEl.value = savedKSpinSpeed;
                kSpinSpeedEl.style.setProperty('--val', savedKSpinSpeed);
                window.kSpinSpeed = savedKSpinSpeed;
                if (kSpinSpeedValueEl) kSpinSpeedValueEl.textContent = savedKSpinSpeed + '°/s';
            }
            const savedKTwist = window.Settings.loadSlider('kTwist', null);
            if (savedKTwist !== null && kTwistEl) {
                kTwistEl.value = savedKTwist;
                kTwistEl.style.setProperty('--val', savedKTwist);
                window.kTwist = savedKTwist;
                if (kTwistValueEl) kTwistValueEl.textContent = savedKTwist.toFixed(1);
            }
            const savedKZoom = window.Settings.loadSlider('kZoom', null);
            if (savedKZoom !== null && kZoomEl) {
                kZoomEl.value = savedKZoom;
                kZoomEl.style.setProperty('--val', savedKZoom);
                window.kZoom = savedKZoom;
                if (kZoomValueEl) kZoomValueEl.textContent = savedKZoom.toFixed(2);
            }
            const savedKBlend = window.Settings.loadSlider('kBlend', null);
            if (savedKBlend !== null && kBlendEl) {
                kBlendEl.value = savedKBlend;
                kBlendEl.style.setProperty('--val', savedKBlend);
                window.kBlend = savedKBlend;
                if (kBlendValueEl) kBlendValueEl.textContent = savedKBlend.toFixed(2);
            }
        }
        // Expose loadSavedSliderValues globally so save-load.js can call it when needed
        window.loadSavedSliderValues = loadSavedSliderValues;
        function updateSliderValues() {
            // Preset/profile appliers resync sliders from config (raw CURL etc.)
            // — material mode yields rather than fight over the curl slider.
            if (window.MaterialModes && window.MaterialModes.active()) window.MaterialModes.yieldToExternal();
            Object.entries(sliderConfig).forEach(([id, cfg]) => {
                const val = config[cfg.key];
                const slider = document.getElementById(id);
                slider.value = val;
                slider.style.setProperty('--val', val);
                const valueSpanId = id === 'pressureIteration' ? 'iterationValue' : 
                                    id.replace('Dissipation', '') + 'Value';
                document.getElementById(valueSpanId).textContent = 
                    cfg.decimals === 0 ? Math.round(val) : val.toFixed(cfg.decimals);
            });
            const brushSlider = document.getElementById('brushSize');
            const brushValue = config.SPLAT_RADIUS * 1000;
            brushSlider.value = brushValue;
            brushSlider.style.setProperty('--val', brushValue);
        }
