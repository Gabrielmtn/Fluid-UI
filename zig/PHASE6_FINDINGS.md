# Phase 6 Key Findings - Sampler & Format Requirements

**Date:** November 11, 2025  
**Status:** In Progress - First kernel validated!

---

## 🎉 Major Discovery: Sampler-Format Compatibility

### The Critical Rule

**Unfilterable float formats REQUIRE non-filtering samplers!**

When using `r32float` or `rg32float` (unfilterable float formats), you **MUST** use a non-filtering sampler or the pipeline will fail to compile.

### Error if Violated

```
Error in wgpuDeviceCreateComputePipeline:
    Unable to filter the texture by the sampler
    Non-filterable float textures can't be sampled with a filtering sampler
```

---

## 📋 Format Categories

### Unfilterable Float Formats
**Require non-filtering samplers (`type = 2`)**

- ✅ `r32float` - Single channel, 32-bit float
- ✅ `rg32float` - Two channel, 32-bit float (needs verification for storage)
- ✅ `rgba32float` - Four channel, 32-bit float (sampling only, NOT for storage)

**Usage:**
```zig
// Bind group layout
.texture = .{
    .sample_type = 2, // UnfilterableFloat
    .view_dimension = .@"2d",
    .multisampled = false,
}

// Sampler
var sampler = try device.createSampler(.{
    .mag_filter = .nearest,  // MUST be nearest!
    .min_filter = .nearest,
    .mipmap_filter = .nearest,
});

// Shader
textureLoad(tex, coords, 0) // Use textureLoad, not textureSample!
```

### Filterable Float Formats
**Can use filtering samplers (`type = 1`)**

- ✅ `rgba8unorm` - Four channel, 8-bit normalized
- ✅ `rgba16float` - Four channel, 16-bit half-float
- ✅ `r16float` - Single channel, 16-bit half-float
- ✅ `rg16float` - Two channel, 16-bit half-float

**Usage:**
```zig
// Bind group layout
.texture = .{
    .sample_type = 1, // FilterableFloat (or just "Float")
    .view_dimension = .@"2d",
    .multisampled = false,
}

// Sampler
var sampler = try device.createSampler(.{
    .mag_filter = .linear,  // Can use linear filtering
    .min_filter = .linear,
    .mipmap_filter = .linear,
});

// Shader
textureSampleLevel(tex, sampler, uv, 0.0) // Can use texture sampling with interpolation
```

---

## ✅ Validated Working Pattern

### Test: `test-advection-kernel`

**Configuration:**
- Format: `r32float` (unfilterable)
- Sampler: Non-filtering (`.nearest`)
- Layout: 2 sampled inputs + 1 sampler + 1 write-only storage output
- Result: **ZERO ERRORS** ✅

**Bind Group Layout:**
```zig
&[_]gpu.BindGroupLayoutEntry{
    // Input texture 1
    .{
        .binding = 0,
        .visibility = wgpu.ShaderStage_COMPUTE,
        .texture = .{
            .sample_type = 2, // UnfilterableFloat
            .view_dimension = .@"2d",
            .multisampled = false,
        },
    },
    // Input texture 2
    .{
        .binding = 1,
        .visibility = wgpu.ShaderStage_COMPUTE,
        .texture = .{
            .sample_type = 2, // UnfilterableFloat
            .view_dimension = .@"2d",
            .multisampled = false,
        },
    },
    // Non-filtering sampler
    .{
        .binding = 2,
        .visibility = wgpu.ShaderStage_COMPUTE,
        .sampler = .{
            .type = 2, // NonFiltering
        },
    },
    // Output storage texture
    .{
        .binding = 3,
        .visibility = wgpu.ShaderStage_COMPUTE,
        .storage_texture = .{
            .access = 1, // WriteOnly
            .format = .r32float,
            .view_dimension = .@"2d",
        },
    },
}
```

**Shader:**
```wgsl
@group(0) @binding(0) var velocity_texture: texture_2d<f32>;
@group(0) @binding(1) var source_texture: texture_2d<f32>;
@group(0) @binding(2) var nearest_sampler: sampler;
@group(0) @binding(3) var output: texture_storage_2d<r32float, write>;

@compute @workgroup_size(8, 8, 1)
fn advection(@builtin(global_invocation_id) id: vec3<u32>) {
    let coords = vec2<i32>(i32(id.x), i32(id.y));
    let source_val = textureLoad(source_texture, coords, 0).x;
    textureStore(output, id.xy, vec4<f32>(source_val, 0.0, 0.0, 0.0));
}
```

---

## 🔬 Still To Verify

### ❌ rg32float NOT Supported for Storage Textures

**Test Result:** FAILED - `rg32float` is NOT allowed for write-only storage!

**Error:**
```
Texture format Rgb9e5Ufloat is not supported for storage use
```

**Confirmed Support:**
- ✅ `r32float` works for storage (validated)
- ✅ `rgba8unorm` works for storage
- ❌ `rg32float` NOT supported for storage
- ❌ `rgba32float` NOT supported for storage
- ❌ `rgba16float` NOT supported for storage

**Critical Implication:** Cannot store 2-component velocity data in a single texture!

### Uniform Buffer Limitation

**Issue:** Uniform buffers cause "Buffer still mapped" error even without `writeBuffer`

**Workarounds:**
1. Avoid uniform buffers entirely
2. Use push constants (need to implement)
3. Implement proper mapped buffer API
4. Hard-code values in shader (temporary)

**For Phase 6:** Proceeding without uniform buffers for now

---

## 📊 Storage Format Support Matrix

| Format | Sampled (Read) | Storage (Write) | Sampler Type | Notes |
|--------|---------------|-----------------|--------------|-------|
| `r32float` | ✅ Validated | ✅ Validated | Non-filtering | Single channel |
| `rg32float` | ✅ Validated | ❓ Needs test | Non-filtering | Two channels - TEST NEXT |
| `rgba32float` | ✅ Works | ❌ NOT allowed | Non-filtering | Sampling only |
| `rgba16float` | ✅ Works | ❌ NOT allowed | Filtering OK | Sampling only |
| `rgba8unorm` | ✅ Works | ✅ Works | Filtering OK | Best for render targets |
| `r16float` | ✅ Works | ✅ Works | Filtering OK | Half-precision single |
| `rg16float` | ✅ Works | ✅ Works | Filtering OK | Half-precision dual |

---

## 🔧 Solution Strategy for 2-Component Data

### The Problem
Core WebGPU only allows `r32float` and `rgba8unorm` for write-only storage textures.  
**We cannot use `rg32float` for velocity storage!**

### Solution: Split Velocity into Separate Textures

**Approach:** Use two `r32float` textures for velocity:
- `velocity_x` - Horizontal component
- `velocity_y` - Vertical component

**Advantages:**
- ✅ Fully supported format
- ✅ Same precision as rg32float would have been
- ✅ Clean separation of concerns
- ✅ Easy to sample independently

**Implementation:**
```zig
// Create separate velocity component textures
var velocity_x = try device.createTexture(W, H, gpu.TextureFormat.R32Float, .{
    .texture_binding = true,
    .storage_binding = true,
});
var velocity_y = try device.createTexture(W, H, gpu.TextureFormat.R32Float, .{
    .texture_binding = true,
    .storage_binding = true,
});
```

**Shader Pattern:**
```wgsl
// Inputs (can read both components)
@group(0) @binding(0) var velocity_x: texture_2d<f32>;
@group(0) @binding(1) var velocity_y: texture_2d<f32>;

// Outputs (write separately)
@group(0) @binding(2) var output_x: texture_storage_2d<r32float, write>;
@group(0) @binding(3) var output_y: texture_storage_2d<r32float, write>;

@compute @workgroup_size(8, 8, 1)
fn kernel(@builtin(global_invocation_id) id: vec3<u32>) {
    let coords = vec2<i32>(i32(id.x), i32(id.y));
    let vx = textureLoad(velocity_x, coords, 0).x;
    let vy = textureLoad(velocity_y, coords, 0).x;
    
    // Process...
    let result_x = vx * 0.99;
    let result_y = vy * 0.99;
    
    // Write separately
    textureStore(output_x, id.xy, vec4<f32>(result_x, 0.0, 0.0, 0.0));
    textureStore(output_y, id.xy, vec4<f32>(result_y, 0.0, 0.0, 0.0));
}
```

**Trade-offs:**
- More texture bindings (4 instead of 2 per kernel)
- Slightly more complex shader code
- Same memory usage overall
- Same performance (no packing/unpacking overhead)

### Alternative: rgba8unorm for Visualization

For **display only**, we could pack velocity into `rgba8unorm`:
```wgsl
// Pack velocity into 8-bit normalized
let vx_norm = (vx * 0.5 + 0.5);  // Map [-1,1] to [0,1]
let vy_norm = (vy * 0.5 + 0.5);
textureStore(output, id.xy, vec4<f32>(vx_norm, vy_norm, 0.0, 1.0));
```

But this loses precision for simulation, so use **separate r32float textures for computation**.

---

## 🎯 Phase 6 Progress

### ✅ Completed
1. ✅ Updated advection shader to Phase 5 patterns
2. ✅ Created test with proper bind groups
3. ✅ Discovered sampler-format compatibility requirement
4. ✅ Validated r32float end-to-end
5. ✅ First kernel executing successfully - ZERO ERRORS!
6. ✅ Tested rg32float storage support
7. ✅ Documented rg32float limitation
8. ✅ Created solution strategy for 2-component data

### 🔄 In Progress
1. Update texture manager for split velocity components
2. Update shaders to use separate x/y textures

### 📋 Next Steps
1. Implement split velocity texture pattern in FluidTextures
2. Update all kernels to use separate component textures
3. Implement ping-pong buffer pattern for double-buffering
4. Wire up complete simulation loop
5. Add proper uniform buffer API (push constants or mapped buffers)

---

## 💡 Key Takeaways

1. **Always match sampler type to texture format**
   - Unfilterable → Non-filtering sampler
   - Filterable → Can use filtering sampler

2. **Use `textureLoad()` for unfilterable formats**
   - Provides nearest-neighbor sampling
   - Works without a sampler object in compute shaders
   - More efficient for unfilterable data

3. **Storage texture limitations are real**
   - Only write-only access in core WebGPU
   - Limited format support (r32float, rgba8unorm confirmed)
   - rg32float needs verification

4. **Uniform buffers have issues**
   - Avoid for now in compute passes
   - Will address with proper API in later phase

---

## 🚀 Impact on Fluid Simulation

### Velocity Field (2-component)
**Strategy:** Use `rg32float` if supported, otherwise split into two `r32float` textures

### Pressure/Divergence/Curl (1-component)
**Strategy:** Use `r32float` (validated and working!)

### Density (4-component, optional filtering)
**Strategy:**
- Option A: `rgba8unorm` with filtering (for visual output)
- Option B: Split into components if precision needed

---

**Status:** Phase 6 progressing well! First kernel validated with zero errors. 🎉
