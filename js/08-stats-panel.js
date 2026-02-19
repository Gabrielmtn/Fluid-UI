/**
 * Stats For Nerds Panel
 * Reads pre-computed stats from window.__stats (populated by render loop's
 * zero-GC ring buffer). No global rAF monkey-patching.
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
    
    // Kaleidoscope mode names
    const kaleidoModes = ['Off', 'Wedge', 'Mirror H', 'Mirror V', 'Mirror Quad', 'Spiral'];
    
    // ─── Cache DOM refs once (avoid getElementById every 100ms) ────
    const elCache = {};
    function getEl(id) {
        if (!elCache[id]) elCache[id] = document.getElementById(id);
        return elCache[id];
    }
    function setText(id, value) {
        const el = getEl(id);
        if (el) el.textContent = value;
    }
    
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
        setTimeout(() => {
            updateStats();
            updateInterval = setInterval(updateStats, 100);
        }, 500);
    }
    
    function stopUpdating() {
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
    }
    
    function updateStats() {
        const s = window.__stats;
        
        // ─── Performance ──────────────────────────────────────────
        if (s && typeof s.fps === 'number') {
            const capLabel = s.targetFps > 0 ? s.targetFps : '∞';
            setText('stat-fps', s.fps + ' / ' + capLabel + ' fps');
            setText('stat-frametime', (s.frametime || 0).toFixed(2) + ' ms');
            setText('stat-updatetime', (s.lastCpuMs || 0).toFixed(2) + ' ms');
            setText('stat-displayhz', (s.displayHz || 60) + ' Hz');
            
            // Frame budget: color-code for quick glance
            const budgetEl = getEl('stat-budget');
            if (budgetEl) {
                const pct = s.budgetPct || 0;
                budgetEl.textContent = pct.toFixed(1) + '%';
                budgetEl.style.color = pct < 60 ? '#4fe0b0' : pct < 85 ? '#f0d060' : '#ff6070';
            }
        } else {
            setText('stat-fps', '-- fps');
            setText('stat-frametime', '-- ms');
            setText('stat-updatetime', '-- ms');
            setText('stat-displayhz', '-- Hz');
            setText('stat-budget', '--%');
        }
        
        // ─── Simulation ───────────────────────────────────────────
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
        
        // ─── Kaleidoscope ─────────────────────────────────────────
        const kMode = (typeof window.kaleidoMode === 'number') ? (kaleidoModes[window.kaleidoMode] || 'Off') : 'Off';
        setText('stat-kmode', kMode);
        const kSeg = Number(window.kaleidoSegments);
        setText('stat-ksegments', Number.isFinite(kSeg) ? kSeg.toFixed(1) : '--');
        const kAng = Number(window.kAngle);
        setText('stat-kangle', Number.isFinite(kAng) ? (kAng * 180 / Math.PI).toFixed(1) + '°' : '--');
        const kZm = Number(window.kZoom);
        setText('stat-kzoom', Number.isFinite(kZm) ? kZm.toFixed(2) : '--');
        
        // ─── Input ────────────────────────────────────────────────
        if (window.pointer) {
            const x = Math.round(window.pointer.x || 0);
            const y = Math.round(window.pointer.y || 0);
            setText('stat-pointerpos', `${x}, ${y}`);
            
            const dx = window.pointer.dx || 0;
            const dy = window.pointer.dy || 0;
            const vel = Math.sqrt(dx * dx + dy * dy).toFixed(1);
            setText('stat-pointervel', vel + ' px/f');
        }
        
        if (window.config) {
            setText('stat-splatradius', window.config.SPLAT_RADIUS?.toFixed(4) || '--');
            setText('stat-multiplier', window.animationMultiplier || '--');
        }
        
        // ─── Memory ──────────────────────────────────────────────
        const gl = window.gl;
        if (gl) {
            const textureCount = estimateTextureCount();
            setText('stat-textures', textureCount);
            setText('stat-webgl', gl.getParameter(gl.VERSION));
        }
    }
    
    function estimateTextureCount() {
        let count = 0;
        if (window.density) count += 2;
        if (window.velocity) count += 2;
        if (window.pressure) count += 2;
        if (window.divergence) count += 1;
        if (window.curl) count += 1;
        return count;
    }
    
})();
