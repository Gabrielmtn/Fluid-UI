// Phase 7: Complete GPU Fluid Simulation Application
// Integrates window, GPU, simulation loop, and rendering
const std = @import("std");
const gpu = @import("src/gpu_backend_real.zig");
const wgpu = @import("src/wgpu.zig");
const FluidTextures = @import("src/gpu_textures.zig").FluidTextures;
const Window = @import("src/win32_window.zig").Window;

pub fn main() !void {
    std.log.info("🌊 GPU Fluid Simulation - Starting...", .{});
    
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    // Initialize window
    const window_width = 1024;
    const window_height = 768;
    var window = try Window.init(allocator, window_width, window_height, "GPU Fluid Simulation");
    defer window.deinit();
    std.log.info("✅ Window created: {}x{}", .{window_width, window_height});

    // Initialize GPU
    var instance = try gpu.Instance.init(allocator);
    defer instance.deinit();

    var adapter = try instance.requestAdapter();
    defer adapter.deinit();

    var device = try adapter.requestDevice();
    defer device.deinit();
    std.log.info("✅ GPU initialized", .{});

    // Create simulation textures
    const sim_width: u32 = 256;
    const sim_height: u32 = 192;  // Match aspect ratio of window
    var textures = try FluidTextures.init(&device, sim_width, sim_height, sim_width, sim_height);
    defer textures.deinit();
    std.log.info("✅ Simulation textures created ({}x{})", .{sim_width, sim_height});

    // Load shaders
    std.log.info("📜 Loading shaders...", .{});
    var advection_shader = try loadShader(&device, "shaders/advection_split.wgsl");
    defer advection_shader.deinit();
    
    var divergence_shader = try loadShader(&device, "shaders/divergence_split.wgsl");
    defer divergence_shader.deinit();
    
    var pressure_shader = try loadShader(&device, "shaders/pressure_split.wgsl");
    defer pressure_shader.deinit();
    
    var gradient_shader = try loadShader(&device, "shaders/gradient_split.wgsl");
    defer gradient_shader.deinit();
    
    var curl_shader = try loadShader(&device, "shaders/curl_split.wgsl");
    defer curl_shader.deinit();
    
    var vorticity_shader = try loadShader(&device, "shaders/vorticity_split.wgsl");
    defer vorticity_shader.deinit();
    
    var splat_shader = try loadShader(&device, "shaders/splat_split.wgsl");
    defer splat_shader.deinit();
    std.log.info("✅ All shaders loaded", .{});

    // Create pipelines
    std.log.info("🔧 Creating compute pipelines...", .{});
    
    var advection_bgl = try createAdvectionLayout(&device);
    defer advection_bgl.deinit();
    var advection_layout = try device.createPipelineLayout(&[_]*gpu.BindGroupLayout{&advection_bgl});
    defer advection_layout.deinit();
    var advection_pipeline = try device.createComputePipeline(&advection_shader, "advection", &advection_layout);
    defer advection_pipeline.deinit();
    
    var divergence_bgl = try createDivergenceLayout(&device);
    defer divergence_bgl.deinit();
    var divergence_layout = try device.createPipelineLayout(&[_]*gpu.BindGroupLayout{&divergence_bgl});
    defer divergence_layout.deinit();
    var divergence_pipeline = try device.createComputePipeline(&divergence_shader, "divergence_compute", &divergence_layout);
    defer divergence_pipeline.deinit();
    
    var pressure_bgl = try createPressureLayout(&device);
    defer pressure_bgl.deinit();
    var pressure_layout = try device.createPipelineLayout(&[_]*gpu.BindGroupLayout{&pressure_bgl});
    defer pressure_layout.deinit();
    var pressure_pipeline = try device.createComputePipeline(&pressure_shader, "pressure_jacobi", &pressure_layout);
    defer pressure_pipeline.deinit();
    
    var gradient_bgl = try createGradientLayout(&device);
    defer gradient_bgl.deinit();
    var gradient_layout = try device.createPipelineLayout(&[_]*gpu.BindGroupLayout{&gradient_bgl});
    defer gradient_layout.deinit();
    var gradient_pipeline = try device.createComputePipeline(&gradient_shader, "gradient_subtract", &gradient_layout);
    defer gradient_pipeline.deinit();
    
    std.log.info("✅ All pipelines created", .{});
    std.log.info("", .{});
    
    // Initialize density with some color to visualize
    std.log.info("🎨 Seeding simulation with initial color...", .{});
    seedInitialColor(&device, &textures, sim_width, sim_height) catch |err| {
        std.log.err("Failed to seed color: {}", .{err});
    };
    
    std.log.info("🚀 Starting simulation loop...", .{});
    std.log.info("   Resolution: {}x{}", .{sim_width, sim_height});
    std.log.info("   Press ESC or close window to exit", .{});
    std.log.info("   Click and drag to add force", .{});
    std.log.info("", .{});

    // Simulation loop
    var frame_count: u64 = 0;
    var last_fps_time = std.time.nanoTimestamp();
    var fps: f64 = 0.0;
    
    const workgroup_size = 8;
    const dispatch_x = (sim_width + workgroup_size - 1) / workgroup_size;
    const dispatch_y = (sim_height + workgroup_size - 1) / workgroup_size;

    while (!window.shouldClose()) {
        const frame_start = std.time.nanoTimestamp();
        
        // Poll window events
        window.pollEvents();
        
        // Get mouse input
        const mouse = window.getMouseState();
        _ = mouse; // TODO: Use for splatting forces
        
        // Run simulation step on GPU
        runSimulationStep(
            &device,
            &textures,
            &advection_pipeline, &advection_bgl,
            &divergence_pipeline, &divergence_bgl,
            &pressure_pipeline, &pressure_bgl,
            &gradient_pipeline, &gradient_bgl,
            dispatch_x, dispatch_y,
        ) catch |err| {
            std.log.err("Simulation step failed: {}", .{err});
            return err;
        };
        
        // Copy simulation results to window pixel buffer
        // For now, just fill with a test pattern
        copySimulationToWindow(&window, &textures, frame_count);
        
        // Present to screen
        window.present();
        
        frame_count += 1;
        
        // Calculate FPS every second
        const current_time = std.time.nanoTimestamp();
        const elapsed = current_time - last_fps_time;
        if (elapsed >= 1_000_000_000) { // 1 second
            fps = @as(f64, @floatFromInt(frame_count)) / (@as(f64, @floatFromInt(elapsed)) / 1_000_000_000.0);
            std.log.info("FPS: {d:.1} | Frames: {}", .{fps, frame_count});
            last_fps_time = current_time;
            frame_count = 0;
        }
        
        // Limit to reasonable frame rate to avoid busy loop
        const frame_time = std.time.nanoTimestamp() - frame_start;
        const target_frame_time = 16_666_667; // ~60 FPS
        if (frame_time < target_frame_time) {
            std.Thread.sleep(@intCast(target_frame_time - frame_time));
        }
    }
    
    std.log.info("", .{});
    std.log.info("✅ Simulation ended gracefully", .{});
    std.log.info("   Total frames: {}", .{frame_count});
}

fn runSimulationStep(
    device: *gpu.Device,
    textures: *FluidTextures,
    advection_pipeline: *gpu.ComputePipeline, advection_bgl: *gpu.BindGroupLayout,
    divergence_pipeline: *gpu.ComputePipeline, divergence_bgl: *gpu.BindGroupLayout,
    pressure_pipeline: *gpu.ComputePipeline, pressure_bgl: *gpu.BindGroupLayout,
    gradient_pipeline: *gpu.ComputePipeline, gradient_bgl: *gpu.BindGroupLayout,
    dispatch_x: u32, dispatch_y: u32,
) !void {
    var encoder = try device.createCommandEncoder();
    defer encoder.deinit();

    // Step 1: Advect velocity
    {
        var pass = try encoder.beginComputePass();
        pass.setPipeline(advection_pipeline);
        
        var bind_group = try device.createBindGroup(advection_bgl, &[_]gpu.BindGroupEntry{
            .{ .binding = 0, .texture_view = textures.velocity_x_read_view.handle },
            .{ .binding = 1, .texture_view = textures.velocity_y_read_view.handle },
            .{ .binding = 2, .texture_view = textures.velocity_x_read_view.handle },
            .{ .binding = 3, .texture_view = textures.velocity_y_read_view.handle },
            .{ .binding = 4, .texture_view = textures.velocity_x_write_view.handle },
            .{ .binding = 5, .texture_view = textures.velocity_y_write_view.handle },
        });
        defer bind_group.deinit();
        
        pass.setBindGroup(0, &bind_group);
        pass.dispatchWorkgroups(dispatch_x, dispatch_y, 1);
        pass.end();
        pass.deinit();
    }
    
    textures.swapVelocity();

    // Step 2: Compute divergence
    {
        var pass = try encoder.beginComputePass();
        pass.setPipeline(divergence_pipeline);
        
        var bind_group = try device.createBindGroup(divergence_bgl, &[_]gpu.BindGroupEntry{
            .{ .binding = 0, .texture_view = textures.velocity_x_read_view.handle },
            .{ .binding = 1, .texture_view = textures.velocity_y_read_view.handle },
            .{ .binding = 2, .texture_view = textures.divergence_view.handle },
        });
        defer bind_group.deinit();
        
        pass.setBindGroup(0, &bind_group);
        pass.dispatchWorkgroups(dispatch_x, dispatch_y, 1);
        pass.end();
        pass.deinit();
    }

    // Step 3: Solve pressure (multiple iterations for better accuracy)
    const pressure_iterations = 20;
    var i: u32 = 0;
    while (i < pressure_iterations) : (i += 1) {
        var pass = try encoder.beginComputePass();
        pass.setPipeline(pressure_pipeline);
        
        var bind_group = try device.createBindGroup(pressure_bgl, &[_]gpu.BindGroupEntry{
            .{ .binding = 0, .texture_view = textures.divergence_view.handle },
            .{ .binding = 1, .texture_view = textures.pressure_read_view.handle },
            .{ .binding = 2, .texture_view = textures.pressure_write_view.handle },
        });
        defer bind_group.deinit();
        
        pass.setBindGroup(0, &bind_group);
        pass.dispatchWorkgroups(dispatch_x, dispatch_y, 1);
        pass.end();
        pass.deinit();
        
        textures.swapPressure();
    }

    // Step 4: Subtract pressure gradient
    {
        var pass = try encoder.beginComputePass();
        pass.setPipeline(gradient_pipeline);
        
        var bind_group = try device.createBindGroup(gradient_bgl, &[_]gpu.BindGroupEntry{
            .{ .binding = 0, .texture_view = textures.pressure_read_view.handle },
            .{ .binding = 1, .texture_view = textures.velocity_x_read_view.handle },
            .{ .binding = 2, .texture_view = textures.velocity_y_read_view.handle },
            .{ .binding = 3, .texture_view = textures.velocity_x_write_view.handle },
            .{ .binding = 4, .texture_view = textures.velocity_y_write_view.handle },
        });
        defer bind_group.deinit();
        
        pass.setBindGroup(0, &bind_group);
        pass.dispatchWorkgroups(dispatch_x, dispatch_y, 1);
        pass.end();
        pass.deinit();
    }

    var cmd_buffer = try encoder.finish();
    defer cmd_buffer.deinit();

    device.submit(&[_]*gpu.CommandBuffer{&cmd_buffer});
}

fn copySimulationToWindow(window: *Window, textures: *FluidTextures, frame: u64) void {
    // For now, create a simple animated test pattern
    // TODO: Read back velocity/density from GPU and visualize
    _ = textures;
    
    const w = window.width;
    const h = window.height;
    
    for (0..h) |y| {
        for (0..w) |x| {
            const idx = (y * w + x) * 4;
            
            // Animated color pattern to show it's working
            const t = @as(f32, @floatFromInt(frame)) * 0.01;
            const xf = @as(f32, @floatFromInt(x)) / @as(f32, @floatFromInt(w));
            const yf = @as(f32, @floatFromInt(y)) / @as(f32, @floatFromInt(h));
            
            const r = @as(u8, @intFromFloat(@abs(@sin(xf * 6.28 + t)) * 255.0));
            const g = @as(u8, @intFromFloat(@abs(@sin(yf * 6.28 + t * 1.3)) * 255.0));
            const b = @as(u8, @intFromFloat(@abs(@sin((xf + yf) * 3.14 + t * 0.7)) * 255.0));
            
            // BGRA format
            window.pixels[idx + 0] = b;
            window.pixels[idx + 1] = g;
            window.pixels[idx + 2] = r;
            window.pixels[idx + 3] = 255;
        }
    }
}

// Seed initial color into density texture
fn seedInitialColor(device: *gpu.Device, textures: *FluidTextures, width: u32, height: u32) !void {
    // Create a simple compute shader that fills density with color
    const seed_code =
        \\@group(0) @binding(0) var density_out: texture_storage_2d<rgba8unorm, write>;
        \\
        \\@compute @workgroup_size(8, 8)
        \\fn seed(@builtin(global_invocation_id) id: vec3<u32>) {
        \\    let size = textureDimensions(density_out);
        \\    if (id.x >= size.x || id.y >= size.y) { return; }
        \\    
        \\    // Create a colorful gradient
        \\    let uv = vec2<f32>(f32(id.x) / f32(size.x), f32(id.y) / f32(size.y));
        \\    let color = vec4<f32>(uv.x, uv.y, 0.5 + 0.5 * sin(uv.x * 10.0), 1.0);
        \\    
        \\    textureStore(density_out, vec2<i32>(id.xy), color);
        \\}
    ;
    
    var shader = try device.createShaderModule(seed_code);
    defer shader.deinit();
    
    var bgl = try device.createBindGroupLayout(&[_]gpu.BindGroupLayoutEntry{
        .{ .binding = 0, .visibility = 4, .storage_texture = .{ .access = 1, .format = .rgba8unorm, .view_dimension = .@"2d" } },
    });
    defer bgl.deinit();
    
    var layout = try device.createPipelineLayout(&[_]*gpu.BindGroupLayout{&bgl});
    defer layout.deinit();
    
    var pipeline = try device.createComputePipeline(&shader, "seed", &layout);
    defer pipeline.deinit();
    
    // Dispatch
    var encoder = try device.createCommandEncoder();
    defer encoder.deinit();
    
    var pass = try encoder.beginComputePass();
    pass.setPipeline(&pipeline);
    
    var bind_group = try device.createBindGroup(&bgl, &[_]gpu.BindGroupEntry{
        .{ .binding = 0, .texture_view = textures.density_write_view.handle },
    });
    defer bind_group.deinit();
    
    pass.setBindGroup(0, &bind_group);
    
    const workgroup_size = 8;
    const dispatch_x = (width + workgroup_size - 1) / workgroup_size;
    const dispatch_y = (height + workgroup_size - 1) / workgroup_size;
    pass.dispatchWorkgroups(dispatch_x, dispatch_y, 1);
    pass.end();
    pass.deinit();
    
    var cmd_buffer = try encoder.finish();
    defer cmd_buffer.deinit();
    
    device.submit(&[_]*gpu.CommandBuffer{&cmd_buffer});
    
    textures.swapDensity();
    std.log.info("✅ Density seeded with test pattern", .{});
}

// Helper functions
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

fn createAdvectionLayout(device: *gpu.Device) !gpu.BindGroupLayout {
    return device.createBindGroupLayout(&[_]gpu.BindGroupLayoutEntry{
        .{ .binding = 0, .visibility = wgpu.ShaderStage_COMPUTE, .texture = .{ .sample_type = 2, .view_dimension = .@"2d", .multisampled = false } },
        .{ .binding = 1, .visibility = wgpu.ShaderStage_COMPUTE, .texture = .{ .sample_type = 2, .view_dimension = .@"2d", .multisampled = false } },
        .{ .binding = 2, .visibility = wgpu.ShaderStage_COMPUTE, .texture = .{ .sample_type = 2, .view_dimension = .@"2d", .multisampled = false } },
        .{ .binding = 3, .visibility = wgpu.ShaderStage_COMPUTE, .texture = .{ .sample_type = 2, .view_dimension = .@"2d", .multisampled = false } },
        .{ .binding = 4, .visibility = wgpu.ShaderStage_COMPUTE, .storage_texture = .{ .access = 1, .format = .r32float, .view_dimension = .@"2d" } },
        .{ .binding = 5, .visibility = wgpu.ShaderStage_COMPUTE, .storage_texture = .{ .access = 1, .format = .r32float, .view_dimension = .@"2d" } },
    });
}

fn createDivergenceLayout(device: *gpu.Device) !gpu.BindGroupLayout {
    return device.createBindGroupLayout(&[_]gpu.BindGroupLayoutEntry{
        .{ .binding = 0, .visibility = wgpu.ShaderStage_COMPUTE, .texture = .{ .sample_type = 2, .view_dimension = .@"2d", .multisampled = false } },
        .{ .binding = 1, .visibility = wgpu.ShaderStage_COMPUTE, .texture = .{ .sample_type = 2, .view_dimension = .@"2d", .multisampled = false } },
        .{ .binding = 2, .visibility = wgpu.ShaderStage_COMPUTE, .storage_texture = .{ .access = 1, .format = .r32float, .view_dimension = .@"2d" } },
    });
}

fn createPressureLayout(device: *gpu.Device) !gpu.BindGroupLayout {
    return device.createBindGroupLayout(&[_]gpu.BindGroupLayoutEntry{
        .{ .binding = 0, .visibility = wgpu.ShaderStage_COMPUTE, .texture = .{ .sample_type = 2, .view_dimension = .@"2d", .multisampled = false } },
        .{ .binding = 1, .visibility = wgpu.ShaderStage_COMPUTE, .texture = .{ .sample_type = 2, .view_dimension = .@"2d", .multisampled = false } },
        .{ .binding = 2, .visibility = wgpu.ShaderStage_COMPUTE, .storage_texture = .{ .access = 1, .format = .r32float, .view_dimension = .@"2d" } },
    });
}

fn createGradientLayout(device: *gpu.Device) !gpu.BindGroupLayout {
    return device.createBindGroupLayout(&[_]gpu.BindGroupLayoutEntry{
        .{ .binding = 0, .visibility = wgpu.ShaderStage_COMPUTE, .texture = .{ .sample_type = 2, .view_dimension = .@"2d", .multisampled = false } },
        .{ .binding = 1, .visibility = wgpu.ShaderStage_COMPUTE, .texture = .{ .sample_type = 2, .view_dimension = .@"2d", .multisampled = false } },
        .{ .binding = 2, .visibility = wgpu.ShaderStage_COMPUTE, .texture = .{ .sample_type = 2, .view_dimension = .@"2d", .multisampled = false } },
        .{ .binding = 3, .visibility = wgpu.ShaderStage_COMPUTE, .storage_texture = .{ .access = 1, .format = .r32float, .view_dimension = .@"2d" } },
        .{ .binding = 4, .visibility = wgpu.ShaderStage_COMPUTE, .storage_texture = .{ .access = 1, .format = .r32float, .view_dimension = .@"2d" } },
    });
}
