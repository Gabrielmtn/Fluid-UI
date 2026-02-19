// Light Source Control - Creates illusion of depth via directional lighting
(function() {
    'use strict';

    // Light source state
    window.lightSource = {
        enabled: false,
        x: 0.5,  // Normalized 0-1
        y: 0.5,  // Normalized 0-1
        intensity: 0.5,  // 0-1
        ambient: 0.3,    // Ambient light level 0-1
        mode: 'manual',  // 'manual', 'random'
        speed: 0.5       // Animation speed 0-1
    };

    let isDragging = false;
    let gridContainer, lightDot;
    
    // Animation state
    let animationFrame = null;
    let targetX = 0.5;
    let targetY = 0.5;
    let velocityX = 0;
    let velocityY = 0;

    function init() {
        loadSettings();
        setupEventListeners();
        startAnimation();
    }

    function createUI() {
        // UI is now in HTML, just get references
        gridContainer = document.getElementById('lightGridContainer');
        lightDot = document.getElementById('lightDot');
        
        if (gridContainer && lightDot) {
            updateDotPosition();
        }
    }

    function setupEventListeners() {
        // Wait for DOM
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setupEventListeners());
            return;
        }

        // Checkbox toggle
        const checkbox = document.getElementById('enableLighting');
        const controls = document.getElementById('lightSourceControls');
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                window.lightSource.enabled = e.target.checked;
                if (controls) {
                    controls.style.display = e.target.checked ? 'block' : 'none';
                }
                if (e.target.checked) {
                    createUI();
                }
                saveSettings();
            });
        }

        // Mode select
        const modeSelect = document.getElementById('lightMode');
        if (modeSelect) {
            modeSelect.addEventListener('change', (e) => {
                window.lightSource.mode = e.target.value;
                updateModeUI();
                saveSettings();
            });
        }

        // Speed slider
        const speedSlider = document.getElementById('lightSpeed');
        const speedValue = document.getElementById('lightSpeedValue');
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                window.lightSource.speed = parseFloat(e.target.value);
                if (speedValue) speedValue.textContent = window.lightSource.speed.toFixed(2);
                saveSettings();
            });
        }

        // Intensity slider
        const intensitySlider = document.getElementById('lightIntensity');
        const intensityValue = document.getElementById('lightIntensityValue');
        if (intensitySlider) {
            intensitySlider.addEventListener('input', (e) => {
                window.lightSource.intensity = parseFloat(e.target.value);
                if (intensityValue) intensityValue.textContent = window.lightSource.intensity.toFixed(2);
                saveSettings();
            });
        }

        // Ambient slider
        const ambientSlider = document.getElementById('lightAmbient');
        const ambientValue = document.getElementById('lightAmbientValue');
        if (ambientSlider) {
            ambientSlider.addEventListener('input', (e) => {
                window.lightSource.ambient = parseFloat(e.target.value);
                if (ambientValue) ambientValue.textContent = window.lightSource.ambient.toFixed(2);
                saveSettings();
            });
        }

        // Grid dragging (only in manual mode)
        setTimeout(() => {
            gridContainer = document.getElementById('lightGridContainer');
            lightDot = document.getElementById('lightDot');
            
            if (gridContainer) {
                gridContainer.addEventListener('mousedown', startDrag);
                window.addEventListener('mousemove', drag);
                window.addEventListener('mouseup', endDrag);
                gridContainer.addEventListener('touchstart', startDrag, { passive: false });
                window.addEventListener('touchmove', drag, { passive: false });
                window.addEventListener('touchend', endDrag);
            }
        }, 100);
    }

    function updateModeUI() {
        const speedControl = document.getElementById('lightSpeedControl');
        const gridContainer = document.getElementById('lightGridContainer');
        
        if (speedControl) {
            speedControl.style.display = 
                (window.lightSource.mode === 'random') ? 'flex' : 'none';
        }
        
        if (gridContainer) {
            gridContainer.style.pointerEvents = 
                (window.lightSource.mode === 'manual') ? 'auto' : 'none';
            gridContainer.style.opacity = 
                (window.lightSource.mode === 'manual') ? '1' : '0.5';
        }
    }

    function startDrag(e) {
        e.preventDefault();
        isDragging = true;
        updateLightPosition(e);
    }

    function drag(e) {
        if (!isDragging) return;
        e.preventDefault();
        updateLightPosition(e);
    }

    function endDrag(e) {
        if (!isDragging) return;
        isDragging = false;
        saveSettings();
    }

    function updateLightPosition(e) {
        const rect = gridContainer.getBoundingClientRect();
        let clientX, clientY;

        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        // Calculate normalized position (0-1)
        let x = (clientX - rect.left) / rect.width;
        let y = (clientY - rect.top) / rect.height;

        // Clamp to 0-1
        x = Math.max(0, Math.min(1, x));
        y = Math.max(0, Math.min(1, y));

        window.lightSource.x = x;
        window.lightSource.y = y;

        updateDotPosition();
    }

    function updateDotPosition() {
        if (!lightDot) {
            lightDot = document.getElementById('lightDot');
            if (!lightDot) return;
        }
        
        const x = window.lightSource.x * 100;
        const y = window.lightSource.y * 100;
        
        lightDot.style.left = `${x}%`;
        lightDot.style.top = `${y}%`;

        // Update gradient overlay to show light direction
        if (!gridContainer) gridContainer = document.getElementById('lightGridContainer');
        if (gridContainer) {
            const overlay = gridContainer.querySelector('.light-gradient-overlay');
            if (overlay) {
                overlay.style.background = `radial-gradient(circle at ${x}% ${y}%, 
                    rgba(255, 255, 200, 0.3) 0%, 
                    rgba(255, 255, 200, 0.1) 30%, 
                    transparent 60%)`;
            }
        }
    }

    // Animation loop
    function startAnimation() {
        function animate() {
            animationFrame = requestAnimationFrame(animate);
            
            if (!window.lightSource.enabled) return;
            
            const mode = window.lightSource.mode;
            const speed = window.lightSource.speed;
            
            if (mode === 'random') {
                animateRandomMode(speed);
            }
            
            updateDotPosition();
        }
        animate();
    }

    function animateRandomMode(speed) {
        // Smooth random movement with easing
        const time = Date.now() * 0.001 * speed;
        
        // Use Perlin-like noise simulation with multiple sine waves
        const freq1 = 0.3;
        const freq2 = 0.7;
        const freq3 = 1.1;
        
        targetX = 0.5 + 
            0.3 * Math.sin(time * freq1) + 
            0.15 * Math.sin(time * freq2 * 1.3) +
            0.05 * Math.sin(time * freq3 * 2.1);
            
        targetY = 0.5 + 
            0.3 * Math.cos(time * freq1 * 0.9) + 
            0.15 * Math.cos(time * freq2 * 1.1) +
            0.05 * Math.cos(time * freq3 * 1.7);
        
        // Smooth easing
        const easing = 0.02 * speed;
        velocityX += (targetX - window.lightSource.x) * easing;
        velocityY += (targetY - window.lightSource.y) * easing;
        
        // Apply friction
        velocityX *= 0.95;
        velocityY *= 0.95;
        
        // Update position
        window.lightSource.x += velocityX;
        window.lightSource.y += velocityY;
        
        // Soft bounce at edges
        if (window.lightSource.x < 0.1 || window.lightSource.x > 0.9) {
            velocityX *= -0.5;
            window.lightSource.x = Math.max(0.1, Math.min(0.9, window.lightSource.x));
        }
        if (window.lightSource.y < 0.1 || window.lightSource.y > 0.9) {
            velocityY *= -0.5;
            window.lightSource.y = Math.max(0.1, Math.min(0.9, window.lightSource.y));
        }
    }

    function saveSettings() {
        if (typeof window.settingsManager !== 'undefined') {
            window.settingsManager.set('lightSource.enabled', window.lightSource.enabled);
            window.settingsManager.set('lightSource.x', window.lightSource.x);
            window.settingsManager.set('lightSource.y', window.lightSource.y);
            window.settingsManager.set('lightSource.intensity', window.lightSource.intensity);
            window.settingsManager.set('lightSource.ambient', window.lightSource.ambient);
            window.settingsManager.set('lightSource.mode', window.lightSource.mode);
            window.settingsManager.set('lightSource.speed', window.lightSource.speed);
        }
    }

    function loadSettings() {
        if (typeof window.settingsManager !== 'undefined') {
            window.lightSource.enabled = window.settingsManager.get('lightSource.enabled', false);
            window.lightSource.x = window.settingsManager.get('lightSource.x', 0.5);
            window.lightSource.y = window.settingsManager.get('lightSource.y', 0.5);
            window.lightSource.intensity = window.settingsManager.get('lightSource.intensity', 0.5);
            window.lightSource.ambient = window.settingsManager.get('lightSource.ambient', 0.3);
            window.lightSource.mode = window.settingsManager.get('lightSource.mode', 'manual');
            window.lightSource.speed = window.settingsManager.get('lightSource.speed', 0.5);

            // Update UI
            setTimeout(() => {
                const checkbox = document.getElementById('enableLighting');
                const controls = document.getElementById('lightSourceControls');
                const modeSelect = document.getElementById('lightMode');
                const speedSlider = document.getElementById('lightSpeed');
                const intensitySlider = document.getElementById('lightIntensity');
                const ambientSlider = document.getElementById('lightAmbient');
                const speedValue = document.getElementById('lightSpeedValue');
                const intensityValue = document.getElementById('lightIntensityValue');
                const ambientValue = document.getElementById('lightAmbientValue');

                if (checkbox) checkbox.checked = window.lightSource.enabled;
                if (controls) controls.style.display = window.lightSource.enabled ? 'block' : 'none';
                if (modeSelect) modeSelect.value = window.lightSource.mode;
                if (speedSlider) {
                    speedSlider.value = window.lightSource.speed;
                    speedSlider.style.setProperty('--val', String(window.lightSource.speed));
                    if (speedValue) speedValue.textContent = window.lightSource.speed.toFixed(2);
                }
                if (intensitySlider) {
                    intensitySlider.value = window.lightSource.intensity;
                    intensitySlider.style.setProperty('--val', String(window.lightSource.intensity));
                    if (intensityValue) intensityValue.textContent = window.lightSource.intensity.toFixed(2);
                }
                if (ambientSlider) {
                    ambientSlider.value = window.lightSource.ambient;
                    ambientSlider.style.setProperty('--val', String(window.lightSource.ambient));
                    if (ambientValue) ambientValue.textContent = window.lightSource.ambient.toFixed(2);
                }

                updateModeUI();
                updateDotPosition();
            }, 100);
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
