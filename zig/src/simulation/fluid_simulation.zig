const std = @import("std");
const gpu = @import("gpu_backend_real.zig");
const FluidTextures = @import("gpu_textures.zig").FluidTextures;

/// Fluid simulation state and configuration
/// 
/// Responsibilities:
/// - Manages simulation parameters (dissipation, pressure, curl)
/// - Coordinates simulation step execution
/// - Tracks simulation state (time, frame count)
/// - Provides clean API for simulation control
///
/// Does NOT manage:
/// - GPU resources (handled by PipelineManager)
/// - Window/rendering (handled by App)
/// - Input handling (handled by InputManager)
pub const FluidSimulation = struct {
    const Self = @This();
    
    // === Simulation Parameters ===
    sim_width: u32,
    sim_height: u32,
    dye_width: u32,
    dye_height: u32,
    
    density_dissipation: f32,
    velocity_dissipation: f32,
    pressure_iterations: u32,
    curl_strength: f32,
    
    // === Simulation State ===
    time: f64,
    dt: f32,
    
    // === Resources ===
    textures: FluidTextures,
    device: *gpu.Device,
    
    /// Initialize simulation with default parameters
    pub fn init(
        device: *gpu.Device,
        sim_width: u32,
        sim_height: u32,
        dye_width: u32,
        dye_height: u32,
    ) !Self {
        var textures = try FluidTextures.init(device, sim_width, sim_height, dye_width, dye_height);
        errdefer textures.deinit();
        
        return Self{
            .sim_width = sim_width,
            .sim_height = sim_height,
            .dye_width = dye_width,
            .dye_height = dye_height,
            .density_dissipation = 0.98,
            .velocity_dissipation = 0.99,
            .pressure_iterations = 20,
            .curl_strength = 30.0,
            .time = 0.0,
            .dt = 1.0 / 60.0,
            .textures = textures,
            .device = device,
        };
    }
    
    pub fn deinit(self: *Self) void {
        self.textures.deinit();
    }
    
    /// Update simulation by one timestep
    /// This is called by the main loop with actual dt
    pub fn update(self: *Self, delta_time: f32) void {
        self.dt = delta_time;
        self.time += delta_time;
    }
    
    /// Apply a force splat at the given position
    /// x, y: normalized coordinates [0, 1]
    /// dx, dy: velocity delta
    /// radius: splat radius in normalized space
    pub fn applySplat(
        self: *Self,
        x: f32,
        y: f32,
        dx: f32,
        dy: f32,
        radius: f32,
        color: [3]f32,
    ) void {
        _ = self;
        _ = x;
        _ = y;
        _ = dx;
        _ = dy;
        _ = radius;
        _ = color;
        // TODO: Implement splat application (Phase 9)
        // Will use compute shader to add force and color to simulation
    }
    
    /// Get current simulation time
    pub fn getTime(self: *Self) f64 {
        return self.time;
    }
    
    /// Get current timestep
    pub fn getDeltaTime(self: *Self) f32 {
        return self.dt;
    }
    
    /// Set density dissipation rate
    /// Higher values = density fades slower
    pub fn setDensityDissipation(self: *Self, value: f32) void {
        self.density_dissipation = std.math.clamp(value, 0.0, 1.0);
    }
    
    /// Set velocity dissipation rate
    /// Higher values = velocity persists longer
    pub fn setVelocityDissipation(self: *Self, value: f32) void {
        self.velocity_dissipation = std.math.clamp(value, 0.0, 1.0);
    }
    
    /// Set pressure solver iterations
    /// More iterations = more accurate but slower
    pub fn setPressureIterations(self: *Self, iterations: u32) void {
        self.pressure_iterations = std.math.clamp(iterations, 1, 100);
    }
    
    /// Set curl/vorticity strength
    /// Higher values = more swirly behavior
    pub fn setCurlStrength(self: *Self, strength: f32) void {
        self.curl_strength = std.math.clamp(strength, 0.0, 100.0);
    }
    
    /// Get simulation parameters as config struct
    pub fn getConfig(self: *Self) SimulationConfig {
        return .{
            .sim_width = self.sim_width,
            .sim_height = self.sim_height,
            .dye_width = self.dye_width,
            .dye_height = self.dye_height,
            .density_dissipation = self.density_dissipation,
            .velocity_dissipation = self.velocity_dissipation,
            .pressure_iterations = self.pressure_iterations,
            .curl_strength = self.curl_strength,
            .time = self.time,
            .dt = self.dt,
        };
    }
    
    /// Reset simulation to initial state
    pub fn reset(self: *Self) void {
        self.time = 0.0;
        // TODO: Clear all textures (Phase 9)
    }
};

/// Simulation configuration snapshot
pub const SimulationConfig = struct {
    sim_width: u32,
    sim_height: u32,
    dye_width: u32,
    dye_height: u32,
    density_dissipation: f32,
    velocity_dissipation: f32,
    pressure_iterations: u32,
    curl_strength: f32,
    time: f64,
    dt: f32,
    
    pub fn format(
        self: SimulationConfig,
        comptime fmt: []const u8,
        options: std.fmt.FormatOptions,
        writer: anytype,
    ) !void {
        _ = fmt;
        _ = options;
        try writer.print(
            "Sim({}x{}, dye={}x{}, dens={d:.3}, vel={d:.3}, press={}, curl={d:.1}, t={d:.2}s, dt={d:.3})",
            .{
                self.sim_width,
                self.sim_height,
                self.dye_width,
                self.dye_height,
                self.density_dissipation,
                self.velocity_dissipation,
                self.pressure_iterations,
                self.curl_strength,
                self.time,
                self.dt,
            },
        );
    }
};

// ============================================================================
// Tests
// ============================================================================

test "FluidSimulation: initialization" {
    var instance = try gpu.Instance.init(std.testing.allocator);
    defer instance.deinit();
    
    var adapter = try instance.requestAdapter();
    defer adapter.deinit();
    
    var device = try adapter.requestDevice();
    defer device.deinit();
    
    var sim = try FluidSimulation.init(&device, 128, 96, 128, 96);
    defer sim.deinit();
    
    try std.testing.expectEqual(@as(u32, 128), sim.sim_width);
    try std.testing.expectEqual(@as(u32, 96), sim.sim_height);
    try std.testing.expectEqual(@as(f64, 0.0), sim.time);
}

test "FluidSimulation: parameter setters" {
    var instance = try gpu.Instance.init(std.testing.allocator);
    defer instance.deinit();
    
    var adapter = try instance.requestAdapter();
    defer adapter.deinit();
    
    var device = try adapter.requestDevice();
    defer device.deinit();
    
    var sim = try FluidSimulation.init(&device, 128, 96, 128, 96);
    defer sim.deinit();
    
    // Test density dissipation
    sim.setDensityDissipation(0.95);
    try std.testing.expectEqual(@as(f32, 0.95), sim.density_dissipation);
    
    // Test clamping
    sim.setDensityDissipation(1.5); // Should clamp to 1.0
    try std.testing.expectEqual(@as(f32, 1.0), sim.density_dissipation);
    
    // Test pressure iterations
    sim.setPressureIterations(50);
    try std.testing.expectEqual(@as(u32, 50), sim.pressure_iterations);
    
    // Test curl
    sim.setCurlStrength(45.0);
    try std.testing.expectEqual(@as(f32, 45.0), sim.curl_strength);
}

test "FluidSimulation: update and time" {
    var instance = try gpu.Instance.init(std.testing.allocator);
    defer instance.deinit();
    
    var adapter = try instance.requestAdapter();
    defer adapter.deinit();
    
    var device = try adapter.requestDevice();
    defer device.deinit();
    
    var sim = try FluidSimulation.init(&device, 128, 96, 128, 96);
    defer sim.deinit();
    
    try std.testing.expectEqual(@as(f64, 0.0), sim.getTime());
    
    sim.update(0.016); // 60 FPS
    try std.testing.expect(sim.getTime() > 0.0);
    try std.testing.expectEqual(@as(f32, 0.016), sim.getDeltaTime());
    
    sim.update(0.016);
    try std.testing.expect(sim.getTime() > 0.016);
}

test "FluidSimulation: config snapshot" {
    var instance = try gpu.Instance.init(std.testing.allocator);
    defer instance.deinit();
    
    var adapter = try instance.requestAdapter();
    defer adapter.deinit();
    
    var device = try adapter.requestDevice();
    defer device.deinit();
    
    var sim = try FluidSimulation.init(&device, 256, 192, 512, 384);
    defer sim.deinit();
    
    sim.setDensityDissipation(0.95);
    sim.setPressureIterations(30);
    sim.update(0.016);
    
    const config = sim.getConfig();
    try std.testing.expectEqual(@as(u32, 256), config.sim_width);
    try std.testing.expectEqual(@as(u32, 192), config.sim_height);
    try std.testing.expectEqual(@as(f32, 0.95), config.density_dissipation);
    try std.testing.expectEqual(@as(u32, 30), config.pressure_iterations);
    try std.testing.expect(config.time > 0.0);
}
