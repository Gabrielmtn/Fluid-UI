// Test which texture formats work for storage binding
const std = @import("std");
const gpu = @import("src/gpu_backend_real.zig");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();
    
    std.log.info("🔍 Testing GPU Texture Formats", .{});
    
    // Initialize GPU
    var instance = try gpu.Instance.init(allocator);
    defer instance.deinit();
    
    var adapter = try instance.requestAdapter();
    defer adapter.deinit();
    
    var device = try adapter.requestDevice();
    defer device.deinit();
    
    const test_formats = [_]struct {
        name: []const u8,
        format: gpu.TextureFormat,
    }{
        .{ .name = "R32Float", .format = .R32Float },
        .{ .name = "RGBA32Float", .format = .RGBA32Float },
        .{ .name = "RG32Float", .format = .RG32Float },
    };
    
    for (test_formats) |format_test| {
        std.log.info("\nTesting {s}...", .{format_test.name});
        
        var texture = device.createTexture(256, 256, format_test.format, null) catch |err| {
            std.log.warn("  ❌ Failed to create: {}", .{err});
            continue;
        };
        defer texture.deinit();
        
        std.log.info("  ✅ Created successfully", .{});
        
        // Try to create view
        var view = texture.createView() catch |err| {
            std.log.warn("  ❌ Failed to create view: {}", .{err});
            continue;
        };
        defer view.deinit();
        
        std.log.info("  ✅ View created successfully", .{});
    }
    
    std.log.info("\n✅ Format testing complete", .{});
}
