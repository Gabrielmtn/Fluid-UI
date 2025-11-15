# Phase 6: Dispatch & Execution - Implementation Plan

**Status:** Ready to start  
**Prerequisites:** ✅ Phase 5 complete  
**Goal:** Working GPU fluid simulation with all kernels

---

## 🎯 Objective

Implement complete simulation loop with proper resource binding, shader updates, and validation against CPU reference.

---

## 📋 Task Breakdown

### Task 1: Update Advection Shader (1-2 hours)

**Current State:** `shaders/advection.wgsl` uses storage textures (invalid)

**Required Changes:**
```wgsl
// OLD (storage textures - not allowed)
@group(0) @binding(0) var<storage, read> velocity: texture_storage_2d<rgba32float, read>;
@group(0) @binding(1) var<storage, read> source: texture_storage_2d<rgba32float, read>;
@group(0) @binding(2) var<storage, write> output: texture_storage_2d<rgba32float, write>;

// NEW (sampled inputs, write-only output)
@group(0) @binding(0) var velocity: texture_2d<f32>;  // Sampled for reading
@group(0) @binding(1) var source: texture_2d<f32>;    // Sampled for reading
@group(0) @binding(2) var output: texture_storage_2d<rg32float, write>;  // Write-only storage

@compute @workgroup_size(8, 8, 1)
fn advection(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coords = vec2<i32>(i32(global_id.x), i32(global_id.y));
    
    // Read using textureLoad (no sampler needed for nearest)
    let vel = textureLoad(velocity, coords, 0).xy;
    let pos = vec2<f32>(coords);
    
    // Backward trace
    let back_pos = pos - vel * dt * texel_size;
    let back_coords = vec2<i32>(back_pos);
    
    // Sample source
    let advected = textureLoad(source, back_coords, 0).xy;
    
    // Write output (rg32float for 2-component velocity)
    textureStore(output, coords, vec4<f32>(advected, 0.0, 0.0));
}
```

**Files to modify:**
- `shaders/advection.wgsl`

**Validation:**
- Compile shader
- Verify no errors

---

### Task 2: Create Advection Bind Group Layout (1 hour)

**Create in:** `src/gpu_pipelines.zig` or new `src/gpu_kernels.zig`

```zig
pub fn createAdvectionBindGroupLayout(device: *gpu.Device) !gpu.BindGroupLayout {
    return device.createBindGroupLayout(&[_]gpu.BindGroupLayoutEntry{
        // Binding 0: velocity (sampled rg32float)
        .{
            .binding = 0,
            .visibility = wgpu.ShaderStage_COMPUTE,
            .texture = .{
                .sample_type = 2, // UnfilterableFloat
                .view_dimension = .@"2d",
                .multisampled = false,
            },
        },
        // Binding 1: source (sampled rg32float)
        .{
            .binding = 1,
            .visibility = wgpu.ShaderStage_COMPUTE,
            .texture = .{
                .sample_type = 2, // UnfilterableFloat
                .view_dimension = .@"2d",
                .multisampled = false,
            },
        },
        // Binding 2: output (write-only storage rg32float)
        .{
            .binding = 2,
            .visibility = wgpu.ShaderStage_COMPUTE,
            .storage_texture = .{
                .access = 1, // WriteOnly
                .format = .rg32float,
                .view_dimension = .@"2d",
            },
        },
    });
}
```

**Validation:**
- Create layout
- Verify no errors

---

### Task 3: Create Advection Test (2 hours)

**Create:** `test_advection_kernel.zig`

```zig
// Test single advection kernel dispatch
pub fn main() !void {
    // 1. Init GPU
    // 2. Load updated advection.wgsl
    // 3. Create bind group layout
    // 4. Create pipeline
    // 5. Create textures (rg32float for velocity)
    // 6. Create bind group
    // 7. Dispatch workgroups
    // 8. Submit
    // 9. Validate success
}
```

**Expected Result:** Zero errors, successful dispatch

---

### Task 4: Update Remaining Shaders (2-3 hours)

Apply same pattern to all kernels:

**Divergence:**
- Input: velocity (`rg32float` sampled)
- Output: divergence (`r32float` write-only storage)

**Curl:**
- Input: velocity (`rg32float` sampled)
- Output: curl (`r32float` write-only storage)

**Pressure:**
- Input: divergence (`r32float` sampled), previous pressure (`r32float` sampled)
- Output: new pressure (`r32float` write-only storage)

**Gradient:**
- Input: pressure (`r32float` sampled)
- Output: velocity correction (`rg32float` write-only storage)

**Splat:**
- Input: source (`rg32float` or `r32float` sampled)
- Output: splat result (write-only storage, same format)

---

### Task 5: Implement Ping-Pong Pattern (2 hours)

**Create:** `src/gpu_double_buffer.zig`

```zig
pub const DoubleBuffer = struct {
    texture_a: gpu.Texture,
    texture_b: gpu.Texture,
    view_a: gpu.TextureView,
    view_b: gpu.TextureView,
    current_read: enum { A, B } = .A,
    
    pub fn init(device: *gpu.Device, width: u32, height: u32, format: gpu.TextureFormat) !DoubleBuffer {
        // Create both textures with appropriate usage flags
        var tex_a = try device.createTexture(width, height, format, .{
            .texture_binding = true,  // For reading
            .storage_binding = true,  // For writing
        });
        var tex_b = try device.createTexture(width, height, format, .{
            .texture_binding = true,
            .storage_binding = true,
        });
        
        return DoubleBuffer{
            .texture_a = tex_a,
            .texture_b = tex_b,
            .view_a = try tex_a.createView(),
            .view_b = try tex_b.createView(),
        };
    }
    
    pub fn getReadView(self: *DoubleBuffer) *gpu.TextureView {
        return if (self.current_read == .A) &self.view_a else &self.view_b;
    }
    
    pub fn getWriteView(self: *DoubleBuffer) *gpu.TextureView {
        return if (self.current_read == .A) &self.view_b else &self.view_a;
    }
    
    pub fn swap(self: *DoubleBuffer) void {
        self.current_read = if (self.current_read == .A) .B else .A;
    }
};
```

---

### Task 6: Implement Simulation Step (3-4 hours)

**Create:** `src/gpu_simulation.zig`

```zig
pub const GPUSimulation = struct {
    device: *gpu.Device,
    
    // Double buffers
    velocity: DoubleBuffer,
    density: DoubleBuffer,
    pressure: DoubleBuffer,
    
    // Single buffers
    divergence: gpu.Texture,
    curl: gpu.Texture,
    
    // Pipelines
    advection_pipeline: gpu.ComputePipeline,
    divergence_pipeline: gpu.ComputePipeline,
    // ... etc
    
    pub fn step(self: *GPUSimulation, dt: f32) !void {
        var encoder = try self.device.createCommandEncoder();
        defer encoder.deinit();
        
        // 1. Advect velocity
        {
            var pass = try encoder.beginComputePass();
            pass.setPipeline(&self.advection_pipeline);
            // Create bind group with: velocity.read, velocity.read, velocity.write
            // pass.setBindGroup(0, &bind_group);
            // pass.dispatchWorkgroups(workgroups_x, workgroups_y, 1);
            pass.end();
            pass.deinit();
            self.velocity.swap();
        }
        
        // 2. Compute divergence
        // 3. Solve pressure (iterate)
        // 4. Apply pressure gradient
        // 5. Advect density
        
        var cmd = try encoder.finish();
        defer cmd.deinit();
        self.device.submit(&[_]*gpu.CommandBuffer{&cmd});
    }
};
```

---

### Task 7: Validation & Testing (2-3 hours)

**Create:** `test_simulation_step.zig`

1. Initialize small simulation (16x16 or 32x32)
2. Set initial velocity field (simple pattern)
3. Run one simulation step
4. Read back results
5. Compare with CPU reference
6. Validate numerical correctness

**Success Criteria:**
- GPU results match CPU within tolerance (< 1e-5 difference)
- No GPU validation errors
- Performance acceptable

---

### Task 8: Performance Profiling (1-2 hours)

**Add timing:**
```zig
const start = std.time.nanoTimestamp();
simulation.step(dt);
device.poll(true); // Wait for GPU
const end = std.time.nanoTimestamp();
const ms = @as(f64, @floatFromInt(end - start)) / 1_000_000.0;
std.log.info("Frame time: {d:.2}ms ({d:.1} FPS)", .{ms, 1000.0 / ms});
```

**Target:** 60+ FPS at 512x512 resolution

---

## 📊 Progress Checklist

- [ ] Task 1: Update advection shader
- [ ] Task 2: Create advection bind group layout
- [ ] Task 3: Test single advection dispatch
- [ ] Task 4: Update all other shaders
- [ ] Task 5: Implement ping-pong buffers
- [ ] Task 6: Implement simulation step
- [ ] Task 7: Validation against CPU reference
- [ ] Task 8: Performance profiling

---

## 🎯 Success Criteria

✅ **All kernels compile** with correct binding patterns  
✅ **Bind groups created** successfully for all kernels  
✅ **Simulation step** executes without errors  
✅ **GPU results** match CPU reference (numerical validation)  
✅ **Performance** meets or exceeds 60 FPS target  
✅ **No GPU validation errors** during execution  

---

## 🔧 Common Issues & Solutions

### Issue: Workgroup Size Mismatch
**Solution:** Ensure workgroup size in shader matches dispatch:
```zig
// Shader: @workgroup_size(8, 8, 1)
const wg_size = 8;
const dispatch_x = (width + wg_size - 1) / wg_size;
const dispatch_y = (height + wg_size - 1) / wg_size;
pass.dispatchWorkgroups(dispatch_x, dispatch_y, 1);
```

### Issue: Bind Group Mismatch
**Solution:** Verify binding numbers match between:
- Bind group layout definition
- Shader `@binding(N)` declarations
- Bind group creation entries

### Issue: Texture Format Mismatch
**Solution:** Ensure texture format matches:
- Bind group layout `.format`
- Shader `texture_storage_2d<FORMAT, ...>`
- Texture creation format

---

## 📚 Reference Documents

- `WEBGPU_BINDING_REFERENCE.md` - Binding patterns
- `PHASE5_COMPLETE.md` - Proven working patterns
- `test_compute_dispatch.zig` - Working example

---

## 🚀 Getting Started

```bash
# 1. Start with advection shader update
cd zig/shaders
# Edit advection.wgsl using Phase 5 patterns

# 2. Test compilation
zig build test-pipelines

# 3. Create advection test
# Copy test_compute_dispatch.zig as template
# Adapt for advection kernel

# 4. Build and run
zig build test-advection-kernel
```

---

**Phase 6 Ready to Begin!** 🎯
