# Complete UI Input Cluster Inventory

## Overview
This document catalogs every UI input cluster in the Fluid Simulation application, organized by functional category. Each cluster is now available as a modular component that can be reorganized.

---

## 🎨 **1. COLOR CONTROLS** (ColorGroup)

### Primary Color Selection
- **Color Picker** - Main fluid color selector
- **Saved Colors Swatches** - Grid of saved colors (clickable)
- **Save Color Button** - Add current color to saved colors
- **Clear All Button** - Remove all saved colors

### Color Modes
- **Random Colors Checkbox** - Auto-generate random colors on splat
- **Step Palette Checkbox** - Step through palette colors sequentially

### Palette Management
- **Palette Carousel** - Horizontal scrolling palette selector
- **Palette Preview** - Shows current palette colors
- **Palette Step Indicator** - Shows current position in palette
- **Save as New Palette** - Create new palette from current colors
- **Export Current Palette** - Export to .fluid file
- **Export All Palettes** - Export all palettes
- **Import Palette** - Import .fluid palette file

**Component**: `ColorGroup.js`  
**Original IDs**: `colorPicker`, `randomColor`, `stepPalette`, saved colors array  
**Total Inputs**: ~10 interactive elements

---

## 🖌️ **2. BRUSH CONTROLS** (Standalone)

### Brush Size
- **Brush Size Slider** - Range: 0.1 to 30, step 0.1

**Component**: `SliderControl.js`  
**Original ID**: `brushSize`  
**Total Inputs**: 1

---

## ⚙️ **3. QUALITY SETTINGS** (QualityGroup)

### Visual Quality
- **Visual Quality Dropdown** - Options: High, Medium, Low, Custom
- **Physics Detail Dropdown** - Options: High, Medium, Low, Custom
- **FPS Limit Dropdown** - Options: 30, 60, 120, 144, Unlimited

**Component**: `QualityGroup.js`  
**Original IDs**: `visualResolution`, `physicsResolution`, `fpsCap`  
**Total Inputs**: 3

---

## 🌊 **4. SIMULATION PARAMETERS** (SimulationGroup)

### Dissipation Controls
- **Density Sustain Slider** - Range: 0.85 to 1.005, step 0.0001
- **Velocity Sustain Slider** - Range: 0.9 to 1.0009, step 0.0001
- **Pressure Dissipation Slider** - Range: 0.9 to 1.0333, step 0.001

### Solver Settings
- **Pressure Iteration Slider** - Range: 1 to 50, step 1
- **Motion Isolation Slider** - Range: 1 to 5, step 0.001

### Fluid Behavior
- **Turbulence Checkbox** - Enable billowing clouds effect
- **Curl Slider** - Range: 0 to 60, step 1
- **Viscosity Slider** - Range: 0 to 2, step 0.1
- **Multiplier Slider** - Range: 1 to 8, step 1

**Component**: `SimulationGroup.js`  
**Original IDs**: `densityDissipation`, `velocityDissipation`, `pressureDissipation`, `pressureIteration`, `velocityInfluence`, `turbulenceMode`, `curl`, `sharpness`, `multiplier`  
**Total Inputs**: 9

---

## 🔮 **5. KALEIDOSCOPE CONTROLS** (KaleidoscopeGroup)

### Main Controls
- **Kaleidoscope Checkbox** - Enable/disable effect
- **Segments Slider** - Range: 1 to 24, step 1 (label changes by mode)
- **Mode Dropdown** - Options: Wedge, Mirror H, Mirror V, Mirror Quad, Spiral, Off

### Transform Controls
- **Angle Slider** - Range: -180° to 180°, step 1
- **Animate Rotation Checkbox** - Auto-rotate kaleidoscope
- **Spin Speed Slider** - Range: -180°/s to 180°/s, step 1

### Advanced Effects
- **Twist Slider** - Range: 0 to 10, step 0.1
- **Zoom Slider** - Range: 0.5x to 2.0x, step 0.01
- **Blend Slider** - Range: 0 to 1, step 0.01

**Component**: `KaleidoscopeGroup.js`  
**Original IDs**: `kaleidoToggle`, `kaleidoSegments`, `kaleidoMode`, `kAngle`, `kAnimateRot`, `kSpinSpeed`, `kTwist`, `kZoom`, `kBlend`  
**Total Inputs**: 9

**Note**: Segment label dynamically changes:
- Wedge → "Facets"
- Mirror H/V → "Layers"
- Quad → "Reflections"
- Spiral → "Rings"

---

## 🖼️ **6. CANVAS & DISPLAY** (CanvasDisplayGroup)

### Background Settings
- **Background Color Picker** - Canvas background color
- **Transparent Mode Checkbox** - Enable transparent background
- **Background Transparency Slider** - Range: 0% to 100%, step 1

### Canvas Appearance
- **Canvas Opacity Slider** - Range: 0% to 100%, step 1
- **Empty Alpha Locked Checkbox** - Preserve fluid opacity in empty areas

### Display Options
- **Show Cursor Checkbox** - Display custom cursor
- **Canvas Border & Handles Checkbox** - Show canvas boundaries
- **Stats For Nerds Checkbox** - Show performance stats panel
- **Lock Canvas Borders Checkbox** - Prevent canvas resize

**Component**: `CanvasDisplayGroup.js`  
**Original IDs**: `backgroundColorPicker`, `transparentMode`, `captureDimming`, `canvasOpacity`, `preserveFluidOpacity`, `cursorToggle`, `showCanvasHandles`, `statsToggle`, `lockCanvasBorders`  
**Total Inputs**: 9

---

## ✨ **7. EFFECTS** (EffectsGroup)

### Lighting Effects
- **Light Source Checkbox** - Enable depth effect lighting
- **Light Shift Checkbox** - Enable color overexposure effect

**Component**: `EffectsGroup.js`  
**Original IDs**: `enableLighting`, `enableLightShift`  
**Total Inputs**: 2

**Note**: Each effect has its own inline control panel:
- Light Source: Draggable panel with position grid, intensity, ambient
- Light Shift: Color wheel path, blend mode, speed, threshold, intensity, saturation

---

## 🎬 **8. ACTIONS** (ActionsGroup)

### Core Actions
- **Pause Button** - Pause/Resume simulation
- **Clear Button** - Clear canvas
- **Freeze Button** - Freeze/Unfreeze fluid motion

**Component**: `ActionsGroup.js`  
**Connected to**: `togglePause()`, `clearCanvas()`, `toggleFreeze()`  
**Total Inputs**: 3

---

## 🎭 **9. ANIMATIONS** (AnimationsGroup)

### Animation Triggers
- **Smash Button** - Left: Collide | Right: Expand
- **Jellyfish Button** - Left: Single | Right: Swarm
- **Vortex Button** - Left: Clockwise | Right: Counter
- **Portal Button** - Left: Swoop | Right: Expand
- **Portrait Button** - Trigger portrait animation
- **Ascend Button** - Trigger ascend animation

### Animation Settings
- **Ascend Randomness Checkbox** - Randomize ascend behavior

**Component**: `AnimationsGroup.js`  
**Original IDs**: Button clicks, `ascendRandomness`  
**Total Inputs**: 7

---

## 🖼️ **10. LAYERS** (LayersGroup)

### Layer Management
- **Capture Layer Button** - Capture current canvas as layer
- **Upload Image Button** - Upload image as layer

### Capture Settings
- **Hover Capture Checkbox** - Enable capture on hover
- **Detach Capture Checkbox** - Detach capture area

### Layer Preview
- **Preview Layers Hover Area** - Hover to view stacked layers

**Component**: `LayersGroup.js`  
**Original IDs**: `captureBtn`, `imageUpload`, `hoverCaptureToggle`, `detachCaptureToggle`, preview toggle  
**Total Inputs**: 5

---

## 🎥 **11. RECORDING** (Part of SettingsManagementGroup)

### Recording Controls
- **Recording Mode Dropdown** - Options: Off, Minimized, Full

**Component**: `SettingsManagementGroup.js`  
**Original ID**: `recMode`  
**Total Inputs**: 1

**Note**: Full recording UI has additional controls when mode is "Full":
- Record/Multi/Pause/Stop buttons
- Max duration input
- Layer navigation
- Timeline preview

---

## 👥 **12. MULTIPLAYER** (Part of SettingsManagementGroup)

### Multi-Artist Controls
- **Enable Multi Artist Checkbox** - Enable multiplayer mode
- **Copy Room URL Button** - Copy shareable room link

**Component**: `SettingsManagementGroup.js`  
**Original IDs**: `multiplayerToggle`, copy room function  
**Total Inputs**: 2

---

## 💾 **13. SETTINGS MANAGEMENT** (SettingsManagementGroup)

### Settings Actions
- **Save Settings Button** (💾) - Export settings to JSON file
- **Load Settings Button** (📂) - Import settings from JSON file
- **Clear Settings Button** (🧹) - Clear all saved settings
- **Autoload Checkbox** - Auto-load settings on startup

**Component**: `SettingsManagementGroup.js`  
**Original IDs**: `saveSettingsBtn`, `loadSettingsBtn`, `clearSettingsBtn`, `autoloadSettings`  
**Total Inputs**: 4

---

## 🎨 **14. PRESETS** (Part of SettingsManagementGroup)

### Preset Buttons
- **Silky** - Smooth, flowing preset
- **Thick** - Dense, heavy preset
- **Wispy** - Light, airy preset
- **Chaotic** - Turbulent preset
- **Ethereal** - Delicate, ghostly preset
- **Turbulent** - High-energy preset
- **Marble** - Marbled pattern preset
- **Electric** - Sharp, energetic preset

**Component**: `SettingsManagementGroup.js`  
**Connected to**: `applyPreset()` function  
**Total Inputs**: 8

---

## 📊 **SUMMARY BY CATEGORY**

| Category | Component | Inputs | Type |
|----------|-----------|--------|------|
| **Color Controls** | ColorGroup | 10 | Pickers, buttons, checkboxes |
| **Brush** | SliderControl | 1 | Slider |
| **Quality** | QualityGroup | 3 | Dropdowns |
| **Simulation** | SimulationGroup | 9 | Sliders, checkbox |
| **Kaleidoscope** | KaleidoscopeGroup | 9 | Sliders, dropdown, checkboxes |
| **Canvas/Display** | CanvasDisplayGroup | 9 | Sliders, checkboxes, picker |
| **Effects** | EffectsGroup | 2 | Checkboxes |
| **Actions** | ActionsGroup | 3 | Buttons |
| **Animations** | AnimationsGroup | 7 | Buttons, checkbox |
| **Layers** | LayersGroup | 5 | Buttons, checkboxes, hover area |
| **Recording** | SettingsManagementGroup | 1 | Dropdown |
| **Multiplayer** | SettingsManagementGroup | 2 | Checkbox, button |
| **Settings Mgmt** | SettingsManagementGroup | 4 | Buttons, checkbox |
| **Presets** | SettingsManagementGroup | 8 | Buttons |
| **TOTAL** | **11 Components** | **73** | **Mixed** |

---

## 🎯 **REORGANIZATION SUGGESTIONS**

### By Frequency of Use
**High Frequency** (Use constantly):
- Brush Size
- Color Controls
- Pause/Clear/Freeze

**Medium Frequency** (Adjust occasionally):
- Simulation Parameters
- Kaleidoscope Controls
- Canvas/Display

**Low Frequency** (Set once):
- Quality Settings
- Effects
- Settings Management
- Presets

### By Workflow Stage
**Setup** (Before creating):
- Quality Settings
- Canvas/Display
- Presets

**Creation** (While creating):
- Brush Size
- Color Controls
- Simulation Parameters
- Kaleidoscope Controls
- Actions

**Effects** (Enhancement):
- Effects (Light Source/Shift)
- Animations

**Output** (Saving/Sharing):
- Layers
- Recording
- Settings Management
- Multiplayer

### By Complexity Level
**Basic** (Beginner-friendly):
- Brush Size
- Color Controls
- Actions
- Presets

**Intermediate**:
- Simulation Parameters
- Canvas/Display
- Animations

**Advanced**:
- Kaleidoscope Controls
- Effects
- Quality Settings
- Layers
- Recording
- Multiplayer

---

## 🔧 **COMPONENT GROUPING OPTIONS**

### Option A: Functional Tabs
```
[Color & Brush] [Simulation] [Effects] [Layers] [Settings]
```

### Option B: Workflow Panels
```
[Creation Tools] [Simulation Control] [Visual Effects] [Output & Share]
```

### Option C: Complexity Levels
```
[Basic] [Advanced] [Expert]
```

### Option D: Collapsible Sections (Current)
```
▼ Essential Controls
  - Brush Size
  - Color Controls
  - Actions
  
▼ Simulation
  - Quality Settings
  - Simulation Parameters
  - Kaleidoscope
  
▼ Appearance
  - Canvas/Display
  - Effects
  
▼ Advanced
  - Animations
  - Layers
  - Recording
  - Multiplayer
  - Settings
  - Presets
```

### Option E: Mixer-Style Layout
```
Top Bar: [Color Picker] [Brush Size] [Quick Actions]
Bottom Mixer: [All Sliders as Faders/Knobs]
Right Panel: [Layers]
Settings Dropdown: [Everything else]
```

---

## 📝 **NOTES FOR REORGANIZATION**

### Dependencies
- **Light Source** requires its own draggable panel (already exists)
- **Light Shift** requires its own draggable panel (already exists)
- **Recording Full Mode** creates its own drawer UI
- **Palette Management** has inline controls within ColorGroup

### Responsive Considerations
- Mobile: Needs collapsible/tabbed interface
- Tablet: Can show 2-column layout
- Desktop: Can show full sidebar or mixer layout

### Accessibility
- All controls have labels
- Keyboard navigation supported
- Screen reader compatible
- Color contrast compliant

---

## 🚀 **READY FOR REORGANIZATION**

All 73 inputs are now modular components that can be:
- ✅ Moved to different locations
- ✅ Grouped differently
- ✅ Hidden/shown conditionally
- ✅ Styled independently
- ✅ Reordered without code changes
- ✅ Exported to different layouts

Just modify `js/19-component-init.js` to change the order and grouping!
