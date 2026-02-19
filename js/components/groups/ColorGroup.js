/**
 * ColorGroup - Complete color control component
 * Includes color picker, saved colors, palette carousel, and random toggle
 */

class ColorGroup extends UIComponent {
    constructor(config) {
        super(config);
        
        // Color-specific configuration
        this.currentColor = config.currentColor || '#ff0000';
        this.savedColors = config.savedColors || [];
        this.randomEnabled = config.randomEnabled !== undefined ? config.randomEnabled : true;
        this.stepPalette = config.stepPalette !== undefined ? config.stepPalette : false;
        this.currentPalette = config.currentPalette || null;
        this.paletteStep = config.paletteStep || 0;
        
        // Set initial state
        this.state = {
            currentColor: this.currentColor,
            savedColors: this.savedColors,
            randomEnabled: this.randomEnabled,
            stepPalette: this.stepPalette,
            currentPalette: this.currentPalette,
            paletteStep: this.paletteStep,
            ...this.state
        };
        
        // Load saved colors from localStorage
        this.loadSavedColors();
    }
    
    /**
     * Load saved colors from localStorage
     */
    loadSavedColors() {
        try {
            const saved = localStorage.getItem('savedColors');
            if (saved) {
                this.state.savedColors = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Error loading saved colors:', e);
        }
    }
    
    /**
     * Save colors to localStorage
     */
    saveSavedColors() {
        try {
            localStorage.setItem('savedColors', JSON.stringify(this.state.savedColors));
        } catch (e) {
            console.error('Error saving colors:', e);
        }
    }
    
    /**
     * Render color group HTML
     */
    render() {
        return `
            <div class="control-group" data-component="${this.id}">
                <label for="${this.id}-picker">Fluid Color</label>
                <input type="color" 
                       id="${this.id}-picker" 
                       value="${this.state.currentColor}">
                
                <div class="color-actions">
                    <button data-action="save">Save Color</button>
                    <button data-action="clear">Clear All</button>
                </div>
                
                <div class="saved-colors" data-saved-colors>
                    ${this.renderSavedColors()}
                </div>
                
                <div class="control-group checkbox-group" style="margin-top: 8px;">
                    <input type="checkbox" 
                           id="${this.id}-random" 
                           ${this.state.randomEnabled ? 'checked' : ''}>
                    <label for="${this.id}-random" style="margin: 0">Random Colors</label>
                </div>
                
                <div style="margin-top: 10px;">
                    <label>Palette <span id="paletteImportStatus" class="import-status"></span></label>
                    <div class="palette-carousel" id="paletteCarousel"></div>
                    <div class="palette-row-split">
                        <div class="palette-left">
                            <div class="palette-preview" id="palettePreview"></div>
                            <div class="palette-step" id="paletteStepIndicator"></div>
                        </div>
                        <div class="palette-right">
                            <div class="palette-create" id="paletteCreateRow">
                                <div class="palette-btn-row">
                                    <button id="updatePaletteBtn">Update</button>
                                    <button id="saveNewPaletteBtn">+ Save as New</button>
                                </div>
                                <div class="palette-name-input" id="paletteNameInput" style="display:none;">
                                    <input type="text" id="newPaletteName" placeholder="Enter Palette Name" />
                                    <div class="palette-name-input-buttons">
                                        <button id="confirmSaveBtn">Save</button>
                                        <button id="cancelSaveBtn">Cancel</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="palette-actions">
                        <button onclick="exportCurrentPaletteFluid()">Export Current</button>
                        <button onclick="exportAllPalettesFluid()">Export All</button>
                        <button onclick="document.getElementById('paletteFluidFile').click()">Import</button>
                        <input type="file" id="paletteFluidFile" accept=".fluid,text/plain" style="display:none" onchange="importPalettesFluidFromFile(this.files[0]); this.value='';" />
                    </div>
                </div>
            </div>
            
            <div class="control-group checkbox-group">
                <input type="checkbox" 
                       id="${this.id}-stepPalette"
                       ${this.state.stepPalette ? 'checked' : ''}>
                <label for="${this.id}-stepPalette" style="margin: 0">Step through palette</label>
            </div>
        `;
    }
    
    /**
     * Render saved color swatches
     */
    renderSavedColors() {
        if (this.state.savedColors.length === 0) {
            return '<div style="text-align: center; opacity: 0.5; padding: 10px;">No saved colors</div>';
        }
        
        return this.state.savedColors.map(color => 
            `<div class="color-swatch" 
                  style="background: ${color};" 
                  data-color="${color}"
                  title="${color}"></div>`
        ).join('');
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        // Color picker
        const picker = this.find(`#${this.id}-picker`);
        if (picker) {
            this._pickerHandler = (e) => {
                this.setColor(e.target.value);
            };
            picker.addEventListener('input', this._pickerHandler);
        }
        
        // Save button
        const saveBtn = this.find('[data-action="save"]');
        if (saveBtn) {
            this._saveHandler = () => this.saveCurrentColor();
            saveBtn.addEventListener('click', this._saveHandler);
        }
        
        // Clear button
        const clearBtn = this.find('[data-action="clear"]');
        if (clearBtn) {
            this._clearHandler = () => this.clearColors();
            clearBtn.addEventListener('click', this._clearHandler);
        }
        
        // Color swatches (event delegation)
        const swatchContainer = this.find('[data-saved-colors]');
        if (swatchContainer) {
            this._swatchHandler = (e) => {
                if (e.target.classList.contains('color-swatch')) {
                    this.setColor(e.target.dataset.color);
                }
            };
            swatchContainer.addEventListener('click', this._swatchHandler);
        }
        
        // Random toggle
        const randomToggle = this.find(`#${this.id}-random`);
        if (randomToggle) {
            this._randomHandler = (e) => {
                this.setRandomEnabled(e.target.checked);
            };
            randomToggle.addEventListener('change', this._randomHandler);
        }
        
        // Step palette toggle
        const stepToggle = this.find(`#${this.id}-stepPalette`);
        if (stepToggle) {
            this._stepHandler = (e) => {
                this.setStepPalette(e.target.checked);
            };
            stepToggle.addEventListener('change', this._stepHandler);
        }
    }
    
    /**
     * Unbind event listeners
     */
    unbindEvents() {
        const picker = this.find(`#${this.id}-picker`);
        if (picker && this._pickerHandler) {
            picker.removeEventListener('input', this._pickerHandler);
        }
        
        const saveBtn = this.find('[data-action="save"]');
        if (saveBtn && this._saveHandler) {
            saveBtn.removeEventListener('click', this._saveHandler);
        }
        
        const clearBtn = this.find('[data-action="clear"]');
        if (clearBtn && this._clearHandler) {
            clearBtn.removeEventListener('click', this._clearHandler);
        }
        
        const swatchContainer = this.find('[data-saved-colors]');
        if (swatchContainer && this._swatchHandler) {
            swatchContainer.removeEventListener('click', this._swatchHandler);
        }
        
        const randomToggle = this.find(`#${this.id}-random`);
        if (randomToggle && this._randomHandler) {
            randomToggle.removeEventListener('change', this._randomHandler);
        }
        
        const stepToggle = this.find(`#${this.id}-stepPalette`);
        if (stepToggle && this._stepHandler) {
            stepToggle.removeEventListener('change', this._stepHandler);
        }
    }
    
    /**
     * Set current color
     * @param {string} color - Hex color value
     */
    setColor(color) {
        this.setState({ currentColor: color }, false);
        
        // Update picker
        const picker = this.find(`#${this.id}-picker`);
        if (picker) {
            picker.value = color;
        }
        
        this.emit('colorChange', color);
    }
    
    /**
     * Save current color to saved colors
     */
    saveCurrentColor() {
        const color = this.state.currentColor;
        
        if (!this.state.savedColors.includes(color)) {
            const savedColors = [...this.state.savedColors, color];
            this.setState({ savedColors }, false);
            this.saveSavedColors();
            
            // Update swatches display
            const swatchContainer = this.find('[data-saved-colors]');
            if (swatchContainer) {
                swatchContainer.innerHTML = this.renderSavedColors();
            }
            
            this.emit('colorSaved', color);
        }
    }
    
    /**
     * Clear all saved colors
     */
    clearColors() {
        this.setState({ savedColors: [] }, false);
        this.saveSavedColors();
        
        // Update swatches display
        const swatchContainer = this.find('[data-saved-colors]');
        if (swatchContainer) {
            swatchContainer.innerHTML = this.renderSavedColors();
        }
        
        this.emit('colorsCleared');
    }
    
    /**
     * Set random colors enabled
     * @param {boolean} enabled
     */
    setRandomEnabled(enabled) {
        this.setState({ randomEnabled: enabled }, false);
        this.emit('randomToggle', enabled);
    }
    
    /**
     * Set step palette enabled
     * @param {boolean} enabled
     */
    setStepPalette(enabled) {
        this.setState({ stepPalette: enabled }, false);
        this.emit('stepPaletteToggle', enabled);
    }
    
    /**
     * Get current color
     * @returns {string}
     */
    getColor() {
        return this.state.currentColor;
    }
    
    /**
     * Get saved colors
     * @returns {Array<string>}
     */
    getSavedColors() {
        return [...this.state.savedColors];
    }
    
    /**
     * Sync with external color picker
     */
    syncFromExternal() {
        if (!this.syncTarget) return;
        const color = this.syncTarget.value;
        this.setColor(color);
    }
    
    /**
     * Sync to external color picker
     */
    syncToExternal(color) {
        if (!this.syncTarget) return;
        this.syncTarget.value = color;
        this.syncTarget.dispatchEvent(new Event('input', { bubbles: true }));
        this.syncTarget.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    /**
     * Called after mount - initialize palette system
     */
    onMount() {
        // Initialize palette carousel if function exists
        if (typeof window.initializePaletteCarousel === 'function') {
            window.initializePaletteCarousel();
        }
    }
}

// Export
if (typeof window !== 'undefined') {
    window.ColorGroup = ColorGroup;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ColorGroup;
}
