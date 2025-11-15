# 📋 TODO: What's Left

## Current Status: CPU Implementation Complete ✅

Your fluid simulation is **fully functional** on CPU with complete web version parity. Performance is ~7 fps (CPU-limited). Everything is ready for GPU acceleration.

---

## 🎯 Primary Goal: GPU Acceleration (60+ FPS)

### Phase 1: WebGPU Backend Setup ⏱️ 2-3 hours
**Status:** 🔄 Ready to start  
**Priority:** HIGH

**Tasks:**
- [ ] Choose GPU binding approach:
  - **Option A:** Use `wgpu-zig` (recommended, easier)
  - **Option B:** Custom minimal bindings (more control)
- [ ] Add dependency to build system
- [ ] Initialize GPU device and queue
- [ ] Test basic GPU access
- [ ] Handle errors gracefully (fallback to CPU)

**Files to modify:**
- `build.zig` - Add wgpu dependency
- `src/gpu_backend.zig` - Replace stub with real implementation

**Success criteria:**
```zig
var backend = try Backend.init(allocator);
const device = backend.getDevice();
std.log.info("✅ GPU ready: {s}", .{device.getName()});
```

---

### Phase 2: GPU Texture Management ⏱️ 1-2 hours
**Status:** ⏳ Blocked by Phase 1  
**Priority:** HIGH

**Tasks:**
- [ ] Create velocity textures (RG32Float, 512x288)
- [ ] Create density textures (RGBA32Float, 1024x576)
- [ ] Create pressure textures (R32Float, 512x288)
- [ ] Create intermediate textures (divergence, curl)
- [ ] Set up bind groups for each pass
- [ ] Implement texture swapping logic

**Files to modify:**
- `src/gpu_sim.zig` - `createResources()` method

**Success criteria:**
```zig
const texture = try device.createTexture(.{
    .width = 512, .height = 288,
    .format = .rg32float,
});
std.log.info("✅ Texture created: {}x{}", .{512, 288});
```

---

### Phase 3: Compute Pipeline Creation ⏱️ 1-2 hours
**Status:** ⏳ Blocked by Phase 2  
**Priority:** HIGH

**Tasks:**
- [ ] Compile WGSL shaders to shader modules
- [ ] Create compute pipelines for all 7 passes:
  - [ ] Advection (velocity & density)
  - [ ] Divergence
  - [ ] Curl
  - [ ] Pressure (Jacobi iteration)
  - [ ] Gradient subtraction
  - [ ] Splat (force & density injection)
  - [ ] Display (kaleidoscope - optional)
- [ ] Create uniform buffers for parameters
- [ ] Wire config values to uniforms

**Files to modify:**
- `src/gpu_sim.zig` - `createPipelines()` method

**Success criteria:**
```zig
const pipeline = try device.createComputePipeline(.{
    .compute = .{
        .module = shader_module,
        .entry_point = "advection",
    },
});
std.log.info("✅ Pipeline created: advection", .{});
```

---

### Phase 4: Command Encoding & Dispatch ⏱️ 2-3 hours
**Status:** ⏳ Blocked by Phase 3  
**Priority:** HIGH

**Tasks:**
- [ ] Implement `GpuSimulation.step()` method
- [ ] Encode all compute passes in correct order:
  1. Advect velocity
  2. Compute curl
  3. Apply vorticity confinement
  4. Compute divergence
  5. Solve pressure (95 iterations)
  6. Subtract gradient
  7. Advect density
- [ ] Implement texture ping-pong swapping
- [ ] Submit command buffers to queue
- [ ] Add GPU synchronization

**Files to modify:**
- `src/gpu_sim.zig` - `step()` method
- `src/main.zig` - Call GPU step instead of CPU

**Success criteria:**
```zig
gpu_sim.step();  // Executes all passes on GPU
std.log.info("✅ GPU step completed", .{});
```

---

### Phase 5: Display Integration ⏱️ 1 hour
**Status:** ⏳ Blocked by Phase 4  
**Priority:** HIGH

**Tasks:**
- [ ] Implement GPU → CPU readback for density
- [ ] Create staging buffer
- [ ] Copy texture to staging buffer
- [ ] Map and read pixel data
- [ ] Render to Win32 window
- [ ] Measure FPS

**Files to modify:**
- `src/gpu_sim.zig` - `readDensityToCPU()` method
- `src/main.zig` - Update render loop

**Success criteria:**
```zig
const density = try gpu_sim.readDensityToCPU();
renderToWindow(win, density, sim_width, sim_height);
// FPS: 60+ 🎉
```

---

### Phase 6: Performance Optimization ⏱️ 1-2 hours
**Status:** ⏳ Blocked by Phase 5  
**Priority:** MEDIUM

**Tasks:**
- [ ] Profile GPU passes with timestamp queries
- [ ] Identify bottlenecks
- [ ] Optimize slow passes
- [ ] Implement async readback (double buffering)
- [ ] Tune workgroup sizes
- [ ] Test at higher resolutions (1024x576)
- [ ] Adaptive quality based on FPS

**Files to modify:**
- `src/gpu_sim.zig` - Add profiling
- `src/config.zig` - Add performance presets

**Success criteria:**
- 60 fps at 512x288 ✅
- 60 fps at 1024x576 (stretch goal)

---

## 🎨 Secondary Goals: Polish & Features

### Kaleidoscope Display Shader ⏱️ 2-3 hours
**Status:** ⏳ Blocked by GPU integration  
**Priority:** MEDIUM

**Tasks:**
- [ ] Wire `display.wgsl` shader (already ported)
- [ ] Create render pipeline (not compute)
- [ ] Set up fragment shader
- [ ] Implement kaleidoscope modes:
  - [ ] Off (passthrough)
  - [ ] Wedge
  - [ ] Mirror Horizontal
  - [ ] Mirror Vertical
  - [ ] Quad
  - [ ] Spiral
- [ ] Add UI controls for mode switching

**Files to modify:**
- `src/gpu_sim.zig` - Add render pipeline
- `src/config.zig` - Add kaleidoscope config
- `src/main.zig` - Add keyboard shortcuts

---

### UI Controls ⏱️ 3-4 hours
**Status:** 🔄 Can start anytime  
**Priority:** LOW

**Tasks:**
- [ ] Add keyboard shortcuts:
  - [ ] Space - Pause/resume
  - [ ] R - Reset simulation
  - [ ] C - Clear screen
  - [ ] P - Cycle palettes
  - [ ] K - Cycle kaleidoscope modes
  - [ ] +/- - Adjust brush size
  - [ ] 1-9 - Adjust parameters
- [ ] Add on-screen parameter display
- [ ] Add FPS counter overlay
- [ ] Add help text (H key)

**Files to modify:**
- `src/main.zig` - Keyboard handling
- `src/win32_window.zig` - Key events

---

### Preset System ⏱️ 1-2 hours
**Status:** 🔄 Can start anytime  
**Priority:** LOW

**Tasks:**
- [ ] Save presets to JSON file
- [ ] Load presets from file
- [ ] Add preset selector UI
- [ ] Create more presets:
  - [ ] "Ethereal" - Low dissipation, high curl
  - [ ] "Explosive" - High force, low dissipation
  - [ ] "Calm" - High dissipation, low curl
  - [ ] "Psychedelic" - Fast color cycling

**Files to modify:**
- `src/config.zig` - Add save/load methods
- `src/main.zig` - Add preset switching

---

### Recording & Export ⏱️ 4-5 hours
**Status:** ⏳ Future feature  
**Priority:** LOW

**Tasks:**
- [ ] Record simulation frames to memory
- [ ] Export to image sequence
- [ ] Export to video (FFmpeg integration)
- [ ] Add recording UI controls
- [ ] Implement playback mode

**Files to create:**
- `src/recorder.zig` - Recording system
- `src/video_export.zig` - Video encoding

---

## 📊 Progress Summary

### Completed ✅
- [x] Configuration system (web parity)
- [x] All CPU physics kernels
- [x] Vorticity confinement
- [x] Gaussian splat input
- [x] Color cycling system
- [x] Real-time Win32 window
- [x] Mouse control
- [x] All WGSL shaders ported
- [x] GPU backend interface defined
- [x] Build system configured
- [x] Comprehensive documentation

### In Progress 🔄
- [ ] GPU backend implementation (Phase 1-5)

### Planned ⏳
- [ ] Kaleidoscope display
- [ ] UI controls
- [ ] Preset system
- [ ] Recording/export

---

## 🎯 Recommended Next Steps

### This Week: GPU Acceleration
**Goal:** 60+ FPS

1. **Day 1 (2-3 hours):** Phase 1 - Backend Setup
   - Add wgpu-zig dependency
   - Initialize GPU device
   - Test basic access

2. **Day 2 (4-6 hours):** Phase 2-4 - Core Implementation
   - Create textures
   - Build pipelines
   - Wire compute passes

3. **Day 3 (2-3 hours):** Phase 5-6 - Display & Optimize
   - Implement readback
   - Measure performance
   - Celebrate 60 FPS! 🎉

### Next Week: Polish
**Goal:** Feature complete

1. **Kaleidoscope effects** (2-3 hours)
2. **UI controls** (3-4 hours)
3. **Preset system** (1-2 hours)

### Future: Advanced Features
**Goal:** Production ready

1. Recording/export
2. Multiple simulation layers
3. Network multiplayer
4. Mobile/web builds

---

## 📈 Performance Targets

| Milestone | Resolution | FPS | Status |
|-----------|------------|-----|--------|
| CPU Baseline | 512x288 | ~7 | ✅ Done |
| GPU Basic | 512x288 | 30+ | ⏳ Next |
| GPU Target | 512x288 | 60+ | ⏳ Next |
| GPU High-Res | 1024x576 | 60+ | ⏳ Future |
| GPU Ultra | 2048x1152 | 30+ | ⏳ Future |

---

## 🔥 Critical Path (Must Do)

1. **GPU Backend** - Without this, stuck at 7 fps
2. **Texture Management** - Core GPU infrastructure
3. **Compute Pipelines** - Execute physics on GPU
4. **Display Integration** - See the results

**Everything else is optional polish!**

---

## 💡 Quick Wins (Easy Improvements)

These can be done anytime, independent of GPU work:

- [ ] Add FPS counter (30 min)
- [ ] Add pause/resume (15 min)
- [ ] Add clear screen (10 min)
- [ ] Add keyboard shortcuts (1 hour)
- [ ] Add more color palettes (30 min)
- [ ] Add preset switching (1 hour)

---

## 🚀 The Big Picture

**Where you are:**
- Fully working CPU simulation ✅
- All infrastructure ready ✅
- Clear path forward ✅

**Where you're going:**
- 60+ FPS GPU simulation (8-10 hours)
- Kaleidoscope effects (2-3 hours)
- Full feature parity with web version

**Total time to production:** ~2 weeks of focused work

---

## 📞 Need Help?

**Documentation:**
- `GPU_INTEGRATION_PLAN.md` - Detailed implementation plan
- `QUICK_START_GPU.md` - Step-by-step guide
- `README_GPU.md` - Complete reference

**Code Examples:**
- All in the documentation above
- Phase-by-phase implementation
- Error handling patterns

**Next Action:**
```bash
# Read the quick start guide
cat QUICK_START_GPU.md

# Start Phase 1
# ... follow the guide ...

# Enjoy 60 FPS!
```

---

## ✅ Bottom Line

**What's left:** Mainly GPU implementation (8-10 hours)

**What's ready:** Everything else (CPU works, shaders ready, docs complete)

**What to do:** Pick a day, follow `QUICK_START_GPU.md`, implement GPU backend

**Result:** 60+ FPS fluid simulation! 🚀
