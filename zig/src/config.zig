const std = @import("std");

// Fluid simulation configuration - matching web version defaults
pub const Config = struct {
    // Resolution settings
    sim_width: u32 = 512,
    sim_height: u32 = 288,
    dye_width: u32 = 1024,
    dye_height: u32 = 576,
    
    // Physics parameters (matching js/04-ui-interactions.js defaults)
    density_dissipation: f32 = 0.996,      // How fast color fades (1.0 = no fade, 0.0 = instant fade)
    velocity_dissipation: f32 = 0.999,     // How fast motion fades
    pressure_dissipation: f32 = 0.944,     // Pressure solver damping
    pressure_iterations: u32 = 95,         // Pressure solver accuracy (more = better, slower)
    curl: f32 = 40.0,                      // Vorticity/swirl strength
    velocity_influence: f32 = 22.0,        // How far velocity spreads (lower = more isolated)
    
    // Input parameters
    splat_radius: f32 = 0.011,             // Brush size (0.0 to 1.0, relative to canvas)
    splat_force: f32 = 6000.0,             // Force multiplier for mouse input
    
    // Display settings
    display_width: u32 = 800,
    display_height: u32 = 600,
    
    // Kaleidoscope settings
    kaleidoscope_mode: KaleidoscopeMode = .Off,
    kaleidoscope_segments: u32 = 6,
    kaleidoscope_angle: f32 = 0.0,
    kaleidoscope_zoom: f32 = 1.0,
    
    pub const KaleidoscopeMode = enum {
        Off,
        Wedge,
        MirrorH,
        MirrorV,
        Quad,
        Spiral,
    };
    
    pub fn init(allocator: std.mem.Allocator) !Config {
        _ = allocator; // Not needed for now, but keep for future use
        return .{};
    }
    
    pub fn deinit(self: *Config) void {
        _ = self; // No cleanup needed for now
    }
    
    // Adjust for mobile/low-end devices
    pub fn initMobile(allocator: std.mem.Allocator) !Config {
        var cfg = try init(allocator);
        cfg.sim_width = 256;
        cfg.sim_height = 144;
        cfg.dye_width = 512;
        cfg.dye_height = 288;
        cfg.pressure_iterations = 40;
        return cfg;
    }
    
    // High quality preset
    pub fn initHighQuality(allocator: std.mem.Allocator) !Config {
        var cfg = try init(allocator);
        cfg.sim_width = 1024;
        cfg.sim_height = 576;
        cfg.dye_width = 2048;
        cfg.dye_height = 1152;
        cfg.pressure_iterations = 120;
        return cfg;
    }
    
    // Validate and clamp values to safe ranges
    pub fn validate(self: *Config) void {
        // Clamp dissipation values to [0.0, 1.0]
        self.density_dissipation = std.math.clamp(self.density_dissipation, 0.0, 1.0);
        self.velocity_dissipation = std.math.clamp(self.velocity_dissipation, 0.0, 1.0);
        self.pressure_dissipation = std.math.clamp(self.pressure_dissipation, 0.0, 1.0);
        
        // Clamp pressure iterations to reasonable range
        self.pressure_iterations = std.math.clamp(self.pressure_iterations, 1, 200);
        
        // Clamp curl to reasonable range
        self.curl = std.math.clamp(self.curl, 0.0, 100.0);
        
        // Clamp splat radius
        self.splat_radius = std.math.clamp(self.splat_radius, 0.001, 0.5);
        
        // Ensure resolutions are at least 1
        self.sim_width = @max(self.sim_width, 1);
        self.sim_height = @max(self.sim_height, 1);
        self.dye_width = @max(self.dye_width, 1);
        self.dye_height = @max(self.dye_height, 1);
    }
    
    pub fn print(self: *const Config) void {
        std.log.info("=== Fluid Simulation Config ===", .{});
        std.log.info("  Simulation: {d}x{d}", .{ self.sim_width, self.sim_height });
        std.log.info("  Dye/Color: {d}x{d}", .{ self.dye_width, self.dye_height });
        std.log.info("  Display: {d}x{d}", .{ self.display_width, self.display_height });
        std.log.info("  Density Dissipation: {d:.4}", .{self.density_dissipation});
        std.log.info("  Velocity Dissipation: {d:.4}", .{self.velocity_dissipation});
        std.log.info("  Pressure Iterations: {d}", .{self.pressure_iterations});
        std.log.info("  Curl: {d:.1}", .{self.curl});
        std.log.info("  Splat Radius: {d:.4}", .{self.splat_radius});
        std.log.info("  Splat Force: {d:.1}", .{self.splat_force});
    }
};

// Color palette management
pub const ColorPalette = struct {
    colors: []const [3]f32,
    name: []const u8,
    
    pub const mountain_majesty = [_][3]f32{
        .{ 0.29, 0.56, 0.64 }, // #4A90A4
        .{ 0.91, 0.91, 0.82 }, // #E8E8D0
        .{ 0.37, 0.31, 0.23 }, // #5F4E3B
        .{ 0.17, 0.37, 0.18 }, // #2C5F2D
        .{ 1.00, 0.98, 0.80 }, // #FFFACD
    };
    
    pub const forest_serenity = [_][3]f32{
        .{ 0.17, 0.37, 0.18 }, // #2C5F2D
        .{ 0.29, 0.47, 0.34 }, // #4A7856
        .{ 0.55, 0.27, 0.07 }, // #8B4513
        .{ 1.00, 0.84, 0.00 }, // #FFD700
        .{ 0.94, 0.92, 0.84 }, // #F0EAD6
    };
    
    pub const sunset_dreams = [_][3]f32{
        .{ 1.00, 0.39, 0.28 }, // #FF6347
        .{ 1.00, 0.84, 0.00 }, // #FFD700
        .{ 1.00, 0.55, 0.00 }, // #FF8C00
        .{ 0.55, 0.28, 0.54 }, // #8B4789
        .{ 1.00, 0.96, 0.93 }, // #FFF5EE
    };
    
    pub const ocean_waves = [_][3]f32{
        .{ 0.29, 0.56, 0.64 }, // #4A90A4
        .{ 0.37, 0.62, 0.63 }, // #5F9EA0
        .{ 0.91, 0.91, 0.82 }, // #E8E8D0
        .{ 0.18, 0.31, 0.31 }, // #2F4F4F
        .{ 0.53, 0.81, 0.92 }, // #87CEEB
    };
};

// Input state
pub const InputState = struct {
    mouse_x: f32 = 0.0,
    mouse_y: f32 = 0.0,
    mouse_dx: f32 = 0.0,
    mouse_dy: f32 = 0.0,
    mouse_down: bool = false,
    current_color: [3]f32 = .{ 1.0, 0.0, 0.0 }, // Default red
    color_hue: f32 = 0.0,
    
    pub fn init() InputState {
        return .{};
    }
    
    pub fn updateMouse(self: *InputState, x: f32, y: f32, pressed: bool) void {
        self.mouse_dx = x - self.mouse_x;
        self.mouse_dy = y - self.mouse_y;
        self.mouse_x = x;
        self.mouse_y = y;
        self.mouse_down = pressed;
    }
    
    pub fn cycleColorHue(self: *InputState, delta: f32) void {
        self.color_hue += delta;
        if (self.color_hue >= 360.0) self.color_hue -= 360.0;
        if (self.color_hue < 0.0) self.color_hue += 360.0;
        self.current_color = hsvToRgb(self.color_hue, 1.0, 1.0);
    }
    
    pub fn setColorFromPalette(self: *InputState, palette: []const [3]f32, index: usize) void {
        if (index < palette.len) {
            self.current_color = palette[index];
        }
    }
};

// HSV to RGB conversion
pub fn hsvToRgb(h: f32, s: f32, v: f32) [3]f32 {
    const c = v * s;
    const h_prime = h / 60.0;
    const x = c * (1.0 - @abs(@mod(h_prime, 2.0) - 1.0));
    const m = v - c;
    
    var rgb: [3]f32 = undefined;
    
    if (h_prime < 1.0) {
        rgb = .{ c, x, 0.0 };
    } else if (h_prime < 2.0) {
        rgb = .{ x, c, 0.0 };
    } else if (h_prime < 3.0) {
        rgb = .{ 0.0, c, x };
    } else if (h_prime < 4.0) {
        rgb = .{ 0.0, x, c };
    } else if (h_prime < 5.0) {
        rgb = .{ x, 0.0, c };
    } else {
        rgb = .{ c, 0.0, x };
    }
    
    return .{ rgb[0] + m, rgb[1] + m, rgb[2] + m };
}
