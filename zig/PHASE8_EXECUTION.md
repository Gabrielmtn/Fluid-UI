# Phase 8: Foundation Refactoring - Execution Guide
**Status:** READY TO START  
**Duration:** Week 1 (estimated 20-30 hours)  
**Goal:** Restructure codebase following Zig patterns without breaking existing functionality

---

## 🎯 Phase 8 Overview

This phase transforms our working prototype into a maintainable, scalable foundation:
- **No new features** - Only refactoring
- **All tests must pass** - Zero regressions
- **Performance improvement** - Target 60+ FPS
- **Code organization** - Clean separation of concerns

---

## 📋 Step-by-Step Execution

### Step 8.1.1: Add zig-gamedev Dependencies (30 min)

**Create `build.zig.zon`:**
```zig
.{
    .name = "fluid-sim",
    .version = "0.1.0",
    .paths = .{""},
    
    .dependencies = .{
        .zgpu = .{
            .url = "https://github.com/zig-gamedev/zig-gamedev/archive/main.tar.gz",
            .hash = "...", // zig will fill this in
        },
        .zmath = .{
            .url = "https://github.com/zig-gamedev/zig-gamedev/archive/main.tar.gz",
            .hash = "...",
        },
        .zgui = .{
            .url = "https://github.com/zig-gamedev/zig-gamedev/archive/main.tar.gz",
            .hash = "...",
        },
        .zglfw = .{
            .url = "https://github.com/zig-gamedev/zig-gamedev/archive/main.tar.gz",
            .hash = "...",
        },
    },
}
```

**Update `build.zig`:**
```zig
// Add dependencies
const zgpu_pkg = b.dependency("zgpu", .{
    .target = target,
    .optimize = optimize,
});

exe.root_module.addImport("zgpu", zgpu_pkg.module("root"));
// ... similar for zmath, zgui, zglfw
```

**Verify:**
```bash
zig build
# Should download and build dependencies
```

---

### Step 8.1.2: Create New Directory Structure (15 min)

```bash
cd zig
mkdir -p src/simulation
mkdir -p src/renderer
mkdir -p src/input
mkdir -p src/ui
mkdir -p src/network
mkdir -p src/util
```

**Move existing files:**
```bash
# Keep test files at root for now
# Move source files to src/
```

---

### Step 8.1.3: Create Pool Allocator Utility (45 min)

**File: `src/util/pool.zig`**
```zig
const std = @import("std");

/// Generic pool allocator for frequently created objects
/// Provides O(1) allocation/deallocation with zero fragmentation
pub fn Pool(comptime T: type) type {
    return struct {
        const Self = @This();
        const Node = std.TailQueue(T).Node;
        
        arena: std.heap.ArenaAllocator,
        free_list: std.TailQueue(T),
        allocated_count: usize,
        total_capacity: usize,
        
        pub fn init(allocator: std.mem.Allocator) Self {
            return .{
                .arena = std.heap.ArenaAllocator.init(allocator),
                .free_list = .{},
                .allocated_count = 0,
                .total_capacity = 0,
            };
        }
        
        pub fn deinit(self: *Self) void {
            self.arena.deinit();
        }
        
        /// Get object from pool (or allocate new)
        pub fn create(self: *Self) !*T {
            const node = if (self.free_list.popFirst()) |item| blk: {
                self.allocated_count += 1;
                break :blk item;
            } else blk: {
                const new_node = try self.arena.allocator().create(Node);
                self.total_capacity += 1;
                self.allocated_count += 1;
                break :blk new_node;
            };
            
            // Zero-initialize the data
            node.data = std.mem.zeroes(T);
            return &node.data;
        }
        
        /// Return object to pool (instant, no actual free)
        pub fn destroy(self: *Self, obj: *T) void {
            const node = @fieldParentPtr(Node, "data", obj);
            self.free_list.append(node);
            self.allocated_count -= 1;
        }
        
        pub fn getStats(self: *Self) PoolStats {
            return .{
                .allocated = self.allocated_count,
                .capacity = self.total_capacity,
                .free = self.total_capacity - self.allocated_count,
            };
        }
    };
}

pub const PoolStats = struct {
    allocated: usize,
    capacity: usize,
    free: usize,
};

// Unit test
test "Pool basic operations" {
    const Particle = struct {
        x: f32,
        y: f32,
        life: f32,
    };
    
    var pool = Pool(Particle).init(std.testing.allocator);
    defer pool.deinit();
    
    // Create
    const p1 = try pool.create();
    p1.x = 10.0;
    
    const p2 = try pool.create();
    p2.y = 20.0;
    
    try std.testing.expectEqual(@as(usize, 2), pool.allocated_count);
    
    // Destroy
    pool.destroy(p1);
    try std.testing.expectEqual(@as(usize, 1), pool.allocated_count);
    
    // Reuse
    const p3 = try pool.create();
    try std.testing.expectEqual(@as(usize, 2), pool.allocated_count);
    try std.testing.expectEqual(@as(usize, 2), pool.total_capacity);
}
```

**Test:**
```bash
zig test src/util/pool.zig
```

---

### Step 8.1.4: Create App Structure (1 hour)

**File: `src/app.zig`**
```zig
const std = @import("std");
const gpu = @import("gpu_backend_real.zig");
const Window = @import("win32_window.zig").Window;
const Simulation = @import("simulation/simulation.zig").FluidSimulation;
const Pool = @import("util/pool.zig").Pool;

pub const App = struct {
    const Self = @This();
    
    // Allocators
    gpa: std.heap.GeneralPurposeAllocator(.{}),
    frame_arena: std.heap.ArenaAllocator,
    persistent_arena: std.heap.ArenaAllocator,
    
    // Subsystems
    window: Window,
    device: *gpu.Device,
    simulation: Simulation,
    
    // Pools
    splat_pool: Pool(Splat),
    
    // Pre-allocated buffers
    splat_buffer: [MAX_SPLATS_PER_FRAME]Splat,
    
    // State
    should_exit: bool,
    frame_count: u64,
    
    const MAX_SPLATS_PER_FRAME = 128;
    
    pub const Splat = struct {
        x: f32,
        y: f32,
        dx: f32,
        dy: f32,
        color: [3]f32,
        radius: f32,
    };
    
    pub fn init(allocator: std.mem.Allocator, width: u32, height: u32) !*Self {
        var self = try allocator.create(Self);
        errdefer allocator.destroy(self);
        
        self.gpa = .{};
        const gpa_allocator = self.gpa.allocator();
        
        // Frame arena - reset every frame with retain
        self.frame_arena = std.heap.ArenaAllocator.init(gpa_allocator);
        
        // Persistent arena - for long-lived UI data
        self.persistent_arena = std.heap.ArenaAllocator.init(gpa_allocator);
        
        // Initialize window
        self.window = try Window.init(gpa_allocator, width, height, "Fluid Simulation");
        errdefer self.window.deinit();
        
        // Initialize GPU
        var instance = try gpu.Instance.init(gpa_allocator);
        defer instance.deinit();
        
        var adapter = try instance.requestAdapter();
        defer adapter.deinit();
        
        self.device = try adapter.requestDevice();
        errdefer self.device.deinit();
        
        // Initialize simulation
        self.simulation = try Simulation.init(gpa_allocator, self.device, 256, 192);
        errdefer self.simulation.deinit();
        
        // Initialize pools
        self.splat_pool = Pool(Splat).init(gpa_allocator);
        
        self.should_exit = false;
        self.frame_count = 0;
        self.splat_buffer = undefined;
        
        std.log.info("✅ App initialized", .{});
        
        return self;
    }
    
    pub fn deinit(self: *Self, allocator: std.mem.Allocator) void {
        self.simulation.deinit();
        self.device.deinit();
        self.window.deinit();
        self.splat_pool.deinit();
        self.persistent_arena.deinit();
        self.frame_arena.deinit();
        _ = self.gpa.deinit();
        allocator.destroy(self);
    }
    
    pub fn run(self: *Self) !void {
        var timer = try std.time.Timer.start();
        const tick_ns = std.time.ns_per_s / 60;
        var last_tick: u64 = 0;
        var accumulator: f64 = 0.0;
        const FIXED_DT: f64 = 1.0 / 60.0;
        
        while (!self.shouldExit()) {
            const now = timer.read();
            var frame_time = @as(f64, @floatFromInt(now - last_tick)) / 
                            @as(f64, @floatFromInt(std.time.ns_per_s));
            
            // Cap frame time to prevent spiral of death
            if (frame_time > 0.25) frame_time = 0.25;
            
            last_tick = now;
            accumulator += frame_time;
            
            // Fixed timestep updates
            while (accumulator >= FIXED_DT) {
                try self.update(FIXED_DT);
                accumulator -= FIXED_DT;
            }
            
            // Render with interpolation
            const alpha = accumulator / FIXED_DT;
            try self.render(alpha);
            
            self.frame_count += 1;
        }
    }
    
    fn update(self: *Self, dt: f64) !void {
        // Get frame-local allocator (will be reset after this frame)
        const frame_alloc = self.frame_arena.allocator();
        defer _ = self.frame_arena.reset(.{.retain_with_limit = 16384});
        
        _ = frame_alloc; // Will use this for temporary allocations
        _ = dt;
        
        // Poll window events
        self.window.pollEvents();
        
        // Get mouse input
        const mouse = self.window.getMouseState();
        _ = mouse; // TODO: Generate splats
        
        // Update simulation
        // TODO: Call simulation update
    }
    
    fn render(self: *Self, alpha: f64) !void {
        _ = alpha;
        
        // TODO: Render simulation
        self.window.present();
    }
    
    fn shouldExit(self: *Self) bool {
        return self.window.shouldClose() or self.should_exit;
    }
};
```

---

### Step 8.1.5: Refactor FluidSimulation (1.5 hours)

**File: `src/simulation/simulation.zig`**
```zig
const std = @import("std");
const gpu = @import("../gpu_backend_real.zig");
const Textures = @import("textures.zig").FluidTextures;
const Pipelines = @import("pipelines.zig").PipelineManager;

pub const FluidSimulation = struct {
    const Self = @This();
    
    allocator: std.mem.Allocator,
    device: *gpu.Device,
    
    textures: Textures,
    pipelines: Pipelines,
    
    // Simulation parameters
    curl_strength: f32 = 30.0,
    pressure_iterations: u32 = 20,
    velocity_dissipation: f32 = 0.98,
    density_dissipation: f32 = 0.99,
    
    // Grid dimensions
    sim_width: u32,
    sim_height: u32,
    
    pub fn init(allocator: std.mem.Allocator, device: *gpu.Device, width: u32, height: u32) !Self {
        var textures = try Textures.init(device, width, height, width, height);
        errdefer textures.deinit();
        
        var pipelines = try Pipelines.init(allocator, device);
        errdefer pipelines.deinit();
        
        return Self{
            .allocator = allocator,
            .device = device,
            .textures = textures,
            .pipelines = pipelines,
            .sim_width = width,
            .sim_height = height,
        };
    }
    
    pub fn deinit(self: *Self) void {
        self.pipelines.deinit();
        self.textures.deinit();
    }
    
    pub fn step(self: *Self, dt: f32) !void {
        _ = dt;
        // TODO: Implement simulation step
        // Will call kernels in sequence
    }
    
    pub fn applySplat(self: *Self, x: f32, y: f32, dx: f32, dy: f32, color: [3]f32, radius: f32) !void {
        _ = self;
        _ = x;
        _ = y;
        _ = dx;
        _ = dy;
        _ = color;
        _ = radius;
        // TODO: Apply force to velocity field
        // TODO: Apply color to density field
    }
};
```

---

### Step 8.1.6: Create Pipeline Manager (1 hour)

**File: `src/simulation/pipelines.zig`**
```zig
const std = @import("std");
const gpu = @import("../gpu_backend_real.zig");
const wgpu = @import("../wgpu.zig");

pub const PipelineManager = struct {
    const Self = @This();
    
    allocator: std.mem.Allocator,
    device: *gpu.Device,
    
    // Compute pipelines
    advection: ComputePipelineData,
    divergence: ComputePipelineData,
    pressure: ComputePipelineData,
    gradient: ComputePipelineData,
    curl: ComputePipelineData,
    
    pub const ComputePipelineData = struct {
        pipeline: gpu.ComputePipeline,
        bind_group_layout: gpu.BindGroupLayout,
        pipeline_layout: gpu.PipelineLayout,
    };
    
    pub fn init(allocator: std.mem.Allocator, device: *gpu.Device) !Self {
        var self = Self{
            .allocator = allocator,
            .device = device,
            .advection = undefined,
            .divergence = undefined,
            .pressure = undefined,
            .gradient = undefined,
            .curl = undefined,
        };
        
        // Load shaders
        const advection_shader = try loadShader(device, "shaders/advection_split.wgsl");
        defer advection_shader.deinit();
        
        // Create advection pipeline
        self.advection = try createAdvectionPipeline(device, &advection_shader);
        errdefer self.advection.deinit();
        
        // TODO: Create other pipelines
        
        return self;
    }
    
    pub fn deinit(self: *Self) void {
        self.advection.bind_group_layout.deinit();
        self.advection.pipeline_layout.deinit();
        self.advection.pipeline.deinit();
        // TODO: Deinit other pipelines
    }
    
    fn createAdvectionPipeline(device: *gpu.Device, shader: *gpu.ShaderModule) !ComputePipelineData {
        const bgl = try device.createBindGroupLayout(&[_]gpu.BindGroupLayoutEntry{
            .{ .binding = 0, .visibility = wgpu.ShaderStage_COMPUTE, .texture = .{ .sample_type = 2, .view_dimension = .@"2d", .multisampled = false } },
            .{ .binding = 1, .visibility = wgpu.ShaderStage_COMPUTE, .texture = .{ .sample_type = 2, .view_dimension = .@"2d", .multisampled = false } },
            .{ .binding = 2, .visibility = wgpu.ShaderStage_COMPUTE, .texture = .{ .sample_type = 2, .view_dimension = .@"2d", .multisampled = false } },
            .{ .binding = 3, .visibility = wgpu.ShaderStage_COMPUTE, .texture = .{ .sample_type = 2, .view_dimension = .@"2d", .multisampled = false } },
            .{ .binding = 4, .visibility = wgpu.ShaderStage_COMPUTE, .storage_texture = .{ .access = 1, .format = .r32float, .view_dimension = .@"2d" } },
            .{ .binding = 5, .visibility = wgpu.ShaderStage_COMPUTE, .storage_texture = .{ .access = 1, .format = .r32float, .view_dimension = .@"2d" } },
        });
        errdefer bgl.deinit();
        
        const layout = try device.createPipelineLayout(&[_]*gpu.BindGroupLayout{&bgl});
        errdefer layout.deinit();
        
        const pipeline = try device.createComputePipeline(shader, "advection", &layout);
        
        return .{
            .pipeline = pipeline,
            .bind_group_layout = bgl,
            .pipeline_layout = layout,
        };
    }
    
    fn loadShader(device: *gpu.Device, path: []const u8) !gpu.ShaderModule {
        const file = try std.fs.cwd().openFile(path, .{});
        defer file.close();
        
        const source = try file.readToEndAlloc(std.heap.page_allocator, 1024 * 1024);
        defer std.heap.page_allocator.free(source);
        
        const wgsl_source = try std.heap.page_allocator.allocSentinel(u8, source.len, 0);
        defer std.heap.page_allocator.free(wgsl_source);
        @memcpy(wgsl_source, source);
        
        return device.createShaderModule(wgsl_source);
    }
};
```

---

### Step 8.1.7: Update Main Entry Point (30 min)

**File: `src/main.zig`**
```zig
const std = @import("std");
const App = @import("app.zig").App;

pub fn main() !void {
    std.log.info("🌊 GPU Fluid Simulation - Starting (Phase 8 Refactor)...", .{});
    
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();
    
    var app = try App.init(allocator, 1024, 768);
    defer app.deinit(allocator);
    
    try app.run();
    
    std.log.info("✅ Shutdown complete", .{});
}
```

---

### Step 8.1.8: Update Build System (30 min)

**Update `build.zig`:**
- Point to new `src/main.zig`
- Add util module
- Add simulation module
- Add zig-gamedev dependencies

---

### Step 8.1.9: Run All Tests (15 min)

```bash
zig build test
# Should pass all existing tests

zig build sim
# Should compile and run with new structure
```

---

## ✅ Step 8.1 Completion Checklist

- [ ] zig-gamedev dependencies added
- [ ] New directory structure created
- [ ] Pool allocator implemented and tested
- [ ] App struct created with allocator hierarchy
- [ ] FluidSimulation refactored into module
- [ ] PipelineManager extracted
- [ ] Main entry point updated
- [ ] Build system updated
- [ ] All tests passing
- [ ] Application runs without regression

---

## 📊 Expected Outcomes

**Performance:**
- Frame arena eliminates 99% of frame allocations
- Pool allocator for splats: 65-86× faster than GPA
- No GC pauses (not applicable, but consistent timing)

**Code Quality:**
- Clear separation of concerns
- Each module has single responsibility
- Easy to add new features
- Better testability

**Developer Experience:**
- Easy to navigate codebase
- Clear dependencies
- Explicit memory management
- No hidden costs

---

## 🚀 Next: Step 8.2

Once Step 8.1 is complete, we'll move to Step 8.2: zgpu integration, replacing raw wgpu calls with higher-level abstractions.

---

**Estimated Time for Step 8.1:** 6-8 hours  
**Can be completed in:** 1-2 days  
**Complexity:** Medium - Mostly mechanical refactoring
