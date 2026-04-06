/**
 * AnimationsGroup - Animation effect buttons
 * Includes Smash, Jellyfish, Vortex, Portal, Portrait, Ascend, Shooting Star
 */

class AnimationsGroup extends UIComponent {
    constructor(config) {
        super(config);
        
        // Animation states
        this.state = {
            ascendActive: false,
            ascendRandomness: false,
            shootingStarActive: false,
            ...this.state
        };
    }
    
    /**
     * Render animations group HTML
     */
    render() {
        return `
            <div data-component="${this.id}">
                <button id="${this.id}-smash" 
                        style="width: 100%; margin-top: 10px; background: rgba(255, 100, 100, 0.2); padding: 8px; line-height: 1.3;"
                        data-action="smash">
                    <div style="font-size: 1.1em; margin-bottom: 2px;">💥 Smash</div>
                    <div style="font-size: 0.7em; opacity: 0.7;">Left: Collide | Right: Expand</div>
                </button>
                
                <button id="${this.id}-jellyfish" 
                        style="width: 100%; margin-top: 10px; background: rgba(100, 150, 255, 0.2); padding: 8px; line-height: 1.3;"
                        data-action="jellyfish">
                    <div style="font-size: 1.1em; margin-bottom: 2px;">🪼 Jellyfish</div>
                    <div style="font-size: 0.7em; opacity: 0.7;">Left: Single | Right: Swarm</div>
                </button>
                
                <button id="${this.id}-vortex" 
                        style="width: 100%; margin-top: 10px; background: rgba(255, 200, 100, 0.2); padding: 8px; line-height: 1.3;"
                        data-action="vortex">
                    <div style="font-size: 1.1em; margin-bottom: 2px;">🌀 Vortex</div>
                    <div style="font-size: 0.7em; opacity: 0.7;">Left: Clockwise | Right: Counter</div>
                </button>
                
                <button id="${this.id}-portal" 
                        style="width: 100%; margin-top: 10px; background: rgba(255, 100, 255, 0.2); padding: 8px; line-height: 1.3;"
                        data-action="portal">
                    <div style="font-size: 1.1em; margin-bottom: 2px;">🌌 Portal</div>
                    <div style="font-size: 0.7em; opacity: 0.7;">Left: Swoop | Right: Expand</div>
                </button>
                
                <button id="${this.id}-portrait" 
                        style="width: 100%; margin-top: 10px; background: rgba(200, 150, 255, 0.2);"
                        data-action="portrait">
                    🎨 Portrait
                </button>
                
                <div class="anim-toggle-row" style="background:rgba(150,255,200,0.1);">
                    <span class="anim-toggle-label">⬆️ Ascend</span>
                    <label class="anim-switch"><input type="checkbox" id="${this.id}-ascendToggle" ${this.state.ascendActive ? 'checked' : ''}><span class="anim-switch-track"></span></label>
                </div>
                <div class="anim-settings ${this.state.ascendActive ? 'open' : ''}" id="${this.id}-ascendSettings">
                    <div class="anim-settings-inner">
                        <div class="control-group checkbox-group" style="margin-top:4px;">
                            <input type="checkbox" id="${this.id}-ascendRandomness" ${this.state.ascendRandomness ? 'checked' : ''}>
                            <label for="${this.id}-ascendRandomness" style="margin:0;text-transform:none;opacity:1;font-size:11px;">Randomness</label>
                        </div>
                    </div>
                </div>
                
                <div class="anim-toggle-row" style="background:rgba(255,220,100,0.1);">
                    <span class="anim-toggle-label">🌠 Shooting Star</span>
                    <label class="anim-switch"><input type="checkbox" id="${this.id}-shootingStarToggle" ${this.state.shootingStarActive ? 'checked' : ''}><span class="anim-switch-track"></span></label>
                </div>
                <div class="anim-settings ${this.state.shootingStarActive ? 'open' : ''}" id="${this.id}-shootingStarSettings">
                    <div class="anim-settings-inner"></div>
                </div>
            </div>
        `;
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Bind all animation buttons
        const buttons = this.findAll('button[data-action]');
        this._buttonHandlers = this._buttonHandlers || new Map();
        
        buttons.forEach(button => {
            const action = button.dataset.action;
            const handler = () => {
                this.emit(action);
            };
            button.addEventListener('click', handler);
            this._buttonHandlers.set(button, handler);
        });
        
        // Ascend toggle
        const ascendToggle = this.find(`#${this.id}-ascendToggle`);
        if (ascendToggle) {
            this._ascendHandler = (e) => {
                this.setState({ ascendActive: e.target.checked }, false);
                const panel = this.find(`#${this.id}-ascendSettings`);
                if (panel) panel.classList.toggle('open', e.target.checked);
                this.emit('ascend', e.target.checked);
            };
            ascendToggle.addEventListener('change', this._ascendHandler);
        }
        
        // Ascend randomness toggle
        const randomnessToggle = this.find(`#${this.id}-ascendRandomness`);
        if (randomnessToggle) {
            this._randomnessHandler = (e) => {
                this.setState({ ascendRandomness: e.target.checked }, false);
                this.emit('ascendRandomnessChange', e.target.checked);
            };
            randomnessToggle.addEventListener('change', this._randomnessHandler);
        }
        
        // Shooting Star toggle
        const ssToggle = this.find(`#${this.id}-shootingStarToggle`);
        if (ssToggle) {
            this._ssHandler = (e) => {
                this.setState({ shootingStarActive: e.target.checked }, false);
                const panel = this.find(`#${this.id}-shootingStarSettings`);
                if (panel) panel.classList.toggle('open', e.target.checked);
                this.emit('shootingStar', e.target.checked);
            };
            ssToggle.addEventListener('change', this._ssHandler);
        }
    }
    
    /**
     * Unbind event listeners
     */
    unbindEvents() {
        if (this._buttonHandlers) {
            this._buttonHandlers.forEach((handler, button) => {
                button.removeEventListener('click', handler);
            });
            this._buttonHandlers.clear();
        }
        
        const ascendToggle = this.find(`#${this.id}-ascendToggle`);
        if (ascendToggle && this._ascendHandler) {
            ascendToggle.removeEventListener('change', this._ascendHandler);
        }
        
        const randomnessToggle = this.find(`#${this.id}-ascendRandomness`);
        if (randomnessToggle && this._randomnessHandler) {
            randomnessToggle.removeEventListener('change', this._randomnessHandler);
        }
        
        const ssToggle = this.find(`#${this.id}-shootingStarToggle`);
        if (ssToggle && this._ssHandler) {
            ssToggle.removeEventListener('change', this._ssHandler);
        }
    }
}

// Export
if (typeof window !== 'undefined') {
    window.AnimationsGroup = AnimationsGroup;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnimationsGroup;
}
