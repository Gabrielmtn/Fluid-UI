/**
 * SimulationGroup - Fluid simulation parameters
 * Includes density, velocity, pressure, curl, viscosity, etc.
 */

class SimulationGroup extends UIComponent {
    constructor(config) {
        super(config);
        
        // Simulation parameter defaults
        this.parameters = {
            densityDissipation: 0.993,
            velocityDissipation: 0.999,
            pressureDissipation: 0.944,
            pressureIteration: 20,
            velocityInfluence: 1.2,
            curl: 10,
            sharpness: 0.8,
            multiplier: 1,
            ...config.parameters
        };
        
        // Set initial state
        this.state = {
            ...this.parameters,
            ...this.state
        };
    }
    
    /**
     * Render simulation group HTML
     */
    render() {
        return `
            <div data-component="${this.id}">
                <!-- Density Sustain -->
                <div class="control-group" data-param="densityDissipation">
                    <label for="${this.id}-density">
                        Density Sustain
                        <span class="value-display">${this.formatValue(this.state.densityDissipation, 4)}</span>
                    </label>
                    <input type="range" 
                           id="${this.id}-density"
                           min="0.85" 
                           max="1.005" 
                           step="0.0001" 
                           value="${this.state.densityDissipation}">
                </div>
                
                <!-- Velocity Sustain -->
                <div class="control-group" data-param="velocityDissipation">
                    <label for="${this.id}-velocity">
                        Velocity Sustain
                        <span class="value-display">${this.formatValue(this.state.velocityDissipation, 4)}</span>
                    </label>
                    <input type="range" 
                           id="${this.id}-velocity"
                           min="0.9" 
                           max="1.0009" 
                           step="0.0001" 
                           value="${this.state.velocityDissipation}">
                </div>
                
                <!-- Pressure Dissipation -->
                <div class="control-group" data-param="pressureDissipation">
                    <label for="${this.id}-pressure">
                        Pressure Dissipation
                        <span class="value-display">${this.formatValue(this.state.pressureDissipation, 3)}</span>
                    </label>
                    <input type="range" 
                           id="${this.id}-pressure"
                           min="0.9" 
                           max="1.0333" 
                           step="0.001" 
                           value="${this.state.pressureDissipation}">
                </div>
                
                <!-- Pressure Iteration -->
                <div class="control-group" data-param="pressureIteration">
                    <label for="${this.id}-iteration">
                        Pressure Iteration
                        <span class="value-display">${this.formatValue(this.state.pressureIteration, 0)}</span>
                    </label>
                    <input type="range" 
                           id="${this.id}-iteration"
                           min="1" 
                           max="50" 
                           step="1" 
                           value="${this.state.pressureIteration}">
                </div>
                
                <!-- Motion Isolation -->
                <div class="control-group" data-param="velocityInfluence">
                    <label for="${this.id}-motion">
                        Motion Isolation
                        <span class="value-display">${this.formatValue(this.state.velocityInfluence, 3)}</span>
                    </label>
                    <input type="range" 
                           id="${this.id}-motion"
                           min="1" 
                           max="5" 
                           step="0.001" 
                           value="${this.state.velocityInfluence}">
                </div>
                
                <!-- Turbulence Toggle -->
                <div class="control-group checkbox-group" data-param="turbulence">
                    <input type="checkbox" id="${this.id}-turbulence">
                    <label for="${this.id}-turbulence" style="margin: 0">Turbulence (Billowing Clouds)</label>
                </div>
                
                <!-- Curl -->
                <div class="control-group" data-param="curl">
                    <label for="${this.id}-curl">
                        Curl
                        <span class="value-display">${this.formatValue(this.state.curl, 0)}</span>
                    </label>
                    <input type="range" 
                           id="${this.id}-curl"
                           min="0" 
                           max="60" 
                           step="1" 
                           value="${this.state.curl}">
                </div>
                
                <!-- Viscosity -->
                <div class="control-group" data-param="sharpness">
                    <label for="${this.id}-viscosity">
                        Viscosity
                        <span class="value-display">${this.formatValue(this.state.sharpness, 1)}</span>
                    </label>
                    <input type="range" 
                           id="${this.id}-viscosity"
                           min="0" 
                           max="2" 
                           step="0.1" 
                           value="${this.state.sharpness}">
                </div>
                
                <!-- Multiplier -->
                <div class="control-group" data-param="multiplier">
                    <label for="${this.id}-multiplier">
                        Multiplier
                        <span class="value-display">${this.formatValue(this.state.multiplier, 0)}x</span>
                    </label>
                    <input type="range" 
                           id="${this.id}-multiplier"
                           min="1" 
                           max="8" 
                           step="1" 
                           value="${this.state.multiplier}">
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
        // Bind all sliders
        const sliders = this.findAll('input[type="range"]');
        sliders.forEach(slider => {
            const param = slider.closest('[data-param]')?.dataset.param;
            if (!param) return;
            
            const handler = (e) => {
                const value = parseFloat(e.target.value);
                this.setParameter(param, value);
            };
            
            slider.addEventListener('input', handler);
            this._handlers = this._handlers || new Map();
            this._handlers.set(slider, handler);
        });
        
        // Bind turbulence toggle
        const turbulence = this.find(`#${this.id}-turbulence`);
        if (turbulence) {
            this._turbulenceHandler = (e) => {
                this.emit('turbulenceChange', e.target.checked);
            };
            turbulence.addEventListener('change', this._turbulenceHandler);
        }
    }
    
    /**
     * Unbind event listeners
     */
    unbindEvents() {
        if (this._handlers) {
            this._handlers.forEach((handler, slider) => {
                slider.removeEventListener('input', handler);
            });
            this._handlers.clear();
        }
        
        const turbulence = this.find(`#${this.id}-turbulence`);
        if (turbulence && this._turbulenceHandler) {
            turbulence.removeEventListener('change', this._turbulenceHandler);
        }
    }
    
    /**
     * Set a simulation parameter
     * @param {string} param - Parameter name
     * @param {number} value - Parameter value
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
                const suffix = param === 'multiplier' ? 'x' : '';
                display.textContent = this.formatValue(value, decimals) + suffix;
            }
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
     * @returns {number}
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
    window.SimulationGroup = SimulationGroup;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SimulationGroup;
}
