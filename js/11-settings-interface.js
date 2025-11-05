/**
 * Settings Interface
 * High-level API for common settings patterns
 * Provides typed, validated methods for specific use cases
 */

(function() {
    if (!window.settingsManager) {
        console.error('Settings Manager not loaded');
        return;
    }

    const settings = window.settingsManager;

    /**
     * Settings Interface - Clean API for common patterns
     */
    window.Settings = {
        
        // ==================== UI PANEL SETTINGS ====================
        
        /**
         * Save panel state (position, pinned, enabled)
         * @param {string} panelName - Panel identifier
         * @param {object} state - Panel state {position: {x, y}, pinned: bool, enabled: bool}
         */
        savePanel(panelName, state) {
            if (state.position) {
                settings.set(`${panelName}.position`, state.position);
            }
            if (state.pinned !== undefined) {
                settings.set(`${panelName}.pinned`, state.pinned);
            }
            if (state.enabled !== undefined) {
                settings.set(`${panelName}.enabled`, state.enabled);
            }
        },

        /**
         * Load panel state
         * @param {string} panelName - Panel identifier
         * @returns {object} Panel state with defaults
         */
        loadPanel(panelName) {
            return {
                position: settings.get(`${panelName}.position`, null),
                pinned: settings.get(`${panelName}.pinned`, false),
                enabled: settings.get(`${panelName}.enabled`, false)
            };
        },

        /**
         * Reset panel to defaults
         * @param {string} panelName - Panel identifier
         */
        resetPanel(panelName) {
            settings.remove(`${panelName}.position`);
            settings.remove(`${panelName}.pinned`);
            settings.remove(`${panelName}.enabled`);
        },

        // ==================== SLIDER SETTINGS ====================

        /**
         * Save slider value
         * @param {string} sliderName - Slider identifier
         * @param {number} value - Slider value
         */
        saveSlider(sliderName, value) {
            settings.set(`slider.${sliderName}`, value);
        },

        /**
         * Load slider value
         * @param {string} sliderName - Slider identifier
         * @param {number} defaultValue - Default if not found
         * @returns {number}
         */
        loadSlider(sliderName, defaultValue = 0) {
            return settings.get(`slider.${sliderName}`, defaultValue);
        },

        /**
         * Save multiple slider values at once
         * @param {object} sliders - Object of {sliderName: value}
         */
        saveSliders(sliders) {
            Object.entries(sliders).forEach(([name, value]) => {
                this.saveSlider(name, value);
            });
        },

        /**
         * Load multiple slider values
         * @param {array} sliderNames - Array of slider names
         * @param {object} defaults - Default values {sliderName: defaultValue}
         * @returns {object} Loaded values
         */
        loadSliders(sliderNames, defaults = {}) {
            const values = {};
            sliderNames.forEach(name => {
                values[name] = this.loadSlider(name, defaults[name] || 0);
            });
            return values;
        },

        // ==================== CHECKBOX/TOGGLE SETTINGS ====================

        /**
         * Save checkbox state
         * @param {string} checkboxName - Checkbox identifier
         * @param {boolean} checked - Checked state
         */
        saveCheckbox(checkboxName, checked) {
            settings.set(`checkbox.${checkboxName}`, checked);
        },

        /**
         * Load checkbox state
         * @param {string} checkboxName - Checkbox identifier
         * @param {boolean} defaultValue - Default if not found
         * @returns {boolean}
         */
        loadCheckbox(checkboxName, defaultValue = false) {
            return settings.get(`checkbox.${checkboxName}`, defaultValue);
        },

        /**
         * Save multiple checkbox states
         * @param {object} checkboxes - Object of {checkboxName: checked}
         */
        saveCheckboxes(checkboxes) {
            Object.entries(checkboxes).forEach(([name, checked]) => {
                this.saveCheckbox(name, checked);
            });
        },

        // ==================== COLOR SETTINGS ====================

        /**
         * Save color value
         * @param {string} colorName - Color identifier
         * @param {string} color - Hex color value
         */
        saveColor(colorName, color) {
            settings.set(`color.${colorName}`, color);
        },

        /**
         * Load color value
         * @param {string} colorName - Color identifier
         * @param {string} defaultValue - Default hex color
         * @returns {string}
         */
        loadColor(colorName, defaultValue = '#000000') {
            return settings.get(`color.${colorName}`, defaultValue);
        },

        // ==================== DROPDOWN/SELECT SETTINGS ====================

        /**
         * Save dropdown selection
         * @param {string} selectName - Select identifier
         * @param {string|number} value - Selected value
         */
        saveSelect(selectName, value) {
            settings.set(`select.${selectName}`, value);
        },

        /**
         * Load dropdown selection
         * @param {string} selectName - Select identifier
         * @param {string|number} defaultValue - Default value
         * @returns {string|number}
         */
        loadSelect(selectName, defaultValue = '') {
            return settings.get(`select.${selectName}`, defaultValue);
        },

        // ==================== PRESET SETTINGS ====================

        /**
         * Save a named preset
         * @param {string} presetName - Preset identifier
         * @param {object} data - Preset data
         */
        savePreset(presetName, data) {
            settings.set(`preset.${presetName}`, data);
        },

        /**
         * Load a named preset
         * @param {string} presetName - Preset identifier
         * @returns {object|null}
         */
        loadPreset(presetName) {
            return settings.get(`preset.${presetName}`, null);
        },

        /**
         * Get all saved presets
         * @returns {object} All presets
         */
        getAllPresets() {
            const all = settings.getAll();
            const presets = {};
            Object.keys(all).forEach(key => {
                if (key.startsWith('preset.')) {
                    const name = key.substring(7);
                    presets[name] = all[key];
                }
            });
            return presets;
        },

        /**
         * Delete a preset
         * @param {string} presetName - Preset identifier
         */
        deletePreset(presetName) {
            settings.remove(`preset.${presetName}`);
        },

        // ==================== CANVAS/LAYOUT SETTINGS ====================

        /**
         * Save canvas dimensions
         * @param {number} width - Canvas width
         * @param {number} height - Canvas height
         */
        saveCanvasSize(width, height) {
            settings.set('canvas.size', { width, height });
        },

        /**
         * Load canvas dimensions
         * @returns {object|null} {width, height} or null
         */
        loadCanvasSize() {
            return settings.get('canvas.size', null);
        },

        /**
         * Save window/layout state
         * @param {string} layoutName - Layout identifier
         * @param {object} state - Layout state
         */
        saveLayout(layoutName, state) {
            settings.set(`layout.${layoutName}`, state);
        },

        /**
         * Load window/layout state
         * @param {string} layoutName - Layout identifier
         * @returns {object|null}
         */
        loadLayout(layoutName) {
            return settings.get(`layout.${layoutName}`, null);
        },

        // ==================== BULK OPERATIONS ====================

        /**
         * Save entire application state
         * @param {object} state - Complete app state
         */
        saveAppState(state) {
            if (state.panels) {
                Object.entries(state.panels).forEach(([name, panelState]) => {
                    this.savePanel(name, panelState);
                });
            }
            if (state.sliders) {
                this.saveSliders(state.sliders);
            }
            if (state.checkboxes) {
                this.saveCheckboxes(state.checkboxes);
            }
            if (state.colors) {
                Object.entries(state.colors).forEach(([name, color]) => {
                    this.saveColor(name, color);
                });
            }
            if (state.selects) {
                Object.entries(state.selects).forEach(([name, value]) => {
                    this.saveSelect(name, value);
                });
            }
            if (state.canvas) {
                this.saveCanvasSize(state.canvas.width, state.canvas.height);
            }
        },

        /**
         * Load entire application state
         * @param {object} defaults - Default values for each category
         * @returns {object} Complete app state
         */
        loadAppState(defaults = {}) {
            const state = {};
            
            // Load panels
            if (defaults.panels) {
                state.panels = {};
                Object.keys(defaults.panels).forEach(name => {
                    state.panels[name] = this.loadPanel(name);
                });
            }
            
            // Load sliders
            if (defaults.sliders) {
                state.sliders = this.loadSliders(
                    Object.keys(defaults.sliders),
                    defaults.sliders
                );
            }
            
            // Load checkboxes
            if (defaults.checkboxes) {
                state.checkboxes = {};
                Object.entries(defaults.checkboxes).forEach(([name, defaultVal]) => {
                    state.checkboxes[name] = this.loadCheckbox(name, defaultVal);
                });
            }
            
            // Load colors
            if (defaults.colors) {
                state.colors = {};
                Object.entries(defaults.colors).forEach(([name, defaultVal]) => {
                    state.colors[name] = this.loadColor(name, defaultVal);
                });
            }
            
            // Load selects
            if (defaults.selects) {
                state.selects = {};
                Object.entries(defaults.selects).forEach(([name, defaultVal]) => {
                    state.selects[name] = this.loadSelect(name, defaultVal);
                });
            }
            
            // Load canvas
            state.canvas = this.loadCanvasSize();
            
            return state;
        },

        // ==================== UTILITY METHODS ====================

        /**
         * Export all settings as JSON file
         * @param {string} filename - Download filename
         */
        exportToFile(filename = 'fluid-settings.json') {
            const json = settings.export();
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        },

        /**
         * Import settings from JSON file
         * @param {File} file - File object
         * @param {boolean} merge - Whether to merge or replace
         * @returns {Promise<boolean>}
         */
        importFromFile(file, merge = true) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const success = settings.import(e.target.result, merge);
                        resolve(success);
                    } catch (error) {
                        reject(error);
                    }
                };
                reader.onerror = reject;
                reader.readAsText(file);
            });
        },

        /**
         * Clear all settings
         */
        clearAll() {
            settings.clear();
        },

        /**
         * Get raw settings manager (for advanced use)
         */
        get raw() {
            return settings;
        }
    };

    // Register validators for common patterns
    settings.registerValidator('canvas.size', (value) => {
        return value && 
               typeof value.width === 'number' && 
               typeof value.height === 'number' &&
               value.width > 0 && value.height > 0;
    });

    console.log('Settings Interface initialized');
})();
