/**
 * Stats For Nerds Panel
 * Real-time statistics and monitoring for the fluid simulation
 */

(function initStatsPanel() {
    const statsToggle = document.getElementById('statsToggle');
    const statsPanel = document.getElementById('statsPanel');
    const statsPinBtn = document.getElementById('statsPinBtn');
    
    if (!statsToggle || !statsPanel) {
        console.warn('Stats panel elements not found');
        return;
    }
    
    let isEnabled = false;
    let isPinned = false;
    let updateInterval = null;
    let draggable = null;
    
    // Performance tracking
    let lastFPSTime = performance.now();
    let frameCount = 0;
    let fps = 0;
    let lastFrameTime = 0;
    let updateTime = 0;
    let frames = [];
    
    // Kaleidoscope mode names
    const kaleidoModes = ['Off', 'Wedge', 'Mirror H', 'Mirror V', 'Mirror Quad', 'Spiral'];
    
    // Track actual render frames
    let rafHooked = false;
    function hookRAF() {
        if (rafHooked) return;
        rafHooked = true;
        
        const originalRAF = window.requestAnimationFrame;
        window.requestAnimationFrame = function(callback) {
            return originalRAF.call(window, function(timestamp) {
                const start = performance.now();
                
                // Track frame
                frameCount++;
                frames.push(timestamp);
                
                // Calculate FPS every second
                const now = performance.now();
                if (now - lastFPSTime >= 1000) {
                    // Filter frames from last second
                    const oneSecondAgo = timestamp - 1000;
                    frames = frames.filter(t => t > oneSecondAgo);
                    fps = frames.length;
                    lastFPSTime = now;
                }
                
                // Execute callback
                callback(timestamp);
                
                // Measure update time
                const end = performance.now();
                updateTime = end - start;
                lastFrameTime = updateTime;
            });
        };
    }
    
    hookRAF();
    
    // Initialize draggable (wait for Draggable class to load)
    function initDraggable() {
        if (typeof Draggable === 'undefined') {
            setTimeout(initDraggable, 100);
            return;
        }
        
        draggable = new Draggable(statsPanel, {
            handle: '.stats-header',
            savePosition: 'statsPanel.position',
            constrainToViewport: true
        });
    }
    
    initDraggable();
    
    // Load panel state using Settings interface
    function loadPanelState() {
        if (!window.Settings) {
            setTimeout(loadPanelState, 100);
            return;
        }
        
        const state = window.Settings.loadPanel('statsPanel');
        isPinned = state.pinned;
        isEnabled = state.enabled;
        
        updatePinState();
        
        if (isEnabled) {
            statsToggle.checked = true;
            statsPanel.style.display = 'block';
            startUpdating();
        }
    }
    
    loadPanelState();
    
    // Pin button handler
    if (statsPinBtn) {
        statsPinBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent drag
            isPinned = !isPinned;
            
            if (window.Settings) {
                window.Settings.savePanel('statsPanel', { pinned: isPinned });
            }
            
            updatePinState();
        });
    }
    
    function updatePinState() {
        if (isPinned) {
            statsPanel.classList.add('pinned');
            if (statsPinBtn) {
                statsPinBtn.classList.add('pinned');
                statsPinBtn.title = 'Unpin panel';
            }
        } else {
            statsPanel.classList.remove('pinned');
            if (statsPinBtn) {
                statsPinBtn.classList.remove('pinned');
                statsPinBtn.title = 'Pin panel';
            }
        }
    }
    
    // Toggle handler
    statsToggle.addEventListener('change', (e) => {
        isEnabled = e.target.checked;
        statsPanel.style.display = isEnabled ? 'block' : 'none';
        
        if (isEnabled) {
            startUpdating();
        } else {
            stopUpdating();
        }
        
        // Save toggle state using Settings interface
        if (window.Settings) {
            window.Settings.savePanel('statsPanel', { enabled: isEnabled });
        }
    });
    
    function startUpdating() {
        if (updateInterval) return;
        
        // Wait a bit for fluid sim to initialize
        setTimeout(() => {
            updateStats(); // Initial update
            updateInterval = setInterval(updateStats, 100); // Update 10 times per second
        }, 500);
    }
    
    function stopUpdating() {
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
    }
    
    function updateStats() {
        // Debug: Log what's available (only once)
        if (!window._statsDebugLogged) {
            console.log('Stats Debug:', {
                config: !!window.config,
                simTexWidth: window.simTexWidth,
                dyeTexWidth: window.dyeTexWidth,
                pointer: !!window.pointer,
                animationMultiplier: window.animationMultiplier,
                kaleidoMode: window.kaleidoMode,
                gl: !!window.gl
            });
            window._statsDebugLogged = true;
        }
        
        // Performance stats
        setText('stat-fps', fps + ' fps');
        setText('stat-frametime', lastFrameTime.toFixed(2) + ' ms');
        setText('stat-updatetime', updateTime.toFixed(2) + ' ms');
        
        // Simulation stats
        const canvas = document.getElementById('canvas');
        const simRes = window.simTexWidth || '--';
        const dyeRes = window.dyeTexWidth || '--';
        
        setText('stat-simres', `${simRes}×${simRes}`);
        setText('stat-dyeres', `${dyeRes}×${dyeRes}`);
        setText('stat-canvassize', canvas ? `${canvas.width}×${canvas.height}` : '--');
        
        if (window.config) {
            setText('stat-veldiss', window.config.VELOCITY_DISSIPATION?.toFixed(3) || '--');
            setText('stat-dendiss', window.config.DENSITY_DISSIPATION?.toFixed(3) || '--');
            setText('stat-pressure', window.config.PRESSURE_ITERATIONS || '--');
            setText('stat-curl', window.config.CURL?.toFixed(1) || '--');
        } else {
            setText('stat-veldiss', '--');
            setText('stat-dendiss', '--');
            setText('stat-pressure', '--');
            setText('stat-curl', '--');
        }
        
        // Kaleidoscope stats (coerce to numbers safely)
        const kMode = (typeof window.kaleidoMode === 'number') ? (kaleidoModes[window.kaleidoMode] || 'Off') : 'Off';
        setText('stat-kmode', kMode);
        const kSeg = Number(window.kaleidoSegments);
        setText('stat-ksegments', Number.isFinite(kSeg) ? kSeg.toFixed(1) : '--');
        const kAng = Number(window.kAngle);
        setText('stat-kangle', Number.isFinite(kAng) ? (kAng * 180 / Math.PI).toFixed(1) + '°' : '--');
        const kZm = Number(window.kZoom);
        setText('stat-kzoom', Number.isFinite(kZm) ? kZm.toFixed(2) : '--');
        
        // Input stats
        if (window.pointer) {
            const x = Math.round(window.pointer.x || 0);
            const y = Math.round(window.pointer.y || 0);
            setText('stat-pointerpos', `${x}, ${y}`);
            
            const dx = (window.pointer.dx || 0).toFixed(2);
            const dy = (window.pointer.dy || 0).toFixed(2);
            const vel = Math.sqrt(dx * dx + dy * dy).toFixed(2);
            setText('stat-pointervel', vel + ' px/frame');
        }
        
        if (window.config) {
            setText('stat-splatradius', window.config.SPLAT_RADIUS?.toFixed(4) || '--');
            setText('stat-multiplier', window.animationMultiplier || '--');
        }
        
        // Memory stats
        const gl = window.gl;
        if (gl) {
            // Count textures (approximate)
            const textureCount = estimateTextureCount();
            setText('stat-textures', textureCount);
            setText('stat-webgl', gl.getParameter(gl.VERSION));
        }
    }
    
    function estimateTextureCount() {
        // Estimate based on known buffers
        let count = 0;
        if (window.density) count += 2; // read/write
        if (window.velocity) count += 2;
        if (window.pressure) count += 2;
        if (window.divergence) count += 1;
        if (window.curl) count += 1;
        return count;
    }
    
    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }
    
    console.log('Stats panel initialized - FPS tracking active');
})();
