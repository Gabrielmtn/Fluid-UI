# 🚀 GPU Integration Plan - Path to 60+ FPS

## Current Status

✅ **Complete:**
- Configuration system with web-matched parameters
- All physics kernels (CPU reference)
- WGSL shaders ported (7 compute shaders)
- GPU backend interface defined
- Simulation pipeline working on CPU (~7 fps)

🔄 **Ready to Implement:**
- Real WebGPU backend (replace stub)
- GPU texture management
- Compute pipeline dispatch
- CPU ↔ GPU data transfer

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Application                          │
│  (main.zig - Window, Input, Config)                     │
└────────────────┬────────────────────────────────────────┘
                 │
                 ├─────────────────┬──────────────────────┐
                 │                 │                      │
         ┌───────▼──────┐  ┌──────▼──────┐      ┌───────▼──────┐
         │  CPU Sim     │  │  GPU Sim    │      │   Display    │
         │ (fallback)   │  │ (primary)   │      │  (Win32)     │
         └──────────────┘  └──────┬──────┘      └──────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
            ┌───────▼────────┐        ┌────────▼────────┐
            │  GPU Backend   │        │  WGSL Shaders   │
            │ (wgpu-native)  │        │  (compute)      │
            └────────────────┘        └─────────────────┘
```

---

## Implementation Phases

### Phase 1: WebGPU Backend Setup ⏱️ 2-3 hours

**Goal:** Replace stub backend with real wgpu-native

**Tasks:**
1. ✅ Download wgpu-native binaries
2. ✅ Create Zig bindings
3. ✅ Initialize device/queue
4. ✅ Create texture allocations
5. ✅ Verify basic GPU access

**Files:**
- `src/gpu_backend.zig` - Replace stub with real implementation
- `build.zig` - Link wgpu-native library
- `lib/wgpu/` - Native binaries

**Validation:**
```zig
var backend = try Backend.init(allocator);
const device = try backend.requestDevice();
std.log.info("GPU: {s}", .{device.getName()});
```

### Phase 2: Texture & Buffer Management ⏱️ 1-2 hours

**Goal:** Create GPU textures for simulation state

**Textures Needed:**
```zig
// Velocity (RG32Float, simulation resolution)
velocity_read: Texture   // 512x288
velocity_write: Texture  // 512x288

// Density (RGBA32Float, dye resolution)  
density_read: Texture    // 1024x576
density_write: Texture   // 1024x576

// Pressure (R32Float, simulation resolution)
pressure_read: Texture   // 512x288
pressure_write: Texture  // 512x288

// Intermediate (R32Float, simulation resolution)
divergence: Texture      // 512x288
curl: Texture            // 512x288
```

**Bind Groups:**
```wgsl
// Advection
@group(0) @binding(0) var velocity_in: texture_2d<f32>;
@group(0) @binding(1) var velocity_out: texture_storage_2d<rg32float, write>;
@group(0) @binding(2) var<uniform> params: AdvectionParams;

// Similar for other passes
```

**Files:**
- `src/gpu_sim.zig` - Update `createResources()`
- `src/gpu_backend.zig` - Implement `Texture.create()`

### Phase 3: Compute Pipeline Creation ⏱️ 1-2 hours

**Goal:** Compile WGSL shaders and create pipelines

**Pipelines:**
1. **Advection** - `advection.wgsl` → advect velocity/density
2. **Divergence** - `divergence.wgsl` → compute ∇·v
3. **Curl** - `curl.wgsl` → compute vorticity
4. **Pressure** - `pressure.wgsl` → Jacobi iteration
5. **Gradient** - `gradient.wgsl` → subtract ∇p
6. **Splat** - `splat.wgsl` → inject force/density
7. **Display** - `display.wgsl` → render to screen

**Implementation:**
```zig
const shader_module = device.createShaderModule(.{
    .code = @embedFile("../shaders/advection.wgsl"),
});

const pipeline = device.createComputePipeline(.{
    .compute = .{
        .module = shader_module,
        .entry_point = "advection",
    },
});
```

**Files:**
- `src/gpu_sim.zig` - Update `createPipelines()`
- `shaders/*.wgsl` - Already ported ✅

### Phase 4: Uniform Buffers ⏱️ 1 hour

**Goal:** Pass config parameters to shaders

**Uniforms Needed:**
```zig
// Advection params
struct AdvectionParams {
    texel_size: vec2<f32>,      // 1.0 / resolution
    dt: f32,
    dissipation: f32,           // From config
    stillness_fade: f32,
}

// Pressure params
struct PressureParams {
    texel_size: vec2<f32>,
    alpha: f32,                 // -1.0
    inv_beta: f32,              // 0.25
}

// Splat params
struct SplatParams {
    point: vec2<f32>,           // Normalized [0,1]
    radius: f32,                // From config.splat_radius
    color: vec4<f32>,
    force: vec2<f32>,
}
```

**Implementation:**
```zig
const params = AdvectionParams{
    .texel_size = .{ 1.0 / @as(f32, sim_width), 1.0 / @as(f32, sim_height) },
    .dt = 0.016,
    .dissipation = config.velocity_dissipation,
    .stillness_fade = 0.0,
};

const uniform_buffer = device.createBuffer(.{
    .size = @sizeOf(AdvectionParams),
    .usage = .{ .uniform = true, .copy_dst = true },
});

queue.writeBuffer(uniform_buffer, 0, &params);
```

**Files:**
- `src/gpu_sim.zig` - Add uniform buffer creation
- `shaders/*.wgsl` - Already have uniform declarations ✅

### Phase 5: Command Encoding & Dispatch ⏱️ 2 hours

**Goal:** Execute compute passes on GPU

**Simulation Step:**
```zig
pub fn step(self: *GpuSimulation, config: *const Config, input: *const InputState) !void {
    const encoder = self.device.createCommandEncoder();
    
    // 1. Advect velocity
    {
        const pass = encoder.beginComputePass();
        pass.setPipeline(self.advection_pipeline);
        pass.setBindGroup(0, self.velocity_bind_group);
        pass.dispatchWorkgroups(
            (self.sim_width + 7) / 8,
            (self.sim_height + 7) / 8,
            1
        );
        pass.end();
    }
    
    // 2. Compute curl
    {
        const pass = encoder.beginComputePass();
        pass.setPipeline(self.curl_pipeline);
        pass.setBindGroup(0, self.curl_bind_group);
        pass.dispatchWorkgroups(...);
        pass.end();
    }
    
    // 3. Apply vorticity confinement
    // ... (similar pattern)
    
    // 4. Compute divergence
    // 5. Solve pressure (95 iterations)
    // 6. Subtract gradient
    // 7. Advect density
    
    const commands = encoder.finish();
    self.queue.submit(&[_]CommandBuffer{commands});
}
```

**Workgroup Size:**
```wgsl
@compute @workgroup_size(8, 8, 1)
fn advection(@builtin(global_invocation_id) id: vec3<u32>) {
    // Process pixel at (id.x, id.y)
}
```

**Files:**
- `src/gpu_sim.zig` - Implement `step()` method
- `src/main.zig` - Call `gpu_simulation.step()` instead of `sim.step()`

### Phase 6: Display Integration ⏱️ 1-2 hours

**Goal:** Render GPU texture to window

**Options:**

**Option A: GPU → CPU → Window (Simple)**
```zig
// Read texture back to CPU
const staging_buffer = device.createBuffer(.{
    .size = density_size,
    .usage = .{ .copy_dst = true, .map_read = true },
});

encoder.copyTextureToBuffer(density_read, staging_buffer);
queue.submit();

// Map and read
const data = staging_buffer.mapRead();
renderToWindow(win, data, sim_width, sim_height);
```

**Option B: GPU → GPU (Fast, requires surface)**
```zig
// Create swapchain
const surface = instance.createSurface(win.hwnd);
const swapchain = device.createSwapChain(surface, .{
    .format = .bgra8unorm,
    .width = window_width,
    .height = window_height,
});

// Render pass
const texture_view = swapchain.getCurrentTextureView();
const pass = encoder.beginRenderPass(.{
    .color_attachments = &[_]RenderPassColorAttachment{
        .{ .view = texture_view, .load_op = .clear },
    },
});
pass.setPipeline(display_pipeline);  // Fragment shader
pass.draw(6, 1, 0, 0);  // Fullscreen quad
pass.end();

swapchain.present();
```

**Recommendation:** Start with Option A (simpler), upgrade to Option B later.

**Files:**
- `src/gpu_sim.zig` - Add `readDensityToCPU()`
- `src/main.zig` - Update render loop

### Phase 7: Performance Optimization ⏱️ 1-2 hours

**Goal:** Achieve 60+ fps

**Optimizations:**

1. **Async Readback** (if using CPU display)
```zig
// Use double buffering
var staging_buffers: [2]Buffer = undefined;
var current_frame: usize = 0;

// Read previous frame while computing current
const prev_data = staging_buffers[(current_frame + 1) % 2].mapRead();
renderToWindow(win, prev_data);

// Start readback for current frame
encoder.copyTextureToBuffer(density_read, staging_buffers[current_frame]);
current_frame = (current_frame + 1) % 2;
```

2. **Reduce Pressure Iterations** (if needed)
```zig
// Adaptive quality
if (fps < 30) {
    config.pressure_iterations = 60;  // Lower quality, faster
} else {
    config.pressure_iterations = 95;  // Full quality
}
```

3. **Increase Resolution** (GPU can handle it!)
```zig
config.sim_width = 1024;   // 2x increase
config.sim_height = 576;
config.dye_width = 2048;   // 2x increase
config.dye_height = 1152;
```

4. **Profile Passes**
```zig
// Add timestamp queries
const query_set = device.createQuerySet(.{
    .type = .timestamp,
    .count = 16,
});

pass.writeTimestamp(query_set, 0);  // Before
// ... compute work ...
pass.writeTimestamp(query_set, 1);  // After

// Read back and log
std.log.info("Advection: {d:.2}ms", .{delta_ms});
```

---

## Expected Performance

### Before (CPU)
- Resolution: 512x288
- FPS: ~7
- Pressure: 95 iterations (slow)
- Bottleneck: CPU single-threaded

### After (GPU) - Conservative
- Resolution: 512x288
- FPS: **60+** (8-10x speedup)
- Pressure: 95 iterations (fast)
- Bottleneck: None

### After (GPU) - Optimistic
- Resolution: 1024x576 (4x pixels)
- FPS: **60+** (50-100x speedup)
- Pressure: 120 iterations
- Bottleneck: None

---

## Risk Mitigation

### Fallback Strategy
```zig
pub fn main() !void {
    // Try GPU first
    const use_gpu = gpu_available: {
        var gpu_sim = GpuSimulation.init(allocator, &ctx, sim_width, sim_height) catch {
            std.log.warn("GPU initialization failed, falling back to CPU", .{});
            break :gpu_available false;
        };
        break :gpu_available true;
    };
    
    if (use_gpu) {
        // GPU path (fast)
        while (!win.shouldClose()) {
            gpu_simulation.step(&config, &input);
            // ... render ...
        }
    } else {
        // CPU path (fallback)
        while (!win.shouldClose()) {
            sim.step();
            // ... render ...
        }
    }
}
```

### Debug Mode
```zig
const debug_gpu = @import("builtin").mode == .Debug;

if (debug_gpu) {
    // Enable validation layers
    const backend_type = .{ .validation = true };
    
    // Check for errors after each pass
    device.pushErrorScope(.validation);
    // ... GPU work ...
    const error_msg = device.popErrorScope();
    if (error_msg) |msg| {
        std.log.err("GPU error: {s}", .{msg});
    }
}
```

---

## Testing Strategy

### Unit Tests
```zig
test "GPU texture creation" {
    var backend = try Backend.init(testing.allocator);
    defer backend.deinit();
    
    const texture = try backend.createTexture(.{
        .width = 512,
        .height = 288,
        .format = .rg32float,
    });
    defer texture.destroy();
    
    try testing.expect(texture.width == 512);
}

test "Compute pipeline dispatch" {
    // Create minimal pipeline
    // Dispatch single workgroup
    // Verify output
}
```

### Integration Tests
```zig
test "Full simulation step" {
    var gpu_sim = try GpuSimulation.init(testing.allocator, &ctx, 64, 64);
    defer gpu_sim.deinit();
    
    // Inject force
    try gpu_sim.splat(0.5, 0.5, 1.0, 0.0, color, 0.1);
    
    // Step simulation
    try gpu_sim.step(&config, &input);
    
    // Read back and verify
    const density = try gpu_sim.readDensityToCPU();
    try testing.expect(density[center_idx].r > 0.0);
}
```

### Visual Tests
```zig
// Compare CPU vs GPU output
const cpu_result = sim.density_read;
const gpu_result = try gpu_sim.readDensityToCPU();

var max_diff: f32 = 0.0;
for (cpu_result, gpu_result) |c, g| {
    max_diff = @max(max_diff, @abs(c.r - g.r));
}

std.log.info("Max difference: {d:.6}", .{max_diff});
// Should be < 0.001 (floating point precision)
```

---

## Timeline

### Week 1: Core GPU Backend
- **Day 1-2:** wgpu-native setup, device initialization
- **Day 3:** Texture creation, bind groups
- **Day 4:** Compute pipeline compilation
- **Day 5:** First compute pass working

### Week 2: Full Integration
- **Day 1-2:** All 7 compute passes implemented
- **Day 3:** Display integration (GPU → CPU)
- **Day 4:** Performance tuning
- **Day 5:** Testing and validation

### Week 3: Polish
- **Day 1:** GPU → GPU rendering (swapchain)
- **Day 2:** Kaleidoscope shader integration
- **Day 3:** UI controls
- **Day 4:** Documentation
- **Day 5:** Release!

---

## Success Criteria

✅ **Minimum Viable Product:**
- GPU simulation runs at 30+ fps
- Visual output matches CPU version
- No crashes or validation errors
- Fallback to CPU if GPU unavailable

✅ **Target:**
- GPU simulation runs at 60 fps
- Resolution: 1024x576 or higher
- All 95 pressure iterations in real-time
- Smooth, responsive input

✅ **Stretch Goals:**
- 120+ fps at 1024x576
- 60 fps at 2048x1152
- Kaleidoscope effects working
- Multi-GPU support

---

## Next Immediate Steps

1. **Download wgpu-native** (10 min)
   ```powershell
   # Get latest release
   $url = "https://github.com/gfx-rs/wgpu-native/releases/download/v22.1.0.5/wgpu-windows-x86_64-release.zip"
   Invoke-WebRequest -Uri $url -OutFile wgpu.zip
   Expand-Archive wgpu.zip -DestinationPath lib/wgpu
   ```

2. **Create Zig bindings** (30 min)
   - Translate `wgpu.h` to Zig
   - Or use `zig translate-c`

3. **Update build.zig** (15 min)
   ```zig
   exe.addLibraryPath(.{ .path = "lib/wgpu" });
   exe.linkSystemLibrary("wgpu_native");
   ```

4. **Test device creation** (15 min)
   ```zig
   const device = try backend.requestDevice();
   std.log.info("GPU ready: {s}", .{device.getName()});
   ```

**Total time to first GPU output: ~4-6 hours**

---

## Resources

- **wgpu-native:** https://github.com/gfx-rs/wgpu-native
- **WebGPU Spec:** https://www.w3.org/TR/webgpu/
- **WGSL Spec:** https://www.w3.org/TR/WGSL/
- **Zig WebGPU:** https://github.com/hexops/mach-gpu

Ready to start implementation! 🚀
