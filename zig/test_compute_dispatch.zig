// Phase 5: Test compute pipeline dispatch with bind groups
const std = @import("std");
const gpu = @import("src/gpu_backend_real.zig");
const wgpu = @import("src/wgpu.zig");

pub fn main() !void {
    std.log.info("🚀 Phase 5: Compute dispatch with bind groups", .{});
    
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var instance = try gpu.Instance.init(allocator);
    defer instance.deinit();

    var adapter = try instance.requestAdapter();
    defer adapter.deinit();

    var device = try adapter.requestDevice();
    defer device.deinit();

    // Load Phase 5 test compute shader (matches our bind group layout)
    var shader = try loadShader(&device, "shaders/test_compute.wgsl");
    defer shader.deinit();
    std.log.info("✅ Compute shader loaded", .{});

    // Phase 5 Key Insight: Core WebGPU only supports WRITE-ONLY storage textures!
    // Solution: Use SAMPLED textures for input, WRITE-ONLY storage for output
    var compute_bgl = try device.createBindGroupLayout(&[_]gpu.BindGroupLayoutEntry{
        // Binding 0: velocity texture (SAMPLED for reading!)
        .{
            .binding = 0,
            .visibility = wgpu.ShaderStage_COMPUTE,
            .texture = .{
                .sample_type = 2, // UnfilterableFloat (r32float) - not 3!
                .view_dimension = .@"2d",
                .multisampled = false,
            },
        },
        // Binding 1: source texture (SAMPLED for reading!)
        .{
            .binding = 1,
            .visibility = wgpu.ShaderStage_COMPUTE,
            .texture = .{
                .sample_type = 2, // UnfilterableFloat  
                .view_dimension = .@"2d",
                .multisampled = false,
            },
        },
        // Binding 2: output texture (WRITE-ONLY storage - allowed!)
        .{
            .binding = 2,
            .visibility = wgpu.ShaderStage_COMPUTE,
            .storage_texture = .{
                .access = 1, // WriteOnly (not 2!) - THIS is allowed in core WebGPU!
                .format = .r32float,
                .view_dimension = .@"2d",
            },
        },
    });
    defer compute_bgl.deinit();
    std.log.info("✅ Bind group layout created", .{});

    // Create pipeline layout
    var pipeline_layout = try device.createPipelineLayout(&[_]*gpu.BindGroupLayout{&compute_bgl});
    defer pipeline_layout.deinit();

    // Create compute pipeline (entry point is "main" in test_compute.wgsl)
    var pipeline = try device.createComputePipeline(&shader, "main", &pipeline_layout);
    defer pipeline.deinit();
    std.log.info("✅ Compute pipeline created", .{});

    // Create textures: INPUT textures for sampling, OUTPUT texture for storage write
    const W: u32 = 16;
    const H: u32 = 16;
    
    // Input textures: texture_binding for sampling (reading)
    var velocity_tex = try device.createTexture(W, H, gpu.TextureFormat.R32Float, .{ 
        .texture_binding = true,  // For sampling/reading
        .storage_binding = false,
    });
    defer velocity_tex.deinit();
    var velocity_view = try velocity_tex.createView();
    defer velocity_view.deinit();

    var source_tex = try device.createTexture(W, H, gpu.TextureFormat.R32Float, .{ 
        .texture_binding = true,  // For sampling/reading
        .storage_binding = false,
    });
    defer source_tex.deinit();
    var source_view = try source_tex.createView();
    defer source_view.deinit();

    // Output texture: storage_binding for write-only storage access
    var output_tex = try device.createTexture(W, H, gpu.TextureFormat.R32Float, .{ 
        .texture_binding = false,
        .storage_binding = true,  // For write-only storage
    });
    defer output_tex.deinit();
    var output_view = try output_tex.createView();
    defer output_view.deinit();

    std.log.info("✅ Textures created ({}x{})", .{ W, H });

    // Create bind group
    var bind_group = try device.createBindGroup(&compute_bgl, &[_]gpu.BindGroupEntry{
        .{ .binding = 0, .texture_view = velocity_view.handle },
        .{ .binding = 1, .texture_view = source_view.handle },
        .{ .binding = 2, .texture_view = output_view.handle },
    });
    defer bind_group.deinit();
    std.log.info("✅ Bind group created with storage textures", .{});

    // Create command encoder
    var encoder = try device.createCommandEncoder();
    defer encoder.deinit();

    // Begin compute pass
    var compute_pass = try encoder.beginComputePass();
    compute_pass.setPipeline(&pipeline);
    compute_pass.setBindGroup(0, &bind_group);
    
    // Dispatch workgroups (16x16 texture with 8x8 workgroup size = 2x2 dispatches)
    const workgroup_size_x = 8;
    const workgroup_size_y = 8;
    const dispatch_x = (W + workgroup_size_x - 1) / workgroup_size_x;
    const dispatch_y = (H + workgroup_size_y - 1) / workgroup_size_y;
    
    compute_pass.dispatchWorkgroups(dispatch_x, dispatch_y, 1);
    std.log.info("✅ Compute pass encoded (dispatch {}x{} workgroups)", .{ dispatch_x, dispatch_y });
    
    compute_pass.end();
    compute_pass.deinit();

    var cmd_buffer = try encoder.finish();
    defer cmd_buffer.deinit();

    std.log.info("🔍 Submitting compute dispatch...", .{});
    device.submit(&[_]*gpu.CommandBuffer{&cmd_buffer});

    std.log.info("", .{});
    std.log.info("🎉 Compute dispatch succeeded!", .{});
    std.log.info("✅ Phase 5: Bind groups & compute execution validated", .{});
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
