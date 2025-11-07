/**
 * Stats For Nerds Panel
 * Real-time statistics and monitoring for the fluid simulation
 */

(function initStatsPanel() {
    const statsToggle = document.getElementById('statsToggle');
    const statsPanel = document.getElementById('statsPanel');
    const statsCloseBtn = document.getElementById('statsCloseBtn');
    
    if (!statsToggle || !statsPanel) {
        console.warn('Stats panel elements not found');
        return;
    }
    
    let isEnabled = false;
    let updateInterval = null;
    let draggable = null;
    
    // Performance tracking
    let lastFPSTime = performance.now();
    let frameCount = 0;
    let fps = 0;
    let lastFrameTime = 0;
    let updateTime = 0;
    let frames = [];
    let lastRafTS = 0;
    
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
                const isNewFrame = (timestamp !== lastRafTS);
                if (isNewFrame) {
                    frameCount++;
                    frames.push(timestamp);
                    const oneSecondAgo = timestamp - 1000;
                    frames = frames.filter(t => t > oneSecondAgo);
                    fps = frames.length;
                    if (frames.length >= 2) {
                        lastFrameTime = frames[frames.length - 1] - frames[frames.length - 2];
                    }
                    lastRafTS = timestamp;
                }
                
                callback(timestamp);
                
                const end = performance.now();
                updateTime = end - start;
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
            handle: '.stats-drag-handle',
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
        
        try {
            const state = window.Settings.loadPanel('statsPanel');
            isEnabled = state.enabled || false;
            
            if (isEnabled) {
                statsToggle.checked = true;
                statsPanel.style.display = 'block';
                startUpdating();
            } else {
                statsToggle.checked = false;
                statsPanel.style.display = 'none';
            }
        } catch (e) {
            console.warn('Failed to load stats panel state:', e);
            isEnabled = false;
            statsToggle.checked = false;
            statsPanel.style.display = 'none';
        }
    }
    
    loadPanelState();
    
    // Close button handler
    if (statsCloseBtn) {
        statsCloseBtn.addEventListener('click', () => {
            statsToggle.checked = false;
            statsToggle.dispatchEvent(new Event('change'));
        });
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
        
        // Performance stats (prefer main-loop provided stats if available)
        const s = window.__stats;
        if (s && typeof s.fps === 'number') {
            setText('stat-fps', s.fps + ' fps');
            setText('stat-frametime', ((s.frametime || 0)).toFixed(2) + ' ms');
            setText('stat-updatetime', ((s.lastCpuMs != null ? s.lastCpuMs : updateTime)).toFixed(2) + ' ms');
        } else {
            setText('stat-fps', fps + ' fps');
            setText('stat-frametime', lastFrameTime.toFixed(2) + ' ms');
            setText('stat-updatetime', updateTime.toFixed(2) + ' ms');
        }
        
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
