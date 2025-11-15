// Advection fragment shader - outputs to rgba8unorm render target
// Samples velocity and source fields, performs semi-Lagrangian advection

struct Uniforms {
    texel_size: vec2<f32>,
    dt: f32,
    dissipation: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var velocity_texture: texture_2d<f32>;
@group(0) @binding(2) var source_texture: texture_2d<f32>;
@group(0) @binding(3) var linear_sampler: sampler;

struct FragmentInput {
    @location(0) uv: vec2<f32>,
}

@fragment
fn fs_advect(input: FragmentInput) -> @location(0) vec4<f32> {
    // Sample velocity at current position
    let velocity = textureSample(velocity_texture, linear_sampler, input.uv).xy;
    
    // Trace particle backwards in time (semi-Lagrangian)
    let back_uv = input.uv - velocity * uniforms.dt * uniforms.texel_size;
    
    // Sample source field at traced position
    let advected = textureSample(source_texture, linear_sampler, back_uv);
    
    // Apply dissipation
    return advected * uniforms.dissipation;
}
