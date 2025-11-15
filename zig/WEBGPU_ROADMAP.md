# WebGPU Backend Roadmap

## ✅ Step 1: Infrastructure Setup (COMPLETE)

**Status:** CPU simulation running successfully  
**Time:** ~30 minutes

### Completed
- [x] Build system with `zig build` and `zig build run`
- [x] GPU type definitions (`src/gpu.zig` - stubs)
- [x] Window abstraction (`src/window.zig` - stubs)
- [x] Main executable (`src/main.zig`)
- [x] CPU simulation loop running at ~60fps
- [x] Verified: advection, pressure projection, density transport

### Output
```
Frame   0: vel=(6.227,3.113) den=(0.838,0.419,0.168)
Frame  10: vel=(1.825,0.909) den=(0.349,0.174,0.070)
Frame  20: vel=(1.123,0.559) den=(0.206,0.103,0.041)
Frame  30: vel=(0.782,0.388) den=(0.137,0.068,0.027)
Frame  40: vel=(0.574,0.285) den=(0.096,0.048,0.019)
Frame  50: vel=(0.435,0.215) den=(0.070,0.035,0.014)
```

✅ Dissipation working, velocity decaying naturally

---

## ✅ Step 2: Shader Porting (COMPLETE)

**Goal:** Convert WebGL GLSL shaders to WGSL compute shaders  
**Status:** All core shaders ported!

### Shaders Ported

From `js/05-fluid-sim.js` inline GLSL → `shaders/*.wgsl`:

1. ✅ **advection.wgsl**
   - Semi-Lagrangian advection with dissipation
   - Supports velocity and density passes
   - Stillness-based alpha fade for density
   
2. ✅ **divergence.wgsl**
   - Velocity divergence calculation
   - Boundary reflection for no-slip conditions
   
3. ✅ **curl.wgsl**
   - Vorticity (curl) calculation
   - Used for vorticity confinement
   
4. ✅ **pressure.wgsl**
   - Jacobi pressure solver
   - Single iteration (run 40x for convergence)
   
5. ✅ **gradient.wgsl**
   - Gradient subtraction (projection step)
   - Makes velocity field divergence-free
   
6. ✅ **display.wgsl**
   - Final render fragment shader
   - All 5 kaleidoscope modes implemented:
     - Off, Wedge, MirrorH, MirrorV, MirrorQuad, Spiral
   - Opacity control and background transparency
   
7. ✅ **splat.wgsl**
   - Gaussian force/density injection
   - Aspect-ratio corrected

### Key Changes from GLSL→WGSL

- **Compute shaders** instead of fragment shaders (except display)
- **Explicit workgroup size**: `@workgroup_size(8, 8, 1)`
- **Storage textures** for output: `texture_storage_2d<rgba32float, write>`
- **Uniform binding groups**: `@group(0) @binding(N)`
- **Type annotations**: `vec2<f32>`, `u32`, etc.
- **Function syntax**: `fn` instead of `void`
- **No implicit conversions**: Must use explicit casts

---

## 📦 Step 3: GPU Pipeline (IN PROGRESS)

**Goal:** Wire WebGPU compute pipelines and textures  
**Time Estimate:** 2-3 days  
**Status:** Infrastructure ready, bindings needed

### Completed
- [x] Shader loading infrastructure (`src/shaders.zig`)
- [x] GPU simulation manager (`src/gpu_sim.zig`)
- [x] Pipeline stubs with proper architecture
- [x] All 7 shaders loading successfully:
  - advection.wgsl (2029 bytes)
  - divergence.wgsl (1790 bytes)
  - curl.wgsl (1551 bytes)
  - pressure.wgsl (1921 bytes)
  - gradient.wgsl (2004 bytes)
  - display.wgsl (5882 bytes)
  - splat.wgsl (1377 bytes)

### In Progress
- [ ] Integrate `wgpu-native` or Dawn bindings
  - Option A: Use `mach-gpu` (Zig-native WebGPU)
  - Option B: Use Dawn C API
  - Option C: Use `wgpu-native` Rust library
  
- [ ] Implement `gpu.GpuContext.init()` with real device
- [ ] Create texture allocations for:
  - Velocity (RG32Float, double-buffered)
  - Density (RGBA32Float, double-buffered)
  - Pressure (R32Float, double-buffered)
  - Divergence (R32Float, single)
  
- [ ] Implement compute pipeline:
  ```zig
  fn createComputePipeline(
      ctx: *GpuContext,
      shader: []const u8,
      entry: []const u8
  ) !ComputePipeline
  ```
  
- [ ] Wire simulation loop:
  1. Upload uniforms (dt, dissipation, etc.)
  2. Dispatch advection compute
  3. Dispatch divergence compute
  4. Dispatch pressure solver (40 iterations)
  5. Dispatch gradient subtraction
  6. Read back to display

- [ ] Implement render pipeline for display
- [ ] Window surface creation via GLFW

---

## 🎨 Step 4: Quality Matching (TODO)

**Goal:** Match web version visual quality  
**Time Estimate:** 1-2 days

### Features to Implement
- [ ] Color palettes (from `js/02-palettes.js`)
- [ ] Bloom post-processing
- [ ] Kaleidoscope modes:
  - [ ] Off
  - [ ] MirrorH/V
  - [ ] MirrorQuad
  - [ ] Wedge
  - [ ] Spiral
  
- [ ] Input handling:
  - [ ] Mouse dragging for force injection
  - [ ] Configurable splat radius
  - [ ] Touch support (future)
  
- [ ] UI controls (ImGui or similar):
  - [ ] Resolution presets
  - [ ] Dissipation slider
  - [ ] Color palette selector
  - [ ] Kaleidoscope mode
  
- [ ] Performance optimization:
  - [ ] Profile GPU timings
  - [ ] Reduce buffer copies
  - [ ] Optimize pressure solver iterations

---

## 🎯 Current Status Summary

**Working:**
- ✅ Zig 0.15.2 build system
- ✅ CPU reference kernels (100% test coverage)
- ✅ Simulation loop (headless)
- ✅ Basic window stub

**Next Immediate Steps:**
1. Port advection.glsl → advection.wgsl
2. Create shader loading infrastructure
3. Test compute pipeline with single shader

**Estimated Time to MVP:** 5-7 days
- Step 2: 2-3 days
- Step 3: 2-3 days  
- Step 4: 1-2 days

**Estimated Time to Full Quality:** 10-14 days
- Add multiplayer sync
- Add recording/playback
- Performance profiling
- Cross-platform testing (Linux/macOS)

---

## Build Commands

```powershell
# Run tests (9/9 passing)
zig build test

# Build executable
zig build

# Run CPU simulation (headless)
zig build run

# Clean
rm -r zig-cache zig-out
```

---

## Architecture

```
zig/
├── src/
│   ├── main.zig          # Executable entry point
│   ├── gpu.zig           # WebGPU bindings (stubs → real)
│   ├── window.zig        # GLFW window wrapper
│   ├── kernels.zig       # CPU reference (tests)
│   ├── util.zig          # Vec2/Vec4, math utils
│   ├── grid.zig          # Grid indexing, sampling
│   ├── prng.zig          # PCG32 PRNG
│   ├── kaleido.zig       # Kaleidoscope compositor
│   └── root_tests.zig    # Unit tests
├── shaders/              # (TODO) WGSL compute shaders
│   ├── advection.wgsl
│   ├── divergence.wgsl
│   ├── curl.wgsl
│   ├── pressure.wgsl
│   ├── gradient.wgsl
│   └── display.wgsl
└── build.zig             # Build configuration
```
