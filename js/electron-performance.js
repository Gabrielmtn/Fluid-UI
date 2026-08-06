// Electron Performance Enhancements
// Add this script to your index.html for Electron-specific optimizations

(function() {
    // window.IS_ELECTRON is set by the boot script in index.html (UA sniffing
    // is unreliable — see the note in 00-window-controls.js).
    if (!window.IS_ELECTRON) return;

    // ⚡ 1. Aggressive Garbage Collection (every 10 seconds, not 5)
    if (window.gc) {
        setInterval(() => window.gc(), 10000);
    }

    // ⚡ 2. Expose Performance API
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

    // ⚡ 3. Keyboard shortcut: Ctrl+Shift+G = Force GC — dev builds only
    let isPackaged = true;
    try { isPackaged = require('@electron/remote').app.isPackaged; } catch (e) {}
    if (!isPackaged) {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'G') {
                window.electronPerf.forceGC();
            }
        });
    }
})();
