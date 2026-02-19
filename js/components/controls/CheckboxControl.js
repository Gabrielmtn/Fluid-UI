/**
 * CheckboxControl - Generic checkbox/toggle component
 * Extends UIComponent base class
 */

class CheckboxControl extends UIComponent {
    constructor(config) {
        super(config);
        
        // Checkbox-specific configuration
        this.checked = config.checked !== undefined ? config.checked : false;
        this.labelPosition = config.labelPosition || 'after'; // before or after
        
        // Set initial state
        this.state = {
            checked: this.checked,
            ...this.state
        };
    }
    
    /**
     * Render checkbox HTML
     */
    render() {
        const checkboxHtml = `
            <input type="checkbox" 
                   id="${this.id}" 
                   class="checkbox-control"
                   ${this.state.checked ? 'checked' : ''}>
        `;
        
        const labelHtml = `
            <label for="${this.id}" style="margin: 0">${this.label}</label>
        `;
        
        return `
            <div class="control-group checkbox-group" data-component="${this.id}">
                ${this.labelPosition === 'before' ? labelHtml + checkboxHtml : checkboxHtml + labelHtml}
            </div>
        `;
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        const input = this.find('input[type="checkbox"]');
        
        if (!input) return;
        
        // Store reference for unbinding
        this._changeHandler = (e) => {
            this.setChecked(e.target.checked);
        };
        
        input.addEventListener('change', this._changeHandler);
    }
    
    /**
     * Unbind event listeners
     */
    unbindEvents() {
        const input = this.find('input[type="checkbox"]');
        if (input && this._changeHandler) {
            input.removeEventListener('change', this._changeHandler);
        }
    }
    
    /**
     * Set checked state
     * @param {boolean} checked - New checked state
     * @param {boolean} updateDOM - Whether to update DOM
     */
    setChecked(checked, updateDOM = true) {
        const oldChecked = this.state.checked;
        
        // Update state
        this.setState({ checked }, false);
        
        // Update DOM if needed
        if (updateDOM && this.mounted) {
            const input = this.find('input[type="checkbox"]');
            if (input) {
                input.checked = checked;
            }
        }
        
        // Emit change event
        if (oldChecked !== checked) {
            this.emit('change', checked);
        }
    }
    
    /**
     * Get checked state
     * @returns {boolean}
     */
    isChecked() {
        return this.state.checked;
    }
    
    /**
     * Toggle checked state
     */
    toggle() {
        this.setChecked(!this.state.checked);
    }
    
    /**
     * Enable checkbox
     */
    enable() {
        const input = this.find('input[type="checkbox"]');
        if (input) {
            input.disabled = false;
        }
        this.setState({ disabled: false }, false);
    }
    
    /**
     * Disable checkbox
     */
    disable() {
        const input = this.find('input[type="checkbox"]');
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
        const checked = this.syncTarget.checked;
        this.setChecked(checked, true);
    }
    
    /**
     * Sync to external element override
     */
    syncToExternal(checked) {
        if (!this.syncTarget) return;
        this.syncTarget.checked = checked;
        this.syncTarget.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

// Export
if (typeof window !== 'undefined') {
    window.CheckboxControl = CheckboxControl;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CheckboxControl;
}
