// ═══════════════════════════════════════════════════════════════════
// js/05e-effect-controls.js — part 5/14 of former 05-fluid-sim.js (lines 1741–1965)
// LOAD ORDER: after 05d-input-replay.js, before 05f-kaleido-controls.js
// PROVIDES: turbulence/glow control wiring, background color, canvas opacity, display shading, capture dimming, multiplier, timeScale, setMultiplierHotkey
// REQUIRES: config (04)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
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
        // Glow (HDR bloom) toggle
        const glowToggle = document.getElementById('glowToggle');
        const glowPanel = document.getElementById('glowPanel');
        if (glowToggle) {
            glowToggle.addEventListener('change', (e) => {
                const on = e.target.checked;
                config.GLOW = on;
                if (glowPanel) glowPanel.style.display = on ? '' : 'none';
            });
        }
        // Scatter (volumetric light shafts) toggle — nested inside glowPanel,
        // so it hides with Glow for free. Every side effect lives INSIDE the
        // handler because save/load restores state by replaying synthetic
        // change/input events into these listeners (12-save-load.js:11-12).
        const scatterToggle = document.getElementById('scatterToggle');
        const scatterPanel = document.getElementById('scatterPanel');
        if (scatterToggle) {
            scatterToggle.addEventListener('change', (e) => {
                const on = e.target.checked;
                config.SCATTER = on;
                if (scatterPanel) scatterPanel.style.display = on ? '' : 'none';
                // Drop the eased origin so re-enabling starts aimed at the
                // current source instead of sweeping in from the stale one.
                if (!on) window.__scatterOrigin = null;
            });
        }
        // Overflow (open canvas edges) toggle + Border width. Lived as a
        // Tunnel audio-scene toggle until 2026-08-24 — a canvas-wide boundary
        // mode you could only reach by running music through one scene. Every
        // side effect lives INSIDE the handlers because save/load restores
        // state by replaying synthetic change/input events into these
        // listeners (12-save-load.js:11-12).
        const overflowToggle = document.getElementById('overflowToggle');
        const overflowPanel = document.getElementById('overflowPanel');
        if (overflowToggle) {
            overflowToggle.checked = !!config.EDGE_ABSORB;
            if (overflowPanel) overflowPanel.style.display = config.EDGE_ABSORB ? '' : 'none';
            overflowToggle.addEventListener('change', (e) => {
                const on = e.target.checked;
                config.EDGE_ABSORB = on;
                if (overflowPanel) overflowPanel.style.display = on ? '' : 'none';
                // Release any console/harness override (window.__edgeAbsorb
                // outranks the config in 05j) so the checkbox is never left
                // fighting a stale value from a test run.
                window.__edgeAbsorb = 0;
            });
        }
        // Border: the slider is a PERCENTAGE of the canvas, the shader wants a
        // fraction — which is why this one is registry-backed with
        // configKey:null rather than a plain slider→config binding.
        const overflowBandSlider = document.getElementById('overflowBand');
        const overflowBandValue = document.getElementById('overflowBandValue');
        if (overflowBandSlider) {
            overflowBandSlider.addEventListener('input', (e) => {
                const pct = parseFloat(e.target.value);
                config.EDGE_ABSORB_BAND = pct / 100;
                if (overflowBandValue) overflowBandValue.textContent = pct.toFixed(1) + '%';
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
                if (sp) sp.textContent = parseFloat(e.target.value).toFixed(1) + 's';
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
        // Glow sliders
        const glowIntensitySlider = document.getElementById('glowIntensity');
        if (glowIntensitySlider) {
            glowIntensitySlider.addEventListener('input', (e) => {
                config.GLOW_INTENSITY = parseFloat(e.target.value);
                const sp = document.getElementById('glowIntensityValue');
                // 3dp: at step 0.005 a 2dp readout showed 0.005 and 0.010 both as "0.01".
                if (sp) sp.textContent = parseFloat(e.target.value).toFixed(3);
            });
        }
        const glowThresholdSlider = document.getElementById('glowThreshold');
        if (glowThresholdSlider) {
            glowThresholdSlider.addEventListener('input', (e) => {
                config.GLOW_THRESHOLD = parseFloat(e.target.value);
                const sp = document.getElementById('glowThresholdValue');
                if (sp) sp.textContent = parseFloat(e.target.value).toFixed(2);
            });
        }
        // Scatter sliders / source
        const scatterAmountSlider = document.getElementById('scatterAmount');
        if (scatterAmountSlider) {
            scatterAmountSlider.addEventListener('input', (e) => {
                // Square the 0..1 slider into the 0..2 shader gain so the low
                // end gets the bulk of the travel (see 01a). v=0.1 -> 0.02,
                // v=0.5 -> 0.5, v=1 -> 2.0.
                const _v = parseFloat(e.target.value);
                config.SCATTER_AMOUNT = _v * _v * 2.0;
                const sp = document.getElementById('scatterAmountValue');
                if (sp) sp.textContent = parseFloat(e.target.value).toFixed(2);
            });
        }
        const scatterReachSlider = document.getElementById('scatterReach');
        if (scatterReachSlider) {
            scatterReachSlider.addEventListener('input', (e) => {
                config.SCATTER_DENSITY = parseFloat(e.target.value);
                const sp = document.getElementById('scatterReachValue');
                if (sp) sp.textContent = parseFloat(e.target.value).toFixed(2);
            });
        }
        const scatterBlockToggle = document.getElementById('scatterBlockToggle');
        if (scatterBlockToggle) {
            scatterBlockToggle.checked = !!config.SCATTER_BLOCK;
            scatterBlockToggle.addEventListener('change', (e) => {
                config.SCATTER_BLOCK = e.target.checked;
            });
        }
        const scatterSourceSelect = document.getElementById('scatterSource');
        if (scatterSourceSelect) {
            scatterSourceSelect.addEventListener('change', (e) => {
                config.SCATTER_SOURCE = e.target.value;
                // Re-aim instantly rather than sweeping the shafts across the
                // canvas from the previous origin.
                window.__scatterOrigin = null;
            });
        }
        // Photosensitivity protection (PhotoSafe). Persistence is BESPOKE on
        // purpose: the toggle sits in 12-save-load's PRESET_SKIP (safety prefs
        // must never ride presets or the multiplayer look mirror), so its
        // truth lives in the dedicated 'fluidui.photoSafe' localStorage key —
        // the same key the first-frame warning modal writes and 04a seeds
        // config.PHOTOSAFE from. Absent → protected.
        const photoSafeToggle = document.getElementById('photoSafeToggle');
        if (photoSafeToggle) {
            photoSafeToggle.checked = !!config.PHOTOSAFE;
            document.body.classList.toggle('photosafe-on', !!config.PHOTOSAFE);
            let offConfirmed = false, clickTrusted = null;
            photoSafeToggle.addEventListener('change', (e) => {
                const on = e.target.checked;
                // A script's el.click() fires an untrusted click but a TRUSTED
                // change (the browser fires the change), so the change alone
                // cannot say whether a human did this: the click before it can.
                const human = (e.isTrusted && clickTrusted !== false) || offConfirmed;
                offConfirmed = false;
                clickTrusted = null;
                config.PHOTOSAFE = on;
                // Buffers are allocated lazily (05c skips them when booted
                // with protection off) — build them before the next frame.
                if (on && typeof window.__photoSafeEnsure === 'function') window.__photoSafeEnsure();
                // Persist ONLY on trusted (human) events: synthetic change
                // events — extensions, automation, replayed snapshots — may
                // drive the runtime state for this session but can never
                // disarm protection across a reload. Fail-safe by design.
                // A trusted "Turn off" in the question below counts as human.
                if (human) {
                    try { localStorage.setItem('fluidui.photoSafe', on ? '1' : '0'); } catch (err) {}
                }
                // DOM-side guard rides the same switch: CSS transitions on the
                // canvas background/opacity so no non-GL path can strobe.
                document.body.classList.toggle('photosafe-on', on);
            });
            // Turning protection OFF by hand asks first. Caught at the click:
            // a cancelled click leaves a checkbox as it was and fires no
            // change, so nothing listening ever sees a half-made choice.
            // Synthetic clicks pass as before (session only, never persisted).
            let offModal = null, offKeys = null, offArmedAt = 0;
            const closeOffQuestion = () => {
                if (!offModal) return;
                offModal.classList.remove('show');
                if (offKeys) { document.removeEventListener('keydown', offKeys, true); offKeys = null; }
                try { photoSafeToggle.focus({ preventScroll: true }); } catch (_) {}
            };
            const askPhotoSafeOff = () => {
                if (!offModal) {
                    offModal = document.createElement('div');
                    offModal.id = 'photoSafeOffModal';
                    offModal.className = 'delete-modal';
                    offModal.dataset.group = 'system';   // button tint (css/01-buttons.css)
                    offModal.setAttribute('role', 'alertdialog');
                    offModal.setAttribute('aria-modal', 'true');
                    offModal.setAttribute('aria-labelledby', 'photoSafeOffTitle');
                    offModal.setAttribute('aria-describedby', 'photoSafeOffMsg');
                    offModal.innerHTML =
                        '<div class="delete-modal-content">' +
                            '<div class="delete-modal-title" id="photoSafeOffTitle">Turn off flashing protection?</div>' +
                            '<div class="delete-modal-message" id="photoSafeOffMsg">Flashing, rapid brightness changes and fast ' +
                                'patterns will not be limited. This can trigger seizures in people with photosensitive epilepsy.</div>' +
                            '<div class="delete-modal-actions">' +
                                '<button type="button" class="delete-modal-cancel" id="photoSafeOffKeep">Keep protection on</button>' +
                                '<button type="button" class="delete-modal-confirm btn--destructive" id="photoSafeOffGo">Turn off</button>' +
                            '</div>' +
                        '</div>';
                    document.body.appendChild(offModal);
                    offModal.querySelector('#photoSafeOffKeep').addEventListener('click', closeOffQuestion);
                    offModal.querySelector('#photoSafeOffGo').addEventListener('click', (e) => {
                        if (!e.isTrusted || performance.now() < offArmedAt) return;
                        closeOffQuestion();
                        offConfirmed = true;
                        photoSafeToggle.checked = false;
                        photoSafeToggle.dispatchEvent(new Event('change', { bubbles: true }));
                    });
                    // The scrim answers like Keep.
                    offModal.addEventListener('mousedown', (e) => { if (e.target === offModal) closeOffQuestion(); });
                }
                offModal.classList.add('show');
                offArmedAt = performance.now() + 400;
                // Nothing typed at the question reaches the app's hotkeys;
                // Escape is Keep, Tab stays between the two buttons.
                if (offKeys) document.removeEventListener('keydown', offKeys, true);
                offKeys = (e) => {
                    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeOffQuestion(); return; }
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        const keep = offModal.querySelector('#photoSafeOffKeep'), go = offModal.querySelector('#photoSafeOffGo');
                        (document.activeElement === keep ? go : keep).focus();
                    }
                    if (e.key !== 'Enter') e.stopPropagation();
                };
                document.addEventListener('keydown', offKeys, true);
                try { offModal.querySelector('#photoSafeOffKeep').focus({ preventScroll: true }); } catch (_) {}
            };
            photoSafeToggle.addEventListener('click', (e) => {
                clickTrusted = e.isTrusted;
                // A click has already flipped the box: unchecked now = was on.
                if (!e.isTrusted || photoSafeToggle.checked) return;
                e.preventDefault();
                clickTrusted = null;
                askPhotoSafeOff();
            });
        }
        const photoWarnShowBtn = document.getElementById('photoWarnShowBtn');
        if (photoWarnShowBtn) {
            photoWarnShowBtn.addEventListener('click', () => {
                if (typeof window.__showPhotoWarn === 'function') window.__showPhotoWarn({ returnFocus: photoWarnShowBtn });
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
        // Under Transparent Background the painting area around the canvas is
        // as see-through as the canvas's own empty field, so the frame never
        // shows as a darker or lighter box. The empty field is black at alpha
        // 1 − Background Transparency when Empty Alpha Locked is on (opaque
        // when it is off; displayFrag in 05a), times Canvas Opacity.
        function paintAreaBackdrop() {
            if (!canvasArea || !document.body.classList.contains('transparent-mode')) return;
            const op = parseFloat(canvas.style.opacity);
            const field = window.preserveFluidOpacity ? 1 - (window.backgroundTransparency || 0) : 1;
            const a = (Number.isFinite(op) ? op : 1) * field;
            canvasArea.style.backgroundColor = 'rgba(0, 0, 0, ' + a.toFixed(3) + ')';
        }
        window.paintAreaBackdrop = paintAreaBackdrop;
        // Canvas opacity slider (for layer visibility)
        const canvasOpacitySlider = document.getElementById('canvasOpacity');
        const opacityValueDisplay = document.getElementById('opacityValue');
        if (canvasOpacitySlider) {
            canvasOpacitySlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                const opacity = value / 100;
                canvas.style.opacity = opacity;
                opacityValueDisplay.textContent = `${value}%`;
                paintAreaBackdrop();
            });
        }
        // Preserve fluid opacity checkbox ("Empty Alpha Locked")
        const preserveFluidOpacityCheckbox = document.getElementById('preserveFluidOpacity');
        window.preserveFluidOpacity = preserveFluidOpacityCheckbox ? !!preserveFluidOpacityCheckbox.checked : true;
        if (preserveFluidOpacityCheckbox) {
            preserveFluidOpacityCheckbox.addEventListener('change', (e) => {
                window.preserveFluidOpacity = e.target.checked;
                paintAreaBackdrop();
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
        // Capture dimming slider (controls background transparency). Only on
        // screen under Transparent Background (styles.css .bg-transparency-group).
        window.backgroundTransparency = 0.8; // Default 80%
        const captureDimmingSlider = document.getElementById('captureDimming');
        const dimmingValueDisplay = document.getElementById('dimmingValue');
        if (captureDimmingSlider) {
            captureDimmingSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                window.backgroundTransparency = value / 100; // Convert to 0-1 range
                dimmingValueDisplay.textContent = `${value}%`;
                paintAreaBackdrop();
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
            // Sliders are INPUTs and hold focus after a drag; blocking on them
            // is what made these hotkeys stop responding mid-session.
            const isEditable = window.__isTypingTarget ? window.__isTypingTarget(t)
                : (tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable));
            if (isEditable) return;
            // Shift+digit is left free for the hotkeys people bind themselves
            // (js/48-hotkeys.js). This handler reads the physical key, so
            // Shift+1..8 used to set the multiplier too: a second copy of
            // every bare digit that nothing else could ever use.
            if (e.shiftKey) return;
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
