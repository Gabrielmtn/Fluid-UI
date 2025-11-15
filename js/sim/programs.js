// WebGL Program Compilation
// Extracted from 05-fluid-sim.js for better organization

function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
    }
    return shader;
}

class Program {
    constructor(vertSrc, fragSrc) {
        const vertShader = compileShader(gl.VERTEX_SHADER, vertSrc);
        const fragShader = compileShader(gl.FRAGMENT_SHADER, fragSrc);
        
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertShader);
        gl.attachShader(this.program, fragShader);
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(this.program) || 'Unknown link error';
            console.error('Program link failed:', info);
        }
        
        this.uniforms = {};
        const count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < count; i++) {
            const name = gl.getActiveUniform(this.program, i).name;
            this.uniforms[name] = gl.getUniformLocation(this.program, name);
        }
    }
    
    bind() {
        gl.useProgram(this.program);
    }
}

// Create all shader programs
function createPrograms() {
    const { baseVert, displayFrag, splatFrag, advectionFrag, divergenceFrag, 
            curlFrag, vorticityFrag, pressureFrag, gradientFrag, clearFrag } = window.Shaders;
    
    const displayProg = new Program(baseVert, displayFrag);
    const splatProg = new Program(baseVert, splatFrag);
    const advectionProg = new Program(baseVert, advectionFrag);
    const divergenceProg = new Program(baseVert, divergenceFrag);
    const curlProg = new Program(baseVert, curlFrag);
    const vorticityProg = new Program(baseVert, vorticityFrag);
    const pressureProg = new Program(baseVert, pressureFrag);
    const gradientProg = new Program(baseVert, gradientFrag);
    const clearProg = new Program(baseVert, clearFrag);
    
    return {
        displayProg,
        splatProg,
        advectionProg,
        divergenceProg,
        curlProg,
        vorticityProg,
        pressureProg,
        gradientProg,
        clearProg
    };
}

// Export
window.Programs = {
    Program,
    createPrograms
};
