// ═══════════════════════════════════════════════════════════════════
// js/05c-programs-framebuffers.js — part 3/14 of former 05-fluid-sim.js (lines 967–1191)
// LOAD ORDER: after 05b-shader-sim.js, before 05d-input-replay.js
// PROVIDES: all Program instances (incl. macAdvectProg/macCorrectProg, mg*Prog), exposeSimStats, createFBO, createDoubleFBO, initFramebuffers (+load-time call), mgSolvePressure, updateObstacleTexture, blit; lexical: dyeTexWidth/.., density, velocity, pressure, mgLevels, ..
// REQUIRES: gl, config (04); Program + frag sources (05a/05b); QualityGovernor hooks (08a, guarded)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        const displayProg = new Program(baseVert, displayFrag);
        const sharpenProg = new Program(baseVert, sharpenFrag);
        const microDetailProg = new Program(baseVert, microDetailFrag);
        const lightingProg = new Program(baseVert, lightingFrag);
        const lightShiftProg = new Program(baseVert, lightShiftFrag);
        const splatProg = new Program(baseVert, splatFrag);
        const advectionProg = new Program(baseVert, advectionFrag);
        const macAdvectProg = new Program(baseVert, macAdvectFrag);
        const macCorrectProg = new Program(baseVert, macCorrectFrag);
        const divergenceProg = new Program(baseVert, divergenceFrag);
        const curlProg = new Program(baseVert, curlFrag);
        const vorticityProg = new Program(baseVert, vorticityFrag);
        const pressureProg = new Program(baseVert, pressureFrag);
        const mgResidualProg = new Program(baseVert, mgResidualFrag);
        const mgRestrictProg = new Program(baseVert, mgRestrictFrag);
        const mgProlongProg = new Program(baseVert, mgProlongFrag);
        const gradientProg = new Program(baseVert, gradientFrag);
        const clearProg = new Program(baseVert, clearFrag);
        const obstacleDampProg = new Program(baseVert, obstacleDampFrag);
        const rasterStampProg = new Program(baseVert, rasterStampFrag);
        const igniteProg = new Program(baseVert, igniteFrag);   // D2 bridge: sketch → dye
        const captureProg = new Program(baseVert, captureFrag); // D2 bridge: dye → sketch
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
            window.sketch = sketch;
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
        let sketch; // D2 raster sketch layer: RGBA8 dye-res, persistent (no decay/advection)
        let sunrays, sunraysTemp;
        let shadeForm, shadeFormTemp;
        // Multigrid pressure pyramid: mgRes0 = level-0 residual scratch;
        // mgLevels[i] = level i+1 {w, h, rhs, res, p(double), obs}. Level 0
        // aliases the live pressure/divergence/obstacle buffers.
        let mgRes0 = null, mgLevels = null;
        function initFramebuffers() {
            // Use canvas attribute dimensions (not gl.drawingBufferWidth) for aspect ratio.
            // In Electron with transparent windows or DPR scaling, the drawing buffer
            // can differ from canvas.width/height, causing wrong FBO proportions.
            const displayW = canvas.width;
            const displayH = canvas.height;
            const aspect = displayW / Math.max(1, displayH);
            // [GOVERNOR HOOK] stash old sim state so it survives re-init.
            // Density carries the artwork; velocity/pressure carry the motion —
            // without them every re-init (resize, governor/battery resolution
            // change) froze the fluid mid-flow and the dye just faded out.
            const _prevDensity = (typeof density !== 'undefined' && density && density.read) ? density : null;
            const _prevVelocity = (typeof velocity !== 'undefined' && velocity && velocity.read) ? velocity : null;
            const _prevPressure = (typeof pressure !== 'undefined' && pressure && pressure.read) ? pressure : null;
            const _prevSketch = (typeof sketch !== 'undefined' && sketch && sketch.texture) ? sketch : null;
            const _prevSimW = simTexWidth || 0; // old grid width, for velocity rescale
            // GL objects are never garbage-collected while the context lives, so
            // every non-preserved FBO must be deleted before its variable is
            // overwritten below — otherwise each resize/governor re-init strands
            // its textures in VRAM (the preserved density/velocity/pressure pairs
            // are freed separately inside _copyPreserved).
            function _deleteFBO(f) {
                if (!f) return;
                if (f.texture) gl.deleteTexture(f.texture);
                if (f.fbo) gl.deleteFramebuffer(f.fbo);
            }
            [sharpened, detailed, lit, lightShifted, divergence, curl, obstacle,
             sunrays, sunraysTemp, shadeForm, shadeFormTemp].forEach(_deleteFBO);
            _deleteFBO(mgRes0);
            if (mgLevels) mgLevels.forEach(function (l) {
                [l.rhs, l.res, l.obs, l.p.read, l.p.write].forEach(_deleteFBO);
            });
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
            // Linear filtering of HALF_FLOAT (RGBA16F/RG16F/R16F) textures is CORE in
            // WebGL2 — no extension needed. The old probe gated on OES_texture_float_linear
            // (the 32-BIT float extension), which is commonly ABSENT on mobile GPUs, so
            // mobile silently fell back to NEAREST → blocky/shimmering "static" in the
            // advection feedback loop. Default to LINEAR on WebGL2; keep the extension
            // checks as a fallback for any non-WebGL2 context.
            const _isWebGL2 = (typeof WebGL2RenderingContext !== 'undefined') && (gl instanceof WebGL2RenderingContext);
            const _linearOk = _isWebGL2
                || gl.getExtension('OES_texture_half_float_linear')
                || (typeof window !== 'undefined' && window.linearExt)
                || gl.getExtension('OES_texture_float_linear');
            const filter = _linearOk ? gl.LINEAR : gl.NEAREST;
            // Visual dye buffers at dye resolution
            density = createDoubleFBO(dyeTexWidth, dyeTexHeight, rgba.internalFormat, rgba.format, texType, filter);
            // D2 sketch layer: plain RGBA8 (normal paint, 0..1, premultiplied)
            sketch = createFBO(dyeTexWidth, dyeTexHeight, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, filter);
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
            // Multigrid pressure pyramid (halve until ~12 cells or 6 levels;
            // LINEAR filter — restriction box-samples and prolongation
            // interpolates). All R16F: whole pyramid costs ~a third of one
            // extra sim-res field per texture kind.
            mgRes0 = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.LINEAR);
            mgLevels = [];
            (function () {
                let mw = simTexWidth, mh = simTexHeight;
                while (mgLevels.length < 6 && Math.min(mw, mh) > 12) {
                    mw = Math.max(4, Math.round(mw / 2));
                    mh = Math.max(4, Math.round(mh / 2));
                    mgLevels.push({
                        w: mw, h: mh,
                        rhs: createFBO(mw, mh, r.internalFormat, r.format, texType, gl.LINEAR),
                        res: createFBO(mw, mh, r.internalFormat, r.format, texType, gl.LINEAR),
                        p: createDoubleFBO(mw, mh, r.internalFormat, r.format, texType, gl.LINEAR),
                        obs: createFBO(mw, mh, r.internalFormat, r.format, texType, gl.LINEAR)
                    });
                }
            })();
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
            // Shading form field: low-res blurred copy of the frame that
            // the display shading derives its normals from. Paint-engine rule
            // (Krita/ArtRage impasto): light a smoothed height field, never
            // the raw pigment — pixel-scale dye noise must not read as relief.
            // FIXED resolution (like sunrays), NOT tied to dye resolution:
            // relief smoothing must stay constant in screen space — a
            // dye-relative form field re-admitted pixel-scale striations the
            // moment the user raised the quality tier. 256 long-side matches
            // the approved look at the High (1K) tier exactly.
            const sfRes = 256;
            let sfW, sfH;
            if (displayW >= displayH) {
                sfW = Math.min(sfRes, maxTextureSize);
                sfH = Math.max(1, Math.round(sfRes / sunAspect));
            } else {
                sfH = Math.min(sfRes, maxTextureSize);
                sfW = Math.max(1, Math.round(sfRes * sunAspect));
            }
            shadeForm = createFBO(sfW, sfH, rgba.internalFormat, rgba.format, texType, filter);
            shadeFormTemp = createFBO(sfW, sfH, rgba.internalFormat, rgba.format, texType, filter);
            // Explicitly clear all FBOs to zero.
            // Electron's disable-gpu-driver-bug-workarounds can skip default zeroing,
            // leaving garbage in textures that corrupts simulation until first resize.
            const allFBOs = [
                density.read, density.write,
                velocity.read, velocity.write,
                divergence, curl,
                pressure.read, pressure.write,
                sharpened, detailed, lit, lightShifted, obstacle,
                sunrays, sunraysTemp, shadeForm, shadeFormTemp,
                mgRes0
            ];
            mgLevels.forEach(function (l) {
                allFBOs.push(l.rhs, l.res, l.obs, l.p.read, l.p.write);
            });
            for (let i = 0; i < allFBOs.length; i++) {
                if (allFBOs[i] && allFBOs[i].fbo) {
                    gl.bindFramebuffer(gl.FRAMEBUFFER, allFBOs[i].fbo);
                    gl.clearColor(0, 0, 0, 0);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                }
            }
            // [GOVERNOR HOOK] state-preserving re-init: copy old density,
            // velocity and pressure into the fresh FBOs (clearProg is a
            // passthrough scaled by `value`), then free the old GPU memory.
            // Velocity is stored in grid cells/sec (advection multiplies by
            // texelSize), so it is rescaled by newGrid/oldGrid to keep the
            // same physical speed across a resolution change.
            function _copyPreserved(prev, dest, w, h, scale) {
                gl.uniform1f(clearProg.uniforms.value, scale);
                gl.viewport(0, 0, w, h);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, prev.read.texture);
                blit(dest.write.fbo);
                dest.swap();
                [prev.read, prev.write].forEach((f) => {
                    if (f) { gl.deleteTexture(f.texture); gl.deleteFramebuffer(f.fbo); }
                });
            }
            if (_prevDensity || _prevVelocity || _prevPressure || _prevSketch) {
                gl.disable(gl.BLEND);
                clearProg.bind();
                gl.uniform1i(clearProg.uniforms.uTexture, 0);
                // passthrough copies (dye/velocity/pressure preservation):
                // the pressure valve MUST be off here — velocity legitimately
                // exceeds the clamp's knee at high sim res
                gl.uniform1f(clearProg.uniforms.softClamp, 0.0);
                const _velScale = _prevSimW > 0 ? simTexWidth / _prevSimW : 1.0;
                if (_prevDensity) _copyPreserved(_prevDensity, density, dyeTexWidth, dyeTexHeight, 1.0);
                if (_prevVelocity) _copyPreserved(_prevVelocity, velocity, simTexWidth, simTexHeight, _velScale);
                if (_prevPressure) _copyPreserved(_prevPressure, pressure, simTexWidth, simTexHeight, 1.0);
                // Sketch is a SINGLE fbo (not a double) — copy + free by hand.
                // Losing it on a governor/resize reinit would erase the
                // user's drawing, so this is load-bearing.
                if (_prevSketch) {
                    gl.uniform1f(clearProg.uniforms.value, 1.0);
                    gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, _prevSketch.texture);
                    blit(sketch.fbo);
                    gl.deleteTexture(_prevSketch.texture);
                    gl.deleteFramebuffer(_prevSketch.fbo);
                }
                gl.enable(gl.BLEND);
            }
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        initFramebuffers();
        exposeSimStats(); // Expose to window for stats panel
        // ─── Multigrid pressure V-cycle (called from 05j instead of the
        // Jacobi loop when config.MULTIGRID and the governor budget allow).
        // Level 0 is the live pressure/divergence/obstacle; deeper levels
        // solve the error equation on the pyramid. hSq bookkeeping keeps all
        // stored fields at divergence magnitude (see pressureFrag note).
        // One V-cycle ≈ the accuracy of hundreds of Jacobi iterations at the
        // fill cost of ~10 (residual reduction is what kills the large-scale
        // divergence Jacobi can't reach).
        function mgSolvePressure(cycles, obsActive, nPre, nPost, nCoarse, relax) {
            // Smoother damping ω (see pressureFrag): 1.0 = shipped behavior;
            // the Relaxation slider exposes it for experiments
            const _relax = (typeof relax === 'number') ? relax : 1.0;
            // Rebuild the obstacle-fraction pyramid (fractions, not binary —
            // thin solids must survive coarsening). Cheap: 5-6 tiny draws.
            if (obsActive) {
                mgRestrictProg.bind();
                gl.uniform1i(mgRestrictProg.uniforms.uTexture, 0);
                let src = obstacle;
                for (let i = 0; i < mgLevels.length; i++) {
                    const lvl = mgLevels[i];
                    gl.viewport(0, 0, lvl.w, lvl.h);
                    gl.uniform2f(mgRestrictProg.uniforms.fineTexelSize, 1.0 / src.width, 1.0 / src.height);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, src.texture);
                    blit(lvl.obs.fbo);
                    src = lvl.obs;
                }
            }
            function smooth(lv, n) {
                pressureProg.bind();
                gl.viewport(0, 0, lv.w, lv.h);
                gl.uniform2f(pressureProg.uniforms.texelSize, 1.0 / lv.w, 1.0 / lv.h);
                gl.uniform1f(pressureProg.uniforms.hSq, lv.hSq);
                gl.uniform1f(pressureProg.uniforms.relax, _relax);
                gl.uniform1f(pressureProg.uniforms.uObsMax, window.__obsStrengthMax || 0.7);
                gl.uniform1i(pressureProg.uniforms.hasObstacle, obsActive ? 1 : 0);
                gl.uniform1i(pressureProg.uniforms.uDivergence, 0);
                gl.uniform1i(pressureProg.uniforms.uPressure, 1);
                gl.uniform1i(pressureProg.uniforms.uObstacle, 2);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, lv.rhs.texture);
                if (obsActive) {
                    gl.activeTexture(gl.TEXTURE2);
                    gl.bindTexture(gl.TEXTURE_2D, lv.obs.texture);
                }
                for (let i = 0; i < n; i++) {
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, lv.p.read.texture);
                    blit(lv.p.write.fbo);
                    lv.p.swap();
                }
            }
            const levels = [{ w: simTexWidth, h: simTexHeight, p: pressure, rhs: divergence, res: mgRes0, obs: obstacle, hSq: 1.0 }];
            for (let i = 0; i < mgLevels.length; i++) {
                const l = mgLevels[i];
                levels.push({ w: l.w, h: l.h, p: l.p, rhs: l.rhs, res: l.res, obs: l.obs, hSq: Math.pow(4, i + 1) });
            }
            const N = levels.length - 1;
            for (let c = 0; c < cycles; c++) {
                // Descent: smooth, measure what's left, push it down
                for (let L = 0; L < N; L++) {
                    const lv = levels[L], nx = levels[L + 1];
                    smooth(lv, nPre);
                    mgResidualProg.bind();
                    gl.viewport(0, 0, lv.w, lv.h);
                    gl.uniform1f(mgResidualProg.uniforms.uObsMax, window.__obsStrengthMax || 0.7);
                    gl.uniform2f(mgResidualProg.uniforms.texelSize, 1.0 / lv.w, 1.0 / lv.h);
                    gl.uniform1f(mgResidualProg.uniforms.hSq, lv.hSq);
                    gl.uniform1i(mgResidualProg.uniforms.hasObstacle, obsActive ? 1 : 0);
                    gl.uniform1i(mgResidualProg.uniforms.uPressure, 0);
                    gl.uniform1i(mgResidualProg.uniforms.uDivergence, 1);
                    gl.uniform1i(mgResidualProg.uniforms.uObstacle, 2);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, lv.p.read.texture);
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, lv.rhs.texture);
                    if (obsActive) {
                        gl.activeTexture(gl.TEXTURE2);
                        gl.bindTexture(gl.TEXTURE_2D, lv.obs.texture);
                    }
                    blit(lv.res.fbo);
                    mgRestrictProg.bind();
                    gl.viewport(0, 0, nx.w, nx.h);
                    gl.uniform1i(mgRestrictProg.uniforms.uTexture, 0);
                    gl.uniform2f(mgRestrictProg.uniforms.fineTexelSize, 1.0 / lv.w, 1.0 / lv.h);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, lv.res.texture);
                    blit(nx.rhs.fbo);
                    // zero initial guess for the error solve
                    gl.bindFramebuffer(gl.FRAMEBUFFER, nx.p.read.fbo);
                    gl.clearColor(0, 0, 0, 0);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                }
                // Coarsest: a few Jacobi sweeps stand in for an exact solve
                smooth(levels[N], nCoarse);
                // Ascent: interpolate each error solve up, add, re-smooth
                for (let L = N - 1; L >= 0; L--) {
                    const lv = levels[L], nx = levels[L + 1];
                    mgProlongProg.bind();
                    gl.viewport(0, 0, lv.w, lv.h);
                    gl.uniform1i(mgProlongProg.uniforms.uPressure, 0);
                    gl.uniform1i(mgProlongProg.uniforms.uCoarse, 1);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, lv.p.read.texture);
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, nx.p.read.texture);
                    blit(lv.p.write.fbo);
                    lv.p.swap();
                    smooth(lv, nPost);
                }
            }
        }
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
                // The obstacle canvas is composited in screen space (top-down);
                // GL textures put row 0 at the bottom, so flip once here.
                for (var y = 0; y < h; y++) {
                    var src = y * w;
                    var dst = (h - 1 - y) * w;
                    for (var x = 0; x < w; x++) {
                        f[dst + x] = d[(src + x) * 4 + 3] * (1 / 255);
                    }
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
