const std = @import("std");

/// Renderer - Handles all display and visual effects
///
/// Responsibilities:
/// - Display shader management
/// - Kaleidoscope effects (5 modes)
/// - Color management and cycling
/// - Post-processing effects
/// - Frame presentation
///
/// Design Philosophy:
/// - Separates rendering from simulation
/// - Owns display-related GPU resources
/// - Provides clean configuration API
/// - No simulation logic (pure visualization)
pub const Renderer = struct {
    const Self = @This();
    
    // === Display Configuration ===
    display_width: u32,
    display_height: u32,
    
    // === Kaleidoscope Settings ===
    kaleidoscope_enabled: bool,
    kaleidoscope_mode: KaleidoscopeMode,
    kaleidoscope_segments: u32,
    kaleidoscope_angle: f32,
    kaleidoscope_spin_speed: f32,
    kaleidoscope_twist: f32,
    kaleidoscope_zoom: f32,
    kaleidoscope_blend: f32,
    
    // === Color Settings ===
    color_mode: ColorMode,
    hue_offset: f32,
    saturation: f32,
    brightness: f32,
    
    // === Canvas Settings ===
    canvas_opacity: f32,
    background_transparency: f32,
    preserve_opacity: bool,
    
    // === State ===
    time: f64,
    
    /// Initialize renderer with display resolution
    pub fn init(display_width: u32, display_height: u32) Self {
        return Self{
            .display_width = display_width,
            .display_height = display_height,
            
            // Kaleidoscope defaults (off)
            .kaleidoscope_enabled = false,
            .kaleidoscope_mode = .off,
            .kaleidoscope_segments = 6,
            .kaleidoscope_angle = 0.0,
            .kaleidoscope_spin_speed = 0.0,
            .kaleidoscope_twist = 0.0,
            .kaleidoscope_zoom = 1.0,
            .kaleidoscope_blend = 1.0,
            
            // Color defaults
            .color_mode = .rainbow,
            .hue_offset = 0.0,
            .saturation = 1.0,
            .brightness = 1.0,
            
            // Canvas defaults
            .canvas_opacity = 1.0,
            .background_transparency = 0.0,
            .preserve_opacity = true,
            
            .time = 0.0,
        };
    }
    
    pub fn deinit(self: *Self) void {
        _ = self;
        // No resources to clean up yet (will add GPU resources later)
    }
    
    /// Update renderer (for animations)
    pub fn update(self: *Self, dt: f32) void {
        self.time += dt;
        
        // Animate kaleidoscope angle if spin enabled
        if (self.kaleidoscope_spin_speed != 0.0) {
            self.kaleidoscope_angle += self.kaleidoscope_spin_speed * dt;
            // Wrap to [0, 2π]
            while (self.kaleidoscope_angle > std.math.tau) {
                self.kaleidoscope_angle -= std.math.tau;
            }
            while (self.kaleidoscope_angle < 0.0) {
                self.kaleidoscope_angle += std.math.tau;
            }
        }
        
        // Animate hue offset for color cycling
        if (self.color_mode == .rainbow) {
            self.hue_offset = @mod(@as(f32, @floatCast(self.time * 0.1)), 1.0);
        }
    }
    
    /// Set display resolution (for window resize)
    pub fn setDisplayResolution(self: *Self, width: u32, height: u32) void {
        self.display_width = width;
        self.display_height = height;
    }
    
    // === Kaleidoscope Configuration ===
    
    pub fn enableKaleidoscope(self: *Self, enabled: bool) void {
        self.kaleidoscope_enabled = enabled;
        if (!enabled) {
            self.kaleidoscope_mode = .off;
        }
    }
    
    pub fn setKaleidoscopeMode(self: *Self, mode: KaleidoscopeMode) void {
        self.kaleidoscope_mode = mode;
        self.kaleidoscope_enabled = (mode != .off);
    }
    
    pub fn setKaleidoscopeSegments(self: *Self, segments: u32) void {
        self.kaleidoscope_segments = std.math.clamp(segments, 1, 32);
    }
    
    pub fn setKaleidoscopeAngle(self: *Self, angle: f32) void {
        self.kaleidoscope_angle = angle;
    }
    
    pub fn setKaleidoscopeSpinSpeed(self: *Self, speed: f32) void {
        self.kaleidoscope_spin_speed = std.math.clamp(speed, -10.0, 10.0);
    }
    
    pub fn setKaleidoscopeTwist(self: *Self, twist: f32) void {
        self.kaleidoscope_twist = std.math.clamp(twist, 0.0, 5.0);
    }
    
    pub fn setKaleidoscopeZoom(self: *Self, zoom: f32) void {
        self.kaleidoscope_zoom = std.math.clamp(zoom, 0.1, 5.0);
    }
    
    pub fn setKaleidoscopeBlend(self: *Self, blend: f32) void {
        self.kaleidoscope_blend = std.math.clamp(blend, 0.0, 1.0);
    }
    
    // === Color Configuration ===
    
    pub fn setColorMode(self: *Self, mode: ColorMode) void {
        self.color_mode = mode;
    }
    
    pub fn setHueOffset(self: *Self, hue: f32) void {
        self.hue_offset = @mod(hue, 1.0);
    }
    
    pub fn setSaturation(self: *Self, saturation: f32) void {
        self.saturation = std.math.clamp(saturation, 0.0, 1.0);
    }
    
    pub fn setBrightness(self: *Self, brightness: f32) void {
        self.brightness = std.math.clamp(brightness, 0.0, 2.0);
    }
    
    // === Canvas Configuration ===
    
    pub fn setCanvasOpacity(self: *Self, opacity: f32) void {
        self.canvas_opacity = std.math.clamp(opacity, 0.0, 1.0);
    }
    
    pub fn setBackgroundTransparency(self: *Self, transparency: f32) void {
        self.background_transparency = std.math.clamp(transparency, 0.0, 1.0);
    }
    
    pub fn setPreserveOpacity(self: *Self, preserve: bool) void {
        self.preserve_opacity = preserve;
    }
    
    /// Get current configuration as struct (for shader uniforms)
    pub fn getConfig(self: *Self) RenderConfig {
        return .{
            .display_width = self.display_width,
            .display_height = self.display_height,
            .kaleidoscope_enabled = self.kaleidoscope_enabled,
            .kaleidoscope_mode = self.kaleidoscope_mode,
            .kaleidoscope_segments = self.kaleidoscope_segments,
            .kaleidoscope_angle = self.kaleidoscope_angle,
            .kaleidoscope_twist = self.kaleidoscope_twist,
            .kaleidoscope_zoom = self.kaleidoscope_zoom,
            .kaleidoscope_blend = self.kaleidoscope_blend,
            .color_mode = self.color_mode,
            .hue_offset = self.hue_offset,
            .saturation = self.saturation,
            .brightness = self.brightness,
            .canvas_opacity = self.canvas_opacity,
            .background_transparency = self.background_transparency,
            .preserve_opacity = self.preserve_opacity,
            .time = self.time,
        };
    }
};

/// Kaleidoscope modes (matching JS implementation)
pub const KaleidoscopeMode = enum(u32) {
    off = 0,
    wedge = 1,      // Traditional kaleidoscope (angular facets)
    mirror_h = 2,   // Horizontal mirror layers
    mirror_v = 3,   // Vertical mirror layers
    mirror_quad = 4, // Quadrant mirror reflections
    spiral = 5,     // Concentric spiral rings
    
    pub fn getName(self: KaleidoscopeMode) []const u8 {
        return switch (self) {
            .off => "Off",
            .wedge => "Wedge (Facets)",
            .mirror_h => "Mirror H (Layers)",
            .mirror_v => "Mirror V (Layers)",
            .mirror_quad => "Mirror Quad (Reflections)",
            .spiral => "Spiral (Rings)",
        };
    }
    
    pub fn getSegmentLabel(self: KaleidoscopeMode) []const u8 {
        return switch (self) {
            .off => "Segments",
            .wedge => "Facets",
            .mirror_h => "Layers",
            .mirror_v => "Layers",
            .mirror_quad => "Reflections",
            .spiral => "Rings",
        };
    }
};

/// Color modes
pub const ColorMode = enum(u32) {
    rainbow = 0,     // Automatic hue cycling
    fixed = 1,       // User-selected hue
    monochrome = 2,  // Grayscale
    original = 3,    // Original simulation colors
};

/// Render configuration (for shader uniforms)
pub const RenderConfig = struct {
    display_width: u32,
    display_height: u32,
    
    kaleidoscope_enabled: bool,
    kaleidoscope_mode: KaleidoscopeMode,
    kaleidoscope_segments: u32,
    kaleidoscope_angle: f32,
    kaleidoscope_twist: f32,
    kaleidoscope_zoom: f32,
    kaleidoscope_blend: f32,
    
    color_mode: ColorMode,
    hue_offset: f32,
    saturation: f32,
    brightness: f32,
    
    canvas_opacity: f32,
    background_transparency: f32,
    preserve_opacity: bool,
    
    time: f64,
    
    /// Format for logging
    pub fn format(
        self: RenderConfig,
        comptime fmt: []const u8,
        options: std.fmt.FormatOptions,
        writer: anytype,
    ) !void {
        _ = fmt;
        _ = options;
        try writer.print(
            "Render({}x{}, kaleido={s}, segments={}, color={s})",
            .{
                self.display_width,
                self.display_height,
                self.kaleidoscope_mode.getName(),
                self.kaleidoscope_segments,
                @tagName(self.color_mode),
            },
        );
    }
};

// ============================================================================
// Tests
// ============================================================================

test "Renderer: initialization" {
    var renderer = Renderer.init(800, 600);
    defer renderer.deinit();
    
    try std.testing.expectEqual(@as(u32, 800), renderer.display_width);
    try std.testing.expectEqual(@as(u32, 600), renderer.display_height);
    try std.testing.expect(!renderer.kaleidoscope_enabled);
    try std.testing.expectEqual(KaleidoscopeMode.off, renderer.kaleidoscope_mode);
}

test "Renderer: kaleidoscope configuration" {
    var renderer = Renderer.init(800, 600);
    defer renderer.deinit();
    
    // Enable kaleidoscope
    renderer.setKaleidoscopeMode(.wedge);
    try std.testing.expect(renderer.kaleidoscope_enabled);
    try std.testing.expectEqual(KaleidoscopeMode.wedge, renderer.kaleidoscope_mode);
    
    // Set segments
    renderer.setKaleidoscopeSegments(8);
    try std.testing.expectEqual(@as(u32, 8), renderer.kaleidoscope_segments);
    
    // Clamping
    renderer.setKaleidoscopeSegments(100); // Should clamp to 32
    try std.testing.expectEqual(@as(u32, 32), renderer.kaleidoscope_segments);
}

test "Renderer: animation update" {
    var renderer = Renderer.init(800, 600);
    defer renderer.deinit();
    
    renderer.setKaleidoscopeSpinSpeed(1.0); // 1 rad/s
    
    const initial_angle = renderer.kaleidoscope_angle;
    renderer.update(0.1); // 100ms
    
    try std.testing.expect(renderer.kaleidoscope_angle > initial_angle);
    try std.testing.expectApproxEqAbs(@as(f32, 0.1), renderer.kaleidoscope_angle, 0.01);
}

test "Renderer: color cycling" {
    var renderer = Renderer.init(800, 600);
    defer renderer.deinit();
    
    renderer.setColorMode(.rainbow);
    
    const initial_hue = renderer.hue_offset;
    renderer.update(1.0); // 1 second
    
    try std.testing.expect(renderer.hue_offset != initial_hue);
}

test "Renderer: configuration snapshot" {
    var renderer = Renderer.init(1024, 768);
    defer renderer.deinit();
    
    renderer.setKaleidoscopeMode(.spiral);
    renderer.setKaleidoscopeSegments(12);
    renderer.setColorMode(.rainbow);
    renderer.setCanvasOpacity(0.9);
    
    const config = renderer.getConfig();
    
    try std.testing.expectEqual(@as(u32, 1024), config.display_width);
    try std.testing.expectEqual(@as(u32, 768), config.display_height);
    try std.testing.expectEqual(KaleidoscopeMode.spiral, config.kaleidoscope_mode);
    try std.testing.expectEqual(@as(u32, 12), config.kaleidoscope_segments);
    try std.testing.expectEqual(ColorMode.rainbow, config.color_mode);
    try std.testing.expectEqual(@as(f32, 0.9), config.canvas_opacity);
}

test "Renderer: mode names" {
    try std.testing.expectEqualStrings("Off", KaleidoscopeMode.off.getName());
    try std.testing.expectEqualStrings("Wedge (Facets)", KaleidoscopeMode.wedge.getName());
    try std.testing.expectEqualStrings("Spiral (Rings)", KaleidoscopeMode.spiral.getName());
    
    try std.testing.expectEqualStrings("Facets", KaleidoscopeMode.wedge.getSegmentLabel());
    try std.testing.expectEqualStrings("Layers", KaleidoscopeMode.mirror_h.getSegmentLabel());
    try std.testing.expectEqualStrings("Rings", KaleidoscopeMode.spiral.getSegmentLabel());
}
