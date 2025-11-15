// Divergence computation - Phase 6
// Computes the divergence of the velocity field (measures sources/sinks)
// Uses split velocity components (x and y separate) with r32float

// Input: separate X and Y velocity components
@group(0) @binding(0) var velocity_x: texture_2d<f32>;
@group(0) @binding(1) var velocity_y: texture_2d<f32>;

// Output: divergence field (scalar)
@group(0) @binding(2) var divergence: texture_storage_2d<r32float, write>;

// Hard-coded constants (TODO: replace with push constants)
const TEXEL_SIZE_X: f32 = 1.0 / 512.0;  // For 512x288 grid
const TEXEL_SIZE_Y: f32 = 1.0 / 288.0;

@compute @workgroup_size(8, 8, 1)
fn divergence_compute(@builtin(global_invocation_id) id: vec3<u32>) {
    let coords = vec2<i32>(i32(id.x), i32(id.y));
    let dims = vec2<i32>(textureDimensions(velocity_x));
    
    // Boundary check
    if (coords.x >= dims.x || coords.y >= dims.y) {
        return;
    }
    
    // Sample velocity at neighboring cells (central difference)
    let left = max(coords.x - 1, 0);
    let right = min(coords.x + 1, dims.x - 1);
    let down = max(coords.y - 1, 0);
    let up = min(coords.y + 1, dims.y - 1);
    
    let vx_right = textureLoad(velocity_x, vec2<i32>(right, coords.y), 0).x;
    let vx_left = textureLoad(velocity_x, vec2<i32>(left, coords.y), 0).x;
    let vy_up = textureLoad(velocity_y, vec2<i32>(coords.x, up), 0).x;
    let vy_down = textureLoad(velocity_y, vec2<i32>(coords.x, down), 0).x;
    
    // Compute divergence using central differences
    // div(v) = ∂vx/∂x + ∂vy/∂y
    let dvx_dx = (vx_right - vx_left) / (2.0 * TEXEL_SIZE_X);
    let dvy_dy = (vy_up - vy_down) / (2.0 * TEXEL_SIZE_Y);
    
    let div = dvx_dx + dvy_dy;
    
    // Write divergence
    textureStore(divergence, coords, vec4<f32>(div, 0.0, 0.0, 0.0));
}
