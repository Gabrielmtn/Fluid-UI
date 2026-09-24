// ═══════════════════════════════════════════════════════════════════
// js/04b-presets.js — part 2/7 of former 04-ui-interactions.js (lines 271–454)
// LOAD ORDER: after 04a-canvas-gl-config.js, before 04c-anim-burst.js
// PROVIDES: built-in presets, window.applyPreset (registry-clamped), updatePresetButtons, clearActivePreset, window.toggleFreeze
// REQUIRES: config/gl (04a), ParamRegistry (01a), QualityGovernor (08a, guarded)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        // PRESSURE_DISSIPATION retune 2026-07-13: with the multigrid solve the
        // low decay values no longer double-duty as stabilizers for an
        // unconverged Jacobi — they just threw away the (now-meaningful)
        // warm-started pressure. Compressed into the 0.925–0.97 band with the
        // ORIGINAL ORDERING preserved, so each preset keeps its relative
        // character while the solve keeps its convergence. Old values in
        // comments for taste-revert.

        const presets = {

            // ── Curated looks (2026-09-12) ──────────────────────────────
            // Complete looks, not physics bundles: the ground and brush
            // colour, the swatch tray that Step cycles through, the finish
            // and (for the bloom) an eight-arm radial brush whose arms carry
            // their own colours, on top of the physics.
            // Cap Color is ON in all three: every stroke lands at its own
            // colour and stays there (hue-preserving shoulder, no white-out),
            // and the deposit goes through the gate's flow path, so the looks
            // do not move when the additive-mode share bypass gets fixed.
            // Stroke order under Step is the brush colour, then the tray from
            // its first entry: opal paints dominant, dominant, support,
            // accent; currents starts on coral so it alternates; bloom's
            // hierarchy is in the arms (emerald and turquoise alternating,
            // one coral arm), so a single gesture is already the whole look.
            // Thumbnails: scripts/bake-effect-previews.js PRESET_BAKE.
            opal: { DENSITY_DISSIPATION: 0.9992, VELOCITY_DISSIPATION: 0.9985, PRESSURE_DISSIPATION: 0.97, PRESSURE_ITERATIONS: 35, CURL: 14, SPLAT_RADIUS: 0.008,
                    ui: { checkboxes: { displayShadingToggle: true, colorGate: true, stepPalette: true, randomColor: false, glowToggle: false },
                          sliders: { shadingIntensity: 0.9, shadeRelief: 0.8, shadeGloss: 0.5, vibrance: 0.15, ridges: 0, sharpness: 0.8 },
                          colors: { background: '#080C16', brush: '#2AC9B7' },
                          savedColors: ['#2AC9B7', '#E9E3F1', '#8B72D9'],
                          armColors: [{ mode: 'step', color: '#2AC9B7', stepIndex: 0, push: false }] } },

            // Not the display kaleidoscope: Wedge mode shows a 22.5° slice of
            // the source, and anything painted there smears across it into a
            // ring. The real radial multi-brush instead — every stroke lands
            // eight times around the centre and the copies swirl into each
            // other. Motion settles fast so the petals keep their shape.
            bloom: { DENSITY_DISSIPATION: 0.9994, VELOCITY_DISSIPATION: 0.995, PRESSURE_DISSIPATION: 0.94, PRESSURE_ITERATIONS: 25, CURL: 16, SPLAT_RADIUS: 0.004,
                     ui: { checkboxes: { displayShadingToggle: true, colorGate: true, stepPalette: true, randomColor: false, kaleidoToggle: false, glowToggle: false },
                           sliders: { shadingIntensity: 0.8, shadeRelief: 0.9, shadeGloss: 0.4, vibrance: 0.2, ridges: 0, multiplier: 8 },
                           selects: { symmetryMode: 'radial' },
                           colors: { background: '#08080E', brush: '#21B8B0' },
                           savedColors: ['#21B8B0', '#39D353', '#FF5E86'],
                           armColors: [
                               { mode: 'step',  color: '#21B8B0', stepIndex: 0, push: false },
                               { mode: 'fixed', color: '#39D353', stepIndex: 0, push: false },
                               { mode: 'fixed', color: '#21B8B0', stepIndex: 0, push: false },
                               { mode: 'fixed', color: '#39D353', stepIndex: 0, push: false },
                               { mode: 'fixed', color: '#FF5E86', stepIndex: 0, push: false },
                               { mode: 'fixed', color: '#39D353', stepIndex: 0, push: false },
                               { mode: 'fixed', color: '#21B8B0', stepIndex: 0, push: false },
                               { mode: 'fixed', color: '#39D353', stepIndex: 0, push: false }
                           ] } },

            currents: { DENSITY_DISSIPATION: 0.999, VELOCITY_DISSIPATION: 0.998, PRESSURE_DISSIPATION: 0.955, PRESSURE_ITERATIONS: 30, CURL: 20, SPLAT_RADIUS: 0.009,
                        ui: { checkboxes: { displayShadingToggle: true, colorGate: true, stepPalette: true, randomColor: false, glowToggle: false },
                              sliders: { shadingIntensity: 0.9, shadeRelief: 1.0, shadeGloss: 0.45, vibrance: 0.1, ridges: 0 },
                              colors: { background: '#080D17', brush: '#F18473' },
                              savedColors: ['#35C4B5', '#F18473', '#F2DBB4'],
                              armColors: [{ mode: 'step', color: '#F18473', stepIndex: 0, push: false }] } },

            silky: { DENSITY_DISSIPATION: 0.9995, VELOCITY_DISSIPATION: 1.0001, PRESSURE_DISSIPATION: 0.93, PRESSURE_ITERATIONS: 20, CURL: 30, SPLAT_RADIUS: 0.011 },  // PD was 0.8

            thick: { DENSITY_DISSIPATION: 0.999, VELOCITY_DISSIPATION: 0.99, PRESSURE_DISSIPATION: 0.955, PRESSURE_ITERATIONS: 35, CURL: 1, SPLAT_RADIUS: 0.015 },  // Was 120; PD was 0.95

            wispy: { DENSITY_DISSIPATION: 0.9972, VELOCITY_DISSIPATION: 0.9996, PRESSURE_DISSIPATION: 0.945, PRESSURE_ITERATIONS: 25, CURL: 60, SPLAT_RADIUS: 0.01 },  // Was 40; PD was 0.92

            chaotic: { DENSITY_DISSIPATION: 0.996, VELOCITY_DISSIPATION: 0.9938, PRESSURE_DISSIPATION: 0.95, PRESSURE_ITERATIONS: 25, CURL: 12, SPLAT_RADIUS: 0.0151 },  // PD was 0.934

            ethereal: { DENSITY_DISSIPATION: 0.9998, VELOCITY_DISSIPATION: 1.0005, PRESSURE_DISSIPATION: 0.925, PRESSURE_ITERATIONS: 15, CURL: 45, SPLAT_RADIUS: 0.008 },  // PD was 0.75

            turbulent: { DENSITY_DISSIPATION: 0.994, VELOCITY_DISSIPATION: 0.997, PRESSURE_DISSIPATION: 0.94, PRESSURE_ITERATIONS: 30, CURL: 55, SPLAT_RADIUS: 0.013 },  // Was 60; PD was 0.88

            marble: { DENSITY_DISSIPATION: 0.9992, VELOCITY_DISSIPATION: 0.9985, PRESSURE_DISSIPATION: 0.97, PRESSURE_ITERATIONS: 35, CURL: 8, SPLAT_RADIUS: 0.018 },  // Was 100; PD was 0.98

            electric: { DENSITY_DISSIPATION: 0.9965, VELOCITY_DISSIPATION: 1.0008, PRESSURE_DISSIPATION: 0.935, PRESSURE_ITERATIONS: 25, CURL: 52, SPLAT_RADIUS: 0.006 },  // Was 35; PD was 0.82

            // Gel pen (2026-09-02): a line that stays where you drew it — colour
            // never fades (density 1.0), motion dies in under a second, no
            // curl to smear it — under a glossy lit surface. The `ui` block
            // rides the same full-snapshot apply as the sliders above.
            gelpen: { DENSITY_DISSIPATION: 1.0, VELOCITY_DISSIPATION: 0.985, PRESSURE_DISSIPATION: 0.95, PRESSURE_ITERATIONS: 25, CURL: 4, SPLAT_RADIUS: 0.006,
                      ui: { checkboxes: { displayShadingToggle: true }, sliders: { shadingIntensity: 1.1, shadeGloss: 0.85, shadeRelief: 1.2, sharpness: 1.4 } } }

        };

        

        // The built-ins' config-key deltas expressed as snapshot slider ids
        // (SPLAT_RADIUS is slider-space brushSize / 1000).
        const PRESET_KEY_TO_SLIDER = {
            DENSITY_DISSIPATION: 'densityDissipation',
            VELOCITY_DISSIPATION: 'velocityDissipation',
            PRESSURE_DISSIPATION: 'pressureDissipation',
            PRESSURE_ITERATIONS: 'pressureIteration',
            CURL: 'curl'
        };

        window.applyPreset = (name) => {

            // 13.5: look settings locked by the multiplayer host — local preset
            // clicks are gated; the host's own broadcasts still come through
            // (remote applies run under __mpApplyingRemote / remote-event flags)
            if (window.__mpSettingsLocked && !window.__mpApplyingRemote) return;

            // Own keys only: 'constructor' passes a look key's shape check and
            // presets['constructor'] is Object — a factory reset, broadcast.
            const preset = Object.prototype.hasOwnProperty.call(presets, name) ? presets[name] : null;

            if (!preset) return;



            activePreset = name;



            // Full-state application (2026-08-13): a preset click must land on
            // the exact same COMPLETE state every time. These used to be raw
            // config deltas over whatever was active — so Surface Shading,
            // kaleido, materials, arm colors etc. all survived a preset click.
            // Now the delta overlays the registry-defaults baseline and goes
            // through the full snapshot apply (which also resets material and
            // brush tip). Falls back to the legacy delta path if 12-save-load
            // has not loaded yet.
            if (typeof window.applyPresetSnapshotFull === 'function') {
                const sliders = {};
                Object.keys(PRESET_KEY_TO_SLIDER).forEach((k) => {
                    if (preset[k] !== undefined) sliders[PRESET_KEY_TO_SLIDER[k]] = preset[k];
                });
                if (preset.SPLAT_RADIUS !== undefined) sliders.brushSize = preset.SPLAT_RADIUS * 1000;
                // baseline 1: every built-in was designed (and its thumbnail baked)
                // against the defaults that shipped before 2026-09-24, so the
                // full apply fills what a preset leaves unsaid from THOSE — see
                // LEGACY_LOOK_BASELINE in 12-save-load. Without it, the day the
                // shipped defaults became the "Nice for default" look, Silky
                // would have picked up its viscosity, ridges and vibrance.
                const snap = { sliders: sliders, baseline: 1 };
                // ...but on TODAY's palette and replay period: a built-in is a
                // physics look, so a click must not switch a new user's palette
                // back to the one that shipped before the defaults moved.
                const base = (typeof window.baselineLookSnapshot === 'function') ? window.baselineLookSnapshot() : null;
                if (base) { snap.paletteIndex = base.paletteIndex; snap.brushState = base.brushState; }
                if (preset.ui) {
                    if (preset.ui.sliders) Object.assign(snap.sliders, preset.ui.sliders);
                    if (preset.ui.checkboxes) snap.checkboxes = Object.assign({}, preset.ui.checkboxes);
                    if (preset.ui.selects) snap.selects = Object.assign({}, preset.ui.selects);
                    // Curated looks carry colour and composition sections too —
                    // the same sections a saved user preset carries, so the
                    // full-snapshot apply treats a built-in look exactly like
                    // one of the user's own (a look click sets the swatch tray
                    // the way picking a palette does; copied, never shared).
                    ['colors', 'savedColors', 'armColors', 'kaleido', 'material', 'brushTip'].forEach((k) => {
                        if (preset.ui[k] !== undefined) snap[k] = JSON.parse(JSON.stringify(preset.ui[k]));
                    });
                }
                window.applyPresetSnapshotFull(snap);
            } else {
                const safePreset = (window.ParamRegistry && window.ParamRegistry.clampConfigObject)
                    ? window.ParamRegistry.clampConfigObject(preset)
                    : preset;
                Object.assign(config, safePreset);
            }

            // Soft reset: the preset changes the workload (stale statistics) but
            // not the hardware — keep the current quality tier, re-learn from it.
            // A hard reset snapped to full quality here and caused seconds of
            // over-budget frames after every preset click.
            if (window.QualityGovernor) {
                (window.QualityGovernor.softReset || window.QualityGovernor.reset)();
            }



            // Single DOM update

            updateSliderValues();



            // Update button states; a built-in preset supersedes any active

            // user preset (both surfaces: sidebar list + mixer strip)

            document.querySelectorAll('.user-preset-btn.active, .mixer-user-preset-btn.active')

                .forEach(btn => btn.classList.remove('active'));

            updatePresetButtons();

            

            // Broadcast to multiplayer clients

            if (typeof broadcastPreset === 'function') {

                broadcastPreset(name);

            }

        };

        

        function updatePresetButtons() {

            // Built-in preset buttons live in the mixer strip (.mixer-preset-btn)
            // after the layout refactor moved them out of the legacy .presets
            // container — which this function kept querying, so active states
            // silently stopped rendering (fixed 2026-07-13). The .presets
            // selector stays as a fallback for the pre-mixer mobile layout.

            const buttons = document.querySelectorAll('.mixer-preset-btn, .presets button');

            buttons.forEach(btn => {

                // data-preset carries the key; the visible label is prose now
                // ("Quick-fading brush tracer"), so text matching would never hit.
                const key = (btn.dataset && btn.dataset.preset) ? btn.dataset.preset : btn.textContent.trim().toLowerCase();
                btn.classList.toggle('active', key === activePreset);

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

            freezeBtn.title = isUnfreezing ? 'Freeze fluid motion (Space)' : 'Unfreeze fluid motion (Space)';

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

        

