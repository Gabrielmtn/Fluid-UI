// GPU Compute Pipeline Manager for Fluid Simulation
const std = @import("std");
const wgpu = @import("wgpu.zig");
const gpu = @import("gpu_backend_real.zig");
const gpu_textures = @import("gpu_textures.zig");

pub const FluidPipelines = struct {
    // Compute pipelines for each fluid kernel
    advection: gpu.ComputePipeline,
    divergence: gpu.ComputePipeline,
    curl: gpu.ComputePipeline,
    pressure: gpu.ComputePipeline,
    gradient: gpu.ComputePipeline,
    splat: gpu.ComputePipeline,
    display: gpu.ComputePipeline,
    
    // Shader modules
    advection_shader: gpu.ShaderModule,
    divergence_shader: gpu.ShaderModule,
    curl_shader: gpu.ShaderModule,
    pressure_shader: gpu.ShaderModule,
    gradient_shader: gpu.ShaderModule,
    splat_shader: gpu.ShaderModule,
    display_shader: gpu.ShaderModule,
    
    // Bind group layout (shared across pipelines)
    bind_group_layout: gpu.BindGroupLayout,
    
    // Pipeline layout
    pipeline_layout: gpu.PipelineLayout,
    
    device: *gpu.Device,
    
    pub fn init(device: *gpu.Device) !FluidPipelines {
        std.log.info("🔥 Creating GPU compute pipelines...", .{});
        
        // === Load Shaders ===
        std.log.info("  Loading WGSL shaders...", .{});
        
        var advection_shader = try loadShader(device, "advection.wgsl");
        errdefer advection_shader.deinit();
        std.log.info("    ✅ advection.wgsl", .{});
        
        var divergence_shader = try loadShader(device, "divergence.wgsl");
        errdefer divergence_shader.deinit();
        std.log.info("    ✅ divergence.wgsl", .{});
        
        var curl_shader = try loadShader(device, "curl.wgsl");
        errdefer curl_shader.deinit();
        std.log.info("    ✅ curl.wgsl", .{});
        
        var pressure_shader = try loadShader(device, "pressure.wgsl");
        errdefer pressure_shader.deinit();
        std.log.info("    ✅ pressure.wgsl", .{});
        
        var gradient_shader = try loadShader(device, "gradient.wgsl");
        errdefer gradient_shader.deinit();
        std.log.info("    ✅ gradient.wgsl", .{});
        
        var splat_shader = try loadShader(device, "splat.wgsl");
        errdefer splat_shader.deinit();
        std.log.info("    ✅ splat.wgsl", .{});
        
        var display_shader = try loadShader(device, "display.wgsl");
        errdefer display_shader.deinit();
        std.log.info("    ✅ display.wgsl", .{});
        
        // === Create an empty Pipeline Layout (no bind groups). We will add bind groups in Phase 4. ===
        std.log.info("  Creating pipeline layout...", .{});
        var pipeline_layout = try device.createPipelineLayout(&[_]*gpu.BindGroupLayout{});
        errdefer pipeline_layout.deinit();
        std.log.info("    ✅ pipeline_layout", .{});
        
        // === Create Compute Pipelines ===
        std.log.info("  Creating compute pipelines...", .{});
        
        var advection = try device.createComputePipeline(&advection_shader, "advection", null);
        errdefer advection.deinit();
        std.log.info("    ✅ advection_pipeline", .{});
        
        var divergence = try device.createComputePipeline(&divergence_shader, "divergence", null);
        errdefer divergence.deinit();
        std.log.info("    ✅ divergence_pipeline", .{});
        
        var curl = try device.createComputePipeline(&curl_shader, "curl", null);
        errdefer curl.deinit();
        std.log.info("    ✅ curl_pipeline", .{});
        
        var pressure = try device.createComputePipeline(&pressure_shader, "pressure_jacobi", null);
        errdefer pressure.deinit();
        std.log.info("    ✅ pressure_pipeline", .{});
        
        var gradient = try device.createComputePipeline(&gradient_shader, "gradient_subtract", null);
        errdefer gradient.deinit();
        std.log.info("    ✅ gradient_pipeline", .{});
        
        // Splat (reuse same layout)
        var splat = try device.createComputePipeline(&splat_shader, "splat", null);
        errdefer splat.deinit();
        std.log.info("    ✅ splat_pipeline", .{});
        
        // Display (reuse same layout)
        // Display is a render pipeline; use gradient as placeholder to keep list intact
        var display = try device.createComputePipeline(&gradient_shader, "gradient_subtract", null);
        errdefer display.deinit();
        std.log.info("    ✅ display_pipeline", .{});
        
        return FluidPipelines{
            .advection = advection,
            .divergence = divergence,
            .curl = curl,
            .pressure = pressure,
            .gradient = gradient,
            .splat = splat,
            .display = display,
            .advection_shader = advection_shader,
            .divergence_shader = divergence_shader,
            .curl_shader = curl_shader,
            .pressure_shader = pressure_shader,
            .gradient_shader = gradient_shader,
            .splat_shader = splat_shader,
            .display_shader = display_shader,
            // No bind group layout yet (Phase 4)
            .bind_group_layout = undefined,
            .pipeline_layout = pipeline_layout,
            .device = device,
        };
    }
    
    pub fn deinit(self: *FluidPipelines) void {
        // Clean up all resources
        self.advection.deinit();
        self.divergence.deinit();
        self.curl.deinit();
        self.pressure.deinit();
        self.gradient.deinit();
        self.splat.deinit();
        self.display.deinit();
        
        self.advection_shader.deinit();
        self.divergence_shader.deinit();
        self.curl_shader.deinit();
        self.pressure_shader.deinit();
        self.gradient_shader.deinit();
        self.splat_shader.deinit();
        self.display_shader.deinit();
        
        // No bind group layout to deinit yet
        self.pipeline_layout.deinit();
    }
};

fn loadShader(device: *gpu.Device, filename: []const u8) !gpu.ShaderModule {
    const shader_dir = "shaders";
    const full_path = try std.fs.path.join(std.heap.page_allocator, &[_][]const u8{ shader_dir, filename });
    defer std.heap.page_allocator.free(full_path);
    
    const file = std.fs.cwd().openFile(full_path, .{}) catch |err| {
        std.log.err("Failed to open shader file {s}: {}", .{filename, err});
        return err;
    };
    defer file.close();
    
    const source = try file.readToEndAlloc(std.heap.page_allocator, 1024 * 1024); // Max 1MB
    defer std.heap.page_allocator.free(source);
    
    // Add null terminator for WGSL
    const wgsl_source = try std.heap.page_allocator.allocSentinel(u8, source.len, 0);
    defer std.heap.page_allocator.free(wgsl_source);
    @memcpy(wgsl_source, source);
    
    return device.createShaderModule(wgsl_source);
}
