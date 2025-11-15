// Window Controls for Frameless Electron Window
(function() {
    'use strict';
    
    // Only run in Electron
    if (typeof require === 'undefined') return;
    
    try {
        // Use @electron/remote for renderer-side window control
        const remote = require('@electron/remote');
        const win = remote.getCurrentWindow();
        
        function setupWindowResizeHandles() {
            const handles = document.querySelectorAll('.window-resize-edge, .window-resize-corner');
            if (!handles.length) return;

            let isResizing = false;
            let startX = 0;
            let startY = 0;
            let startBounds = null;
            let directions = '';

            // Throttle setBounds to avoid excessive updates
            let lastUpdate = 0;
            const UPDATE_INTERVAL = 16; // ~60 Hz

            const minWidth = 600;
            const minHeight = 400;

            function onMouseMove(e) {
                if (!isResizing || !startBounds) return;

                const now = Date.now();
                if (now - lastUpdate < UPDATE_INTERVAL) return;
                lastUpdate = now;
                const dx = e.screenX - startX;
                const dy = e.screenY - startY;
                let { x, y, width, height } = startBounds;

                if (directions.includes('e')) {
                    width = Math.max(minWidth, startBounds.width + dx);
                }
                if (directions.includes('s')) {
                    height = Math.max(minHeight, startBounds.height + dy);
                }
                if (directions.includes('w')) {
                    const newWidth = Math.max(minWidth, startBounds.width - dx);
                    const deltaW = newWidth - startBounds.width;
                    x = startBounds.x - deltaW;
                    width = newWidth;
                }
                if (directions.includes('n')) {
                    const newHeight = Math.max(minHeight, startBounds.height - dy);
                    const deltaH = newHeight - startBounds.height;
                    y = startBounds.y - deltaH;
                    height = newHeight;
                }

                win.setBounds({ x, y, width, height });
            }

            function onMouseUp() {
                if (!isResizing) return;
                isResizing = false;
                startBounds = null;
                directions = '';
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            }

            handles.forEach(handle => {
                handle.addEventListener('mousedown', (e) => {
                    // Only react to primary (left) button
                    if (e.button !== 0) return;
                    e.preventDefault();
                    e.stopPropagation();
                    isResizing = true;
                    startX = e.screenX;
                    startY = e.screenY;
                    startBounds = win.getBounds();
                    directions = String(handle.getAttribute('data-resize') || '');
                    lastUpdate = 0;
                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                });
            });
        }

        document.addEventListener('DOMContentLoaded', () => {
            const minButton = document.getElementById('min-button');
            const maxButton = document.getElementById('max-button');
            const closeButton = document.getElementById('close-button');
            
            if (minButton) {
                minButton.addEventListener('click', () => {
                    win.minimize();
                });
            }
            
            if (maxButton) {
                maxButton.addEventListener('click', () => {
                    // Toggle maximize/unmaximize (work-area fullscreen)
                    if (win.isMaximized()) {
                        win.unmaximize();
                    } else {
                        win.maximize();
                    }
                });
            }
            
            if (closeButton) {
                closeButton.addEventListener('click', () => {
                    win.close();
                });
            }

            // Enable custom window resizing for frameless + transparent window
            setupWindowResizeHandles();
        });
    } catch (e) {
        console.warn('Window controls not available:', e);
    }
})();
