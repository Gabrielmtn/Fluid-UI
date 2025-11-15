const std = @import("std");
const gpu = @import("gpu_backend_real.zig");

/// Manages all compute pipelines for fluid simulation
/// 
/// Responsibilities:
/// - Load and compile shaders
/// - Create bind group layouts
/// - Create compute pipelines
/// - Manage bind groups
/// - Create uniform buffers
///
/// Design Philosophy:
/// - Owns all GPU pipeline resources
/// - Provides clean API for simulation step
/// - Handles resource lifecycle
/// - No simulation logic (that's in FluidSimulation)
pub const PipelineManager = struct {
    const Self = @This();
    
    // === GPU Resources ===
    device: *gpu.Device,
    allocator: std.mem.Allocator,
    
    // === Shaders ===
    advection_shader: gpu.ShaderModule,
    divergence_shader: gpu.ShaderModule,
    pressure_shader: gpu.ShaderModule,
    gradient_shader: gpu.ShaderModule,
    curl_shader: gpu.ShaderModule,
    vorticity_shader: ?gpu.ShaderModule, // Optional, Phase 9.3
    splat_shader: ?gpu.ShaderModule,     // Optional, Phase 9.2
    
    // === Bind Group Layouts ===
    advection_layout: gpu.BindGroupLayout,
    divergence_layout: gpu.BindGroupLayout,
    pressure_layout: gpu.BindGroupLayout,
    gradient_layout: gpu.BindGroupLayout,
    curl_layout: gpu.BindGroupLayout,
    
    // === Pipeline Layouts ===
    advection_pipeline_layout: gpu.PipelineLayout,
    divergence_pipeline_layout: gpu.PipelineLayout,
    pressure_pipeline_layout: gpu.PipelineLayout,
    gradient_pipeline_layout: gpu.PipelineLayout,
    curl_pipeline_layout: gpu.PipelineLayout,
    
    // === Compute Pipelines ===
    advection_pipeline: gpu.ComputePipeline,
    divergence_pipeline: gpu.ComputePipeline,
    pressure_pipeline: gpu.ComputePipeline,
    gradient_pipeline: gpu.ComputePipeline,
    curl_pipeline: gpu.ComputePipeline,
    
    /// Initialize pipeline manager and create all pipelines
    pub fn init(device: *gpu.Device, allocator: std.mem.Allocator) !Self {
        std.log.info("🔧 Creating PipelineManager...", .{});
        
        // Load shaders
        std.log.info("📜 Loading shaders...", .{});
        var advection_shader = try loadShader(device, "shaders/advection_split.wgsl");
        errdefer advection_shader.deinit();
        
        var divergence_shader = try loadShader(device, "shaders/divergence_split.wgsl");
        errdefer divergence_shader.deinit();
        
        var pressure_shader = try loadShader(device, "shaders/pressure_split.wgsl");
        errdefer pressure_shader.deinit();
        
        var gradient_shader = try loadShader(device, "shaders/gradient_split.wgsl");
        errdefer gradient_shader.deinit();
        
        var curl_shader = try loadShader(device, "shaders/curl_split.wgsl");
        errdefer curl_shader.deinit();
        
        std.log.info("✅ All shaders loaded", .{});
        
        // Create bind group layouts
        std.log.info("🔧 Creating bind group layouts...", .{});
        var advection_layout = try createAdvectionLayout(device);
        errdefer advection_layout.deinit();
        
        var divergence_layout = try createDivergenceLayout(device);
        errdefer divergence_layout.deinit();
        
        var pressure_layout = try createPressureLayout(device);
        errdefer pressure_layout.deinit();
        
        var gradient_layout = try createGradientLayout(device);
        errdefer gradient_layout.deinit();
        
        var curl_layout = try createCurlLayout(device);
        errdefer curl_layout.deinit();
        
        // Create pipeline layouts
        var advection_pipeline_layout = try device.createPipelineLayout(&[_]*gpu.BindGroupLayout{&advection_layout});
        errdefer advection_pipeline_layout.deinit();
        
        var divergence_pipeline_layout = try device.createPipelineLayout(&[_]*gpu.BindGroupLayout{&divergence_layout});
        errdefer divergence_pipeline_layout.deinit();
        
        var pressure_pipeline_layout = try device.createPipelineLayout(&[_]*gpu.BindGroupLayout{&pressure_layout});
        errdefer pressure_pipeline_layout.deinit();
        
        var gradient_pipeline_layout = try device.createPipelineLayout(&[_]*gpu.BindGroupLayout{&gradient_layout});
        errdefer gradient_pipeline_layout.deinit();
        
        var curl_pipeline_layout = try device.createPipelineLayout(&[_]*gpu.BindGroupLayout{&curl_layout});
        errdefer curl_pipeline_layout.deinit();
        
        // Create compute pipelines
        std.log.info("🔧 Creating compute pipelines...", .{});
        var advection_pipeline = try device.createComputePipeline(&advection_shader, "advection", &advection_pipeline_layout);
        errdefer advection_pipeline.deinit();
        
        var divergence_pipeline = try device.createComputePipeline(&divergence_shader, "divergence_compute", &divergence_pipeline_layout);
        errdefer divergence_pipeline.deinit();
        
        var pressure_pipeline = try device.createComputePipeline(&pressure_shader, "pressure_jacobi", &pressure_pipeline_layout);
        errdefer pressure_pipeline.deinit();
        
        var gradient_pipeline = try device.createComputePipeline(&gradient_shader, "gradient_subtract", &gradient_pipeline_layout);
        errdefer gradient_pipeline.deinit();
        
        var curl_pipeline = try device.createComputePipeline(&curl_shader, "curl_compute", &curl_pipeline_layout);
        errdefer curl_pipeline.deinit();
        
        std.log.info("✅ All pipelines created", .{});
        
        return Self{
            .device = device,
            .allocator = allocator,
            .advection_shader = advection_shader,
            .divergence_shader = divergence_shader,
            .pressure_shader = pressure_shader,
            .gradient_shader = gradient_shader,
            .curl_shader = curl_shader,
            .vorticity_shader = null,
            .splat_shader = null,
            .advection_layout = advection_layout,
            .divergence_layout = divergence_layout,
            .pressure_layout = pressure_layout,
            .gradient_layout = gradient_layout,
            .curl_layout = curl_layout,
            .advection_pipeline_layout = advection_pipeline_layout,
            .divergence_pipeline_layout = divergence_pipeline_layout,
            .pressure_pipeline_layout = pressure_pipeline_layout,
            .gradient_pipeline_layout = gradient_pipeline_layout,
            .curl_pipeline_layout = curl_pipeline_layout,
            .advection_pipeline = advection_pipeline,
            .divergence_pipeline = divergence_pipeline,
            .pressure_pipeline = pressure_pipeline,
            .gradient_pipeline = gradient_pipeline,
            .curl_pipeline = curl_pipeline,
        };
    }
    
    pub fn deinit(self: *Self) void {
        // Deinit in reverse order
        self.curl_pipeline.deinit();
        self.gradient_pipeline.deinit();
        self.pressure_pipeline.deinit();
        self.divergence_pipeline.deinit();
        self.advection_pipeline.deinit();
        
        self.curl_pipeline_layout.deinit();
        self.gradient_pipeline_layout.deinit();
        self.pressure_pipeline_layout.deinit();
        self.divergence_pipeline_layout.deinit();
        self.advection_pipeline_layout.deinit();
        
        self.curl_layout.deinit();
        self.gradient_layout.deinit();
        self.pressure_layout.deinit();
        self.divergence_layout.deinit();
        self.advection_layout.deinit();
        
        if (self.splat_shader) |*shader| shader.deinit();
        if (self.vorticity_shader) |*shader| shader.deinit();
        self.curl_shader.deinit();
        self.gradient_shader.deinit();
        self.pressure_shader.deinit();
        self.divergence_shader.deinit();
        self.advection_shader.deinit();
    }
    
    /// Get advection pipeline and layout
    pub fn getAdvectionPipeline(self: *Self) *gpu.ComputePipeline {
        return &self.advection_pipeline;
    }
    
    pub fn getAdvectionLayout(self: *Self) *gpu.BindGroupLayout {
        return &self.advection_layout;
    }
    
    /// Get divergence pipeline and layout
    pub fn getDivergencePipeline(self: *Self) *gpu.ComputePipeline {
        return &self.divergence_pipeline;
    }
    
    pub fn getDivergenceLayout(self: *Self) *gpu.BindGroupLayout {
        return &self.divergence_layout;
    }
    
    /// Get pressure pipeline and layout
    pub fn getPressurePipeline(self: *Self) *gpu.ComputePipeline {
        return &self.pressure_pipeline;
    }
    
    pub fn getPressureLayout(self: *Self) *gpu.BindGroupLayout {
        return &self.pressure_layout;
    }
    
    /// Get gradient pipeline and layout
    pub fn getGradientPipeline(self: *Self) *gpu.ComputePipeline {
        return &self.gradient_pipeline;
    }
    
    pub fn getGradientLayout(self: *Self) *gpu.BindGroupLayout {
        return &self.gradient_layout;
    }
    
    /// Get curl pipeline and layout
    pub fn getCurlPipeline(self: *Self) *gpu.ComputePipeline {
        return &self.curl_pipeline;
    }
    
    pub fn getCurlLayout(self: *Self) *gpu.BindGroupLayout {
        return &self.curl_layout;
    }
};

// ============================================================================
// Helper Functions
// ============================================================================

fn loadShader(device: *gpu.Device, path: []const u8) !gpu.ShaderModule {
    const file = try std.fs.cwd().openFile(path, .{});
    defer file.close();
    
    const size = try file.getEndPos();
    const allocator = std.heap.page_allocator;
    const source = try allocator.alloc(u8, size);
    defer allocator.free(source);
    
    _ = try file.readAll(source);
    
    return try device.createShaderModule(source);
}

fn createAdvectionLayout(device: *gpu.Device) !gpu.BindGroupLayout {
    const entries = [_]gpu.BindGroupLayoutEntry{
        // velocity_x sampled texture (read)
        .{
            .binding = 0,
            .visibility = 4, // COMPUTE
            .buffer = .{ .type = 0 },
            .sampler = .{ .type = 0 },
            .texture = .{
                .sample_type = 2, // unfilterable-float
                .view_dimension = 2, // 2D
                .multisampled = false,
            },
            .storage_texture = .{
                .access = 0,
                .format = .undefined,
                .view_dimension = 0,
            },
        },
        // velocity_y sampled texture (read)
        .{
            .binding = 1,
            .visibility = 4,
            .buffer = .{ .type = 0 },
            .sampler = .{ .type = 0 },
            .texture = .{
                .sample_type = 2,
                .view_dimension = 2,
                .multisampled = false,
            },
            .storage_texture = .{
                .access = 0,
                .format = .undefined,
                .view_dimension = 0,
            },
        },
        // sampler
        .{
            .binding = 2,
            .visibility = 4,
            .buffer = .{ .type = 0 },
            .sampler = .{ .type = 1 }, // filtering
            .texture = .{
                .sample_type = 0,
                .view_dimension = 0,
                .multisampled = false,
            },
            .storage_texture = .{
                .access = 0,
                .format = .undefined,
                .view_dimension = 0,
            },
        },
        // velocity_x_out storage texture (write)
        .{
            .binding = 3,
            .visibility = 4,
            .buffer = .{ .type = 0 },
            .sampler = .{ .type = 0 },
            .texture = .{
                .sample_type = 0,
                .view_dimension = 0,
                .multisampled = false,
            },
            .storage_texture = .{
                .access = 1, // write-only
                .format = .r32float,
                .view_dimension = 2,
            },
        },
        // velocity_y_out storage texture (write)
        .{
            .binding = 4,
            .visibility = 4,
            .buffer = .{ .type = 0 },
            .sampler = .{ .type = 0 },
            .texture = .{
                .sample_type = 0,
                .view_dimension = 0,
                .multisampled = false,
            },
            .storage_texture = .{
                .access = 1,
                .format = .r32float,
                .view_dimension = 2,
            },
        },
    };
    
    return try device.createBindGroupLayout(&entries);
}

fn createDivergenceLayout(device: *gpu.Device) !gpu.BindGroupLayout {
    const entries = [_]gpu.BindGroupLayoutEntry{
        // velocity_x sampled texture
        .{
            .binding = 0,
            .visibility = 4,
            .buffer = .{ .type = 0 },
            .sampler = .{ .type = 0 },
            .texture = .{
                .sample_type = 2,
                .view_dimension = 2,
                .multisampled = false,
            },
            .storage_texture = .{
                .access = 0,
                .format = .undefined,
                .view_dimension = 0,
            },
        },
        // velocity_y sampled texture
        .{
            .binding = 1,
            .visibility = 4,
            .buffer = .{ .type = 0 },
            .sampler = .{ .type = 0 },
            .texture = .{
                .sample_type = 2,
                .view_dimension = 2,
                .multisampled = false,
            },
            .storage_texture = .{
                .access = 0,
                .format = .undefined,
                .view_dimension = 0,
            },
        },
        // divergence_out storage texture
        .{
            .binding = 2,
            .visibility = 4,
            .buffer = .{ .type = 0 },
            .sampler = .{ .type = 0 },
            .texture = .{
                .sample_type = 0,
                .view_dimension = 0,
                .multisampled = false,
            },
            .storage_texture = .{
                .access = 1,
                .format = .r32float,
                .view_dimension = 2,
            },
        },
    };
    
    return try device.createBindGroupLayout(&entries);
}

fn createPressureLayout(device: *gpu.Device) !gpu.BindGroupLayout {
    const entries = [_]gpu.BindGroupLayoutEntry{
        // pressure_in sampled texture
        .{
            .binding = 0,
            .visibility = 4,
            .buffer = .{ .type = 0 },
            .sampler = .{ .type = 0 },
            .texture = .{
                .sample_type = 2,
                .view_dimension = 2,
                .multisampled = false,
            },
            .storage_texture = .{
                .access = 0,
                .format = .undefined,
                .view_dimension = 0,
            },
        },
        // divergence sampled texture
        .{
            .binding = 1,
            .visibility = 4,
            .buffer = .{ .type = 0 },
            .sampler = .{ .type = 0 },
            .texture = .{
                .sample_type = 2,
                .view_dimension = 2,
                .multisampled = false,
            },
            .storage_texture = .{
                .access = 0,
                .format = .undefined,
                .view_dimension = 0,
            },
        },
        // pressure_out storage texture
        .{
            .binding = 2,
            .visibility = 4,
            .buffer = .{ .type = 0 },
            .sampler = .{ .type = 0 },
            .texture = .{
                .sample_type = 0,
                .view_dimension = 0,
                .multisampled = false,
            },
            .storage_texture = .{
                .access = 1,
                .format = .r32float,
                .view_dimension = 2,
            },
        },
    };
    
    return try device.createBindGroupLayout(&entries);
}

fn createGradientLayout(device: *gpu.Device) !gpu.BindGroupLayout {
    const entries = [_]gpu.BindGroupLayoutEntry{
        // pressure sampled texture
        .{
            .binding = 0,
            .visibility = 4,
            .buffer = .{ .type = 0 },
            .sampler = .{ .type = 0 },
            .texture = .{
                .sample_type = 2,
                .view_dimension = 2,
                .multisampled = false,
            },
            .storage_texture = .{
                .access = 0,
                .format = .undefined,
                .view_dimension = 0,
            },
        },
        // velocity_x sampled texture
        .{
            .binding = 1,
            .visibility = 4,
            .buffer = .{ .type = 0 },
            .sampler = .{ .type = 0 },
            .texture = .{
                .sample_type = 2,
                .view_dimension = 2,
                .multisampled = false,
            },
            .storage_texture = .{
                .access = 0,
                .format = .undefined,
                .view_dimension = 0,
            },
        },
        // velocity_y sampled texture
        .{
            .binding = 2,
            .visibility = 4,
            .buffer = .{ .type = 0 },
            .sampler = .{ .type = 0 },
            .texture = .{
                .sample_type = 2,
                .view_dimension = 2,
                .multisampled = false,
            },
            .storage_texture = .{
                .access = 0,
                .format = .undefined,
                .view_dimension = 0,
            },
        },
        // velocity_x_out storage texture
        .{
            .binding = 3,
            .visibility = 4,
            .buffer = .{ .type = 0 },
            .sampler = .{ .type = 0 },
            .texture = .{
                .sample_type = 0,
                .view_dimension = 0,
                .multisampled = false,
            },
            .storage_texture = .{
                .access = 1,
                .format = .r32float,
                .view_dimension = 2,
            },
        },
        // velocity_y_out storage texture
        .{
            .binding = 4,
            .visibility = 4,
            .buffer = .{ .type = 0 },
            .sampler = .{ .type = 0 },
            .texture = .{
                .sample_type = 0,
                .view_dimension = 0,
                .multisampled = false,
            },
            .storage_texture = .{
                .access = 1,
                .format = .r32float,
                .view_dimension = 2,
            },
        },
    };
    
    return try device.createBindGroupLayout(&entries);
}

fn createCurlLayout(device: *gpu.Device) !gpu.BindGroupLayout {
    const entries = [_]gpu.BindGroupLayoutEntry{
        // velocity_x sampled texture
        .{
            .binding = 0,
            .visibility = 4,
            .buffer = .{ .type = 0 },
            .sampler = .{ .type = 0 },
            .texture = .{
                .sample_type = 2,
                .view_dimension = 2,
                .multisampled = false,
            },
            .storage_texture = .{
                .access = 0,
                .format = .undefined,
                .view_dimension = 0,
            },
        },
        // velocity_y sampled texture
        .{
            .binding = 1,
            .visibility = 4,
            .buffer = .{ .type = 0 },
            .sampler = .{ .type = 0 },
            .texture = .{
                .sample_type = 2,
                .view_dimension = 2,
                .multisampled = false,
            },
            .storage_texture = .{
                .access = 0,
                .format = .undefined,
                .view_dimension = 0,
            },
        },
        // curl_out storage texture
        .{
            .binding = 2,
            .visibility = 4,
            .buffer = .{ .type = 0 },
            .sampler = .{ .type = 0 },
            .texture = .{
                .sample_type = 0,
                .view_dimension = 0,
                .multisampled = false,
            },
            .storage_texture = .{
                .access = 1,
                .format = .r32float,
                .view_dimension = 2,
            },
        },
    };
    
    return try device.createBindGroupLayout(&entries);
}
