# 🚀 Quick Start: GPU Integration

## Immediate Next Steps (4-6 hours to working GPU)

### Option 1: Use Existing Zig Bindings (RECOMMENDED)

**Pros:**
- Ready-made bindings
- Cross-platform
- Maintained
- Examples available

**Implementation:**

1. **Add dependency** (5 min)
   
   Create/update `build.zig.zon`:
   ```zig
   .{
       .name = "fluid-sim",
       .version = "0.1.0",
       .dependencies = .{
           .wgpu_zig = .{
               .url = "https://github.com/shreyassanthu77/wgpu-zig/archive/main.tar.gz",
               .hash = "1220...", // Will be auto-filled
           },
       },
   }
   ```

2. **Update build.zig** (10 min)
   ```zig
   const wgpu_zig = b.dependency("wgpu_zig", .{
       .target = target,
       .optimize = optimize,
   });
   
   exe.root_module.addImport("wgpu", wgpu_zig.module("wgpu"));
   ```

3. **Replace stub backend** (2-3 hours)
   
   Update `src/gpu_backend.zig`:
   ```zig
   const wgpu = @import("wgpu");
   
   pub const Instance = struct {
       handle: *wgpu.Instance,
       
       pub fn init(allocator: std.mem.Allocator) !Instance {
           _ = allocator;
           const handle = wgpu.createInstance(.{}) orelse 
               return error.InstanceCreationFailed;
           return .{ .handle = handle };
       }
       
       pub fn deinit(self: *Instance) void {
           self.handle.release();
       }
       
       pub fn requestDevice(self: *Instance) !Device {
           const adapter = try self.requestAdapter();
           const device_handle = try adapter.requestDevice(.{});
           return Device{ .handle = device_handle };
       }
   };
   
   pub const Device = struct {
       handle: *wgpu.Device,
       
       pub fn createTexture(self: *Device, desc: TextureDescriptor) !Texture {
           const wgpu_desc = wgpu.TextureDescriptor{
               .size = .{ .width = desc.width, .height = desc.height },
               .format = @intFromEnum(desc.format),
               .usage = .{ .texture_binding = true, .storage_binding = true },
           };
           const handle = self.handle.createTexture(&wgpu_desc);
           return Texture{ .handle = handle };
       }
       
       pub fn createComputePipeline(self: *Device, desc: ComputePipelineDescriptor) !ComputePipeline {
           // Load shader
           const shader_module = self.handle.createShaderModule(.{
               .code = desc.shader_code,
           });
           defer shader_module.release();
           
           // Create pipeline
           const pipeline_desc = wgpu.ComputePipelineDescriptor{
               .compute = .{
                   .module = shader_module,
                   .entry_point = desc.entry_point,
               },
           };
           const handle = self.handle.createComputePipeline(&pipeline_desc);
           return ComputePipeline{ .handle = handle };
       }
   };
   ```

4. **Test basic GPU access** (30 min)
   ```zig
   test "GPU device creation" {
       var instance = try Instance.init(testing.allocator);
       defer instance.deinit();
       
       var device = try instance.requestDevice();
       defer device.deinit();
       
       std.debug.print("GPU initialized!\n", .{});
   }
   ```

---

### Option 2: Minimal Custom Bindings (If Option 1 fails)

**Use case:** If wgpu-zig has issues on Windows

1. **Download wgpu-native** (10 min)
   ```powershell
   # Create lib directory
   New-Item -ItemType Directory -Force -Path "lib/wgpu"
   
   # Download (use latest stable version)
   $version = "v22.1.0.5"
   $url = "https://github.com/gfx-rs/wgpu-native/releases/download/$version/wgpu-windows-x86_64-release.zip"
   
   Invoke-WebRequest -Uri $url -OutFile "lib/wgpu.zip"
   Expand-Archive "lib/wgpu.zip" -DestinationPath "lib/wgpu" -Force
   ```

2. **Create minimal bindings** (1 hour)
   
   `src/wgpu_minimal.zig`:
   ```zig
   // Minimal bindings - just what we need
   pub const Instance = opaque {};
   pub const Adapter = opaque {};
   pub const Device = opaque {};
   pub const Queue = opaque {};
   pub const Texture = opaque {};
   pub const TextureView = opaque {};
   pub const ShaderModule = opaque {};
   pub const ComputePipeline = opaque {};
   pub const CommandEncoder = opaque {};
   pub const ComputePassEncoder = opaque {};
   pub const CommandBuffer = opaque {};
   
   pub const TextureFormat = enum(c_uint) {
       rgba8unorm = 0x00000012,
       rg32float = 0x00000041,
       rgba32float = 0x00000045,
       r32float = 0x0000003D,
   };
   
   pub const TextureUsage = packed struct(u32) {
       copy_src: bool = false,
       copy_dst: bool = false,
       texture_binding: bool = false,
       storage_binding: bool = false,
       render_attachment: bool = false,
       _padding: u27 = 0,
   };
   
   // C function declarations
   pub extern "wgpu_native" fn wgpuCreateInstance(descriptor: ?*const anyopaque) ?*Instance;
   pub extern "wgpu_native" fn wgpuInstanceRequestAdapter(instance: *Instance, options: ?*const anyopaque, callback: *const fn(?*Adapter, ?*const anyopaque) callconv(.C) void, userdata: ?*anyopaque) void;
   pub extern "wgpu_native" fn wgpuAdapterRequestDevice(adapter: *Adapter, descriptor: ?*const anyopaque, callback: *const fn(?*Device, ?*const anyopaque) callconv(.C) void, userdata: ?*anyopaque) void;
   pub extern "wgpu_native" fn wgpuDeviceGetQueue(device: *Device) *Queue;
   pub extern "wgpu_native" fn wgpuDeviceCreateTexture(device: *Device, descriptor: *const TextureDescriptor) *Texture;
   // ... more as needed
   
   pub const TextureDescriptor = extern struct {
       next_in_chain: ?*const anyopaque = null,
       label: ?[*:0]const u8 = null,
       usage: TextureUsage,
       dimension: c_uint = 2, // 2D
       size: Extent3D,
       format: TextureFormat,
       mip_level_count: u32 = 1,
       sample_count: u32 = 1,
   };
   
   pub const Extent3D = extern struct {
       width: u32,
       height: u32,
       depth_or_array_layers: u32 = 1,
   };
   ```

3. **Update build.zig** (15 min)
   ```zig
   exe.addLibraryPath(.{ .path = "lib/wgpu" });
   exe.linkSystemLibrary("wgpu_native");
   
   // Copy DLL to output
   const install_dll = b.addInstallFile(
       .{ .path = "lib/wgpu/wgpu_native.dll" },
       "bin/wgpu_native.dll"
   );
   b.getInstallStep().dependOn(&install_dll.step);
   ```

---

## Incremental Implementation Strategy

### Phase 1: Device Init (30 min)

**Goal:** Get GPU device working

```zig
// src/main.zig
pub fn main() !void {
    std.log.info("Initializing GPU...", .{});
    
    var gpu_ctx = try gpu.GpuContext.init(allocator);
    defer gpu_ctx.deinit();
    
    const device = gpu_ctx.getDevice();
    std.log.info("✅ GPU ready!", .{});
    
    // Continue with existing CPU simulation for now
    // ...
}
```

**Success:** Program runs, logs "GPU ready"

### Phase 2: Single Texture (30 min)

**Goal:** Create and verify a GPU texture

```zig
const texture = try device.createTexture(.{
    .width = 512,
    .height = 288,
    .format = .rg32float,
    .usage = .{ .storage_binding = true, .copy_src = true },
});
defer texture.destroy();

std.log.info("✅ Texture created: 512x288", .{});
```

**Success:** No crashes, texture handle valid

### Phase 3: Single Shader (1 hour)

**Goal:** Compile and run one compute shader

```zig
// Test with simplest shader first
const test_shader =
    \\@compute @workgroup_size(8, 8, 1)
    \\fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    \\    // Just a test - does nothing
    \\}
;

const shader_module = try device.createShaderModule(.{
    .code = test_shader,
});
defer shader_module.destroy();

const pipeline = try device.createComputePipeline(.{
    .compute = .{
        .module = shader_module,
        .entry_point = "main",
    },
});
defer pipeline.destroy();

std.log.info("✅ Shader compiled!", .{});
```

**Success:** Shader compiles without errors

### Phase 4: Single Dispatch (1 hour)

**Goal:** Run compute shader on GPU

```zig
const encoder = device.createCommandEncoder();
const pass = encoder.beginComputePass();
pass.setPipeline(pipeline);
pass.dispatchWorkgroups(64, 36, 1);  // 512/8, 288/8
pass.end();

const commands = encoder.finish();
queue.submit(&[_]*CommandBuffer{commands});

std.log.info("✅ Compute pass executed!", .{});
```

**Success:** No validation errors, completes quickly

### Phase 5: Read Back Data (1 hour)

**Goal:** Verify GPU computed something

```zig
// Create staging buffer
const staging = try device.createBuffer(.{
    .size = 512 * 288 * 8, // RG32Float = 8 bytes/pixel
    .usage = .{ .copy_dst = true, .map_read = true },
});
defer staging.destroy();

// Copy texture to staging
encoder.copyTextureToBuffer(texture, staging, .{
    .bytes_per_row = 512 * 8,
    .rows_per_image = 288,
});

// Submit and wait
queue.submit(&[_]*CommandBuffer{commands});
device.poll(true);

// Map and read
const data = try staging.mapRead();
defer staging.unmap();

std.log.info("✅ Read back {d} bytes from GPU", .{data.len});
```

**Success:** Data read back matches expected size

### Phase 6: Full Pipeline (2-3 hours)

**Goal:** All 7 shaders running

```zig
pub fn step(self: *GpuSimulation) !void {
    const encoder = self.device.createCommandEncoder();
    
    // 1. Advect velocity
    self.dispatchAdvection(encoder, .velocity);
    
    // 2. Curl
    self.dispatchCurl(encoder);
    
    // 3. Vorticity
    self.dispatchVorticity(encoder);
    
    // 4. Divergence
    self.dispatchDivergence(encoder);
    
    // 5. Pressure (95 iterations)
    var i: usize = 0;
    while (i < 95) : (i += 1) {
        self.dispatchPressure(encoder);
        self.swapPressureBuffers();
    }
    
    // 6. Gradient
    self.dispatchGradient(encoder);
    
    // 7. Advect density
    self.dispatchAdvection(encoder, .density);
    
    const commands = encoder.finish();
    self.queue.submit(&[_]*CommandBuffer{commands});
}
```

**Success:** Full simulation runs on GPU

### Phase 7: Display (1 hour)

**Goal:** Show GPU results in window

```zig
// Read density texture
const density_data = try gpu_simulation.readDensityToCPU();

// Render to window (existing code)
renderToWindow(win, density_data, sim_width, sim_height);
```

**Success:** See fluid simulation in window, GPU-accelerated!

---

## Debugging Tips

### Enable Validation
```zig
const instance = wgpu.createInstance(.{
    .backends = .{ .vulkan = true, .dx12 = true },
    .validation = true,  // Enable debug messages
});
```

### Check for Errors
```zig
device.setUncapturedErrorCallback(
    struct {
        fn callback(err_type: wgpu.ErrorType, message: [*:0]const u8, userdata: ?*anyopaque) callconv(.C) void {
            _ = userdata;
            std.log.err("GPU Error ({s}): {s}", .{@tagName(err_type), message});
        }
    }.callback,
    null
);
```

### Profile Passes
```zig
const start = std.time.nanoTimestamp();
queue.submit(&[_]*CommandBuffer{commands});
device.poll(true);  // Wait for completion
const end = std.time.nanoTimestamp();

const ms = @as(f64, @floatFromInt(end - start)) / 1_000_000.0;
std.log.info("GPU step: {d:.2}ms", .{ms});
```

---

## Expected Timeline

| Phase | Time | Cumulative | Milestone |
|-------|------|------------|-----------|
| Setup | 30 min | 0.5h | Dependencies added |
| Device Init | 30 min | 1h | GPU accessible |
| Texture | 30 min | 1.5h | Memory allocated |
| Shader | 1h | 2.5h | Compute working |
| Dispatch | 1h | 3.5h | GPU executing |
| Readback | 1h | 4.5h | Data verified |
| Full Pipeline | 2h | 6.5h | All passes working |
| Display | 1h | 7.5h | **60 FPS!** 🎉 |

**Total: ~8 hours to fully working GPU simulation**

---

## What to Do Right Now

1. **Choose Option 1** (wgpu-zig bindings)
   - Easier, maintained, cross-platform
   
2. **Create build.zig.zon**
   ```zig
   .{
       .name = "fluid-sim",
       .version = "0.1.0",
       .dependencies = .{
           .wgpu_zig = .{
               .url = "https://github.com/shreyassanthu77/wgpu-zig/archive/main.tar.gz",
               .hash = "1220...",
           },
       },
   }
   ```

3. **Update build.zig**
   ```zig
   const wgpu_zig = b.dependency("wgpu_zig", .{});
   exe.root_module.addImport("wgpu", wgpu_zig.module("wgpu"));
   ```

4. **Test it**
   ```bash
   zig build
   ```

5. **Start Phase 1** (Device Init)

Ready to begin! 🚀
