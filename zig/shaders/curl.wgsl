// Curl shader - computes vorticity (curl) of velocity field
// Ports js/05-fluid-sim.js curlFrag to WGSL compute shader

struct Uniforms {
    texel_size: vec2<f32>,
    width: u32,
    height: u32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var velocity_texture: texture_2d<f32>;
@group(0) @binding(2) var point_sampler: sampler;
@group(0) @binding(3) var output: texture_storage_2d<r32float, write>;

@compute @workgroup_size(8, 8, 1)
fn curl(@builtin(global_invocation_id) id: vec3<u32>) {
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
    
    // Sample neighbors
    let L = textureSampleLevel(velocity_texture, point_sampler, vL, 0.0).xy;
    let R = textureSampleLevel(velocity_texture, point_sampler, vR, 0.0).xy;
    let B = textureSampleLevel(velocity_texture, point_sampler, vB, 0.0).xy;
    let T = textureSampleLevel(velocity_texture, point_sampler, vT, 0.0).xy;
    
    // Compute curl (vorticity in 2D): dVy/dx - dVx/dy
    let vorticity = R.y - L.y - T.x + B.x;
    
    textureStore(output, id.xy, vec4<f32>(vorticity, 0.0, 0.0, 0.0));
}
