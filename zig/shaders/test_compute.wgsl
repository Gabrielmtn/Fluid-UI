// Simple test compute shader matching Phase 5 bind group layout
// Input: sampled textures (for reading)
// Output: write-only storage texture

@group(0) @binding(0) var velocity_tex: texture_2d<f32>;  // Sampled texture
@group(0) @binding(1) var source_tex: texture_2d<f32>;    // Sampled texture  
@group(0) @binding(2) var output_tex: texture_storage_2d<r32float, write>;  // Write-only storage

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let coords = vec2<i32>(i32(global_id.x), i32(global_id.y));
    
    // Read from sampled textures using textureLoad (no sampler needed for nearest)
    let velocity = textureLoad(velocity_tex, coords, 0).r;
    let source = textureLoad(source_tex, coords, 0).r;
    
    // Simple operation: add them
    let result = velocity + source;
    
    // Write to storage texture
    textureStore(output_tex, coords, vec4<f32>(result, 0.0, 0.0, 0.0));
}
