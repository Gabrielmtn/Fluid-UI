// ═══════════════════════════════════════════════════════════════════
// js/04d-anim-ascend-star.js — part 4/7 of former 04-ui-interactions.js (lines 1319–2102)
// LOAD ORDER: after 04c-anim-burst.js, before 04e-anim-portal.js
// PROVIDES: shooting star system + sliders + origin picker (Ascend removed 2026-08-15)
// REQUIRES: config (04a)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        // ── Ascend animation: REMOVED 2026-08-15 ─────────────────
        // Cut for photosensitivity: a 20Hz loop drew a new random
        // vibrant color every tick plus saturated multi-splat spurts.
        // Its ParamRegistry entries are gone too, so presets that
        // saved ascendToggle now skip-with-warn on load (12-save-load).

        // ── Shooting Star animation (toggle) ─────────────────────

        let ssActive = false;

        let ssTimerId = null;

        let ssStars = []; // active shooting star arcs

        

        // Config read from sliders

        let ssFrequency = 2.0;  // stars per second

        let ssAngleDeg = 120;   // launch angle in degrees (120° = down-left in canvas coords)

        let ssLength = 0.4;     // arc duration in seconds

        let ssSize = 0.5;       // size multiplier

        let ssGravity = 0.10;    // downward pull (0 = straight, 1 = heavy droop)

        // Origin as % of canvas: 0,0 = top-left corner of frame, 100,100 = bottom-right

        // Values outside 0-100 are off-screen (the whole point)

        let ssOriginX = -30;    // default: 30% off the left edge

        let ssOriginY = 0;      // default: top edge

        let ssVariance = 15;    // scatter radius in % of canvas

        

        window.toggleShootingStar = (forceState) => {

            ssActive = typeof forceState === 'boolean' ? forceState : !ssActive;

            const cb = document.getElementById('shootingStarToggle');

            if (cb) cb.checked = ssActive;

            const panel = document.getElementById('shootingStarSettings');

            if (panel) panel.classList.toggle('open', ssActive);

            

            if (ssActive) {

                startShootingStars();

            } else {

                if (ssTimerId) { clearInterval(ssTimerId); ssTimerId = null; }

                ssStars.length = 0;

            }

        };

        

        function startShootingStars() {

            if (ssTimerId) clearInterval(ssTimerId);

            scheduleNextStar();

        }

        

        function scheduleNextStar() {

            if (!ssActive) return;

            const intervalMs = 1000 / Math.max(0.2, ssFrequency);

            // Add ±30% jitter so stars don't feel mechanical

            const jitter = intervalMs * (0.7 + Math.random() * 0.6);

            ssTimerId = setTimeout(() => {

                if (!ssActive) return;

                launchStar();

                scheduleNextStar();

            }, jitter);

        }

        

        function launchStar() {

            const cw = canvas.width;

            const ch = canvas.height;

            

            // Travel direction: angle in canvas coords (0°=right, 90°=down)

            // Add ±15° randomization for natural spread

            const angleRad = (ssAngleDeg + (Math.random() - 0.5) * 30) * Math.PI / 180;

            

            // Spawn at the user-picked origin (% of canvas) + random scatter from variance

            const varPx = (ssVariance / 100) * cw;

            const varPy = (ssVariance / 100) * ch;

            const sx = (ssOriginX / 100) * cw + (Math.random() - 0.5) * 2 * varPx;

            const sy = (ssOriginY / 100) * ch + (Math.random() - 0.5) * 2 * varPy;

            

            // Streak length in pixels (based on canvas diagonal and Length slider)

            const diag = Math.sqrt(cw * cw + ch * ch);

            const streakLen = diag * (0.25 + ssLength * 0.5); // 25-75% of diagonal

            

            // High tick rate for smooth thin trails

            const FPS = 60;

            const totalSteps = Math.max(8, Math.round(ssLength * FPS));

            const stepMs = (ssLength * 1000) / totalSteps;

            const stepDist = streakLen / totalSteps;

            

            // Gravity: always bends downward (toward +Y in canvas coords)

            // Determine which perpendicular direction is "down" relative to travel

            const perpDown = Math.cos(angleRad) >= 0 ? 1 : -1;

            const curvature = perpDown * ssGravity * Math.PI;

            

            // Pick a bright color — bias toward whites/warm tones like real meteors

            let color;

            if (window.generateVibrantColor) {

                color = window.generateVibrantColor();

                // Brighten toward white for star-like appearance

                color = [

                    Math.min(1, color[0] + 0.4),

                    Math.min(1, color[1] + 0.3),

                    Math.min(1, color[2] + 0.2)

                ];

            } else {

                color = [1, 0.95, 0.8]; // warm white

            }

            

            let step = 0;

            let px = sx, py = sy;

            

            const star = { id: Date.now() + Math.random() };

            ssStars.push(star);

            

            function tick() {

                if (!ssActive || step >= totalSteps) {

                    const idx = ssStars.indexOf(star);

                    if (idx !== -1) ssStars.splice(idx, 1);

                    return;

                }

                

                const t = step / totalSteps; // 0→1

                

                // Gentle arc bend

                const curAngle = angleRad + curvature * t;

                

                // Fast head, fading tail

                const speedMult = 1.0 - t * 0.3;

                const dist = stepDist * speedMult;

                

                const nx = px + Math.cos(curAngle) * dist;

                const ny = py + Math.sin(curAngle) * dist;

                

                // High velocity aligned with travel → elongated thin splats

                const velScale = dist * 0.6;

                const dx = Math.cos(curAngle) * velScale;

                const dy = Math.sin(curAngle) * velScale;

                

                // Tiny radius: bright pinpoint head → vanishing tail

                const baseRadius = 0.0003 + (1 - t) * 0.0009;

                const headRadius = baseRadius * ssSize;

                

                // Fade opacity along the tail (bright head, dim tail)

                const fade = 1.0 - t * 0.7;

                const tailColor = [

                    color[0] * fade,

                    color[1] * fade,

                    color[2] * fade * 0.8

                ];

                

                if (typeof window.applyMultiSplatWith === 'function') {

                    window.applyMultiSplatWith(nx, ny, dx, dy, tailColor, 1, headRadius, true);

                } else {

                    splat(nx, ny, dx, dy, tailColor);

                }

                

                px = nx;

                py = ny;

                step++;

                

                setTimeout(tick, stepMs);

            }

            

            tick();

        }

        

        // Wire shooting star toggle + sliders

        const ssCb = document.getElementById('shootingStarToggle');

        if (ssCb) {

            ssCb.addEventListener('change', () => toggleShootingStar(ssCb.checked));

            const ssRow = ssCb.closest('.anim-toggle-row') || ssCb.parentElement?.parentElement;

            if (ssRow) {

                ssRow.addEventListener('click', (e) => {

                    if (e.target.closest('.anim-switch')) return;

                    ssCb.checked = !ssCb.checked;

                    ssCb.dispatchEvent(new Event('change', { bubbles: true }));

                });

            }

        }

        const ssFreqSlider = document.getElementById('ssFrequency');

        const ssAngleSlider = document.getElementById('ssAngle');

        const ssLengthSlider = document.getElementById('ssLength');

        if (ssFreqSlider) {

            ssFreqSlider.addEventListener('input', () => {

                ssFrequency = parseFloat(ssFreqSlider.value);

                const el = document.getElementById('ssFreqVal');

                if (el) el.textContent = ssFrequency.toFixed(1) + '/s';

            });

        }

        if (ssAngleSlider) {

            ssAngleSlider.addEventListener('input', () => {

                ssAngleDeg = parseInt(ssAngleSlider.value);

                const el = document.getElementById('ssAngleVal');

                if (el) el.textContent = ssAngleDeg + '°';

            });

        }

        if (ssLengthSlider) {

            ssLengthSlider.addEventListener('input', () => {

                ssLength = parseFloat(ssLengthSlider.value);

                const el = document.getElementById('ssLengthVal');

                if (el) el.textContent = ssLength.toFixed(1) + 's';

            });

        }

        const ssSizeSlider = document.getElementById('ssSize');

        if (ssSizeSlider) {

            ssSizeSlider.addEventListener('input', () => {

                ssSize = parseFloat(ssSizeSlider.value);

                const el = document.getElementById('ssSizeVal');

                if (el) el.textContent = ssSize.toFixed(1) + 'x';

            });

        }

        

        // ── Origin picker drag interaction ───────────────────────

        // The .ss-origin-frame element represents 0-100% of canvas.

        // The surrounding margin (20px) is the off-screen zone.

        // The dot can be dragged anywhere in the picker area (including the margin).

        // Origin coords are stored as % of canvas: <0 or >100 = off-screen.

        const ssFrame = document.getElementById('ssOriginFrame');

        const ssDot = document.getElementById('ssOriginDot');

        const ssCoords = document.getElementById('ssOriginCoords');

        

        function updateOriginDot() {

            if (!ssFrame || !ssDot) return;

            // Map ssOriginX/Y (% of canvas) → CSS left/top (% of frame element)

            ssDot.style.left = ssOriginX + '%';

            ssDot.style.top = ssOriginY + '%';

            if (ssCoords) ssCoords.textContent = Math.round(ssOriginX) + '%, ' + Math.round(ssOriginY) + '%';

        }

        

        function originFromPointer(e) {

            if (!ssFrame) return;

            const rect = ssFrame.getBoundingClientRect();

            // Pointer position relative to the frame element as % (can go outside 0-100)

            const px = ((e.clientX - rect.left) / rect.width) * 100;

            const py = ((e.clientY - rect.top) / rect.height) * 100;

            // Clamp to roughly -60% to 160% (generous off-screen range)

            ssOriginX = Math.max(-60, Math.min(160, px));

            ssOriginY = Math.max(-60, Math.min(160, py));

            updateOriginDot();

        }

        

        // Sync origin frame aspect ratio to actual canvas dimensions

        function syncFrameRatio() {

            if (!ssFrame || !canvas) return;

            const cw = canvas.width || 1;

            const ch = canvas.height || 1;

            ssFrame.style.setProperty('--ss-frame-ratio', (cw / ch).toFixed(4));

        }

        syncFrameRatio();

        // Watch for canvas size changes

        if (typeof ResizeObserver !== 'undefined' && canvas) {

            new ResizeObserver(syncFrameRatio).observe(canvas);

        }

        // Also hook into the global updateCanvasSize if available

        const origUpdateCanvasSize = window.updateCanvasSize;

        if (typeof origUpdateCanvasSize === 'function') {

            window.updateCanvasSize = function() {

                origUpdateCanvasSize.apply(this, arguments);

                syncFrameRatio();

            };

        }

        

        if (ssFrame) {

            // Use the picker container (which includes margin) as the hit area

            const ssPickerEl = document.getElementById('ssOriginPicker');

            let draggingOrigin = false;

            

            const startDrag = (e) => {

                draggingOrigin = true;

                originFromPointer(e.touches ? e.touches[0] : e);

                e.preventDefault();

            };

            const moveDrag = (e) => {

                if (!draggingOrigin) return;

                originFromPointer(e.touches ? e.touches[0] : e);

                e.preventDefault();

            };

            const endDrag = () => { draggingOrigin = false; };

            

            (ssPickerEl || ssFrame).addEventListener('mousedown', startDrag);

            document.addEventListener('mousemove', moveDrag);

            document.addEventListener('mouseup', endDrag);

            (ssPickerEl || ssFrame).addEventListener('touchstart', startDrag, { passive: false });

            document.addEventListener('touchmove', moveDrag, { passive: false });

            document.addEventListener('touchend', endDrag);

            

            // Set initial dot position

            updateOriginDot();

        }

        

        // Variance slider

        const ssGravitySlider = document.getElementById('ssGravity');

        if (ssGravitySlider) {

            ssGravitySlider.addEventListener('input', () => {

                ssGravity = parseFloat(ssGravitySlider.value);

                const el = document.getElementById('ssGravityVal');

                if (el) el.textContent = ssGravity.toFixed(2);

            });

        }

        const ssVarianceSlider = document.getElementById('ssVariance');

        if (ssVarianceSlider) {

            ssVarianceSlider.addEventListener('input', () => {

                ssVariance = parseInt(ssVarianceSlider.value);

                const el = document.getElementById('ssVarianceVal');

                if (el) el.textContent = ssVariance + '%';

            });

        }

        

        // Portal animation

