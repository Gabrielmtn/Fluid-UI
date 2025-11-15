# Shader Port Summary - Step 2 Complete

## Overview
Successfully ported all WebGL GLSL shaders to WGSL for WebGPU compute pipeline.

**Timeline:** ~45 minutes  
**Files Created:** 7 WGSL shader files  
**Lines of Code:** ~600 lines of shader code

---

## Shader Files Created

### 1. `shaders/advection.wgsl` (60 lines)
**Purpose:** Semi-Lagrangian advection with dissipation

**Key Features:**
- Handles both velocity and density advection
- Back-traces particles through velocity field
- Stillness-based alpha fade for density (prevents ghosting in still areas)
- Configurable dissipation factor
- Compute shader @ 8x8 workgroups

**Uniforms:**
- `texel_size`: Grid spacing
- `dt`: Time step
- `dissipation`: Damping factor
- `is_density`: 0=velocity pass, 1=density pass

---

### 2. `shaders/divergence.wgsl` (58 lines)
**Purpose:** Computes divergence of velocity field

**Key Features:**
- Central difference scheme
- Boundary reflection (no-slip conditions)
- Required for pressure projection

**Output:** Single-channel R32Float texture

---

### 3. `shaders/curl.wgsl` (45 lines)
**Purpose:** Computes vorticity (curl) of velocity field

**Key Features:**
- 2D curl: dVy/dx - dVx/dy
- Used for vorticity confinement
- Helps preserve small-scale turbulence

**Output:** Single-channel R32Float texture

---

### 4. `shaders/pressure.wgsl` (47 lines)
**Purpose:** Jacobi pressure solver iteration

**Key Features:**
- Single iteration of Jacobi method
- Solves Poisson equation: ∇²p = -∇·v
- Run 40-50 times for convergence
- Boundary clamping

**Algorithm:**
```
p_new = (p_left + p_right + p_top + p_bottom - divergence) / 4
```

---

### 5. `shaders/gradient.wgsl` (47 lines)
**Purpose:** Gradient subtraction (Hodge decomposition)

**Key Features:**
- Subtracts pressure gradient from velocity
- Makes velocity field divergence-free
- Final step of pressure projection

**Algorithm:**
```
v_new = v_old - ∇p
```

**Output:** RG32Float texture (2-channel velocity)

---

### 6. `shaders/display.wgsl` (193 lines)
**Purpose:** Final render to screen with kaleidoscope effects

**Type:** Render pipeline (vertex + fragment shaders)

**Kaleidoscope Modes:**
1. **Off** - Pass-through
2. **Wedge** - Angular reflections (facets parameter)
3. **MirrorH** - Horizontal layered reflections
4. **MirrorV** - Vertical layered reflections  
5. **MirrorQuad** - Quad reflections with nested depth
6. **Spiral** - Concentric spiral bands

**Features:**
- Full-screen quad vertex shader
- UV transformation per kaleidoscope mode
- Rotation, zoom, twist parameters
- Blend between original and kaleidoscope
- Opacity preservation
- Background transparency control

**Uniforms:**
- `k_mode`: Kaleidoscope mode enum
- `segments`: Facets/layers/reflections count
- `k_angle`: Rotation in radians
- `k_twist`: Spiral twist intensity
- `k_zoom`: Scale factor
- `k_blend`: Mix factor (0-1)
- `preserve_opacity`: Enable alpha control
- `background_transparency`: Black area transparency

---

### 7. `shaders/splat.wgsl` (44 lines)
**Purpose:** Add force or density at a point

**Key Features:**
- Gaussian falloff: `exp(-r²/radius)`
- Aspect ratio correction
- Additive blending (20% strength)

**Use Cases:**
- Mouse drag → velocity injection
- Click → density injection
- Touch input → force application

---

## Technical Decisions

### Why Compute Shaders?
- **Simpler pipeline:** No need for vertex/fragment setup
- **Direct memory access:** Write to storage textures
- **Better performance:** GPU can optimize workgroup dispatch
- **Easier ping-pong:** Just swap bind groups

### Workgroup Size: 8x8
- Common choice for 2D compute
- 64 threads per workgroup (good occupancy)
- Divides evenly into common resolutions:
  - 256x144 → 32x18 workgroups
  - 512x288 → 64x36 workgroups
  - 1024x576 → 128x72 workgroups

### Texture Formats
- **Velocity:** RG32Float (2 channels)
- **Density:** RGBA32Float (4 channels RGB + alpha)
- **Pressure:** R32Float (1 channel)
- **Divergence:** R32Float (1 channel)
- **Curl:** R32Float (1 channel)

### Display Shader Exception
- Only shader using **render pipeline** (not compute)
- Renders full-screen quad directly to swapchain
- Allows hardware interpolation and rasterization
- Simplifies kaleidoscope UV transformations

---

## Fidelity to Original

### Exact Ports
- Advection algorithm identical
- Jacobi solver unchanged
- Divergence/curl calculations match
- Kaleidoscope math preserved

### Improvements
- Compute shaders more efficient than fragment shaders
- Explicit boundary handling
- Better precision control (f32 explicit)
- No vertex shader overhead for compute passes

### Minor Differences
- Modulo operator: GLSL `mod` → WGSL `%`
- Atan function: GLSL `atan(y, x)` → WGSL `atan2(y, x)`
- Type suffixes: GLSL `1.0` → WGSL `1.0` (explicit `f32` in variables)

---

## Next Steps (Step 3)

Now that shaders are ready, we need to:

1. **GPU Context Setup**
   - Initialize WebGPU device
   - Create command queue
   - Set up surface for window

2. **Pipeline Creation**
   - Load WGSL shader source
   - Create compute pipelines for each kernel
   - Create render pipeline for display
   - Set up bind group layouts

3. **Resource Management**
   - Allocate GPU textures (velocity, density, pressure, etc.)
   - Create uniform buffers
   - Set up samplers (linear, point)
   - Implement ping-pong texture swapping

4. **Simulation Loop**
   - Command buffer recording
   - Dispatch compute shaders
   - Render to screen
   - Present swapchain

5. **Input Integration**
   - Mouse/touch to UV coordinates
   - Splat dispatch on pointer events
   - Kaleidoscope parameter updates

**Estimated Timeline for Step 3:** 2-3 days

---

## File Locations

```
zig/shaders/
├── advection.wgsl    # Velocity & density advection
├── divergence.wgsl   # Velocity divergence
├── curl.wgsl         # Vorticity calculation
├── pressure.wgsl     # Jacobi pressure solver
├── gradient.wgsl     # Pressure gradient subtraction
├── display.wgsl      # Final render + kaleidoscope
└── splat.wgsl        # Force/density injection
```

All shaders tested for syntax compatibility with WGSL spec.  
Ready for integration into WebGPU pipeline!
