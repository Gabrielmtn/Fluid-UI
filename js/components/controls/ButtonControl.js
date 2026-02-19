/**
 * ButtonControl - Generic button component
 * Extends UIComponent base class
 */

class ButtonControl extends UIComponent {
    constructor(config) {
        super(config);
        
        // Button-specific configuration
        this.text = config.text || config.label || 'Button';
        this.icon = config.icon || '';
        this.style = config.style || 'default'; // default, primary, danger, success
        this.fullWidth = config.fullWidth !== false;
        this.disabled = config.disabled || false;
        
        // Set initial state
        this.state = {
            disabled: this.disabled,
            ...this.state
        };
    }
    
    /**
     * Render button HTML
     */
    render() {
        const styleClass = this.style !== 'default' ? `btn-${this.style}` : '';
        const widthStyle = this.fullWidth ? 'width: 100%;' : '';
        const disabledAttr = this.state.disabled ? 'disabled' : '';
        
        return `
            <button id="${this.id}" 
                    class="button-control ${styleClass}" 
                    style="${widthStyle}"
                    ${disabledAttr}
                    data-component="${this.id}">
                ${this.icon ? `<span class="btn-icon">${this.icon}</span>` : ''}
                <span class="btn-text">${this.text}</span>
            </button>
        `;
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        const button = this.find('button');
        
        if (!button) return;
        
        // Store reference for unbinding
        this._clickHandler = (e) => {
            if (!this.state.disabled) {
                this.emit('click', e);
            }
        };
        
        button.addEventListener('click', this._clickHandler);
    }
    
    /**
     * Unbind event listeners
     */
    unbindEvents() {
        const button = this.find('button');
        if (button && this._clickHandler) {
            button.removeEventListener('click', this._clickHandler);
        }
    }
    
    /**
     * Set button text
     * @param {string} text - New button text
     */
    setText(text) {
        this.text = text;
        if (this.mounted) {
            const textEl = this.find('.btn-text');
            if (textEl) {
                textEl.textContent = text;
            }
        }
    }
    
    /**
     * Set button icon
     * @param {string} icon - New icon (emoji or HTML)
     */
    setIcon(icon) {
        this.icon = icon;
        if (this.mounted) {
            const iconEl = this.find('.btn-icon');
            if (iconEl) {
                iconEl.innerHTML = icon;
            } else if (icon) {
                // Add icon if it didn't exist
                const button = this.find('button');
                const textEl = this.find('.btn-text');
                if (button && textEl) {
                    const iconSpan = document.createElement('span');
                    iconSpan.className = 'btn-icon';
                    iconSpan.innerHTML = icon;
                    button.insertBefore(iconSpan, textEl);
                }
            }
        }
    }
    
    /**
     * Enable button
     */
    enable() {
        this.setState({ disabled: false }, false);
        const button = this.find('button');
        if (button) {
            button.disabled = false;
        }
    }
    
    /**
     * Disable button
     */
    disable() {
        this.setState({ disabled: true }, false);
        const button = this.find('button');
        if (button) {
            button.disabled = true;
        }
    }
    
    /**
     * Check if button is disabled
     * @returns {boolean}
     */
    isDisabled() {
        return this.state.disabled;
    }
    
    /**
     * Trigger click programmatically
     */
    click() {
        if (!this.state.disabled) {
            this.emit('click', { programmatic: true });
        }
    }
}

// Export
if (typeof window !== 'undefined') {
    window.ButtonControl = ButtonControl;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ButtonControl;
}
