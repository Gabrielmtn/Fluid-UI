/**
 * Component System Initialization
 * Systematically migrates all controls to the component system
 */

(function() {
    'use strict';
    
    // Wait for DOM and dependencies
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    function init() {
        // Component system is disabled for now - it duplicates existing controls
        // and causes errors when component classes aren't fully loaded
        const COMPONENT_SYSTEM_ENABLED = false;
        
        if (!COMPONENT_SYSTEM_ENABLED) {
            console.log('🧩 Component System disabled (set COMPONENT_SYSTEM_ENABLED = true to enable)');
            return;
        }
        
        // Guard: Check if ComponentRegistry is available and is an instance
        if (!window.ComponentRegistry || typeof window.ComponentRegistry.register !== 'function') {
            console.warn('⚠️ ComponentRegistry not ready, skipping component initialization');
            return;
        }
        
        console.log('🧩 Initializing Component System...');
        
        // Register all component types
        registerComponents();
        
        // Create components in order
        createComponents();
        
        console.log('✅ Component System initialized');
    }
    
    /**
     * Register all component classes
     */
    function registerComponents() {
        // Safety check - ComponentRegistry must be an instance with register method
        const registry = window.ComponentRegistry;
        if (!registry || typeof registry.register !== 'function') {
            console.warn('⚠️ ComponentRegistry not available or missing register method');
            return;
        }
        
        console.log('📝 Registering components...');
        
        // Helper to safely register if class exists
        function safeRegister(name, ComponentClass, metadata) {
            if (typeof ComponentClass === 'function') {
                registry.register(name, ComponentClass, metadata);
            } else {
                console.warn(`⚠️ Component class ${name} not found, skipping`);
            }
        }
        
        // Base controls
        safeRegister('slider', typeof SliderControl !== 'undefined' ? SliderControl : null, {
            description: 'Generic slider with label and value display',
            category: 'controls',
            version: '1.0.0'
        });
        
        safeRegister('checkbox', typeof CheckboxControl !== 'undefined' ? CheckboxControl : null, {
            description: 'Generic checkbox/toggle control',
            category: 'controls',
            version: '1.0.0'
        });
        
        safeRegister('select', typeof SelectControl !== 'undefined' ? SelectControl : null, {
            description: 'Generic dropdown/select control',
            category: 'controls',
            version: '1.0.0'
        });
        
        // Component groups
        safeRegister('colorGroup', typeof ColorGroup !== 'undefined' ? ColorGroup : null, {
            description: 'Complete color control group',
            category: 'groups',
            version: '1.0.0'
        });
        
        safeRegister('qualityGroup', typeof QualityGroup !== 'undefined' ? QualityGroup : null, {
            description: 'Quality and performance settings',
            category: 'groups',
            version: '1.0.0'
        });
        
        safeRegister('simulationGroup', typeof SimulationGroup !== 'undefined' ? SimulationGroup : null, {
            description: 'Fluid simulation parameters',
            category: 'groups',
            version: '1.0.0'
        });
        
        safeRegister('kaleidoscopeGroup', typeof KaleidoscopeGroup !== 'undefined' ? KaleidoscopeGroup : null, {
            description: 'Kaleidoscope effect controls',
            category: 'groups',
            version: '1.0.0'
        });
        
        safeRegister('canvasDisplayGroup', typeof CanvasDisplayGroup !== 'undefined' ? CanvasDisplayGroup : null, {
            description: 'Canvas and display settings',
            category: 'groups',
            version: '1.0.0'
        });
        
        safeRegister('button', typeof ButtonControl !== 'undefined' ? ButtonControl : null, {
            description: 'Generic button control',
            category: 'controls',
            version: '1.0.0'
        });
        
        safeRegister('actionsGroup', typeof ActionsGroup !== 'undefined' ? ActionsGroup : null, {
            description: 'Action buttons (Pause, Clear, Freeze)',
            category: 'groups',
            version: '1.0.0'
        });
        
        safeRegister('animationsGroup', typeof AnimationsGroup !== 'undefined' ? AnimationsGroup : null, {
            description: 'Animation effect buttons',
            category: 'groups',
            version: '1.0.0'
        });
        
        safeRegister('effectsGroup', typeof EffectsGroup !== 'undefined' ? EffectsGroup : null, {
            description: 'Effect toggles (Light Source, Light Shift)',
            category: 'groups',
            version: '1.0.0'
        });
        
        safeRegister('layersGroup', typeof LayersGroup !== 'undefined' ? LayersGroup : null, {
            description: 'Layer management controls',
            category: 'groups',
            version: '1.0.0'
        });
        
        safeRegister('settingsManagementGroup', typeof SettingsManagementGroup !== 'undefined' ? SettingsManagementGroup : null, {
            description: 'Settings management and presets',
            category: 'groups',
            version: '1.0.0'
        });
        
        console.log('✓ Registered', registry.listComponents().length, 'component types');
    }
    
    /**
     * Create all component instances
     */
    function createComponents() {
        console.log('🔨 Creating component instances...');
        
        const container = document.querySelector('.controls');
        if (!container) {
            console.error('Controls container not found');
            return;
        }
        
        // Find insertion point (after mobile menu close button)
        const mobileClose = container.querySelector('#mobileMenuClose');
        const insertPoint = mobileClose ? mobileClose.nextElementSibling : container.firstChild;
        
        // Create temporary container for components
        const componentContainer = document.createElement('div');
        componentContainer.id = 'component-controls';
        componentContainer.style.cssText = 'border: 2px solid #f6b018; border-radius: 8px; padding: 10px; margin-bottom: 15px;';
        
        // Add header
        const header = document.createElement('div');
        header.style.cssText = 'color: #f6b018; font-weight: bold; margin-bottom: 10px; text-align: center;';
        header.textContent = '🧩 Component System (Testing)';
        componentContainer.appendChild(header);
        
        // Insert at the top
        if (insertPoint) {
            container.insertBefore(componentContainer, insertPoint);
        } else {
            container.appendChild(componentContainer);
        }
        
        // 1. Brush Size Slider
        createBrushSize(componentContainer);
        
        // 2. Color Group
        createColorGroup(componentContainer);
        
        // 3. Quality Settings
        createQualityGroup(componentContainer);
        
        // 4. Simulation Parameters
        createSimulationGroup(componentContainer);
        
        // 5. Kaleidoscope Controls
        createKaleidoscopeGroup(componentContainer);
        
        // 6. Canvas & Display Settings
        createCanvasDisplayGroup(componentContainer);
        
        // 7. Action Buttons
        createActionsGroup(componentContainer);
        
        // 8. Animation Buttons
        createAnimationsGroup(componentContainer);
        
        // 9. Effects
        createEffectsGroup(componentContainer);
        
        // 10. Layers
        createLayersGroup(componentContainer);
        
        // 11. Settings Management & Presets
        createSettingsManagementGroup(componentContainer);
        
        console.log('✓ Created', ComponentRegistry.getAll().length, 'component instances');
        console.log('🎉 ALL CONTROLS MIGRATED!');
    }
    
    /**
     * Create brush size slider component
     */
    function createBrushSize(container) {
        const brushSize = ComponentRegistry.create('slider', {
            id: 'brushSizeComponent',
            label: 'Brush Size',
            min: 0.1,
            max: 30,
            value: 11,
            step: 0.1,
            group: 'basic'
        });
        
        brushSize.mount(container);
        
        // Sync with original control
        brushSize.syncWith('brushSize');
        
        // Listen to changes
        brushSize.on('change', (value) => {
            console.log('Brush size changed:', value);
        });
    }
    
    /**
     * Create color group component
     */
    function createColorGroup(container) {
        const colorGroup = ComponentRegistry.create('colorGroup', {
            id: 'colorGroupComponent',
            currentColor: '#ff0000',
            randomEnabled: true,
            stepPalette: false,
            group: 'color'
        });
        
        colorGroup.mount(container);
        
        // Sync with original color picker
        colorGroup.syncWith('colorPicker');
        
        // Sync random colors checkbox
        const randomCheckbox = document.getElementById('randomColor');
        if (randomCheckbox) {
            colorGroup.on('randomToggle', (enabled) => {
                randomCheckbox.checked = enabled;
                randomCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
            });
            
            randomCheckbox.addEventListener('change', () => {
                colorGroup.setRandomEnabled(randomCheckbox.checked);
            });
        }
        
        // Sync step palette checkbox
        const stepCheckbox = document.getElementById('stepPalette');
        if (stepCheckbox) {
            colorGroup.on('stepPaletteToggle', (enabled) => {
                stepCheckbox.checked = enabled;
                stepCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
            });
            
            stepCheckbox.addEventListener('change', () => {
                colorGroup.setStepPalette(stepCheckbox.checked);
            });
        }
        
        // Listen to color changes
        colorGroup.on('colorChange', (color) => {
            console.log('Color changed:', color);
        });
        
        colorGroup.on('colorSaved', (color) => {
            console.log('Color saved:', color);
        });
        
        colorGroup.on('colorsCleared', () => {
            console.log('Colors cleared');
        });
    }
    
    /**
     * Create quality group component
     */
    function createQualityGroup(container) {
        const qualityGroup = ComponentRegistry.create('qualityGroup', {
            id: 'qualityGroupComponent',
            visualQuality: 'high',
            physicsQuality: 'high',
            fpsCap: '60',
            group: 'quality'
        });
        
        qualityGroup.mount(container);
        
        // Sync with original controls
        const visualRes = document.getElementById('visualResolution');
        const physicsRes = document.getElementById('physicsResolution');
        const fpsCap = document.getElementById('fpsCap');
        
        if (visualRes) {
            qualityGroup.on('visualQualityChange', (quality) => {
                visualRes.value = quality;
                visualRes.dispatchEvent(new Event('change', { bubbles: true }));
            });
            
            visualRes.addEventListener('change', () => {
                qualityGroup.setVisualQuality(visualRes.value);
            });
        }
        
        if (physicsRes) {
            qualityGroup.on('physicsQualityChange', (quality) => {
                physicsRes.value = quality;
                physicsRes.dispatchEvent(new Event('change', { bubbles: true }));
            });
            
            physicsRes.addEventListener('change', () => {
                qualityGroup.setPhysicsQuality(physicsRes.value);
            });
        }
        
        if (fpsCap) {
            qualityGroup.on('fpsCapChange', (fps) => {
                fpsCap.value = fps;
                fpsCap.dispatchEvent(new Event('change', { bubbles: true }));
            });
            
            fpsCap.addEventListener('change', () => {
                qualityGroup.setFpsCap(fpsCap.value);
            });
        }
    }
    
    /**
     * Create simulation group component
     */
    function createSimulationGroup(container) {
        const simulationGroup = ComponentRegistry.create('simulationGroup', {
            id: 'simulationGroupComponent',
            group: 'simulation'
        });
        
        simulationGroup.mount(container);
        
        // Sync with original controls
        const syncMap = {
            densityDissipation: 'densityDissipation',
            velocityDissipation: 'velocityDissipation',
            pressureDissipation: 'pressureDissipation',
            pressureIteration: 'pressureIteration',
            velocityInfluence: 'velocityInfluence',
            curl: 'curl',
            sharpness: 'sharpness',
            multiplier: 'multiplier'
        };
        
        Object.entries(syncMap).forEach(([param, originalId]) => {
            const originalControl = document.getElementById(originalId);
            if (!originalControl) return;
            
            // Component → Original
            simulationGroup.on(`${param}Change`, (value) => {
                originalControl.value = value;
                originalControl.dispatchEvent(new Event('input', { bubbles: true }));
            });
            
            // Original → Component
            originalControl.addEventListener('input', () => {
                simulationGroup.setParameter(param, parseFloat(originalControl.value));
            });
        });
        
        // Sync turbulence toggle
        const turbulence = document.getElementById('turbulenceMode');
        if (turbulence) {
            simulationGroup.on('turbulenceChange', (enabled) => {
                turbulence.checked = enabled;
                turbulence.dispatchEvent(new Event('change', { bubbles: true }));
            });
            
            turbulence.addEventListener('change', () => {
                const checkbox = simulationGroup.find(`#${simulationGroup.id}-turbulence`);
                if (checkbox) checkbox.checked = turbulence.checked;
            });
        }
    }
    
    /**
     * Create kaleidoscope group component
     */
    function createKaleidoscopeGroup(container) {
        const kaleidoGroup = ComponentRegistry.create('kaleidoscopeGroup', {
            id: 'kaleidoscopeGroupComponent',
            group: 'kaleidoscope'
        });
        
        kaleidoGroup.mount(container);
        
        // Sync with original controls
        const syncMap = {
            enabled: 'kaleidoToggle',
            segments: 'kaleidoSegments',
            mode: 'kaleidoMode',
            angle: 'kAngle',
            animateRotation: 'kAnimateRot',
            spinSpeed: 'kSpinSpeed',
            twist: 'kTwist',
            zoom: 'kZoom',
            blend: 'kBlend'
        };
        
        Object.entries(syncMap).forEach(([param, originalId]) => {
            const originalControl = document.getElementById(originalId);
            if (!originalControl) return;
            
            // Component → Original
            kaleidoGroup.on(`${param}Change`, (value) => {
                if (originalControl.type === 'checkbox') {
                    originalControl.checked = value;
                } else {
                    originalControl.value = value;
                }
                originalControl.dispatchEvent(new Event(originalControl.type === 'checkbox' ? 'change' : 'input', { bubbles: true }));
            });
            
            // Original → Component
            const eventType = originalControl.type === 'checkbox' ? 'change' : 'input';
            originalControl.addEventListener(eventType, () => {
                const value = originalControl.type === 'checkbox' ? originalControl.checked : 
                             (originalControl.type === 'range' || originalControl.type === 'number') ? parseFloat(originalControl.value) :
                             originalControl.value;
                kaleidoGroup.setParameter(param, value);
            });
        });
    }
    
    /**
     * Create canvas & display group component
     */
    function createCanvasDisplayGroup(container) {
        const canvasDisplayGroup = ComponentRegistry.create('canvasDisplayGroup', {
            id: 'canvasDisplayGroupComponent',
            group: 'canvasDisplay'
        });
        
        canvasDisplayGroup.mount(container);
        
        // Sync with original controls
        const syncMap = {
            backgroundColor: 'backgroundColorPicker',
            transparentMode: 'transparentMode',
            canvasOpacity: 'canvasOpacity',
            preserveFluidOpacity: 'preserveFluidOpacity',
            captureDimming: 'captureDimming',
            showCursor: 'cursorToggle',
            showCanvasHandles: 'showCanvasHandles',
            statsToggle: 'statsToggle',
            lockCanvasBorders: 'lockCanvasBorders'
        };
        
        Object.entries(syncMap).forEach(([param, originalId]) => {
            const originalControl = document.getElementById(originalId);
            if (!originalControl) return;
            
            // Component → Original
            canvasDisplayGroup.on(`${param}Change`, (value) => {
                if (originalControl.type === 'checkbox') {
                    originalControl.checked = value;
                } else if (originalControl.type === 'color') {
                    originalControl.value = value;
                } else {
                    originalControl.value = value;
                }
                originalControl.dispatchEvent(new Event(originalControl.type === 'checkbox' ? 'change' : 'input', { bubbles: true }));
            });
            
            // Original → Component
            const eventType = originalControl.type === 'checkbox' ? 'change' : 'input';
            originalControl.addEventListener(eventType, () => {
                const value = originalControl.type === 'checkbox' ? originalControl.checked : 
                             originalControl.type === 'color' ? originalControl.value :
                             (originalControl.type === 'range' || originalControl.type === 'number') ? parseFloat(originalControl.value) :
                             originalControl.value;
                canvasDisplayGroup.setParameter(param, value);
            });
        });
    }
    
    /**
     * Create actions group component
     */
    function createActionsGroup(container) {
        const actionsGroup = ComponentRegistry.create('actionsGroup', {
            id: 'actionsGroupComponent',
            group: 'actions'
        });
        
        actionsGroup.mount(container);
        
        // Connect to global functions
        actionsGroup.on('pause', (paused) => {
            if (typeof togglePause === 'function') {
                // Don't call if already in correct state
                const pauseBtn = document.getElementById('pauseBtn');
                if (pauseBtn) {
                    const currentlyPaused = pauseBtn.textContent.includes('Resume');
                    if (currentlyPaused !== paused) {
                        togglePause();
                    }
                }
            }
        });
        
        actionsGroup.on('clear', () => {
            if (typeof clearCanvas === 'function') {
                clearCanvas();
            }
        });
        
        actionsGroup.on('freeze', (frozen) => {
            if (typeof toggleFreeze === 'function') {
                // Don't call if already in correct state
                const freezeBtn = document.getElementById('freezeBtn');
                if (freezeBtn) {
                    const currentlyFrozen = freezeBtn.textContent.includes('Unfreeze');
                    if (currentlyFrozen !== frozen) {
                        toggleFreeze();
                    }
                }
            }
        });
    }
    
    /**
     * Create animations group component
     */
    function createAnimationsGroup(container) {
        const animationsGroup = ComponentRegistry.create('animationsGroup', {
            id: 'animationsGroupComponent',
            group: 'animations'
        });
        
        animationsGroup.mount(container);
        
        // Connect to animation functions
        animationsGroup.on('smash', () => {
            document.getElementById('smashBtn')?.click();
        });
        
        animationsGroup.on('jellyfish', () => {
            document.getElementById('jellyfishBtn')?.click();
        });
        
        animationsGroup.on('vortex', () => {
            document.getElementById('vortexBtn')?.click();
        });
        
        animationsGroup.on('portal', () => {
            document.getElementById('portalBtn')?.click();
        });
        
        animationsGroup.on('portrait', () => {
            if (typeof playPortraitAnimation === 'function') {
                playPortraitAnimation();
            }
        });
        
        // Ascend toggle sync (now a checkbox)
        animationsGroup.on('ascend', (enabled) => {
            if (typeof window.toggleAscend === 'function') {
                window.toggleAscend(enabled);
            }
        });
        
        // Sync ascend randomness
        const ascendRandomness = document.getElementById('ascendRandomness');
        if (ascendRandomness) {
            animationsGroup.on('ascendRandomnessChange', (enabled) => {
                ascendRandomness.checked = enabled;
                ascendRandomness.dispatchEvent(new Event('change', { bubbles: true }));
            });
            
            ascendRandomness.addEventListener('change', () => {
                const checkbox = animationsGroup.find(`#${animationsGroup.id}-ascendRandomness`);
                if (checkbox) checkbox.checked = ascendRandomness.checked;
            });
        }
        
        // Shooting Star toggle sync
        animationsGroup.on('shootingStar', (enabled) => {
            if (typeof window.toggleShootingStar === 'function') {
                window.toggleShootingStar(enabled);
            }
        });
    }
    
    /**
     * Create effects group component
     */
    function createEffectsGroup(container) {
        const effectsGroup = ComponentRegistry.create('effectsGroup', {
            id: 'effectsGroupComponent',
            group: 'effects'
        });
        
        effectsGroup.mount(container);
        
        // Sync with original controls
        const lightSource = document.getElementById('enableLighting');
        const lightShift = document.getElementById('enableLightShift');
        
        if (lightSource) {
            effectsGroup.on('lightSourceChange', (enabled) => {
                lightSource.checked = enabled;
                lightSource.dispatchEvent(new Event('change', { bubbles: true }));
            });
            
            lightSource.addEventListener('change', () => {
                effectsGroup.setLightSource(lightSource.checked);
            });
        }
        
        if (lightShift) {
            effectsGroup.on('lightShiftChange', (enabled) => {
                lightShift.checked = enabled;
                lightShift.dispatchEvent(new Event('change', { bubbles: true }));
            });
            
            lightShift.addEventListener('change', () => {
                effectsGroup.setLightShift(lightShift.checked);
            });
        }
    }
    
    /**
     * Create layers group component
     */
    function createLayersGroup(container) {
        const layersGroup = ComponentRegistry.create('layersGroup', {
            id: 'layersGroupComponent',
            group: 'layers'
        });
        
        layersGroup.mount(container);
        
        // Connect to layer functions
        layersGroup.on('capture', () => {
            document.getElementById('captureBtn')?.click();
        });
        
        layersGroup.on('upload', () => {
            document.getElementById('imageUpload')?.click();
        });
        
        // Sync toggles
        const hoverCapture = document.getElementById('hoverCaptureToggle');
        const detachCapture = document.getElementById('detachCaptureToggle');
        
        if (hoverCapture) {
            layersGroup.on('hoverCaptureChange', (enabled) => {
                hoverCapture.checked = enabled;
                hoverCapture.dispatchEvent(new Event('change', { bubbles: true }));
            });
            
            hoverCapture.addEventListener('change', () => {
                const checkbox = layersGroup.find(`#${layersGroup.id}-hoverCapture`);
                if (checkbox) checkbox.checked = hoverCapture.checked;
            });
        }
        
        if (detachCapture) {
            layersGroup.on('detachCaptureChange', (enabled) => {
                detachCapture.checked = enabled;
                detachCapture.dispatchEvent(new Event('change', { bubbles: true }));
            });
            
            detachCapture.addEventListener('change', () => {
                const checkbox = layersGroup.find(`#${layersGroup.id}-detachCapture`);
                if (checkbox) checkbox.checked = detachCapture.checked;
            });
        }
    }
    
    /**
     * Create settings management group component
     */
    function createSettingsManagementGroup(container) {
        const settingsMgmtGroup = ComponentRegistry.create('settingsManagementGroup', {
            id: 'settingsManagementGroupComponent',
            group: 'settingsManagement'
        });
        
        settingsMgmtGroup.mount(container);
        
        // Sync recording mode
        const recMode = document.getElementById('recMode');
        if (recMode) {
            settingsMgmtGroup.on('recModeChange', (mode) => {
                recMode.value = mode;
                recMode.dispatchEvent(new Event('change', { bubbles: true }));
            });
            
            recMode.addEventListener('change', () => {
                const select = settingsMgmtGroup.find(`#${settingsMgmtGroup.id}-recMode`);
                if (select) select.value = recMode.value;
            });
        }
        
        settingsMgmtGroup.on('saveSettings', () => {
            document.getElementById('saveSettingsBtn')?.click();
        });
        
        settingsMgmtGroup.on('loadSettings', () => {
            document.getElementById('loadSettingsBtn')?.click();
        });
        
        settingsMgmtGroup.on('clearSettings', () => {
            document.getElementById('clearSettingsBtn')?.click();
        });
        
        // Sync autoload
        const autoload = document.getElementById('autoloadSettings');
        if (autoload) {
            settingsMgmtGroup.on('autoloadChange', (enabled) => {
                autoload.checked = enabled;
                autoload.dispatchEvent(new Event('change', { bubbles: true }));
            });
            
            autoload.addEventListener('change', () => {
                const checkbox = settingsMgmtGroup.find(`#${settingsMgmtGroup.id}-autoload`);
                if (checkbox) checkbox.checked = autoload.checked;
            });
        }
        
        // Connect presets
        settingsMgmtGroup.on('applyPreset', (preset) => {
            if (typeof applyPreset === 'function') {
                applyPreset(preset);
            }
        });
    }
    
    // Expose for debugging
    window.ComponentSystem = {
        registry: ComponentRegistry,
        debug: () => ComponentRegistry.debug()
    };
    
})();
