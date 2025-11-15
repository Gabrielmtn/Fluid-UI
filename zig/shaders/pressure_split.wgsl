// Pressure solver - Phase 6 (Jacobi iteration)
// Solves Poisson equation: ∇²p = -∇·v for pressure
// Uses r32float format for all fields

// Input: divergence field
@group(0) @binding(0) var divergence: texture_2d<f32>;

// Input: pressure from previous iteration
@group(0) @binding(1) var pressure_in: texture_2d<f32>;

// Output: new pressure
@group(0) @binding(2) var pressure_out: texture_storage_2d<r32float, write>;

// Hard-coded constants (TODO: replace with push constants)
const TEXEL_SIZE_X: f32 = 1.0 / 512.0;  // For 512x288 grid
const TEXEL_SIZE_Y: f32 = 1.0 / 288.0;

@compute @workgroup_size(8, 8, 1)
fn pressure_jacobi(@builtin(global_invocation_id) id: vec3<u32>) {
    let coords = vec2<i32>(i32(id.x), i32(id.y));
    let dims = vec2<i32>(textureDimensions(divergence));
    
    // Boundary check
    if (coords.x >= dims.x || coords.y >= dims.y) {
        return;
    }
    
    // Sample neighboring pressure values
    let left = max(coords.x - 1, 0);
    let right = min(coords.x + 1, dims.x - 1);
    let down = max(coords.y - 1, 0);
    let up = min(coords.y + 1, dims.y - 1);
    
    let p_left = textureLoad(pressure_in, vec2<i32>(left, coords.y), 0).x;
    let p_right = textureLoad(pressure_in, vec2<i32>(right, coords.y), 0).x;
    let p_down = textureLoad(pressure_in, vec2<i32>(coords.x, down), 0).x;
    let p_up = textureLoad(pressure_in, vec2<i32>(coords.x, up), 0).x;
    
    // Load divergence at current cell
    let div = textureLoad(divergence, coords, 0).x;
    
    // Jacobi iteration for Poisson equation
    // p_new = (p_left + p_right + p_down + p_up - div * h²) / 4
    // Where h² is the grid spacing squared
    let h_squared = TEXEL_SIZE_X * TEXEL_SIZE_X;
    let p_new = (p_left + p_right + p_down + p_up - div * h_squared) * 0.25;
    
    // Write new pressure
    textureStore(pressure_out, coords, vec4<f32>(p_new, 0.0, 0.0, 0.0));
}
