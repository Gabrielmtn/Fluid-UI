// NOT LOADED by index.html in this copy
/**
 * Layout Manager
 * Handles the new professional layout with bottom mixer, top color bar, right layers, and settings dropdown
 */

(function() {
    'use strict';
    
    let settingsOpen = false;
    let layersOpen = true;
    
    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    function init() {
        console.log('Initializing Layout Manager...');
        
        createColorBar();
        createMixerPanel();
        createLayersPanel();
        createSettingsPanel();
        createSettingsToggle();
        
        // Initialize mixer channels
        initMixerChannels();
        
        // Setup event listeners
        setupEventListeners();
        
        console.log('Layout Manager initialized');
    }
    
    function createColorBar() {
        const colorBar = document.createElement('div');
        colorBar.id = 'colorBar';
        colorBar.innerHTML = `
            <div class="color-section">
                <div class="color-swatch-large primary" id="primaryColor" style="background: #ff0000;" title="Primary Color">
                    <div class="color-swap-icon" title="Swap Colors">⇄</div>
                </div>
                <div class="color-swatch-large" id="secondaryColor" style="background: #0000ff;" title="Secondary Color"></div>
            </div>
            
            <div class="color-section" style="flex-direction: column; gap: 4px;">
                <label style="font-size: 10px; color: #8E8E8E; text-transform: uppercase;">Brush Size</label>
                <input type="range" id="brushSizeTop" min="0.1" max="30" value="11" step="0.1" style="width: 120px;">
            </div>
            
            <div class="palette-quick-select" id="paletteQuickSelect">
                <!-- Populated dynamically -->
            </div>
            
            <div class="color-actions-bar">
                <button id="randomColorBtn" title="Random Color">🎲</button>
                <button id="stepPaletteBtn" title="Step Palette">⏭️</button>
                <button id="saveColorBtn" title="Save Color">💾</button>
                <button id="clearColorsBtn" title="Clear All">🗑️</button>
                <button id="paletteManagerBtn" title="Palette Manager">🎨</button>
            </div>
        `;
        
        document.body.appendChild(colorBar);
        
        // Populate quick palette
        updateQuickPalette();
    }
    
    function createMixerPanel() {
        const mixerPanel = document.createElement('div');
        mixerPanel.id = 'mixerPanel';
        
        // Define mixer channels - ALL simulation parameters
        const channels = [
            { id: 'densityDissipation', label: 'Density', type: 'fader', min: 0.85, max: 1.005, value: 0.993, step: 0.0001 },
            { id: 'velocityDissipation', label: 'Velocity', type: 'fader', min: 0.9, max: 1.0009, value: 0.999, step: 0.0001 },
            { id: 'pressureDissipation', label: 'Pressure', type: 'fader', min: 0.9, max: 1.0333, value: 0.944, step: 0.001 },
            { id: 'pressureIteration', label: 'Iterations', type: 'fader', min: 1, max: 50, value: 20, step: 1 },
            { id: 'velocityInfluence', label: 'Motion Iso', type: 'knob', min: 1, max: 5, value: 1.2, step: 0.001 },
            { id: 'curl', label: 'Curl', type: 'knob', min: 0, max: 60, value: 10, step: 1 },
            { id: 'sharpness', label: 'Viscosity', type: 'knob', min: 0, max: 2, value: 0.8, step: 0.1 },
            { id: 'multiplier', label: 'Multiplier', type: 'knob', min: 1, max: 8, value: 1, step: 1 },
            { id: 'timeScale', label: 'Time', type: 'knob', min: 0.01, max: 3, value: 1, step: 0.01 },
            { id: 'kaleidoSegments', label: 'K-Segments', type: 'knob', min: 1, max: 24, value: 12, step: 1 },
            { id: 'kAngle', label: 'K-Angle', type: 'knob', min: -180, max: 180, value: 0, step: 1 },
            { id: 'kSpinSpeed', label: 'K-Spin', type: 'knob', min: -180, max: 180, value: 30, step: 1 },
            { id: 'kTwist', label: 'K-Twist', type: 'knob', min: 0, max: 10, value: 0, step: 0.1 },
            { id: 'kZoom', label: 'K-Zoom', type: 'knob', min: 0.5, max: 2, value: 1, step: 0.01 },
            { id: 'kBlend', label: 'K-Blend', type: 'knob', min: 0, max: 1, value: 1, step: 0.01 },
            { id: 'canvasOpacity', label: 'Canvas α', type: 'fader', min: 0, max: 100, value: 100, step: 1 },
            { id: 'captureDimming', label: 'BG Trans', type: 'fader', min: 0, max: 100, value: 80, step: 1 }
        ];
        
        channels.forEach(channel => {
            const channelEl = createMixerChannel(channel);
            mixerPanel.appendChild(channelEl);
        });
        
        document.body.appendChild(mixerPanel);
    }
    
    function createMixerChannel(config) {
        const channel = document.createElement('div');
        channel.className = 'mixer-channel';
        channel.dataset.channelId = config.id;
        
        if (config.type === 'fader') {
            channel.innerHTML = `
                <div class="mixer-channel-label">${config.label}</div>
                <div class="mixer-fader-container">
                    <input type="range" 
                           class="mixer-fader" 
                           id="mixer-${config.id}"
                           min="${config.min}" 
                           max="${config.max}" 
                           value="${config.value}" 
                           step="${config.step}"
                           orient="vertical">
                </div>
                <div class="mixer-value-display" id="mixer-${config.id}-value">${formatValue(config.value, config)}</div>
            `;
        } else if (config.type === 'knob') {
            channel.innerHTML = `
                <div class="mixer-channel-label">${config.label}</div>
                <div class="radialSlider" id="mixer-${config.id}-knob"></div>
            `;
        }
        
        return channel;
    }
    
    function createLayersPanel() {
        const layersPanel = document.createElement('div');
        layersPanel.id = 'layersPanel';
        layersPanel.innerHTML = `
            <div class="layers-header">
                <h3>Layers</h3>
                <div class="layers-actions">
                    <button id="addLayerBtn" title="Add Layer">+</button>
                    <button id="deleteLayerBtn" title="Delete Layer">−</button>
                    <button id="toggleLayersBtn" title="Toggle Layers" class="mobile-only">☰</button>
                </div>
            </div>
            <div class="layers-content" id="layersContent">
                <!-- Populated dynamically -->
            </div>
        `;
        
        document.body.appendChild(layersPanel);
        
        // Populate with existing layers
        updateLayersList();
    }
    
    function createSettingsPanel() {
        const settingsPanel = document.createElement('div');
        settingsPanel.id = 'settingsPanel';
        settingsPanel.innerHTML = `
            <div class="settings-header">
                <h3>⚙️ Settings</h3>
                <button class="settings-close" id="settingsCloseBtn">✕</button>
            </div>
            <div class="settings-content">
                <div class="settings-section">
                    <div class="settings-section-title">Quality</div>
                    <div class="settings-row">
                        <span class="settings-label">Visual Quality</span>
                        <div class="settings-control">
                            <select id="settings-visualRes">
                                <option value="2048">High (2K)</option>
                                <option value="1024" selected>Medium (1K)</option>
                                <option value="512">Low (512)</option>
                            </select>
                        </div>
                    </div>
                    <div class="settings-row">
                        <span class="settings-label">Physics Detail</span>
                        <div class="settings-control">
                            <select id="settings-physicsRes">
                                <option value="1024">High</option>
                                <option value="512" selected>Medium</option>
                                <option value="256">Low</option>
                            </select>
                        </div>
                    </div>
                    <div class="settings-row">
                        <span class="settings-label">FPS Limit</span>
                        <div class="settings-control">
                            <select id="settings-fpsCap">
                                <option value="30">30 fps</option>
                                <option value="60" selected>60 fps</option>
                                <option value="120">120 fps</option>
                                <option value="144">144 fps</option>
                                <option value="165">165 fps</option>
                                <option value="240">240 fps</option>
                                <option value="native">Native</option>
                                <option value="0">Uncapped</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">Display</div>
                    <div class="settings-row">
                        <span class="settings-label">Show Cursor</span>
                        <div class="settings-control">
                            <input type="checkbox" id="settings-cursor" checked>
                        </div>
                    </div>
                    <div class="settings-row">
                        <span class="settings-label">Canvas Handles</span>
                        <div class="settings-control">
                            <input type="checkbox" id="settings-handles" checked>
                        </div>
                    </div>
                    <div class="settings-row">
                        <span class="settings-label">Stats Panel</span>
                        <div class="settings-control">
                            <input type="checkbox" id="settings-stats">
                        </div>
                    </div>
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">Effects</div>
                    <div class="settings-row">
                        <span class="settings-label">Kaleidoscope</span>
                        <div class="settings-control">
                            <input type="checkbox" id="settings-kaleido">
                        </div>
                    </div>
                    <div class="settings-row">
                        <span class="settings-label">K-Animate Rotation</span>
                        <div class="settings-control">
                            <input type="checkbox" id="settings-kAnimateRot">
                        </div>
                    </div>
                    <div class="settings-row">
                        <span class="settings-label">Light Source</span>
                        <div class="settings-control">
                            <input type="checkbox" id="settings-light">
                        </div>
                    </div>
                    <div class="settings-row">
                        <span class="settings-label">Light Shift</span>
                        <div class="settings-control">
                            <input type="checkbox" id="settings-lightShift">
                        </div>
                    </div>
                    <div class="settings-row">
                        <span class="settings-label">Turbulence</span>
                        <div class="settings-control">
                            <input type="checkbox" id="settings-turbulence">
                        </div>
                    </div>
                    <div class="settings-row">
                        <span class="settings-label">☀️ Sunrays</span>
                        <div class="settings-control">
                            <input type="checkbox" id="settings-sunrays">
                        </div>
                    </div>
                    <div class="settings-row settings-sunrays-params" style="display:none; flex-direction:column; gap:4px; padding-left:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span class="settings-label" style="font-size:10px;">Weight</span>
                            <input type="range" id="settings-sunraysWeight" min="0.1" max="3" value="1.0" step="0.1" style="width:80px;">
                        </div>
                    </div>
                    <div class="settings-row">
                        <span class="settings-label">Random Colors</span>
                        <div class="settings-control">
                            <input type="checkbox" id="settings-randomColor" checked>
                        </div>
                    </div>
                    <div class="settings-row">
                        <span class="settings-label">Step Palette</span>
                        <div class="settings-control">
                            <input type="checkbox" id="settings-stepPalette">
                        </div>
                    </div>
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">Canvas</div>
                    <div class="settings-row">
                        <span class="settings-label">Transparent BG</span>
                        <div class="settings-control">
                            <input type="checkbox" id="settings-transparentMode">
                        </div>
                    </div>
                    <div class="settings-row">
                        <span class="settings-label">Empty Alpha Locked</span>
                        <div class="settings-control">
                            <input type="checkbox" id="settings-preserveFluidOpacity" checked>
                        </div>
                    </div>
                    <div class="settings-row">
                        <span class="settings-label">Lock Borders</span>
                        <div class="settings-control">
                            <input type="checkbox" id="settings-lockCanvasBorders">
                        </div>
                    </div>
                    <div class="settings-row">
                        <span class="settings-label">Background Color</span>
                        <div class="settings-control">
                            <input type="color" id="settings-backgroundColorPicker" value="#000000" style="width: 60px; height: 24px;">
                        </div>
                    </div>
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">Kaleidoscope Mode</div>
                    <div class="settings-row">
                        <select id="settings-kaleidoMode" style="width: 100%;">
                            <option value="1" selected>Wedge</option>
                            <option value="2">Mirror H</option>
                            <option value="3">Mirror V</option>
                            <option value="4">Mirror Quad</option>
                            <option value="5">Spiral</option>
                            <option value="0">Off</option>
                        </select>
                    </div>
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">Actions</div>
                    <div class="settings-row">
                        <button id="settings-pause" style="width: 100%;">Pause</button>
                    </div>
                    <div class="settings-row">
                        <button id="settings-clear" style="width: 100%;">Clear Canvas</button>
                    </div>
                    <div class="settings-row">
                        <button id="settings-freeze" style="width: 100%;">❄️ Freeze</button>
                    </div>
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">Animations</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                        <button id="settings-smash">💥 Smash</button>
                        <button id="settings-jellyfish">🪼 Jellyfish</button>
                        <button id="settings-vortex">🌀 Vortex</button>
                        <button id="settings-portal">🌌 Portal</button>
                        <button id="settings-portrait">🎨 Portrait</button>
                        <button id="settings-ascend">⬆️ Ascend</button>
                    </div>
                    <div class="settings-row" style="margin-top: 8px;">
                        <span class="settings-label">Ascend Randomness</span>
                        <div class="settings-control">
                            <input type="checkbox" id="settings-ascendRandomness">
                        </div>
                    </div>
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">Layers</div>
                    <div class="settings-row">
                        <button id="settings-captureLayer" style="width: 100%;">Capture Layer</button>
                    </div>
                    <div class="settings-row">
                        <button id="settings-uploadImage" style="width: 100%;">📁 Upload Image</button>
                    </div>
                    <div class="settings-row">
                        <span class="settings-label">Capture on Hover</span>
                        <div class="settings-control">
                            <input type="checkbox" id="settings-hoverCapture">
                        </div>
                    </div>
                    <div class="settings-row">
                        <span class="settings-label">Detach Capture</span>
                        <div class="settings-control">
                            <input type="checkbox" id="settings-detachCapture">
                        </div>
                    </div>
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">Recording</div>
                    <div class="settings-row">
                        <span class="settings-label">Mode</span>
                        <select id="settings-recMode" style="width: 100%;">
                            <option value="off" selected>Off</option>
                            <option value="min">Minimized</option>
                            <option value="full">Full</option>
                        </select>
                    </div>
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">Multi Artist</div>
                    <div class="settings-row">
                        <span class="settings-label">Enable</span>
                        <div class="settings-control">
                            <input type="checkbox" id="settings-multiplayer">
                        </div>
                    </div>
                    <div class="settings-row">
                        <button id="settings-copyRoom" style="width: 100%; font-size: 11px;">Copy Room URL</button>
                    </div>
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">Settings Management</div>
                    <div style="display: flex; gap: 6px;">
                        <button id="settings-save" style="flex: 1;">💾 Save</button>
                        <button id="settings-load" style="flex: 1;">📂 Load</button>
                        <button id="settings-clearAll" style="flex: 1;">🧹 Clear</button>
                    </div>
                    <div class="settings-row" style="margin-top: 8px;">
                        <span class="settings-label">Autoload on Start</span>
                        <div class="settings-control">
                            <input type="checkbox" id="settings-autoload">
                        </div>
                    </div>
                </div>
                
                <div class="settings-section">
                    <div class="settings-section-title">Built-in Presets</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                        <button onclick="applyPreset('silky')">Silky</button>
                        <button onclick="applyPreset('thick')">Thick</button>
                        <button onclick="applyPreset('wispy')">Wispy</button>
                        <button onclick="applyPreset('chaotic')">Chaotic</button>
                        <button onclick="applyPreset('ethereal')">Ethereal</button>
                        <button onclick="applyPreset('turbulent')">Turbulent</button>
                        <button onclick="applyPreset('marble')">Marble</button>
                        <button onclick="applyPreset('electric')">Electric</button>
                    </div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-title">My Presets</div>
                    <div id="layoutUserPresetsList" class="user-presets-list"></div>
                    <div id="layoutPresetSaveRow" style="display: flex; gap: 6px; margin-top: 8px;">
                        <button id="layoutSaveAsPresetBtn" style="flex: 1;">+ Save Current</button>
                    </div>
                    <div id="layoutPresetNameRow" style="display: none; gap: 6px; margin-top: 8px;">
                        <input type="text" id="layoutPresetNameInput" placeholder="Preset name..." maxlength="32" spellcheck="false" autocomplete="off" style="flex: 1; padding: 6px 8px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; color: white; font-size: 11px;">
                        <button id="layoutPresetConfirmBtn" style="padding: 6px 10px;">Save</button>
                        <button id="layoutPresetCancelBtn" style="padding: 6px 10px; background: rgba(255,100,100,0.2); border: 1px solid rgba(255,100,100,0.3);">Cancel</button>
                    </div>
                    <div id="layoutPresetStatus" style="display: none; font-size: 10px; margin-top: 4px; color: #3fb950; text-align: center;"></div>
                </div>
            </div>
        `;
        
        document.body.appendChild(settingsPanel);
    }
    
    function createSettingsToggle() {
        const toggle = document.createElement('button');
        toggle.id = 'settingsToggleBtn';
        toggle.innerHTML = '⚙️';
        toggle.title = 'Settings';
        
        document.body.appendChild(toggle);
    }
    
    function setupEventListeners() {
        // Settings toggle
        const settingsToggle = document.getElementById('settingsToggleBtn');
        const settingsPanel = document.getElementById('settingsPanel');
        const settingsClose = document.getElementById('settingsCloseBtn');
        
        settingsToggle?.addEventListener('click', () => {
            settingsOpen = !settingsOpen;
            settingsPanel.classList.toggle('open', settingsOpen);
            settingsToggle.classList.toggle('active', settingsOpen);
        });
        
        settingsClose?.addEventListener('click', () => {
            settingsOpen = false;
            settingsPanel.classList.remove('open');
            settingsToggle.classList.remove('active');
        });
        
        // Close settings when clicking outside
        document.addEventListener('click', (e) => {
            if (settingsOpen && 
                !settingsPanel.contains(e.target) && 
                !settingsToggle.contains(e.target)) {
                settingsOpen = false;
                settingsPanel.classList.remove('open');
                settingsToggle.classList.remove('active');
            }
        });
        
        // Color bar actions
        document.getElementById('randomColorBtn')?.addEventListener('click', () => {
            document.getElementById('randomColor')?.click();
        });
        
        document.getElementById('stepPaletteBtn')?.addEventListener('click', () => {
            document.getElementById('stepPalette')?.click();
        });
        
        document.getElementById('saveColorBtn')?.addEventListener('click', () => {
            if (typeof saveColor === 'function') saveColor();
        });
        
        document.getElementById('clearColorsBtn')?.addEventListener('click', () => {
            if (typeof clearColors === 'function') clearColors();
        });
        
        document.getElementById('paletteManagerBtn')?.addEventListener('click', () => {
            // Open a palette management modal (future enhancement)
            alert('Palette Manager: Export/Import palettes, manage saved colors');
        });
        
        // Brush size sync
        const brushSizeTop = document.getElementById('brushSizeTop');
        const brushSizeOrig = document.getElementById('brushSize');
        if (brushSizeTop && brushSizeOrig) {
            brushSizeTop.addEventListener('input', () => {
                brushSizeOrig.value = brushSizeTop.value;
                brushSizeOrig.dispatchEvent(new Event('input', { bubbles: true }));
            });
            brushSizeOrig.addEventListener('input', () => {
                brushSizeTop.value = brushSizeOrig.value;
            });
        }
        
        // Primary color click
        document.getElementById('primaryColor')?.addEventListener('click', () => {
            document.getElementById('colorPicker')?.click();
        });
        
        // Sync settings with existing controls
        syncSettingsWithControls();
    }
    
    function initMixerChannels() {
        // Initialize radial sliders for knob-type channels
        const knobChannels = document.querySelectorAll('.mixer-channel .radialSlider');
        
        knobChannels.forEach(container => {
            const id = container.id.replace('mixer-', '').replace('-knob', '');
            const channel = document.querySelector(`[data-channel-id="${id}"]`);
            
            if (!channel) return;
            
            // Get config from original input if it exists
            const originalInput = document.getElementById(id) || 
                                 document.getElementById(`${id}Dissipation`) ||
                                 document.getElementById(`kaleidoSegments`);
            
            if (originalInput && typeof RadialSlider !== 'undefined') {
                const min = parseFloat(originalInput.min) || 0;
                const max = parseFloat(originalInput.max) || 100;
                const value = parseFloat(originalInput.value) || 50;
                const step = parseFloat(originalInput.step) || 1;
                
                new RadialSlider(container, {
                    min,
                    max,
                    value,
                    step,
                    label: '',
                    format: (val) => formatValue(val, { min, max, step }),
                    onChange: (val) => {
                        // Update original control
                        if (originalInput) {
                            originalInput.value = val;
                            originalInput.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                });
            }
        });
        
        // Setup fader listeners
        const faders = document.querySelectorAll('.mixer-fader');
        faders.forEach(fader => {
            const valueDisplay = document.getElementById(`${fader.id}-value`);
            const id = fader.id.replace('mixer-', '');
            const originalInput = document.getElementById(`${id}Dissipation`) || document.getElementById(id);
            
            fader.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                if (valueDisplay) {
                    valueDisplay.textContent = formatValue(value, {
                        min: parseFloat(fader.min),
                        max: parseFloat(fader.max),
                        step: parseFloat(fader.step)
                    });
                }
                
                // Sync with original control
                if (originalInput) {
                    originalInput.value = value;
                    originalInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
        });
    }
    
    function formatValue(value, config) {
        const decimals = config.step < 0.01 ? 4 : config.step < 0.1 ? 2 : config.step < 1 ? 1 : 0;
        return value.toFixed(decimals);
    }
    
    function updateQuickPalette() {
        const container = document.getElementById('paletteQuickSelect');
        if (!container) return;
        
        // Get saved colors
        const savedColors = JSON.parse(localStorage.getItem('savedColors') || '[]');
        
        container.innerHTML = savedColors.slice(0, 12).map(color => 
            `<div class="color-swatch" style="background: ${color};" onclick="selectQuickColor('${color}')"></div>`
        ).join('');
    }
    
    function updateLayersList() {
        const container = document.getElementById('layersContent');
        if (!container) return;
        
        // Get layers from existing system
        const layers = document.querySelectorAll('.background-layer');
        
        container.innerHTML = '';
        layers.forEach((layer, index) => {
            const item = document.createElement('div');
            item.className = 'layer-item-compact';
            if (layer.classList.contains('active')) item.classList.add('active');
            
            item.innerHTML = `
                <div class="layer-thumbnail-small" style="background-image: url('${layer.style.backgroundImage}');"></div>
                <div class="layer-info-compact">
                    <div class="layer-name-compact">Layer ${index + 1}</div>
                    <div class="layer-opacity-compact">100%</div>
                </div>
                <div class="layer-visibility-toggle">👁️</div>
            `;
            
            container.appendChild(item);
        });
    }
    
    function syncSettingsWithControls() {
        // Sync settings with existing controls - COMPLETE MAPPING
        const mappings = {
            'settings-visualRes': 'visualResolution',
            'settings-physicsRes': 'physicsResolution',
            'settings-fpsCap': 'fpsCap',
            'settings-cursor': 'cursorToggle',
            'settings-handles': 'showCanvasHandles',
            'settings-stats': 'statsToggle',
            'settings-kaleido': 'kaleidoToggle',
            'settings-kAnimateRot': 'kAnimateRot',
            'settings-light': 'enableLighting',
            'settings-lightShift': 'enableLightShift',
            'settings-turbulence': 'turbulenceMode',
            'settings-sunrays': 'sunraysToggle',
            'settings-randomColor': 'randomColor',
            'settings-stepPalette': 'stepPalette',
            'settings-transparentMode': 'transparentMode',
            'settings-preserveFluidOpacity': 'preserveFluidOpacity',
            'settings-lockCanvasBorders': 'lockCanvasBorders',
            'settings-backgroundColorPicker': 'backgroundColorPicker',
            'settings-kaleidoMode': 'kaleidoMode',
            'settings-ascendRandomness': 'ascendRandomness',
            'settings-hoverCapture': 'hoverCaptureToggle',
            'settings-detachCapture': 'detachCaptureToggle',
            'settings-recMode': 'recMode',
            'settings-multiplayer': 'multiplayerToggle',
            'settings-autoload': 'autoloadSettings'
        };
        
        Object.entries(mappings).forEach(([settingsId, originalId]) => {
            const settingsControl = document.getElementById(settingsId);
            const originalControl = document.getElementById(originalId);
            
            if (settingsControl && originalControl) {
                // Sync initial value
                if (settingsControl.type === 'checkbox') {
                    settingsControl.checked = originalControl.checked;
                } else {
                    settingsControl.value = originalControl.value;
                }
                
                // Bidirectional sync
                settingsControl.addEventListener('change', () => {
                    if (settingsControl.type === 'checkbox') {
                        originalControl.checked = settingsControl.checked;
                    } else {
                        originalControl.value = settingsControl.value;
                    }
                    originalControl.dispatchEvent(new Event('change', { bubbles: true }));
                });
                
                originalControl.addEventListener('change', () => {
                    if (settingsControl.type === 'checkbox') {
                        settingsControl.checked = originalControl.checked;
                    } else {
                        settingsControl.value = originalControl.value;
                    }
                });
            }
        });
        
        // Sunrays toggle: show/hide param sliders + sync sliders
        const sSunrays = document.getElementById('settings-sunrays');
        const sunraysParams = document.querySelector('.settings-sunrays-params');
        if (sSunrays && sunraysParams) {
            sSunrays.addEventListener('change', () => {
                sunraysParams.style.display = sSunrays.checked ? 'flex' : 'none';
            });
        }
        const sSunW = document.getElementById('settings-sunraysWeight');
        const oSunW = document.getElementById('sunraysWeight');
        if (sSunW && oSunW) {
            sSunW.addEventListener('input', () => { oSunW.value = sSunW.value; oSunW.dispatchEvent(new Event('input', {bubbles:true})); });
            oSunW.addEventListener('input', () => { sSunW.value = oSunW.value; });
        }

        // Action buttons
        document.getElementById('settings-pause')?.addEventListener('click', () => {
            if (typeof togglePause === 'function') togglePause();
        });
        
        document.getElementById('settings-clear')?.addEventListener('click', () => {
            if (typeof clearCanvas === 'function') clearCanvas();
        });
        
        document.getElementById('settings-freeze')?.addEventListener('click', () => {
            if (typeof toggleFreeze === 'function') toggleFreeze();
        });
        
        // Animation buttons
        document.getElementById('settings-smash')?.addEventListener('click', () => {
            document.getElementById('smashBtn')?.click();
        });
        
        document.getElementById('settings-jellyfish')?.addEventListener('click', () => {
            document.getElementById('jellyfishBtn')?.click();
        });
        
        document.getElementById('settings-vortex')?.addEventListener('click', () => {
            document.getElementById('vortexBtn')?.click();
        });
        
        document.getElementById('settings-portal')?.addEventListener('click', () => {
            document.getElementById('portalBtn')?.click();
        });
        
        document.getElementById('settings-portrait')?.addEventListener('click', () => {
            if (typeof playPortraitAnimation === 'function') playPortraitAnimation();
        });
        
        document.getElementById('settings-ascend')?.addEventListener('click', () => {
            document.getElementById('ascendToggle')?.click();
        });
        
        // Layer buttons
        document.getElementById('settings-captureLayer')?.addEventListener('click', () => {
            document.getElementById('captureBtn')?.click();
        });
        
        document.getElementById('settings-uploadImage')?.addEventListener('click', () => {
            document.getElementById('imageUpload')?.click();
        });
        
        // Multiplayer
        document.getElementById('settings-copyRoom')?.addEventListener('click', () => {
            if (typeof copyRoomUrl === 'function') copyRoomUrl();
        });
        
        // Settings management
        document.getElementById('settings-save')?.addEventListener('click', () => {
            document.getElementById('saveSettingsBtn')?.click();
        });
        
        document.getElementById('settings-load')?.addEventListener('click', () => {
            document.getElementById('loadSettingsBtn')?.click();
        });
        
        document.getElementById('settings-clearAll')?.addEventListener('click', () => {
            document.getElementById('clearSettingsBtn')?.click();
        });

        // ── User Presets in Layout Manager ──

        function showLayoutPresetStatus(msg, color) {
            const el = document.getElementById('layoutPresetStatus');
            if (!el) return;
            el.textContent = msg;
            el.style.color = color || '#3fb950';
            el.style.display = 'block';
            clearTimeout(el._timer);
            el._timer = setTimeout(() => { el.style.display = 'none'; el.textContent = ''; }, 2000);
        }

        function captureSnapshot() {
            if (typeof window.capturePresetSnapshot === 'function') return window.capturePresetSnapshot();
            // Fallback: expose wasn't ready yet
            return null;
        }

        function renderLayoutUserPresets() {
            const list = document.getElementById('layoutUserPresetsList');
            if (!list || !window.Settings) return;
            const presets = window.Settings.getAllPresets();
            const names = Object.keys(presets).sort((a, b) => {
                return ((presets[b] && presets[b].timestamp) || 0) - ((presets[a] && presets[a].timestamp) || 0);
            });
            list.innerHTML = '';
            if (names.length === 0) {
                list.innerHTML = '<div style="text-align:center; opacity:0.4; font-size:10px; padding:8px 0;">No saved presets yet</div>';
                return;
            }
            names.forEach(name => {
                const row = document.createElement('div');
                row.className = 'user-preset-row';

                const btn = document.createElement('button');
                btn.className = 'user-preset-btn';
                btn.textContent = name;
                btn.title = 'Load "' + name + '"';
                btn.addEventListener('click', () => {
                    const snapshot = presets[name];
                    if (snapshot && typeof window.applyPresetSnapshot === 'function') {
                        window.applyPresetSnapshot(snapshot);
                    }
                    list.querySelectorAll('.user-preset-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    showLayoutPresetStatus('Loaded: ' + name, '#3fb950');
                });

                const overwriteBtn = document.createElement('button');
                overwriteBtn.className = 'user-preset-overwrite';
                overwriteBtn.textContent = '\u21BB';
                overwriteBtn.title = 'Overwrite with current settings';
                overwriteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const snapshot = captureSnapshot();
                    if (snapshot) {
                        if (typeof window.saveUserPreset === 'function') {
                            window.saveUserPreset(name, snapshot);
                        } else {
                            window.Settings.savePreset(name, snapshot);
                        }
                        if (typeof window.refreshAllPresetLists === 'function') window.refreshAllPresetLists();
                        showLayoutPresetStatus('Updated: ' + name, '#64b5f6');
                    }
                });

                const delBtn = document.createElement('button');
                delBtn.className = 'user-preset-delete';
                delBtn.textContent = '\u00D7';
                delBtn.title = 'Delete "' + name + '"';
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.Settings.deletePreset(name);
                    if (typeof window.refreshAllPresetLists === 'function') window.refreshAllPresetLists();
                    showLayoutPresetStatus('Deleted: ' + name, '#ff6b6b');
                });

                row.appendChild(btn);
                row.appendChild(overwriteBtn);
                row.appendChild(delBtn);
                list.appendChild(row);
            });
        }

        // Save-as flow
        const layoutSaveBtn = document.getElementById('layoutSaveAsPresetBtn');
        const layoutNameRow = document.getElementById('layoutPresetNameRow');
        const layoutSaveRow = document.getElementById('layoutPresetSaveRow');
        const layoutNameInput = document.getElementById('layoutPresetNameInput');
        const layoutConfirmBtn = document.getElementById('layoutPresetConfirmBtn');
        const layoutCancelBtn = document.getElementById('layoutPresetCancelBtn');

        if (layoutSaveBtn) {
            layoutSaveBtn.addEventListener('click', () => {
                if (layoutSaveRow) layoutSaveRow.style.display = 'none';
                if (layoutNameRow) layoutNameRow.style.display = 'flex';
                if (layoutNameInput) { layoutNameInput.value = ''; layoutNameInput.focus(); }
            });
        }

        if (layoutCancelBtn) {
            layoutCancelBtn.addEventListener('click', () => {
                if (layoutNameRow) layoutNameRow.style.display = 'none';
                if (layoutSaveRow) layoutSaveRow.style.display = 'flex';
                if (layoutNameInput) layoutNameInput.value = '';
            });
        }

        function doLayoutSavePreset() {
            const name = (layoutNameInput ? layoutNameInput.value : '').trim();
            if (!name) {
                showLayoutPresetStatus('Name is required', '#ff6b6b');
                return;
            }
            const existing = window.Settings.getAllPresets();
            if (existing[name]) {
                showLayoutPresetStatus('Name already exists \u2014 use \u21BB to overwrite', '#ff6b6b');
                return;
            }
            const snapshot = captureSnapshot();
            if (!snapshot) {
                showLayoutPresetStatus('Could not capture settings', '#ff6b6b');
                return;
            }
            if (typeof window.saveUserPreset === 'function') {
                window.saveUserPreset(name, snapshot);
            } else {
                window.Settings.savePreset(name, snapshot);
            }
            if (typeof window.refreshAllPresetLists === 'function') window.refreshAllPresetLists();
            showLayoutPresetStatus('Saved: ' + name, '#3fb950');
            if (layoutNameRow) layoutNameRow.style.display = 'none';
            if (layoutSaveRow) layoutSaveRow.style.display = 'flex';
            if (layoutNameInput) layoutNameInput.value = '';
        }

        if (layoutConfirmBtn) layoutConfirmBtn.addEventListener('click', doLayoutSavePreset);
        if (layoutNameInput) {
            layoutNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); doLayoutSavePreset(); }
                if (e.key === 'Escape') { e.preventDefault(); if (layoutCancelBtn) layoutCancelBtn.click(); }
            });
        }

        // Initial render + re-render when panel opens (debounced)
        renderLayoutUserPresets();
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsPanel) {
            var pendingRender = 0;
            const observer = new MutationObserver(() => {
                var isOpen = settingsPanel.classList.contains('open') || settingsPanel.classList.contains('visible');
                if (!isOpen) return; // skip renders when panel is closing
                if (pendingRender) cancelAnimationFrame(pendingRender);
                pendingRender = requestAnimationFrame(() => {
                    pendingRender = 0;
                    renderLayoutUserPresets();
                });
            });
            observer.observe(settingsPanel, { attributes: true, attributeFilter: ['class'] });
        }
    }
    
    // Expose functions globally
    window.selectQuickColor = function(color) {
        const colorPicker = document.getElementById('colorPicker');
        if (colorPicker) {
            colorPicker.value = color;
            colorPicker.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        const primarySwatch = document.getElementById('primaryColor');
        if (primarySwatch) {
            primarySwatch.style.background = color;
        }
    };
    
    window.updateQuickPalette = updateQuickPalette;
    window.updateLayersList = updateLayersList;
    
})();
