# WebGPU Integration for Zig Fluid Simulation

## Goal
Integrate wgpu-native to run fluid simulation on GPU, achieving 60+ fps at high resolution.

---

## Approach: wgpu-native C Bindings

We'll use **wgpu-native** - the C bindings for wgpu (Rust WebGPU implementation).

### Why wgpu-native?
- ✅ Mature, battle-tested WebGPU implementation
- ✅ C API - easy FFI from Zig
- ✅ Cross-platform (Windows, Linux, macOS)
- ✅ Supports DX12, Vulkan, Metal backends
- ✅ Active development by Mozilla/gfx-rs team

---

## Installation Steps

### 1. Download wgpu-native (Windows)

**Option A: Pre-built binaries** (Recommended)
```powershell
# Download from: https://github.com/gfx-rs/wgpu-native/releases
# Get: wgpu-windows-x86_64-release.zip

# Extract to:
# Z:\New folder\Fluid-UI\zig\vendor\wgpu-native\
#   ├── include\
#   │   └── wgpu.h
#   └── lib\
#       └── wgpu_native.dll.lib
#       └── wgpu_native.dll
```

**Option B: Build from source** (Advanced)
```powershell
# Requires Rust toolchain
git clone https://github.com/gfx-rs/wgpu-native.git
cd wgpu-native
cargo build --release
# Copy target/release/wgpu_native.dll and wgpu.h
```

### 2. Update build.zig

```zig
// Add wgpu-native to build
exe.addIncludePath(.{ .cwd_relative = "vendor/wgpu-native/include" });
exe.addLibraryPath(.{ .cwd_relative = "vendor/wgpu-native/lib" });
exe.linkSystemLibrary("wgpu_native");

// Install DLL alongside exe
const install_dll = b.addInstallFile(
    .{ .cwd_relative = "vendor/wgpu-native/lib/wgpu_native.dll" },
    "bin/wgpu_native.dll"
);
b.getInstallStep().dependOn(&install_dll.step);
```

---

## Architecture

### File Structure
```
zig/src/
├── gpu.zig           → WebGPU context & device (IMPLEMENT)
├── gpu_sim.zig       → GPU simulation manager (IMPLEMENT)
├── gpu_textures.zig  → Texture creation & management (NEW)
├── gpu_pipelines.zig → Compute pipeline setup (NEW)
├── shaders.zig       → Shader loading (ALREADY DONE ✓)
└── main.zig          → Main loop (UPDATE)
```

### Data Flow
```
┌─────────────┐
│   main.zig  │ ← User input, window events
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ gpu_sim.zig │ ← High-level simulation API
└──────┬──────┘
       │
       ├──────────────────┬──────────────────┐
       ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│gpu_textures  │  │gpu_pipelines │  │   shaders    │
│  .zig        │  │    .zig      │  │    .zig      │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                  │                  │
       └──────────────────┴──────────────────┘
                          │
                          ▼
                   ┌──────────────┐
                   │   gpu.zig    │ ← WebGPU device
                   └──────────────┘
                          │
                          ▼
                   ┌──────────────┐
                   │ wgpu-native  │ ← C library
                   └──────────────┘
```

---

## Implementation Plan

### Phase 1: Basic GPU Setup (TODAY)
- [x] Download wgpu-native binaries
- [ ] Create Zig bindings for wgpu.h
- [ ] Initialize GPU device
- [ ] Create simple test (clear texture)

### Phase 2: Texture Management (TODAY)
- [ ] Create velocity textures (ping-pong)
- [ ] Create density textures (ping-pong)
- [ ] Create pressure textures (ping-pong)
- [ ] Implement texture readback for display

### Phase 3: Compute Pipelines (TOMORROW)
- [ ] Load WGSL shaders
- [ ] Create compute pipelines for each shader
- [ ] Set up bind groups
- [ ] Implement dispatch

### Phase 4: Integration (TOMORROW)
- [ ] Wire GPU sim to main loop
- [ ] Replace CPU sim with GPU
- [ ] Benchmark performance
- [ ] Verify correctness

---

## Expected Performance

### Current (CPU)
- Resolution: 512x288
- FPS: ~7
- Frame time: ~140ms

### Target (GPU)
- Resolution: 1024x576 (4x pixels)
- FPS: 60+
- Frame time: <16ms
- **Speedup: 50-100x**

---

## Shader Compilation

Our WGSL shaders are already ready:
```
zig/shaders/
├── advection.wgsl   ✓
├── divergence.wgsl  ✓
├── curl.wgsl        ✓
├── pressure.wgsl    ✓
├── gradient.wgsl    ✓
├── display.wgsl     ✓
└── splat.wgsl       ✓
```

wgpu-native will compile these at runtime to:
- **Windows:** DXIL (DirectX 12)
- **Linux:** SPIR-V (Vulkan)
- **macOS:** MSL (Metal)

---

## Next Steps (RIGHT NOW)

1. **Download wgpu-native** (5 min)
2. **Create wgpu bindings** (30 min)
3. **Initialize device** (30 min)
4. **Test with simple compute shader** (30 min)

Total: ~2 hours to GPU-ready!

---

## Resources

- wgpu-native: https://github.com/gfx-rs/wgpu-native
- WebGPU spec: https://www.w3.org/TR/webgpu/
- WGSL spec: https://www.w3.org/TR/WGSL/
- wgpu examples: https://github.com/gfx-rs/wgpu/tree/trunk/examples
