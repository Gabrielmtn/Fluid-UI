/**
 * EffectsGroup - Effect toggles
 * Includes Light Source and Light Shift
 */

class EffectsGroup extends UIComponent {
    constructor(config) {
        super(config);
        
        // Effect states
        this.state = {
            lightSource: false,
            lightShift: false,
            ...this.state
        };
    }
    
    /**
     * Render effects group HTML
     */
    render() {
        return `
            <div data-component="${this.id}">
                <div class="control-group checkbox-group">
                    <input type="checkbox" 
                           id="${this.id}-lightSource"
                           ${this.state.lightSource ? 'checked' : ''}>
                    <label for="${this.id}-lightSource" style="margin: 0">Light Source (Depth Effect)</label>
                </div>
                
                <div class="control-group checkbox-group">
                    <input type="checkbox" 
                           id="${this.id}-lightShift"
                           ${this.state.lightShift ? 'checked' : ''}>
                    <label for="${this.id}-lightShift" style="margin: 0">Light Shift (Color Overexposure)</label>
                </div>
            </div>
        `;
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Light source toggle
        const lightSourceToggle = this.find(`#${this.id}-lightSource`);
        if (lightSourceToggle) {
            this._lightSourceHandler = (e) => {
                this.setState({ lightSource: e.target.checked }, false);
                this.emit('lightSourceChange', e.target.checked);
            };
            lightSourceToggle.addEventListener('change', this._lightSourceHandler);
        }
        
        // Light shift toggle
        const lightShiftToggle = this.find(`#${this.id}-lightShift`);
        if (lightShiftToggle) {
            this._lightShiftHandler = (e) => {
                this.setState({ lightShift: e.target.checked }, false);
                this.emit('lightShiftChange', e.target.checked);
            };
            lightShiftToggle.addEventListener('change', this._lightShiftHandler);
        }
    }
    
    /**
     * Unbind event listeners
     */
    unbindEvents() {
        const lightSourceToggle = this.find(`#${this.id}-lightSource`);
        if (lightSourceToggle && this._lightSourceHandler) {
            lightSourceToggle.removeEventListener('change', this._lightSourceHandler);
        }
        
        const lightShiftToggle = this.find(`#${this.id}-lightShift`);
        if (lightShiftToggle && this._lightShiftHandler) {
            lightShiftToggle.removeEventListener('change', this._lightShiftHandler);
        }
    }
    
    /**
     * Set light source state
     * @param {boolean} enabled
     */
    setLightSource(enabled) {
        this.setState({ lightSource: enabled }, false);
        const toggle = this.find(`#${this.id}-lightSource`);
        if (toggle) toggle.checked = enabled;
    }
    
    /**
     * Set light shift state
     * @param {boolean} enabled
     */
    setLightShift(enabled) {
        this.setState({ lightShift: enabled }, false);
        const toggle = this.find(`#${this.id}-lightShift`);
        if (toggle) toggle.checked = enabled;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.EffectsGroup = EffectsGroup;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EffectsGroup;
}
