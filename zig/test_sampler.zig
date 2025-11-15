// Sampler creation test - validates sampler API without storage textures
const std = @import("std");
const gpu = @import("src/gpu_backend_real.zig");
const wgpu = @import("src/wgpu.zig");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    std.log.info("🎯 Phase 4: Sampler API test", .{});

    // Init GPU
    var instance = try gpu.Instance.init(allocator);
    defer instance.deinit();

    var adapter = try instance.requestAdapter();
    defer adapter.deinit();

    var device = try adapter.requestDevice();
    defer device.deinit();

    // Test 1: Default linear sampler
    var linear_sampler = try device.createSampler(null);
    defer linear_sampler.deinit();
    std.log.info("✅ Created default linear sampler", .{});

    // Test 2: Point sampler (nearest filtering)
    var point_sampler = try device.createSampler(wgpu.SamplerDescriptor{
        .mag_filter = .nearest,
        .min_filter = .nearest,
        .mipmap_filter = .nearest,
        .address_mode_u = .clamp_to_edge,
        .address_mode_v = .clamp_to_edge,
        .address_mode_w = .clamp_to_edge,
    });
    defer point_sampler.deinit();
    std.log.info("✅ Created point sampler (nearest)", .{});

    // Test 3: Repeat sampler
    var repeat_sampler = try device.createSampler(wgpu.SamplerDescriptor{
        .mag_filter = .linear,
        .min_filter = .linear,
        .mipmap_filter = .linear,
        .address_mode_u = .repeat,
        .address_mode_v = .repeat,
        .address_mode_w = .repeat,
    });
    defer repeat_sampler.deinit();
    std.log.info("✅ Created repeat sampler", .{});

    std.log.info("", .{});
    std.log.info("🎉 All sampler tests passed!", .{});
}
