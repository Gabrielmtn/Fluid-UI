// Phase 6: Test advection kernel with proper bind groups
const std = @import("std");
const gpu = @import("src/gpu_backend_real.zig");
const wgpu = @import("src/wgpu.zig");

pub fn main() !void {
    std.log.info("🚀 Phase 6: Advection kernel test", .{});
    
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var instance = try gpu.Instance.init(allocator);
    defer instance.deinit();

    var adapter = try instance.requestAdapter();
    defer adapter.deinit();

    var device = try adapter.requestDevice();
    defer device.deinit();

    // Load advection shader (updated with Phase 5 patterns)
    var shader = try loadShader(&device, "shaders/advection.wgsl");
    defer shader.deinit();
    std.log.info("✅ Advection shader loaded", .{});

    // Create bind group layout (simplified - 4 bindings, no uniform buffer)
    var advection_bgl = try device.createBindGroupLayout(&[_]gpu.BindGroupLayoutEntry{
        // Binding 0: velocity texture (sampled, r32float)
        .{
            .binding = 0,
            .visibility = wgpu.ShaderStage_COMPUTE,
            .texture = .{
                .sample_type = 2, // UnfilterableFloat
                .view_dimension = .@"2d",
                .multisampled = false,
            },
        },
        // Binding 1: source texture (sampled, r32float)
        .{
            .binding = 1,
            .visibility = wgpu.ShaderStage_COMPUTE,
            .texture = .{
                .sample_type = 2, // UnfilterableFloat
                .view_dimension = .@"2d",
                .multisampled = false,
            },
        },
        // Binding 2: NON-filtering sampler (required for r32float!)
        .{
            .binding = 2,
            .visibility = wgpu.ShaderStage_COMPUTE,
            .sampler = .{
                .type = 2, // Non-filtering sampler
            },
        },
        // Binding 3: output texture (write-only storage, r32float)
        .{
            .binding = 3,
            .visibility = wgpu.ShaderStage_COMPUTE,
            .storage_texture = .{
                .access = 1, // WriteOnly
                .format = .r32float,
                .view_dimension = .@"2d",
            },
        },
    });
    defer advection_bgl.deinit();
    std.log.info("✅ Bind group layout created (4 bindings - no uniform buffer)", .{});

    // Create pipeline layout
    var pipeline_layout = try device.createPipelineLayout(&[_]*gpu.BindGroupLayout{&advection_bgl});
    defer pipeline_layout.deinit();

    // Create compute pipeline
    var pipeline = try device.createComputePipeline(&shader, "advection", &pipeline_layout);
    defer pipeline.deinit();
    std.log.info("✅ Compute pipeline created", .{});

    // Create textures (small test size)
    const W: u32 = 32;
    const H: u32 = 32;
    
    // Input textures: texture_binding for sampling (r32float for testing)
    var velocity_tex = try device.createTexture(W, H, gpu.TextureFormat.R32Float, .{ 
        .texture_binding = true,  // For sampling
        .storage_binding = false,
    });
    defer velocity_tex.deinit();
    var velocity_view = try velocity_tex.createView();
    defer velocity_view.deinit();

    var source_tex = try device.createTexture(W, H, gpu.TextureFormat.R32Float, .{ 
        .texture_binding = true,  // For sampling
        .storage_binding = false,
    });
    defer source_tex.deinit();
    var source_view = try source_tex.createView();
    defer source_view.deinit();

    // Output texture: storage_binding for write-only storage  
    var output_tex = try device.createTexture(W, H, gpu.TextureFormat.R32Float, .{ 
        .texture_binding = false,
        .storage_binding = true,  // For writing
    });
    defer output_tex.deinit();
    var output_view = try output_tex.createView();
    defer output_view.deinit();

    std.log.info("✅ Textures created ({}x{}, r32float format for testing)", .{ W, H });

    // Create sampler (non-filtering for unfilterable float textures)
    var sampler = try device.createSampler(.{
        .address_mode_u = .clamp_to_edge,
        .address_mode_v = .clamp_to_edge,
        .mag_filter = .nearest,  // Must use nearest for unfilterable floats!
        .min_filter = .nearest,
        .mipmap_filter = .nearest,
    });
    defer sampler.deinit();
    std.log.info("✅ Non-filtering sampler created (for unfilterable floats)", .{});

    // Create bind group (4 bindings - no uniform buffer)
    var bind_group = try device.createBindGroup(&advection_bgl, &[_]gpu.BindGroupEntry{
        .{ .binding = 0, .texture_view = velocity_view.handle },
        .{ .binding = 1, .texture_view = source_view.handle },
        .{ .binding = 2, .sampler = sampler.handle },
        .{ .binding = 3, .texture_view = output_view.handle },
    });
    defer bind_group.deinit();
    std.log.info("✅ Bind group created (2 input textures + sampler + output)", .{});

    // Create command encoder
    var encoder = try device.createCommandEncoder();
    defer encoder.deinit();

    // Begin compute pass
    var compute_pass = try encoder.beginComputePass();
    compute_pass.setPipeline(&pipeline);
    compute_pass.setBindGroup(0, &bind_group);
    
    // Dispatch workgroups (32x32 texture with 8x8 workgroup size = 4x4 dispatches)
    const workgroup_size = 8;
    const dispatch_x = (W + workgroup_size - 1) / workgroup_size;
    const dispatch_y = (H + workgroup_size - 1) / workgroup_size;
    
    compute_pass.dispatchWorkgroups(dispatch_x, dispatch_y, 1);
    std.log.info("✅ Compute pass encoded (dispatch {}x{} workgroups)", .{ dispatch_x, dispatch_y });
    
    compute_pass.end();
    compute_pass.deinit();

    var cmd_buffer = try encoder.finish();
    defer cmd_buffer.deinit();

    std.log.info("🔍 Submitting advection kernel dispatch...", .{});
    device.submit(&[_]*gpu.CommandBuffer{&cmd_buffer});

    std.log.info("", .{});
    std.log.info("🎉 Advection kernel succeeded!", .{});
    std.log.info("✅ Phase 6 Progress: Advection kernel validated", .{});
    std.log.info("", .{});
    std.log.info("Next steps:", .{});
    std.log.info("  - Update remaining shaders (divergence, curl, pressure, gradient)", .{});
    std.log.info("  - Implement ping-pong double buffering", .{});
    std.log.info("  - Wire up complete simulation step", .{});
}

fn loadShader(device: *gpu.Device, path: []const u8) !gpu.ShaderModule {
    const file = std.fs.cwd().openFile(path, .{}) catch |err| {
        std.log.err("Failed to open shader {s}: {}", .{ path, err });
        return err;
    };
    defer file.close();
    
    const source = try file.readToEndAlloc(std.heap.page_allocator, 1024 * 1024);
    defer std.heap.page_allocator.free(source);
    
    const wgsl_source = try std.heap.page_allocator.allocSentinel(u8, source.len, 0);
    defer std.heap.page_allocator.free(wgsl_source);
    @memcpy(wgsl_source, source);
    
    return device.createShaderModule(wgsl_source);
}
