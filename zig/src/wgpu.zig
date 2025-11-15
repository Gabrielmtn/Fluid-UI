// Minimal Zig bindings for wgpu-native
// Based on wgpu.h and webgpu.h

const std = @import("std");

// Opaque handle types
pub const Instance = opaque {};
pub const Adapter = opaque {};
pub const Device = opaque {};
pub const Queue = opaque {};
pub const Texture = opaque {};
pub const TextureView = opaque {};
pub const ShaderModule = opaque {};
pub const ComputePipeline = opaque {};
pub const RenderPipeline = opaque {};
pub const CommandEncoder = opaque {};
pub const ComputePassEncoder = opaque {};
pub const RenderPassEncoder = opaque {};
pub const CommandBuffer = opaque {};
pub const Buffer = opaque {};
pub const BindGroup = opaque {};
pub const BindGroupLayout = opaque {};
pub const PipelineLayout = opaque {};
pub const Sampler = opaque {};

// Enums
pub const TextureFormat = enum(c_uint) {
    undefined = 0x00000000,
    r8unorm = 0x00000001,
    r8snorm = 0x00000002,
    r8uint = 0x00000003,
    r8sint = 0x00000004,
    r16uint = 0x00000005,
    r16sint = 0x00000006,
    r16float = 0x00000007,
    rg8unorm = 0x00000008,
    rg8snorm = 0x00000009,
    rg8uint = 0x0000000A,
    rg8sint = 0x0000000B,
    r32float = 0x0000000C,
    r32uint = 0x0000000D,
    r32sint = 0x0000000E,
    rg16uint = 0x0000000F,
    rg16sint = 0x00000010,
    rg16float = 0x00000011,
    rgba8unorm = 0x00000012,
    rgba8unorm_srgb = 0x00000013,
    rgba8snorm = 0x00000014,
    rgba8uint = 0x00000015,
    rgba8sint = 0x00000016,
    bgra8unorm = 0x00000017,
    bgra8unorm_srgb = 0x00000018,
    rgb10a2unorm = 0x00000019,
    rg11b10ufloat = 0x0000001A,
    rgb9e5ufloat = 0x0000001B,
    rg32float = 0x0000001C,
    rg32uint = 0x0000001D,
    rg32sint = 0x0000001E,
    rgba16uint = 0x0000001F,
    rgba16sint = 0x00000020,
    rgba16float = 0x00000021,
    rgba32float = 0x00000022,
    rgba32uint = 0x00000023,
    rgba32sint = 0x00000024,
};

pub const TextureUsage = packed struct(u32) {
    copy_src: bool = false,
    copy_dst: bool = false,
    texture_binding: bool = false,
    storage_binding: bool = false,
    render_attachment: bool = false,
    _padding: u27 = 0,
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

pub const TextureDimension = enum(c_uint) {
    @"1d" = 0x00000000,
    @"2d" = 0x00000001,
    @"3d" = 0x00000002,
};

pub const TextureViewDimension = enum(c_uint) {
    undefined = 0x00000000,
    @"1d" = 0x00000001,
    @"2d" = 0x00000002,
    @"2d_array" = 0x00000003,
    cube = 0x00000004,
    cube_array = 0x00000005,
    @"3d" = 0x00000006,
};

pub const LoadOp = enum(c_uint) {
    undefined = 0x00000000,
    clear = 0x00000001,
    load = 0x00000002,
};

pub const StoreOp = enum(c_uint) {
    undefined = 0x00000000,
    store = 0x00000001,
    discard = 0x00000002,
};

pub const PowerPreference = enum(c_uint) {
    undefined = 0x00000000,
    low_power = 0x00000001,
    high_performance = 0x00000002,
};

pub const BackendType = enum(c_uint) {
    undefined = 0x00000000,
    null_backend = 0x00000001,
    webgpu = 0x00000002,
    d3d11 = 0x00000003,
    d3d12 = 0x00000004,
    metal = 0x00000005,
    vulkan = 0x00000006,
    opengl = 0x00000007,
    opengles = 0x00000008,
};

// Structs
pub const Extent3D = extern struct {
    width: u32,
    height: u32,
    depth_or_array_layers: u32 = 1,
};

pub const Origin3D = extern struct {
    x: u32 = 0,
    y: u32 = 0,
    z: u32 = 0,
};

pub const Color = extern struct {
    r: f64,
    g: f64,
    b: f64,
    a: f64,
};

pub const Limits = extern struct {
    max_texture_dimension_1d: u32 = 8192,
    max_texture_dimension_2d: u32 = 8192,
    max_texture_dimension_3d: u32 = 2048,
    max_texture_array_layers: u32 = 256,
    max_bind_groups: u32 = 4,
    max_bindings_per_bind_group: u32 = 1000,
    max_dynamic_uniform_buffers_per_pipeline_layout: u32 = 8,
    max_dynamic_storage_buffers_per_pipeline_layout: u32 = 4,
    max_sampled_textures_per_shader_stage: u32 = 16,
    max_samplers_per_shader_stage: u32 = 16,
    max_storage_buffers_per_shader_stage: u32 = 8,
    max_storage_textures_per_shader_stage: u32 = 4,
    max_uniform_buffers_per_shader_stage: u32 = 12,
    max_uniform_buffer_binding_size: u64 = 65536,
    max_storage_buffer_binding_size: u64 = 134217728,
    min_uniform_buffer_offset_alignment: u32 = 256,
    min_storage_buffer_offset_alignment: u32 = 256,
    max_vertex_buffers: u32 = 8,
    max_buffer_size: u64 = 268435456,
    max_vertex_attributes: u32 = 16,
    max_vertex_buffer_array_stride: u32 = 2048,
    max_inter_stage_shader_components: u32 = 60,
    max_compute_workgroup_storage_size: u32 = 16384,
    max_compute_invocations_per_workgroup: u32 = 256,
    max_compute_workgroup_size_x: u32 = 256,
    max_compute_workgroup_size_y: u32 = 256,
    max_compute_workgroup_size_z: u32 = 64,
    max_compute_workgroups_per_dimension: u32 = 65535,
};

pub const ChainedStruct = extern struct {
    next: ?*const ChainedStruct = null,
    s_type: u32,
};

pub const InstanceDescriptor = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
};

pub const RequestAdapterOptions = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    compatible_surface: ?*anyopaque = null,
    power_preference: PowerPreference = .undefined,
    force_fallback_adapter: bool = false,
};

pub const DeviceDescriptor = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    label: ?[*:0]const u8 = null,
    required_features_count: usize = 0,
    required_features: ?[*]const u32 = null,
    required_limits: ?*const Limits = null,
    default_queue: QueueDescriptor = .{},
};

pub const QueueDescriptor = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    label: ?[*:0]const u8 = null,
};

pub const TextureDescriptor = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    label: ?[*:0]const u8 = null,
    usage: TextureUsage,
    dimension: TextureDimension = .@"2d",
    size: Extent3D,
    format: TextureFormat,
    mip_level_count: u32 = 1,
    sample_count: u32 = 1,
    view_format_count: usize = 0,
    view_formats: ?[*]const TextureFormat = null,
};

pub const TextureViewDescriptor = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    label: ?[*:0]const u8 = null,
    format: TextureFormat = .undefined,
    dimension: TextureViewDimension = .undefined,
    base_mip_level: u32 = 0,
    mip_level_count: u32 = 0xFFFFFFFF,
    base_array_layer: u32 = 0,
    array_layer_count: u32 = 0xFFFFFFFF,
    aspect: u32 = 0x00000001, // All
};

pub const BufferDescriptor = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    label: ?[*:0]const u8 = null,
    usage: BufferUsage,
    size: u64,
    mapped_at_creation: bool = false,
};

pub const ShaderModuleDescriptor = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    label: ?[*:0]const u8 = null,
};

pub const ShaderModuleWGSLDescriptor = extern struct {
    chain: ChainedStruct,
    code: [*:0]const u8,
};

pub const ProgrammableStageDescriptor = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    module: *ShaderModule,
    entry_point: [*:0]const u8,
    constant_count: usize = 0,
    constants: ?*anyopaque = null,
};

pub const ComputePipelineDescriptor = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    label: ?[*:0]const u8 = null,
    layout: ?*PipelineLayout = null,
    compute: ProgrammableStageDescriptor,
};

pub const BindGroupLayoutEntry = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    binding: u32,
    visibility: u32, // ShaderStage flags
    buffer: BufferBindingLayout = .{},
    sampler: SamplerBindingLayout = .{},
    texture: TextureBindingLayout = .{},
    storage_texture: StorageTextureBindingLayout = .{},
};

pub const BufferBindingLayout = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    type: u32 = 0, // undefined
    has_dynamic_offset: bool = false,
    min_binding_size: u64 = 0,
};

pub const SamplerBindingLayout = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    type: u32 = 0, // undefined
};

pub const TextureBindingLayout = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    sample_type: u32 = 0, // undefined
    view_dimension: TextureViewDimension = .undefined,
    multisampled: bool = false,
};

pub const StorageTextureBindingLayout = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    access: u32 = 0, // undefined
    format: TextureFormat = .undefined,
    view_dimension: TextureViewDimension = .undefined,
};

pub const BindGroupLayoutDescriptor = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    label: ?[*:0]const u8 = null,
    entry_count: usize,
    entries: [*]const BindGroupLayoutEntry,
};

pub const BindGroupEntry = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    binding: u32,
    buffer: ?*Buffer = null,
    offset: u64 = 0,
    size: u64 = 0xFFFFFFFFFFFFFFFF,
    sampler: ?*Sampler = null,
    texture_view: ?*TextureView = null,
};

pub const BindGroupDescriptor = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    label: ?[*:0]const u8 = null,
    layout: *BindGroupLayout,
    entry_count: usize,
    entries: [*]const BindGroupEntry,
};

pub const PipelineLayoutDescriptor = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    label: ?[*:0]const u8 = null,
    bind_group_layout_count: usize,
    bind_group_layouts: [*]const *BindGroupLayout,
};

pub const CommandEncoderDescriptor = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    label: ?[*:0]const u8 = null,
};

pub const AddressMode = enum(c_uint) {
    clamp_to_edge = 0x00000000,
    repeat = 0x00000001,
    mirror_repeat = 0x00000002,
};

pub const FilterMode = enum(c_uint) {
    nearest = 0x00000000,
    linear = 0x00000001,
};

pub const MipmapFilterMode = enum(c_uint) {
    nearest = 0x00000000,
    linear = 0x00000001,
};

pub const SamplerDescriptor = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    label: ?[*:0]const u8 = null,
    address_mode_u: AddressMode = .clamp_to_edge,
    address_mode_v: AddressMode = .clamp_to_edge,
    address_mode_w: AddressMode = .clamp_to_edge,
    mag_filter: FilterMode = .linear,
    min_filter: FilterMode = .linear,
    mipmap_filter: MipmapFilterMode = .nearest,
    lod_min_clamp: f32 = 0.0,
    lod_max_clamp: f32 = 32.0,
    compare: u32 = 0, // CompareFunction::Undefined
    max_anisotropy: u16 = 1,
};

pub const ComputePassDescriptor = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    label: ?[*:0]const u8 = null,
    timestamp_write_count: usize = 0,
    timestamp_writes: ?*anyopaque = null,
};

// Render pipeline types
pub const BlendFactor = enum(c_uint) {
    zero = 0x00000000,
    one = 0x00000001,
    src = 0x00000002,
    one_minus_src = 0x00000003,
    src_alpha = 0x00000004,
    one_minus_src_alpha = 0x00000005,
    dst = 0x00000006,
    one_minus_dst = 0x00000007,
    dst_alpha = 0x00000008,
    one_minus_dst_alpha = 0x00000009,
    src_alpha_saturated = 0x0000000A,
    constant = 0x0000000B,
    one_minus_constant = 0x0000000C,
};

pub const BlendOperation = enum(c_uint) {
    add = 0x00000000,
    subtract = 0x00000001,
    reverse_subtract = 0x00000002,
    min = 0x00000003,
    max = 0x00000004,
};

pub const ColorWriteMask = packed struct(u32) {
    red: bool = true,
    green: bool = true,
    blue: bool = true,
    alpha: bool = true,
    _padding: u28 = 0,
};

pub const BlendComponent = extern struct {
    operation: BlendOperation = .add,
    src_factor: BlendFactor = .one,
    dst_factor: BlendFactor = .zero,
};

pub const BlendState = extern struct {
    color: BlendComponent,
    alpha: BlendComponent,
};

pub const ColorTargetState = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    format: TextureFormat,
    blend: ?*const BlendState = null,
    write_mask: ColorWriteMask = .{},
};

pub const FragmentState = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    module: *ShaderModule,
    entry_point: [*:0]const u8,
    constant_count: usize = 0,
    constants: ?*anyopaque = null,
    target_count: usize,
    targets: [*]const ColorTargetState,
};

pub const PrimitiveTopology = enum(c_uint) {
    point_list = 0x00000000,
    line_list = 0x00000001,
    line_strip = 0x00000002,
    triangle_list = 0x00000003,
    triangle_strip = 0x00000004,
};

pub const FrontFace = enum(c_uint) {
    ccw = 0x00000000,
    cw = 0x00000001,
};

pub const CullMode = enum(c_uint) {
    none = 0x00000000,
    front = 0x00000001,
    back = 0x00000002,
};

pub const PrimitiveState = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    topology: PrimitiveTopology = .triangle_list,
    strip_index_format: TextureFormat = .undefined,
    front_face: FrontFace = .ccw,
    cull_mode: CullMode = .none,
};

pub const MultisampleState = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    count: u32 = 1,
    mask: u32 = 0xFFFFFFFF,
    alpha_to_coverage_enabled: u32 = 0,
};

pub const RenderPipelineDescriptor = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    label: ?[*:0]const u8 = null,
    layout: ?*PipelineLayout,
    vertex: VertexState,
    primitive: PrimitiveState = .{},
    depth_stencil: ?*anyopaque = null,
    multisample: MultisampleState = .{},
    fragment: ?*const FragmentState = null,
};

pub const VertexStepMode = enum(c_uint) {
    vertex = 0x00000000,
    instance = 0x00000001,
};

pub const VertexFormat = enum(c_uint) {
    undefined = 0x00000000,
    uint8x2 = 0x00000001,
    uint8x4 = 0x00000002,
    sint8x2 = 0x00000003,
    sint8x4 = 0x00000004,
    unorm8x2 = 0x00000005,
    unorm8x4 = 0x00000006,
    snorm8x2 = 0x00000007,
    snorm8x4 = 0x00000008,
    uint16x2 = 0x00000009,
    uint16x4 = 0x0000000A,
    sint16x2 = 0x0000000B,
    sint16x4 = 0x0000000C,
    unorm16x2 = 0x0000000D,
    unorm16x4 = 0x0000000E,
    snorm16x2 = 0x0000000F,
    snorm16x4 = 0x00000010,
    float16x2 = 0x00000011,
    float16x4 = 0x00000012,
    float32 = 0x00000013,
    float32x2 = 0x00000014,
    float32x3 = 0x00000015,
    float32x4 = 0x00000016,
    uint32 = 0x00000017,
    uint32x2 = 0x00000018,
    uint32x3 = 0x00000019,
    uint32x4 = 0x0000001A,
    sint32 = 0x0000001B,
    sint32x2 = 0x0000001C,
    sint32x3 = 0x0000001D,
    sint32x4 = 0x0000001E,
};

pub const VertexAttribute = extern struct {
    format: VertexFormat,
    offset: u64,
    shader_location: u32,
};

pub const VertexBufferLayout = extern struct {
    array_stride: u64,
    step_mode: VertexStepMode = .vertex,
    attribute_count: usize,
    attributes: [*]const VertexAttribute,
};

pub const VertexState = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    module: *ShaderModule,
    entry_point: [*:0]const u8,
    constant_count: usize = 0,
    constants: ?*anyopaque = null,
    buffer_count: usize = 0,
    buffers: ?[*]const VertexBufferLayout = null,
};

pub const RenderPassColorAttachment = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    view: ?*TextureView,
    resolve_target: ?*TextureView = null,
    load_op: LoadOp,
    store_op: StoreOp,
    clear_value: Color = .{ .r = 0, .g = 0, .b = 0, .a = 1 },
};

pub const RenderPassDescriptor = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    label: ?[*:0]const u8 = null,
    color_attachment_count: usize,
    color_attachments: [*]const RenderPassColorAttachment,
    depth_stencil_attachment: ?*anyopaque = null,
    occlusion_query_set: ?*anyopaque = null,
    timestamp_write_count: usize = 0,
    timestamp_writes: ?*anyopaque = null,
};

pub const ImageCopyTexture = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    texture: *Texture,
    mip_level: u32 = 0,
    origin: Origin3D = .{},
    aspect: u32 = 0x00000001, // All
};

pub const ImageCopyBuffer = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    layout: TextureDataLayout,
    buffer: *Buffer,
};

pub const TextureDataLayout = extern struct {
    next_in_chain: ?*const ChainedStruct = null,
    offset: u64 = 0,
    bytes_per_row: u32,
    rows_per_image: u32 = 0xFFFFFFFF,
};

// Callback types
pub const RequestAdapterCallback = *const fn (
    status: c_uint,
    adapter: ?*Adapter,
    message: ?[*:0]const u8,
    userdata: ?*anyopaque,
) callconv(.c) void;

pub const RequestDeviceCallback = *const fn (
    status: c_uint,
    device: ?*Device,
    message: ?[*:0]const u8,
    userdata: ?*anyopaque,
) callconv(.c) void;

pub const BufferMapCallback = *const fn (
    status: c_uint,
    userdata: ?*anyopaque,
) callconv(.c) void;

pub const ErrorCallback = *const fn (
    type: c_uint,
    message: [*:0]const u8,
    userdata: ?*anyopaque,
) callconv(.c) void;

// C function declarations
pub extern "wgpu_native" fn wgpuCreateInstance(descriptor: ?*const InstanceDescriptor) ?*Instance;
pub extern "wgpu_native" fn wgpuInstanceRequestAdapter(instance: *Instance, options: ?*const RequestAdapterOptions, callback: RequestAdapterCallback, userdata: ?*anyopaque) void;
pub extern "wgpu_native" fn wgpuAdapterRequestDevice(adapter: *Adapter, descriptor: ?*const DeviceDescriptor, callback: RequestDeviceCallback, userdata: ?*anyopaque) void;
pub extern "wgpu_native" fn wgpuDeviceGetQueue(device: *Device) *Queue;
pub extern "wgpu_native" fn wgpuDeviceCreateTexture(device: *Device, descriptor: *const TextureDescriptor) *Texture;
pub extern "wgpu_native" fn wgpuDeviceCreateBuffer(device: *Device, descriptor: *const BufferDescriptor) *Buffer;
pub extern "wgpu_native" fn wgpuDeviceCreateShaderModule(device: *Device, descriptor: *const ShaderModuleDescriptor) *ShaderModule;
pub extern "wgpu_native" fn wgpuDeviceCreateComputePipeline(device: *Device, descriptor: *const ComputePipelineDescriptor) *ComputePipeline;
pub extern "wgpu_native" fn wgpuDeviceCreateRenderPipeline(device: *Device, descriptor: *const RenderPipelineDescriptor) *RenderPipeline;
pub extern "wgpu_native" fn wgpuDeviceCreateBindGroupLayout(device: *Device, descriptor: *const BindGroupLayoutDescriptor) *BindGroupLayout;
pub extern "wgpu_native" fn wgpuDeviceCreateBindGroup(device: *Device, descriptor: *const BindGroupDescriptor) *BindGroup;
pub extern "wgpu_native" fn wgpuDeviceCreatePipelineLayout(device: *Device, descriptor: *const PipelineLayoutDescriptor) *PipelineLayout;
pub extern "wgpu_native" fn wgpuDeviceCreateCommandEncoder(device: *Device, descriptor: ?*const CommandEncoderDescriptor) *CommandEncoder;
pub extern "wgpu_native" fn wgpuDeviceCreateSampler(device: *Device, descriptor: ?*const SamplerDescriptor) *Sampler;
pub extern "wgpu_native" fn wgpuDeviceSetUncapturedErrorCallback(device: *Device, callback: ErrorCallback, userdata: ?*anyopaque) void;
pub extern "wgpu_native" fn wgpuDevicePoll(device: *Device, wait: bool, wrapped_submission_index: ?*anyopaque) bool;

pub extern "wgpu_native" fn wgpuTextureCreateView(texture: *Texture, descriptor: ?*const TextureViewDescriptor) *TextureView;
pub extern "wgpu_native" fn wgpuTextureDestroy(texture: *Texture) void;

pub extern "wgpu_native" fn wgpuBufferMapAsync(buffer: *Buffer, mode: u32, offset: usize, size: usize, callback: BufferMapCallback, userdata: ?*anyopaque) void;
pub extern "wgpu_native" fn wgpuBufferGetConstMappedRange(buffer: *Buffer, offset: usize, size: usize) ?*const anyopaque;
pub extern "wgpu_native" fn wgpuBufferGetMappedRange(buffer: *Buffer, offset: usize, size: usize) ?*anyopaque;
pub extern "wgpu_native" fn wgpuBufferUnmap(buffer: *Buffer) void;
pub extern "wgpu_native" fn wgpuBufferDestroy(buffer: *Buffer) void;

pub extern "wgpu_native" fn wgpuCommandEncoderBeginComputePass(encoder: *CommandEncoder, descriptor: ?*const ComputePassDescriptor) *ComputePassEncoder;
pub extern "wgpu_native" fn wgpuCommandEncoderBeginRenderPass(encoder: *CommandEncoder, descriptor: *const RenderPassDescriptor) *RenderPassEncoder;
pub extern "wgpu_native" fn wgpuCommandEncoderCopyTextureToBuffer(encoder: *CommandEncoder, source: *const ImageCopyTexture, destination: *const ImageCopyBuffer, copy_size: *const Extent3D) void;
pub extern "wgpu_native" fn wgpuCommandEncoderFinish(encoder: *CommandEncoder, descriptor: ?*anyopaque) *CommandBuffer;

pub extern "wgpu_native" fn wgpuComputePassEncoderSetPipeline(pass_encoder: *ComputePassEncoder, pipeline: *ComputePipeline) void;
pub extern "wgpu_native" fn wgpuComputePassEncoderSetBindGroup(pass_encoder: *ComputePassEncoder, group_index: u32, group: *BindGroup, dynamic_offset_count: usize, dynamic_offsets: ?[*]const u32) void;
pub extern "wgpu_native" fn wgpuComputePassEncoderDispatchWorkgroups(pass_encoder: *ComputePassEncoder, workgroup_count_x: u32, workgroup_count_y: u32, workgroup_count_z: u32) void;
pub extern "wgpu_native" fn wgpuComputePassEncoderEnd(pass_encoder: *ComputePassEncoder) void;

pub extern "wgpu_native" fn wgpuRenderPassEncoderSetPipeline(pass_encoder: *RenderPassEncoder, pipeline: *RenderPipeline) void;
pub extern "wgpu_native" fn wgpuRenderPassEncoderSetBindGroup(pass_encoder: *RenderPassEncoder, group_index: u32, group: *BindGroup, dynamic_offset_count: usize, dynamic_offsets: ?[*]const u32) void;
pub extern "wgpu_native" fn wgpuRenderPassEncoderDraw(pass_encoder: *RenderPassEncoder, vertex_count: u32, instance_count: u32, first_vertex: u32, first_instance: u32) void;
pub extern "wgpu_native" fn wgpuRenderPassEncoderEnd(pass_encoder: *RenderPassEncoder) void;

pub extern "wgpu_native" fn wgpuQueueSubmit(queue: *Queue, command_count: usize, commands: [*]const *CommandBuffer) void;
pub extern "wgpu_native" fn wgpuQueueWriteBuffer(queue: *Queue, buffer: *Buffer, buffer_offset: u64, data: *const anyopaque, size: usize) void;

pub extern "wgpu_native" fn wgpuInstanceRelease(instance: *Instance) void;
pub extern "wgpu_native" fn wgpuAdapterRelease(adapter: *Adapter) void;
pub extern "wgpu_native" fn wgpuDeviceRelease(device: *Device) void;
pub extern "wgpu_native" fn wgpuQueueRelease(queue: *Queue) void;
pub extern "wgpu_native" fn wgpuTextureRelease(texture: *Texture) void;
pub extern "wgpu_native" fn wgpuTextureViewRelease(view: *TextureView) void;
pub extern "wgpu_native" fn wgpuBufferRelease(buffer: *Buffer) void;
pub extern "wgpu_native" fn wgpuShaderModuleRelease(module: *ShaderModule) void;
pub extern "wgpu_native" fn wgpuComputePipelineRelease(pipeline: *ComputePipeline) void;
pub extern "wgpu_native" fn wgpuRenderPipelineRelease(pipeline: *RenderPipeline) void;
pub extern "wgpu_native" fn wgpuBindGroupRelease(bind_group: *BindGroup) void;
pub extern "wgpu_native" fn wgpuBindGroupLayoutRelease(layout: *BindGroupLayout) void;
pub extern "wgpu_native" fn wgpuPipelineLayoutRelease(layout: *PipelineLayout) void;
pub extern "wgpu_native" fn wgpuCommandEncoderRelease(encoder: *CommandEncoder) void;
pub extern "wgpu_native" fn wgpuCommandBufferRelease(command_buffer: *CommandBuffer) void;
pub extern "wgpu_native" fn wgpuComputePassEncoderRelease(pass_encoder: *ComputePassEncoder) void;
pub extern "wgpu_native" fn wgpuRenderPassEncoderRelease(pass_encoder: *RenderPassEncoder) void;
pub extern "wgpu_native" fn wgpuSamplerRelease(sampler: *Sampler) void;

// Constants
pub const WHOLE_SIZE: u64 = 0xFFFFFFFFFFFFFFFF;
pub const WHOLE_MAP_SIZE: usize = 0xFFFFFFFF;
pub const COPY_STRIDE_UNDEFINED: u32 = 0xFFFFFFFF;
pub const LIMIT_U32_UNDEFINED: u32 = 0xFFFFFFFF;
pub const LIMIT_U64_UNDEFINED: u64 = 0xFFFFFFFFFFFFFFFF;

// Shader stage flags
pub const ShaderStage_NONE: u32 = 0x00000000;
pub const ShaderStage_VERTEX: u32 = 0x00000001;
pub const ShaderStage_FRAGMENT: u32 = 0x00000002;
pub const ShaderStage_COMPUTE: u32 = 0x00000004;

// Map mode flags
pub const MapMode_READ: u32 = 0x00000001;
pub const MapMode_WRITE: u32 = 0x00000002;

// WGSL chain s_type
pub const SType_ShaderModuleWGSLDescriptor: u32 = 0x00000006;
