// ═══════════════════════════════════════════════════════════════════
// js/04b-presets.js — part 2/7 of former 04-ui-interactions.js (lines 271–454)
// LOAD ORDER: after 04a-canvas-gl-config.js, before 04c-anim-burst.js
// PROVIDES: built-in presets, window.applyPreset (registry-clamped), updatePresetButtons, clearActivePreset, window.toggleFreeze
// REQUIRES: config/gl (04a), ParamRegistry (01a), QualityGovernor (08a, guarded)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        const presets = {

            silky: { DENSITY_DISSIPATION: 0.9995, VELOCITY_DISSIPATION: 1.0001, PRESSURE_DISSIPATION: 0.8, PRESSURE_ITERATIONS: 20, CURL: 30, SPLAT_RADIUS: 0.011 },

            thick: { DENSITY_DISSIPATION: 0.999, VELOCITY_DISSIPATION: 0.99, PRESSURE_DISSIPATION: 0.95, PRESSURE_ITERATIONS: 35, CURL: 1, SPLAT_RADIUS: 0.015 },  // Was 120

            wispy: { DENSITY_DISSIPATION: 0.9972, VELOCITY_DISSIPATION: 0.9996, PRESSURE_DISSIPATION: 0.92, PRESSURE_ITERATIONS: 25, CURL: 60, SPLAT_RADIUS: 0.01 },  // Was 40

            chaotic: { DENSITY_DISSIPATION: 0.996, VELOCITY_DISSIPATION: 0.9938, PRESSURE_DISSIPATION: 0.934, PRESSURE_ITERATIONS: 25, CURL: 12, SPLAT_RADIUS: 0.0151 },

            ethereal: { DENSITY_DISSIPATION: 0.9998, VELOCITY_DISSIPATION: 1.0005, PRESSURE_DISSIPATION: 0.75, PRESSURE_ITERATIONS: 15, CURL: 45, SPLAT_RADIUS: 0.008 },

            turbulent: { DENSITY_DISSIPATION: 0.994, VELOCITY_DISSIPATION: 0.997, PRESSURE_DISSIPATION: 0.88, PRESSURE_ITERATIONS: 30, CURL: 55, SPLAT_RADIUS: 0.013 },  // Was 60

            marble: { DENSITY_DISSIPATION: 0.9992, VELOCITY_DISSIPATION: 0.9985, PRESSURE_DISSIPATION: 0.98, PRESSURE_ITERATIONS: 35, CURL: 8, SPLAT_RADIUS: 0.018 },  // Was 100

            electric: { DENSITY_DISSIPATION: 0.9965, VELOCITY_DISSIPATION: 1.0008, PRESSURE_DISSIPATION: 0.82, PRESSURE_ITERATIONS: 25, CURL: 52, SPLAT_RADIUS: 0.006 }  // Was 35

        };

        

        window.applyPreset = (name) => {

            const preset = presets[name];

            if (!preset) return;



            activePreset = name;



            // Instant application — clamped through the param registry

            const safePreset = (window.ParamRegistry && window.ParamRegistry.clampConfigObject)

                ? window.ParamRegistry.clampConfigObject(preset)

                : preset;

            Object.assign(config, safePreset);

            if (window.QualityGovernor) window.QualityGovernor.reset();

            

            // Single DOM update

            updateSliderValues();

            

            // Update button states

            updatePresetButtons();

            

            // Deactivate performance profile — style preset overrides profile settings

            if (typeof window.clearActiveProfile === 'function') window.clearActiveProfile();



            // Broadcast to multiplayer clients

            if (typeof broadcastPreset === 'function') {

                broadcastPreset(name);

            }

        };

        

        function updatePresetButtons() {

            const presetContainer = document.querySelector('.presets');

            if (!presetContainer) return;

            

            const buttons = presetContainer.querySelectorAll('button');

            buttons.forEach(btn => {

                const presetName = btn.textContent.trim().toLowerCase();

                if (presetName === activePreset) {

                    btn.classList.add('active');

                } else {

                    btn.classList.remove('active');

                }

            });

        }

        

        // Clear active preset when user manually changes settings

        function clearActivePreset() {

            if (activePreset) {

                activePreset = null;

                updatePresetButtons();

            }

        }

        

        // Expose to window for slider listeners

        window.clearActivePreset = clearActivePreset;

        

        window.toggleFreeze = () => {

            const freezeBtn = document.getElementById('freezeBtn');

            // State lives in the .active class (button shows a constant 🛑 icon)

            const isUnfreezing = freezeBtn.classList.contains('active');

            freezeBtn.title = isUnfreezing ? 'Freeze fluid motion' : 'Unfreeze fluid motion';

            if (isUnfreezing) {

                freezeBtn.classList.remove('active');

            } else {

                freezeBtn.classList.add('active');

            }

            

            // Explicit flag for the advection shader: freeze preserves artwork
            // (skips obstacle drain + stillness boost), unlike a user-set
            // density of 1.0 which should still drain near collision masks.

            window.__fluidFrozen = !isUnfreezing;

            if (!isUnfreezing) {

                // Freeze: save current values and set to freeze state

                savedDensity = config.DENSITY_DISSIPATION;

                savedVelocity = config.VELOCITY_DISSIPATION;

                config.DENSITY_DISSIPATION = 1.0;

                config.VELOCITY_DISSIPATION = 0.9;

            } else {

                // Unfreeze: restore saved values

                config.DENSITY_DISSIPATION = savedDensity;

                config.VELOCITY_DISSIPATION = savedVelocity;

            }

            

            // Single DOM update

            updateSliderValues();

        };

        

