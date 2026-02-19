# Component System - Implementation Guide

## Overview

The component system provides a modular, reusable architecture for UI controls. Each component is self-contained with its own state, events, and lifecycle management.

---

## Quick Start

### 1. Load Component System

```html
<script src="js/components/base/UIComponent.js"></script>
<script src="js/components/base/ComponentRegistry.js"></script>
<script src="js/components/controls/SliderControl.js"></script>
```

### 2. Register Components

```javascript
ComponentRegistry.register('slider', SliderControl, {
    description: 'Generic slider control',
    category: 'controls',
    version: '1.0.0'
});
```

### 3. Create and Mount

```javascript
const slider = ComponentRegistry.create('slider', {
    id: 'densitySlider',
    label: 'Density',
    min: 0.85,
    max: 1.005,
    step: 0.0001,
    value: 0.993
});

slider.mount(document.querySelector('.controls'));
```

### 4. Listen to Events

```javascript
slider.on('change', (value) => {
    console.log('Density changed:', value);
    // Update simulation
});
```

---

## Core Concepts

### UIComponent Base Class

All components extend `UIComponent` which provides:

- **Lifecycle Management**: init, mount, unmount, destroy
- **State Management**: setState, getState
- **Event System**: on, off, emit
- **DOM Utilities**: find, findAll
- **Sync System**: syncWith, syncFromExternal, syncToExternal
- **Persistence**: save, load (integrates with settingsManager)

### Component Registry

Central registry for managing components:

- **Registration**: Register component classes
- **Creation**: Create instances with configuration
- **Lifecycle**: Manage component lifecycle
- **Groups**: Organize components into logical groups
- **Discovery**: Find and query components

---

## Creating a Component

### Basic Structure

```javascript
class MyComponent extends UIComponent {
    constructor(config) {
        super(config);
        // Component-specific properties
        this.myProperty = config.myProperty || 'default';
    }
    
    render() {
        return `
            <div data-component="${this.id}">
                <h3>${this.label}</h3>
                <!-- Component HTML -->
            </div>
        `;
    }
    
    bindEvents() {
        // Set up event listeners
        const button = this.find('button');
        button?.addEventListener('click', () => {
            this.emit('action', { data: 'example' });
        });
    }
    
    unbindEvents() {
        // Clean up event listeners
    }
}
```

### Lifecycle Hooks

```javascript
class MyComponent extends UIComponent {
    // Called after construction
    init() {
        console.log('Component initialized');
        this.load(); // Load saved state
    }
    
    // Called after mounting to DOM
    onMount() {
        console.log('Component mounted');
    }
    
    // Called before unmounting
    onUnmount() {
        console.log('Component unmounting');
    }
    
    // Called when destroyed
    onDestroy() {
        console.log('Component destroyed');
    }
}
```

---

## State Management

### Setting State

```javascript
// Update state and re-render
component.setState({ value: 50 });

// Update state without re-rendering
component.setState({ value: 50 }, false);

// Multiple properties
component.setState({
    value: 50,
    enabled: true,
    color: '#ff0000'
});
```

### Getting State

```javascript
const state = component.getState();
console.log(state.value); // 50
```

### State Events

```javascript
component.on('stateChange', ({ oldState, newState }) => {
    console.log('State changed from', oldState, 'to', newState);
});
```

---

## Event System

### Emitting Events

```javascript
class MyComponent extends UIComponent {
    handleClick() {
        this.emit('click', { x: 100, y: 200 });
    }
    
    handleChange(value) {
        this.emit('change', value);
    }
}
```

### Listening to Events

```javascript
component.on('change', (value) => {
    console.log('Value changed:', value);
});

component.on('click', (data) => {
    console.log('Clicked at:', data.x, data.y);
});
```

### Removing Listeners

```javascript
const handler = (value) => console.log(value);

component.on('change', handler);
component.off('change', handler);
```

---

## Syncing with External Controls

### Bidirectional Sync

```javascript
// Component syncs with existing input
const slider = ComponentRegistry.create('slider', {
    id: 'mySlider',
    label: 'My Slider',
    min: 0,
    max: 100,
    value: 50
});

// Sync with existing control
slider.syncWith('densityDissipation');

// Now changes in either location update both:
// - Component slider → Original input
// - Original input → Component slider
```

### How Sync Works

1. Component reads initial value from external element
2. Component listens to its own changes and updates external
3. Component listens to external changes and updates itself
4. Both stay in sync automatically

---

## Component Groups

### Creating Groups

```javascript
// Create components in a group
const params = ['density', 'velocity', 'pressure'];

params.forEach(param => {
    const slider = ComponentRegistry.create('slider', {
        id: `${param}Slider`,
        label: param,
        group: 'simulation' // Add to group
    });
    slider.mount(container);
});
```

### Working with Groups

```javascript
// Get all components in group
const simComponents = ComponentRegistry.getGroup('simulation');

// Mount entire group
ComponentRegistry.mountGroup('simulation', container);

// Unmount entire group
ComponentRegistry.unmountGroup('simulation');

// Remove component from group
ComponentRegistry.removeFromGroup('simulation', 'densitySlider');
```

---

## Persistence

### Auto-Save

```javascript
// Auto-save enabled by default
const slider = ComponentRegistry.create('slider', {
    id: 'mySlider',
    autoSave: true // default
});

// State automatically saved to localStorage on change
```

### Manual Save/Load

```javascript
// Save manually
component.save();

// Load manually
component.load();

// Custom settings key
const slider = ComponentRegistry.create('slider', {
    id: 'mySlider',
    settingsKey: 'custom.slider.density'
});
```

### Export/Import All States

```javascript
// Export all component states
const states = ComponentRegistry.exportStates();
localStorage.setItem('componentStates', JSON.stringify(states));

// Import states
const states = JSON.parse(localStorage.getItem('componentStates'));
ComponentRegistry.importStates(states);
```

---

## SliderControl Component

### Configuration

```javascript
const slider = ComponentRegistry.create('slider', {
    id: 'densitySlider',
    label: 'Density Sustain',
    min: 0.85,
    max: 1.005,
    step: 0.0001,
    value: 0.993,
    unit: '',
    formatValue: (v) => v.toFixed(4),
    orientation: 'horizontal' // or 'vertical'
});
```

### Methods

```javascript
// Set value
slider.setValue(0.95);

// Get value
const value = slider.getValue(); // 0.95

// Set range
slider.setMin(0.8);
slider.setMax(1.0);

// Enable/disable
slider.enable();
slider.disable();
```

### Events

```javascript
slider.on('change', (value) => {
    console.log('New value:', value);
});
```

---

## Migration Strategy

### Phase 1: Dual Mode

Run new components alongside old HTML:

```javascript
// Create new component
const newSlider = ComponentRegistry.create('slider', {
    id: 'densitySliderNew',
    label: 'Density (New)',
    min: 0.85,
    max: 1.005,
    value: 0.993
});

// Mount next to old control
newSlider.mount(document.querySelector('.controls'));

// Sync with old control
newSlider.syncWith('densityDissipation');

// Both work, stay in sync
```

### Phase 2: Replace

Once tested, remove old HTML and use only components:

```javascript
// Old HTML removed from index.html
// Component becomes primary control

const slider = ComponentRegistry.create('slider', {
    id: 'densityDissipation', // Use original ID
    label: 'Density Sustain',
    min: 0.85,
    max: 1.005,
    value: 0.993
});

slider.mount(container);

// Connect to simulation directly
slider.on('change', (value) => {
    config.DENSITY_DISSIPATION = value;
});
```

---

## Best Practices

### 1. Component Design

- **Single Responsibility**: Each component does one thing well
- **Self-Contained**: Component manages its own state and DOM
- **Reusable**: Can be used in different contexts
- **Configurable**: Behavior controlled by config object

### 2. State Management

- **Immutable Updates**: Use setState, don't mutate state directly
- **Minimal State**: Only store what's necessary
- **Derived Values**: Calculate from state, don't store
- **Event-Driven**: Emit events for state changes

### 3. Event Handling

- **Descriptive Names**: Use clear event names (change, click, submit)
- **Consistent Data**: Pass consistent data structures
- **Error Handling**: Wrap listeners in try-catch
- **Cleanup**: Remove listeners in unbindEvents

### 4. Performance

- **Lazy Rendering**: Only render when mounted
- **Batch Updates**: Use setState once with multiple properties
- **Event Delegation**: Use delegation for dynamic content
- **Cleanup**: Always unbind listeners and clear references

---

## Example: Color Group Component

```javascript
class ColorGroup extends UIComponent {
    constructor(config) {
        super(config);
        this.savedColors = config.savedColors || [];
        this.currentColor = config.currentColor || '#ff0000';
        
        this.state = {
            currentColor: this.currentColor,
            savedColors: this.savedColors,
            randomEnabled: config.randomEnabled !== false
        };
    }
    
    render() {
        return `
            <div class="control-group" data-component="${this.id}">
                <label>Fluid Color</label>
                <input type="color" 
                       data-color-picker 
                       value="${this.state.currentColor}">
                
                <div class="color-actions">
                    <button data-action="save">Save Color</button>
                    <button data-action="clear">Clear All</button>
                </div>
                
                <div class="saved-colors">
                    ${this.renderSavedColors()}
                </div>
                
                <div class="checkbox-group">
                    <input type="checkbox" 
                           data-random-toggle 
                           ${this.state.randomEnabled ? 'checked' : ''}>
                    <label>Random Colors</label>
                </div>
            </div>
        `;
    }
    
    renderSavedColors() {
        return this.state.savedColors.map(color => 
            `<div class="color-swatch" 
                  style="background: ${color};" 
                  data-color="${color}"></div>`
        ).join('');
    }
    
    bindEvents() {
        // Color picker
        const picker = this.find('[data-color-picker]');
        picker?.addEventListener('input', (e) => {
            this.setColor(e.target.value);
        });
        
        // Save button
        const saveBtn = this.find('[data-action="save"]');
        saveBtn?.addEventListener('click', () => {
            this.saveColor();
        });
        
        // Clear button
        const clearBtn = this.find('[data-action="clear"]');
        clearBtn?.addEventListener('click', () => {
            this.clearColors();
        });
        
        // Color swatches
        this.findAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                this.setColor(swatch.dataset.color);
            });
        });
        
        // Random toggle
        const randomToggle = this.find('[data-random-toggle]');
        randomToggle?.addEventListener('change', (e) => {
            this.setRandomEnabled(e.target.checked);
        });
    }
    
    setColor(color) {
        this.setState({ currentColor: color });
        this.emit('colorChange', color);
    }
    
    saveColor() {
        const color = this.state.currentColor;
        if (!this.state.savedColors.includes(color)) {
            const savedColors = [...this.state.savedColors, color];
            this.setState({ savedColors });
            this.emit('colorSaved', color);
        }
    }
    
    clearColors() {
        this.setState({ savedColors: [] });
        this.emit('colorsCleared');
    }
    
    setRandomEnabled(enabled) {
        this.setState({ randomEnabled: enabled });
        this.emit('randomToggle', enabled);
    }
}

// Register
ComponentRegistry.register('colorGroup', ColorGroup);

// Use
const colorGroup = ComponentRegistry.create('colorGroup', {
    id: 'colorControls',
    currentColor: '#ff0000',
    savedColors: ['#ff0000', '#00ff00', '#0000ff']
});

colorGroup.mount(container);

colorGroup.on('colorChange', (color) => {
    // Update simulation color
});
```

---

## Debugging

### Component Registry Debug

```javascript
// Print registry status to console
ComponentRegistry.debug();

// Output:
// Component Registry Status
//   Registered Components: ['slider', 'colorGroup', ...]
//   Active Instances: 15
//   Groups: ['simulation', 'effects', ...]
//   Instances:
//     - densitySlider: { type: 'SliderControl', mounted: true, ... }
//     - colorControls: { type: 'ColorGroup', mounted: true, ... }
```

### Component Inspection

```javascript
// Get component
const slider = ComponentRegistry.get('densitySlider');

// Check state
console.log(slider.getState());

// Check if mounted
console.log(slider.mounted);

// Get DOM element
console.log(slider.element);
```

---

## Testing

### Unit Testing Components

```javascript
describe('SliderControl', () => {
    let slider;
    
    beforeEach(() => {
        slider = new SliderControl({
            id: 'testSlider',
            min: 0,
            max: 100,
            value: 50
        });
    });
    
    afterEach(() => {
        slider.destroy();
    });
    
    it('should initialize with correct value', () => {
        expect(slider.getValue()).toBe(50);
    });
    
    it('should update value', () => {
        slider.setValue(75);
        expect(slider.getValue()).toBe(75);
    });
    
    it('should emit change event', (done) => {
        slider.on('change', (value) => {
            expect(value).toBe(75);
            done();
        });
        slider.setValue(75);
    });
    
    it('should clamp value to range', () => {
        slider.setValue(150);
        expect(slider.getValue()).toBe(100);
    });
});
```

---

## Next Steps

1. **Try the demo**: Open `component-demo.html` to see components in action
2. **Create your first component**: Start with a simple control
3. **Migrate one control group**: Test dual mode with existing UI
4. **Expand gradually**: Add more components as you validate the approach
5. **Build new layouts**: Use components to create alternative UIs

---

## Resources

- **Demo**: `component-demo.html` - Interactive examples
- **Strategy**: `MODULARIZATION-STRATEGY.md` - Overall plan
- **Base Class**: `js/components/base/UIComponent.js`
- **Registry**: `js/components/base/ComponentRegistry.js`
- **Example**: `js/components/controls/SliderControl.js`
