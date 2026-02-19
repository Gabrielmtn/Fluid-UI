/**
 * UIComponent - Base class for all UI components
 * Provides lifecycle management, state handling, and event system
 */

class UIComponent {
    constructor(config = {}) {
        this.id = config.id || this.generateId();
        this.label = config.label || '';
        this.container = null;
        this.element = null;
        this.state = config.initialState || {};
        this.listeners = {};
        this.syncTarget = null;
        this.mounted = false;
        this.config = config;
        
        // Settings integration
        this.settingsKey = config.settingsKey || `component.${this.id}`;
        this.autoSave = config.autoSave !== false;
    }
    
    /**
     * Generate unique ID for component
     */
    generateId() {
        return `component-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Initialize component (called after construction)
     * Override this to set up initial state, load settings, etc.
     */
    init() {
        if (this.autoSave) {
            this.load();
        }
    }
    
    /**
     * Render component to HTML
     * Override this to return HTML string or DOM element
     * @returns {string|HTMLElement}
     */
    render() {
        return `<div data-component="${this.id}">Component ${this.id}</div>`;
    }
    
    /**
     * Mount component to DOM
     * @param {HTMLElement} parentElement - Parent element to mount to
     */
    mount(parentElement) {
        if (this.mounted) {
            console.warn(`Component ${this.id} already mounted`);
            return;
        }
        
        this.container = parentElement;
        
        // Render component
        const rendered = this.render();
        
        if (typeof rendered === 'string') {
            // HTML string - insert and get reference
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = rendered.trim();
            this.element = tempDiv.firstChild;
            this.container.appendChild(this.element);
        } else {
            // DOM element
            this.element = rendered;
            this.container.appendChild(this.element);
        }
        
        this.mounted = true;
        
        // Bind event listeners
        this.bindEvents();
        
        // Call post-mount hook
        this.onMount();
        
        return this.element;
    }
    
    /**
     * Unmount component from DOM
     */
    unmount() {
        if (!this.mounted) {
            return;
        }
        
        // Call pre-unmount hook
        this.onUnmount();
        
        // Unbind event listeners
        this.unbindEvents();
        
        // Remove from DOM
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        
        this.mounted = false;
        this.element = null;
        this.container = null;
    }
    
    /**
     * Destroy component completely
     */
    destroy() {
        this.unmount();
        
        // Clear all listeners
        this.listeners = {};
        
        // Unsync
        if (this.syncTarget) {
            this.unsync();
        }
        
        // Call destroy hook
        this.onDestroy();
    }
    
    /**
     * Update component state
     * @param {Object} newState - New state values
     * @param {boolean} rerender - Whether to re-render component
     */
    setState(newState, rerender = true) {
        const oldState = { ...this.state };
        this.state = { ...this.state, ...newState };
        
        // Emit state change event
        this.emit('stateChange', { oldState, newState: this.state });
        
        // Auto-save if enabled
        if (this.autoSave) {
            this.save();
        }
        
        // Re-render if requested and mounted
        if (rerender && this.mounted) {
            this.update();
        }
    }
    
    /**
     * Get current state
     * @returns {Object}
     */
    getState() {
        return { ...this.state };
    }
    
    /**
     * Update component (re-render in place)
     */
    update() {
        if (!this.mounted) {
            return;
        }
        
        // Store parent and position
        const parent = this.element.parentNode;
        const nextSibling = this.element.nextSibling;
        
        // Unmount
        this.unmount();
        
        // Re-mount at same position
        if (nextSibling) {
            parent.insertBefore(this.render(), nextSibling);
        } else {
            this.mount(parent);
        }
    }
    
    /**
     * Register event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }
    
    /**
     * Unregister event listener
     * @param {string} event - Event name
     * @param {Function} callback - Callback function to remove
     */
    off(event, callback) {
        if (!this.listeners[event]) {
            return;
        }
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
    
    /**
     * Emit event
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    emit(event, data) {
        if (!this.listeners[event]) {
            return;
        }
        this.listeners[event].forEach(callback => {
            try {
                callback(data, this);
            } catch (error) {
                console.error(`Error in ${event} listener:`, error);
            }
        });
    }
    
    /**
     * Sync component with external DOM element (bidirectional)
     * @param {string} elementId - ID of element to sync with
     */
    syncWith(elementId) {
        const element = document.getElementById(elementId);
        if (!element) {
            console.warn(`Cannot sync: element ${elementId} not found`);
            return;
        }
        
        this.syncTarget = element;
        
        // Initial sync from external element
        this.syncFromExternal();
        
        // Listen to component changes and update external
        this.on('change', (value) => {
            this.syncToExternal(value);
        });
        
        // Listen to external changes and update component
        const eventType = element.type === 'checkbox' ? 'change' : 'input';
        element.addEventListener(eventType, () => {
            this.syncFromExternal();
        });
    }
    
    /**
     * Sync state from external element
     */
    syncFromExternal() {
        if (!this.syncTarget) return;
        
        let value;
        if (this.syncTarget.type === 'checkbox') {
            value = this.syncTarget.checked;
        } else if (this.syncTarget.type === 'range' || this.syncTarget.type === 'number') {
            value = parseFloat(this.syncTarget.value);
        } else {
            value = this.syncTarget.value;
        }
        
        this.setState({ value }, false); // Don't re-render on external sync
    }
    
    /**
     * Sync state to external element
     * @param {*} value - Value to sync
     */
    syncToExternal(value) {
        if (!this.syncTarget) return;
        
        if (this.syncTarget.type === 'checkbox') {
            this.syncTarget.checked = value;
        } else {
            this.syncTarget.value = value;
        }
        
        // Trigger change event on external element
        this.syncTarget.dispatchEvent(new Event('input', { bubbles: true }));
        this.syncTarget.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    /**
     * Remove sync with external element
     */
    unsync() {
        this.syncTarget = null;
    }
    
    /**
     * Save component state to settings
     */
    save() {
        if (typeof window.settingsManager !== 'undefined') {
            window.settingsManager.set(this.settingsKey, this.state);
        }
    }
    
    /**
     * Load component state from settings
     */
    load() {
        if (typeof window.settingsManager !== 'undefined') {
            const saved = window.settingsManager.get(this.settingsKey);
            if (saved) {
                this.setState(saved, false);
            }
        }
    }
    
    /**
     * Find element within component
     * @param {string} selector - CSS selector
     * @returns {HTMLElement}
     */
    find(selector) {
        return this.element ? this.element.querySelector(selector) : null;
    }
    
    /**
     * Find all elements within component
     * @param {string} selector - CSS selector
     * @returns {NodeList}
     */
    findAll(selector) {
        return this.element ? this.element.querySelectorAll(selector) : [];
    }
    
    // Lifecycle hooks (override these in subclasses)
    
    /**
     * Called after component is mounted
     */
    onMount() {}
    
    /**
     * Called before component is unmounted
     */
    onUnmount() {}
    
    /**
     * Called when component is destroyed
     */
    onDestroy() {}
    
    /**
     * Bind DOM event listeners (override in subclasses)
     */
    bindEvents() {}
    
    /**
     * Unbind DOM event listeners (override in subclasses)
     */
    unbindEvents() {}
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIComponent;
}
if (typeof window !== 'undefined') {
    window.UIComponent = UIComponent;
}
