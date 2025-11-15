// Real GPU Backend using wgpu-native
const std = @import("std");
const wgpu = @import("wgpu.zig");

pub const TextureFormat = enum {
    RG32Float,
    RGBA32Float,
    RGBA16Float,
    R32Float,
    RGBA8Unorm,
    
    pub fn toWGPU(self: TextureFormat) wgpu.TextureFormat {
        return switch (self) {
            .RG32Float => .rg32float,
            .RGBA32Float => .rgba32float,
            .RGBA16Float => .rgba16float,
            .R32Float => .r32float,
            .RGBA8Unorm => .rgba8unorm,
        };
    }
};

pub const Instance = struct {
    handle: *wgpu.Instance,
    allocator: std.mem.Allocator,
    
    pub fn init(allocator: std.mem.Allocator) !Instance {
        const desc = wgpu.InstanceDescriptor{};
        const handle = wgpu.wgpuCreateInstance(&desc) orelse
            return error.InstanceCreationFailed;
        
        return .{
            .handle = handle,
            .allocator = allocator,
        };
    }
    
    pub fn deinit(self: *Instance) void {
        wgpu.wgpuInstanceRelease(self.handle);
    }
    
    pub fn requestAdapter(self: *Instance) !Adapter {
        var result: ?*wgpu.Adapter = null;
        var done = false;
        
        const Context = struct {
            adapter: *?*wgpu.Adapter,
            done: *bool,
        };
        
        var ctx = Context{
            .adapter = &result,
            .done = &done,
        };
        
        const callback = struct {
            fn cb(
                status: c_uint,
                adapter: ?*wgpu.Adapter,
                message: ?[*:0]const u8,
                userdata: ?*anyopaque,
            ) callconv(.c) void {
                const context = @as(*Context, @ptrCast(@alignCast(userdata)));
                if (status == 0) { // Success
                    context.adapter.* = adapter;
                } else {
                    if (message) |msg| {
                        std.log.err("Adapter request failed: {s}", .{msg});
                    }
                }
                context.done.* = true;
            }
        }.cb;
        
        const options = wgpu.RequestAdapterOptions{
            .power_preference = .high_performance,
        };
        
        wgpu.wgpuInstanceRequestAdapter(self.handle, &options, callback, &ctx);
        
        // Wait for callback
        while (!done) {
            std.Thread.sleep(1_000_000); // 1ms
        }
        
        if (result) |adapter| {
            return Adapter{ .handle = adapter };
        }
        
        return error.AdapterRequestFailed;
    }
};

pub const Adapter = struct {
    handle: *wgpu.Adapter,
    
    pub fn deinit(self: *Adapter) void {
        wgpu.wgpuAdapterRelease(self.handle);
    }
    
    pub fn requestDevice(self: *Adapter) !Device {
        var result: ?*wgpu.Device = null;
        var done = false;
        
        const Context = struct {
            device: *?*wgpu.Device,
            done: *bool,
        };
        
        var ctx = Context{
            .device = &result,
            .done = &done,
        };
        
        const callback = struct {
            fn cb(
                status: c_uint,
                device: ?*wgpu.Device,
                message: ?[*:0]const u8,
                userdata: ?*anyopaque,
            ) callconv(.c) void {
                const context = @as(*Context, @ptrCast(@alignCast(userdata)));
                if (status == 0) { // Success
                    context.device.* = device;
                } else {
                    if (message) |msg| {
                        std.log.err("Device request failed: {s}", .{msg});
                    }
                }
                context.done.* = true;
            }
        }.cb;
        
        const desc = wgpu.DeviceDescriptor{
            .label = "Fluid Simulation Device",
        };
        
        wgpu.wgpuAdapterRequestDevice(self.handle, &desc, callback, &ctx);
        
        // Wait for callback
        while (!done) {
            std.Thread.sleep(1_000_000); // 1ms
        }
        
        if (result) |device| {
            // Set error callback
            const error_callback = struct {
                fn cb(
                    err_type: c_uint,
                    message: [*:0]const u8,
                    userdata: ?*anyopaque,
                ) callconv(.c) void {
                    _ = userdata;
                    _ = err_type;
                    std.log.err("GPU Error: {s}", .{message});
                }
            }.cb;
            
            wgpu.wgpuDeviceSetUncapturedErrorCallback(device, error_callback, null);
            
            const queue = wgpu.wgpuDeviceGetQueue(device);
            return Device{
                .handle = device,
                .queue = queue,
            };
        }
        
        return error.DeviceRequestFailed;
    }
};

pub const Device = struct {
    handle: *wgpu.Device,
    queue: *wgpu.Queue,
    
    pub fn deinit(self: *Device) void {
        wgpu.wgpuQueueRelease(self.queue);
        wgpu.wgpuDeviceRelease(self.handle);
    }
    
    pub fn poll(self: *Device, wait: bool) void {
        _ = wgpu.wgpuDevicePoll(self.handle, wait, null);
    }
    
    pub const TextureUsage = struct {
        texture_binding: bool = true,  // Default to true for most textures
        storage_binding: bool = true,  // Default to true for compute
        render_attachment: bool = false,
        copy_src: bool = true,
        copy_dst: bool = true,
    };
    
    pub fn createTexture(self: *Device, width: u32, height: u32, format: TextureFormat, usage: ?TextureUsage) !Texture {
        const actual_usage = usage orelse TextureUsage{};
        var wgpu_usage = wgpu.TextureUsage{};
        if (actual_usage.texture_binding) wgpu_usage.texture_binding = true;
        if (actual_usage.storage_binding) wgpu_usage.storage_binding = true;
        if (actual_usage.render_attachment) wgpu_usage.render_attachment = true;
        if (actual_usage.copy_src) wgpu_usage.copy_src = true;
        if (actual_usage.copy_dst) wgpu_usage.copy_dst = true;
        
        const desc = wgpu.TextureDescriptor{
            .usage = wgpu_usage,
            .size = .{
                .width = width,
                .height = height,
                .depth_or_array_layers = 1,
            },
            .format = format.toWGPU(),
        };
        
        const handle = wgpu.wgpuDeviceCreateTexture(self.handle, &desc);
        
        return Texture{
            .handle = handle,
            .width = width,
            .height = height,
            .format = format,
        };
    }
    
    pub fn createBuffer(self: *Device, size: u64, usage: BufferUsage) !Buffer {
        var wgpu_usage = wgpu.BufferUsage{};
        if (usage.uniform) wgpu_usage.uniform = true;
        if (usage.storage) wgpu_usage.storage = true;
        if (usage.copy_dst) wgpu_usage.copy_dst = true;
        if (usage.copy_src) wgpu_usage.copy_src = true;
        if (usage.map_read) wgpu_usage.map_read = true;
        
        const desc = wgpu.BufferDescriptor{
            .usage = wgpu_usage,
            .size = size,
        };
        
        const handle = wgpu.wgpuDeviceCreateBuffer(self.handle, &desc);
        
        return Buffer{
            .handle = handle,
            .size = size,
        };
    }
    
    pub fn createShaderModule(self: *Device, code: [:0]const u8) !ShaderModule {
        const wgsl_desc = wgpu.ShaderModuleWGSLDescriptor{
            .chain = .{
                .next = null,
                .s_type = wgpu.SType_ShaderModuleWGSLDescriptor,
            },
            .code = code.ptr,
        };
        
        const desc = wgpu.ShaderModuleDescriptor{
            .next_in_chain = @ptrCast(&wgsl_desc.chain),
            .label = "Shader Module",
        };
        
        const handle = wgpu.wgpuDeviceCreateShaderModule(self.handle, &desc);
        
        return ShaderModule{ .handle = handle };
    }
    
    pub fn createComputePipeline(
        self: *Device,
        shader: *ShaderModule,
        entry_point: [:0]const u8,
        layout: ?*PipelineLayout,
    ) !ComputePipeline {
        const desc = wgpu.ComputePipelineDescriptor{
            .label = "Compute Pipeline",
            .layout = if (layout) |l| l.handle else null,
            .compute = .{
                .module = shader.handle,
                .entry_point = entry_point.ptr,
            },
        };
        
        const handle = wgpu.wgpuDeviceCreateComputePipeline(self.handle, &desc);
        
        return ComputePipeline{ .handle = handle };
    }
    
    pub fn createRenderPipeline(
        self: *Device,
        vertex_shader: *ShaderModule,
        vertex_entry: [:0]const u8,
        fragment_shader: *ShaderModule,
        fragment_entry: [:0]const u8,
        color_format: wgpu.TextureFormat,
        layout: ?*PipelineLayout,
    ) !RenderPipeline {
        const color_target = wgpu.ColorTargetState{
            .format = color_format,
        };
        
        const fragment_state = wgpu.FragmentState{
            .module = fragment_shader.handle,
            .entry_point = fragment_entry.ptr,
            .target_count = 1,
            .targets = @ptrCast(&color_target),
        };
        
        const desc = wgpu.RenderPipelineDescriptor{
            .label = "Render Pipeline",
            .layout = if (layout) |l| l.handle else null,
            .vertex = .{
                .module = vertex_shader.handle,
                .entry_point = vertex_entry.ptr,
            },
            .fragment = &fragment_state,
        };
        
        const handle = wgpu.wgpuDeviceCreateRenderPipeline(self.handle, &desc);
        
        return RenderPipeline{ .handle = handle };
    }
    
    pub fn createBindGroupLayout(self: *Device, entries: []const BindGroupLayoutEntry) !BindGroupLayout {
        const desc = wgpu.BindGroupLayoutDescriptor{
            .label = "Bind Group Layout",
            .entry_count = entries.len,
            .entries = @ptrCast(entries.ptr),
        };
        
        const handle = wgpu.wgpuDeviceCreateBindGroupLayout(self.handle, &desc);
        
        return BindGroupLayout{ .handle = handle };
    }
    
    pub fn createBindGroup(
        self: *Device,
        layout: *BindGroupLayout,
        entries: []const BindGroupEntry,
    ) !BindGroup {
        const desc = wgpu.BindGroupDescriptor{
            .label = "Bind Group",
            .layout = layout.handle,
            .entry_count = entries.len,
            .entries = @ptrCast(entries.ptr),
        };
        
        const handle = wgpu.wgpuDeviceCreateBindGroup(self.handle, &desc);
        
        return BindGroup{ .handle = handle };
    }
    
    pub fn createPipelineLayout(self: *Device, bind_group_layouts: []const *BindGroupLayout) !PipelineLayout {
        // Convert to raw handles (temporary buffer)
        var handle_buf = try std.heap.page_allocator.alloc(*wgpu.BindGroupLayout, bind_group_layouts.len);
        defer std.heap.page_allocator.free(handle_buf);

        var i: usize = 0;
        while (i < bind_group_layouts.len) : (i += 1) {
            handle_buf[i] = bind_group_layouts[i].handle;
        }

        const desc = wgpu.PipelineLayoutDescriptor{
            .label = "Pipeline Layout",
            .bind_group_layout_count = handle_buf.len,
            .bind_group_layouts = handle_buf.ptr,
        };
        
        const handle = wgpu.wgpuDeviceCreatePipelineLayout(self.handle, &desc);
        
        return PipelineLayout{ .handle = handle };
    }
    
    pub fn createCommandEncoder(self: *Device) !CommandEncoder {
        const handle = wgpu.wgpuDeviceCreateCommandEncoder(self.handle, null);
        
        return CommandEncoder{ .handle = handle };
    }

    pub fn createSampler(self: *Device, desc: ?wgpu.SamplerDescriptor) !Sampler {
        const sampler_desc = desc orelse wgpu.SamplerDescriptor{
            .mag_filter = .linear,
            .min_filter = .linear,
            .mipmap_filter = .linear, // Must be linear when using anisotropic filtering
            .address_mode_u = .clamp_to_edge,
            .address_mode_v = .clamp_to_edge,
            .address_mode_w = .clamp_to_edge,
        };
        const handle = wgpu.wgpuDeviceCreateSampler(self.handle, &sampler_desc);
        return Sampler{ .handle = handle };
    }
    
    pub fn writeBuffer(self: *Device, buffer: *Buffer, offset: u64, data: []const u8) void {
        // NOTE: wgpuQueueWriteBuffer has a known issue where it leaves an internal staging
        // buffer mapped, causing validation errors on subsequent submits.
        // TODO: Replace with proper mapped buffer API in Phase 5
        wgpu.wgpuQueueWriteBuffer(self.queue, buffer.handle, offset, data.ptr, data.len);
    }
    
    pub fn submit(self: *Device, commands: []const *CommandBuffer) void {
        // Submit each command buffer individually to avoid temporary allocations
        for (commands) |cmd| {
            var one = [_]*wgpu.CommandBuffer{ cmd.handle };
            wgpu.wgpuQueueSubmit(self.queue, 1, &one);
        }
    }
};

pub const Texture = struct {
    handle: *wgpu.Texture,
    width: u32,
    height: u32,
    format: TextureFormat,
    
    pub fn deinit(self: *Texture) void {
        wgpu.wgpuTextureRelease(self.handle);
    }
    
    pub fn createView(self: *Texture) !TextureView {
        const handle = wgpu.wgpuTextureCreateView(self.handle, null);
        return TextureView{ .handle = handle };
    }
};

pub const TextureView = struct {
    handle: *wgpu.TextureView,
    
    pub fn deinit(self: *TextureView) void {
        wgpu.wgpuTextureViewRelease(self.handle);
    }
};

pub const Sampler = struct {
    handle: *wgpu.Sampler,
    
    pub fn deinit(self: *Sampler) void {
        wgpu.wgpuSamplerRelease(self.handle);
    }
};

pub const Buffer = struct {
    handle: *wgpu.Buffer,
    size: u64,
    
    pub fn deinit(self: *Buffer) void {
        wgpu.wgpuBufferRelease(self.handle);
    }
    
    pub fn mapAsync(self: *Buffer, mode: MapMode, offset: usize, size: usize) !void {
        var done = false;
        
        const callback = struct {
            fn cb(status: c_uint, userdata: ?*anyopaque) callconv(.c) void {
                const done_ptr = @as(*bool, @ptrCast(@alignCast(userdata)));
                _ = status;
                done_ptr.* = true;
            }
        }.cb;
        
        const mode_flags: u32 = switch (mode) {
            .read => wgpu.MapMode_READ,
            .write => wgpu.MapMode_WRITE,
        };
        
        wgpu.wgpuBufferMapAsync(self.handle, mode_flags, offset, size, callback, &done);
        
        // Wait for mapping
        while (!done) {
            std.Thread.sleep(100_000); // 0.1ms
        }
    }
    
    pub fn getMappedRange(self: *Buffer, offset: usize, size: usize) ![]u8 {
        const ptr = wgpu.wgpuBufferGetMappedRange(self.handle, offset, size) orelse
            return error.MappingFailed;
        return @as([*]u8, @ptrCast(ptr))[0..size];
    }
    
    pub fn unmap(self: *Buffer) void {
        wgpu.wgpuBufferUnmap(self.handle);
    }
};

pub const BufferUsage = struct {
    uniform: bool = false,
    storage: bool = false,
    copy_dst: bool = false,
    copy_src: bool = false,
    map_read: bool = false,
};

pub const MapMode = enum {
    read,
    write,
};

pub const ShaderModule = struct {
    handle: *wgpu.ShaderModule,
    
    pub fn deinit(self: *ShaderModule) void {
        wgpu.wgpuShaderModuleRelease(self.handle);
    }
};

pub const ComputePipeline = struct {
    handle: *wgpu.ComputePipeline,
    
    pub fn deinit(self: *ComputePipeline) void {
        wgpu.wgpuComputePipelineRelease(self.handle);
    }
};

pub const BindGroupLayoutEntry = wgpu.BindGroupLayoutEntry;
pub const BindGroupEntry = wgpu.BindGroupEntry;

pub const BindGroupLayout = struct {
    handle: *wgpu.BindGroupLayout,
    
    pub fn deinit(self: *BindGroupLayout) void {
        wgpu.wgpuBindGroupLayoutRelease(self.handle);
    }
};

pub const BindGroup = struct {
    handle: *wgpu.BindGroup,
    
    pub fn deinit(self: *BindGroup) void {
        wgpu.wgpuBindGroupRelease(self.handle);
    }
};

pub const PipelineLayout = struct {
    handle: *wgpu.PipelineLayout,
    
    pub fn deinit(self: *PipelineLayout) void {
        wgpu.wgpuPipelineLayoutRelease(self.handle);
    }
};

pub const CommandEncoder = struct {
    handle: *wgpu.CommandEncoder,
    
    pub fn deinit(self: *CommandEncoder) void {
        wgpu.wgpuCommandEncoderRelease(self.handle);
    }
    
    pub fn beginComputePass(self: *CommandEncoder) !ComputePassEncoder {
        const handle = wgpu.wgpuCommandEncoderBeginComputePass(self.handle, null);
        return ComputePassEncoder{ .handle = handle };
    }
    
    pub fn beginRenderPass(self: *CommandEncoder, color_attachments: []const wgpu.RenderPassColorAttachment) !RenderPassEncoder {
        const desc = wgpu.RenderPassDescriptor{
            .color_attachment_count = color_attachments.len,
            .color_attachments = color_attachments.ptr,
        };
        const handle = wgpu.wgpuCommandEncoderBeginRenderPass(self.handle, &desc);
        return RenderPassEncoder{ .handle = handle };
    }
    
    pub fn copyTextureToBuffer(
        self: *CommandEncoder,
        texture: *Texture,
        buffer: *Buffer,
        bytes_per_row: u32,
        rows_per_image: u32,
    ) void {
        const src = wgpu.ImageCopyTexture{
            .texture = texture.handle,
        };
        
        const dst = wgpu.ImageCopyBuffer{
            .layout = .{
                .bytes_per_row = bytes_per_row,
                .rows_per_image = rows_per_image,
            },
            .buffer = buffer.handle,
        };
        
        const size = wgpu.Extent3D{
            .width = texture.width,
            .height = texture.height,
            .depth_or_array_layers = 1,
        };
        
        wgpu.wgpuCommandEncoderCopyTextureToBuffer(self.handle, &src, &dst, &size);
    }
    
    pub fn finish(self: *CommandEncoder) !CommandBuffer {
        const handle = wgpu.wgpuCommandEncoderFinish(self.handle, null);
        return CommandBuffer{ .handle = handle };
    }
};

pub const ComputePassEncoder = struct {
    handle: *wgpu.ComputePassEncoder,
    
    pub fn deinit(self: *ComputePassEncoder) void {
        wgpu.wgpuComputePassEncoderRelease(self.handle);
    }
    
    pub fn setPipeline(self: *ComputePassEncoder, pipeline: *ComputePipeline) void {
        wgpu.wgpuComputePassEncoderSetPipeline(self.handle, pipeline.handle);
    }
    
    pub fn setBindGroup(self: *ComputePassEncoder, index: u32, bind_group: *BindGroup) void {
        wgpu.wgpuComputePassEncoderSetBindGroup(self.handle, index, bind_group.handle, 0, null);
    }
    
    pub fn dispatchWorkgroups(self: *ComputePassEncoder, x: u32, y: u32, z: u32) void {
        wgpu.wgpuComputePassEncoderDispatchWorkgroups(self.handle, x, y, z);
    }
    
    pub fn end(self: *ComputePassEncoder) void {
        wgpu.wgpuComputePassEncoderEnd(self.handle);
    }
};

pub const RenderPassEncoder = struct {
    handle: *wgpu.RenderPassEncoder,
    
    pub fn deinit(self: *RenderPassEncoder) void {
        wgpu.wgpuRenderPassEncoderRelease(self.handle);
    }
    
    pub fn setPipeline(self: *RenderPassEncoder, pipeline: *RenderPipeline) void {
        wgpu.wgpuRenderPassEncoderSetPipeline(self.handle, pipeline.handle);
    }
    
    pub fn setBindGroup(self: *RenderPassEncoder, index: u32, bind_group: *BindGroup) void {
        wgpu.wgpuRenderPassEncoderSetBindGroup(self.handle, index, bind_group.handle, 0, null);
    }
    
    pub fn draw(self: *RenderPassEncoder, vertex_count: u32, instance_count: u32) void {
        wgpu.wgpuRenderPassEncoderDraw(self.handle, vertex_count, instance_count, 0, 0);
    }
    
    pub fn end(self: *RenderPassEncoder) void {
        wgpu.wgpuRenderPassEncoderEnd(self.handle);
    }
};

pub const RenderPipeline = struct {
    handle: *wgpu.RenderPipeline,
    
    pub fn deinit(self: *RenderPipeline) void {
        wgpu.wgpuRenderPipelineRelease(self.handle);
    }
};

pub const CommandBuffer = struct {
    handle: *wgpu.CommandBuffer,
    
    pub fn deinit(self: *CommandBuffer) void {
        wgpu.wgpuCommandBufferRelease(self.handle);
    }
};
