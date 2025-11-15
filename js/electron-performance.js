// Electron Performance Enhancements
// Add this script to your index.html for Electron-specific optimizations

(function() {
    // Detect if running in Electron
    const isElectron = navigator.userAgent.toLowerCase().includes('electron');
    
    if (!isElectron) return;
    
    console.log('🚀 Electron Performance Mode Activated');
    
    // ⚡ 1. Request High Performance GPU
    const canvas = document.querySelector('#fluid-canvas') || document.querySelector('canvas');
    if (canvas) {
        const gl = canvas.getContext('webgl2', {
            powerPreference: 'high-performance',
            antialias: false, // Disable for speed
            alpha: false,
            depth: false,
            stencil: false,
            desynchronized: true, // Lower latency
            preserveDrawingBuffer: false,
            premultipliedAlpha: false,
            failIfMajorPerformanceCaveat: false
        });
        
        // Check for extensions
        const extensions = [
            'EXT_color_buffer_float',
            'OES_texture_float_linear',
            'EXT_float_blend',
            'WEBGL_lose_context'
        ];
        
        extensions.forEach(ext => {
            const extension = gl.getExtension(ext);
            if (extension) {
                console.log(`✅ ${ext} enabled`);
            }
        });
    }
    
    // ⚡ 2. Aggressive Garbage Collection
    if (window.gc) {
        let lastGC = Date.now();
        setInterval(() => {
            const now = Date.now();
            if (now - lastGC > 5000) { // GC every 5 seconds
                window.gc();
                lastGC = now;
            }
        }, 5000);
        console.log('✅ Manual GC enabled');
    }
    
    // ⚡ 3. Simple title (FPS display removed)
    document.title = 'Fluid Simulation';
    
    // ⚡ 4. Memory Stats (if DevTools open)
    if (performance.memory) {
        setInterval(() => {
            const used = (performance.memory.usedJSHeapSize / 1048576).toFixed(2);
            const total = (performance.memory.totalJSHeapSize / 1048576).toFixed(2);
            const limit = (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2);
            console.log(`💾 Memory: ${used}MB / ${total}MB (Limit: ${limit}MB)`);
        }, 10000);
    }
    
    // ⚡ 5. Expose Performance API
    window.electronPerf = {
        getFPS: () => (window.__stats || {}).fps || 0,
        getMemory: () => {
            if (!performance.memory) return null;
            return {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit
            };
        },
        forceGC: () => {
            if (window.gc) {
                console.log('🗑️ Running garbage collection...');
                window.gc();
            }
        }
    };
    
    // ⚡ 6. Optimize Canvas for High DPI
    function optimizeCanvas() {
        const canvas = document.querySelector('#fluid-canvas') || document.querySelector('canvas');
        if (!canvas) return;
        
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        
        // Set display size (CSS)
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        
        // Set actual size (resolution)
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        
        console.log(`📐 Canvas optimized: ${canvas.width}x${canvas.height} (DPR: ${dpr})`);
    }
    
    // Run on load and resize
    window.addEventListener('load', optimizeCanvas);
    window.addEventListener('resize', optimizeCanvas);
    
    // ⚡ 7. Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+Shift+G = Force GC
        if (e.ctrlKey && e.shiftKey && e.key === 'G') {
            window.electronPerf.forceGC();
        }
        
        // Ctrl+Shift+I = Toggle DevTools (Electron handles this)
        // F11 = Fullscreen (Electron handles this)
    });
    
    console.log('⚡ Performance optimizations loaded!');
    console.log('📊 Use window.electronPerf for stats');
})();
