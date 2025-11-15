const std = @import("std");

// GPU Backend Interface - can be implemented with WebGPU, Vulkan, or D3D12
// For now: stub implementation, will add real backend later

pub const TextureFormat = enum {
    RG32Float,    // Velocity (2 channels)
    RGBA32Float,  // Density (4 channels)
    R32Float,     // Pressure (1 channel)
};

pub const Texture = struct {
    width: u32,
    height: u32,
    format: TextureFormat,
    data: ?[]u8 = null, // CPU-side copy for readback
    
    pub fn init(width: u32, height: u32, format: TextureFormat) Texture {
        return .{
            .width = width,
            .height = height,
            .format = format,
        };
    }
};

pub const ComputePipeline = struct {
    shader_code: []const u8,
    entry_point: []const u8,
    
    pub fn init(shader_code: []const u8, entry_point: []const u8) ComputePipeline {
        return .{
            .shader_code = shader_code,
            .entry_point = entry_point,
        };
    }
};

pub const BindGroup = struct {
    textures: []const *Texture,
    
    pub fn init(textures: []const *Texture) BindGroup {
        return .{
            .textures = textures,
        };
    }
};

pub const CommandEncoder = struct {
    commands: std.ArrayList(Command),
    allocator: std.mem.Allocator,
    
    const Command = union(enum) {
        dispatch: struct {
            pipeline: *ComputePipeline,
            bind_group: *BindGroup,
            workgroups_x: u32,
            workgroups_y: u32,
            workgroups_z: u32,
        },
        copy_texture: struct {
            src: *Texture,
            dst: *Texture,
        },
    };
    
    pub fn init(allocator: std.mem.Allocator) !CommandEncoder {
        return .{
            .commands = std.ArrayList(Command).init(allocator),
            .allocator = allocator,
        };
    }
    
    pub fn deinit(self: *CommandEncoder) void {
        self.commands.deinit();
    }
    
    pub fn dispatch(
        self: *CommandEncoder,
        pipeline: *ComputePipeline,
        bind_group: *BindGroup,
        workgroups_x: u32,
        workgroups_y: u32,
        workgroups_z: u32,
    ) !void {
        try self.commands.append(.{
            .dispatch = .{
                .pipeline = pipeline,
                .bind_group = bind_group,
                .workgroups_x = workgroups_x,
                .workgroups_y = workgroups_y,
                .workgroups_z = workgroups_z,
            },
        });
    }
    
    pub fn copyTexture(self: *CommandEncoder, src: *Texture, dst: *Texture) !void {
        try self.commands.append(.{
            .copy_texture = .{
                .src = src,
                .dst = dst,
            },
        });
    }
    
    pub fn finish(self: *CommandEncoder) !CommandBuffer {
        return CommandBuffer{
            .commands = try self.commands.toOwnedSlice(),
            .allocator = self.allocator,
        };
    }
};

pub const CommandBuffer = struct {
    commands: []CommandEncoder.Command,
    allocator: std.mem.Allocator,
    
    pub fn deinit(self: *CommandBuffer) void {
        self.allocator.free(self.commands);
    }
};

pub const Queue = struct {
    allocator: std.mem.Allocator,
    
    pub fn init(allocator: std.mem.Allocator) Queue {
        return .{ .allocator = allocator };
    }
    
    pub fn submit(self: *Queue, command_buffers: []const *CommandBuffer) !void {
        _ = self;
        // Stub: In real implementation, this would submit to GPU
        // For now, just validate the command buffers exist
        for (command_buffers) |cmd_buf| {
            _ = cmd_buf;
            // std.log.info("Submitting {} commands", .{cmd_buf.commands.len});
        }
    }
    
    pub fn writeTexture(self: *Queue, texture: *Texture, data: []const u8) !void {
        _ = self;
        // Stub: Copy data to texture
        // In real implementation, this uploads to GPU memory
        _ = texture;
        _ = data;
    }
    
    pub fn readTexture(self: *Queue, texture: *Texture, data: []u8) !void {
        _ = self;
        // Stub: Copy texture data back to CPU
        // In real implementation, this downloads from GPU memory
        _ = texture;
        _ = data;
    }
};

pub const Device = struct {
    allocator: std.mem.Allocator,
    queue: Queue,
    
    pub fn init(allocator: std.mem.Allocator) !Device {
        std.log.info("🎮 GPU Device initialized (stub - will use real WebGPU later)", .{});
        return .{
            .allocator = allocator,
            .queue = Queue.init(allocator),
        };
    }
    
    pub fn deinit(self: *Device) void {
        _ = self;
    }
    
    pub fn createTexture(self: *Device, width: u32, height: u32, format: TextureFormat) !*Texture {
        const texture = try self.allocator.create(Texture);
        texture.* = Texture.init(width, height, format);
        return texture;
    }
    
    pub fn destroyTexture(self: *Device, texture: *Texture) void {
        self.allocator.destroy(texture);
    }
    
    pub fn createComputePipeline(self: *Device, shader_code: []const u8, entry_point: []const u8) !*ComputePipeline {
        const pipeline = try self.allocator.create(ComputePipeline);
        pipeline.* = ComputePipeline.init(shader_code, entry_point);
        std.log.info("  ✓ Created compute pipeline: {s}", .{entry_point});
        return pipeline;
    }
    
    pub fn destroyComputePipeline(self: *Device, pipeline: *ComputePipeline) void {
        self.allocator.destroy(pipeline);
    }
    
    pub fn createBindGroup(self: *Device, textures: []const *Texture) !*BindGroup {
        const bind_group = try self.allocator.create(BindGroup);
        bind_group.* = BindGroup.init(textures);
        return bind_group;
    }
    
    pub fn destroyBindGroup(self: *Device, bind_group: *BindGroup) void {
        self.allocator.destroy(bind_group);
    }
    
    pub fn createCommandEncoder(self: *Device) !*CommandEncoder {
        const encoder = try self.allocator.create(CommandEncoder);
        encoder.* = try CommandEncoder.init(self.allocator);
        return encoder;
    }
    
    pub fn destroyCommandEncoder(self: *Device, encoder: *CommandEncoder) void {
        encoder.deinit();
        self.allocator.destroy(encoder);
    }
    
    pub fn getQueue(self: *Device) *Queue {
        return &self.queue;
    }
};

pub const Instance = struct {
    allocator: std.mem.Allocator,
    
    pub fn init(allocator: std.mem.Allocator) !Instance {
        std.log.info("🚀 Initializing GPU backend...", .{});
        return .{ .allocator = allocator };
    }
    
    pub fn deinit(self: *Instance) void {
        _ = self;
    }
    
    pub fn requestDevice(self: *Instance) !Device {
        return try Device.init(self.allocator);
    }
};

// Helper to calculate workgroup counts
pub fn calculateWorkgroups(size: u32, workgroup_size: u32) u32 {
    return (size + workgroup_size - 1) / workgroup_size;
}
