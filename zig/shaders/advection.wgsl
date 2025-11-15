// Advection shader - semi-Lagrangian advection with dissipation
// Phase 6: Updated to use WebGPU-compliant storage formats
// Simplified test version: r32float, no uniform buffer

@group(0) @binding(0) var velocity_texture: texture_2d<f32>;      // Sampled input (reading)
@group(0) @binding(1) var source_texture: texture_2d<f32>;        // Sampled input (reading)
@group(0) @binding(2) var nearest_sampler: sampler;               // Non-filtering sampler (required!)
@group(0) @binding(3) var output: texture_storage_2d<r32float, write>;  // Write-only storage

@compute @workgroup_size(8, 8, 1)
fn advection(@builtin(global_invocation_id) id: vec3<u32>) {
    // Simplified test: just copy source to output
    let coords = vec2<i32>(i32(id.x), i32(id.y));
    
    // Read source value using textureLoad (nearest sampling)
    let source_val = textureLoad(source_texture, coords, 0).x;
    
    // Simple pass-through for testing
    textureStore(output, id.xy, vec4<f32>(source_val, 0.0, 0.0, 0.0));
}
