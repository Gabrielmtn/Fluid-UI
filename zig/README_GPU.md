# 🚀 GPU-Accelerated Fluid Simulation

## Current Status

### ✅ Completed (CPU Implementation)
- **Configuration System** - Web-matched parameters (0.996/0.999 dissipation, 95 iterations, curl 40)
- **Physics Kernels** - Advection, divergence, curl, vorticity, pressure, gradient
- **Gaussian Splat Input** - Smooth force/density injection
- **Color System** - HSV cycling, 4 default palettes
- **Real-time Window** - Win32 display with mouse control
- **Performance** - ~7 fps at 512x288 (CPU-limited)

### 🔄 Ready for GPU
- **WGSL Shaders** - All 7 compute shaders ported ✅
- **GPU Backend Interface** - Defined and stubbed ✅
- **Build System** - WebGPU dependency configured ✅
- **Next Step** - Replace stub with real wgpu-native

---

## Quick Start

### Build (CPU Version)
```bash
cd "Z:\New folder\Fluid-UI\zig"
zig build run
```

**Expected:** ~7 fps, smooth fluid motion, color cycling

### Build (GPU Version - Coming Soon)
```bash
# Will automatically use GPU if available
zig build run

# Force CPU fallback
zig build run -Duse-gpu=false
```

**Expected:** 60+ fps, same behavior, 8-10x faster

---

## Architecture

```
Application (main.zig)
    ├── Config (config.zig) - Parameters
    ├── Input (config.zig) - Mouse/color state
    ├── Window (win32_window.zig) - Display
    │
    ├── CPU Simulation (main.zig)
    │   ├── Kernels (kernels.zig) - Physics algorithms
    │   └── Grid (grid.zig) - Memory layout
    │
    └── GPU Simulation (gpu_sim.zig) - 🔄 In Progress
        ├── Backend (gpu_backend.zig) - WebGPU wrapper
        ├── Shaders (shaders/*.wgsl) - ✅ Ready
        └── Resources - Textures, pipelines, buffers
```

---

## GPU Integration Progress

### Phase 1: Backend Setup ⏱️ 2-3 hours
- [ ] Add wgpu-native bindings
- [ ] Initialize device/queue
- [ ] Test basic GPU access
- [ ] Handle errors gracefully

### Phase 2: Texture Management ⏱️ 1-2 hours
- [ ] Create velocity textures (RG32Float)
- [ ] Create density textures (RGBA32Float)
- [ ] Create pressure textures (R32Float)
- [ ] Set up bind groups

### Phase 3: Compute Pipelines ⏱️ 1-2 hours
- [ ] Compile WGSL shaders
- [ ] Create 7 compute pipelines
- [ ] Set up uniform buffers
- [ ] Test single dispatch

### Phase 4: Full Pipeline ⏱️ 2-3 hours
- [ ] Wire all 7 passes
- [ ] Implement texture swapping
- [ ] Add 95 pressure iterations
- [ ] Profile performance

### Phase 5: Display ⏱️ 1 hour
- [ ] Read density to CPU
- [ ] Render to window
- [ ] Measure FPS
- [ ] Celebrate 60+ fps! 🎉

**Total Estimated Time:** 8-10 hours

---

## Performance Targets

| Metric | CPU (Current) | GPU (Target) | GPU (Stretch) |
|--------|---------------|--------------|---------------|
| **Resolution** | 512x288 | 512x288 | 1024x576 |
| **FPS** | ~7 | 60+ | 60+ |
| **Pressure Iter** | 95 (slow) | 95 (fast) | 120 |
| **Speedup** | 1x | 8-10x | 50-100x |

---

## File Structure

```
zig/
├── build.zig              # Build configuration
├── build.zig.zon          # Dependencies (wgpu-zig)
├── README_GPU.md          # This file
├── GPU_INTEGRATION_PLAN.md # Detailed plan
├── QUICK_START_GPU.md     # Step-by-step guide
├── COMPLETE_PORT.md       # Feature parity status
│
├── src/
│   ├── main.zig           # Application entry
│   ├── config.zig         # ✅ Configuration system
│   ├── kernels.zig        # ✅ CPU physics
│   ├── gpu.zig            # GPU context wrapper
│   ├── gpu_backend.zig    # 🔄 WebGPU backend (stub → real)
│   ├── gpu_sim.zig        # 🔄 GPU simulation (stub → real)
│   ├── win32_window.zig   # ✅ Window management
│   ├── util.zig           # ✅ Math utilities
│   ├── grid.zig           # ✅ Grid operations
│   ├── prng.zig           # ✅ Random numbers
│   └── image.zig          # ✅ BMP export
│
└── shaders/               # ✅ All WGSL shaders ready
    ├── advection.wgsl     # Velocity/density transport
    ├── divergence.wgsl    # ∇·v computation
    ├── curl.wgsl          # Vorticity
    ├── pressure.wgsl      # Jacobi iteration
    ├── gradient.wgsl      # ∇p subtraction
    ├── splat.wgsl         # Force/density injection
    └── display.wgsl       # Kaleidoscope rendering
```

---

## Configuration

### Default (Balanced)
```zig
var config = try Config.init(allocator);
// Sim: 512x288, Dye: 1024x576
// Pressure: 95 iterations
// Target: 60 fps on GPU
```

### Mobile (Low-End)
```zig
var config = try Config.initMobile(allocator);
// Sim: 256x144, Dye: 512x288
// Pressure: 40 iterations
// Target: 30 fps on integrated GPU
```

### High Quality (High-End)
```zig
var config = try Config.initHighQuality(allocator);
// Sim: 1024x576, Dye: 2048x1152
// Pressure: 120 iterations
// Target: 60 fps on dedicated GPU
```

### Custom
```zig
var config = try Config.init(allocator);
config.sim_width = 768;
config.sim_height = 432;
config.pressure_iterations = 80;
config.curl = 50.0;  // More swirly!
config.validate();
```

---

## Dependencies

### Required
- **Zig 0.15.2+** - Compiler
- **Windows 10+** - OS (Win32 API)

### Optional (for GPU)
- **wgpu-zig** - WebGPU bindings (auto-downloaded)
- **wgpu-native** - Native WebGPU library (bundled with wgpu-zig)
- **Vulkan/DirectX 12** - GPU drivers (usually pre-installed)

### Build Dependencies
```zig
// build.zig.zon
.dependencies = .{
    .wgpu_zig = .{
        .url = "https://github.com/shreyassanthu77/wgpu-zig/archive/main.tar.gz",
        .hash = "...",  // Auto-filled
    },
}
```

---

## Testing

### CPU Simulation
```bash
zig build test
```

Tests:
- ✅ PRNG (PCG32)
- ✅ Advection (semi-Lagrangian)
- ✅ Divergence/Curl
- ✅ Pressure solver
- ✅ Gradient subtraction
- ✅ Kaleidoscope (Off, MirrorH/V)

### GPU Simulation (Coming Soon)
```bash
zig build test-gpu
```

Tests:
- [ ] Device initialization
- [ ] Texture creation
- [ ] Shader compilation
- [ ] Compute dispatch
- [ ] Data readback
- [ ] CPU vs GPU comparison

---

## Troubleshooting

### "GPU initialization failed"
**Cause:** No compatible GPU or drivers

**Solution:**
1. Update GPU drivers
2. Check Vulkan/DX12 support: `dxdiag`
3. Falls back to CPU automatically

### "Shader compilation error"
**Cause:** WGSL syntax issue

**Solution:**
1. Check shader file exists
2. Validate WGSL: https://tint.dev/
3. Check entry point name

### "Low FPS on GPU"
**Cause:** Bottleneck somewhere

**Solution:**
1. Profile passes (see GPU_INTEGRATION_PLAN.md)
2. Reduce resolution
3. Lower pressure iterations
4. Check GPU usage in Task Manager

### "Build error: wgpu_zig not found"
**Cause:** Dependency download failed

**Solution:**
```bash
# Clear cache and retry
rm -rf .zig-cache
zig build
```

---

## Performance Profiling

### CPU Profiling
```zig
const start = std.time.nanoTimestamp();
sim.step();
const end = std.time.nanoTimestamp();
const ms = @as(f64, @floatFromInt(end - start)) / 1_000_000.0;
std.log.info("CPU step: {d:.2}ms", .{ms});
```

### GPU Profiling (Coming Soon)
```zig
// Use timestamp queries
const query_set = device.createQuerySet(.{
    .type = .timestamp,
    .count = 16,
});

pass.writeTimestamp(query_set, 0);  // Before
// ... compute work ...
pass.writeTimestamp(query_set, 1);  // After

// Read back
const times = try query_set.resolve();
std.log.info("GPU pass: {d:.2}ms", .{times[1] - times[0]});
```

---

## Roadmap

### v0.1 (Current) - CPU Reference ✅
- [x] Configuration system
- [x] All physics kernels
- [x] Real-time window
- [x] Mouse input
- [x] Color cycling
- [x] ~7 fps at 512x288

### v0.2 (Next) - GPU Acceleration 🔄
- [ ] WebGPU backend
- [ ] Compute shaders
- [ ] 60+ fps at 512x288
- [ ] Graceful CPU fallback

### v0.3 (Future) - Polish
- [ ] Kaleidoscope display
- [ ] UI controls
- [ ] Palette switching
- [ ] Save/load presets
- [ ] 60 fps at 1024x576

### v1.0 (Release) - Feature Complete
- [ ] Recording/playback
- [ ] Export to video
- [ ] Multiple layers
- [ ] Full web parity

---

## Contributing

### Adding a New Shader
1. Create `shaders/my_shader.wgsl`
2. Add to `gpu_sim.zig`:
   ```zig
   const my_shader_code = @embedFile("../shaders/my_shader.wgsl");
   ```
3. Create pipeline in `createPipelines()`
4. Dispatch in `step()`

### Optimizing Performance
1. Profile with timestamp queries
2. Identify bottleneck pass
3. Optimize shader (reduce operations)
4. Or reduce resolution
5. Measure improvement

### Testing Changes
```bash
# CPU tests
zig build test

# Visual test
zig build run

# GPU tests (when ready)
zig build test-gpu
```

---

## Resources

### Documentation
- **WebGPU Spec:** https://www.w3.org/TR/webgpu/
- **WGSL Spec:** https://www.w3.org/TR/WGSL/
- **wgpu-native:** https://github.com/gfx-rs/wgpu-native
- **wgpu-zig:** https://github.com/shreyassanthu77/wgpu-zig

### Learning
- **WebGPU Fundamentals:** https://webgpufundamentals.org/
- **Learn WGSL:** https://google.github.io/tour-of-wgsl/
- **Fluid Simulation:** https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu

### Tools
- **WGSL Validator:** https://tint.dev/
- **GPU Debugger:** RenderDoc, Nsight Graphics
- **Profiler:** Tracy, Superluminal

---

## License

MIT License - See LICENSE file

---

## Status Summary

**Current:** CPU implementation complete, ~7 fps  
**Next:** GPU integration, target 60+ fps  
**Timeline:** 8-10 hours to working GPU  
**Confidence:** High (shaders ready, backend defined)

**Let's make it fast! 🚀**
