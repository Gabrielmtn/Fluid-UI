// Minimal render pass test - no uniform buffers, just validate pipeline infrastructure
const std = @import("std");
const gpu = @import("src/gpu_backend_real.zig");
const wgpu = @import("src/wgpu.zig");

pub fn main() !void {
    std.log.info("🎨 Minimal render pass test", .{});
    
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    // Init GPU
    var instance = try gpu.Instance.init(allocator);
    defer instance.deinit();

    var adapter = try instance.requestAdapter();
    defer adapter.deinit();

    var device = try adapter.requestDevice();
    defer device.deinit();

    // Load simple vertex shader
    var vertex_shader = try loadShader(&device, "fullscreen.wgsl");
    defer vertex_shader.deinit();
    
    std.log.info("✅ Vertex shader loaded", .{});

    // Create simple fragment shader inline (must accept UV input from vertex shader)
    const frag_code = 
        \\@fragment
        \\fn fs_main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
        \\    // Just output solid red, ignore UVs
        \\    return vec4<f32>(1.0, 0.0, 0.0, 1.0);
        \\}
    ;
    const frag_sentinel = try std.heap.page_allocator.allocSentinel(u8, frag_code.len, 0);
    defer std.heap.page_allocator.free(frag_sentinel);
    @memcpy(frag_sentinel, frag_code);
    
    var fragment_shader = try device.createShaderModule(frag_sentinel);
    defer fragment_shader.deinit();
    
    std.log.info("✅ Fragment shader loaded", .{});

    // Create empty pipeline layout (no bind groups)
    var pipeline_layout = try device.createPipelineLayout(&[_]*gpu.BindGroupLayout{});
    defer pipeline_layout.deinit();

    // Create render pipeline
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

    // Create output texture
    const W: u32 = 256;
    const H: u32 = 256;
    var output_tex = try device.createTexture(W, H, gpu.TextureFormat.RGBA8Unorm, .{ 
        .render_attachment = true, 
        .copy_src = true,
        .texture_binding = false,
        .storage_binding = false,
    });
    defer output_tex.deinit();
    var output_view = try output_tex.createView();
    defer output_view.deinit();

    std.log.info("✅ Output texture created", .{});

    // Create command encoder
    var encoder = try device.createCommandEncoder();
    defer encoder.deinit();

    // Begin render pass
    const color_attachment = wgpu.RenderPassColorAttachment{
        .view = output_view.handle,
        .load_op = .clear,
        .store_op = .store,
        .clear_value = .{ .r = 0.0, .g = 0.0, .b = 0.0, .a = 1.0 },
    };

    var render_pass = try encoder.beginRenderPass(&[_]wgpu.RenderPassColorAttachment{color_attachment});
    render_pass.setPipeline(&render_pipeline);
    render_pass.draw(3, 1); // Draw fullscreen triangle
    render_pass.end();
    render_pass.deinit();

    std.log.info("✅ Render pass encoded", .{});

    var cmd_buffer = try encoder.finish();
    defer cmd_buffer.deinit();

    std.log.info("✅ Command buffer finished", .{});

    // Submit
    device.submit(&[_]*gpu.CommandBuffer{&cmd_buffer});

    std.log.info("", .{});
    std.log.info("🎉 Minimal render pass completed successfully!", .{});
    std.log.info("✅ No buffer mapping issues - render pipeline validated", .{});
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
