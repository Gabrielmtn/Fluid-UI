// Test render pass with STORAGE buffer instead of uniform
const std = @import("std");
const gpu = @import("src/gpu_backend_real.zig");
const wgpu = @import("src/wgpu.zig");

pub fn main() !void {
    std.log.info("🎨 Render pass with storage buffer test", .{});
    
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    var instance = try gpu.Instance.init(allocator);
    defer instance.deinit();

    var adapter = try instance.requestAdapter();
    defer adapter.deinit();

    var device = try adapter.requestDevice();
    defer device.deinit();

    // Load shaders
    var vertex_shader = try loadShader(&device, "fullscreen.wgsl");
    defer vertex_shader.deinit();
    
    const frag_code = 
        \\struct Data {
        \\    color: vec4<f32>,
        \\}
        \\@group(0) @binding(0) var<storage, read> data: Data;
        \\
        \\@fragment
        \\fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
        \\    return data.color;
        \\}
    ;
    const frag_sentinel = try std.heap.page_allocator.allocSentinel(u8, frag_code.len, 0);
    defer std.heap.page_allocator.free(frag_sentinel);
    @memcpy(frag_sentinel, frag_code);
    
    var fragment_shader = try device.createShaderModule(frag_sentinel);
    defer fragment_shader.deinit();
    
    std.log.info("✅ Shaders loaded", .{});

    // Create bind group layout with STORAGE buffer
    var buffer_bgl = try device.createBindGroupLayout(&[_]gpu.BindGroupLayoutEntry{
        .{
            .binding = 0,
            .visibility = wgpu.ShaderStage_FRAGMENT,
            .buffer = .{
                .type = 3, // read-only-storage
                .has_dynamic_offset = false,
                .min_binding_size = 0,
            },
        },
    });
    defer buffer_bgl.deinit();

    var pipeline_layout = try device.createPipelineLayout(&[_]*gpu.BindGroupLayout{&buffer_bgl});
    defer pipeline_layout.deinit();

    var render_pipeline = try device.createRenderPipeline(
        &vertex_shader,
        "vs_main",
        &fragment_shader,
        "fs_main",
        wgpu.TextureFormat.rgba8unorm,
        &pipeline_layout,
    );
    defer render_pipeline.deinit();
    
    std.log.info("✅ Render pipeline created", .{});

    // Create STORAGE buffer instead of uniform
    var storage_buf = try device.createBuffer(16, .{ .storage = true });
    defer storage_buf.deinit();
    std.log.info("✅ Storage buffer created", .{});

    var bind_group = try device.createBindGroup(&buffer_bgl, &[_]gpu.BindGroupEntry{
        .{ .binding = 0, .buffer = storage_buf.handle, .offset = 0, .size = 16 },
    });
    defer bind_group.deinit();
    std.log.info("✅ Bind group created with storage buffer", .{});

    var output_tex = try device.createTexture(256, 256, gpu.TextureFormat.RGBA8Unorm, .{ 
        .render_attachment = true, 
        .copy_src = true,
        .texture_binding = false,
        .storage_binding = false,
    });
    defer output_tex.deinit();
    var output_view = try output_tex.createView();
    defer output_view.deinit();

    var encoder = try device.createCommandEncoder();
    defer encoder.deinit();

    const color_attachment = wgpu.RenderPassColorAttachment{
        .view = output_view.handle,
        .load_op = .clear,
        .store_op = .store,
        .clear_value = .{ .r = 0.0, .g = 0.0, .b = 0.0, .a = 1.0 },
    };

    var render_pass = try encoder.beginRenderPass(&[_]wgpu.RenderPassColorAttachment{color_attachment});
    render_pass.setPipeline(&render_pipeline);
    render_pass.setBindGroup(0, &bind_group);
    render_pass.draw(3, 1);
    render_pass.end();
    render_pass.deinit();

    std.log.info("✅ Render pass encoded with storage buffer bind group", .{});

    var cmd_buffer = try encoder.finish();
    defer cmd_buffer.deinit();

    std.log.info("🔍 About to submit with storage buffer...", .{});
    device.submit(&[_]*gpu.CommandBuffer{&cmd_buffer});

    std.log.info("", .{});
    std.log.info("🎉 Storage buffer test succeeded!", .{});
}

fn loadShader(device: *gpu.Device, filename: []const u8) !gpu.ShaderModule {
    const shader_dir = "shaders";
    const full_path = try std.fs.path.join(std.heap.page_allocator, &[_][]const u8{ shader_dir, filename });
    defer std.heap.page_allocator.free(full_path);
    const file = std.fs.cwd().openFile(full_path, .{}) catch |err| {
        std.log.err("Failed to open shader file {s}: {}", .{ filename, err });
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
