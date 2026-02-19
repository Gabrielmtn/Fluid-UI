/**
 * QualityGroup - Quality and performance settings
 * Includes visual quality, physics quality, and FPS cap
 */

class QualityGroup extends UIComponent {
    constructor(config) {
        super(config);
        
        // Quality-specific configuration
        this.visualQuality = config.visualQuality || 'high';
        this.physicsQuality = config.physicsQuality || 'high';
        this.fpsCap = config.fpsCap || '60';
        
        // Set initial state
        this.state = {
            visualQuality: this.visualQuality,
            physicsQuality: this.physicsQuality,
            fpsCap: this.fpsCap,
            ...this.state
        };
    }
    
    /**
     * Render quality group HTML
     */
    render() {
        return `
            <div class="control-group" data-component="${this.id}">
                <label for="${this.id}-visual">Visual Quality</label>
                <select id="${this.id}-visual">
                    <option value="cinematic" ${this.state.visualQuality === 'cinematic' ? 'selected' : ''}>Cinematic (4K)</option>
                    <option value="ultra" ${this.state.visualQuality === 'ultra' ? 'selected' : ''}>Ultra (2K)</option>
                    <option value="high" ${this.state.visualQuality === 'high' ? 'selected' : ''}>High (1K)</option>
                    <option value="medium" ${this.state.visualQuality === 'medium' ? 'selected' : ''}>Medium</option>
                    <option value="low" ${this.state.visualQuality === 'low' ? 'selected' : ''}>Low</option>
                    <option value="custom" ${this.state.visualQuality === 'custom' ? 'selected' : ''}>Custom</option>
                </select>
            </div>
            
            <div class="control-group" data-component="${this.id}">
                <label for="${this.id}-physics">Physics Detail</label>
                <select id="${this.id}-physics">
                    <option value="extreme" ${this.state.physicsQuality === 'extreme' ? 'selected' : ''}>Extreme (1K)</option>
                    <option value="ultra" ${this.state.physicsQuality === 'ultra' ? 'selected' : ''}>Ultra (512)</option>
                    <option value="high" ${this.state.physicsQuality === 'high' ? 'selected' : ''}>High</option>
                    <option value="medium" ${this.state.physicsQuality === 'medium' ? 'selected' : ''}>Medium</option>
                    <option value="low" ${this.state.physicsQuality === 'low' ? 'selected' : ''}>Low</option>
                    <option value="custom" ${this.state.physicsQuality === 'custom' ? 'selected' : ''}>Custom</option>
                </select>
            </div>
            
            <div class="control-group" data-component="${this.id}">
                <label for="${this.id}-fps">FPS Limit</label>
                <select id="${this.id}-fps">
                    <option value="30" ${this.state.fpsCap === '30' ? 'selected' : ''}>30 FPS</option>
                    <option value="60" ${this.state.fpsCap === '60' ? 'selected' : ''}>60 FPS</option>
                    <option value="120" ${this.state.fpsCap === '120' ? 'selected' : ''}>120 FPS</option>
                    <option value="144" ${this.state.fpsCap === '144' ? 'selected' : ''}>144 FPS</option>
                    <option value="165" ${this.state.fpsCap === '165' ? 'selected' : ''}>165 FPS</option>
                    <option value="240" ${this.state.fpsCap === '240' ? 'selected' : ''}>240 FPS</option>
                    <option value="0" ${this.state.fpsCap === '0' ? 'selected' : ''}>Unlimited</option>
                </select>
            </div>
        `;
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Visual quality
        const visualSelect = this.find(`#${this.id}-visual`);
        if (visualSelect) {
            this._visualHandler = (e) => {
                this.setVisualQuality(e.target.value);
            };
            visualSelect.addEventListener('change', this._visualHandler);
        }
        
        // Physics quality
        const physicsSelect = this.find(`#${this.id}-physics`);
        if (physicsSelect) {
            this._physicsHandler = (e) => {
                this.setPhysicsQuality(e.target.value);
            };
            physicsSelect.addEventListener('change', this._physicsHandler);
        }
        
        // FPS cap
        const fpsSelect = this.find(`#${this.id}-fps`);
        if (fpsSelect) {
            this._fpsHandler = (e) => {
                this.setFpsCap(e.target.value);
            };
            fpsSelect.addEventListener('change', this._fpsHandler);
        }
    }
    
    /**
     * Unbind event listeners
     */
    unbindEvents() {
        const visualSelect = this.find(`#${this.id}-visual`);
        if (visualSelect && this._visualHandler) {
            visualSelect.removeEventListener('change', this._visualHandler);
        }
        
        const physicsSelect = this.find(`#${this.id}-physics`);
        if (physicsSelect && this._physicsHandler) {
            physicsSelect.removeEventListener('change', this._physicsHandler);
        }
        
        const fpsSelect = this.find(`#${this.id}-fps`);
        if (fpsSelect && this._fpsHandler) {
            fpsSelect.removeEventListener('change', this._fpsHandler);
        }
    }
    
    /**
     * Set visual quality
     * @param {string} quality - Quality level
     */
    setVisualQuality(quality) {
        this.setState({ visualQuality: quality }, false);
        
        // Update select
        const select = this.find(`#${this.id}-visual`);
        if (select) {
            select.value = quality;
        }
        
        this.emit('visualQualityChange', quality);
    }
    
    /**
     * Set physics quality
     * @param {string} quality - Quality level
     */
    setPhysicsQuality(quality) {
        this.setState({ physicsQuality: quality }, false);
        
        // Update select
        const select = this.find(`#${this.id}-physics`);
        if (select) {
            select.value = quality;
        }
        
        this.emit('physicsQualityChange', quality);
    }
    
    /**
     * Set FPS cap
     * @param {string} fps - FPS limit
     */
    setFpsCap(fps) {
        this.setState({ fpsCap: fps }, false);
        
        // Update select
        const select = this.find(`#${this.id}-fps`);
        if (select) {
            select.value = fps;
        }
        
        this.emit('fpsCapChange', fps);
    }
    
    /**
     * Get visual quality
     * @returns {string}
     */
    getVisualQuality() {
        return this.state.visualQuality;
    }
    
    /**
     * Get physics quality
     * @returns {string}
     */
    getPhysicsQuality() {
        return this.state.physicsQuality;
    }
    
    /**
     * Get FPS cap
     * @returns {string}
     */
    getFpsCap() {
        return this.state.fpsCap;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.QualityGroup = QualityGroup;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QualityGroup;
}
