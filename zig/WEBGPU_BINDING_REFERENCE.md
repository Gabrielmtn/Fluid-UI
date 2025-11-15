# WebGPU Binding Patterns - Quick Reference

**Purpose:** Quick lookup for correct WebGPU binding patterns in core spec

---

## 📋 Texture Format Support

### ✅ Allowed for Sampled Textures
- `r32float` - 1 channel float (unfilterable)
- `rg32float` - 2 channel float (unfilterable)
- `rgba32float` - 4 channel float (unfilterable)
- `r16float` - 1 channel half-float (filterable)
- `rgba16float` - 4 channel half-float (filterable)
- `rgba8unorm` - 4 channel normalized (filterable)

### ✅ Allowed for Write-Only Storage Textures
- `r32float` ✅ **Use this!**
- `rg32float` ✅ **Use this for 2-component data!**
- `rgba8unorm` ✅ **Use this for render targets!**

### ❌ NOT Allowed for Storage Textures
- `rgba32float` ❌ (requires native extension)
- `rgba16float` ❌ (requires native extension)
- Most multi-channel formats ❌

---

## 🔧 Binding Type Reference

### Sampled Texture (for Reading)

**Use when:** Reading texture data in shaders

**Bind Group Layout:**
```zig
.texture = .{
    .sample_type = 2, // UnfilterableFloat (r32float, rg32float)
    // OR: sample_type = 1 for FilterableFloat (rgba8unorm, rgba16float)
    .view_dimension = .@"2d",
    .multisampled = false,
}
```

**Texture Creation:**
```zig
var tex = try device.createTexture(W, H, gpu.TextureFormat.R32Float, .{
    .texture_binding = true,  // ← Key flag
    .storage_binding = false,
});
```

**Shader:**
```wgsl
@group(0) @binding(0) var my_tex: texture_2d<f32>;

// Read in shader
let value = textureLoad(my_tex, coords, 0);
```

---

### Write-Only Storage Texture (for Writing)

**Use when:** Writing output data from compute shaders

**Bind Group Layout:**
```zig
.storage_texture = .{
    .access = 1, // WriteOnly - ONLY allowed mode in core WebGPU
    .format = .r32float, // Or .rg32float
    .view_dimension = .@"2d",
}
```

**Texture Creation:**
```zig
var tex = try device.createTexture(W, H, gpu.TextureFormat.R32Float, .{
    .texture_binding = false,
    .storage_binding = true,  // ← Key flag
});
```

**Shader:**
```wgsl
@group(0) @binding(0) var output: texture_storage_2d<r32float, write>;

// Write in shader
textureStore(output, coords, vec4<f32>(value, 0.0, 0.0, 0.0));
```

---

### Uniform Buffer

**Use when:** Small, frequently updated data (< 64KB recommended)

**Bind Group Layout:**
```zig
.buffer = .{
    .type = 1, // Uniform
    .has_dynamic_offset = false,
    .min_binding_size = 0,
}
```

**Buffer Creation:**
```zig
var buf = try device.createBuffer(size, .{
    .uniform = true,
    .copy_dst = true, // If you need to write to it
});
```

**Shader:**
```wgsl
struct Uniforms {
    data: vec4<f32>,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
```

**⚠️ Known Issue:** Uniform buffers in render passes have a mapping issue. Use in compute passes or avoid for now.

---

### Storage Buffer

**Use when:** Large data arrays, read/write access needed

**Bind Group Layout:**
```zig
.buffer = .{
    .type = 3, // read-only-storage
    // OR: type = 2 for storage (read-write)
    .has_dynamic_offset = false,
    .min_binding_size = 0,
}
```

**Buffer Creation:**
```zig
var buf = try device.createBuffer(size, .{
    .storage = true,
    .copy_dst = true,
});
```

**Shader:**
```wgsl
// Read-only
@group(0) @binding(0) var<storage, read> data: array<f32>;

// Read-write
@group(0) @binding(0) var<storage, read_write> data: array<f32>;
```

---

### Sampler

**Use when:** Filtering/interpolating sampled textures

**Bind Group Layout:**
```zig
.sampler = .{
    .type = 1, // Filtering sampler
    // OR: type = 2 for non-filtering
}
```

**Sampler Creation:**
```zig
var sampler = try device.createSampler(null); // Uses defaults
// OR specify custom descriptor
```

**Shader:**
```wgsl
@group(0) @binding(0) var my_sampler: sampler;
@group(0) @binding(1) var my_tex: texture_2d<f32>;

// Use with textureSample (needs sampler for filtering)
let value = textureSample(my_tex, my_sampler, uv);
```

---

## 🎯 Common Patterns

### Pattern 1: Compute Kernel with Multiple Inputs, One Output

```zig
// Layout
var bgl = try device.createBindGroupLayout(&[_]gpu.BindGroupLayoutEntry{
    // Input 1 (sampled)
    .{ 
        .binding = 0, 
        .visibility = wgpu.ShaderStage_COMPUTE,
        .texture = .{ .sample_type = 2, .view_dimension = .@"2d", .multisampled = false },
    },
    // Input 2 (sampled)
    .{ 
        .binding = 1, 
        .visibility = wgpu.ShaderStage_COMPUTE,
        .texture = .{ .sample_type = 2, .view_dimension = .@"2d", .multisampled = false },
    },
    // Output (write-only storage)
    .{ 
        .binding = 2, 
        .visibility = wgpu.ShaderStage_COMPUTE,
        .storage_texture = .{ .access = 1, .format = .r32float, .view_dimension = .@"2d" },
    },
});
```

### Pattern 2: Render Pass with Samplers

```zig
var bgl = try device.createBindGroupLayout(&[_]gpu.BindGroupLayoutEntry{
    // Uniform buffer
    .{ 
        .binding = 0, 
        .visibility = wgpu.ShaderStage_FRAGMENT,
        .buffer = .{ .type = 1, .has_dynamic_offset = false, .min_binding_size = 0 },
    },
    // Texture
    .{ 
        .binding = 1, 
        .visibility = wgpu.ShaderStage_FRAGMENT,
        .texture = .{ .sample_type = 1, .view_dimension = .@"2d", .multisampled = false },
    },
    // Sampler
    .{ 
        .binding = 2, 
        .visibility = wgpu.ShaderStage_FRAGMENT,
        .sampler = .{ .type = 1 },
    },
});
```

---

## 🔢 Enum Values Quick Reference

### Shader Stage
- `wgpu.ShaderStage_VERTEX` = 0x00000001
- `wgpu.ShaderStage_FRAGMENT` = 0x00000002
- `wgpu.ShaderStage_COMPUTE` = 0x00000004

### Buffer Binding Type
- `0` = Undefined
- `1` = Uniform
- `2` = Storage (read-write)
- `3` = ReadOnlyStorage

### Texture Sample Type
- `0` = Undefined
- `1` = Float (filterable - for rgba8unorm, rgba16float)
- `2` = **UnfilterableFloat** (for r32float, rg32float, rgba32float)
- `3` = Depth
- `4` = Sint (signed integer)
- `5` = Uint (unsigned integer)

### Storage Texture Access
- `0` = Undefined
- `1` = **WriteOnly** (ONLY allowed in core WebGPU)
- `2` = ReadOnly (requires native extension)
- `3` = ReadWrite (requires native extension)

### Sampler Type
- `0` = Undefined
- `1` = Filtering
- `2` = NonFiltering
- `3` = Comparison

---

## 💡 Best Practices

1. **Always use `r32float` or `rg32float` for compute kernels**
   - Universally supported
   - Works for both sampling and storage

2. **Prefer sampled textures for inputs**
   - Better cache utilization
   - Read-only storage not available anyway

3. **Use write-only storage for outputs**
   - Only option in core WebGPU
   - Sufficient for one-write-per-pixel kernels

4. **Double-buffering pattern**
   - Frame N: Read from A, write to B
   - Frame N+1: Read from B, write to A
   - Swap texture views each frame

5. **Minimize bind group changes**
   - Group related resources
   - Use dynamic offsets for uniform buffers when possible

---

## 🚨 Common Pitfalls

❌ **DON'T:** Use `rgba32float` for storage textures
✅ **DO:** Use `r32float` or `rg32float`

❌ **DON'T:** Try to use read-only or read-write storage textures  
✅ **DO:** Use sampled textures for reading, write-only storage for writing

❌ **DON'T:** Use `sample_type = 3` for float textures
✅ **DO:** Use `sample_type = 1` (filterable) or `2` (unfilterable)

❌ **DON'T:** Use `access = 2` or `3` for storage textures
✅ **DO:** Use `access = 1` (WriteOnly)

❌ **DON'T:** Mix up texture_binding and storage_binding flags
✅ **DO:** texture_binding for sampling, storage_binding for storage writes

---

## 📚 Related Documentation

- `PHASE5_COMPLETE.md` - Detailed discovery process
- `KNOWN_ISSUES.md` - Known limitations and workarounds
- WebGPU Spec: https://gpuweb.github.io/gpuweb/

---

**Last Updated:** November 11, 2025 (Phase 5 Complete)
