// Simple Display Shader - Shows density texture on screen
// Direct port from JS displayFrag shader (without kaleidoscope for now)

@group(0) @binding(0) var density_texture: texture_2d<f32>;
@group(0) @binding(1) var density_sampler: sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    // Full-screen quad
    var pos = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(1.0, -1.0),
        vec2<f32>(-1.0, 1.0),
        vec2<f32>(-1.0, 1.0),
        vec2<f32>(1.0, -1.0),
        vec2<f32>(1.0, 1.0),
    );
    
    let p = pos[vertex_index];
    var output: VertexOutput;
    output.position = vec4<f32>(p, 0.0, 1.0);
    output.uv = p * 0.5 + 0.5;
    return output;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Sample density texture and display it
    let color = textureSample(density_texture, density_sampler, in.uv);
    return color;
}
