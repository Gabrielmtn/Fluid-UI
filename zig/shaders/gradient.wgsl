// Gradient subtraction shader - subtracts pressure gradient from velocity to make it divergence-free
// Ports js/05-fluid-sim.js gradientFrag to WGSL compute shader

struct Uniforms {
    texel_size: vec2<f32>,
    width: u32,
    height: u32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var pressure_texture: texture_2d<f32>;
@group(0) @binding(2) var velocity_texture: texture_2d<f32>;
@group(0) @binding(3) var point_sampler: sampler;
@group(0) @binding(4) var output: texture_storage_2d<rg32float, write>;

@compute @workgroup_size(8, 8, 1)
fn gradient_subtract(@builtin(global_invocation_id) id: vec3<u32>) {
    if (id.x >= uniforms.width || id.y >= uniforms.height) {
        return;
    }
    
    // Normalized UV coordinates
    let uv = vec2<f32>(
        (f32(id.x) + 0.5) / f32(uniforms.width),
        (f32(id.y) + 0.5) / f32(uniforms.height)
    );
    
    // Neighbor UVs (clamped to boundary)
    let vL = clamp(uv - vec2<f32>(uniforms.texel_size.x, 0.0), vec2<f32>(0.0), vec2<f32>(1.0));
    let vR = clamp(uv + vec2<f32>(uniforms.texel_size.x, 0.0), vec2<f32>(0.0), vec2<f32>(1.0));
    let vB = clamp(uv - vec2<f32>(0.0, uniforms.texel_size.y), vec2<f32>(0.0), vec2<f32>(1.0));
    let vT = clamp(uv + vec2<f32>(0.0, uniforms.texel_size.y), vec2<f32>(0.0), vec2<f32>(1.0));
    
    // Sample pressure at neighbors
    let pL = textureSampleLevel(pressure_texture, point_sampler, vL, 0.0).x;
    let pR = textureSampleLevel(pressure_texture, point_sampler, vR, 0.0).x;
    let pB = textureSampleLevel(pressure_texture, point_sampler, vB, 0.0).x;
    let pT = textureSampleLevel(pressure_texture, point_sampler, vT, 0.0).x;
    
    // Sample velocity
    let vel = textureSampleLevel(velocity_texture, point_sampler, uv, 0.0).xy;
    
    // Subtract pressure gradient: v = v - grad(p)
    let grad_p = vec2<f32>(pR - pL, pT - pB);
    let corrected_vel = vel - grad_p;
    
    textureStore(output, id.xy, vec4<f32>(corrected_vel, 0.0, 1.0));
}
