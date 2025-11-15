// Display shader - final render with kaleidoscope effects
// Ports js/05-fluid-sim.js displayFrag to WGSL fragment shader

struct Uniforms {
    preserve_opacity: f32,
    background_transparency: f32,
    kaleido_enabled: f32,
    segments: f32,
    k_mode: u32,  // 0=Off, 1=Wedge, 2=MirrorH, 3=MirrorV, 4=MirrorQuad, 5=Spiral
    k_angle: f32, // radians
    k_twist: f32, // radians per unit radius
    k_zoom: f32,  // scale
    k_blend: f32, // 0..1
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var density_texture: texture_2d<f32>;
@group(0) @binding(2) var linear_sampler: sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

const PI: f32 = 3.141592653589793;

// Mode 1: Wedge - Facets create angular reflections
fn kaleido_wedge(uv: vec2<f32>) -> vec2<f32> {
    let center = vec2<f32>(0.5, 0.5);
    var p = uv - center;
    
    // Rotate
    let ca = cos(uniforms.k_angle);
    let sa = sin(uniforms.k_angle);
    p = vec2<f32>(ca * p.x - sa * p.y, sa * p.x + ca * p.y);
    
    let r = length(p) * max(0.0001, uniforms.k_zoom);
    var a = atan2(p.y, p.x);
    a += r * uniforms.k_twist;
    
    let facets = max(1.0, uniforms.segments);
    let seg_angle = 2.0 * PI / facets;
    a = (a + 2.0 * PI) % (2.0 * PI);
    a = a % seg_angle;
    a = abs(a - seg_angle * 0.5);
    
    let dir = vec2<f32>(cos(a), sin(a));
    let mapped = dir * r;
    return mapped + center;
}

// Mode 2/3: Mirror - Layers create stacked reflections
fn mirror_layers(uv: vec2<f32>, horizontal: bool) -> vec2<f32> {
    var uvz = uv - vec2<f32>(0.5, 0.5);
    
    // Rotate
    let ca = cos(uniforms.k_angle);
    let sa = sin(uniforms.k_angle);
    uvz = vec2<f32>(ca * uvz.x - sa * uvz.y, sa * uvz.x + ca * uvz.y);
    uvz = uvz * max(0.0001, uniforms.k_zoom);
    
    let layers = max(1.0, uniforms.segments);
    let layer_size = 1.0 / layers;
    
    if (horizontal) {
        var x_pos = (abs(uvz.x) + 0.5) % (layer_size * 2.0);
        if (x_pos > layer_size) {
            x_pos = layer_size * 2.0 - x_pos;
        }
        uvz.x = x_pos - layer_size * 0.5;
    } else {
        var y_pos = (abs(uvz.y) + 0.5) % (layer_size * 2.0);
        if (y_pos > layer_size) {
            y_pos = layer_size * 2.0 - y_pos;
        }
        uvz.y = y_pos - layer_size * 0.5;
    }
    
    return uvz + vec2<f32>(0.5, 0.5);
}

// Mode 4: Quad - Reflections multiply the quad mirror effect
fn quad_reflections(uv: vec2<f32>) -> vec2<f32> {
    var uvz = uv - vec2<f32>(0.5, 0.5);
    
    // Rotate
    let ca = cos(uniforms.k_angle);
    let sa = sin(uniforms.k_angle);
    uvz = vec2<f32>(ca * uvz.x - sa * uvz.y, sa * uvz.x + ca * uvz.y);
    uvz = uvz * max(0.0001, uniforms.k_zoom);
    
    let reflections = max(1.0, uniforms.segments);
    let scale = pow(2.0, reflections - 1.0) * 0.5;
    uvz = uvz * scale;
    
    uvz = vec2<f32>(
        0.5 - abs((uvz.x + 0.5) % 1.0 - 0.5),
        0.5 - abs((uvz.y + 0.5) % 1.0 - 0.5)
    );
    
    return uvz;
}

// Mode 5: Spiral - Rings create concentric spiral bands
fn spiral_rings(uv: vec2<f32>) -> vec2<f32> {
    let center = vec2<f32>(0.5, 0.5);
    var p = uv - center;
    
    // Rotate
    let ca = cos(uniforms.k_angle);
    let sa = sin(uniforms.k_angle);
    p = vec2<f32>(ca * p.x - sa * p.y, sa * p.x + ca * p.y);
    
    let r = length(p) * max(0.0001, uniforms.k_zoom);
    var a = atan2(p.y, p.x);
    
    let rings = max(1.0, uniforms.segments);
    let ring_size = 0.5 / rings;
    var banded_r = r % (ring_size * 2.0);
    if (banded_r > ring_size) {
        banded_r = ring_size * 2.0 - banded_r;
    }
    
    a += banded_r * uniforms.k_twist * rings;
    let mapped = vec2<f32>(cos(a), sin(a)) * banded_r;
    return mapped + center;
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    // Full-screen quad
    var positions = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>( 1.0,  1.0)
    );
    
    var uvs = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(0.0, 0.0),
        vec2<f32>(0.0, 0.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(1.0, 0.0)
    );
    
    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    output.uv = uvs[vertex_index];
    return output;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let base = textureSample(density_texture, linear_sampler, in.uv);
    var kcol = base;
    
    let do_kaleido = (uniforms.k_mode != 0u) && (uniforms.kaleido_enabled > 0.5);
    
    if (do_kaleido) {
        var uv2: vec2<f32>;
        
        if (uniforms.k_mode == 1u) {
            // Wedge
            uv2 = kaleido_wedge(in.uv);
        } else if (uniforms.k_mode == 2u) {
            // Mirror H
            uv2 = mirror_layers(in.uv, true);
        } else if (uniforms.k_mode == 3u) {
            // Mirror V
            uv2 = mirror_layers(in.uv, false);
        } else if (uniforms.k_mode == 4u) {
            // Quad
            uv2 = quad_reflections(in.uv);
        } else if (uniforms.k_mode == 5u) {
            // Spiral
            uv2 = spiral_rings(in.uv);
        } else {
            uv2 = in.uv;
        }
        
        kcol = textureSample(density_texture, linear_sampler, uv2);
    }
    
    let color = mix(base, kcol, clamp(uniforms.k_blend, 0.0, 1.0));
    let intensity = max(max(color.r, color.g), color.b);
    
    if (uniforms.preserve_opacity > 0.5) {
        // Preserve fluid opacity
        let alpha = mix(1.0, intensity, uniforms.background_transparency);
        return vec4<f32>(color.rgb, alpha);
    } else {
        return color;
    }
}
