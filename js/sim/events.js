// Event Listeners - Mouse, Touch, Wheel, Sliders
// Extracted from 05-fluid-sim.js - EXACT COPY

// Mouse and Touch Event Listeners
canvas.addEventListener('mousedown', (e) => {
    if (isPaused) return;
    
    if (e.button === 2) {
        e.preventDefault();
        isRightMouseDown = true;
        isReplayActive = true;
        replayStroke(true);
        return;
    }
    
    const coords = getCanvasCoordinates(e);
    pointer.down = true;
    pointer.moved = false;
    pointer.x = coords.x;
    pointer.y = coords.y;
    pointer.dx = 0;
    pointer.dy = 0;
    updateColor();
    // Begin stroke recording and include initial splat
    startStroke(pointer.x, pointer.y);
    pushStrokeEvent(pointer.x, pointer.y, 0, 0, pointer.color);
    if (recEnabled) recRecordInteraction(coords.x, coords.y, 0, 0, pointer.color);
    splat(pointer.x, pointer.y, 0, 0, pointer.color);
    if (typeof broadcastSplat === 'function') {
        broadcastSplat(
            coords.x / canvas.width,
            coords.y / canvas.height,
            0,
            0,
            pointer.color,
            (typeof animationMultiplier === 'number' ? animationMultiplier : 1),
            config.SPLAT_RADIUS
        );
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (isPaused || isReplayActive) return;
    const coords = getCanvasCoordinates(e);
    pointer.moved = pointer.down;
    pointer.dx = (coords.x - pointer.x) * 10.0;
    pointer.dy = (coords.y - pointer.y) * 10.0;
    pointer.x = coords.x;
    pointer.y = coords.y;

    if (typeof broadcastCursor === 'function') {
        broadcastCursor(coords.x / canvas.width, coords.y / canvas.height);
    }

    if (pointer.down) {
        trackStrokeMove(e);
        if (recEnabled) recRecordInteraction(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
        
        if (typeof broadcastSplat === 'function') {
            if (!canvas._lastBroadcast || Date.now() - canvas._lastBroadcast > 33) {
                broadcastSplat(
                    coords.x / canvas.width,
                    coords.y / canvas.height,
                    pointer.dx / canvas.width,
                    pointer.dy / canvas.height,
                    pointer.color,
                    (typeof animationMultiplier === 'number' ? animationMultiplier : 1),
                    config.SPLAT_RADIUS
                );
                canvas._lastBroadcast = Date.now();
            }
        }
    }
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 2) {
        isRightMouseDown = false;
        isReplayActive = false;
        customCursor.style.opacity = '0';
        trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    } else if (e.button === 0) {
        if (pointer.down && typeof broadcastPointerUp === 'function') {
            broadcastPointerUp();
        }
        pointer.down = false;
        pointer.moved = false;
        setTimeout(() => {
            trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
        }, FADE_END);
    }
});

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (isPaused) return;
    const touch = e.touches[0];
    const coords = getCanvasCoordinates(touch);
    pointer.down = true;
    pointer.moved = false;
    pointer.x = coords.x;
    pointer.y = coords.y;
    pointer.dx = 0;
    pointer.dy = 0;
    updateColor();
    if (recEnabled) recRecordInteraction(coords.x, coords.y, 0, 0, pointer.color);
    splat(pointer.x, pointer.y, 0, 0, pointer.color);
    if (typeof broadcastSplat === 'function') {
        broadcastSplat(
            coords.x / canvas.width,
            coords.y / canvas.height,
            0,
            0,
            pointer.color,
            (typeof animationMultiplier === 'number' ? animationMultiplier : 1),
            config.SPLAT_RADIUS
        );
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (isPaused) return;
    const touch = e.touches[0];
    const coords = getCanvasCoordinates(touch);
    pointer.moved = pointer.down;
    pointer.dx = (coords.x - pointer.x) * 10.0;
    pointer.dy = (coords.y - pointer.y) * 10.0;
    pointer.x = coords.x;
    pointer.y = coords.y;
    if (pointer.down) {
        if (recEnabled) recRecordInteraction(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
        
        if (typeof broadcastSplat === 'function') {
            const now = Date.now();
            if (!canvas._lastTouchBroadcast || now - canvas._lastTouchBroadcast > 50) {
                broadcastSplat(
                    coords.x / canvas.width,
                    coords.y / canvas.height,
                    pointer.dx / canvas.width,
                    pointer.dy / canvas.height,
                    pointer.color,
                    (typeof animationMultiplier === 'number' ? animationMultiplier : 1),
                    config.SPLAT_RADIUS
                );
                canvas._lastTouchBroadcast = now;
            }
        }
    }
}, { passive: false });

window.addEventListener('touchend', () => {
    if (pointer.down) {
        pointer.down = false;
        pointer.moved = false;
        if (typeof broadcastPointerUp === 'function') {
            broadcastPointerUp();
        }
    }
});

window.addEventListener('touchcancel', () => {
    if (pointer.down) {
        pointer.down = false;
        pointer.moved = false;
        if (typeof broadcastPointerUp === 'function') {
            broadcastPointerUp();
        }
    }
});

// Slider Configuration
const sliderConfig = {
    densityDissipation: { key: 'DENSITY_DISSIPATION', decimals: 4 },
    velocityDissipation: { key: 'VELOCITY_DISSIPATION', decimals: 4 },
    pressureDissipation: { key: 'PRESSURE_DISSIPATION', decimals: 3 },
    pressureIteration: { key: 'PRESSURE_ITERATIONS', decimals: 0 },
    velocityInfluence: { key: 'VELOCITY_INFLUENCE', decimals: 1 },
    curl: { key: 'CURL', decimals: 0 }
};

// Scrollwheel to adjust brush size, density (Shift), or motion isolation (Ctrl+Shift) on canvas area
let lastDensitySnapTime = 0;

canvasArea.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    if (e.ctrlKey && e.shiftKey) {
        // Ctrl+Shift+Scroll: Adjust Motion Isolation (Velocity Influence)
        const velSlider = document.getElementById('velocityInfluence');
        const velValueSpan = document.getElementById('velocityInfluenceValue');
        if (velSlider) {
            let currentValue = parseFloat(velSlider.value);
            const minValue = parseFloat(velSlider.min);
            const maxValue = parseFloat(velSlider.max);
            const stepSize = parseFloat(velSlider.step) || 0.5;
            
            let newValue;
            if (e.deltaY < 0) {
                // Scrolling up - increase motion isolation influence
                newValue = currentValue + stepSize;
                if (newValue > maxValue) newValue = maxValue;
            } else {
                // Scrolling down - decrease motion isolation influence
                newValue = currentValue - stepSize;
                if (newValue < minValue) newValue = minValue;
            }
            
            // Update slider and config
            velSlider.value = String(newValue);
            velSlider.style.setProperty('--val', newValue);
            config.VELOCITY_INFLUENCE = newValue;
            if (velValueSpan) velValueSpan.textContent = newValue.toFixed(1);
        }
    } else if (e.ctrlKey && e.altKey) {
        // Ctrl+Alt+Scroll: Adjust Curl
        const cSlider = document.getElementById('curl');
        const cSpan = document.getElementById('curlValue');
        if (cSlider) {
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
        // Normal scroll: Adjust brush size
        const brushSizeSlider = document.getElementById('brushSize');
        const currentValue = parseFloat(brushSizeSlider.value);
        const minValue = parseFloat(brushSizeSlider.min);
        const maxValue = parseFloat(brushSizeSlider.max);
        const stepSize = 0.5;
        
        let newValue;
        if (e.deltaY < 0) {
            // Scrolling up - increase brush size
            newValue = currentValue + stepSize;
            if (newValue > maxValue) newValue = maxValue;
        } else {
            // Scrolling down - decrease brush size
            newValue = currentValue - stepSize;
            if (newValue < minValue) newValue = minValue;
        }
        
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
    const valueSpanId = id === 'pressureIteration' ? 'iterationValue' : 
                        id.replace('Dissipation', '') + 'Value';
    const valueSpan = document.getElementById(valueSpanId);
    
    slider.addEventListener('input', (e) => {
        let val = parseFloat(e.target.value);
        
        // Clear active preset when manually adjusting sliders
        if (typeof window.clearActivePreset === 'function') {
            window.clearActivePreset();
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
        valueSpan.textContent = cfg.decimals === 0 ? val : val.toFixed(cfg.decimals);
        
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

function updateSliderValues() {
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

// Export
window.Events = {
    sliderConfig,
    updateSliderValues
};
