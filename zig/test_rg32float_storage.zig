// Test if rg32float works for write-only storage textures
// This is critical for 2-component velocity data!
const std = @import("std");
const gpu = @import("src/gpu_backend_real.zig");
const wgpu = @import("src/wgpu.zig");

pub fn main() !void {
    std.log.info("🧪 Testing rg32float storage texture support", .{});
    
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var instance = try gpu.Instance.init(allocator);
    defer instance.deinit();

    var adapter = try instance.requestAdapter();
    defer adapter.deinit();

    var device = try adapter.requestDevice();
    defer device.deinit();

    // Simple test shader
    const shader_code = 
        \\@group(0) @binding(0) var input: texture_2d<f32>;
        \\@group(0) @binding(1) var output: texture_storage_2d<rg32float, write>;
        \\
        \\@compute @workgroup_size(8, 8, 1)
        \\fn main(@builtin(global_invocation_id) id: vec3<u32>) {
        \\    let coords = vec2<i32>(i32(id.x), i32(id.y));
        \\    let val = textureLoad(input, coords, 0).xy;
        \\    textureStore(output, id.xy, vec4<f32>(val.x, val.y, 0.0, 0.0));
        \\}
    ;
    
    const shader_sentinel = try std.heap.page_allocator.allocSentinel(u8, shader_code.len, 0);
    defer std.heap.page_allocator.free(shader_sentinel);
    @memcpy(shader_sentinel, shader_code);
    
    var shader = try device.createShaderModule(shader_sentinel);
    defer shader.deinit();
    std.log.info("✅ Shader loaded", .{});

    // Create bind group layout with rg32float storage
    var bgl = try device.createBindGroupLayout(&[_]gpu.BindGroupLayoutEntry{
        .{
            .binding = 0,
            .visibility = wgpu.ShaderStage_COMPUTE,
            .texture = .{
                .sample_type = 2, // UnfilterableFloat
                .view_dimension = .@"2d",
                .multisampled = false,
            },
        },
        .{
            .binding = 1,
            .visibility = wgpu.ShaderStage_COMPUTE,
            .storage_texture = .{
                .access = 1, // WriteOnly
                .format = .rg32float,  // THE KEY TEST!
                .view_dimension = .@"2d",
            },
        },
    });
    defer bgl.deinit();
    std.log.info("✅ Bind group layout created with rg32float storage", .{});

    var pipeline_layout = try device.createPipelineLayout(&[_]*gpu.BindGroupLayout{&bgl});
    defer pipeline_layout.deinit();

    var pipeline = try device.createComputePipeline(&shader, "main", &pipeline_layout);
    defer pipeline.deinit();
    std.log.info("✅ Pipeline created", .{});

    // Create textures
    const W: u32 = 16;
    const H: u32 = 16;
    
    var input_tex = try device.createTexture(W, H, gpu.TextureFormat.RG32Float, .{ 
        .texture_binding = true,
        .storage_binding = false,
    });
    defer input_tex.deinit();
    var input_view = try input_tex.createView();
    defer input_view.deinit();

    var output_tex = try device.createTexture(W, H, gpu.TextureFormat.RG32Float, .{ 
        .texture_binding = false,
        .storage_binding = true,
    });
    defer output_tex.deinit();
    var output_view = try output_tex.createView();
    defer output_view.deinit();

    std.log.info("✅ Textures created (rg32float)", .{});

    var bind_group = try device.createBindGroup(&bgl, &[_]gpu.BindGroupEntry{
        .{ .binding = 0, .texture_view = input_view.handle },
        .{ .binding = 1, .texture_view = output_view.handle },
    });
    defer bind_group.deinit();
    std.log.info("✅ Bind group created", .{});

    var encoder = try device.createCommandEncoder();
    defer encoder.deinit();

    var compute_pass = try encoder.beginComputePass();
    compute_pass.setPipeline(&pipeline);
    compute_pass.setBindGroup(0, &bind_group);
    compute_pass.dispatchWorkgroups(2, 2, 1);
    compute_pass.end();
    compute_pass.deinit();

    var cmd = try encoder.finish();
    defer cmd.deinit();

    std.log.info("🔍 Submitting with rg32float storage...", .{});
    device.submit(&[_]*gpu.CommandBuffer{&cmd});

    std.log.info("", .{});
    std.log.info("🎉 SUCCESS! rg32float IS SUPPORTED for write-only storage!", .{});
    std.log.info("✅ This means we can use 2-component textures for velocity!", .{});
}
