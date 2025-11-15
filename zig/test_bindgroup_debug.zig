// Debug test to isolate buffer mapping issue in bind groups
const std = @import("std");
const gpu = @import("src/gpu_backend_real.zig");
const wgpu = @import("src/wgpu.zig");

pub fn main() !void {
    std.log.info("🔍 Bind group debug test", .{});
    
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var instance = try gpu.Instance.init(allocator);
    defer instance.deinit();

    var adapter = try instance.requestAdapter();
    defer adapter.deinit();

    var device = try adapter.requestDevice();
    defer device.deinit();

    // Test 1: Bind group with just a sampler (no buffers)
    std.log.info("\n=== Test 1: Sampler-only bind group ===", .{});
    {
        var sampler_bgl = try device.createBindGroupLayout(&[_]gpu.BindGroupLayoutEntry{
            .{
                .binding = 0,
                .visibility = wgpu.ShaderStage_FRAGMENT,
                .sampler = .{ .type = 1 }, // filtering
            },
        });
        defer sampler_bgl.deinit();

        var sampler = try device.createSampler(null);
        defer sampler.deinit();

        var bind_group = try device.createBindGroup(&sampler_bgl, &[_]gpu.BindGroupEntry{
            .{ .binding = 0, .sampler = sampler.handle },
        });
        defer bind_group.deinit();

        std.log.info("✅ Sampler bind group created", .{});

        // Try to submit empty command
        var encoder = try device.createCommandEncoder();
        defer encoder.deinit();
        var cmd = try encoder.finish();
        defer cmd.deinit();
        device.submit(&[_]*gpu.CommandBuffer{&cmd});
        
        std.log.info("✅ Submit succeeded with sampler bind group", .{});
    }

    // Test 2: Bind group with texture (no buffer)
    std.log.info("\n=== Test 2: Texture bind group ===", .{});
    {
        var texture_bgl = try device.createBindGroupLayout(&[_]gpu.BindGroupLayoutEntry{
            .{
                .binding = 0,
                .visibility = wgpu.ShaderStage_FRAGMENT,
                .texture = .{
                    .sample_type = 1, // float
                    .view_dimension = .@"2d",
                    .multisampled = false,
                },
            },
        });
        defer texture_bgl.deinit();

        var texture = try device.createTexture(256, 256, gpu.TextureFormat.RGBA32Float, .{ 
            .texture_binding = true,
            .storage_binding = false,
        });
        defer texture.deinit();
        var texture_view = try texture.createView();
        defer texture_view.deinit();

        var bind_group = try device.createBindGroup(&texture_bgl, &[_]gpu.BindGroupEntry{
            .{ .binding = 0, .texture_view = texture_view.handle },
        });
        defer bind_group.deinit();

        std.log.info("✅ Texture bind group created", .{});

        var encoder = try device.createCommandEncoder();
        defer encoder.deinit();
        var cmd = try encoder.finish();
        defer cmd.deinit();
        device.submit(&[_]*gpu.CommandBuffer{&cmd});
        
        std.log.info("✅ Submit succeeded with texture bind group", .{});
    }

    // Test 3: Bind group with UNIFORM buffer
    std.log.info("\n=== Test 3: Uniform buffer bind group ===", .{});
    {
        var buffer_bgl = try device.createBindGroupLayout(&[_]gpu.BindGroupLayoutEntry{
            .{
                .binding = 0,
                .visibility = wgpu.ShaderStage_FRAGMENT,
                .buffer = .{
                    .type = 1, // uniform
                    .has_dynamic_offset = false,
                    .min_binding_size = 0,
                },
            },
        });
        defer buffer_bgl.deinit();

        // Create uniform buffer WITHOUT copy_dst first
        var uniform_buf = try device.createBuffer(64, .{ .uniform = true });
        defer uniform_buf.deinit();

        std.log.info("✅ Uniform buffer created (no copy_dst)", .{});

        var bind_group = try device.createBindGroup(&buffer_bgl, &[_]gpu.BindGroupEntry{
            .{ .binding = 0, .buffer = uniform_buf.handle, .offset = 0, .size = 64 },
        });
        defer bind_group.deinit();

        std.log.info("✅ Uniform buffer bind group created", .{});

        var encoder = try device.createCommandEncoder();
        defer encoder.deinit();
        var cmd = try encoder.finish();
        defer cmd.deinit();
        
        std.log.info("🔍 About to submit with uniform buffer bind group...", .{});
        device.submit(&[_]*gpu.CommandBuffer{&cmd});
        
        std.log.info("✅ Submit succeeded with uniform buffer bind group!", .{});
    }

    std.log.info("\n🎉 All bind group tests passed!", .{});
}
