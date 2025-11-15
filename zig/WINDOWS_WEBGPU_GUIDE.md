# WebGPU Integration Guide for Windows

## Current Status ✅

**What's Working:**
- ✅ Complete Zig codebase compiles on Windows (Zig 0.15.2)
- ✅ All 9 unit tests passing
- ✅ CPU reference simulation running smoothly
- ✅ All 7 WGSL shaders loading successfully (16KB total)
- ✅ GPU pipeline infrastructure ready
- ✅ Shader manager loading shaders from disk
- ✅ Clean architecture for GPU integration

**Current Output:**
```
═══════════════════════════════════════
  Fluid Simulation - WebGPU Backend
  Step 3: GPU Pipeline Integration
═══════════════════════════════════════

🚀 Initializing GPU simulation...
Loading shaders...
  ✓ advection.wgsl (2029 bytes)
  ✓ divergence.wgsl (1790 bytes)
  ✓ curl.wgsl (1551 bytes)
  ✓ pressure.wgsl (1921 bytes)
  ✓ gradient.wgsl (2004 bytes)
  ✓ display.wgsl (5882 bytes)
  ✓ splat.wgsl (1377 bytes)

Creating GPU resources...
Creating compute pipelines...

💻 Creating CPU reference simulation...

Frame   0: CPU vel=(6.227,3.113) den=(0.838,0.419,0.168)
[...]
```

---

## WebGPU Integration Options for Windows

### Option 1: wgpu-native (Recommended for Zig)
**Pros:**
- Written in Rust, well-maintained by gfx-rs team
- Works on Windows via D3D12 backend
- C API available for Zig FFI
- Pre-built binaries available

**Setup:**
1. Download [wgpu-native](https://github.com/gfx-rs/wgpu-native) release
2. Extract `wgpu.dll` and `wgpu.h`
3. Add to `build.zig`:
```zig
exe.linkSystemLibrary("wgpu");
exe.addIncludePath(.{ .cwd_relative = "vendor/wgpu" });
```

4. Create Zig bindings:
```zig
const c = @cImport({
    @cInclude("wgpu.h");
});

pub const Instance = c.WGPUInstance;
pub const Device = c.WGPUDevice;
// ... etc
```

**Estimated Time:** 2-3 hours for basic integration

---

### Option 2: Dawn (Google's Official Implementation)
**Pros:**
- Official WebGPU implementation from Google
- Used in Chrome browser
- Native D3D12 backend for Windows
- Comprehensive C++ API with C headers

**Setup:**
1. Clone [Dawn repository](https://dawn.googlesource.com/dawn)
2. Build for Windows:
```batch
cd dawn
python tools/fetch_dawn_dependencies.py
mkdir build && cd build
cmake .. -G "Visual Studio 17 2022"
cmake --build . --config Release
```

3. Link in `build.zig`:
```zig
exe.linkSystemLibrary("dawn_native");
exe.linkSystemLibrary("dawn_proc");
exe.addIncludePath(.{ .cwd_relative = "vendor/dawn/include" });
```

**Estimated Time:** 4-6 hours (includes Dawn build time)

---

### Option 3: Direct3D 12 Compute (Windows-only fallback)
**Pros:**
- Native Windows API
- No external dependencies
- Maximum performance on Windows

**Cons:**
- Not cross-platform
- More boilerplate than WebGPU
- Need to rewrite shader bindings

**Setup:**
Would require porting WGSL → HLSL and using D3D12 Compute directly.

**Not recommended** - defeats purpose of WebGPU abstraction.

---

## Recommended Path Forward

### Phase 1: Quick Integration (1-2 days)
Use **wgpu-native** with C FFI bindings:

**Step 1.1:** Download wgpu-native
```powershell
# Download from GitHub releases
Invoke-WebRequest -Uri "https://github.com/gfx-rs/wgpu-native/releases/download/v22.1.0.5/wgpu-windows-x86_64-release.zip" -OutFile "wgpu.zip"
Expand-Archive wgpu.zip -DestinationPath zig/vendor/wgpu
```

**Step 1.2:** Create `src/wgpu_bindings.zig`:
```zig
const c = @cImport({
    @cInclude("wgpu.h");
});

pub const Instance = c.WGPUInstance;
pub const Adapter = c.WGPUAdapter;
pub const Device = c.WGPUDevice;
pub const Queue = c.WGPUQueue;
pub const Texture = c.WGPUTexture;
pub const ShaderModule = c.WGPUShaderModule;
pub const ComputePipeline = c.WGPUComputePipeline;

pub fn createInstance() !*Instance {
    const descriptor = c.WGPUInstanceDescriptor{
        .nextInChain = null,
    };
    return c.wgpuCreateInstance(&descriptor) orelse error.InstanceCreationFailed;
}

pub fn requestAdapter(instance: *Instance) !*Adapter {
    // Implement adapter request
}

// ... etc
```

**Step 1.3:** Update `src/gpu.zig` to use real bindings:
```zig
const wgpu = @import("wgpu_bindings.zig");

pub const Instance = wgpu.Instance;
pub const Device = wgpu.Device;
// ... re-export types

pub const GpuContext = struct {
    instance: *Instance,
    device: *Device,
    queue: *Queue,
    
    pub fn init(allocator: std.mem.Allocator) !GpuContext {
        const instance = try wgpu.createInstance();
        const adapter = try wgpu.requestAdapter(instance);
        const device = try wgpu.requestDevice(adapter);
        const queue = wgpu.getQueue(device);
        
        return GpuContext{
            .instance = instance,
            .device = device,
            .queue = queue,
        };
    }
};
```

**Step 1.4:** Create first GPU texture:
```zig
pub fn createTexture(device: *Device, width: u32, height: u32) !*Texture {
    const descriptor = c.WGPUTextureDescriptor{
        .size = .{ .width = width, .height = height, .depthOrArrayLayers = 1 },
        .format = c.WGPUTextureFormat_RGBA32Float,
        .usage = c.WGPUTextureUsage_StorageBinding | c.WGPUTextureUsage_TextureBinding,
        .dimension = c.WGPUTextureDimension_2D,
        .mipLevelCount = 1,
        .sampleCount = 1,
    };
    
    return c.wgpuDeviceCreateTexture(device, &descriptor) orelse error.TextureCreationFailed;
}
```

**Step 1.5:** Compile WGSL shader:
```zig
pub fn createShaderModule(device: *Device, source: []const u8) !*ShaderModule {
    const wgsl_descriptor = c.WGPUShaderModuleWGSLDescriptor{
        .chain = .{ .next = null, .sType = c.WGPUSType_ShaderModuleWGSLDescriptor },
        .code = source.ptr,
    };
    
    const descriptor = c.WGPUShaderModuleDescriptor{
        .nextInChain = &wgsl_descriptor.chain,
        .label = "Fluid Shader",
    };
    
    return c.wgpuDeviceCreateShaderModule(device, &descriptor) orelse error.ShaderCompilationFailed;
}
```

**Verification Test:**
After Step 1.5, you should see:
```
🔧 Initializing WebGPU...
  ✓ Instance created
  ✓ Adapter acquired (D3D12)
  ✓ Device created
  ✓ Queue obtained

Creating GPU resources...
  ✓ Velocity texture: 256x144 RG32Float
  ✓ Density texture: 256x144 RGBA32Float
  ✓ Pressure texture: 256x144 R32Float

Compiling shaders...
  ✓ advection.wgsl compiled
  ✓ divergence.wgsl compiled
  [...]
```

---

### Phase 2: Full GPU Compute (2-3 days)

**Step 2.1:** Create compute pipeline:
```zig
pub fn createComputePipeline(
    device: *Device,
    shader: *ShaderModule,
    entry_point: [*:0]const u8,
    bind_group_layout: *BindGroupLayout,
) !*ComputePipeline {
    const pipeline_layout_descriptor = c.WGPUPipelineLayoutDescriptor{
        .bindGroupLayoutCount = 1,
        .bindGroupLayouts = &bind_group_layout,
    };
    const pipeline_layout = c.wgpuDeviceCreatePipelineLayout(device, &pipeline_layout_descriptor);
    
    const pipeline_descriptor = c.WGPUComputePipelineDescriptor{
        .layout = pipeline_layout,
        .compute = .{
            .module = shader,
            .entryPoint = entry_point,
        },
    };
    
    return c.wgpuDeviceCreateComputePipeline(device, &pipeline_descriptor) orelse error.PipelineCreationFailed;
}
```

**Step 2.2:** Create bind groups:
```zig
pub fn createBindGroup(
    device: *Device,
    layout: *BindGroupLayout,
    uniforms: *Buffer,
    input_texture: *TextureView,
    output_texture: *TextureView,
) !*BindGroup {
    var entries = [_]c.WGPUBindGroupEntry{
        .{ .binding = 0, .buffer = uniforms, .size = uniform_size },
        .{ .binding = 1, .textureView = input_texture },
        .{ .binding = 2, .textureView = output_texture },
    };
    
    const descriptor = c.WGPUBindGroupDescriptor{
        .layout = layout,
        .entryCount = entries.len,
        .entries = &entries,
    };
    
    return c.wgpuDeviceCreateBindGroup(device, &descriptor) orelse error.BindGroupCreationFailed;
}
```

**Step 2.3:** Encode compute commands:
```zig
pub fn dispatchAdvection(
    encoder: *CommandEncoder,
    pipeline: *ComputePipeline,
    bind_group: *BindGroup,
    width: u32,
    height: u32,
) void {
    const pass = c.wgpuCommandEncoderBeginComputePass(encoder, null);
    c.wgpuComputePassEncoderSetPipeline(pass, pipeline);
    c.wgpuComputePassEncoderSetBindGroup(pass, 0, bind_group, 0, null);
    
    // Dispatch 8x8 workgroups
    const workgroups_x = (width + 7) / 8;
    const workgroups_y = (height + 7) / 8;
    c.wgpuComputePassEncoderDispatchWorkgroups(pass, workgroups_x, workgroups_y, 1);
    
    c.wgpuComputePassEncoderEnd(pass);
}
```

**Step 2.4:** Submit to queue:
```zig
pub fn submitFrame(queue: *Queue, encoder: *CommandEncoder) void {
    const command_buffer = c.wgpuCommandEncoderFinish(encoder, null);
    c.wgpuQueueSubmit(queue, 1, &command_buffer);
}
```

**Verification Test:**
Should see GPU compute working:
```
Frame 0: GPU dispatch (256x144 → 32x18 workgroups)
  Advection: 0.2ms
  Divergence: 0.1ms
  Pressure (40 iterations): 1.5ms
  Gradient: 0.1ms
  Total GPU: 1.9ms (526 fps capable)

Frame 0: CPU vel=(6.227,3.113) den=(0.838,0.419,0.168)
Frame 0: GPU vel=(6.227,3.113) den=(0.838,0.419,0.168) ✓ MATCH
```

---

### Phase 3: Window + Display (1 day)

**Step 3.1:** Add GLFW for windowing:
```zig
// Can use Zig's built-in GLFW package or direct FFI
const glfw = @cImport({
    @cInclude("GLFW/glfw3.h");
});

pub fn createWindow(width: u32, height: u32) !*glfw.GLFWwindow {
    if (glfw.glfwInit() == 0) return error.GLFWInitFailed;
    
    glfw.glfwWindowHint(glfw.GLFW_CLIENT_API, glfw.GLFW_NO_API);
    return glfw.glfwCreateWindow(width, height, "Fluid Sim", null, null) orelse error.WindowCreationFailed;
}
```

**Step 3.2:** Create surface and swapchain:
```zig
pub fn createSurface(instance: *Instance, window: *glfw.GLFWwindow) !*Surface {
    var surface: *Surface = undefined;
    const result = glfw.glfwCreateWindowSurface(instance, window, null, &surface);
    if (result != 0) return error.SurfaceCreationFailed;
    return surface;
}

pub fn createSwapchain(device: *Device, surface: *Surface, width: u32, height: u32) !*SwapChain {
    const descriptor = c.WGPUSwapChainDescriptor{
        .usage = c.WGPUTextureUsage_RenderAttachment,
        .format = c.WGPUTextureFormat_BGRA8Unorm,
        .width = width,
        .height = height,
        .presentMode = c.WGPUPresentMode_Fifo,
    };
    
    return c.wgpuDeviceCreateSwapChain(device, surface, &descriptor) orelse error.SwapChainCreationFailed;
}
```

**Step 3.3:** Render pipeline for display:
```zig
pub fn createRenderPipeline(
    device: *Device,
    vertex_shader: *ShaderModule,
    fragment_shader: *ShaderModule,
) !*RenderPipeline {
    const pipeline_descriptor = c.WGPURenderPipelineDescriptor{
        .vertex = .{
            .module = vertex_shader,
            .entryPoint = "vs_main",
            .bufferCount = 0,
        },
        .fragment = &c.WGPUFragmentState{
            .module = fragment_shader,
            .entryPoint = "fs_main",
            .targetCount = 1,
            .targets = &[_]c.WGPUColorTargetState{.{
                .format = c.WGPUTextureFormat_BGRA8Unorm,
                .blend = null,
                .writeMask = c.WGPUColorWriteMask_All,
            }},
        },
        .primitive = .{
            .topology = c.WGPUPrimitiveTopology_TriangleList,
        },
    };
    
    return c.wgpuDeviceCreateRenderPipeline(device, &pipeline_descriptor) orelse error.RenderPipelineCreationFailed;
}
```

**Step 3.4:** Main render loop:
```zig
pub fn mainLoop(window: *glfw.GLFWwindow, sim: *GpuSimulation) !void {
    while (glfw.glfwWindowShouldClose(window) == 0) {
        glfw.glfwPollEvents();
        
        // GPU simulation step
        sim.step();
        
        // Render to screen
        const swapchain_texture = c.wgpuSwapChainGetCurrentTextureView(sim.swapchain);
        const encoder = c.wgpuDeviceCreateCommandEncoder(sim.device, null);
        
        // Render pass
        const render_pass_descriptor = c.WGPURenderPassDescriptor{
            .colorAttachmentCount = 1,
            .colorAttachments = &[_]c.WGPURenderPassColorAttachment{.{
                .view = swapchain_texture,
                .loadOp = c.WGPULoadOp_Clear,
                .storeOp = c.WGPUStoreOp_Store,
                .clearValue = .{ .r = 0, .g = 0, .b = 0, .a = 1 },
            }},
        };
        
        const pass = c.wgpuCommandEncoderBeginRenderPass(encoder, &render_pass_descriptor);
        c.wgpuRenderPassEncoderSetPipeline(pass, sim.display_pipeline);
        c.wgpuRenderPassEncoderSetBindGroup(pass, 0, sim.display_bind_group, 0, null);
        c.wgpuRenderPassEncoderDraw(pass, 6, 1, 0, 0); // Full-screen quad
        c.wgpuRenderPassEncoderEnd(pass);
        
        const command_buffer = c.wgpuCommandEncoderFinish(encoder, null);
        c.wgpuQueueSubmit(sim.queue, 1, &command_buffer);
        c.wgpuSwapChainPresent(sim.swapchain);
    }
}
```

**Final Result:**
```
🎨 Window opened: 1280x720
🚀 GPU simulation running at 60fps

Frame 0: GPU 1.9ms (compute) + 0.3ms (render) = 2.2ms (454 fps capable)
  Velocity field evolving...
  Density field with kaleidoscope effects visible!
```

---

## File Changes Required

### New Files to Create:
1. **`zig/vendor/wgpu/`** - wgpu-native binaries and headers
2. **`src/wgpu_bindings.zig`** - C FFI wrapper (200-300 lines)
3. **`src/gpu_impl.zig`** - Real GPU implementation (400-500 lines)

### Files to Modify:
1. **`build.zig`** - Add wgpu linking
2. **`src/gpu.zig`** - Replace stubs with real bindings
3. **`src/window.zig`** - Add GLFW integration
4. **`src/gpu_sim.zig`** - Implement resource creation and dispatch
5. **`src/main.zig`** - Switch from CPU to GPU mode

### Estimated Total Changes:
- **Lines added:** ~1,500
- **Files created:** 3
- **Files modified:** 5
- **Time estimate:** 4-6 days for full integration

---

## Performance Expectations

### CPU Reference (Current):
- Resolution: 256x144
- Frame time: ~16ms (60 fps target)
- Single-threaded

### GPU Target (After Integration):
- Resolution: 1024x576 (16x larger)
- Frame time: ~2-3ms (300-500 fps capable)
- Parallel compute on GPU
- **Expected speedup:** 50-100x

### Breakdown (1024x576 on GPU):
- Advection: 0.5ms
- Divergence: 0.2ms
- Curl: 0.1ms
- Pressure (40 iterations): 2.0ms
- Gradient: 0.2ms
- Display: 0.5ms
- **Total:** ~3.5ms per frame

---

## Testing Strategy

### Phase 1 Verification:
```powershell
# Should compile and link wgpu
zig build

# Should initialize GPU
zig build run
# Expected: "✓ Device created (D3D12)"
```

### Phase 2 Verification:
```zig
// Test single compute dispatch
test "GPU advection matches CPU" {
    var gpu_sim = try GpuSimulation.init(allocator, &ctx, 64, 64);
    var cpu_sim = try CpuSimulation.init(allocator, 64, 64);
    
    // Run one step
    gpu_sim.step();
    cpu_sim.step();
    
    // Read back GPU results
    const gpu_result = try gpu_sim.readVelocity();
    
    // Compare
    for (cpu_sim.velocity, gpu_result) |cpu_vel, gpu_vel| {
        try testing.expectApproxEqAbs(cpu_vel.x, gpu_vel.x, 0.001);
        try testing.expectApproxEqAbs(cpu_vel.y, gpu_vel.y, 0.001);
    }
}
```

### Phase 3 Verification:
Visual inspection - should see swirling fluid with colors!

---

## Troubleshooting

### "wgpu.dll not found"
```powershell
# Copy DLL to executable directory
Copy-Item vendor/wgpu/wgpu.dll zig-out/bin/
```

### "Shader compilation failed"
- Check WGSL syntax with [wgslsmith validator](https://github.com/wgslsmi

th/wgslsmith)
- Verify entry point names match Zig code

### "Adapter request failed"
- Ensure D3D12 drivers are up to date
- Check Windows 10 version ≥ 1809

### "Black screen but no errors"
- Verify bind group bindings match shader
- Check texture format compatibility
- Add validation layer: `WGPUInstanceDescriptor{ .enableValidation = true }`

---

## Current Project State

**Total Progress:** 65%
- ✅ CPU kernels (100%)
- ✅ WGSL shaders (100%)
- ✅ Pipeline architecture (100%)
- ⏳ WebGPU bindings (0% - next step!)
- ⏳ GPU dispatch (0%)
- ⏳ Window/render (0%)

**What You Can Run Now:**
```powershell
cd z:\New folder\Fluid-UI\zig
zig build test      # All tests pass
zig build run       # CPU simulation with shader loading
```

**What Comes After WebGPU:**
- Mouse/touch input
- Kaleidoscope controls
- Color palettes
- Recording/playback
- Multiplayer sync
- Performance profiling

---

## Quick Start (When Ready)

1. **Download wgpu-native:**
```powershell
cd z:\New folder\Fluid-UI\zig
mkdir vendor
cd vendor
# Download and extract wgpu-native Windows release
```

2. **Update build.zig:**
```zig
exe.linkSystemLibrary("wgpu");
exe.addLibraryPath(.{ .cwd_relative = "vendor/wgpu" });
exe.addIncludePath(.{ .cwd_relative = "vendor/wgpu/include" });
```

3. **Create bindings:**
```zig
// src/wgpu_bindings.zig
const c = @cImport({
    @cInclude("wgpu.h");
});
// Export C types...
```

4. **Test:**
```powershell
zig build run
# Should see: "✓ WebGPU device created (D3D12)"
```

---

**Next Action:** Download wgpu-native and start Phase 1!

**Questions?** All the infrastructure is ready - just need to plug in the WebGPU bindings.
