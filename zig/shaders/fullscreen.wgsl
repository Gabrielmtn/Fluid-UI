// Fullscreen triangle vertex shader
// Outputs a triangle that covers the entire screen in clip space

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var output: VertexOutput;
    
    // Generate fullscreen triangle
    // Vertex 0: (-1, -1) -> UV (0, 1)
    // Vertex 1: (3, -1)  -> UV (2, 1)
    // Vertex 2: (-1, 3)  -> UV (0, -1)
    let x = f32((vertex_index & 1u) << 2u) - 1.0;
    let y = f32((vertex_index & 2u) << 1u) - 1.0;
    
    output.position = vec4<f32>(x, y, 0.0, 1.0);
    output.uv = vec2<f32>((x + 1.0) * 0.5, (1.0 - y) * 0.5);
    
    return output;
}
