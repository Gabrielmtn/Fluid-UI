// Advection dispatch test: creates resources, bind group, and runs one dispatch
const std = @import("std");
const wgpu = @import("src/wgpu.zig");
const gpu = @import("src/gpu_backend_real.zig");

fn readShader(allocator: std.mem.Allocator, path: []const u8) ![:0]const u8 {
    const file = try std.fs.cwd().openFile(path, .{});
    defer file.close();
    const source = try file.readToEndAlloc(allocator, 1024 * 1024);
    // Add null terminator
    const wgsl = try allocator.allocSentinel(u8, source.len, 0);
    @memcpy(wgsl, source);
    allocator.free(source);
    return wgsl;
}

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    std.log.info("🎯 Phase 4: Advection dispatch test", .{});

    // Init GPU
    var instance = try gpu.Instance.init(allocator);
    defer instance.deinit();

    var adapter = try instance.requestAdapter();
    defer adapter.deinit();

    var device = try adapter.requestDevice();
    defer device.deinit();

    // Load shader
    const code = try readShader(allocator, "shaders/advection.wgsl");
    defer allocator.free(code);
    var shader = try device.createShaderModule(code);
    defer shader.deinit();

    // Create bind group layout for advection
    var advection_bgl = try device.createBindGroupLayout(&[_]gpu.BindGroupLayoutEntry{
        .{ .binding = 0, .visibility = wgpu.ShaderStage_COMPUTE, .buffer = .{ .type = 1, .has_dynamic_offset = false, .min_binding_size = 0 } },
        .{ .binding = 1, .visibility = wgpu.ShaderStage_COMPUTE, .texture = .{ .sample_type = 1, .view_dimension = .@"2d", .multisampled = false } },
        .{ .binding = 2, .visibility = wgpu.ShaderStage_COMPUTE, .texture = .{ .sample_type = 1, .view_dimension = .@"2d", .multisampled = false } },
        .{ .binding = 3, .visibility = wgpu.ShaderStage_COMPUTE, .sampler = .{ .type = 1 } },
        .{ .binding = 4, .visibility = wgpu.ShaderStage_COMPUTE, .storage_texture = .{ .access = 2, .format = .rgba16float, .view_dimension = .@"2d" } },
    });
    defer advection_bgl.deinit();

    var pipeline_layout = try device.createPipelineLayout(&[_]*gpu.BindGroupLayout{ &advection_bgl });
    defer pipeline_layout.deinit();

    var pipeline = try device.createComputePipeline(&shader, "advection", &pipeline_layout);
    defer pipeline.deinit();

    // Create textures (Option A formats)
    const W: u32 = 16; // small test size
    const H: u32 = 16;
    var velocity = try device.createTexture(W, H, .RGBA16Float, null);
    defer velocity.deinit();
    var source = try device.createTexture(W, H, .RGBA16Float, null);
    defer source.deinit();
    var output = try device.createTexture(W, H, .RGBA16Float, null);
    defer output.deinit();

    var velocity_view = try velocity.createView();
    defer velocity_view.deinit();
    var source_view = try source.createView();
    defer source_view.deinit();
    var output_view = try output.createView();
    defer output_view.deinit();

    // Create uniform buffer
    const Uniforms = extern struct {
        texel_size_x: f32,
        texel_size_y: f32,
        dt: f32,
        dissipation: f32,
        is_density: u32,
        width: u32,
        height: u32,
    };
    var u = Uniforms{ .texel_size_x = 1.0 / @as(f32, @floatFromInt(W)), .texel_size_y = 1.0 / @as(f32, @floatFromInt(H)), .dt = 1.0 / 60.0, .dissipation = 0.99, .is_density = 1, .width = W, .height = H };

    var uniform_buf = try device.createBuffer(@sizeOf(Uniforms), .{ .uniform = true, .copy_dst = true });
    defer uniform_buf.deinit();
    device.writeBuffer(&uniform_buf, 0, std.mem.asBytes(&u));

    // Create sampler (use defaults -> filtering)
    var linear_sampler = try device.createSampler(null);
    defer linear_sampler.deinit();

    // Create bind group
    var bind_group = try device.createBindGroup(&advection_bgl, &[_]gpu.BindGroupEntry{
        .{ .binding = 0, .buffer = uniform_buf.handle, .offset = 0, .size = @intCast(@sizeOf(Uniforms)) },
        .{ .binding = 1, .texture_view = velocity_view.handle },
        .{ .binding = 2, .texture_view = source_view.handle },
        .{ .binding = 3, .sampler = linear_sampler.handle },
        .{ .binding = 4, .texture_view = output_view.handle },
    });
    defer bind_group.deinit();

    // Encode one dispatch
    var encoder = try device.createCommandEncoder();
    {
        var pass = try encoder.beginComputePass();
        pass.setPipeline(&pipeline);
        pass.setBindGroup(0, &bind_group);
        pass.dispatchWorkgroups((W + 7) / 8, (H + 7) / 8, 1);
        pass.end();
        pass.deinit();
    }

    var cmd = try encoder.finish();
    defer cmd.deinit();
    device.submit(&.{ &cmd });

    std.log.info("✅ Advection dispatch submitted", .{});
}
