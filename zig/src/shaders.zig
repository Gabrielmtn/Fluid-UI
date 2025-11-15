const std = @import("std");
const gpu = @import("gpu.zig");

// Shader manager - loads and caches WGSL shaders
pub const ShaderManager = struct {
    allocator: std.mem.Allocator,
    advection: ?gpu.ShaderSource,
    divergence: ?gpu.ShaderSource,
    curl: ?gpu.ShaderSource,
    pressure: ?gpu.ShaderSource,
    gradient: ?gpu.ShaderSource,
    display: ?gpu.ShaderSource,
    splat: ?gpu.ShaderSource,
    
    pub fn init(allocator: std.mem.Allocator) ShaderManager {
        return ShaderManager{
            .allocator = allocator,
            .advection = null,
            .divergence = null,
            .curl = null,
            .pressure = null,
            .gradient = null,
            .display = null,
            .splat = null,
        };
    }
    
    pub fn loadAll(self: *ShaderManager) !void {
        std.log.info("Loading shaders...", .{});
        
        self.advection = try gpu.ShaderSource.load(self.allocator, "shaders/advection.wgsl", "advection");
        std.log.info("  ✓ advection.wgsl ({d} bytes)", .{self.advection.?.code.len});
        
        self.divergence = try gpu.ShaderSource.load(self.allocator, "shaders/divergence.wgsl", "divergence");
        std.log.info("  ✓ divergence.wgsl ({d} bytes)", .{self.divergence.?.code.len});
        
        self.curl = try gpu.ShaderSource.load(self.allocator, "shaders/curl.wgsl", "curl");
        std.log.info("  ✓ curl.wgsl ({d} bytes)", .{self.curl.?.code.len});
        
        self.pressure = try gpu.ShaderSource.load(self.allocator, "shaders/pressure.wgsl", "pressure_jacobi");
        std.log.info("  ✓ pressure.wgsl ({d} bytes)", .{self.pressure.?.code.len});
        
        self.gradient = try gpu.ShaderSource.load(self.allocator, "shaders/gradient.wgsl", "gradient_subtract");
        std.log.info("  ✓ gradient.wgsl ({d} bytes)", .{self.gradient.?.code.len});
        
        self.display = try gpu.ShaderSource.load(self.allocator, "shaders/display.wgsl", "fs_main");
        std.log.info("  ✓ display.wgsl ({d} bytes)", .{self.display.?.code.len});
        
        self.splat = try gpu.ShaderSource.load(self.allocator, "shaders/splat.wgsl", "splat");
        std.log.info("  ✓ splat.wgsl ({d} bytes)", .{self.splat.?.code.len});
        
        std.log.info("All shaders loaded successfully!", .{});
    }
    
    pub fn deinit(self: *ShaderManager) void {
        if (self.advection) |*s| s.deinit(self.allocator);
        if (self.divergence) |*s| s.deinit(self.allocator);
        if (self.curl) |*s| s.deinit(self.allocator);
        if (self.pressure) |*s| s.deinit(self.allocator);
        if (self.gradient) |*s| s.deinit(self.allocator);
        if (self.display) |*s| s.deinit(self.allocator);
        if (self.splat) |*s| s.deinit(self.allocator);
    }
};

// Compute pipeline descriptors
pub const ComputeShaderType = enum {
    Advection,
    Divergence,
    Curl,
    Pressure,
    Gradient,
    Splat,
};

pub fn getShaderSource(manager: *ShaderManager, shader_type: ComputeShaderType) ?*const gpu.ShaderSource {
    return switch (shader_type) {
        .Advection => if (manager.advection) |*s| s else null,
        .Divergence => if (manager.divergence) |*s| s else null,
        .Curl => if (manager.curl) |*s| s else null,
        .Pressure => if (manager.pressure) |*s| s else null,
        .Gradient => if (manager.gradient) |*s| s else null,
        .Splat => if (manager.splat) |*s| s else null,
    };
}
