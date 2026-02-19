/**
 * ActionsGroup - Action buttons (Pause, Clear, Freeze)
 * Simple group of action buttons
 */

class ActionsGroup extends UIComponent {
    constructor(config) {
        super(config);
        
        // Action states
        this.state = {
            paused: false,
            frozen: false,
            ...this.state
        };
    }
    
    /**
     * Render actions group HTML
     */
    render() {
        return `
            <div data-component="${this.id}">
                <button id="${this.id}-pause" 
                        style="width: 100%; margin-top: 10px"
                        data-action="pause">
                    ${this.state.paused ? 'Resume' : 'Pause'}
                </button>
                
                <button id="${this.id}-clear" 
                        style="width: 100%; margin-top: 10px"
                        data-action="clear">
                    Clear
                </button>
                
                <button id="${this.id}-freeze" 
                        style="width: 100%; margin-top: 10px"
                        data-action="freeze">
                    ❄️ ${this.state.frozen ? 'Unfreeze' : 'Freeze'}
                </button>
            </div>
        `;
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Pause button
        const pauseBtn = this.find('[data-action="pause"]');
        if (pauseBtn) {
            this._pauseHandler = () => {
                this.togglePause();
            };
            pauseBtn.addEventListener('click', this._pauseHandler);
        }
        
        // Clear button
        const clearBtn = this.find('[data-action="clear"]');
        if (clearBtn) {
            this._clearHandler = () => {
                this.emit('clear');
            };
            clearBtn.addEventListener('click', this._clearHandler);
        }
        
        // Freeze button
        const freezeBtn = this.find('[data-action="freeze"]');
        if (freezeBtn) {
            this._freezeHandler = () => {
                this.toggleFreeze();
            };
            freezeBtn.addEventListener('click', this._freezeHandler);
        }
    }
    
    /**
     * Unbind event listeners
     */
    unbindEvents() {
        const pauseBtn = this.find('[data-action="pause"]');
        if (pauseBtn && this._pauseHandler) {
            pauseBtn.removeEventListener('click', this._pauseHandler);
        }
        
        const clearBtn = this.find('[data-action="clear"]');
        if (clearBtn && this._clearHandler) {
            clearBtn.removeEventListener('click', this._clearHandler);
        }
        
        const freezeBtn = this.find('[data-action="freeze"]');
        if (freezeBtn && this._freezeHandler) {
            freezeBtn.removeEventListener('click', this._freezeHandler);
        }
    }
    
    /**
     * Toggle pause state
     */
    togglePause() {
        const paused = !this.state.paused;
        this.setState({ paused }, false);
        
        // Update button text
        const pauseBtn = this.find('[data-action="pause"]');
        if (pauseBtn) {
            pauseBtn.textContent = paused ? 'Resume' : 'Pause';
        }
        
        this.emit('pause', paused);
    }
    
    /**
     * Toggle freeze state
     */
    toggleFreeze() {
        const frozen = !this.state.frozen;
        this.setState({ frozen }, false);
        
        // Update button text
        const freezeBtn = this.find('[data-action="freeze"]');
        if (freezeBtn) {
            freezeBtn.textContent = `❄️ ${frozen ? 'Unfreeze' : 'Freeze'}`;
        }
        
        this.emit('freeze', frozen);
    }
    
    /**
     * Set pause state
     * @param {boolean} paused
     */
    setPaused(paused) {
        if (this.state.paused !== paused) {
            this.togglePause();
        }
    }
    
    /**
     * Set freeze state
     * @param {boolean} frozen
     */
    setFrozen(frozen) {
        if (this.state.frozen !== frozen) {
            this.toggleFreeze();
        }
    }
}

// Export
if (typeof window !== 'undefined') {
    window.ActionsGroup = ActionsGroup;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ActionsGroup;
}
