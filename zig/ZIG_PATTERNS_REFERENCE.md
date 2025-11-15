# Zig Programming Patterns - Quick Reference
**For Fluid Simulation Development**

---

## 🎯 Core Principles

### 1. Explicit Allocator Passing
**Always pass allocators as parameters:**
```zig
// ✅ Good
pub fn init(allocator: std.mem.Allocator) !Self {
    const buffer = try allocator.alloc(u8, size);
    return Self{ .buffer = buffer };
}

// ❌ Bad - Hidden global allocator
var global_gpa: std.heap.GeneralPurposeAllocator(.{}) = .{};
pub fn init() !Self {
    const buffer = try global_gpa.allocator().alloc(u8, size);
    return Self{ .buffer = buffer };
}
```

### 2. No Hidden Control Flow
**Every allocation, error, performance cost is visible:**
```zig
// ✅ Good - Explicit error handling
const file = try std.fs.cwd().openFile("config.json", .{});
defer file.close();

// ❌ Bad (if Zig had exceptions)
// const file = openFileOrThrow("config.json");
```

---

## 💾 Memory Management Patterns

### Pattern 1: Arena for Frame-Local Data
**Use Case:** Temporary data that lives for one frame
```zig
pub fn update(self: *App) !void {
    const frame_alloc = self.frame_arena.allocator();
    defer _ = self.frame_arena.reset(.{.retain_with_limit = 16384});
    
    // All temp allocations use frame_alloc
    const temp_buffer = try frame_alloc.alloc(f32, 1024);
    // No manual free - reset() cleans everything
}
```

**Why:** 
- O(1) free for all allocations
- Eliminates fragmentation
- Retains memory between frames (16KB)

### Pattern 2: Pool for Frequent Objects
**Use Case:** Objects created/destroyed constantly (particles, splats)
```zig
var particle_pool = Pool(Particle).init(gpa.allocator());
defer particle_pool.deinit();

// Create (O(1), reuses memory)
const particle = try particle_pool.create();
particle.* = Particle{ .x = 10, .y = 20 };

// Destroy (O(1), returns to pool)
particle_pool.destroy(particle);
```

**Why:**
- 65-86× faster than GPA
- Zero fragmentation
- Predictable performance

### Pattern 3: Fixed Buffer for Known Sizes
**Use Case:** Predictable data sizes, hot paths
```zig
fn processVelocities() !void {
    var buffer: [4096]u8 = undefined;
    var fba = std.heap.FixedBufferAllocator.init(&buffer);
    const allocator = fba.allocator();
    
    // Ultra-fast stack allocation
    const data = try allocator.alloc(f32, 256);
}
```

**Why:**
- Zero heap allocations
- Maximum speed
- Compile-time size verification

### Pattern 4: Pre-allocated Buffers in Structs
**Use Case:** Bounded collections, no frame allocations
```zig
const App = struct {
    splats: [MAX_SPLATS_PER_FRAME]Splat,
    splat_count: usize,
    
    pub fn addSplat(self: *App, splat: Splat) !void {
        if (self.splat_count >= MAX_SPLATS_PER_FRAME) {
            return error.TooManySplats;
        }
        self.splats[self.splat_count] = splat;
        self.splat_count += 1;
    }
};
```

**Why:**
- Zero allocations in hot path
- Predictable memory usage
- Compile-time bounds checking

---

## ⚡ Performance Patterns

### Pattern 5: Structure of Arrays (SoA)
**Use Case:** Iterating over single fields
```zig
// ❌ Array of Structures (AoS) - cache inefficient
const ParticlesAoS = struct {
    particles: []Particle, // {pos, vel, color, life}
    
    pub fn updatePositions(self: *Self, dt: f32) void {
        for (self.particles) |*p| {
            // Loads 32 bytes, uses 12 (37.5% efficiency)
            p.pos += p.vel * dt;
        }
    }
};

// ✅ Structure of Arrays (SoA) - cache optimal
const ParticlesSoA = struct {
    positions: [][3]f32,
    velocities: [][3]f32,
    colors: []u32,
    lifetimes: []f32,
    
    pub fn updatePositions(self: *Self, dt: f32) void {
        for (self.positions, self.velocities) |*pos, vel| {
            // 16 positions per cache line (100% efficiency)
            pos[0] += vel[0] * dt;
            pos[1] += vel[1] * dt;
            pos[2] += vel[2] * dt;
        }
    }
};

// ✅ Or use MultiArrayList (best of both worlds)
var particles = std.MultiArrayList(Particle){};
const positions = particles.items(.position);
const velocities = particles.items(.velocity);
```

### Pattern 6: SIMD with @Vector
**Use Case:** Vectorizable computations
```zig
const Vec4f32 = @Vector(4, f32);

fn solvePressure(pressure: []f32, divergence: []const f32, width: usize) void {
    @setRuntimeSafety(false); // Disable bounds checks
    
    var x: usize = 0;
    while (x + 4 <= width) : (x += 4) {
        const left: Vec4f32 = pressure[x - 1..][0..4].*;
        const right: Vec4f32 = pressure[x + 1..][0..4].*;
        const top: Vec4f32 = pressure[x - width..][0..4].*;
        const bottom: Vec4f32 = pressure[x + width..][0..4].*;
        const div: Vec4f32 = divergence[x..][0..4].*;
        
        // 4 operations in parallel
        const result = (left + right + top + bottom - div) * @as(Vec4f32, @splat(0.25));
        
        @memcpy(pressure[x..][0..4], @as([4]f32, result)[0..]);
    }
}
```

**Why:**
- 4× throughput (or 8× with AVX)
- Automatic CPU instruction selection
- Portable across architectures

### Pattern 7: Comptime Specialization
**Use Case:** Known dimensions at compile time
```zig
fn FluidGrid(comptime W: usize, comptime H: usize) type {
    return struct {
        pressure: [W * H]f32,
        
        pub fn solve(self: *@This()) void {
            // Compiler knows exact size, can:
            // - Unroll loops
            // - Eliminate bounds checks
            // - Optimize memory layout
            comptime var y = 1;
            inline while (y < H - 1) : (y += 1) {
                comptime var x = 1;
                inline while (x < W - 1) : (x += 1) {
                    self.pressure[y * W + x] = compute(x, y);
                }
            }
        }
    };
}

// Usage
const Grid256 = FluidGrid(256, 256);
var grid: Grid256 = undefined;
```

**Why:**
- Zero runtime overhead
- Compiler can optimize aggressively
- Type safety for dimensions

### Pattern 8: Disable Safety in Hot Paths
**Use Case:** Validated, performance-critical code
```zig
fn criticalLoop(data: []f32) void {
    @setRuntimeSafety(false); // Scope-limited
    
    // No bounds checks, overflow checks
    for (data, 0..) |*value, i| {
        value.* = computeExpensive(i);
    }
}

// Or for entire file:
// @setRuntimeSafety(false);
```

**When:**
- After profiling shows safety checks matter
- Only in validated code
- Never in public APIs
- Use ReleaseFast build mode

---

## 🎮 Game Loop Patterns

### Pattern 9: Fixed Timestep with Interpolation
**Use Case:** Deterministic physics, smooth rendering
```zig
const GameLoop = struct {
    const FIXED_DT: f64 = 1.0 / 60.0;
    accumulator: f64 = 0.0,
    current_time: f64,
    
    pub fn run(self: *Self, app: *App) !void {
        var timer = try std.time.Timer.start();
        
        while (!app.shouldExit()) {
            const new_time = timerToSeconds(timer.read());
            var frame_time = new_time - self.current_time;
            
            // Prevent spiral of death
            if (frame_time > 0.25) frame_time = 0.25;
            
            self.current_time = new_time;
            self.accumulator += frame_time;
            
            // Fixed timestep updates
            while (self.accumulator >= FIXED_DT) {
                try app.simulation.update(FIXED_DT);
                self.accumulator -= FIXED_DT;
            }
            
            // Interpolated render
            const alpha = self.accumulator / FIXED_DT;
            try app.render(alpha);
        }
    }
};

// Interpolation in render:
fn renderParticles(particles: []Particle, alpha: f32) void {
    for (particles) |p| {
        const render_pos = lerp(p.prev_pos, p.pos, alpha);
        drawParticle(render_pos);
    }
}
```

**Why:**
- Deterministic simulation
- Network-safe (same timestep everywhere)
- Smooth rendering (interpolation)
- No frame-rate dependent physics

---

## 🔧 Error Handling Patterns

### Pattern 10: Error Sets
**Use Case:** Domain-specific errors
```zig
const RenderError = error{
    DeviceLost,
    OutOfMemory,
    ShaderCompileFailed,
    SwapchainOutOfDate,
};

pub fn render(self: *Renderer, scene: *Scene) RenderError!void {
    const commands = try self.buildCommandBuffer(scene);
    defer self.releaseCommandBuffer(commands);
    
    try self.submitCommands(commands);
}
```

### Pattern 11: errdefer for Cleanup
**Use Case:** Guaranteed cleanup on error paths
```zig
fn initRenderer(allocator: Allocator) !Renderer {
    const device = try createDevice();
    errdefer device.destroy(); // Only runs on error
    
    const swapchain = try createSwapchain(device);
    errdefer swapchain.destroy();
    
    const pipeline = try createPipeline(device);
    errdefer pipeline.destroy();
    
    return Renderer{ .device = device, .swapchain = swapchain, .pipeline = pipeline };
}
```

### Pattern 12: Graceful Degradation
**Use Case:** Real-time systems that can't crash
```zig
pub fn render(self: *Renderer, scene: *Scene) !void {
    self.tryRender(scene) catch |err| {
        std.log.err("Render error: {}. Degrading quality.", .{err});
        self.degradeQuality();
        return self.render(scene); // Retry
    };
}

fn degradeQuality(self: *Renderer) void {
    self.quality = switch (self.quality) {
        .High => .Medium,
        .Medium => .Low,
        .Low => .Fallback,
        .Fallback => .Fallback,
    };
    
    self.particle_count /= 2;
    self.resolution_scale /= 2;
}
```

---

## 🏗️ Architecture Patterns

### Pattern 13: Tagged Unions for Polymorphism
**Use Case:** Closed set of types, zero-cost dispatch
```zig
const GraphicsBackend = union(enum) {
    vulkan: VulkanRenderer,
    metal: MetalRenderer,
    d3d12: D3D12Renderer,
    
    pub fn render(self: *@This(), scene: *Scene) !void {
        switch (self.*) {
            inline else => |*impl| try impl.render(scene),
        }
    }
};

pub fn initBackend(allocator: Allocator) !GraphicsBackend {
    return switch (builtin.os.tag) {
        .windows => .{ .d3d12 = try D3D12Renderer.init(allocator) },
        .macos => .{ .metal = try MetalRenderer.init(allocator) },
        .linux => .{ .vulkan = try VulkanRenderer.init(allocator) },
        else => @compileError("Unsupported platform"),
    };
}
```

### Pattern 14: Comptime Interfaces
**Use Case:** Zero-cost abstractions
```zig
fn Renderer(comptime Impl: type) type {
    return struct {
        impl: Impl,
        
        pub fn render(self: *@This(), scene: *Scene) !void {
            // Compiler generates specialized code for each Impl
            try self.impl.renderImpl(scene);
        }
    };
}

// Usage
const VulkanRenderer = Renderer(VulkanImpl);
const MetalRenderer = Renderer(MetalImpl);
```

---

## 📦 Build System Patterns

### Pattern 15: Compile Shaders at Build Time
```zig
// build.zig
const shaders = [_][]const u8{"advection", "pressure", "display"};

for (shaders) |name| {
    const compile = b.addSystemCommand(&.{"glslangValidator"});
    compile.addArgs(&.{"-V", b.fmt("shaders/{s}.vert", .{name}), "-o"});
    const spv = compile.addOutputFileArg(b.fmt("{s}.vert.spv", .{name}));
    b.installFile(spv, b.fmt("shaders/{s}.vert.spv", .{name}));
}
```

### Pattern 16: Cross-compilation
```zig
// Single command for any platform
zig build -Dtarget=x86_64-windows -Doptimize=ReleaseFast
zig build -Dtarget=aarch64-macos
zig build -Dtarget=x86_64-linux
zig build -Dtarget=wasm32-freestanding # Web!
```

---

## 🧪 Testing Patterns

### Pattern 17: Leak Detection
```zig
const testing = std.testing;

test "fluid simulation cleanup" {
    var sim = try FluidSimulation.init(testing.allocator);
    defer sim.deinit();
    
    try sim.addParticles(100);
    try sim.update(0.016);
    
    // testing.allocator automatically detects:
    // - Memory leaks
    // - Use-after-free
    // - Double-free
}
```

---

## ⚠️ Anti-Patterns to Avoid

### ❌ Don't Allocate in Render Loops
```zig
// ❌ Bad
fn render() !void {
    const buffer = try allocator.alloc(Vertex, 1000); // Allocates every frame!
    defer allocator.free(buffer);
}

// ✅ Good
const App = struct {
    vertex_buffer: [1000]Vertex, // Pre-allocated
};
```

### ❌ Don't Use GPA in Hot Paths
```zig
// ❌ Bad (slow)
var gpa = std.heap.GeneralPurposeAllocator(.{}){};
const particle = try gpa.allocator().create(Particle);

// ✅ Good (fast)
const particle = try particle_pool.create();
```

### ❌ Don't Ignore ReleaseFast vs ReleaseSafe
```zig
// For production with critical data
zig build -Doptimize=ReleaseSafe

// For maximum performance (validated code)
zig build -Doptimize=ReleaseFast
```

### ❌ Don't Use Multiple @cImport
```zig
// ❌ Bad - Creates incompatible types
// file1.zig
const c = @cImport(@cInclude("SDL.h"));

// file2.zig
const c = @cImport(@cInclude("SDL.h")); // Different type!

// ✅ Good - Single import module
// c_bindings.zig
pub const c = @cImport(@cInclude("SDL.h"));

// Other files import from c_bindings
const c = @import("c_bindings.zig").c;
```

---

## 📚 Quick Decision Tree

**Need temporary data for one frame?**
→ Use Arena allocator with reset()

**Creating/destroying objects frequently?**
→ Use Pool allocator

**Known size at compile time?**
→ Use Fixed Buffer Allocator

**Bounded collection, hot path?**
→ Pre-allocate in struct

**Iterating over single field?**
→ Use Structure of Arrays

**Vectorizable math?**
→ Use @Vector

**Known dimensions at compile time?**
→ Use comptime specialization

**Performance-critical, validated code?**
→ @setRuntimeSafety(false)

**Deterministic simulation?**
→ Fixed timestep with interpolation

**Closed set of types?**
→ Tagged union

**Open set of types?**
→ VTable (rarely needed)

---

## 🎯 Performance Targets

**Frame Budget (60 FPS):**
- Total: 16.67ms
- Simulation: <8ms
- Rendering: <6ms
- UI: <1ms
- Overhead: <1ms

**Memory Budget:**
- Base: <50 MB
- Per-frame: 0 allocations (use arena)
- Pool objects: <1000 allocated
- GPU: <100 MB

**Optimization Priorities:**
1. Zero frame allocations
2. Cache-friendly data layout
3. SIMD where applicable
4. Minimize GPU state changes
5. Batch operations

---

**This reference card should be consulted for every feature implementation in Phase 8-17.**
