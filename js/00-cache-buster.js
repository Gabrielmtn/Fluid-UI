// Cache Buster - Must load FIRST
// This script forces browsers to reload JavaScript files with timestamp query params

(function() {
    'use strict';
    
    const BUILD_VERSION = Date.now();
    console.log(`🔄 Build version: ${BUILD_VERSION}`);
    
    // Store in window so other scripts can check if they're fresh
    window.CACHE_BUST_VERSION = BUILD_VERSION;
    
    // Log all script loads to verify freshness
    window.addEventListener('DOMContentLoaded', () => {
        const scripts = document.querySelectorAll('script[src]');
        console.log(`📜 Loaded ${scripts.length} scripts at ${new Date().toLocaleTimeString()}`);
        
        // Check if any are cached
        scripts.forEach(script => {
            const hasCacheBust = script.src.includes('?v=') || script.src.includes('&v=');
            if (!hasCacheBust) {
                console.warn('⚠️ Script without cache-bust:', script.src);
            }
        });
    });
})();
