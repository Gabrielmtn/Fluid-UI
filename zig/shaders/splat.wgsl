// Splat shader - adds force or density at a point with Gaussian falloff
// Ports js/05-fluid-sim.js splatFrag to WGSL compute shader

struct Uniforms {
    point: vec2<f32>,       // normalized position
    radius: f32,
    aspect_ratio: f32,
    width: u32,
    height: u32,
    color: vec3<f32>,       // RGB color or velocity
    _padding: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var target_texture: texture_2d<f32>;
@group(0) @binding(2) var linear_sampler: sampler;
@group(0) @binding(3) var output: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8, 1)
fn splat(@builtin(global_invocation_id) id: vec3<u32>) {
    if (id.x >= uniforms.width || id.y >= uniforms.height) {
        return;
    }
    
    // Normalized UV coordinates
    let uv = vec2<f32>(
        (f32(id.x) + 0.5) / f32(uniforms.width),
        (f32(id.y) + 0.5) / f32(uniforms.height)
    );
    
    // Distance from splat point (corrected for aspect ratio)
    var p = uv - uniforms.point;
    p.x *= uniforms.aspect_ratio;
    
    // Gaussian splat
    let splat = exp(-dot(p, p) / uniforms.radius) * uniforms.color;
    
    // Add to existing value
    let base = textureSampleLevel(target_texture, linear_sampler, uv, 0.0).rgb;
    let result = base + splat * 0.2;
    
    textureStore(output, id.xy, vec4<f32>(result, 1.0));
}
