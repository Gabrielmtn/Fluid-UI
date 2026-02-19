/**
 * SliderControl - Generic slider component with label and value display
 * Extends UIComponent base class
 */

class SliderControl extends UIComponent {
    constructor(config) {
        super(config);
        
        // Slider-specific configuration
        this.min = config.min || 0;
        this.max = config.max || 100;
        this.step = config.step || 1;
        this.value = config.value !== undefined ? config.value : this.min;
        this.unit = config.unit || '';
        this.formatValue = config.formatValue || this.defaultFormat.bind(this);
        this.orientation = config.orientation || 'horizontal'; // horizontal or vertical
        
        // Set initial state
        this.state = {
            value: this.value,
            ...this.state
        };
    }
    
    /**
     * Default value formatter
     */
    defaultFormat(value) {
        const decimals = this.step < 0.01 ? 4 : this.step < 0.1 ? 2 : this.step < 1 ? 1 : 0;
        return value.toFixed(decimals);
    }
    
    /**
     * Render slider HTML
     */
    render() {
        const formattedValue = this.formatValue(this.state.value);
        const orientClass = this.orientation === 'vertical' ? 'slider-vertical' : '';
        
        return `
            <div class="control-group ${orientClass}" data-component="${this.id}">
                <label for="${this.id}">
                    ${this.label}
                    <span class="value-display" data-value-display>${formattedValue}${this.unit}</span>
                </label>
                <input type="range" 
                       id="${this.id}" 
                       class="slider-control"
                       min="${this.min}" 
                       max="${this.max}" 
                       step="${this.step}" 
                       value="${this.state.value}"
                       ${this.orientation === 'vertical' ? 'orient="vertical"' : ''}>
            </div>
        `;
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        const input = this.find('input[type="range"]');
        const display = this.find('[data-value-display]');
        
        if (!input) return;
        
        // Store reference for unbinding
        this._inputHandler = (e) => {
            const value = parseFloat(e.target.value);
            this.setValue(value);
        };
        
        input.addEventListener('input', this._inputHandler);
    }
    
    /**
     * Unbind event listeners
     */
    unbindEvents() {
        const input = this.find('input[type="range"]');
        if (input && this._inputHandler) {
            input.removeEventListener('input', this._inputHandler);
        }
    }
    
    /**
     * Set slider value
     * @param {number} value - New value
     * @param {boolean} updateDOM - Whether to update DOM
     */
    setValue(value, updateDOM = true) {
        // Clamp value
        value = Math.max(this.min, Math.min(this.max, value));
        
        const oldValue = this.state.value;
        
        // Update state
        this.setState({ value }, false);
        
        // Update DOM if needed
        if (updateDOM && this.mounted) {
            const input = this.find('input[type="range"]');
            const display = this.find('[data-value-display]');
            
            if (input) {
                input.value = value;
            }
            
            if (display) {
                display.textContent = this.formatValue(value) + this.unit;
            }
        }
        
        // Emit change event
        if (oldValue !== value) {
            this.emit('change', value);
        }
    }
    
    /**
     * Get current value
     * @returns {number}
     */
    getValue() {
        return this.state.value;
    }
    
    /**
     * Set min value
     * @param {number} min - New minimum
     */
    setMin(min) {
        this.min = min;
        if (this.mounted) {
            const input = this.find('input[type="range"]');
            if (input) {
                input.min = min;
            }
        }
        if (this.state.value < min) {
            this.setValue(min);
        }
    }
    
    /**
     * Set max value
     * @param {number} max - New maximum
     */
    setMax(max) {
        this.max = max;
        if (this.mounted) {
            const input = this.find('input[type="range"]');
            if (input) {
                input.max = max;
            }
        }
        if (this.state.value > max) {
            this.setValue(max);
        }
    }
    
    /**
     * Enable slider
     */
    enable() {
        const input = this.find('input[type="range"]');
        if (input) {
            input.disabled = false;
        }
        this.setState({ disabled: false }, false);
    }
    
    /**
     * Disable slider
     */
    disable() {
        const input = this.find('input[type="range"]');
        if (input) {
            input.disabled = true;
        }
        this.setState({ disabled: true }, false);
    }
    
    /**
     * Sync from external element override
     */
    syncFromExternal() {
        if (!this.syncTarget) return;
        const value = parseFloat(this.syncTarget.value);
        this.setValue(value, true);
    }
    
    /**
     * Sync to external element override
     */
    syncToExternal(value) {
        if (!this.syncTarget) return;
        this.syncTarget.value = value;
        this.syncTarget.dispatchEvent(new Event('input', { bubbles: true }));
        this.syncTarget.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

// Export
if (typeof window !== 'undefined') {
    window.SliderControl = SliderControl;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SliderControl;
}
