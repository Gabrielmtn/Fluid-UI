// Gradient subtraction - Phase 6
// Subtracts pressure gradient from velocity to make it divergence-free
// v_new = v_old - ∇p
// Uses split velocity components (x and y separate) with r32float

// Input: pressure field
@group(0) @binding(0) var pressure: texture_2d<f32>;

// Input: velocity before gradient subtraction
@group(0) @binding(1) var velocity_x_in: texture_2d<f32>;
@group(0) @binding(2) var velocity_y_in: texture_2d<f32>;

// Output: corrected velocity (divergence-free)
@group(0) @binding(3) var velocity_x_out: texture_storage_2d<r32float, write>;
@group(0) @binding(4) var velocity_y_out: texture_storage_2d<r32float, write>;

// Hard-coded constants (TODO: replace with push constants)
const TEXEL_SIZE_X: f32 = 1.0 / 512.0;  // For 512x288 grid
const TEXEL_SIZE_Y: f32 = 1.0 / 288.0;

@compute @workgroup_size(8, 8, 1)
fn gradient_subtract(@builtin(global_invocation_id) id: vec3<u32>) {
    let coords = vec2<i32>(i32(id.x), i32(id.y));
    let dims = vec2<i32>(textureDimensions(pressure));
    
    // Boundary check
    if (coords.x >= dims.x || coords.y >= dims.y) {
        return;
    }
    
    // Sample neighboring pressure values for gradient
    let left = max(coords.x - 1, 0);
    let right = min(coords.x + 1, dims.x - 1);
    let down = max(coords.y - 1, 0);
    let up = min(coords.y + 1, dims.y - 1);
    
    let p_right = textureLoad(pressure, vec2<i32>(right, coords.y), 0).x;
    let p_left = textureLoad(pressure, vec2<i32>(left, coords.y), 0).x;
    let p_up = textureLoad(pressure, vec2<i32>(coords.x, up), 0).x;
    let p_down = textureLoad(pressure, vec2<i32>(coords.x, down), 0).x;
    
    // Compute pressure gradient using central differences
    let grad_p_x = (p_right - p_left) / (2.0 * TEXEL_SIZE_X);
    let grad_p_y = (p_up - p_down) / (2.0 * TEXEL_SIZE_Y);
    
    // Load current velocity
    let vx = textureLoad(velocity_x_in, coords, 0).x;
    let vy = textureLoad(velocity_y_in, coords, 0).x;
    
    // Subtract pressure gradient to make velocity divergence-free
    let vx_new = vx - grad_p_x;
    let vy_new = vy - grad_p_y;
    
    // Write corrected velocity
    textureStore(velocity_x_out, coords, vec4<f32>(vx_new, 0.0, 0.0, 0.0));
    textureStore(velocity_y_out, coords, vec4<f32>(vy_new, 0.0, 0.0, 0.0));
}
