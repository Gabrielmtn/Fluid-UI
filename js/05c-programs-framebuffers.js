// ═══════════════════════════════════════════════════════════════════
// js/05c-programs-framebuffers.js — part 3/14 of former 05-fluid-sim.js (lines 967–1191)
// LOAD ORDER: after 05b-shader-sim.js, before 05d-input-replay.js
// PROVIDES: all Program instances, exposeSimStats, createFBO, createDoubleFBO, initFramebuffers (+load-time call), updateObstacleTexture, blit; lexical: dyeTexWidth/.., density, velocity, pressure, ..
// REQUIRES: gl, config (04); Program + frag sources (05a/05b); QualityGovernor hooks (08a, guarded)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        const displayProg = new Program(baseVert, displayFrag);
        const sharpenProg = new Program(baseVert, sharpenFrag);
        const microDetailProg = new Program(baseVert, microDetailFrag);
        const lightingProg = new Program(baseVert, lightingFrag);
        const lightShiftProg = new Program(baseVert, lightShiftFrag);
        const spinProg = new Program(baseVert, spinFrag);
        const splatProg = new Program(baseVert, splatFrag);
        const advectionProg = new Program(baseVert, advectionFrag);
        const divergenceProg = new Program(baseVert, divergenceFrag);
        const curlProg = new Program(baseVert, curlFrag);
        const turbulenceProg = new Program(baseVert, turbulenceFrag);
        const vorticityProg = new Program(baseVert, vorticityFrag);
        const pressureProg = new Program(baseVert, pressureFrag);
        const gradientProg = new Program(baseVert, gradientFrag);
        const clearProg = new Program(baseVert, clearFrag);
        const obstacleDampProg = new Program(baseVert, obstacleDampFrag);
        const blurProg = new Program(blurVert, blurFrag);
        const sunraysMaskProg = new Program(baseVert, sunraysMaskFrag);
        const sunraysProg = new Program(baseVert, sunraysFrag);
        let dyeTexWidth, dyeTexHeight, simTexWidth, simTexHeight;
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
        let density, velocity, divergence, curl, pressure, sharpened, detailed, lit, lightShifted, obstacle;
        let sunrays, sunraysTemp;
        function initFramebuffers() {
            // Use canvas attribute dimensions (not gl.drawingBufferWidth) for aspect ratio.
            // In Electron with transparent windows or DPR scaling, the drawing buffer
            // can differ from canvas.width/height, causing wrong FBO proportions.
            const displayW = canvas.width;
            const displayH = canvas.height;
            const aspect = displayW / Math.max(1, displayH);
            // [GOVERNOR HOOK] stash old density so artwork survives re-init
            const _prevDensity = (typeof density !== 'undefined' && density && density.read) ? density : null;
            // [GOVERNOR HOOK] scale internal resolution (config untouched)
            const _gov = window.QualityGovernor;
            const dyeBase = Math.max(64, Math.round((config.DYE_RESOLUTION || 1024) * (_gov ? _gov.dyeScale() : 1)));
            const simBase = Math.max(32, Math.round((config.SIM_RESOLUTION || 128) * (_gov ? _gov.simScale() : 1)));
            // Check WebGL texture size limits
            const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
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
            const texType = gl.HALF_FLOAT;
            const rgba = { internalFormat: gl.RGBA16F, format: gl.RGBA };
            const rg = { internalFormat: gl.RG16F, format: gl.RG };
            const r = { internalFormat: gl.R16F, format: gl.RED };
            const _linearOk = (typeof window !== 'undefined' && window.linearExt) || gl.getExtension('OES_texture_float_linear');
            const filter = _linearOk ? gl.LINEAR : gl.NEAREST;
            // Visual dye buffers at dye resolution
            density = createDoubleFBO(dyeTexWidth, dyeTexHeight, rgba.internalFormat, rgba.format, texType, filter);
            // Sharpness buffer at dye resolution
            sharpened = createFBO(dyeTexWidth, dyeTexHeight, rgba.internalFormat, rgba.format, texType, filter);
            // Micro detail buffer at dye resolution
            detailed = createFBO(dyeTexWidth, dyeTexHeight, rgba.internalFormat, rgba.format, texType, filter);
            // Lighting buffer at dye resolution
            lit = createFBO(dyeTexWidth, dyeTexHeight, rgba.internalFormat, rgba.format, texType, filter);
            // Light shift buffer at dye resolution
            lightShifted = createFBO(dyeTexWidth, dyeTexHeight, rgba.internalFormat, rgba.format, texType, filter);
            // Physics buffers at simulation resolution
            velocity = createDoubleFBO(simTexWidth, simTexHeight, rg.internalFormat, rg.format, texType, filter);
            divergence = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
            curl = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
            pressure = createDoubleFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
            // Obstacle texture for collision layers (single-channel, sim resolution)
            obstacle = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.LINEAR);
            // Sunrays FBOs
            const sunRes = config.SUNRAYS_RESOLUTION || 196;
            const sunAspect = displayW / Math.max(1, displayH);
            let sunW, sunH;
            if (displayW >= displayH) {
                sunW = Math.min(sunRes, maxTextureSize);
                sunH = Math.max(1, Math.round(sunRes / sunAspect));
            } else {
                sunH = Math.min(sunRes, maxTextureSize);
                sunW = Math.max(1, Math.round(sunRes * sunAspect));
            }
            sunrays = createFBO(sunW, sunH, rgba.internalFormat, rgba.format, texType, filter);
            sunraysTemp = createFBO(sunW, sunH, rgba.internalFormat, rgba.format, texType, filter);
            // Explicitly clear all FBOs to zero.
            // Electron's disable-gpu-driver-bug-workarounds can skip default zeroing,
            // leaving garbage in textures that corrupts simulation until first resize.
            const allFBOs = [
                density.read, density.write,
                velocity.read, velocity.write,
                divergence, curl,
                pressure.read, pressure.write,
                sharpened, detailed, lit, lightShifted, obstacle,
                sunrays, sunraysTemp
            ];
            for (let i = 0; i < allFBOs.length; i++) {
                if (allFBOs[i] && allFBOs[i].fbo) {
                    gl.bindFramebuffer(gl.FRAMEBUFFER, allFBOs[i].fbo);
                    gl.clearColor(0, 0, 0, 0);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                }
            }
            // [GOVERNOR HOOK] dye-preserving re-init: copy the old density into
            // the fresh FBO (clearProg with value=1.0 is a passthrough), then
            // free the old GPU memory. Fixes "resolution change wipes artwork".
            if (_prevDensity) {
                gl.disable(gl.BLEND);
                gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                clearProg.bind();
                gl.uniform1i(clearProg.uniforms.uTexture, 0);
                gl.uniform1f(clearProg.uniforms.value, 1.0);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, _prevDensity.read.texture);
                blit(density.write.fbo);
                density.swap();
                [_prevDensity.read, _prevDensity.write].forEach((f) => {
                    if (f) { gl.deleteTexture(f.texture); gl.deleteFramebuffer(f.fbo); }
                });
                gl.enable(gl.BLEND);
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        initFramebuffers();
        exposeSimStats(); // Expose to window for stats panel
        // Obstacle texture upload for collision layers
        // Cached buffers to avoid per-frame allocations (GPU crash prevention)
        var _obsTempCanvas = null, _obsTempCtx = null;
        var _obsFloatBuf = null;     // cached Float32Array
        var _obsZeroBuf = null;      // cached zeros for clear
        var _obsLastW = 0, _obsLastH = 0;
        function _obsEnsureBuffers(w, h) {
            if (_obsLastW === w && _obsLastH === h && _obsTempCanvas) return;
            _obsTempCanvas = document.createElement('canvas');
            _obsTempCanvas.width = w;
            _obsTempCanvas.height = h;
            _obsTempCtx = _obsTempCanvas.getContext('2d', { willReadFrequently: true });
            _obsFloatBuf = new Float32Array(w * h);
            _obsZeroBuf = new Float32Array(w * h); // stays zeroed
            _obsLastW = w;
            _obsLastH = h;
        }
        window.updateObstacleTexture = function (sourceCanvas) {
            if (!obstacle || gl.isContextLost()) return;
            try {
                var w = obstacle.width;
                var h = obstacle.height;
                _obsEnsureBuffers(w, h);
                _obsTempCtx.clearRect(0, 0, w, h);
                _obsTempCtx.drawImage(sourceCanvas, 0, 0, w, h);
                var imgData = _obsTempCtx.getImageData(0, 0, w, h);
                var d = imgData.data;
                var f = _obsFloatBuf;
                for (var i = 0, n = w * h; i < n; i++) {
                    f[i] = d[i * 4 + 3] * (1 / 255);
                }
                gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RED, gl.FLOAT, f);
            } catch (e) {
                console.warn('⚠️ Obstacle texture upload failed:', e.message);
            }
        };
        window.clearObstacleTexture = function () {
            if (!obstacle || gl.isContextLost()) return;
            try {
                var w = obstacle.width;
                var h = obstacle.height;
                _obsEnsureBuffers(w, h);
                gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RED, gl.FLOAT, _obsZeroBuf);
            } catch (e) {
                console.warn('⚠️ Obstacle texture clear failed:', e.message);
            }
        };
        // Also expose on resize
        window.needsFramebufferReinit = false;
        // Pointer handling
        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);
        function blit(dest) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, dest);
            gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        }
