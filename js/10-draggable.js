/**
 * Draggable Utility
 * Makes elements draggable with position persistence
 */

class Draggable {
    constructor(element, options = {}) {
        this.element = element;
        this.options = {
            handle: options.handle || element,
            constrainToViewport: options.constrainToViewport !== false,
            savePosition: options.savePosition || null, // Key for settings manager
            onDragStart: options.onDragStart || null,
            onDrag: options.onDrag || null,
            onDragEnd: options.onDragEnd || null,
            grid: options.grid || null // Snap to grid [x, y]
        };
        
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.offsetX = 0;
        this.offsetY = 0;
        
        this.init();
    }
    
    init() {
        const handle = typeof this.options.handle === 'string' 
            ? this.element.querySelector(this.options.handle)
            : this.options.handle;
        
        if (!handle) {
            console.error('Draggable handle not found');
            return;
        }
        
        // Make handle look draggable
        handle.style.cursor = 'move';
        handle.style.userSelect = 'none';
        
        // Bind events (Pointer Events for pen/mouse/touch)
        this.handlePointerDown = this.onPointerDown.bind(this);
        this.handlePointerMove = this.onPointerMove.bind(this);
        this.handlePointerUp = this.onPointerUp.bind(this);
        
        // Improve input UX for pen/touch
        handle.style.touchAction = 'none';
        
        handle.addEventListener('pointerdown', this.handlePointerDown);
        
        // Load saved position if available
        if (this.options.savePosition && window.settingsManager) {
            this.loadPosition();
        }
        
        // Ensure element is positioned
        if (getComputedStyle(this.element).position === 'static') {
            this.element.style.position = 'fixed';
        }
    }
    
    onPointerDown(e) {
        // Allow pen/touch; restrict mouse to left button
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        
        // Don't start drag if clicking on buttons or interactive elements
        if (e.target && e.target.closest && (e.target.closest('button') || e.target.closest('input') || e.target.closest('select'))) {
            return;
        }
        
        e.preventDefault();
        
        this.isDragging = true;
        this.pointerId = e.pointerId;
        
        // Get current position
        const rect = this.element.getBoundingClientRect();
        this.startX = rect.left;
        this.startY = rect.top;
        this.offsetX = e.clientX - rect.left;
        this.offsetY = e.clientY - rect.top;
        
        // Add dragging class
        this.element.classList.add('dragging');
        
        // Capture pointer on the handle/element to continue receiving events
        try { (e.currentTarget || this.element).setPointerCapture(e.pointerId); } catch (_) {}
        
        // Add global listeners
        document.addEventListener('pointermove', this.handlePointerMove, { passive: false });
        document.addEventListener('pointerup', this.handlePointerUp, { passive: false });
        document.addEventListener('pointercancel', this.handlePointerUp, { passive: false });
        
        // Callback
        if (this.options.onDragStart) {
            this.options.onDragStart(this.element);
        }
    }
    
    onPointerMove(e) {
        if (!this.isDragging || (this.pointerId != null && e.pointerId !== this.pointerId)) return;
        
        e.preventDefault();
        
        // Calculate new position
        let x = e.clientX - this.offsetX;
        let y = e.clientY - this.offsetY;
        
        // Snap to grid if specified
        if (this.options.grid) {
            x = Math.round(x / this.options.grid[0]) * this.options.grid[0];
            y = Math.round(y / this.options.grid[1]) * this.options.grid[1];
        }
        
        // Constrain to viewport
        if (this.options.constrainToViewport) {
            const rect = this.element.getBoundingClientRect();
            const maxX = window.innerWidth - rect.width;
            const maxY = window.innerHeight - rect.height;
            
            x = Math.max(0, Math.min(x, maxX));
            y = Math.max(0, Math.min(y, maxY));
        }
        
        // Apply position
        this.element.style.left = x + 'px';
        this.element.style.top = y + 'px';
        this.element.style.right = 'auto';
        this.element.style.bottom = 'auto';
        
        // Callback
        if (this.options.onDrag) {
            this.options.onDrag(this.element, { x, y });
        }
    }
    
    onPointerUp(e) {
        if (!this.isDragging || (this.pointerId != null && e.pointerId !== this.pointerId)) return;
        
        this.isDragging = false;
        
        // Remove dragging class
        this.element.classList.remove('dragging');
        
        // Release capture
        try { (e.currentTarget || this.element).releasePointerCapture(e.pointerId); } catch (_) {}
        
        // Remove global listeners
        document.removeEventListener('pointermove', this.handlePointerMove);
        document.removeEventListener('pointerup', this.handlePointerUp);
        document.removeEventListener('pointercancel', this.handlePointerUp);
        
        // Save position if enabled
        if (this.options.savePosition && window.settingsManager) {
            this.savePosition();
        }
        
        // Callback
        if (this.options.onDragEnd) {
            const rect = this.element.getBoundingClientRect();
            this.options.onDragEnd(this.element, { x: rect.left, y: rect.top });
        }
        
        this.pointerId = null;
    }
    
    /**
     * Save current position to settings
     */
    savePosition() {
        const rect = this.element.getBoundingClientRect();
        window.settingsManager.set(this.options.savePosition, {
            x: rect.left,
            y: rect.top
        });
    }
    
    /**
     * Load position from settings
     */
    loadPosition() {
        const position = window.settingsManager.get(this.options.savePosition);
        
        if (position && typeof position.x === 'number' && typeof position.y === 'number') {
            // Ensure position is still within viewport
            const x = Math.max(0, Math.min(position.x, window.innerWidth - 100));
            const y = Math.max(0, Math.min(position.y, window.innerHeight - 100));
            
            this.element.style.left = x + 'px';
            this.element.style.top = y + 'px';
            this.element.style.right = 'auto';
            this.element.style.bottom = 'auto';
        }
    }
    
    /**
     * Reset to default position
     */
    resetPosition() {
        this.element.style.left = '';
        this.element.style.top = '';
        this.element.style.right = '';
        this.element.style.bottom = '';
        
        if (this.options.savePosition && window.settingsManager) {
            window.settingsManager.remove(this.options.savePosition);
        }
    }
    
    /**
     * Destroy the draggable instance
     */
    destroy() {
        const handle = typeof this.options.handle === 'string' 
            ? this.element.querySelector(this.options.handle)
            : this.options.handle;
        
        if (handle) {
            handle.removeEventListener('pointerdown', this.handlePointerDown);
            handle.style.cursor = '';
            handle.style.touchAction = '';
        }
        
        document.removeEventListener('pointermove', this.handlePointerMove);
        document.removeEventListener('pointerup', this.handlePointerUp);
        document.removeEventListener('pointercancel', this.handlePointerUp);
        
        this.element.classList.remove('dragging');
    }
}

console.log('Draggable utility loaded');
