// Divergence shader - computes divergence of velocity field
// Ports js/05-fluid-sim.js divergenceFrag to WGSL compute shader

struct Uniforms {
    texel_size: vec2<f32>,
    width: u32,
    height: u32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var velocity_texture: texture_2d<f32>;
@group(0) @binding(2) var point_sampler: sampler;
@group(0) @binding(3) var output: texture_storage_2d<r32float, write>;

// Sample velocity with boundary reflection
fn sample_velocity(uv: vec2<f32>) -> vec2<f32> {
    var m = vec2<f32>(1.0, 1.0);
    var clamped_uv = uv;
    
    // Reflect boundary conditions
    if (uv.x < 0.0 || uv.x > 1.0) {
        clamped_uv.x = clamp(uv.x, 0.0, 1.0);
        m.x = -1.0;
    }
    if (uv.y < 0.0 || uv.y > 1.0) {
        clamped_uv.y = clamp(uv.y, 0.0, 1.0);
        m.y = -1.0;
    }
    
    return m * textureSampleLevel(velocity_texture, point_sampler, clamped_uv, 0.0).xy;
}

@compute @workgroup_size(8, 8, 1)
fn divergence(@builtin(global_invocation_id) id: vec3<u32>) {
    if (id.x >= uniforms.width || id.y >= uniforms.height) {
        return;
    }
    
    // Normalized UV coordinates
    let uv = vec2<f32>(
        (f32(id.x) + 0.5) / f32(uniforms.width),
        (f32(id.y) + 0.5) / f32(uniforms.height)
    );
    
    // Neighbor UVs
    let vL = uv - vec2<f32>(uniforms.texel_size.x, 0.0);
    let vR = uv + vec2<f32>(uniforms.texel_size.x, 0.0);
    let vB = uv - vec2<f32>(0.0, uniforms.texel_size.y);
    let vT = uv + vec2<f32>(0.0, uniforms.texel_size.y);
    
    // Compute divergence
    let div = 0.5 * (sample_velocity(vR).x - sample_velocity(vL).x + 
                     sample_velocity(vT).y - sample_velocity(vB).y);
    
    textureStore(output, id.xy, vec4<f32>(div, 0.0, 0.0, 0.0));
}
