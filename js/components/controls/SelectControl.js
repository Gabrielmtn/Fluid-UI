/**
 * SelectControl - Generic dropdown/select component
 * Extends UIComponent base class
 */

class SelectControl extends UIComponent {
    constructor(config) {
        super(config);
        
        // Select-specific configuration
        this.options = config.options || []; // Array of {value, label} or strings
        this.value = config.value !== undefined ? config.value : (this.options[0]?.value || this.options[0] || '');
        
        // Set initial state
        this.state = {
            value: this.value,
            ...this.state
        };
    }
    
    /**
     * Render select HTML
     */
    render() {
        const optionsHtml = this.options.map(opt => {
            const value = typeof opt === 'string' ? opt : opt.value;
            const label = typeof opt === 'string' ? opt : opt.label;
            const selected = value === this.state.value ? 'selected' : '';
            
            return `<option value="${value}" ${selected}>${label}</option>`;
        }).join('');
        
        return `
            <div class="control-group" data-component="${this.id}">
                <label for="${this.id}">${this.label}</label>
                <select id="${this.id}" class="select-control">
                    ${optionsHtml}
                </select>
            </div>
        `;
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        const select = this.find('select');
        
        if (!select) return;
        
        // Store reference for unbinding
        this._changeHandler = (e) => {
            this.setValue(e.target.value);
        };
        
        select.addEventListener('change', this._changeHandler);
    }
    
    /**
     * Unbind event listeners
     */
    unbindEvents() {
        const select = this.find('select');
        if (select && this._changeHandler) {
            select.removeEventListener('change', this._changeHandler);
        }
    }
    
    /**
     * Set selected value
     * @param {string} value - New value
     * @param {boolean} updateDOM - Whether to update DOM
     */
    setValue(value, updateDOM = true) {
        const oldValue = this.state.value;
        
        // Update state
        this.setState({ value }, false);
        
        // Update DOM if needed
        if (updateDOM && this.mounted) {
            const select = this.find('select');
            if (select) {
                select.value = value;
            }
        }
        
        // Emit change event
        if (oldValue !== value) {
            this.emit('change', value);
        }
    }
    
    /**
     * Get current value
     * @returns {string}
     */
    getValue() {
        return this.state.value;
    }
    
    /**
     * Get selected option label
     * @returns {string}
     */
    getSelectedLabel() {
        const opt = this.options.find(o => {
            const val = typeof o === 'string' ? o : o.value;
            return val === this.state.value;
        });
        
        return typeof opt === 'string' ? opt : (opt?.label || '');
    }
    
    /**
     * Set options
     * @param {Array} options - New options array
     */
    setOptions(options) {
        this.options = options;
        if (this.mounted) {
            this.update();
        }
    }
    
    /**
     * Add option
     * @param {Object|string} option - Option to add
     */
    addOption(option) {
        this.options.push(option);
        if (this.mounted) {
            this.update();
        }
    }
    
    /**
     * Remove option
     * @param {string} value - Value of option to remove
     */
    removeOption(value) {
        this.options = this.options.filter(opt => {
            const val = typeof opt === 'string' ? opt : opt.value;
            return val !== value;
        });
        if (this.mounted) {
            this.update();
        }
    }
    
    /**
     * Enable select
     */
    enable() {
        const select = this.find('select');
        if (select) {
            select.disabled = false;
        }
        this.setState({ disabled: false }, false);
    }
    
    /**
     * Disable select
     */
    disable() {
        const select = this.find('select');
        if (select) {
            select.disabled = true;
        }
        this.setState({ disabled: true }, false);
    }
    
    /**
     * Sync from external element override
     */
    syncFromExternal() {
        if (!this.syncTarget) return;
        const value = this.syncTarget.value;
        this.setValue(value, true);
    }
    
    /**
     * Sync to external element override
     */
    syncToExternal(value) {
        if (!this.syncTarget) return;
        this.syncTarget.value = value;
        this.syncTarget.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

// Export
if (typeof window !== 'undefined') {
    window.SelectControl = SelectControl;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SelectControl;
}
