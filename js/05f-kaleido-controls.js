// ═══════════════════════════════════════════════════════════════════
// js/05f-kaleido-controls.js — part 6/14 of former 05-fluid-sim.js (lines 1966–2193)
// LOAD ORDER: after 05e-effect-controls.js, before 05g-arm-colors.js
// PROVIDES: kaleido globals (window.kaleido*), kaleidoscope control wiring
// REQUIRES: —
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        // Initialize all kaleidoscope variables with defaults
        window.kaleidoEnabled = false;
        window.kaleidoSegments = 6;
        window.kaleidoMode = 1;  // Default to Wedge mode
        window.kAngle = 0;
        window.kTwist = 0;
        window.kZoom = 1;
        window.kBlend = 1;
        window.kAnimateRot = false;
        const kaleidoToggleEl = document.getElementById('kaleidoToggle');
        const kaleidoSegmentsEl = document.getElementById('kaleidoSegments');
        const kaleidoValueEl = document.getElementById('kaleidoValue');
        if (kaleidoToggleEl) {
            kaleidoToggleEl.addEventListener('change', (e) => {
                window.kaleidoEnabled = e.target.checked;
                // Snapshot applies re-dispatch 'change' on every checkbox, even
                // when the value did not move — so this handler used to fire on
                // every preset, Scene, Mutate variant and multiplayer mirror tick
                // and overwrite the arm count the snapshot had JUST restored,
                // either with a stale _prevMultiplier or the first-enable 8x.
                // That is "presets don't work with multibrush consistently".
                // During an apply, record the enabled state and nothing else:
                // multiplier and segments come from the snapshot itself.
                if (window._profileApplying) {
                    // Keep the restore target current for a later MANUAL toggle-off.
                    if (e.target.checked) window._prevMultiplier = animationMultiplier;
                    return;
                }
                // Mandala Studio (34) holds its one-brush rig while it is on,
                // and Kaleido is a view switch inside it: flipping it to see
                // the unmirrored wedge must not swap the arm count. 34 hands
                // the arm count back when the mode closes.
                if (window.MandalaStudio && window.MandalaStudio.active()) return;
                if (e.target.checked) {
                    window._prevMultiplier = animationMultiplier;
                    if (!window._kaleidoBootstrapped) {
                        animationMultiplier = 8;
                        window.animationMultiplier = 8;
                        if (multiplierSlider) {
                            multiplierSlider.value = 8;
                            multiplierSlider.style.setProperty('--val', 8);
                            if (multiplierValue) multiplierValue.textContent = '8x';
                        }
                        window.kaleidoSegments = 16;
                        if (kaleidoSegmentsEl) {
                            kaleidoSegmentsEl.value = '16';
                            kaleidoSegmentsEl.style.setProperty('--val', 16);
                            kaleidoSegmentsEl.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                        if (kaleidoValueEl) kaleidoValueEl.textContent = '16';
                        window._kaleidoBootstrapped = true;
                    }
                } else {
                    if (typeof window._prevMultiplier === 'number') {
                        animationMultiplier = window._prevMultiplier;
                        window.animationMultiplier = animationMultiplier;
                        if (multiplierSlider) {
                            multiplierSlider.value = String(animationMultiplier);
                            multiplierSlider.style.setProperty('--val', animationMultiplier);
                            if (multiplierValue) multiplierValue.textContent = animationMultiplier + 'x';
                        }
                    }
                }
            });
        }
        if (kaleidoSegmentsEl) {
            const setVal = () => { if (kaleidoValueEl) kaleidoValueEl.textContent = String(window.kaleidoSegments); };
            kaleidoSegmentsEl.addEventListener('input', (e) => {
                window.kaleidoSegments = parseInt(e.target.value, 10) || 1;
                setVal();
            });
            window.kaleidoSegments = parseInt(kaleidoSegmentsEl.value, 10) || 1;
            setVal();
        }
        const kaleidoPanel = document.getElementById('kaleidoPanel');
        function syncKaleidoPanel() {
            if (kaleidoPanel) kaleidoPanel.classList.toggle('open', !!window.kaleidoEnabled);
            // Note: Removed resize dispatch - it was clearing fluid data via initFramebuffers()
        }
        if (kaleidoToggleEl) {
            window.kaleidoEnabled = !!kaleidoToggleEl.checked;
            syncKaleidoPanel();
            kaleidoToggleEl.addEventListener('change', () => syncKaleidoPanel());
        }
        // Sticky zero for Angle and Spin Speed (2026-10-06). 360 steps across
        // a sidebar row is under two pixels a step, so landing on 0 took a
        // lucky pixel. During a hand drag the value catches on 0 when it
        // comes within STICK_TOL, or jumps across 0 between two moves (a fast
        // flick skips the window), and stays there while the pointer is in
        // the window or for STICK_MS, so the overshoot of letting go still
        // lands on 0. It only catches a drag that has been outside the
        // window, so a drag that STARTS at 0 can still leave it for a small
        // value. Keyboard steps and programmatic writes are never held: the
        // old Angle stick held ANY near-zero write for 1.5 s, which trapped
        // the arrow keys at 0 and swallowed Mandala Studio's angle pin.
        const STICK_MS = 600;
        const STICK_TOL = 3;
        function stickyZero(el) {
            let drag = false, armed = false, stuck = false, holdUntil = 0, last = null;
            // Window capture runs before 06's row forwarder (document
            // capture), which writes the first value of a row press itself.
            window.addEventListener('pointerdown', (e) => {
                const row = el.closest('.control-group') || el;
                if (!row.contains(e.target)) return;
                drag = true;
                stuck = false;
                last = null;
                armed = Math.abs(parseFloat(el.value)) > STICK_TOL;
            }, true);
            const end = () => { drag = false; };
            window.addEventListener('pointerup', end, true);
            window.addEventListener('pointercancel', end, true);
            window.addEventListener('blur', end);
            // The input's raw value in, the value to keep out. A snapshot
            // apply (preset, Mutate variant, look mirror) takes its value as
            // given even mid-drag.
            return function (v) {
                if (!drag || window._profileApplying || !isFinite(v)) return v;
                const now = performance.now();
                const inZone = Math.abs(v) <= STICK_TOL;
                // The first move of a drag can be a track click's jump,
                // which is a choice of value, not a pass over 0.
                const crossed = last !== null && last * v < 0;
                if (stuck) {
                    if (now >= holdUntil && !inZone) stuck = false;
                } else if (armed && (inZone || crossed)) {
                    stuck = true;
                    holdUntil = now + STICK_MS;
                }
                if (!inZone) armed = true;
                last = v;
                return stuck ? 0 : v;
            };
        }
        const kAngleEl = document.getElementById('kAngle');
        const kAngleValueEl = document.getElementById('kAngleValue');
        if (kAngleEl) {
            const stickAngle = stickyZero(kAngleEl);
            kAngleEl.addEventListener('input', (e) => {
                const deg = stickAngle(parseFloat(e.target.value));
                if (!Number.isNaN(deg)) {
                    e.target.value = String(deg);
                    try { e.target.style.setProperty('--val', deg); } catch (_){}
                    window.kAngle = deg * Math.PI / 180;
                    if (kAngleValueEl) kAngleValueEl.textContent = deg + '°';
                }
            });
        }
        const kSpinSpeedEl = document.getElementById('kSpinSpeed');
        const kSpinSpeedValueEl = document.getElementById('kSpinSpeedValue');
        if (kSpinSpeedEl) {
            const stickSpin = stickyZero(kSpinSpeedEl);
            kSpinSpeedEl.addEventListener('input', (e) => {
                const raw = parseFloat(e.target.value);
                const degs = stickSpin(raw);
                if (degs === 0 && raw !== 0) {
                    e.target.value = '0';
                    try { e.target.style.setProperty('--val', 0); } catch (_){}
                }
                window.kSpinSpeed = degs;
                if (kSpinSpeedValueEl) kSpinSpeedValueEl.textContent = degs + '°/s';
            });
        }
        const kTwistEl = document.getElementById('kTwist');
        const kTwistValueEl = document.getElementById('kTwistValue');
        if (kTwistEl) {
            kTwistEl.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                window.kTwist = v;
                if (kTwistValueEl) kTwistValueEl.textContent = v.toFixed(1);
            });
        }
        const kZoomEl = document.getElementById('kZoom');
        const kZoomValueEl = document.getElementById('kZoomValue');
        if (kZoomEl) {
            kZoomEl.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                window.kZoom = v;
                if (kZoomValueEl) kZoomValueEl.textContent = v.toFixed(2);
            });
        }
        const kBlendEl = document.getElementById('kBlend');
        const kBlendValueEl = document.getElementById('kBlendValue');
        if (kBlendEl) {
            kBlendEl.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                window.kBlend = v;
                if (kBlendValueEl) kBlendValueEl.textContent = v.toFixed(2);
            });
        }
        // Initial defaults (middling), applied without requiring user interaction
        (function initKaleidoDefaults(){
            // Angle
            if (kAngleEl) {
                const deg = parseFloat(kAngleEl.value || '0');
                window.kAngle = (isFinite(deg) ? deg : 0) * Math.PI / 180;
                if (kAngleValueEl) kAngleValueEl.textContent = (isFinite(deg)?deg:0) + '°';
            } else {
                window.kAngle = 0;
            }
            // Spin
            if (kSpinSpeedEl) {
                const s = parseFloat(kSpinSpeedEl.value || '30');
                window.kSpinSpeed = isFinite(s) ? s : 30;
                if (kSpinSpeedValueEl) kSpinSpeedValueEl.textContent = (isFinite(s)?s:30) + '°/s';
            } else {
                window.kSpinSpeed = 30;
            }
            // Twist
            if (kTwistEl) {
                const t = parseFloat(kTwistEl.value || '0');
                window.kTwist = isFinite(t) ? t : 0;
                if (kTwistValueEl) kTwistValueEl.textContent = (isFinite(t)?t:0).toFixed(1);
            } else {
                window.kTwist = 0;
            }
            // Zoom
            if (kZoomEl) {
                const z = parseFloat(kZoomEl.value || '1');
                window.kZoom = isFinite(z) ? z : 1;
                if (kZoomValueEl) kZoomValueEl.textContent = (isFinite(z)?z:1).toFixed(2);
            } else {
                window.kZoom = 1;
            }
            // Blend - default to 1
            if (kBlendEl) {
                const b = parseFloat(kBlendEl.value || '1');
                window.kBlend = isFinite(b) ? b : 1;
                if (kBlendValueEl) kBlendValueEl.textContent = (isFinite(b)?b:1).toFixed(2);
            } else {
                window.kBlend = 1;
            }
        })();
        const kAnimateRotEl = document.getElementById('kAnimateRot');
        if (kAnimateRotEl) {
            window.kAnimateRot = !!kAnimateRotEl.checked;
            kAnimateRotEl.addEventListener('change', (e) => { window.kAnimateRot = e.target.checked; });
        }
        const kaleidoModeEl = document.getElementById('kaleidoMode');
        // Update segments label based on kaleidoscope mode
        function updateSegmentsLabel(mode) {
            const segmentsLabelEl = document.querySelector('label[for="kaleidoSegments"]');
            if (!segmentsLabelEl) return;
            const valueSpan = segmentsLabelEl.querySelector('.value-display');
            const currentValue = valueSpan ? valueSpan.textContent : '';
            let labelText = 'Segments';
            switch(mode) {
                case 0: // Off
                    labelText = 'Segments';
                    break;
                case 1: // Wedge
                    labelText = 'Facets';
                    break;
                case 2: // Mirror H
                    labelText = 'Layers';
                    break;
                case 3: // Mirror V
                    labelText = 'Layers';
                    break;
                case 4: // Mirror Quad
                    labelText = 'Reflections';
                    break;
                case 5: // Spiral
                    labelText = 'Rings';
                    break;
                default:
                    labelText = 'Segments';
            }
            // Update only the text node before the value span (preserve the live span element)
            if (valueSpan) {
                // Find or create the text node before the span
                const textNode = segmentsLabelEl.firstChild;
                if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                    textNode.textContent = labelText + ' ';
                } else {
                    segmentsLabelEl.insertBefore(document.createTextNode(labelText + ' '), valueSpan);
                }
            } else {
                segmentsLabelEl.textContent = labelText;
            }
        }
        if (kaleidoModeEl) {
            window.kaleidoMode = parseInt(kaleidoModeEl.value || '1', 10);
            // Delay label update to ensure DOM is ready
            setTimeout(() => updateSegmentsLabel(window.kaleidoMode), 0);
            kaleidoModeEl.addEventListener('change', (e) => {
                const mode = parseInt(e.target.value, 10);
                window.kaleidoMode = mode;
                updateSegmentsLabel(mode);
            });
        }
