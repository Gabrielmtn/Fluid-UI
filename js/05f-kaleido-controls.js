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
        let lastAngleSnapTime = 0;
        const ANGLE_STICK_MS = 1500;
        const ANGLE_STICK_TOL = 1.0;
        const kAngleEl = document.getElementById('kAngle');
        const kAngleValueEl = document.getElementById('kAngleValue');
        if (kAngleEl) {
            kAngleEl.addEventListener('input', (e) => {
                let deg = parseFloat(e.target.value);
                const now = Date.now();
                const withinTol = Math.abs(deg) <= ANGLE_STICK_TOL;
                const stickActive = (now - lastAngleSnapTime) < ANGLE_STICK_MS;
                if (!stickActive && withinTol) {
                    deg = 0;
                    lastAngleSnapTime = now;
                } else if (stickActive) {
                    deg = 0;
                }
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
            kSpinSpeedEl.addEventListener('input', (e) => {
                const degs = parseFloat(e.target.value);
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
