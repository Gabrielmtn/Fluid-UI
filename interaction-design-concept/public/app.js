// Main application - ties together fluid sim and multiplayer

(function() {
    const canvas = document.getElementById('canvas');
    const countEl = document.getElementById('count');
    const statusEl = document.getElementById('status');
    const welcomeEl = document.getElementById('welcome');
    const startBtn = document.getElementById('startBtn');
    
    let lastX = 0, lastY = 0;
    let isPointerDown = false;
    let lastTime = performance.now();
    let started = false;
    
    // Initialize fluid simulation
    function initFluid() {
        if (!FluidSim.init(canvas)) {
            console.error('Failed to initialize fluid simulation');
            return false;
        }
        FluidSim.resize();
        return true;
    }
    
    // Handle window resize
    function onResize() {
        FluidSim.resize();
    }
    
    // Pointer handlers
    function getPointerPos(e) {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);
        return { x, y };
    }
    
    function onPointerDown(e) {
        if (!started) return;
        e.preventDefault();
        isPointerDown = true;
        const pos = getPointerPos(e);
        lastX = pos.x;
        lastY = pos.y;
        
        // Send cursor position
        Multiplayer.sendCursor(pos.x / canvas.width, pos.y / canvas.height);
    }
    
    function onPointerMove(e) {
        if (!started) return;
        e.preventDefault();
        
        const pos = getPointerPos(e);
        
        // Always send cursor for presence
        Multiplayer.sendCursor(pos.x / canvas.width, pos.y / canvas.height);
        
        if (isPointerDown) {
            const dx = pos.x - lastX;
            const dy = pos.y - lastY;
            
            // Only splat if there's movement
            if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
                const color = Multiplayer.getMyColor();
                FluidSim.splat(pos.x, pos.y, dx * 10, dy * 10, color);
                
                // Broadcast to others (normalized coordinates)
                Multiplayer.sendSplat(
                    pos.x / canvas.width,
                    pos.y / canvas.height,
                    dx / canvas.width * 10,
                    dy / canvas.height * 10
                );
            }
            
            lastX = pos.x;
            lastY = pos.y;
        }
    }
    
    function onPointerUp(e) {
        isPointerDown = false;
    }
    
    // Touch handlers (for mobile)
    function getTouchPos(e) {
        const touch = e.touches[0] || e.changedTouches[0];
        return getPointerPos(touch);
    }
    
    function onTouchStart(e) {
        if (!started) return;
        e.preventDefault();
        isPointerDown = true;
        const pos = getTouchPos(e);
        lastX = pos.x;
        lastY = pos.y;
        Multiplayer.sendCursor(pos.x / canvas.width, pos.y / canvas.height);
    }
    
    function onTouchMove(e) {
        if (!started) return;
        e.preventDefault();
        
        const pos = getTouchPos(e);
        Multiplayer.sendCursor(pos.x / canvas.width, pos.y / canvas.height);
        
        if (isPointerDown) {
            const dx = pos.x - lastX;
            const dy = pos.y - lastY;
            
            if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
                const color = Multiplayer.getMyColor();
                FluidSim.splat(pos.x, pos.y, dx * 10, dy * 10, color);
                
                Multiplayer.sendSplat(
                    pos.x / canvas.width,
                    pos.y / canvas.height,
                    dx / canvas.width * 10,
                    dy / canvas.height * 10
                );
            }
            
            lastX = pos.x;
            lastY = pos.y;
        }
    }
    
    function onTouchEnd(e) {
        isPointerDown = false;
    }
    
    // Handle remote splats
    function onRemoteSplat(x, y, dx, dy, color) {
        // Convert normalized coords back to canvas coords
        const canvasX = x * canvas.width;
        const canvasY = y * canvas.height;
        const canvasDx = dx * canvas.width;
        const canvasDy = dy * canvas.height;
        
        FluidSim.splat(canvasX, canvasY, canvasDx, canvasDy, color);
    }
    
    // Animation loop
    function animate() {
        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.016); // Cap at 60fps equivalent
        lastTime = now;
        
        FluidSim.step(dt);
        FluidSim.render();
        
        requestAnimationFrame(animate);
    }
    
    // Start the experience
    function start() {
        started = true;
        welcomeEl.classList.add('hidden');
        
        // Hide status after 3 seconds
        setTimeout(() => {
            statusEl.classList.add('hidden');
        }, 3000);
    }
    
    // Initialize
    function init() {
        if (!initFluid()) {
            alert('WebGL2 is required but not supported on this device.');
            return;
        }
        
        // Set up event listeners
        window.addEventListener('resize', onResize);
        
        // Mouse events
        canvas.addEventListener('mousedown', onPointerDown);
        canvas.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);
        
        // Touch events
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd);
        window.addEventListener('touchcancel', onTouchEnd);
        
        // Multiplayer callbacks
        Multiplayer.onSplat(onRemoteSplat);
        
        Multiplayer.onParticipants((count) => {
            countEl.textContent = count;
        });
        
        Multiplayer.onStatus((status, connected) => {
            statusEl.textContent = status;
            if (connected) {
                statusEl.classList.add('connected');
            } else {
                statusEl.classList.remove('connected');
            }
        });
        
        // Connect to multiplayer
        Multiplayer.connect();
        
        // Start button
        startBtn.addEventListener('click', start);
        
        // Start animation loop
        animate();
        
        console.log('[App] Initialized');
    }
    
    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
