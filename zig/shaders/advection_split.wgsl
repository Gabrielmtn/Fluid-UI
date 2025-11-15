// Advection shader - Phase 6 production version
// Uses split velocity components (x and y separate) with r32float
// Semi-Lagrangian advection with dissipation

// Note: No uniform buffer to avoid known issue
// Constants hard-coded for now (will add push constants later)

// Input: separate X and Y velocity components
@group(0) @binding(0) var velocity_x_in: texture_2d<f32>;
@group(0) @binding(1) var velocity_y_in: texture_2d<f32>;

// Input: source field to advect (separate X and Y components)
@group(0) @binding(2) var source_x_in: texture_2d<f32>;
@group(0) @binding(3) var source_y_in: texture_2d<f32>;

// Output: advected field (separate X and Y components)
@group(0) @binding(4) var output_x: texture_storage_2d<r32float, write>;
@group(0) @binding(5) var output_y: texture_storage_2d<r32float, write>;

// Hard-coded constants (TODO: replace with push constants)
const DT: f32 = 0.016;  // 60 FPS timestep
const DISSIPATION: f32 = 0.98;  // Slight dissipation
const TEXEL_SIZE_X: f32 = 1.0 / 512.0;  // For 512x288 grid
const TEXEL_SIZE_Y: f32 = 1.0 / 288.0;

@compute @workgroup_size(8, 8, 1)
fn advection(@builtin(global_invocation_id) id: vec3<u32>) {
    let coords = vec2<i32>(i32(id.x), i32(id.y));
    
    // Read velocity at current position
    let vx = textureLoad(velocity_x_in, coords, 0).x;
    let vy = textureLoad(velocity_y_in, coords, 0).x;
    
    // Semi-Lagrangian: trace particle backward in time
    let pos = vec2<f32>(f32(coords.x), f32(coords.y));
    let back_pos = pos - vec2<f32>(vx, vy) * DT / vec2<f32>(TEXEL_SIZE_X, TEXEL_SIZE_Y);
    
    // Clamp to texture bounds
    let dims = vec2<f32>(textureDimensions(source_x_in));
    let clamped_pos = clamp(back_pos, vec2<f32>(0.0), dims - vec2<f32>(1.0));
    
    // Use nearest neighbor sampling (textureLoad)
    let back_coords = vec2<i32>(i32(clamped_pos.x), i32(clamped_pos.y));
    
    // Sample source at backtraced position
    let source_x = textureLoad(source_x_in, back_coords, 0).x;
    let source_y = textureLoad(source_y_in, back_coords, 0).x;
    
    // Apply dissipation
    let result_x = source_x * DISSIPATION;
    let result_y = source_y * DISSIPATION;
    
    // Write output (separate components)
    textureStore(output_x, coords, vec4<f32>(result_x, 0.0, 0.0, 0.0));
    textureStore(output_y, coords, vec4<f32>(result_y, 0.0, 0.0, 0.0));
}
