// Vorticity Confinement - adds swirly behavior to fluid
//
// Vorticity confinement helps restore energy lost due to numerical diffusion.
// It amplifies existing curl/rotation in the fluid, creating more interesting swirls.
//
// Algorithm:
// 1. Sample curl at current position and neighbors
// 2. Compute curl gradient (direction of increasing curl)
// 3. Normalize gradient to get force direction
// 4. Apply force perpendicular to gradient, scaled by curl strength
//
// Split velocity pattern: velocity stored as separate x and y components in r32float textures

@group(0) @binding(0) var velocity_x: texture_2d<f32>;
@group(0) @binding(1) var velocity_y: texture_2d<f32>;
@group(0) @binding(2) var curl: texture_2d<f32>;
@group(0) @binding(3) var velocity_x_out: texture_storage_2d<r32float, write>;
@group(0) @binding(4) var velocity_y_out: texture_storage_2d<r32float, write>;

struct Params {
    texel_size: vec2<f32>,     // 1.0 / resolution
    curl_strength: f32,         // Amplification factor
    dt: f32,                    // Time step
}

@group(0) @binding(5) var<uniform> params: Params;

@compute @workgroup_size(8, 8)
fn vorticity_confinement(@builtin(global_invocation_id) id: vec3<u32>) {
    let pos = vec2<i32>(id.xy);
    let size = textureDimensions(curl);
    
    // Boundary check
    if (pos.x >= size.x || pos.y >= size.y) {
        return;
    }
    
    // Sample curl at neighbors (for gradient)
    let curl_c = textureLoad(curl, pos, 0).r;
    let curl_l = textureLoad(curl, pos + vec2<i32>(-1, 0), 0).r;
    let curl_r = textureLoad(curl, pos + vec2<i32>(1, 0), 0).r;
    let curl_b = textureLoad(curl, pos + vec2<i32>(0, -1), 0).r;
    let curl_t = textureLoad(curl, pos + vec2<i32>(0, 1), 0).r;
    
    // Compute curl gradient (direction of increasing curl)
    // This tells us where the curl is strongest
    var curl_grad = vec2<f32>(
        abs(curl_r) - abs(curl_l),
        abs(curl_t) - abs(curl_b)
    );
    
    // Normalize gradient
    let grad_length = length(curl_grad);
    if (grad_length < 0.0001) {
        // No gradient - just pass through velocity
        let vx = textureLoad(velocity_x, pos, 0).r;
        let vy = textureLoad(velocity_y, pos, 0).r;
        textureStore(velocity_x_out, pos, vec4<f32>(vx, 0.0, 0.0, 0.0));
        textureStore(velocity_y_out, pos, vec4<f32>(vy, 0.0, 0.0, 0.0));
        return;
    }
    
    curl_grad = curl_grad / grad_length;
    
    // Vorticity confinement force
    // Force is perpendicular to gradient, scaled by curl
    // This amplifies rotation in areas of high curl
    let force = vec2<f32>(
        curl_grad.y * curl_c,   // Perpendicular to gradient
        -curl_grad.x * curl_c
    ) * params.curl_strength * params.dt;
    
    // Load current velocity
    let vx = textureLoad(velocity_x, pos, 0).r;
    let vy = textureLoad(velocity_y, pos, 0).r;
    
    // Apply vorticity force
    let new_vx = vx + force.x;
    let new_vy = vy + force.y;
    
    // Store updated velocity
    textureStore(velocity_x_out, pos, vec4<f32>(new_vx, 0.0, 0.0, 0.0));
    textureStore(velocity_y_out, pos, vec4<f32>(new_vy, 0.0, 0.0, 0.0));
}
