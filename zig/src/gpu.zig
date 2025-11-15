const std = @import("std");
const backend = @import("gpu_backend.zig");

// Re-export backend types for convenience
pub const Device = backend.Device;
pub const Texture = backend.Texture;
pub const ComputePipeline = backend.ComputePipeline;
pub const BindGroup = backend.BindGroup;
pub const CommandEncoder = backend.CommandEncoder;
pub const CommandBuffer = backend.CommandBuffer;
pub const Queue = backend.Queue;
pub const Instance = backend.Instance;
pub const calculateWorkgroups = backend.calculateWorkgroups;

// Additional WebGPU type stubs (not yet in backend)
pub const TextureView = opaque {};
pub const Sampler = opaque {};
pub const BindGroupLayout = opaque {};
pub const PipelineLayout = opaque {};
pub const Adapter = opaque {};
pub const Buffer = opaque {};
pub const ShaderModule = opaque {};
pub const RenderPipeline = opaque {};
pub const ComputePassEncoder = opaque {};
pub const RenderPassEncoder = opaque {};
pub const Surface = opaque {};
pub const SwapChain = opaque {};

// Shader loading utilities
pub const ShaderSource = struct {
    code: []const u8,
    entry_point: []const u8,
    
    pub fn load(allocator: std.mem.Allocator, path: []const u8, entry: []const u8) !ShaderSource {
        const file = try std.fs.cwd().openFile(path, .{});
        defer file.close();
        
        const code = try file.readToEndAlloc(allocator, 1024 * 1024); // 1MB max
        
        return ShaderSource{
            .code = code,
            .entry_point = entry,
        };
    }
    
    pub fn deinit(self: *ShaderSource, allocator: std.mem.Allocator) void {
        allocator.free(self.code);
    }
};

pub const BackendType = enum(c_uint) {
    Undefined = 0,
    Null = 1,
    WebGPU = 2,
    D3D11 = 3,
    D3D12 = 4,
    Metal = 5,
    Vulkan = 6,
    OpenGL = 7,
    OpenGLES = 8,
};

pub const PowerPreference = enum(c_uint) {
    Undefined = 0,
    LowPower = 1,
    HighPerformance = 2,
};

pub const BufferUsage = packed struct(u32) {
    map_read: bool = false,
    map_write: bool = false,
    copy_src: bool = false,
    copy_dst: bool = false,
    index: bool = false,
    vertex: bool = false,
    uniform: bool = false,
    storage: bool = false,
    indirect: bool = false,
    query_resolve: bool = false,
    _padding: u22 = 0,
};

pub const TextureUsage = packed struct(u32) {
    copy_src: bool = false,
    copy_dst: bool = false,
    texture_binding: bool = false,
    storage_binding: bool = false,
    render_attachment: bool = false,
    _padding: u27 = 0,
};

// Use TextureFormat from backend
pub const TextureFormat = backend.TextureFormat;

// GPU context for fluid simulation
pub const GpuContext = struct {
    instance: Instance,
    device: Device,
    allocator: std.mem.Allocator,
    
    pub fn init(allocator: std.mem.Allocator) !GpuContext {
        var instance = try Instance.init(allocator);
        const device = try instance.requestDevice();
        
        return GpuContext{
            .instance = instance,
            .device = device,
            .allocator = allocator,
        };
    }
    
    pub fn deinit(self: *GpuContext) void {
        self.device.deinit();
        self.instance.deinit();
    }
    
    pub fn getDevice(self: *GpuContext) *Device {
        return &self.device;
    }
    
    pub fn getQueue(self: *GpuContext) *Queue {
        return self.device.getQueue();
    }
};

// Buffer wrapper for typed GPU data
pub fn GpuBuffer(comptime T: type) type {
    return struct {
        buffer: ?*Buffer,
        size: usize,
        usage: BufferUsage,
        
        const Self = @This();
        
        pub fn init(ctx: *GpuContext, count: usize, usage: BufferUsage) !Self {
            _ = ctx;
            return Self{
                .buffer = null,
                .size = count * @sizeOf(T),
                .usage = usage,
            };
        }
        
        pub fn deinit(self: *Self) void {
            _ = self;
            // TODO: Implement cleanup
        }
        
        pub fn write(self: *Self, ctx: *GpuContext, data: []const T) !void {
            _ = self;
            _ = ctx;
            _ = data;
            // TODO: Implement buffer write
        }
        
        pub fn read(self: *Self, ctx: *GpuContext, data: []T) !void {
            _ = self;
            _ = ctx;
            _ = data;
            // TODO: Implement buffer read
        }
    };
}

// Texture wrapper for GPU images
pub const GpuTexture = struct {
    texture: ?*Texture,
    view: ?*TextureView,
    width: u32,
    height: u32,
    format: TextureFormat,
    usage: TextureUsage,
    
    pub fn init(ctx: *GpuContext, width: u32, height: u32, format: TextureFormat, usage: TextureUsage) !GpuTexture {
        _ = ctx;
        return GpuTexture{
            .texture = null,
            .view = null,
            .width = width,
            .height = height,
            .format = format,
            .usage = usage,
        };
    }
    
    pub fn deinit(self: *GpuTexture) void {
        _ = self;
        // TODO: Implement cleanup
    }
};

// Compute pipeline for fluid kernels
pub const ComputePipelineDescriptor = struct {
    shader_source: []const u8,
    entry_point: []const u8,
    bind_group_layouts: []const *BindGroupLayout,
};

pub const GpuComputePipeline = struct {
    pipeline: ?*ComputePipeline,
    bind_group_layout: ?*BindGroupLayout,
    pipeline_layout: ?*PipelineLayout,
    
    pub fn init(ctx: *GpuContext, desc: ComputePipelineDescriptor) !GpuComputePipeline {
        _ = ctx;
        _ = desc;
        return GpuComputePipeline{
            .pipeline = null,
            .bind_group_layout = null,
            .pipeline_layout = null,
        };
    }
    
    pub fn deinit(self: *GpuComputePipeline) void {
        _ = self;
        // TODO: Implement cleanup
    }
};
