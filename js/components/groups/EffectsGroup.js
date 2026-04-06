/**
 * EffectsGroup - Effect toggles
 * Includes Light Source and Light Shift
 */

class EffectsGroup extends UIComponent {
    constructor(config) {
        super(config);
        
        // Effect states
        this.state = {
            surfaceShading: false,
            shadingIntensity: 0.8,
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
                           id="${this.id}-surfaceShading"
                           ${this.state.surfaceShading ? 'checked' : ''}>
                    <label for="${this.id}-surfaceShading" style="margin: 0">🎨 Surface Shading</label>
                </div>

                <div id="${this.id}-shadingIntensityGroup" class="collapsible" style="display:${this.state.surfaceShading ? 'block' : 'none'};">
                    <div class="control-group">
                        <label for="${this.id}-shadingIntensity">Intensity <span id="${this.id}-shadingIntensityValue" class="value-display">${this.state.shadingIntensity}</span></label>
                        <input type="range" id="${this.id}-shadingIntensity" min="0" max="2" value="${this.state.shadingIntensity}" step="0.1">
                    </div>
                </div>

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
        // Surface shading toggle
        const shadingToggle = this.find(`#${this.id}-surfaceShading`);
        const shadingGroup = this.find(`#${this.id}-shadingIntensityGroup`);
        const shadingSlider = this.find(`#${this.id}-shadingIntensity`);
        const shadingValue = this.find(`#${this.id}-shadingIntensityValue`);
        if (shadingToggle) {
            this._shadingToggleHandler = (e) => {
                this.setState({ surfaceShading: e.target.checked }, false);
                if (shadingGroup) shadingGroup.style.display = e.target.checked ? 'block' : 'none';
                this.emit('surfaceShadingChange', e.target.checked);
            };
            shadingToggle.addEventListener('change', this._shadingToggleHandler);
        }
        if (shadingSlider) {
            this._shadingSliderHandler = (e) => {
                const val = parseFloat(e.target.value);
                this.setState({ shadingIntensity: val }, false);
                if (shadingValue) shadingValue.textContent = val.toFixed(1);
                this.emit('shadingIntensityChange', val);
            };
            shadingSlider.addEventListener('input', this._shadingSliderHandler);
        }

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
        const shadingToggle = this.find(`#${this.id}-surfaceShading`);
        if (shadingToggle && this._shadingToggleHandler) {
            shadingToggle.removeEventListener('change', this._shadingToggleHandler);
        }
        const shadingSlider = this.find(`#${this.id}-shadingIntensity`);
        if (shadingSlider && this._shadingSliderHandler) {
            shadingSlider.removeEventListener('input', this._shadingSliderHandler);
        }

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
    setSurfaceShading(enabled) {
        this.setState({ surfaceShading: enabled }, false);
        const toggle = this.find(`#${this.id}-surfaceShading`);
        if (toggle) toggle.checked = enabled;
        const group = this.find(`#${this.id}-shadingIntensityGroup`);
        if (group) group.style.display = enabled ? 'block' : 'none';
    }

    setShadingIntensity(val) {
        this.setState({ shadingIntensity: val }, false);
        const slider = this.find(`#${this.id}-shadingIntensity`);
        if (slider) slider.value = val;
        const display = this.find(`#${this.id}-shadingIntensityValue`);
        if (display) display.textContent = val.toFixed(1);
    }

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
