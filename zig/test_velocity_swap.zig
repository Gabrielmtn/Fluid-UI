// Test velocity swap (ping-pong buffering) with split components
const std = @import("std");
const gpu = @import("src/gpu_backend_real.zig");
const FluidTextures = @import("src/gpu_textures.zig").FluidTextures;

pub fn main() !void {
    std.log.info("🔄 Testing velocity swap (ping-pong pattern)", .{});
    
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var instance = try gpu.Instance.init(allocator);
    defer instance.deinit();

    var adapter = try instance.requestAdapter();
    defer adapter.deinit();

    var device = try adapter.requestDevice();
    defer device.deinit();

    // Create textures
    var textures = try FluidTextures.init(&device, 32, 32, 32, 32);
    defer textures.deinit();
    std.log.info("✅ FluidTextures initialized", .{});

    // Get initial pointers
    const initial_x_read = textures.velocity_x_read.handle;
    const initial_x_write = textures.velocity_x_write.handle;
    const initial_y_read = textures.velocity_y_read.handle;
    const initial_y_write = textures.velocity_y_write.handle;
    
    std.log.info("📌 Initial state:", .{});
    std.log.info("  velocity_x_read:  {*}", .{initial_x_read});
    std.log.info("  velocity_x_write: {*}", .{initial_x_write});
    std.log.info("  velocity_y_read:  {*}", .{initial_y_read});
    std.log.info("  velocity_y_write: {*}", .{initial_y_write});
    
    // Perform swap
    textures.swapVelocity();
    std.log.info("", .{});
    std.log.info("🔄 Swapped velocity buffers", .{});
    
    // Check after swap
    const after_x_read = textures.velocity_x_read.handle;
    const after_x_write = textures.velocity_x_write.handle;
    const after_y_read = textures.velocity_y_read.handle;
    const after_y_write = textures.velocity_y_write.handle;
    
    std.log.info("📌 After swap:", .{});
    std.log.info("  velocity_x_read:  {*}", .{after_x_read});
    std.log.info("  velocity_x_write: {*}", .{after_x_write});
    std.log.info("  velocity_y_read:  {*}", .{after_y_read});
    std.log.info("  velocity_y_write: {*}", .{after_y_write});
    
    std.log.info("", .{});
    
    // Verify swap worked correctly
    const x_swapped = (after_x_read == initial_x_write and after_x_write == initial_x_read);
    const y_swapped = (after_y_read == initial_y_write and after_y_write == initial_y_read);
    
    if (x_swapped and y_swapped) {
        std.log.info("✅ Velocity swap validated!", .{});
        std.log.info("  ✓ X components swapped correctly", .{});
        std.log.info("  ✓ Y components swapped correctly", .{});
        std.log.info("  ✓ Ping-pong pattern ready for simulation loop", .{});
    } else {
        std.log.err("❌ Velocity swap FAILED!", .{});
        if (!x_swapped) std.log.err("  X components not swapped correctly", .{});
        if (!y_swapped) std.log.err("  Y components not swapped correctly", .{});
        return error.SwapFailed;
    }
    
    // Swap back
    textures.swapVelocity();
    std.log.info("", .{});
    std.log.info("🔄 Swapped back to original state", .{});
    
    const final_x_read = textures.velocity_x_read.handle;
    const final_x_write = textures.velocity_x_write.handle;
    
    if (final_x_read == initial_x_read and final_x_write == initial_x_write) {
        std.log.info("✅ Double-swap returns to original state", .{});
    } else {
        std.log.err("❌ Double-swap failed to return to original", .{});
        return error.DoubleSwapFailed;
    }
    
    std.log.info("", .{});
    std.log.info("🎉 All swap tests passed!", .{});
    std.log.info("✅ Ping-pong buffering ready for simulation", .{});
}
