# UI Modularization Strategy

## Goals

1. **Separation of Concerns**: Separate UI rendering from business logic
2. **Reusability**: Components can be used in different layouts
3. **Maintainability**: Each component is self-contained and testable
4. **Flexibility**: Easy to reorganize, restyle, or replace components
5. **Progressive Enhancement**: Migrate gradually without breaking existing functionality

---

## Architecture

### Component Structure

```
components/
├── base/
│   ├── UIComponent.js          # Base class for all components
│   ├── ComponentRegistry.js    # Component registration and discovery
│   └── ComponentLoader.js      # Dynamic component loading
├── controls/
│   ├── SliderControl.js        # Generic slider with label and value display
│   ├── CheckboxControl.js      # Generic checkbox/toggle
│   ├── ColorPickerControl.js   # Color picker with swatches
│   ├── SelectControl.js        # Dropdown select
│   └── ButtonControl.js        # Action button
├── groups/
│   ├── ColorGroup.js           # Color picker, palette, saved colors
│   ├── SimulationGroup.js      # Density, velocity, pressure, etc.
│   ├── KaleidoscopeGroup.js    # All kaleidoscope controls
│   ├── QualityGroup.js         # Visual/physics quality, FPS
│   ├── EffectsGroup.js         # Light source, turbulence, etc.
│   ├── CanvasGroup.js          # Canvas settings and appearance
│   ├── AnimationsGroup.js      # Smash, jellyfish, vortex, etc.
│   └── LayersGroup.js          # Layer management
└── layouts/
    ├── SidebarLayout.js        # Original sidebar layout
    ├── MixerLayout.js          # Mixer-style layout (future)
    └── CompactLayout.js        # Mobile-optimized layout
```

---

## Component API Design

### Base Component Class

```javascript
class UIComponent {
    constructor(config) {
        this.id = config.id;
        this.label = config.label;
        this.container = null;
        this.state = config.initialState || {};
        this.listeners = {};
    }
    
    // Lifecycle methods
    init() { /* Override */ }
    render() { /* Override - returns HTML string or element */ }
    mount(parentElement) { /* Attach to DOM */ }
    unmount() { /* Remove from DOM and cleanup */ }
    destroy() { /* Complete cleanup */ }
    
    // State management
    setState(newState) { /* Update state and re-render */ }
    getState() { /* Return current state */ }
    
    // Event handling
    on(event, callback) { /* Register event listener */ }
    emit(event, data) { /* Trigger event */ }
    
    // Sync with external controls
    syncWith(elementId) { /* Bidirectional sync */ }
    
    // Persistence
    save() { /* Save state to settings */ }
    load() { /* Load state from settings */ }
}
```

### Example: SliderControl Component

```javascript
class SliderControl extends UIComponent {
    constructor(config) {
        super(config);
        this.min = config.min;
        this.max = config.max;
        this.step = config.step;
        this.value = config.value;
        this.unit = config.unit || '';
        this.formatValue = config.formatValue || ((v) => v);
    }
    
    render() {
        return `
            <div class="control-group" data-component="${this.id}">
                <label for="${this.id}">
                    ${this.label}
                    <span class="value-display">${this.formatValue(this.value)}${this.unit}</span>
                </label>
                <input type="range" 
                       id="${this.id}" 
                       min="${this.min}" 
                       max="${this.max}" 
                       step="${this.step}" 
                       value="${this.value}">
            </div>
        `;
    }
    
    init() {
        const input = this.container.querySelector('input');
        const display = this.container.querySelector('.value-display');
        
        input.addEventListener('input', (e) => {
            this.value = parseFloat(e.target.value);
            display.textContent = this.formatValue(this.value) + this.unit;
            this.emit('change', this.value);
        });
    }
}
```

### Example: ColorGroup Component

```javascript
class ColorGroup extends UIComponent {
    constructor(config) {
        super(config);
        this.savedColors = config.savedColors || [];
        this.currentColor = config.currentColor || '#ff0000';
    }
    
    render() {
        return `
            <div class="control-group" data-component="${this.id}">
                <label for="colorPicker">Fluid Color</label>
                <input type="color" id="colorPicker" value="${this.currentColor}">
                
                <div class="color-actions">
                    <button data-action="save">Save Color</button>
                    <button data-action="clear">Clear All</button>
                </div>
                
                <div class="saved-colors">
                    ${this.renderSavedColors()}
                </div>
                
                <div class="control-group checkbox-group">
                    <input type="checkbox" id="randomColor" checked>
                    <label for="randomColor">Random Colors</label>
                </div>
            </div>
        `;
    }
    
    renderSavedColors() {
        return this.savedColors.map(color => 
            `<div class="color-swatch" style="background: ${color};" data-color="${color}"></div>`
        ).join('');
    }
    
    init() {
        // Event listeners for color picker, save, clear, swatches
        this.container.querySelector('[data-action="save"]').addEventListener('click', () => {
            this.saveColor(this.currentColor);
        });
        
        // ... more initialization
    }
    
    saveColor(color) {
        if (!this.savedColors.includes(color)) {
            this.savedColors.push(color);
            this.save();
            this.emit('colorSaved', color);
        }
    }
}
```

---

## Component Groups

### 1. Color Controls
**Components**: ColorPicker, PaletteCarousel, SavedColors, RandomToggle  
**State**: currentColor, savedColors, randomEnabled, currentPalette  
**Events**: colorChange, colorSaved, paletteChange  
**Syncs**: colorPicker, randomColor, stepPalette

### 2. Simulation Parameters
**Components**: DensitySlider, VelocitySlider, PressureSlider, IterationSlider, CurlSlider, ViscositySlider  
**State**: density, velocity, pressure, iterations, curl, viscosity  
**Events**: parameterChange  
**Syncs**: densityDissipation, velocityDissipation, pressureDissipation, etc.

### 3. Kaleidoscope Controls
**Components**: KaleidoToggle, SegmentsSlider, ModeSelect, AngleSlider, SpinSlider, TwistSlider, ZoomSlider, BlendSlider  
**State**: enabled, segments, mode, angle, spinSpeed, twist, zoom, blend, animateRotation  
**Events**: kaleidoChange, modeChange  
**Syncs**: kaleidoToggle, kaleidoSegments, kaleidoMode, etc.

### 4. Quality Settings
**Components**: VisualQualitySelect, PhysicsQualitySelect, FPSCapSelect  
**State**: visualRes, physicsRes, fpsCap  
**Events**: qualityChange  
**Syncs**: visualResolution, physicsResolution, fpsCap

### 5. Effects
**Components**: TurbulenceToggle, LightSourceToggle, LightShiftToggle  
**State**: turbulence, lightSource, lightShift  
**Events**: effectToggle  
**Syncs**: turbulenceMode, enableLighting, enableLightShift

### 6. Canvas Settings
**Components**: BackgroundColorPicker, TransparentToggle, OpacitySlider, DimmingSlider, BorderToggle  
**State**: bgColor, transparent, opacity, dimming, lockBorders  
**Events**: canvasChange  
**Syncs**: backgroundColorPicker, transparentMode, canvasOpacity, etc.

### 7. Animations
**Components**: SmashButton, JellyfishButton, VortexButton, PortalButton, PortraitButton, AscendButton  
**State**: ascendRandomness  
**Events**: animationTrigger  
**Syncs**: Animation button clicks

### 8. Layers
**Components**: LayerList, CaptureButton, UploadButton, HoverToggle, DetachToggle  
**State**: layers, activeLayer, hoverCapture, detachCapture  
**Events**: layerChange, layerCapture  
**Syncs**: Layer management system

---

## Migration Strategy

### Phase 1: Foundation (Week 1)
1. Create base `UIComponent` class
2. Create `ComponentRegistry` for registration
3. Create `ComponentLoader` for dynamic loading
4. Set up component directory structure
5. Create documentation and examples

### Phase 2: Core Controls (Week 2)
1. Extract generic controls (SliderControl, CheckboxControl, etc.)
2. Create first component group (ColorGroup)
3. Test alongside existing UI (dual mode)
4. Validate state sync and events

### Phase 3: Simulation Components (Week 3)
1. Extract SimulationGroup
2. Extract KaleidoscopeGroup
3. Extract QualityGroup
4. Test all parameter syncing

### Phase 4: Effects & Actions (Week 4)
1. Extract EffectsGroup
2. Extract CanvasGroup
3. Extract AnimationsGroup
4. Extract LayersGroup

### Phase 5: Layout System (Week 5)
1. Create SidebarLayout (current layout)
2. Create layout switching system
3. Test component portability
4. Create alternative layouts (MixerLayout, CompactLayout)

### Phase 6: Cleanup & Polish (Week 6)
1. Remove old inline HTML
2. Optimize component rendering
3. Add component lazy loading
4. Performance testing
5. Documentation completion

---

## Component Registry

```javascript
// components/base/ComponentRegistry.js
class ComponentRegistry {
    constructor() {
        this.components = new Map();
        this.instances = new Map();
    }
    
    register(name, ComponentClass) {
        this.components.set(name, ComponentClass);
    }
    
    create(name, config) {
        const ComponentClass = this.components.get(name);
        if (!ComponentClass) {
            throw new Error(`Component ${name} not registered`);
        }
        const instance = new ComponentClass(config);
        this.instances.set(config.id, instance);
        return instance;
    }
    
    get(id) {
        return this.instances.get(id);
    }
    
    getAll() {
        return Array.from(this.instances.values());
    }
    
    destroy(id) {
        const instance = this.instances.get(id);
        if (instance) {
            instance.destroy();
            this.instances.delete(id);
        }
    }
}

// Global registry
window.ComponentRegistry = new ComponentRegistry();
```

---

## Usage Example

```javascript
// Register components
ComponentRegistry.register('slider', SliderControl);
ComponentRegistry.register('colorGroup', ColorGroup);
ComponentRegistry.register('kaleidoGroup', KaleidoscopeGroup);

// Create components
const densitySlider = ComponentRegistry.create('slider', {
    id: 'densityDissipation',
    label: 'Density Sustain',
    min: 0.85,
    max: 1.005,
    step: 0.0001,
    value: 0.993,
    formatValue: (v) => v.toFixed(4)
});

const colorGroup = ComponentRegistry.create('colorGroup', {
    id: 'colorControls',
    currentColor: '#ff0000',
    savedColors: []
});

// Mount to DOM
const sidebar = document.querySelector('.controls');
densitySlider.mount(sidebar);
colorGroup.mount(sidebar);

// Listen to events
densitySlider.on('change', (value) => {
    console.log('Density changed:', value);
    // Update simulation
});

colorGroup.on('colorChange', (color) => {
    console.log('Color changed:', color);
    // Update simulation
});

// Sync with existing controls (during migration)
densitySlider.syncWith('densityDissipation');
```

---

## Layout System

```javascript
class SidebarLayout {
    constructor(components) {
        this.components = components;
        this.container = document.querySelector('.controls');
    }
    
    render() {
        // Define order and grouping
        const groups = [
            { title: 'Brush & Color', components: ['brushSize', 'colorControls'] },
            { title: 'Quality', components: ['qualitySettings'] },
            { title: 'Simulation', components: ['simulationParams'] },
            { title: 'Kaleidoscope', components: ['kaleidoControls'] },
            { title: 'Effects', components: ['effectsGroup'] },
            { title: 'Canvas', components: ['canvasSettings'] },
            { title: 'Actions', components: ['animationsGroup', 'layersGroup'] }
        ];
        
        groups.forEach(group => {
            const groupEl = document.createElement('div');
            groupEl.className = 'component-group';
            groupEl.innerHTML = `<h3>${group.title}</h3>`;
            
            group.components.forEach(id => {
                const component = ComponentRegistry.get(id);
                if (component) {
                    component.mount(groupEl);
                }
            });
            
            this.container.appendChild(groupEl);
        });
    }
}
```

---

## Benefits

### For Development
- **Easier Testing**: Each component can be tested in isolation
- **Better Organization**: Clear file structure and responsibilities
- **Faster Development**: Reuse components across layouts
- **Type Safety**: Can add TypeScript definitions per component

### For Maintenance
- **Easier Debugging**: Issues isolated to specific components
- **Clear Dependencies**: Each component declares its needs
- **Version Control**: Changes are scoped to specific files
- **Documentation**: Each component self-documents its API

### For Features
- **Layout Flexibility**: Easily create new layouts
- **Theme Support**: Style components independently
- **A/B Testing**: Test different UI arrangements
- **User Customization**: Let users arrange their own layouts

---

## File Organization

```
js/
├── components/
│   ├── base/
│   │   ├── UIComponent.js           # Base class
│   │   ├── ComponentRegistry.js     # Registry
│   │   └── ComponentLoader.js       # Loader
│   ├── controls/
│   │   ├── SliderControl.js
│   │   ├── CheckboxControl.js
│   │   ├── ColorPickerControl.js
│   │   ├── SelectControl.js
│   │   └── ButtonControl.js
│   ├── groups/
│   │   ├── ColorGroup.js
│   │   ├── SimulationGroup.js
│   │   ├── KaleidoscopeGroup.js
│   │   ├── QualityGroup.js
│   │   ├── EffectsGroup.js
│   │   ├── CanvasGroup.js
│   │   ├── AnimationsGroup.js
│   │   └── LayersGroup.js
│   └── layouts/
│       ├── SidebarLayout.js
│       ├── MixerLayout.js
│       └── CompactLayout.js
├── 19-component-system.js           # Main initialization
└── [existing files...]
```

---

## Next Steps

1. **Create base system** (UIComponent, Registry, Loader)
2. **Extract first component** (ColorGroup as proof of concept)
3. **Test dual mode** (new component + old HTML side by side)
4. **Iterate and refine** based on learnings
5. **Gradually migrate** all control groups
6. **Remove old HTML** once all components migrated
7. **Create alternative layouts** using component system

---

## Success Metrics

- ✅ All controls work as components
- ✅ State syncs correctly with simulation
- ✅ Components can be reordered without code changes
- ✅ New layouts can be created in <100 lines
- ✅ Component tests cover 80%+ of functionality
- ✅ Documentation complete for all components
- ✅ Performance matches or exceeds current implementation
