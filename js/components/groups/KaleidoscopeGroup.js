/**
 * KaleidoscopeGroup - Kaleidoscope effect controls
 * Includes toggle, segments, mode, angle, spin, twist, zoom, blend
 */

class KaleidoscopeGroup extends UIComponent {
    constructor(config) {
        super(config);
        
        // Kaleidoscope parameter defaults
        this.parameters = {
            enabled: false,
            segments: 12,
            mode: '1',
            angle: 0,
            animateRotation: false,
            spinSpeed: 30,
            twist: 0,
            zoom: 1,
            blend: 1,
            ...config.parameters
        };
        
        // Set initial state
        this.state = {
            ...this.parameters,
            ...this.state
        };
    }
    
    /**
     * Get segment label based on mode
     */
    getSegmentLabel() {
        const labels = {
            '0': 'Segments',
            '1': 'Facets',
            '2': 'Layers',
            '3': 'Layers',
            '4': 'Reflections',
            '5': 'Rings'
        };
        return labels[this.state.mode] || 'Segments';
    }
    
    /**
     * Render kaleidoscope group HTML
     */
    render() {
        const segmentLabel = this.getSegmentLabel();
        
        return `
            <div data-component="${this.id}">
                <!-- Kaleidoscope Toggle -->
                <div class="control-group checkbox-group" data-param="enabled">
                    <input type="checkbox" 
                           id="${this.id}-enabled"
                           ${this.state.enabled ? 'checked' : ''}>
                    <label for="${this.id}-enabled" style="margin: 0">Kaleidoscope</label>
                </div>
                
                <!-- Segments Slider -->
                <div class="control-group" data-param="segments">
                    <label for="${this.id}-segments">
                        <span class="segment-label">${segmentLabel}</span>
                        <span class="value-display">${this.state.segments}</span>
                    </label>
                    <input type="range" 
                           id="${this.id}-segments"
                           min="1" 
                           max="24" 
                           step="1" 
                           value="${this.state.segments}">
                </div>
                
                <!-- Mode Dropdown -->
                <div class="control-group" data-param="mode">
                    <label for="${this.id}-mode">Kaleidoscope Mode</label>
                    <select id="${this.id}-mode">
                        <option value="1" ${this.state.mode === '1' ? 'selected' : ''}>Wedge</option>
                        <option value="2" ${this.state.mode === '2' ? 'selected' : ''}>Mirror H</option>
                        <option value="3" ${this.state.mode === '3' ? 'selected' : ''}>Mirror V</option>
                        <option value="4" ${this.state.mode === '4' ? 'selected' : ''}>Mirror Quad</option>
                        <option value="5" ${this.state.mode === '5' ? 'selected' : ''}>Spiral</option>
                        <option value="0" ${this.state.mode === '0' ? 'selected' : ''}>Off</option>
                    </select>
                </div>
                
                <!-- Angle Slider -->
                <div class="control-group" data-param="angle">
                    <label for="${this.id}-angle">
                        Kaleidoscope Angle
                        <span class="value-display">${this.state.angle}°</span>
                    </label>
                    <input type="range" 
                           id="${this.id}-angle"
                           min="-180" 
                           max="180" 
                           step="1" 
                           value="${this.state.angle}">
                </div>
                
                <!-- Animate Rotation Toggle -->
                <div class="control-group checkbox-group" data-param="animateRotation">
                    <input type="checkbox" 
                           id="${this.id}-animateRotation"
                           ${this.state.animateRotation ? 'checked' : ''}>
                    <label for="${this.id}-animateRotation" style="margin: 0">Animate Rotation</label>
                </div>
                
                <!-- Spin Speed Slider -->
                <div class="control-group" data-param="spinSpeed">
                    <label for="${this.id}-spinSpeed">
                        Spin Speed
                        <span class="value-display">${this.state.spinSpeed}°/s</span>
                    </label>
                    <input type="range" 
                           id="${this.id}-spinSpeed"
                           min="-180" 
                           max="180" 
                           step="1" 
                           value="${this.state.spinSpeed}">
                </div>
                
                <!-- Twist Slider -->
                <div class="control-group" data-param="twist">
                    <label for="${this.id}-twist">
                        Twist
                        <span class="value-display">${this.formatValue(this.state.twist, 1)}</span>
                    </label>
                    <input type="range" 
                           id="${this.id}-twist"
                           min="0" 
                           max="10" 
                           step="0.1" 
                           value="${this.state.twist}">
                </div>
                
                <!-- Zoom Slider -->
                <div class="control-group" data-param="zoom">
                    <label for="${this.id}-zoom">
                        Zoom
                        <span class="value-display">${this.formatValue(this.state.zoom, 2)}x</span>
                    </label>
                    <input type="range" 
                           id="${this.id}-zoom"
                           min="0.5" 
                           max="2" 
                           step="0.01" 
                           value="${this.state.zoom}">
                </div>
                
                <!-- Blend Slider -->
                <div class="control-group" data-param="blend">
                    <label for="${this.id}-blend">
                        Blend
                        <span class="value-display">${this.formatValue(this.state.blend, 2)}</span>
                    </label>
                    <input type="range" 
                           id="${this.id}-blend"
                           min="0" 
                           max="1" 
                           step="0.01" 
                           value="${this.state.blend}">
                </div>
            </div>
        `;
    }
    
    /**
     * Format value for display
     */
    formatValue(value, decimals) {
        return Number(value).toFixed(decimals);
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Enabled toggle
        const enabledToggle = this.find(`#${this.id}-enabled`);
        if (enabledToggle) {
            this._enabledHandler = (e) => {
                this.setParameter('enabled', e.target.checked);
            };
            enabledToggle.addEventListener('change', this._enabledHandler);
        }
        
        // Animate rotation toggle
        const animateToggle = this.find(`#${this.id}-animateRotation`);
        if (animateToggle) {
            this._animateHandler = (e) => {
                this.setParameter('animateRotation', e.target.checked);
            };
            animateToggle.addEventListener('change', this._animateHandler);
        }
        
        // Mode dropdown
        const modeSelect = this.find(`#${this.id}-mode`);
        if (modeSelect) {
            this._modeHandler = (e) => {
                this.setParameter('mode', e.target.value);
                // Update segment label when mode changes
                this.updateSegmentLabel();
            };
            modeSelect.addEventListener('change', this._modeHandler);
        }
        
        // Bind all sliders
        const sliders = this.findAll('input[type="range"]');
        this._handlers = this._handlers || new Map();
        
        sliders.forEach(slider => {
            const param = slider.closest('[data-param]')?.dataset.param;
            if (!param) return;
            
            const handler = (e) => {
                const value = parseFloat(e.target.value);
                this.setParameter(param, value);
            };
            
            slider.addEventListener('input', handler);
            this._handlers.set(slider, handler);
        });
    }
    
    /**
     * Unbind event listeners
     */
    unbindEvents() {
        const enabledToggle = this.find(`#${this.id}-enabled`);
        if (enabledToggle && this._enabledHandler) {
            enabledToggle.removeEventListener('change', this._enabledHandler);
        }
        
        const animateToggle = this.find(`#${this.id}-animateRotation`);
        if (animateToggle && this._animateHandler) {
            animateToggle.removeEventListener('change', this._animateHandler);
        }
        
        const modeSelect = this.find(`#${this.id}-mode`);
        if (modeSelect && this._modeHandler) {
            modeSelect.removeEventListener('change', this._modeHandler);
        }
        
        if (this._handlers) {
            this._handlers.forEach((handler, slider) => {
                slider.removeEventListener('input', handler);
            });
            this._handlers.clear();
        }
    }
    
    /**
     * Update segment label based on current mode
     */
    updateSegmentLabel() {
        const labelEl = this.find('.segment-label');
        if (labelEl) {
            labelEl.textContent = this.getSegmentLabel();
        }
    }
    
    /**
     * Set a kaleidoscope parameter
     * @param {string} param - Parameter name
     * @param {*} value - Parameter value
     */
    setParameter(param, value) {
        const oldValue = this.state[param];
        
        // Update state
        const newState = {};
        newState[param] = value;
        this.setState(newState, false);
        
        // Update value display
        const paramEl = this.find(`[data-param="${param}"]`);
        if (paramEl) {
            const display = paramEl.querySelector('.value-display');
            const slider = paramEl.querySelector('input[type="range"]');
            
            if (display && slider) {
                const decimals = this.getDecimals(slider.step);
                let suffix = '';
                
                if (param === 'angle' || param === 'spinSpeed') suffix = '°' + (param === 'spinSpeed' ? '/s' : '');
                else if (param === 'zoom') suffix = 'x';
                
                display.textContent = this.formatValue(value, decimals) + suffix;
            }
        }
        
        // Update segment label when mode changes (from any source)
        if (param === 'mode') {
            this.updateSegmentLabel();
        }
        
        // Emit change event
        if (oldValue !== value) {
            this.emit('parameterChange', { param, value, oldValue });
            this.emit(`${param}Change`, value);
        }
    }
    
    /**
     * Get number of decimals from step value
     */
    getDecimals(step) {
        const stepStr = step.toString();
        if (stepStr.includes('.')) {
            return stepStr.split('.')[1].length;
        }
        return 0;
    }
    
    /**
     * Get parameter value
     * @param {string} param - Parameter name
     * @returns {*}
     */
    getParameter(param) {
        return this.state[param];
    }
    
    /**
     * Get all parameters
     * @returns {Object}
     */
    getAllParameters() {
        return { ...this.state };
    }
}

// Export
if (typeof window !== 'undefined') {
    window.KaleidoscopeGroup = KaleidoscopeGroup;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KaleidoscopeGroup;
}
