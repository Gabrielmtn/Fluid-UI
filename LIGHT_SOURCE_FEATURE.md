# Light Source Feature - Depth Illusion System

## Overview
A sophisticated lighting system that creates an illusion of depth in the 2D fluid simulation by manipulating colors and gradients based on a draggable light source position.

## Inspiration
The lighting shader incorporates concepts from volumetric rendering techniques:
- **Physical light falloff** (1/r²)
- **Volumetric scattering** with phase functions
- **Transmittance** (light absorption through medium)
- **Pseudo-depth** from color intensity and velocity
- **Rim lighting** and specular highlights

## Components

### 1. Shader (`js/05-fluid-sim.js`)
**Location:** Lines 259-369

**Key Features:**
- **Pseudo-depth calculation**: Uses color intensity + velocity magnitude to simulate depth
- **Physical falloff**: `1.0 / (1.0 + dist² × 2.0)` for realistic light attenuation
- **Volumetric scattering**: Brighter areas scatter more light using isotropic phase function
- **Transmittance**: Samples midpoint between pixel and light to calculate light absorption
- **Color temperature shift**: 
  - Warm shift (yellow-orange) near light: `vec3(1.08, 1.03, 0.97)`
  - Cool shift (blue) away from light: `vec3(0.95, 0.97, 1.05)`
- **Specular highlights**: Phong-like highlights stronger on high-velocity areas
- **Rim lighting**: Subtle edge lighting perpendicular to light direction

**Uniforms:**
- `uTexture`: Input color texture
- `uVelocity`: Velocity field for pseudo-depth
- `lightPos`: Light position (0-1 normalized, Y-flipped for GL coords)
- `intensity`: Light intensity (0-1)
- `ambient`: Ambient light level (0-1)

### 2. UI Panel (`js/13-light-source.js`)
**Features:**
- **Draggable grid**: 10×10 grid for precise light positioning
- **Visual feedback**: Glowing light dot with radial gradient overlay
- **Real-time controls**:
  - Intensity slider (0-1)
  - Ambient light slider (0-1)
  - Reset position button
- **Settings persistence**: Saves position, intensity, ambient, and enabled state
- **Draggable panel**: Uses Draggable class with header handle

**State Management:**
```javascript
window.lightSource = {
    enabled: false,
    x: 0.5,        // Normalized 0-1
    y: 0.5,        // Normalized 0-1
    intensity: 0.5,
    ambient: 0.3
}
```

### 3. Styling (`css/light-source.css`)
**Design:**
- Semi-transparent dark panel with blur backdrop
- Blue gradient theme matching app aesthetic
- Glowing light dot with multiple shadow layers
- Responsive grid with highlighted center lines
- Smooth transitions and hover states

### 4. Render Pipeline Integration
**Location:** `js/05-fluid-sim.js` lines 2234-2252

**Pipeline Order:**
1. Density simulation
2. Sharpness pass (if enabled)
3. **→ Lighting pass (if enabled)** ← NEW
4. Display with kaleidoscope effects

**FBO:** `lit` buffer at dye resolution (RGBA16F)

## Usage

### Enable/Disable
- Checkbox: "💡 Light Source (Depth Effect)" in controls panel
- Toggles both shader pass and UI panel

### Positioning Light
1. Click/drag anywhere on the grid
2. Light dot follows cursor
3. Gradient overlay shows light direction
4. Position auto-saves to settings

### Adjusting Parameters
- **Intensity**: Controls light strength (higher = more dramatic effect)
- **Ambient**: Base light level (prevents pure black, 0.3 default)
- **Reset**: Returns light to center (0.5, 0.5)

## Visual Effects

### What You'll See
1. **Directional brightness**: Areas closer to light appear brighter
2. **Color temperature**: Warm tones near light, cool tones away
3. **Depth perception**: Brighter/moving areas appear "closer"
4. **Volumetric glow**: Light scatters through dense fluid regions
5. **Specular highlights**: Shiny spots where light hits active fluid
6. **Rim lighting**: Subtle edge glow on fluid boundaries

### Best Use Cases
- **Kaleidoscope mode**: Enhances pattern depth
- **High-velocity flows**: Specular highlights on motion
- **Dense color areas**: Volumetric scattering effect
- **Artistic renders**: Dramatic lighting for screenshots

## Technical Details

### Performance
- **Cost**: Single shader pass at dye resolution (~0.2-0.5ms)
- **Optimization**: Early exit for transparent pixels
- **Mobile**: Works on mobile with mediump precision

### Shader Math
```glsl
// Pseudo-depth from color + velocity
depth = luminance × (1.0 + velocityMag × 0.5)

// Physical falloff
falloff = 1.0 / (1.0 + distance² × 2.0)

// Transmittance (exponential absorption)
transmittance = exp(-extinction × distance)

// Final brightness
brightness = ambient + falloff × intensity × transmittance
```

### Settings Keys
- `lightSource.enabled`: Boolean
- `lightSource.x`: Float 0-1
- `lightSource.y`: Float 0-1
- `lightSource.intensity`: Float 0-1
- `lightSource.ambient`: Float 0-1
- `lightPanel.position`: {x, y} for panel location

## Future Enhancements
- Multiple light sources
- Colored lights (RGB instead of white)
- Animated light movement
- Light intensity based on audio input
- Shadow casting (raymarching)
- Anisotropic scattering (directional phase function)
