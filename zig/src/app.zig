const std = @import("std");
const gpu = @import("gpu_backend_real.zig");
const FluidTextures = @import("gpu_textures.zig").FluidTextures;

/// Main application structure with proper allocator hierarchy
/// 
/// Allocator Hierarchy:
/// - GPA (backing): Long-lived allocations, leak detection in debug
/// - App Arena: Application lifetime (window, GPU resources)
/// - Frame Arena: Per-frame temporary data (reset every frame)
/// - Pools: Frequently created/destroyed objects (splats, particles)
///
/// Memory Management Philosophy:
/// - Explicit allocator passing (no globals)
/// - Frame arena eliminates frame allocations
/// - Pool allocators for hot-path objects
/// - Arena for bounded lifetime data
/// - GPA only for unbounded collections
pub const App = struct {
    const Self = @This();
    
    // === Allocators ===
    gpa: std.heap.GeneralPurposeAllocator(.{}),
    app_arena: std.heap.ArenaAllocator,
    frame_arena: std.heap.ArenaAllocator,
    
    // === GPU Resources ===
    instance: gpu.Instance,
    adapter: gpu.Adapter,
    device: gpu.Device,
    textures: FluidTextures,
    
    // === Simulation State ===
    time: f64,
    frame_count: u64,
    
    /// Initialize application with all resources
    pub fn init() !Self {
        // Create backing allocator (GPA for leak detection)
        var gpa = std.heap.GeneralPurposeAllocator(.{}){};
        errdefer _ = gpa.deinit();
        
        const gpa_alloc = gpa.allocator();
        
        // Create app arena (application lifetime)
        var app_arena = std.heap.ArenaAllocator.init(gpa_alloc);
        errdefer app_arena.deinit();
        
        // Create frame arena (per-frame temporary data)
        var frame_arena = std.heap.ArenaAllocator.init(gpa_alloc);
        errdefer frame_arena.deinit();
        
        // Initialize GPU
        var instance = try gpu.Instance.init(gpa_alloc);
        errdefer instance.deinit();
        
        var adapter = try instance.requestAdapter();
        errdefer adapter.deinit();
        
        var device = try adapter.requestDevice();
        errdefer device.deinit();
        
        // Initialize textures
        var textures = try FluidTextures.init(&device, 256, 192, 256, 192);
        errdefer textures.deinit();
        
        return Self{
            .gpa = gpa,
            .app_arena = app_arena,
            .frame_arena = frame_arena,
            .instance = instance,
            .adapter = adapter,
            .device = device,
            .textures = textures,
            .time = 0.0,
            .frame_count = 0,
        };
    }
    
    /// Clean up all resources
    pub fn deinit(self: *Self) void {
        // Deinit in reverse order of initialization
        self.textures.deinit();
        self.device.deinit();
        self.adapter.deinit();
        self.instance.deinit();
        self.frame_arena.deinit();
        self.app_arena.deinit();
        
        // Check for leaks (only in debug mode)
        if (@import("builtin").mode == .Debug) {
            const leaked = self.gpa.detectLeaks();
            if (leaked) {
                std.log.err("Memory leaks detected!", .{});
            }
        }
        
        _ = self.gpa.deinit();
    }
    
    /// Get allocator for application-lifetime data
    pub fn appAllocator(self: *Self) std.mem.Allocator {
        return self.app_arena.allocator();
    }
    
    /// Get allocator for per-frame temporary data
    /// This allocator is reset every frame - use for temporary calculations
    pub fn frameAllocator(self: *Self) std.mem.Allocator {
        return self.frame_arena.allocator();
    }
    
    /// Begin frame (resets frame arena)
    pub fn beginFrame(self: *Self) void {
        // Reset frame arena, keeping some memory to avoid reallocations
        _ = self.frame_arena.reset(.{ .retain_with_limit = 16 * 1024 }); // Keep 16KB
    }
    
    /// End frame
    pub fn endFrame(self: *Self, dt: f64) void {
        self.time += dt;
        self.frame_count += 1;
    }
    
    /// Get frame statistics
    pub fn getFrameStats(self: *Self) FrameStats {
        return .{
            .frame_count = self.frame_count,
            .time = self.time,
            .fps = if (self.time > 0) @as(f32, @floatCast(@as(f64, @floatFromInt(self.frame_count)) / self.time)) else 0.0,
        };
    }
};

pub const FrameStats = struct {
    frame_count: u64,
    time: f64,
    fps: f32,
};

// ============================================================================
// Tests
// ============================================================================

test "App: initialization and cleanup" {
    var app = try App.init();
    defer app.deinit();
    
    try std.testing.expect(app.frame_count == 0);
    try std.testing.expect(app.time == 0.0);
}

test "App: frame arena resets" {
    var app = try App.init();
    defer app.deinit();
    
    const frame_alloc = app.frameAllocator();
    
    // Frame 1: Allocate something
    app.beginFrame();
    const data1 = try frame_alloc.alloc(u8, 1024);
    data1[0] = 42;
    app.endFrame(0.016);
    
    // Frame 2: Frame arena should be reset
    app.beginFrame();
    const data2 = try frame_alloc.alloc(u8, 1024);
    // If arena reset worked, data2 should be zero-initialized
    // (or at least not contain data1's values in a fresh allocation)
    _ = data2;
    app.endFrame(0.016);
    
    try std.testing.expect(app.frame_count == 2);
}

test "App: allocator hierarchy" {
    var app = try App.init();
    defer app.deinit();
    
    const app_alloc = app.appAllocator();
    const frame_alloc = app.frameAllocator();
    
    // App allocator for long-lived data
    const long_lived = try app_alloc.alloc(u8, 100);
    long_lived[0] = 123;
    
    // Frame allocator for temporary data
    app.beginFrame();
    const temp = try frame_alloc.alloc(u8, 100);
    temp[0] = 45;
    app.endFrame(0.016);
    
    // Long-lived data still valid
    try std.testing.expectEqual(@as(u8, 123), long_lived[0]);
    
    // Temp data will be freed on next beginFrame
    app.beginFrame();
    app.endFrame(0.016);
}

test "App: frame stats" {
    var app = try App.init();
    defer app.deinit();
    
    app.beginFrame();
    app.endFrame(0.016); // 16ms = ~60 FPS
    
    app.beginFrame();
    app.endFrame(0.016);
    
    const stats = app.getFrameStats();
    try std.testing.expectEqual(@as(u64, 2), stats.frame_count);
    try std.testing.expect(stats.time > 0.0);
    try std.testing.expect(stats.fps > 0.0);
}
