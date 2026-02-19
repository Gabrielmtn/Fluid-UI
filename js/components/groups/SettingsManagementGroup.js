/**
 * SettingsManagementGroup - Settings save/load/clear controls
 * Includes recording mode
 */

class SettingsManagementGroup extends UIComponent {
    constructor(config) {
        super(config);
        
        // Settings states
        this.state = {
            recMode: 'off',
            autoload: false,
            ...this.state
        };
    }
    
    /**
     * Render settings management group HTML
     */
    render() {
        return `
            <div data-component="${this.id}">
                <!-- Recording Mode -->
                <div class="control-group" style="margin-top: 10px;">
                    <label for="${this.id}-recMode">Recording Mode</label>
                    <select id="${this.id}-recMode">
                        <option value="off" ${this.state.recMode === 'off' ? 'selected' : ''}>Off</option>
                        <option value="min" ${this.state.recMode === 'min' ? 'selected' : ''}>Minimized</option>
                        <option value="full" ${this.state.recMode === 'full' ? 'selected' : ''}>Full</option>
                    </select>
                </div>
                
                <!-- Settings Management -->
                <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <div style="display: flex; gap: 6px;">
                        <button id="${this.id}-save" 
                                style="flex: 1;"
                                data-action="save">
                            💾 Save
                        </button>
                        <button id="${this.id}-load" 
                                style="flex: 1;"
                                data-action="load">
                            📂 Load
                        </button>
                        <button id="${this.id}-clear" 
                                style="flex: 1;"
                                data-action="clear">
                            🧹 Clear
                        </button>
                    </div>
                    
                    <div class="control-group checkbox-group" style="margin-top: 8px;">
                        <input type="checkbox" 
                               id="${this.id}-autoload"
                               ${this.state.autoload ? 'checked' : ''}>
                        <label for="${this.id}-autoload" style="margin: 0">Autoload on Start</label>
                    </div>
                </div>
                
                <!-- Presets -->
                <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <label style="display: block; margin-bottom: 8px;">Presets</label>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                        <button data-preset="silky">Silky</button>
                        <button data-preset="thick">Thick</button>
                        <button data-preset="wispy">Wispy</button>
                        <button data-preset="chaotic">Chaotic</button>
                        <button data-preset="ethereal">Ethereal</button>
                        <button data-preset="turbulent">Turbulent</button>
                        <button data-preset="marble">Marble</button>
                        <button data-preset="electric">Electric</button>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Recording mode
        const recModeSelect = this.find(`#${this.id}-recMode`);
        if (recModeSelect) {
            this._recModeHandler = (e) => {
                this.setState({ recMode: e.target.value }, false);
                this.emit('recModeChange', e.target.value);
            };
            recModeSelect.addEventListener('change', this._recModeHandler);
        }
        
        // Settings buttons
        const saveBtn = this.find('[data-action="save"]');
        if (saveBtn) {
            this._saveHandler = () => {
                this.emit('saveSettings');
            };
            saveBtn.addEventListener('click', this._saveHandler);
        }
        
        const loadBtn = this.find('[data-action="load"]');
        if (loadBtn) {
            this._loadHandler = () => {
                this.emit('loadSettings');
            };
            loadBtn.addEventListener('click', this._loadHandler);
        }
        
        const clearBtn = this.find('[data-action="clear"]');
        if (clearBtn) {
            this._clearHandler = () => {
                this.emit('clearSettings');
            };
            clearBtn.addEventListener('click', this._clearHandler);
        }
        
        // Autoload toggle
        const autoloadToggle = this.find(`#${this.id}-autoload`);
        if (autoloadToggle) {
            this._autoloadHandler = (e) => {
                this.setState({ autoload: e.target.checked }, false);
                this.emit('autoloadChange', e.target.checked);
            };
            autoloadToggle.addEventListener('change', this._autoloadHandler);
        }
        
        // Preset buttons
        const presetBtns = this.findAll('[data-preset]');
        this._presetHandlers = this._presetHandlers || new Map();
        
        presetBtns.forEach(btn => {
            const preset = btn.dataset.preset;
            const handler = () => {
                this.emit('applyPreset', preset);
            };
            btn.addEventListener('click', handler);
            this._presetHandlers.set(btn, handler);
        });
    }
    
    /**
     * Unbind event listeners
     */
    unbindEvents() {
        const recModeSelect = this.find(`#${this.id}-recMode`);
        if (recModeSelect && this._recModeHandler) {
            recModeSelect.removeEventListener('change', this._recModeHandler);
        }
        
        const saveBtn = this.find('[data-action="save"]');
        if (saveBtn && this._saveHandler) {
            saveBtn.removeEventListener('click', this._saveHandler);
        }
        
        const loadBtn = this.find('[data-action="load"]');
        if (loadBtn && this._loadHandler) {
            loadBtn.removeEventListener('click', this._loadHandler);
        }
        
        const clearBtn = this.find('[data-action="clear"]');
        if (clearBtn && this._clearHandler) {
            clearBtn.removeEventListener('click', this._clearHandler);
        }
        
        const autoloadToggle = this.find(`#${this.id}-autoload`);
        if (autoloadToggle && this._autoloadHandler) {
            autoloadToggle.removeEventListener('change', this._autoloadHandler);
        }
        
        if (this._presetHandlers) {
            this._presetHandlers.forEach((handler, btn) => {
                btn.removeEventListener('click', handler);
            });
            this._presetHandlers.clear();
        }
    }
}

// Export
if (typeof window !== 'undefined') {
    window.SettingsManagementGroup = SettingsManagementGroup;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SettingsManagementGroup;
}
