// Minimal command encoding smoke test (Phase 4 start)
const std = @import("std");
const gpu = @import("src/gpu_backend_real.zig");
const gpu_pipelines = @import("src/gpu_pipelines.zig");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    std.log.info("🎯 Phase 4: Command Encoding - minimal smoke test", .{});

    // Init GPU
    var instance = try gpu.Instance.init(allocator);
    defer instance.deinit();

    var adapter = try instance.requestAdapter();
    defer adapter.deinit();

    var device = try adapter.requestDevice();
    defer device.deinit();

    // Create compute pipelines (empty pipeline layout for now)
    var pipelines = try gpu_pipelines.FluidPipelines.init(&device);
    defer pipelines.deinit();

    // Create command encoder and a no-op compute pass
    var encoder = try device.createCommandEncoder();
    {
        var pass = try encoder.beginComputePass();
        // Bind a compute pipeline (no bind groups yet)
        pass.setPipeline(&pipelines.advection);
        pass.end();
        pass.deinit();
    }

    var cmd = try encoder.finish();
    defer cmd.deinit();

    device.submit(&.{ &cmd });

    std.log.info("✅ Command encoding flow succeeded (no-op compute pass)", .{});
}
