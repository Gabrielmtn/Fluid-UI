// Splat Shader - Apply force and color to fluid
//
// This shader applies a single "splat" of force and color to the fluid simulation.
// A splat represents user input (mouse drag, touch) and adds both velocity and dye.
//
// Physics:
// - Gaussian falloff from splat center (smooth, natural looking)
// - Force proportional to distance and input velocity
// - Color blending for visual feedback
//
// Split velocity pattern: velocity stored as separate x and y components

@group(0) @binding(0) var velocity_x: texture_2d<f32>;
@group(0) @binding(1) var velocity_y: texture_2d<f32>;
@group(0) @binding(2) var density: texture_2d<f32>;
@group(0) @binding(3) var velocity_x_out: texture_storage_2d<r32float, write>;
@group(0) @binding(4) var velocity_y_out: texture_storage_2d<r32float, write>;
@group(0) @binding(5) var density_out: texture_storage_2d<rgba8unorm, write>;

struct SplatParams {
    // Splat position in normalized coordinates [0, 1]
    position: vec2<f32>,
    
    // Velocity to add (force direction and magnitude)
    velocity: vec2<f32>,
    
    // Splat properties
    radius: f32,           // Size in normalized space
    force_scale: f32,      // Force multiplier
    
    // Color (RGB)
    color: vec3<f32>,
    
    // Texture dimensions for coordinate conversion
    texel_size: vec2<f32>, // 1.0 / resolution
}

@group(0) @binding(6) var<uniform> params: SplatParams;

// Gaussian falloff function
// Returns value in [0, 1] based on distance from center
fn gaussian(distance: f32, radius: f32) -> f32 {
    // Use radius as standard deviation
    let sigma = radius;
    let variance = sigma * sigma;
    
    // Gaussian: exp(-distance² / (2σ²))
    let exponent = -(distance * distance) / (2.0 * variance);
    return exp(exponent);
}

@compute @workgroup_size(8, 8)
fn splat(@builtin(global_invocation_id) id: vec3<u32>) {
    let pos = vec2<i32>(id.xy);
    let size = textureDimensions(velocity_x);
    
    // Boundary check
    if (pos.x >= size.x || pos.y >= size.y) {
        return;
    }
    
    // Convert pixel position to normalized coordinates [0, 1]
    let uv = (vec2<f32>(pos) + 0.5) * params.texel_size;
    
    // Distance from splat center
    let offset = uv - params.position;
    let distance = length(offset);
    
    // Gaussian falloff
    let influence = gaussian(distance, params.radius);
    
    // If outside radius, just pass through existing values
    if (influence < 0.001) {
        let vx = textureLoad(velocity_x, pos, 0).r;
        let vy = textureLoad(velocity_y, pos, 0).r;
        let d = textureLoad(density, pos, 0);
        
        textureStore(velocity_x_out, pos, vec4<f32>(vx, 0.0, 0.0, 0.0));
        textureStore(velocity_y_out, pos, vec4<f32>(vy, 0.0, 0.0, 0.0));
        textureStore(density_out, pos, d);
        return;
    }
    
    // Load current velocity
    let vx = textureLoad(velocity_x, pos, 0).r;
    let vy = textureLoad(velocity_y, pos, 0).r;
    
    // Apply force (splat velocity scaled by influence and force_scale)
    let force = params.velocity * influence * params.force_scale;
    let new_vx = vx + force.x;
    let new_vy = vy + force.y;
    
    // Load current density
    let current_density = textureLoad(density, pos, 0);
    
    // Blend in new color (additive blending, clamped)
    let color_add = vec4<f32>(params.color * influence, influence);
    let new_density = current_density + color_add;
    
    // Clamp to [0, 1] range
    let clamped_density = clamp(new_density, vec4<f32>(0.0), vec4<f32>(1.0));
    
    // Store updated values
    textureStore(velocity_x_out, pos, vec4<f32>(new_vx, 0.0, 0.0, 0.0));
    textureStore(velocity_y_out, pos, vec4<f32>(new_vy, 0.0, 0.0, 0.0));
    textureStore(density_out, pos, clamped_density);
}
