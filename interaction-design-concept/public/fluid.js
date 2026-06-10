// Simplified fluid simulation for mobile-friendly multiplayer demo
// Based on Fluid-UI's WebGL2 fluid sim

const FluidSim = (function() {
    let canvas, gl;
    let config = {
        SIM_RESOLUTION: 128,
        DYE_RESOLUTION: 512,
        DENSITY_DISSIPATION: 0.97,
        VELOCITY_DISSIPATION: 0.98,
        PRESSURE_ITERATIONS: 20,
        CURL: 30,
        SPLAT_RADIUS: 0.012
    };
    
    // Detect mobile for lower settings
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
        config.SIM_RESOLUTION = 64;
        config.DYE_RESOLUTION = 256;
        config.PRESSURE_ITERATIONS = 15;
    }
    
    const PRECISION = isMobile ? "mediump" : "highp";
    
    // Shader sources
    const baseVert = `#version 300 es
        precision ${PRECISION} float;
        layout (location = 0) in vec2 aPos;
        out vec2 vUv, vL, vR, vT, vB;
        uniform vec2 texelSize;
        void main() {
            vUv = aPos * 0.5 + 0.5;
            vL = vUv - vec2(texelSize.x, 0.0);
            vR = vUv + vec2(texelSize.x, 0.0);
            vT = vUv + vec2(0.0, texelSize.y);
            vB = vUv - vec2(0.0, texelSize.y);
            gl_Position = vec4(aPos, 0.0, 1.0);
        }
    `;
    
    const displayFrag = `#version 300 es
        precision ${PRECISION} float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D uTexture;
        void main() {
            vec4 color = texture(uTexture, vUv);
            // Tone map for HDR
            color.rgb = color.rgb / (1.0 + color.rgb);
            // Slight vignette for depth
            vec2 uv = vUv * 2.0 - 1.0;
            float vignette = 1.0 - dot(uv, uv) * 0.15;
            color.rgb *= vignette;
            fragColor = vec4(color.rgb, 1.0);
        }
    `;
    
    const splatFrag = `#version 300 es
        precision ${PRECISION} float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D uTarget;
        uniform vec2 point;
        uniform vec3 color;
        uniform float radius, aspectRatio;
        void main() {
            vec2 p = vUv - point;
            p.x *= aspectRatio;
            vec3 splat = exp(-dot(p, p) / radius) * color;
            vec3 base = texture(uTarget, vUv).xyz;
            fragColor = vec4(base + splat, 1.0);
        }
    `;
    
    const advectionFrag = `#version 300 es
        precision ${PRECISION} float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D uVelocity, uSource;
        uniform vec2 texelSize;
        uniform float dt, dissipation;
        void main() {
            vec2 coord = clamp(vUv - dt * texture(uVelocity, vUv).xy * texelSize, 0.0, 1.0);
            float decay = pow(dissipation, dt * 60.0);
            fragColor = decay * texture(uSource, coord);
        }
    `;
    
    const divergenceFrag = `#version 300 es
        precision ${PRECISION} float;
        in vec2 vL, vR, vT, vB;
        out vec4 fragColor;
        uniform sampler2D uVelocity;
        vec2 sampleVel(vec2 uv) {
            vec2 m = vec2(1.0);
            if(uv.x < 0.0 || uv.x > 1.0) { uv.x = clamp(uv.x, 0.0, 1.0); m.x = -1.0; }
            if(uv.y < 0.0 || uv.y > 1.0) { uv.y = clamp(uv.y, 0.0, 1.0); m.y = -1.0; }
            return m * texture(uVelocity, uv).xy;
        }
        void main() {
            float div = 0.5 * (sampleVel(vR).x - sampleVel(vL).x + sampleVel(vT).y - sampleVel(vB).y);
            fragColor = vec4(div, 0.0, 0.0, 1.0);
        }
    `;
    
    const curlFrag = `#version 300 es
        precision ${PRECISION} float;
        in vec2 vL, vR, vT, vB;
        out vec4 fragColor;
        uniform sampler2D uVelocity;
        void main() {
            vec2 cL = clamp(vL, 0.0, 1.0);
            vec2 cR = clamp(vR, 0.0, 1.0);
            vec2 cT = clamp(vT, 0.0, 1.0);
            vec2 cB = clamp(vB, 0.0, 1.0);
            float vorticity = texture(uVelocity, cR).y - texture(uVelocity, cL).y -
                              texture(uVelocity, cT).x + texture(uVelocity, cB).x;
            fragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
        }
    `;
    
    const vorticityFrag = `#version 300 es
        precision ${PRECISION} float;
        in vec2 vUv, vL, vR, vT, vB;
        out vec4 fragColor;
        uniform sampler2D uVelocity, uCurl;
        uniform float curl, dt;
        void main() {
            vec2 cL = clamp(vL, 0.0, 1.0);
            vec2 cR = clamp(vR, 0.0, 1.0);
            vec2 cT = clamp(vT, 0.0, 1.0);
            vec2 cB = clamp(vB, 0.0, 1.0);
            float L = texture(uCurl, cL).x;
            float R = texture(uCurl, cR).x;
            float T = texture(uCurl, cT).x;
            float B = texture(uCurl, cB).x;
            float C = texture(uCurl, vUv).x;
            vec2 eta = vec2(abs(R) - abs(L), abs(T) - abs(B));
            eta = eta / (length(eta) + 0.00001);
            vec2 force = curl * vec2(eta.y, -eta.x) * C;
            fragColor = vec4(texture(uVelocity, vUv).xy + force * dt, 0.0, 1.0);
        }
    `;
    
    const pressureFrag = `#version 300 es
        precision ${PRECISION} float;
        in vec2 vUv, vL, vR, vT, vB;
        out vec4 fragColor;
        uniform sampler2D uPressure, uDivergence;
        void main() {
            vec2 L = clamp(vL, 0.0, 1.0), R = clamp(vR, 0.0, 1.0);
            vec2 T = clamp(vT, 0.0, 1.0), B = clamp(vB, 0.0, 1.0);
            float pressure = (texture(uPressure, L).x + texture(uPressure, R).x + 
                             texture(uPressure, B).x + texture(uPressure, T).x - 
                             texture(uDivergence, vUv).x) * 0.25;
            fragColor = vec4(pressure, 0.0, 0.0, 1.0);
        }
    `;
    
    const gradientFrag = `#version 300 es
        precision ${PRECISION} float;
        in vec2 vUv, vL, vR, vT, vB;
        out vec4 fragColor;
        uniform sampler2D uPressure, uVelocity;
        uniform vec2 texelSize;
        void main() {
            vec2 L = clamp(vL, 0.0, 1.0), R = clamp(vR, 0.0, 1.0);
            vec2 T = clamp(vT, 0.0, 1.0), B = clamp(vB, 0.0, 1.0);
            vec2 vel = texture(uVelocity, vUv).xy - vec2(
                texture(uPressure, R).x - texture(uPressure, L).x,
                texture(uPressure, T).x - texture(uPressure, B).x
            );
            // Boundary conditions
            if (vUv.x < texelSize.x) vel.x = max(vel.x, 0.0);
            if (vUv.x > 1.0 - texelSize.x) vel.x = min(vel.x, 0.0);
            if (vUv.y < texelSize.y) vel.y = max(vel.y, 0.0);
            if (vUv.y > 1.0 - texelSize.y) vel.y = min(vel.y, 0.0);
            fragColor = vec4(vel, 0.0, 1.0);
        }
    `;
    
    const clearFrag = `#version 300 es
        precision ${PRECISION} float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D uTexture;
        uniform float value;
        void main() { fragColor = value * texture(uTexture, vUv); }
    `;
    
    // WebGL helpers
    function compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        }
        return shader;
    }
    
    class Program {
        constructor(vertSrc, fragSrc) {
            const vert = compileShader(gl.VERTEX_SHADER, vertSrc);
            const frag = compileShader(gl.FRAGMENT_SHADER, fragSrc);
            this.program = gl.createProgram();
            gl.attachShader(this.program, vert);
            gl.attachShader(this.program, frag);
            gl.linkProgram(this.program);
            if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
                console.error('Program link error:', gl.getProgramInfoLog(this.program));
            }
            this.uniforms = {};
            const count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
            for (let i = 0; i < count; i++) {
                const name = gl.getActiveUniform(this.program, i).name;
                this.uniforms[name] = gl.getUniformLocation(this.program, name);
            }
        }
        bind() { gl.useProgram(this.program); }
    }
    
    let displayProg, splatProg, advectionProg, divergenceProg, curlProg, vorticityProg, pressureProg, gradientProg, clearProg;
    let density, velocity, divergence, curl, pressure;
    let simTexWidth, simTexHeight, dyeTexWidth, dyeTexHeight;
    
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
        return { texture, fbo, width: w, height: h, texelSizeX: 1.0 / w, texelSizeY: 1.0 / h };
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
        const aspect = canvas.width / canvas.height;
        const dyeBase = config.DYE_RESOLUTION;
        const simBase = config.SIM_RESOLUTION;
        
        if (canvas.width >= canvas.height) {
            dyeTexWidth = dyeBase;
            dyeTexHeight = Math.round(dyeBase / aspect);
            simTexWidth = simBase;
            simTexHeight = Math.round(simBase / aspect);
        } else {
            dyeTexHeight = dyeBase;
            dyeTexWidth = Math.round(dyeBase * aspect);
            simTexHeight = simBase;
            simTexWidth = Math.round(simBase * aspect);
        }
        
        const texType = gl.HALF_FLOAT;
        const rgba = { internalFormat: gl.RGBA16F, format: gl.RGBA };
        const rg = { internalFormat: gl.RG16F, format: gl.RG };
        const r = { internalFormat: gl.R16F, format: gl.RED };
        
        density = createDoubleFBO(dyeTexWidth, dyeTexHeight, rgba.internalFormat, rgba.format, texType, gl.LINEAR);
        velocity = createDoubleFBO(simTexWidth, simTexHeight, rg.internalFormat, rg.format, texType, gl.LINEAR);
        divergence = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
        curl = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
        pressure = createDoubleFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
    }
    
    let quadVAO;
    function initQuad() {
        const vertices = new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        quadVAO = gl.createVertexArray();
        gl.bindVertexArray(quadVAO);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    }
    
    function blit(target) {
        if (target) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
            gl.viewport(0, 0, target.width, target.height);
        } else {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvas.width, canvas.height);
        }
        gl.bindVertexArray(quadVAO);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }
    
    // Public API
    function init(canvasEl) {
        canvas = canvasEl;
        gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: false });
        if (!gl) {
            console.error('WebGL2 not supported');
            return false;
        }
        
        // Enable float textures
        gl.getExtension('EXT_color_buffer_float');
        
        initQuad();
        
        // Compile programs
        displayProg = new Program(baseVert, displayFrag);
        splatProg = new Program(baseVert, splatFrag);
        advectionProg = new Program(baseVert, advectionFrag);
        divergenceProg = new Program(baseVert, divergenceFrag);
        curlProg = new Program(baseVert, curlFrag);
        vorticityProg = new Program(baseVert, vorticityFrag);
        pressureProg = new Program(baseVert, pressureFrag);
        gradientProg = new Program(baseVert, gradientFrag);
        clearProg = new Program(baseVert, clearFrag);
        
        initFramebuffers();
        return true;
    }
    
    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.floor(canvas.clientWidth * dpr);
        const h = Math.floor(canvas.clientHeight * dpr);
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            initFramebuffers();
        }
    }
    
    function splat(x, y, dx, dy, color) {
        // Velocity splat
        splatProg.bind();
        gl.uniform1i(splatProg.uniforms.uTarget, 0);
        gl.uniform2f(splatProg.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
        gl.uniform3f(splatProg.uniforms.color, dx, -dy, 0);
        gl.uniform1f(splatProg.uniforms.radius, config.SPLAT_RADIUS);
        gl.uniform1f(splatProg.uniforms.aspectRatio, canvas.width / canvas.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        blit(velocity.write);
        velocity.swap();
        
        // Density splat
        gl.uniform2f(splatProg.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
        gl.uniform3f(splatProg.uniforms.color, color[0] * 0.3, color[1] * 0.3, color[2] * 0.3);
        gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
        blit(density.write);
        density.swap();
    }
    
    function step(dt) {
        // Curl
        curlProg.bind();
        gl.uniform2f(curlProg.uniforms.texelSize, velocity.read.texelSizeX, velocity.read.texelSizeY);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.uniform1i(curlProg.uniforms.uVelocity, 0);
        blit(curl);
        
        // Vorticity
        vorticityProg.bind();
        gl.uniform2f(vorticityProg.uniforms.texelSize, velocity.read.texelSizeX, velocity.read.texelSizeY);
        gl.uniform1i(vorticityProg.uniforms.uVelocity, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, curl.texture);
        gl.uniform1i(vorticityProg.uniforms.uCurl, 1);
        gl.uniform1f(vorticityProg.uniforms.curl, config.CURL);
        gl.uniform1f(vorticityProg.uniforms.dt, dt);
        blit(velocity.write);
        velocity.swap();
        
        // Divergence
        divergenceProg.bind();
        gl.uniform2f(divergenceProg.uniforms.texelSize, velocity.read.texelSizeX, velocity.read.texelSizeY);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.uniform1i(divergenceProg.uniforms.uVelocity, 0);
        blit(divergence);
        
        // Clear pressure
        clearProg.bind();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
        gl.uniform1i(clearProg.uniforms.uTexture, 0);
        gl.uniform1f(clearProg.uniforms.value, 0.8);
        blit(pressure.write);
        pressure.swap();
        
        // Pressure iterations
        pressureProg.bind();
        gl.uniform2f(pressureProg.uniforms.texelSize, velocity.read.texelSizeX, velocity.read.texelSizeY);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, divergence.texture);
        gl.uniform1i(pressureProg.uniforms.uDivergence, 1);
        for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
            gl.uniform1i(pressureProg.uniforms.uPressure, 0);
            blit(pressure.write);
            pressure.swap();
        }
        
        // Gradient subtract
        gradientProg.bind();
        gl.uniform2f(gradientProg.uniforms.texelSize, velocity.read.texelSizeX, velocity.read.texelSizeY);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
        gl.uniform1i(gradientProg.uniforms.uPressure, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.uniform1i(gradientProg.uniforms.uVelocity, 1);
        blit(velocity.write);
        velocity.swap();
        
        // Advect velocity
        advectionProg.bind();
        gl.uniform2f(advectionProg.uniforms.texelSize, velocity.read.texelSizeX, velocity.read.texelSizeY);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.uniform1i(advectionProg.uniforms.uVelocity, 0);
        gl.uniform1i(advectionProg.uniforms.uSource, 0);
        gl.uniform1f(advectionProg.uniforms.dt, dt);
        gl.uniform1f(advectionProg.uniforms.dissipation, config.VELOCITY_DISSIPATION);
        blit(velocity.write);
        velocity.swap();
        
        // Advect density
        gl.uniform2f(advectionProg.uniforms.texelSize, density.read.texelSizeX, density.read.texelSizeY);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
        gl.uniform1i(advectionProg.uniforms.uSource, 1);
        gl.uniform1f(advectionProg.uniforms.dissipation, config.DENSITY_DISSIPATION);
        blit(density.write);
        density.swap();
    }
    
    function render() {
        displayProg.bind();
        gl.uniform2f(displayProg.uniforms.texelSize, 1.0 / canvas.width, 1.0 / canvas.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
        gl.uniform1i(displayProg.uniforms.uTexture, 0);
        blit(null);
    }
    
    return {
        init,
        resize,
        splat,
        step,
        render,
        config
    };
})();
