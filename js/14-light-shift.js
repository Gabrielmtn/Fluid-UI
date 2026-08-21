// Light Shift - Color shifts for overexposed lighting areas
(function() {
    'use strict';

    // Light shift state
    window.lightShift = {
        enabled: false,
        colorPath: [],      // Array of {hue, saturation, lightness, position} where position is 0-1 along path
        playheadPosition: 0, // Current position in animation 0-1
        speed: 0.5,         // Animation speed
        threshold: 0.85,    // Brightness threshold for "overexposed" (0-1)
        intensity: 0.5,     // How much to shift the color (0-1)
        saturation: 1.0,    // Saturation multiplier for shifted colors (0-1)
        mode: 'replace'     // Blend mode: 'replace', 'tint', 'overlay', 'multiply', 'screen'
    };

    let canvas, ctx;
    let isDrawing = false;
    let canvasSize = 180;
    let animationFrame = null;
    let currentPathIndex = 0;
    let _baseGradientCache = null; // Cached pixel-by-pixel HSL gradient
    let activePointerId = null;
    // Shift held mid-drag lifts the pen: nothing is recorded while it's down,
    // and the next point starts a fresh stroke instead of continuing this one.
    let pendingGap = false;

    function init() {
        loadSettings();
        setupEventListeners();
        startAnimation();
    }

    function setupEventListeners() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setupEventListeners());
            return;
        }

        // Toggle checkbox
        const checkbox = document.getElementById('enableLightShift');
        const controls = document.getElementById('lightShiftControls');
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                window.lightShift.enabled = e.target.checked;
                if (controls) {
                    controls.style.display = e.target.checked ? 'block' : 'none';
                }
                if (e.target.checked) {
                    createUI();
                }
                saveSettings();
            });
        }

        // Blend mode select
        const blendModeSelect = document.getElementById('lightShiftMode');
        // Mirror the selected option's tooltip onto the select itself, so
        // hovering the closed dropdown explains the active mode.
        const syncModeTooltip = (sel) => {
            if (!sel) return;
            const opt = sel.options[sel.selectedIndex];
            if (opt && opt.title) sel.title = opt.title;
        };
        if (blendModeSelect) {
            syncModeTooltip(blendModeSelect);
            blendModeSelect.addEventListener('change', (e) => {
                window.lightShift.mode = e.target.value;
                syncModeTooltip(e.target);
                saveSettings();
            });
        }

        // Speed slider
        const speedSlider = document.getElementById('lightShiftSpeed');
        const speedValue = document.getElementById('lightShiftSpeedValue');
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                window.lightShift.speed = parseFloat(e.target.value);
                if (speedValue) speedValue.textContent = window.lightShift.speed.toFixed(2);
                saveSettings();
            });
        }

        // Threshold slider
        const thresholdSlider = document.getElementById('lightShiftThreshold');
        const thresholdValue = document.getElementById('lightShiftThresholdValue');
        if (thresholdSlider) {
            thresholdSlider.addEventListener('input', (e) => {
                window.lightShift.threshold = parseFloat(e.target.value);
                if (thresholdValue) thresholdValue.textContent = window.lightShift.threshold.toFixed(2);
                saveSettings();
            });
        }

        // Intensity slider
        const intensitySlider = document.getElementById('lightShiftIntensity');
        const intensityValue = document.getElementById('lightShiftIntensityValue');
        if (intensitySlider) {
            intensitySlider.addEventListener('input', (e) => {
                window.lightShift.intensity = parseFloat(e.target.value);
                if (intensityValue) intensityValue.textContent = window.lightShift.intensity.toFixed(2);
                saveSettings();
            });
        }

        // Saturation slider
        const saturationSlider = document.getElementById('lightShiftSaturation');
        const saturationValue = document.getElementById('lightShiftSaturationValue');
        if (saturationSlider) {
            saturationSlider.addEventListener('input', (e) => {
                window.lightShift.saturation = parseFloat(e.target.value);
                if (saturationValue) saturationValue.textContent = window.lightShift.saturation.toFixed(2);
                saveSettings();
            });
        }

        // Clear path button
        const clearBtn = document.getElementById('clearLightShiftPath');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                window.lightShift.colorPath = [];
                window.lightShift.playheadPosition = 0;
                drawColorPicker();
                saveSettings();
            });
        }
    }

    function createUI() {
        canvas = document.getElementById('lightShiftWheel');
        if (!canvas) return;

        ctx = canvas.getContext('2d');
        
        // Set canvas size (square)
        const container = canvas.parentElement;
        const cw = container.clientWidth;
        canvasSize = cw > 0 ? Math.min(cw, 200) : 180;
        canvas.width = canvasSize;
        canvas.height = canvasSize;

        // Draw initial color picker
        drawColorPicker();

        // Pointer events + capture: the pointer is allowed to wander off the
        // swatch mid-drag (or off the window entirely) and the stroke survives.
        // addPointFromEvent clamps, so the path just hugs the edge until it
        // comes back. The old mouseleave handler ended the stroke right there.
        canvas.style.touchAction = 'none';
        if (!canvas.__lsBound) {
            canvas.__lsBound = true;
            canvas.addEventListener('pointerdown', startDrawing);
            canvas.addEventListener('pointermove', draw);
            canvas.addEventListener('pointerup', stopDrawing);
            canvas.addEventListener('pointercancel', stopDrawing);
            canvas.addEventListener('lostpointercapture', stopDrawing);
        }
    }

    function ensureBaseGradientCache() {
        if (_baseGradientCache && _baseGradientCache.width === canvasSize && _baseGradientCache.height === canvasSize) return;
        _baseGradientCache = document.createElement('canvas');
        _baseGradientCache.width = canvasSize;
        _baseGradientCache.height = canvasSize;
        const offCtx = _baseGradientCache.getContext('2d');
        const imageData = offCtx.createImageData(canvasSize, canvasSize);
        const data = imageData.data;
        for (let y = 0; y < canvasSize; y++) {
            const saturation = 100 - (y / canvasSize) * 100;
            for (let x = 0; x < canvasSize; x++) {
                const hue = (x / canvasSize) * 360;
                const rgb = hslToRgb(hue, saturation, 50);
                const idx = (y * canvasSize + x) * 4;
                data[idx] = rgb[0];
                data[idx + 1] = rgb[1];
                data[idx + 2] = rgb[2];
                data[idx + 3] = 255;
            }
        }
        offCtx.putImageData(imageData, 0, 0);
    }

    function hslToRgb(h, s, l) {
        s /= 100; l /= 100;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;
        let r = 0, g = 0, b = 0;
        if (h < 60) { r = c; g = x; }
        else if (h < 120) { r = x; g = c; }
        else if (h < 180) { g = c; b = x; }
        else if (h < 240) { g = x; b = c; }
        else if (h < 300) { r = x; b = c; }
        else { r = c; b = x; }
        return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
    }

    // Stroke helper: a Shift-gap starts a new subpath instead of drawing a
    // line into it. A point stranded between two gaps still gets its round dot.
    function tracePath() {
        const path = window.lightShift.colorPath;
        ctx.beginPath();
        for (let i = 0; i < path.length; i++) {
            const p = path[i];
            if (i === 0 || p.gap) {
                ctx.moveTo(p.x, p.y);
                const next = path[i + 1];
                if (!next || next.gap) ctx.lineTo(p.x, p.y); // lone point → dot
            } else {
                ctx.lineTo(p.x, p.y);
            }
        }
    }

    function drawColorPicker() {
        if (!ctx) return;

        // Clear canvas and blit cached gradient (created once, not per-frame)
        ensureBaseGradientCache();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(_baseGradientCache, 0, 0);

        // Draw user's path if exists
        if (window.lightShift.colorPath.length > 0) {
            // Draw path with gradient based on actual colors along the path
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // A Shift-gap is a jump, not a stroke — hint it with a faint dashed
            // tie so the path still reads as one journey.
            if (window.lightShift.colorPath.some(p => p.gap)) {
                ctx.save();
                ctx.setLineDash([3, 4]);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                for (let i = 1; i < window.lightShift.colorPath.length; i++) {
                    if (!window.lightShift.colorPath[i].gap) continue;
                    const from = window.lightShift.colorPath[i - 1];
                    const to = window.lightShift.colorPath[i];
                    ctx.moveTo(from.x, from.y);
                    ctx.lineTo(to.x, to.y);
                }
                ctx.stroke();
                ctx.restore();
            }
            
            // Draw multiple passes for glow effect
            // Outer glow
            ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
            ctx.shadowBlur = 12;
            ctx.lineWidth = 8;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            tracePath();
            ctx.stroke();
            
            // Draw colored segments
            ctx.shadowBlur = 8;
            ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
            for (let i = 0; i < window.lightShift.colorPath.length - 1; i++) {
                const point1 = window.lightShift.colorPath[i];
                const point2 = window.lightShift.colorPath[i + 1];
                if (point2.gap) continue; // Shift-gap: nothing drawn across the jump
                
                // Create gradient for this segment
                const gradient = ctx.createLinearGradient(point1.x, point1.y, point2.x, point2.y);
                gradient.addColorStop(0, `hsl(${point1.hue}, ${point1.saturation}%, 60%)`);
                gradient.addColorStop(1, `hsl(${point2.hue}, ${point2.saturation}%, 60%)`);
                
                ctx.strokeStyle = gradient;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.moveTo(point1.x, point1.y);
                ctx.lineTo(point2.x, point2.y);
                ctx.stroke();
            }
            
            // Inner white highlight
            ctx.shadowBlur = 4;
            ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 2;
            tracePath();
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Draw playhead (animated circle following the path)
            if (window.lightShift.colorPath.length > 0) {
                // The exact sample the shader gets, so the ring on the swatch
                // and the color on the canvas can never disagree.
                const s = sampleAtPlayhead();
                const x = s.x;
                const y = s.y;
                const hue = s.hue;
                const saturation = s.saturation;
                
                // Outer glow ring
                ctx.shadowColor = `hsla(${hue}, ${saturation}%, 50%, 0.8)`;
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(x, y, 12, 0, Math.PI * 2);
                ctx.strokeStyle = `hsla(${hue}, ${saturation}%, 70%, 0.6)`;
                ctx.lineWidth = 3;
                ctx.stroke();
                
                // Middle ring
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(x, y, 9, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.fill();
                ctx.strokeStyle = `hsl(${hue}, ${saturation}%, 40%)`;
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Inner colored core - use the ACTUAL shader color
                ctx.shadowBlur = 4;
                const shaderColor = getCurrentShiftColor();
                const shaderColorHex = `rgb(${Math.round(shaderColor.r * 255)}, ${Math.round(shaderColor.g * 255)}, ${Math.round(shaderColor.b * 255)})`;
                ctx.shadowColor = shaderColorHex;
                ctx.beginPath();
                ctx.arc(x, y, 5, 0, Math.PI * 2);
                const gradient = ctx.createRadialGradient(x, y, 0, x, y, 5);
                gradient.addColorStop(0, shaderColorHex);
                gradient.addColorStop(1, shaderColorHex);
                ctx.fillStyle = gradient;
                ctx.fill();
                
                ctx.shadowBlur = 0;
            }
            
            // Draw current shader color indicator in bottom-right corner
            if (window.lightShift.colorPath.length > 0) {
                const shaderColor = getCurrentShiftColor();
                const size = 30;
                const margin = 10;
                const x = canvasSize - size - margin;
                const y = canvasSize - size - margin;
                
                // Background
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.fillRect(x - 2, y - 2, size + 4, size + 4);
                
                // Shader color swatch
                ctx.fillStyle = `rgb(${Math.round(shaderColor.r * 255)}, ${Math.round(shaderColor.g * 255)}, ${Math.round(shaderColor.b * 255)})`;
                ctx.fillRect(x, y, size, size);
                
                // Border
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, size, size);
                
                // Label
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.font = '9px monospace';
                ctx.textAlign = 'right';
                ctx.fillText('Shader', canvasSize - margin, y - 5);
            }
        }
    }

    function startDrawing(e) {
        if (e.button !== undefined && e.button !== 0) return; // primary button only
        if (e.preventDefault) e.preventDefault();             // no text-select drag
        isDrawing = true;
        pendingGap = false;
        window.lightShift.colorPath = []; // Start new path
        currentPathIndex = 0;
        if (e.pointerId !== undefined && canvas.setPointerCapture) {
            activePointerId = e.pointerId;
            try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
        }
        addPointFromEvent(e);
        drawColorPicker();
    }

    function draw(e) {
        if (!isDrawing) return;
        // Easter egg: hold Shift to lift the pen. Nothing is recorded while
        // it's down, and the first point after it starts a new stroke — the
        // playhead cuts to that color instead of sweeping across to it.
        if (e.shiftKey) {
            if (window.lightShift.colorPath.length > 0) pendingGap = true;
            return;
        }
        addPointFromEvent(e);
        drawColorPicker();
    }

    function stopDrawing() {
        if (activePointerId !== null && canvas && canvas.releasePointerCapture) {
            try { canvas.releasePointerCapture(activePointerId); } catch (_) {}
            activePointerId = null;
        }
        if (isDrawing) {
            isDrawing = false;
            pendingGap = false;
            saveSettings();
        }
    }

    function addPointFromEvent(e) {
        const rect = canvas.getBoundingClientRect();
        // Scale viewport pixels to canvas pixels (accounts for CSS zoom on parent)
        const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
        const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
        const x = ((e.clientX || e.pageX) - rect.left) * scaleX;
        const y = ((e.clientY || e.pageY) - rect.top) * scaleY;

        // Clamp to canvas bounds — this is what lets the path hug the edge
        // while the pointer is off wandering. The one-pixel inset keeps the
        // right border on the gradient's last hue (~358°) instead of 360°,
        // which would snap the color back to red as you slid out.
        const clampedX = Math.max(0, Math.min(canvasSize - 1, x));
        const clampedY = Math.max(0, Math.min(canvasSize - 1, y));

        // Calculate color from position
        const hue = (clampedX / canvasSize) * 360;
        const saturation = 100 - (clampedY / canvasSize) * 100;
        const lightness = 50;

        // Only add point if it's different enough from the last point (avoid duplicates)
        const lastPoint = window.lightShift.colorPath[window.lightShift.colorPath.length - 1];
        if (!lastPoint || Math.abs(lastPoint.x - clampedX) > 2 || Math.abs(lastPoint.y - clampedY) > 2) {
            // Store actual pixel coordinates for drawing
            const point = { x: clampedX, y: clampedY, hue, saturation, lightness };
            // gap = "the link INTO this point is a jump, not a stroke"
            if (pendingGap && lastPoint) {
                point.gap = true;
                pendingGap = false;
            }
            window.lightShift.colorPath.push(point);
        }
    }

    let _lightShiftLastDraw = 0;
    const _lightShiftDrawInterval = 33; // ~30fps for playhead animation (visual only)

    // Gated to ~60 Hz: rAF is uncapped in the Electron build, and the playhead
    // advances PER CALL — ungated, the color path cycled ~16× faster than the
    // speed slider suggests on high-refresh rigs.
    let _lsAdvanceLast = 0;
    function startAnimation() {
        function animate() {
            animationFrame = requestAnimationFrame(animate);

            if (!window.lightShift.enabled || window.lightShift.colorPath.length === 0) return;
            const _advNow = performance.now();
            if (_advNow - _lsAdvanceLast < 15) return;
            _lsAdvanceLast = _advNow;

            // Advance playhead along the path with smoother increments
            // Use smaller steps for smoother interpolation
            const speed = window.lightShift.speed * 0.1; // Smaller increment for smoother transitions
            currentPathIndex += speed;

            // Loop back to start
            if (currentPathIndex >= window.lightShift.colorPath.length) {
                currentPathIndex = 0;
            }

            // Throttle canvas redraws — playhead visual doesn't need 60fps
            const now = performance.now();
            if (now - _lightShiftLastDraw < _lightShiftDrawInterval) return;
            _lightShiftLastDraw = now;

            // Redraw to show playhead movement
            if (canvas) {
                drawColorPicker();
            }
        }
        animate();
    }

    // One sample of the path at the playhead — position AND color, so the
    // on-canvas playhead and the shader color are always the same reading.
    function sampleAtPlayhead() {
        const path = window.lightShift.colorPath;
        if (path.length === 0) return null;
        if (path.length === 1) return path[0];

        const index = Math.floor(currentPathIndex) % path.length;
        const nextIndex = (index + 1) % path.length;
        const t = currentPathIndex - Math.floor(currentPathIndex); // Fractional part

        const point1 = path[index];
        const point2 = path[nextIndex];

        // A Shift-gap is a cut, not a crossfade: hold point1 for the length of
        // the gap segment, then land on point2 — the color jumps.
        if (point2.gap) return point1;

        // Interpolate colour (handle hue wrapping — shortest way round)
        let hue1 = point1.hue;
        let hue2 = point2.hue;
        if (Math.abs(hue2 - hue1) > 180) {
            if (hue2 > hue1) {
                hue1 += 360;
            } else {
                hue2 += 360;
            }
        }

        return {
            x: point1.x * (1 - t) + point2.x * t,
            y: point1.y * (1 - t) + point2.y * t,
            hue: (hue1 * (1 - t) + hue2 * t) % 360,
            saturation: point1.saturation * (1 - t) + point2.saturation * t,
            lightness: point1.lightness * (1 - t) + point2.lightness * t
        };
    }

    // HSL (path units) → normalized RGB, with the saturation multiplier applied
    function hslToRgbNorm(hue, saturation, lightness) {
        const h = hue / 360;
        const s = (saturation / 100) * window.lightShift.saturation;
        const l = lightness / 100;

        if (s === 0) return { r: l, g: l, b: l };

        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        return {
            r: hue2rgb(p, q, h + 1/3),
            g: hue2rgb(p, q, h),
            b: hue2rgb(p, q, h - 1/3)
        };
    }

    function getCurrentShiftColor() {
        const sample = sampleAtPlayhead();
        if (!sample) return { r: 1, g: 1, b: 1 }; // White (no shift)
        return hslToRgbNorm(sample.hue, sample.saturation, sample.lightness);
    }

    // Expose function for shader to get current color
    window.lightShift.getCurrentColor = getCurrentShiftColor;

    // Expose getPath / setPath for preset save/load and mutation engine
    window.lightShift.getPath = function () {
        return JSON.parse(JSON.stringify(window.lightShift.colorPath));
    };
    window.lightShift.setPath = function (path) {
        window.lightShift.colorPath = JSON.parse(JSON.stringify(path || []));
        currentPathIndex = 0;
        if (canvas) drawColorPicker();
        // A remote look-mirror apply is somebody else's path passing through.
        // Persisting it would overwrite the watcher's own saved path — their
        // work, gone after a session as a guest. Local edits still save.
        if (!window.__mpApplyingRemote) saveSettings();
    };

    function saveSettings() {
        if (typeof window.settingsManager !== 'undefined') {
            window.settingsManager.set('lightShift.enabled', window.lightShift.enabled);
            window.settingsManager.set('lightShift.colorPath', JSON.stringify(window.lightShift.colorPath));
            window.settingsManager.set('lightShift.speed', window.lightShift.speed);
            window.settingsManager.set('lightShift.threshold', window.lightShift.threshold);
            window.settingsManager.set('lightShift.intensity', window.lightShift.intensity);
            window.settingsManager.set('lightShift.saturation', window.lightShift.saturation);
            window.settingsManager.set('lightShift.mode', window.lightShift.mode);
        }
    }

    function loadSettings() {
        if (typeof window.settingsManager !== 'undefined') {
            window.lightShift.enabled = window.settingsManager.get('lightShift.enabled', false);
            
            const pathJson = window.settingsManager.get('lightShift.colorPath', '[]');
            try {
                window.lightShift.colorPath = JSON.parse(pathJson);
            } catch (e) {
                window.lightShift.colorPath = [];
            }
            
            window.lightShift.speed = window.settingsManager.get('lightShift.speed', 0.5);
            window.lightShift.threshold = window.settingsManager.get('lightShift.threshold', 0.85);
            window.lightShift.intensity = window.settingsManager.get('lightShift.intensity', 0.5);
            window.lightShift.saturation = window.settingsManager.get('lightShift.saturation', 1.0);
            window.lightShift.mode = window.settingsManager.get('lightShift.mode', 'replace');

            // Update UI
            setTimeout(() => {
                const checkbox = document.getElementById('enableLightShift');
                const controls = document.getElementById('lightShiftControls');
                const blendModeSelect = document.getElementById('lightShiftMode');
                const speedSlider = document.getElementById('lightShiftSpeed');
                const thresholdSlider = document.getElementById('lightShiftThreshold');
                const intensitySlider = document.getElementById('lightShiftIntensity');
                const saturationSlider = document.getElementById('lightShiftSaturation');
                const speedValue = document.getElementById('lightShiftSpeedValue');
                const thresholdValue = document.getElementById('lightShiftThresholdValue');
                const intensityValue = document.getElementById('lightShiftIntensityValue');
                const saturationValue = document.getElementById('lightShiftSaturationValue');

                if (checkbox) checkbox.checked = window.lightShift.enabled;
                if (controls) controls.style.display = window.lightShift.enabled ? 'block' : 'none';
                if (blendModeSelect) {
                    blendModeSelect.value = window.lightShift.mode;
                    const _o = blendModeSelect.options[blendModeSelect.selectedIndex];
                    if (_o && _o.title) blendModeSelect.title = _o.title;
                }

                if (speedSlider) {
                    speedSlider.value = window.lightShift.speed;
                    speedSlider.style.setProperty('--val', String(window.lightShift.speed));
                    if (speedValue) speedValue.textContent = window.lightShift.speed.toFixed(2);
                }
                if (thresholdSlider) {
                    thresholdSlider.value = window.lightShift.threshold;
                    thresholdSlider.style.setProperty('--val', String(window.lightShift.threshold));
                    if (thresholdValue) thresholdValue.textContent = window.lightShift.threshold.toFixed(2);
                }
                if (intensitySlider) {
                    intensitySlider.value = window.lightShift.intensity;
                    intensitySlider.style.setProperty('--val', String(window.lightShift.intensity));
                    if (intensityValue) intensityValue.textContent = window.lightShift.intensity.toFixed(2);
                }
                if (saturationSlider) {
                    saturationSlider.value = window.lightShift.saturation;
                    saturationSlider.style.setProperty('--val', String(window.lightShift.saturation));
                    if (saturationValue) saturationValue.textContent = window.lightShift.saturation.toFixed(2);
                }

                if (window.lightShift.enabled) {
                    createUI();
                }
            }, 100);
        }
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
