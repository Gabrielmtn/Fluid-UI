// WebGL Texture and Framebuffer Management
// Extracted from 05-fluid-sim.js for better organization

let dyeTexWidth, dyeTexHeight, simTexWidth, simTexHeight;
let density, velocity, divergence, curl, pressure;

// Expose for stats panel
function exposeSimStats() {
    window.simTexWidth = simTexWidth;
    window.simTexHeight = simTexHeight;
    window.dyeTexWidth = dyeTexWidth;
    window.dyeTexHeight = dyeTexHeight;
    window.density = density;
    window.velocity = velocity;
    window.pressure = pressure;
    window.divergence = divergence;
    window.curl = curl;
}

function createFBO(w, h, internalFormat, format, type, filter) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    return { texture, fbo, width: w, height: h };
}

function createDoubleFBO(w, h, internalFormat, format, type, filter) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, filter);
    let fbo2 = createFBO(w, h, internalFormat, format, type, filter);
    return {
        get read() { return fbo1; },
        get write() { return fbo2; },
        swap() { [fbo1, fbo2] = [fbo2, fbo1]; }
    };
}

function initFramebuffers() {
    const displayW = gl.drawingBufferWidth;
    const displayH = gl.drawingBufferHeight;
    const aspect = displayW / Math.max(1, displayH);
    const dyeBase = config.DYE_RESOLUTION || 1024;
    const simBase = config.SIM_RESOLUTION || 128;
    
    // Check WebGL texture size limits
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    console.log('initFramebuffers called - DYE:', dyeBase, 'SIM:', simBase, 'Max Texture Size:', maxTextureSize);
    
    // Compute absolute internal sizes: long side = base, short side scaled by aspect
    if (displayW >= displayH) {
        dyeTexWidth = Math.min(dyeBase, maxTextureSize); 
        dyeTexHeight = Math.max(1, Math.min(Math.round(dyeBase / aspect), maxTextureSize));
        simTexWidth = Math.min(simBase, maxTextureSize); 
        simTexHeight = Math.max(1, Math.min(Math.round(simBase / aspect), maxTextureSize));
    } else {
        dyeTexHeight = Math.min(dyeBase, maxTextureSize); 
        dyeTexWidth = Math.max(1, Math.min(Math.round(dyeBase * aspect), maxTextureSize));
        simTexHeight = Math.min(simBase, maxTextureSize); 
        simTexWidth = Math.max(1, Math.min(Math.round(simBase * aspect), maxTextureSize));
    }
    
    console.log('Actual texture sizes - Dye:', dyeTexWidth, 'x', dyeTexHeight, 'Sim:', simTexWidth, 'x', simTexHeight);
    
    const texType = gl.HALF_FLOAT;
    const rgba = { internalFormat: gl.RGBA16F, format: gl.RGBA };
    const rg = { internalFormat: gl.RG16F, format: gl.RG };
    const r = { internalFormat: gl.R16F, format: gl.RED };
    const _linearOk = (typeof window !== 'undefined' && window.linearExt) || gl.getExtension('OES_texture_float_linear');
    const filter = _linearOk ? gl.LINEAR : gl.NEAREST;
    
    // Visual dye buffers at dye resolution
    density = createDoubleFBO(dyeTexWidth, dyeTexHeight, rgba.internalFormat, rgba.format, texType, filter);
    // Physics buffers at simulation resolution
    velocity = createDoubleFBO(simTexWidth, simTexHeight, rg.internalFormat, rg.format, texType, filter);
    divergence = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
    curl = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
    pressure = createDoubleFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
}

// Export
window.Textures = {
    get dyeTexWidth() { return dyeTexWidth; },
    get dyeTexHeight() { return dyeTexHeight; },
    get simTexWidth() { return simTexWidth; },
    get simTexHeight() { return simTexHeight; },
    get density() { return density; },
    get velocity() { return velocity; },
    get divergence() { return divergence; },
    get curl() { return curl; },
    get pressure() { return pressure; },
    createFBO,
    createDoubleFBO,
    initFramebuffers,
    exposeSimStats
};
