# Componentization Plan

## Goal
Split large files into focused modules (max 400 lines each) without changing ANY functionality.

## File Breakdown

### 05-fluid-sim.js (3,016 lines) → Split into:

1. **sim/shaders.js** (~800 lines)
   - All GLSL shader strings
   - PRECISION constant
   - Lines: 38-358

2. **sim/programs.js** (~150 lines)
   - compileShader function
   - Program class
   - All program instances
   - Lines: 1-36, 360-368

3. **sim/textures.js** (~300 lines)
   - createFBO, createDoubleFBO
   - initFramebuffers
   - Texture management
   - Lines: 385-462, 415-462

4. **sim/solver.js** (~600 lines)
   - Advection, divergence, curl, pressure, gradient logic
   - Main simulation step
   - Lines: 1823-1920

5. **sim/renderer.js** (~400 lines)
   - Display rendering
   - Kaleidoscope rendering
   - blit function
   - Lines: 1920-2100

6. **sim/input.js** (~400 lines)
   - Pointer tracking
   - Splat handling
   - Stroke replay
   - multiSplat function
   - Lines: 480-774, 1100-1400

7. **sim/init.js** (~300 lines)
   - GL context setup
   - Animation loop
   - FPS control
   - Lines: 2800-3016

### 04-ui-interactions.js (1,747 lines) → Split into:

1. **ui/controls.js** (~500 lines)
   - All slider/checkbox handlers
   - Value display updates

2. **ui/resolution.js** (~400 lines)
   - Resolution management
   - Preset/custom switching

3. **ui/complexity.js** (~300 lines)
   - Complexity system
   - Advanced controls toggle

4. **ui/theme.js** (~200 lines)
   - Theme toggle
   - Dark/light mode

5. **ui/mobile.js** (~200 lines)
   - Mobile detection
   - Mobile-specific UI

### 03-recording.js (1,212 lines) → Split into:

1. **recording/timeline.js** (~400 lines)
   - Timeline UI
   - Layer management

2. **recording/playback.js** (~400 lines)
   - Playback engine
   - Interaction recording

3. **recording/presets.js** (~300 lines)
   - Preset save/load
   - Preset UI

### Settings files → Consolidate:

1. **settings/manager.js** (09-settings-manager.js - 338 lines) ✓ Keep as-is
2. **settings/interface.js** (11-settings-interface.js - 371 lines) ✓ Keep as-is
3. **settings/save-load.js** (12-save-load.js - 290 lines) ✓ Keep as-is

### Other files → Move:

1. **multiplayer/client.js** (06-multiplayer.js - 345 lines) ✓ Keep as-is
2. **electron/init.js** (merge 00-cache-buster.js + electron-performance.js)
3. **ui/stats.js** (08-stats-panel.js - 255 lines) ✓ Keep as-is
4. **ui/draggable.js** (10-draggable.js - 231 lines) ✓ Keep as-is
5. **ui/battery.js** (14-battery-manager.js - 544 lines) ✓ Keep as-is
6. **core/config.js** (01-config.js - 566 lines) ✓ Keep as-is
7. **core/palettes.js** (02-palettes.js - 345 lines) ✓ Keep as-is

## Execution Order

1. ✅ Delete debug MD files
2. ✅ Create directory structure
3. Split 05-fluid-sim.js (biggest impact)
4. Split 04-ui-interactions.js
5. Split 03-recording.js
6. Move/consolidate other files
7. Update index.html imports
8. Test all functionality

## Rules

- ✅ NO functionality changes
- ✅ NO code deletion (except dead code)
- ✅ Preserve all exports/globals
- ✅ Maintain load order
- ✅ Keep all comments
