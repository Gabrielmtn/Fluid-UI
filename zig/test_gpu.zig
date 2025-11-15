// Test GPU initialization
const std = @import("std");
const gpu = @import("src/gpu_backend_real.zig");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();
    
    std.log.info("🚀 Testing GPU initialization...", .{});
    
    // Create instance
    std.log.info("Creating GPU instance...", .{});
    var instance = try gpu.Instance.init(allocator);
    defer instance.deinit();
    std.log.info("✅ Instance created", .{});
    
    // Request adapter
    std.log.info("Requesting GPU adapter...", .{});
    var adapter = try instance.requestAdapter();
    defer adapter.deinit();
    std.log.info("✅ Adapter acquired", .{});
    
    // Request device
    std.log.info("Requesting GPU device...", .{});
    var device = try adapter.requestDevice();
    defer device.deinit();
    std.log.info("✅ Device ready!", .{});
    
    // Test texture creation
    std.log.info("Creating test texture (512x288 RG32Float)...", .{});
    var texture = try device.createTexture(512, 288, .RG32Float, null);
    defer texture.deinit();
    std.log.info("✅ Texture created: {}x{}", .{texture.width, texture.height});
    
    // Test buffer creation
    std.log.info("Creating test buffer (1MB)...", .{});
    var buffer = try device.createBuffer(1024 * 1024, .{
        .storage = true,
        .copy_dst = true,
    });
    defer buffer.deinit();
    std.log.info("✅ Buffer created: {} bytes", .{buffer.size});
    
    std.log.info("", .{});
    std.log.info("🎉 GPU INITIALIZATION SUCCESSFUL!", .{});
    std.log.info("", .{});
    std.log.info("Next steps:", .{});
    std.log.info("  1. Create compute pipelines", .{});
    std.log.info("  2. Wire simulation shaders", .{});
    std.log.info("  3. Implement GPU step()", .{});
    std.log.info("  4. Achieve 60+ FPS!", .{});
}
