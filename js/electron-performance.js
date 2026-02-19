// Electron Performance Enhancements
// Add this script to your index.html for Electron-specific optimizations

(function() {
    // Detect if running in Electron
    const isElectron = navigator.userAgent.toLowerCase().includes('electron');
    
    if (!isElectron) return;
    
    // ⚡ 1. Aggressive Garbage Collection (every 10 seconds, not 5)
    if (window.gc) {
        setInterval(() => window.gc(), 10000);
    }
    
    // ⚡ 2. Simple title
    document.title = 'Fluid Simulation';
    
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
        forceGC: () => window.gc && window.gc()
    };
    
    // ⚡ 3. Keyboard shortcut: Ctrl+Shift+G = Force GC
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'G') {
            window.electronPerf.forceGC();
        }
    });
})();
