# Mixer UI Components - Quick Reference

## Component Catalog

### 1. Controller Box
**Purpose**: Container for grouped controls with header
```html
<div class="controllerBox">
    <h3 class="title">Section Name</h3>
    <div class="box">
        <!-- Controls here -->
    </div>
</div>
```
**Styling**: Dark header (#161616), gradient body, rounded corners, shadow

---

### 2. Radial Slider (Jog/Knob)
**Purpose**: Rotary control for precise value adjustment
```javascript
new RadialSlider(container, {
    min: 0,
    max: 100,
    value: 50,
    step: 1,
    label: 'Parameter',
    format: (val) => `${val}%`,
    onChange: (val) => { /* handle change */ }
});
```
**Features**: SVG-based, touch/mouse support, arc progress, value display

---

### 3. Progress Slider
**Purpose**: Horizontal range input with visual feedback
```html
<div class="progressSlider">
    <span>Min</span>
    <input type="range" min="0" max="100" value="50">
    <span>Max</span>
</div>
```
**Styling**: Gradient fill, inset borders, min/max labels

---

### 4. Button Container
**Purpose**: Group of action buttons with consistent styling
```html
<div class="buttonContainer">
    <button>Action 1</button>
    <button class="active">Action 2</button>
    <button>Action 3</button>
</div>
```
**States**: Normal (gradient), Hover (yellow), Active (orange glow)

---

### 5. Toggle Switch
**Purpose**: On/off control with sliding indicator
```html
<div class="toggleContainer">
    <div class="title">Feature Name</div>
    <input type="checkbox" id="toggle1" class="toggle">
    <label for="toggle1"></label>
</div>
```
**Animation**: Smooth slide, gradient → orange

---

### 6. Dot Display
**Purpose**: Value readout in monospace font
```html
<div class="dotDisplay">120 BPM</div>
```
**Styling**: Orange text, inset background, centered

---

### 7. Mixer Section
**Purpose**: Grouped controls with header
```html
<div class="mixer-section">
    <div class="mixer-section-header">Section Title</div>
    <!-- Controls here -->
</div>
```
**Styling**: Gradient background, rounded corners, shadow

---

## Color Variables

```css
--mixer-primary: #f6b018;        /* Orange/gold accent */
--mixer-secondary: #fff686;      /* Yellow highlight */
--mixer-accent: #FFA412;         /* Active orange */
--mixer-bg-dark: #161616;        /* Dark header */
--mixer-bg-gradient: linear-gradient(90deg, #2b2b2b, #1f1f1f);
--mixer-inset-top: #100e0f;      /* Inset shadow top */
--mixer-inset-bottom: #3b393a;   /* Inset shadow bottom */
--mixer-text-primary: #8E8E8E;   /* Label text */
--mixer-text-secondary: #7a7a7a; /* Secondary text */
```

---

## Layout Patterns

### Row Layout (Horizontal)
```html
<div class="row">
    <div class="radialSlider" id="slider1"></div>
    <div class="radialSlider" id="slider2"></div>
    <div class="radialSlider" id="slider3"></div>
</div>
```

### Centered Row
```html
<div class="row center">
    <!-- Items centered with gap -->
</div>
```

---

## State Classes

### Buttons
- `.active` - Orange gradient with glow
- `:hover` - Yellow gradient with lift
- `:active` - Pressed state

### Palette Tags
- `.active` - Orange background
- `:hover` - Lighter gradient

---

## Integration with Existing UI

### Apply to Controls Panel
```html
<div class="controls mixer-style">
    <!-- All controls automatically styled -->
</div>
```

### Individual Control Styling
```html
<!-- Automatically styled when inside .mixer-style -->
<button>Styled Button</button>
<input type="range"><!-- Styled slider -->
<input type="checkbox"><!-- Styled checkbox -->
```

---

## JavaScript Helpers

### Update Progress Slider
```javascript
slider.addEventListener('input', (e) => {
    const percent = (e.target.value / e.target.max) * 100;
    e.target.style.setProperty('--progress-percent', `${percent}%`);
});
```

### Create Radial Slider
```javascript
const slider = new RadialSlider(element, options);
slider.setValue(newValue);
const currentValue = slider.getValue();
```

---

## Best Practices

1. **Grouping**: Use controllerBox for related controls
2. **Consistency**: Apply mixer-style class to parent container
3. **Spacing**: Use row layouts for horizontal alignment
4. **Labels**: Always include descriptive labels
5. **Feedback**: Use active states for user interaction
6. **Values**: Display current values in dotDisplay or value-display spans

---

## Common Patterns

### EQ Section
```html
<div class="controllerBox">
    <h3 class="title">Equalizer</h3>
    <div class="box">
        <div class="row center">
            <div class="radialSlider" id="bass"></div>
            <div class="radialSlider" id="mid"></div>
            <div class="radialSlider" id="treble"></div>
        </div>
    </div>
</div>
```

### Transport Controls
```html
<div class="controllerBox">
    <h3 class="title">Transport</h3>
    <div class="box">
        <div class="buttonContainer">
            <button>⏮</button>
            <button>▶</button>
            <button>⏸</button>
            <button>⏹</button>
            <button>⏭</button>
        </div>
    </div>
</div>
```

### Effects Toggles
```html
<div class="controllerBox">
    <h3 class="title">Effects</h3>
    <div class="box">
        <div class="row center">
            <div class="toggleContainer">
                <div class="title">Reverb</div>
                <input type="checkbox" id="fx1" class="toggle">
                <label for="fx1"></label>
            </div>
            <!-- More toggles... -->
        </div>
    </div>
</div>
```

---

## Customization

### Change Accent Color
```css
:root {
    --mixer-primary: #00d1de;  /* Cyan */
    --mixer-secondary: #00ffff;
    --mixer-accent: #0099cc;
}
```

### Adjust Sizing
```css
.radialSlider {
    width: 120px;  /* Larger knobs */
}

.buttonContainer button {
    width: 40px;   /* Larger buttons */
    height: 40px;
}
```

---

## Browser Support
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers (touch support)
- ⚠️ IE11 (limited support, no CSS variables)

---

## Performance Tips
1. Use CSS transitions (GPU accelerated)
2. Minimize DOM manipulation
3. Debounce rapid value changes
4. Use transform for animations
5. Lazy-load radial sliders for large UIs

---

## Accessibility
- Ensure labels are associated with inputs
- Provide keyboard navigation
- Use ARIA attributes where needed
- Maintain sufficient color contrast
- Support screen readers

---

## Demo
Open `mixer-demo.html` to see all components in action with interactive examples.
