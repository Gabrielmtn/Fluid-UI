/**
 * CanvasDisplayGroup - Canvas and display settings
 * Includes background color, transparency, opacity, cursor, handles, stats, border lock
 */

class CanvasDisplayGroup extends UIComponent {
    constructor(config) {
        super(config);
        
        // Canvas & display parameter defaults
        this.parameters = {
            backgroundColor: '#000000',
            transparentMode: false,
            canvasOpacity: 100,
            preserveFluidOpacity: true,
            captureDimming: 80,
            showCursor: false,
            showCanvasHandles: false,
            statsToggle: false,
            lockCanvasBorders: false,
            ...config.parameters
        };
        
        // Set initial state
        this.state = {
            ...this.parameters,
            ...this.state
        };
    }
    
    /**
     * Render canvas & display group HTML
     */
    render() {
        return `
            <div data-component="${this.id}">
                <!-- Background Color -->
                <div class="control-group" data-param="backgroundColor">
                    <label for="${this.id}-bgColor">Background Color</label>
                    <input type="color" 
                           id="${this.id}-bgColor" 
                           value="${this.state.backgroundColor}">
                </div>
                
                <!-- Transparent Mode Toggle -->
                <div class="control-group checkbox-group" data-param="transparentMode">
                    <input type="checkbox" 
                           id="${this.id}-transparent"
                           ${this.state.transparentMode ? 'checked' : ''}>
                    <label for="${this.id}-transparent" style="margin: 0">Transparent Background</label>
                </div>
                
                <!-- Canvas Opacity -->
                <div class="control-group" data-param="canvasOpacity">
                    <label for="${this.id}-opacity">
                        Canvas Opacity
                        <span class="value-display">${this.state.canvasOpacity}%</span>
                    </label>
                    <input type="range" 
                           id="${this.id}-opacity"
                           min="0" 
                           max="100" 
                           step="1" 
                           value="${this.state.canvasOpacity}">
                </div>
                
                <!-- Empty Alpha Locked -->
                <div class="control-group checkbox-group" data-param="preserveFluidOpacity">
                    <input type="checkbox" 
                           id="${this.id}-alphaLock"
                           ${this.state.preserveFluidOpacity ? 'checked' : ''}>
                    <label for="${this.id}-alphaLock" style="margin: 0">Empty Alpha Locked</label>
                </div>
                
                <!-- Background Transparency -->
                <div class="control-group" data-param="captureDimming">
                    <label for="${this.id}-bgTrans">
                        Background Transparency
                        <span class="value-display">${this.state.captureDimming}%</span>
                    </label>
                    <input type="range" 
                           id="${this.id}-bgTrans"
                           min="0" 
                           max="100" 
                           step="1" 
                           value="${this.state.captureDimming}">
                </div>
                
                <!-- Show Cursor -->
                <div class="control-group checkbox-group" data-param="showCursor">
                    <input type="checkbox" 
                           id="${this.id}-cursor"
                           ${this.state.showCursor ? 'checked' : ''}>
                    <label for="${this.id}-cursor" style="margin: 0">Show Cursor</label>
                </div>
                
                <!-- Show Canvas Handles -->
                <div class="control-group checkbox-group" data-param="showCanvasHandles">
                    <input type="checkbox" 
                           id="${this.id}-handles"
                           ${this.state.showCanvasHandles ? 'checked' : ''}>
                    <label for="${this.id}-handles" style="margin: 0">Canvas Border & Handles</label>
                </div>
                
                <!-- Stats Toggle -->
                <div class="control-group checkbox-group" data-param="statsToggle">
                    <input type="checkbox" 
                           id="${this.id}-stats"
                           ${this.state.statsToggle ? 'checked' : ''}>
                    <label for="${this.id}-stats" style="margin: 0">Stats For Nerds</label>
                </div>
                
                <!-- Lock Canvas Borders -->
                <div class="control-group checkbox-group" data-param="lockCanvasBorders">
                    <input type="checkbox" 
                           id="${this.id}-lockBorders"
                           ${this.state.lockCanvasBorders ? 'checked' : ''}>
                    <label for="${this.id}-lockBorders" style="margin: 0">Lock Canvas Borders</label>
                </div>
            </div>
        `;
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Background color picker
        const bgColorPicker = this.find(`#${this.id}-bgColor`);
        if (bgColorPicker) {
            this._bgColorHandler = (e) => {
                this.setParameter('backgroundColor', e.target.value);
            };
            bgColorPicker.addEventListener('input', this._bgColorHandler);
        }
        
        // Bind all checkboxes
        const checkboxes = this.findAll('input[type="checkbox"]');
        this._checkboxHandlers = this._checkboxHandlers || new Map();
        
        checkboxes.forEach(checkbox => {
            const param = checkbox.closest('[data-param]')?.dataset.param;
            if (!param) return;
            
            const handler = (e) => {
                this.setParameter(param, e.target.checked);
            };
            
            checkbox.addEventListener('change', handler);
            this._checkboxHandlers.set(checkbox, handler);
        });
        
        // Bind all sliders
        const sliders = this.findAll('input[type="range"]');
        this._sliderHandlers = this._sliderHandlers || new Map();
        
        sliders.forEach(slider => {
            const param = slider.closest('[data-param]')?.dataset.param;
            if (!param) return;
            
            const handler = (e) => {
                const value = parseFloat(e.target.value);
                this.setParameter(param, value);
            };
            
            slider.addEventListener('input', handler);
            this._sliderHandlers.set(slider, handler);
        });
    }
    
    /**
     * Unbind event listeners
     */
    unbindEvents() {
        const bgColorPicker = this.find(`#${this.id}-bgColor`);
        if (bgColorPicker && this._bgColorHandler) {
            bgColorPicker.removeEventListener('input', this._bgColorHandler);
        }
        
        if (this._checkboxHandlers) {
            this._checkboxHandlers.forEach((handler, checkbox) => {
                checkbox.removeEventListener('change', handler);
            });
            this._checkboxHandlers.clear();
        }
        
        if (this._sliderHandlers) {
            this._sliderHandlers.forEach((handler, slider) => {
                slider.removeEventListener('input', handler);
            });
            this._sliderHandlers.clear();
        }
    }
    
    /**
     * Set a canvas/display parameter
     * @param {string} param - Parameter name
     * @param {*} value - Parameter value
     */
    setParameter(param, value) {
        const oldValue = this.state[param];
        
        // Update state
        const newState = {};
        newState[param] = value;
        this.setState(newState, false);
        
        // Update value display for sliders
        if (param === 'canvasOpacity' || param === 'captureDimming') {
            const paramEl = this.find(`[data-param="${param}"]`);
            if (paramEl) {
                const display = paramEl.querySelector('.value-display');
                if (display) {
                    display.textContent = value + '%';
                }
            }
        }
        
        // Update color picker
        if (param === 'backgroundColor') {
            const picker = this.find(`#${this.id}-bgColor`);
            if (picker) {
                picker.value = value;
            }
        }
        
        // Emit change event
        if (oldValue !== value) {
            this.emit('parameterChange', { param, value, oldValue });
            this.emit(`${param}Change`, value);
        }
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
    window.CanvasDisplayGroup = CanvasDisplayGroup;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CanvasDisplayGroup;
}
