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
        const splatProg = new Program(baseVert, splatFrag);
        const memRefreshProg = new Program(baseVert, memRefreshFrag); // splat-scissor memory companion (05b)
        const advectionProg = new Program(baseVert, advectionFrag);
        const macAdvectProg = new Program(baseVert, macAdvectFrag);
        const macCorrectProg = new Program(baseVert, macCorrectFrag);
        const divergenceProg = new Program(baseVert, divergenceFrag);
        const curlProg = new Program(baseVert, curlFrag);
        const vorticityProg = new Program(baseVert, vorticityFrag);
        const attractorProg = new Program(baseVert, attractorFrag); // 6.2 attractor forcing field
        const pressureProg = new Program(baseVert, pressureFrag);
        const mgResidualProg = new Program(baseVert, mgResidualFrag);
        const mgRestrictProg = new Program(baseVert, mgRestrictFrag);
        const mgProlongProg = new Program(baseVert, mgProlongFrag);
        const gradientProg = new Program(baseVert, gradientFrag);
        const clearProg = new Program(baseVert, clearFrag);
        const obstacleDampProg = new Program(baseVert, obstacleDampFrag);
        const obstacleCompositeProg = new Program(baseVert, obstacleCompositeFrag);
        const morphObstacleProg = new Program(baseVert, morphObstacleFrag); // collider gap fill (close)
        const hfFloorProg = new Program(baseVert, hfFloorFrag); // M2 spectral floor
        const wetnessAdvectProg = new Program(baseVert, wetnessAdvectFrag); // P15-1 wetness advect+dry
        const wetSplatProg = new Program(baseVert, wetSplatFrag);           // P15-1 wetness deposit
        const rasterStampProg = new Program(baseVert, rasterStampFrag);
        const igniteProg = new Program(baseVert, igniteFrag);   // D2 bridge: sketch → dye
        const captureProg = new Program(baseVert, captureFrag); // D2 bridge: dye → sketch
        const blurProg = new Program(blurVert, blurFrag);
        const glowPrefilterProg = new Program(baseVert, glowPrefilterFrag);
        const glowBlurProg = new Program(baseVert, glowBlurFrag);
        const glowFinalProg = new Program(baseVert, glowFinalFrag);
        const scatterProg = new Program(baseVert, scatterFrag);
        // PhotoSafe (photosensitivity protection) passes — see 05b sources
        const photoSafeLumaProg = new Program(baseVert, photoSafeLumaFrag);
        const photoSafeStatsProg = new Program(baseVert, photoSafeStatsFrag);
        const photoSafeCompositeProg = new Program(baseVert, photoSafeCompositeFrag);
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
            window.wetness = wetness; // P15-1 (debug/inspection)
            window.sketch = sketch;
            window.divergence = divergence;
            window.curl = curl;
            window.mgLevels = mgLevels; // harness introspection (obstacle pyramid probes)
        }
        // Harness introspection: obstacle swaps with its scratch on every
        // GPU composite, so expose a getter rather than a snapshot ref.
        window.__getObstacle = function () { return obstacle; };
        // Same reason: `glow` and `scatter` are reassigned on every resize /
        // governor reinit, so hand out getters rather than snapshot refs.
        window.__getGlow = function () { return glow; };
        window.__getScatter = function () { return scatter; };
        window.__getPhotoSafe = function () {
            return { frame: safeFrame, out: safeOut, luma: safeLuma, stats: safeStats };
        };
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
        let density, velocity, divergence, curl, pressure, sharpened, detailed, lit, obstacle, obstacleScratch;
        let wetness; // P15-1: R16F sim-res double-FBO, 0 dry … 1 wet
        // D2 raster paint layers: layer index -> single RGBA8 dye-res FBO,
        // persistent (no decay/advection). Entries are created/owned by
        // window.rasterLayers (05l); declared here so initFramebuffers can
        // preserve every layer's pixels across a resize/governor reinit.
        let rasterStore = {};
        // D3 masks: mask id -> single RGBA8 dye-res FBO (alpha = coverage,
        // rgb = white·alpha premult). Owned by window.Masks (05o); declared
        // here for the same reinit-preservation as rasterStore.
        let maskStore = {};
        let sketch; // alias: the ACTIVE raster layer's FBO (assigned by rasterLayers.setActive)
        let glow, glowFramebuffers = []; // HDR bloom: 256-base target + halving mip chain
        let scatter; // Volumetric light shafts: same 256-base grid as `glow`
        // PhotoSafe buffers: safeFrame = the display pass's render target while
        // protection is on; safeOut = double-buffered PRESENTED frame (write =
        // this frame, read = history); safeLuma = 16x16 block luminance pair;
        // safeStats = 2x1 limiter state (texel 0 display: envelope/slew/mean;
        // texel 1 detector: lastSign/pairTimer/transition-rate).
        let safeFrame, safeOut, safeLuma, safeStats;
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
            // without them every re-init (resize, governor resolution
            // change) froze the fluid mid-flow and the dye just faded out.
            const _prevDensity = (typeof density !== 'undefined' && density && density.read) ? density : null;
            const _prevVelocity = (typeof velocity !== 'undefined' && velocity && velocity.read) ? velocity : null;
            const _prevPressure = (typeof pressure !== 'undefined' && pressure && pressure.read) ? pressure : null;
            // P15-1: wetness carries the paper's dampness — preserve it across
            // resize/governor reinits like the other physics fields, or a
            // resolution change would suddenly re-dry (freeze) all wet paint.
            const _prevWetness = (typeof wetness !== 'undefined' && wetness && wetness.read) ? wetness : null;
            // D2: stash every raster paint layer's FBO for preserve-and-copy
            const _prevRaster = {};
            Object.keys(rasterStore).forEach(function (rid) {
                if (rasterStore[rid] && rasterStore[rid].texture) _prevRaster[rid] = rasterStore[rid];
            });
            // D3: same for mask coverage buffers
            const _prevMask = {};
            Object.keys(maskStore).forEach(function (mid) {
                if (maskStore[mid] && maskStore[mid].texture) _prevMask[mid] = maskStore[mid];
            });
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
            [sharpened, detailed, lit, divergence, curl, obstacle, obstacleScratch,
             glow, scatter, shadeForm, shadeFormTemp, safeFrame].forEach(_deleteFBO);
            [safeOut, safeLuma, safeStats].forEach(function (d) {
                if (d) { _deleteFBO(d.read); _deleteFBO(d.write); }
            });
            glowFramebuffers.forEach(_deleteFBO);
            glowFramebuffers = [];
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
            // D2 raster paint layers: plain RGBA8 (normal paint, 0..1,
            // premultiplied) — recreate each existing layer's buffer at the
            // new dye res; old pixels are copied in below.
            Object.keys(_prevRaster).forEach(function (rid) {
                rasterStore[rid] = createFBO(dyeTexWidth, dyeTexHeight, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, filter);
            });
            Object.keys(_prevMask).forEach(function (mid) {
                maskStore[mid] = createFBO(dyeTexWidth, dyeTexHeight, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, filter);
            });
            // Sharpness buffer at dye resolution
            sharpened = createFBO(dyeTexWidth, dyeTexHeight, rgba.internalFormat, rgba.format, texType, filter);
            // Micro detail buffer at dye resolution
            detailed = createFBO(dyeTexWidth, dyeTexHeight, rgba.internalFormat, rgba.format, texType, filter);
            // Lighting buffer at dye resolution
            lit = createFBO(dyeTexWidth, dyeTexHeight, rgba.internalFormat, rgba.format, texType, filter);
            // Physics buffers at simulation resolution
            velocity = createDoubleFBO(simTexWidth, simTexHeight, rg.internalFormat, rg.format, texType, filter);
            // P15-1 wetness map: sim-res R16F, LINEAR (advected by semi-Lagrangian
            // backtrace like the dye). Starts cleared to 0 = bone dry.
            wetness = createDoubleFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, filter);
            divergence = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
            curl = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
            pressure = createDoubleFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
            // Obstacle texture for collision layers (single-channel, sim resolution)
            obstacle = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.LINEAR);
            obstacleScratch = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.LINEAR);
            // Multigrid pressure pyramid (halve until ~12 cells or 6 levels;
            // LINEAR filter — restriction box-samples and prolongation
            // interpolates). All R16F: whole pyramid costs ~a third of one
            // extra sim-res field per texture kind.
            mgRes0 = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.LINEAR);
            mgLevels = [];
            (function () {
                let mw = simTexWidth, mh = simTexHeight;
                const mgLevelLimit = Math.min(10, Math.max(1,
                    Math.ceil(Math.log2(Math.max(1, Math.min(simTexWidth, simTexHeight) / 16)))));
                while (mgLevels.length < mgLevelLimit && Math.min(mw, mh) > 4) {
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
            // Glow (HDR bloom) FBOs: fixed 256-base target (like shadeForm,
            // NOT tied to dye res — the halo radius must stay constant in
            // screen space across quality tiers) + a halving mip chain the
            // blur walks down and additively climbs back up.
            const glowRes = config.GLOW_RESOLUTION || 256;
            const glowAspect = displayW / Math.max(1, displayH);
            let glowW, glowH;
            if (displayW >= displayH) {
                glowW = Math.min(glowRes, maxTextureSize);
                glowH = Math.max(1, Math.round(glowRes / glowAspect));
            } else {
                glowH = Math.min(glowRes, maxTextureSize);
                glowW = Math.max(1, Math.round(glowRes * glowAspect));
            }
            glow = createFBO(glowW, glowH, rgba.internalFormat, rgba.format, texType, filter);
            const glowIters = config.GLOW_ITERATIONS || 8;
            for (let gi = 0; gi < glowIters; gi++) {
                const gw = glowW >> (gi + 1);
                const gh = glowH >> (gi + 1);
                if (gw < 2 || gh < 2) break;
                glowFramebuffers.push(createFBO(gw, gh, rgba.internalFormat, rgba.format, texType, filter));
            }
            // Scatter (light shafts) target: same grid as `glow`, because it
            // marches glow's own prefilter output and the display pass samples
            // both at the same UVs. Shafts are low-frequency, so 256-base is
            // ample and the compositor's bilinear upscale is free.
            scatter = createFBO(glowW, glowH, rgba.internalFormat, rgba.format, texType, filter);
            // PhotoSafe buffers. safeFrame/safeOut are RGBA8 at the DRAWING
            // BUFFER size — same quantization as the canvas, so the protected
            // pass-through stays bit-identical to a direct present. The luma
            // grid and limiter state are tiny half-float targets.
            if (config.PHOTOSAFE) {
                safeFrame = createFBO(displayW, displayH, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, filter);
                safeOut = createDoubleFBO(displayW, displayH, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, filter);
                safeLuma = createDoubleFBO(16, 16, rgba.internalFormat, rgba.format, texType, filter);
                safeStats = createDoubleFBO(2, 1, rgba.internalFormat, rgba.format, texType, gl.NEAREST);
            } else {
                // Opted out: skip the ~3x canvas-size RGBA8 allocation. If the
                // user flips protection on later, window.__photoSafeEnsure
                // (05i, called by the 05e toggle handler) re-runs this init.
                safeFrame = null; safeOut = null; safeLuma = null; safeStats = null;
            }
            // Shading form field: low-res blurred copy of the frame that
            // the display shading derives its normals from. Paint-engine rule
            // (Krita/ArtRage impasto): light a smoothed height field, never
            // the raw pigment — pixel-scale dye noise must not read as relief.
            // FIXED resolution (like glow), NOT tied to dye resolution:
            // relief smoothing must stay constant in screen space — a
            // dye-relative form field re-admitted pixel-scale striations the
            // moment the user raised the quality tier. 256 long-side matches
            // the approved look at the High (1K) tier exactly.
            const sfRes = 256;
            let sfW, sfH;
            if (displayW >= displayH) {
                sfW = Math.min(sfRes, maxTextureSize);
                sfH = Math.max(1, Math.round(sfRes / glowAspect));
            } else {
                sfH = Math.min(sfRes, maxTextureSize);
                sfW = Math.max(1, Math.round(sfRes * glowAspect));
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
                sharpened, detailed, lit, obstacle, obstacleScratch,
                glow, scatter, shadeForm, shadeFormTemp,
                safeFrame,
                safeOut && safeOut.read, safeOut && safeOut.write,
                safeLuma && safeLuma.read, safeLuma && safeLuma.write,
                safeStats && safeStats.read, safeStats && safeStats.write,
                mgRes0
            ];
            glowFramebuffers.forEach(function (g) { allFBOs.push(g); });
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
            const _rasterIds = Object.keys(_prevRaster);
            const _maskIds = Object.keys(_prevMask);
            if (_prevDensity || _prevVelocity || _prevPressure || _prevWetness || _rasterIds.length || _maskIds.length) {
                gl.disable(gl.BLEND);
                clearProg.bind();
                gl.uniform1i(clearProg.uniforms.uTexture, 0);
                // passthrough copies (dye/velocity/pressure preservation):
                // the pressure valve MUST be off here — velocity legitimately
                // exceeds the clamp's knee at high sim res
                gl.uniform1f(clearProg.uniforms.softClamp, 0.0);
                const _velScale = 1.0;
                if (_prevDensity) _copyPreserved(_prevDensity, density, dyeTexWidth, dyeTexHeight, 1.0);
                if (_prevVelocity) _copyPreserved(_prevVelocity, velocity, simTexWidth, simTexHeight, _velScale);
                if (_prevPressure) _copyPreserved(_prevPressure, pressure, simTexWidth, simTexHeight, 1.0);
                // Wetness is a normalized 0..1 field (not velocity), so no
                // grid-rescale — straight passthrough at the new sim res.
                if (_prevWetness) _copyPreserved(_prevWetness, wetness, simTexWidth, simTexHeight, 1.0);
                // Raster layers are SINGLE fbos (not doubles) — copy + free
                // by hand. Losing one on a governor/resize reinit would erase
                // the user's drawing, so this is load-bearing.
                _rasterIds.forEach(function (rid) {
                    const prev = _prevRaster[rid];
                    gl.uniform1f(clearProg.uniforms.value, 1.0);
                    gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, prev.texture);
                    blit(rasterStore[rid].fbo);
                    gl.deleteTexture(prev.texture);
                    gl.deleteFramebuffer(prev.fbo);
                });
                _maskIds.forEach(function (mid) {
                    const prev = _prevMask[mid];
                    gl.uniform1f(clearProg.uniforms.value, 1.0);
                    gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, prev.texture);
                    blit(maskStore[mid].fbo);
                    gl.deleteTexture(prev.texture);
                    gl.deleteFramebuffer(prev.fbo);
                });
                gl.enable(gl.BLEND);
            }
            // Re-point the active-layer alias at the rebuilt store entry
            if (window.rasterLayers) {
                sketch = rasterStore[window.rasterLayers.activeId()] || null;
                window.sketch = sketch;
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
                // Box-average (the shipped behavior). maxPool=1 was tested as
                // a fix theory for the strength-1.0 wall fuzz and REFUTED
                // hard (2026-07-16): sealing thin walls down the pyramid
                // over-blocks legitimately-open channels, and measured 10×
                // WORSE (pMax 62k vs 6.5k, vHF 4500 vs 360). The real fuzz
                // engine was vorticity confinement at walls (see
                // vorticityFrag). Knob kept for experiments only.
                gl.uniform1i(mgRestrictProg.uniforms.maxPool,
                    config.MG_OBS_MAXPOOL === true ? 1 : 0);
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
            // Experiment knob (console): cap how deep the V-cycle descends
            // (0/unset = full pyramid). Used to bisect the coarse-obstacle
            // leakage; max-pool obstacles made full depth safe again.
            let N = levels.length - 1;
            const _depthCap = (typeof config.MG_MAX_DEPTH === 'number') ? (config.MG_MAX_DEPTH | 0) : 0;
            if (_depthCap > 0 && _depthCap < N) N = _depthCap;
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
                    gl.uniform1i(mgRestrictProg.uniforms.maxPool, 0); // residuals ALWAYS box-average
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
        window.beginObstacleTexture = function () {
            if (!obstacle || gl.isContextLost()) return false;
            gl.bindFramebuffer(gl.FRAMEBUFFER, obstacle.fbo);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            return true;
        };
        window.compositeObstacleSource = function (source, opts) {
            if (!source || !source.texture || !obstacle || !obstacleScratch || gl.isContextLost()) return false;
            opts = opts || {};
            // The recomposite runs in a rAF callback, so it inherits whatever
            // blend state the last GL work left. 05i's sketch/mask stamping
            // uses eraser blending (src factor ZERO) — with that live, this
            // blit resolves to dst = 0 and the whole collider silently dies
            // until the next clean recomposite ("changing strength sometimes
            // makes it stop working", 2026-08-06).
            gl.disable(gl.BLEND);
            obstacleCompositeProg.bind();
            gl.uniform2f(obstacleCompositeProg.uniforms.texelSize, 1.0 / obstacle.width, 1.0 / obstacle.height);
            gl.uniform1i(obstacleCompositeProg.uniforms.uSource, 0);
            gl.uniform1i(obstacleCompositeProg.uniforms.uObstacle, 1);
            gl.uniform4f(obstacleCompositeProg.uniforms.sourceTransform,
                Number(opts.x) || 0, Number(opts.y) || 0,
                Number(opts.scaleX) || 1, Number(opts.scaleY) || 1);
            gl.uniform1f(obstacleCompositeProg.uniforms.sourceRotation, Number(opts.rotation) || 0);
            gl.uniform1f(obstacleCompositeProg.uniforms.strength,
                Math.max(0, Math.min(1, Number(opts.strength) || 0)));
            gl.uniform1f(obstacleCompositeProg.uniforms.covKnee,
                (typeof config !== 'undefined' && typeof config.COLLIDER_ALPHA_SOLID === 'number')
                    ? config.COLLIDER_ALPHA_SOLID : 0.45);
            gl.viewport(0, 0, obstacle.width, obstacle.height);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, source.texture);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
            blit(obstacleScratch.fbo);
            var previous = obstacle;
            obstacle = obstacleScratch;
            obstacleScratch = previous;
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            return true;
        };
        // Collider gap fill: morphological CLOSE on the composited obstacle
        // (R passes of 5-tap-cross dilate, then R of erode). Seals enclosed
        // texture-scale pockets (line-art mask images — fish-scale/knit
        // interiors are TRUE-zero coverage, which no alpha curve can lift)
        // while larger drawn cutouts (eyes, mouths) and the silhouette stay
        // put. Radius is config.COLLIDER_GAP_FILL in reference-512 sim
        // texels, scaled by the actual sim width so the sealed feature size
        // is resolution-invariant (M3 principle). 0 = exact no-op.
        function closeObstacleGaps() {
            var ref = (typeof config !== 'undefined' && typeof config.COLLIDER_GAP_FILL === 'number')
                ? config.COLLIDER_GAP_FILL : 0;
            if (!(ref > 0) || !obstacle || !obstacleScratch) return 0;
            var radius = Math.min(32, Math.round(ref * obstacle.width / 512));
            if (radius <= 0) return 0;
            gl.disable(gl.BLEND); // also called standalone from updateObstacleTexture — see compositeObstacleSource
            morphObstacleProg.bind();
            gl.uniform1i(morphObstacleProg.uniforms.uTexture, 0);
            gl.uniform2f(morphObstacleProg.uniforms.texelSize, obstacle.texelSizeX, obstacle.texelSizeY);
            gl.viewport(0, 0, obstacle.width, obstacle.height);
            gl.activeTexture(gl.TEXTURE0);
            for (var phase = 0; phase < 2; phase++) {
                gl.uniform1i(morphObstacleProg.uniforms.isErode, phase);
                for (var i = 0; i < radius; i++) {
                    gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                    blit(obstacleScratch.fbo);
                    var prev = obstacle;
                    obstacle = obstacleScratch;
                    obstacleScratch = prev;
                }
            }
            return radius;
        }
        // M4 edge quality: one separable 1-texel blur over the composited
        // obstacle (H into scratch, V back) — the GPU-path equivalent of the
        // D0.5 sim-scale blur the CPU compositor applies. Call after the last
        // compositeObstacleSource of a rebuild.
        window.finishObstacleComposite = function () {
            if (!obstacle || !obstacleScratch || gl.isContextLost()) return;
            gl.disable(gl.BLEND);
            closeObstacleGaps();
            blurProg.bind();
            gl.uniform1i(blurProg.uniforms.uTexture, 0);
            gl.viewport(0, 0, obstacle.width, obstacle.height);
            gl.uniform2f(blurProg.uniforms.texelSize, obstacle.texelSizeX, 0.0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
            blit(obstacleScratch.fbo);
            gl.uniform2f(blurProg.uniforms.texelSize, 0.0, obstacle.texelSizeY);
            gl.bindTexture(gl.TEXTURE_2D, obstacleScratch.texture);
            blit(obstacle.fbo);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        };
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
                // Gap fill applies to the CPU-composited path too (depth-mask
                // colliders from imported images are the main source of
                // line-art texture pockets). Follow with the same 1-texel
                // blur the GPU path gets so seal seams stay antialiased —
                // gated on the close actually running, so COLLIDER_GAP_FILL 0
                // keeps this path bit-identical to before.
                if (closeObstacleGaps() > 0) {
                    gl.disable(gl.BLEND);
                    blurProg.bind();
                    gl.uniform1i(blurProg.uniforms.uTexture, 0);
                    gl.viewport(0, 0, w, h);
                    gl.uniform2f(blurProg.uniforms.texelSize, obstacle.texelSizeX, 0.0);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                    blit(obstacleScratch.fbo);
                    gl.uniform2f(blurProg.uniforms.texelSize, 0.0, obstacle.texelSizeY);
                    gl.bindTexture(gl.TEXTURE_2D, obstacleScratch.texture);
                    blit(obstacle.fbo);
                    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                }
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
