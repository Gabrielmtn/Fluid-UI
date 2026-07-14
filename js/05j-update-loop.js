// ═══════════════════════════════════════════════════════════════════
// js/05j-update-loop.js — part 10/14 of former 05-fluid-sim.js (lines 3120–3489)
// LOAD ORDER: after 05i-sim-stats.js, before 05k-layers-render.js
// PROVIDES: update() main loop (physics passes, post-FX, display, stats, governor feed)
// REQUIRES: everything above; renderLayers NOT needed at load
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        // Decay batching: half-float dye/velocity textures round a multiply
        // back to the same value when the per-frame decrement is below ~0.05%
        // of the stored value (fp16 has a 10-bit mantissa). At tiny timesteps
        // (uncapped Electron framerates, low timeScale, near-1.0 dissipation)
        // every decay mechanism falls below that and the fade freezes with
        // patchy residue. Fix: accumulate decay time on the CPU and apply it
        // in one batched step (uniform decayDt) only when the resulting
        // decrement is comfortably above fp16 rounding (≥0.2%); skip frames
        // pass decayDt=0 which the shader treats as an exact no-op.
        // Growth (dissipation ≥ 1.0) keeps per-frame semantics — it has no
        // fade-to-zero path and batching it would change preset feel.
        let dyeDecayAccum = 0, velDecayAccum = 0;
        let lastDyeDiss = -1, lastVelDiss = -1;
        // Resize settle deadline for the debounced FBO rebuild (0 = none pending)
        let _fboSettleAtMs = 0;
        // Last frame's wrapper size — the settle deadline re-arms only when
        // THIS moves (see below), not merely while buffer≠wrapper persists
        let _lastTargetW = 0, _lastTargetH = 0;
        function computeDecayDt(dissipation, accum, dt) {
            if (dissipation >= 1.0) return { decayDt: dt, accum: 0 };
            accum = Math.min(accum + dt, 1.0);
            const cand = Math.pow(dissipation, accum * 60.0);
            if (1.0 - cand >= 0.002 || accum >= 1.0) return { decayDt: accum, accum: 0 };
            return { decayDt: 0, accum };
        }
        function update() {
            const nowMs = performance.now();
            const cpuStart = nowMs;
            // Display Hz: Electron API detects instantly; rAF fallback runs here if needed
            detectDisplayHz(nowMs);
            // FPS Cap: skip frame if interval hasn't elapsed (with epsilon tolerance)
            const cap = (typeof window.fpsCap === 'number' && window.fpsCap > 0) ? window.fpsCap : 0;
            if (cap > 0) {
                const desiredMs = 1000 / cap;
                if (nowMs - lastDrawTimeMs < desiredMs - 0.5) {
                    requestAnimationFrame(update);
                    return;
                }
                // Drift-aligned advance: step by interval instead of snapping to now
                lastDrawTimeMs += desiredMs;
                // If we fell too far behind (tab hidden, etc.), snap to now
                if (nowMs - lastDrawTimeMs > desiredMs) {
                    lastDrawTimeMs = nowMs;
                }
            } else {
                lastDrawTimeMs = nowMs;
            }
            // COS Oscillator: advance all active parameter oscillators
            if (window.cosOscillator) window.cosOscillator.tick(nowMs / 1000);
            // Physics timestep: Cap at 16ms to prevent instability at low FPS
            // Without this cap, 30 FPS = 33ms timestep = simulation explodes!
            const rawDt = Math.min((nowMs - lastTime) / 1000, 0.016);
            lastTime = nowMs;
            // Time scale: dilate physics without changing equations
            const dt = rawDt * (window.timeScale || 1.0);
            if (window.kAnimateRot && window.kSpinSpeed) {
                window.kAngle = (window.kAngle || 0) + dt * window.kSpinSpeed * Math.PI / 180;
            }
            const targetWidth = canvasWrapper.clientWidth;
            const targetHeight = canvasWrapper.clientHeight;
            const canvasSizeChanged = canvas.width !== targetWidth || canvas.height !== targetHeight;
            if (canvasSizeChanged) {
                // Track the wrapper VISUALLY every frame (cheap style writes;
                // explicit px matches updateCanvasSize — CSS '100%' causes
                // compositor differences in Electron's transparent window mode)…
                canvas.style.width = targetWidth + 'px';
                canvas.style.height = targetHeight + 'px';
                // …but DEFER the drawing-buffer realloc to the settle below,
                // alongside the FBO rebuild. Assigning canvas.width reallocates
                // and clears the buffer — doing that every frame of a UI
                // collapse/expand animation was a per-frame full-res realloc on
                // top of the layout work, and the dominant source of resize
                // jank. Until settle, the display blit fills the OLD buffer and
                // CSS stretches it — same tradeoff the FBO debounce already
                // accepted (comment below).
                // Debounce the FBO rebuild until the size stops changing: UI
                // collapse/expand animations resize the wrapper EVERY frame, and
                // rebuilding 17 FBOs per frame — now including gl.delete* of
                // textures the GPU used one frame ago (leak fix), which forces a
                // driver sync — stalled the whole transition. The display pass
                // just stretches the old-resolution FBOs until the settle fires.
                //
                // Re-arm the deadline ONLY while the wrapper itself is moving.
                // The old code re-armed whenever buffer≠wrapper — a condition
                // that stays true until the settle fires — so the deadline slid
                // forward every frame and the tracker could never heal on its
                // own; it only worked when an external needsFramebufferReinit
                // (handle-drag pointerup, governor level change) rescued it.
                // With the governor off, a monitor move / OS-driven wrapper
                // reflow left the sim permanently smaller than the wrapper
                // (the 2026-07-09 "init size" bug, second act).
                if (targetWidth !== _lastTargetW || targetHeight !== _lastTargetH || !_fboSettleAtMs) {
                    _fboSettleAtMs = nowMs + 180;
                }
            }
            _lastTargetW = targetWidth;
            _lastTargetH = targetHeight;
            if (window.needsFramebufferReinit || (_fboSettleAtMs && nowMs >= _fboSettleAtMs)) {
                _fboSettleAtMs = 0;
                // One buffer realloc per resize gesture, just before the FBO
                // rebuild (governor-only reinits arrive with unchanged dims and
                // must not clear the canvas — see canvasSizeChanged note above)
                const settleW = canvasWrapper.clientWidth;
                const settleH = canvasWrapper.clientHeight;
                if (canvas.width !== settleW || canvas.height !== settleH) {
                    canvas.width = settleW;
                    canvas.height = settleH;
                    canvas.style.width = settleW + 'px';
                    canvas.style.height = settleH + 'px';
                }
                initFramebuffers();
                exposeSimStats(); // Update stats after resize
                window.needsFramebufferReinit = false;
                // Re-upload collision obstacle data to the freshly created FBO
                if (window.collisionLayers && window.collisionLayers.enabled) {
                    window.collisionLayers.updateObstacleFromLayers();
                }
            }
            // Process replay even when paused so right-click replay always works
            processReplay();
            if (!isPaused) {
                if (pointer.moved && pointer.down && !isReplayActive) {
                    window.__lastPaintMs = nowMs; // governor: defer res-tier recovery while strokes are recent
                    // Accumulate cursor travel (fraction of canvas width) so the
                    // splat-in ramp is distance-based / speed-independent.
                    splatStrokeDist += Math.hypot(pointer.dx, pointer.dy) / 10 / Math.max(1, canvas.width);
                    const inMult = getSplatInMult();
                    const savedR = config.SPLAT_RADIUS;
                    config.SPLAT_RADIUS = savedR * inMult;
                    multiSplat(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color, false);
                    config.SPLAT_RADIUS = savedR;
                    pushStrokeEvent(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
                    pointer.moved = false;
                }
                // Splat-out: a trailing tail along the release velocity, tapering
                // in size over splatOutDist of travel. Ends when the size taper
                // completes OR the velocity has effectively died (so it can never
                // stall splatting at a fixed point).
                if (splatOutActive) {
                    const outMult = getSplatOutMult();
                    const outVel2 = splatOutDx * splatOutDx + splatOutDy * splatOutDy;
                    if (outMult <= 0.001 || outVel2 < 0.0004) {
                        splatOutActive = false;
                        if (pendingArmAdvance) {
                            advanceArmColors();
                            pendingArmAdvance = false;
                        }
                    } else {
                        multiSplatWithRadius(splatOutX, splatOutY, splatOutDx * 0.9, splatOutDy * 0.9, splatOutColor, config.SPLAT_RADIUS * splatReleaseInMult * outMult);
                        // Advance the tail along the decaying velocity + accumulate
                        // its travel for the distance-based taper.
                        splatOutX += splatOutDx / 10;
                        splatOutY += splatOutDy / 10;
                        splatTailDist += Math.sqrt(outVel2) / 10 / Math.max(1, canvas.width);
                        splatOutDx *= 0.9;
                        splatOutDy *= 0.9;
                    }
                }
                if (recEnabled) {
                    recUpdatePlayback();
                }
                // Disable blend for physics passes (pure overwrite, no alpha needed)
                gl.disable(gl.BLEND);
                gl.viewport(0, 0, simTexWidth, simTexHeight);
                // ── Standard Chorin projection order: forces → project → advect ──
                // 1. Curl computation
                curlProg.bind();
                gl.uniform2f(curlProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1i(curlProg.uniforms.uVelocity, 0);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(curl.fbo);
                // 2. Vorticity confinement → velocity
                vorticityProg.bind();
                gl.uniform2f(vorticityProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1i(vorticityProg.uniforms.uVelocity, 0);
                gl.uniform1i(vorticityProg.uniforms.uCurl, 1);
                gl.uniform1f(vorticityProg.uniforms.curl, config.CURL);
                gl.uniform1f(vorticityProg.uniforms.dt, dt);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, curl.texture);
                blit(velocity.write.fbo);
                velocity.swap();
                // Obstacle participation in the projection (divergence /
                // pressure / gradient): solids become walls the solve flows
                // around, instead of relying solely on the post-projection
                // damp pass. Same gate as that pass.
                const obsActive = !!(window.collisionLayers && window.collisionLayers.enabled && obstacle);
                // 3. Divergence
                const _openBoundary = window.__edgeAbsorb ? 1.0 : 0.0;
                divergenceProg.bind();
                gl.uniform2f(divergenceProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1f(divergenceProg.uniforms.openBoundary, _openBoundary);
                gl.uniform1i(divergenceProg.uniforms.hasObstacle, obsActive ? 1 : 0);
                gl.uniform1i(divergenceProg.uniforms.uVelocity, 0);
                gl.uniform1i(divergenceProg.uniforms.uObstacle, 1);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                if (obsActive) {
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                }
                blit(divergence.fbo);
                // 4. Clear pressure (decay previous frame's pressure field)
                clearProg.bind();
                gl.uniform1i(clearProg.uniforms.uTexture, 0);
                gl.uniform1f(clearProg.uniforms.value, config.PRESSURE_DISSIPATION);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
                blit(pressure.write.fbo);
                pressure.swap();
                // 5. Pressure solve — multigrid V-cycle when enabled, with
                // warm-started Jacobi as the governor floor and toggle-off
                // path. The governor's iteration budget maps onto the ladder:
                // ≥24 → 2 V-cycles, ≥12 → 1 V-cycle, below → Jacobi at the
                // budget (V-cycle fill cost ≈ 10-15 Jacobi iterations, so the
                // rungs stay monotonic in GPU cost).
                // [GOVERNOR HOOK] effective iteration count (config untouched)
                const _pIters = window.QualityGovernor
                    ? window.QualityGovernor.effIters(config.PRESSURE_ITERATIONS)
                    : config.PRESSURE_ITERATIONS;
                const _mgOn = !!config.MULTIGRID && typeof mgSolvePressure === 'function' && _pIters >= 12;
                if (_mgOn) {
                    mgSolvePressure(_pIters >= 24 ? 2 : 1, obsActive, 2, 2, 8);
                } else {
                    pressureProg.bind();
                    gl.uniform2f(pressureProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                    gl.uniform1f(pressureProg.uniforms.hSq, 1.0);
                    gl.uniform1i(pressureProg.uniforms.hasObstacle, obsActive ? 1 : 0);
                    gl.uniform1i(pressureProg.uniforms.uDivergence, 0);
                    gl.uniform1i(pressureProg.uniforms.uObstacle, 2);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, divergence.texture);
                    if (obsActive) {
                        gl.activeTexture(gl.TEXTURE2);
                        gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                    }
                    for (let i = 0; i < _pIters; i++) {
                        gl.uniform1i(pressureProg.uniforms.uPressure, 1);
                        gl.activeTexture(gl.TEXTURE1);
                        gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
                        blit(pressure.write.fbo);
                        pressure.swap();
                    }
                }
                // 6. Gradient subtract → divergence-free velocity
                gradientProg.bind();
                gl.uniform2f(gradientProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1f(gradientProg.uniforms.openBoundary, _openBoundary);
                gl.uniform1i(gradientProg.uniforms.hasObstacle, obsActive ? 1 : 0);
                gl.uniform1i(gradientProg.uniforms.uPressure, 0);
                gl.uniform1i(gradientProg.uniforms.uVelocity, 1);
                gl.uniform1i(gradientProg.uniforms.uObstacle, 2);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                if (obsActive) {
                    gl.activeTexture(gl.TEXTURE2);
                    gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                }
                blit(velocity.write.fbo);
                velocity.swap();
                // Obstacle damping pass — runs only when collision layers are active.
                if (window.collisionLayers && window.collisionLayers.enabled && obstacle) {
                    obstacleDampProg.bind();
                    gl.uniform1f(obstacleDampProg.uniforms.wallSlip,
                        (typeof config.WALL_SLIP === 'number') ? config.WALL_SLIP : 0.6);
                    gl.uniform2f(obstacleDampProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                    gl.uniform1i(obstacleDampProg.uniforms.uVelocity, 0);
                    gl.uniform1i(obstacleDampProg.uniforms.uObstacle, 1);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                    blit(velocity.write.fbo);
                    velocity.swap();
                }
                // 7. Advect velocity (using now-divergence-free field)
                advectionProg.bind();
                gl.viewport(0, 0, simTexWidth, simTexHeight);
                gl.uniform2f(advectionProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform2f(advectionProg.uniforms.srcTexelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1f(advectionProg.uniforms.dt, dt);
                // Overflow borders (audio scenes / future toggles): same value
                // for the velocity and dye passes below
                gl.uniform1f(advectionProg.uniforms.edgeAbsorb, window.__edgeAbsorb || 0.0);
                gl.uniform1i(advectionProg.uniforms.isDensity, 0);
                gl.uniform1i(advectionProg.uniforms.hasObstacle, 0);
                gl.uniform1i(advectionProg.uniforms.macMode, 0);
                // Swirl NEVER touches the velocity self-advection — the
                // output IS the velocity texture, so any offset here would
                // be written back and compound (dye-only by design).
                gl.uniform1f(advectionProg.uniforms.swirl, 0.0);
                gl.uniform1i(advectionProg.uniforms.uVelocity, 0);
                gl.uniform1i(advectionProg.uniforms.uSource, 0);
                gl.uniform1f(advectionProg.uniforms.dissipation, config.VELOCITY_DISSIPATION);
                // Batched decay (see header): a slider change resets the debt
                // so an accumulated exponent is never applied to a new rate.
                if (config.VELOCITY_DISSIPATION !== lastVelDiss) {
                    lastVelDiss = config.VELOCITY_DISSIPATION;
                    velDecayAccum = 0;
                }
                const _velDecay = computeDecayDt(config.VELOCITY_DISSIPATION, velDecayAccum, dt);
                velDecayAccum = _velDecay.accum;
                gl.uniform1f(advectionProg.uniforms.decayDt, _velDecay.decayDt);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(velocity.write.fbo);
                velocity.swap();
                // 8. Advect density (dye) using the projected velocity
                // (obsActive computed above, before the projection)
                // [MacCormack] Two extra dye-res passes before the main
                // advection: forward SL → error-correct+limit (05b). The main
                // pass then self-fetches the corrected field (macMode=1) and
                // applies decay/drains exactly once, so all the fp16 decay
                // machinery stays in one shader. Gated on the governor's fx
                // gate for now — sheds with post-FX under load (a dedicated
                // ladder rung comes with the multigrid work).
                // Scratch FBOs: `sharpened` and `detailed` are dye-res buffers
                // written+consumed strictly inside the same-frame post-FX
                // chain below, so borrowing them during the sim step adds
                // zero VRAM. If the post-FX pass order ever changes, revisit.
                const macActive = !!config.MACCORMACK &&
                    (window.QualityGovernor ? window.QualityGovernor.fxOn() : true);
                // Swirl clock + strength, identical across all three dye
                // passes (the MacCormack correction is only valid if every
                // pass recomputes the same displacement).
                const _swirl = config.SWIRL || 0.0;
                const _swirlT = (nowMs % 3600000) / 1000;
                gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                if (macActive) {
                    macAdvectProg.bind();
                    gl.uniform2f(macAdvectProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                    gl.uniform2f(macAdvectProg.uniforms.srcTexelSize, 1.0 / dyeTexWidth, 1.0 / dyeTexHeight);
                    gl.uniform1f(macAdvectProg.uniforms.dt, dt);
                    gl.uniform1f(macAdvectProg.uniforms.swirl, _swirl);
                    gl.uniform1f(macAdvectProg.uniforms.swirlTime, _swirlT);
                    gl.uniform1i(macAdvectProg.uniforms.uVelocity, 0);
                    gl.uniform1i(macAdvectProg.uniforms.uSource, 1);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
                    blit(sharpened.fbo); // φ̂ⁿ⁺¹ (forward estimate)
                    macCorrectProg.bind();
                    gl.uniform2f(macCorrectProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                    gl.uniform2f(macCorrectProg.uniforms.srcTexelSize, 1.0 / dyeTexWidth, 1.0 / dyeTexHeight);
                    gl.uniform1f(macCorrectProg.uniforms.dt, dt);
                    gl.uniform1f(macCorrectProg.uniforms.swirl, _swirl);
                    gl.uniform1f(macCorrectProg.uniforms.swirlTime, _swirlT);
                    gl.uniform1i(macCorrectProg.uniforms.hasObstacle, obsActive ? 1 : 0);
                    gl.uniform1i(macCorrectProg.uniforms.uVelocity, 0);
                    gl.uniform1i(macCorrectProg.uniforms.uSource, 1);
                    gl.uniform1i(macCorrectProg.uniforms.uForward, 2);
                    gl.uniform1i(macCorrectProg.uniforms.uObstacle, 3);
                    gl.activeTexture(gl.TEXTURE2);
                    gl.bindTexture(gl.TEXTURE_2D, sharpened.texture);
                    if (obsActive) {
                        gl.activeTexture(gl.TEXTURE3);
                        gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                    }
                    blit(detailed.fbo); // corrected+limited φⁿ⁺¹ (pre-decay)
                    advectionProg.bind();
                }
                gl.uniform1i(advectionProg.uniforms.macMode, macActive ? 1 : 0);
                // macMode self-fetches (coord = vUv) so swirl is moot there,
                // but the plain-SL dye path uses it directly.
                gl.uniform1f(advectionProg.uniforms.swirl, macActive ? 0.0 : _swirl);
                gl.uniform1f(advectionProg.uniforms.swirlTime, _swirlT);
                gl.uniform2f(advectionProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform2f(advectionProg.uniforms.srcTexelSize, 1.0 / dyeTexWidth, 1.0 / dyeTexHeight);
                gl.uniform1i(advectionProg.uniforms.isDensity, 1);
                gl.uniform1i(advectionProg.uniforms.hasObstacle, obsActive ? 1 : 0);
                gl.uniform1i(advectionProg.uniforms.uVelocity, 0);
                gl.uniform1i(advectionProg.uniforms.uSource, 1);
                gl.uniform1i(advectionProg.uniforms.uObstacle, 2);
                gl.uniform1f(advectionProg.uniforms.dissipation, config.DENSITY_DISSIPATION);
                gl.uniform1f(advectionProg.uniforms.bloomCeiling, config.BLOOM_CEILING || 0.0);
                if (config.DENSITY_DISSIPATION !== lastDyeDiss) {
                    lastDyeDiss = config.DENSITY_DISSIPATION;
                    dyeDecayAccum = 0;
                }
                const _dyeDecay = computeDecayDt(config.DENSITY_DISSIPATION, dyeDecayAccum, dt);
                dyeDecayAccum = _dyeDecay.accum;
                gl.uniform1f(advectionProg.uniforms.decayDt, _dyeDecay.decayDt);
                // Explicit freeze flag: the shader must distinguish freeze mode
                // (preserve artwork — no drains) from a user-set density of 1.0
                // (obstacle drain should still clear dye pinned against masks)
                gl.uniform1f(advectionProg.uniforms.frozen, window.__fluidFrozen ? 1.0 : 0.0);
                gl.activeTexture(gl.TEXTURE1);
                // macMode=1: source is the corrected field from the passes
                // above (self-fetched); otherwise the raw dye as before.
                gl.bindTexture(gl.TEXTURE_2D, macActive ? detailed.texture : density.read.texture);
                if (obsActive) {
                    gl.activeTexture(gl.TEXTURE2);
                    gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                }
                blit(density.write.fbo);
                density.swap();
            }
            // Post-FX passes (sharpen, micro-detail, lighting, light shift,
            // sunrays) are full-quad rewrites into persistent FBOs — they must
            // OVERWRITE, never alpha-blend. With blending on, any pass whose
            // shader emits the source's faded alpha (lighting/light shift
            // early-exit and pass-through write color.a, and dye alpha decays
            // to 0 with the dye) keeps the FBO's previous contents wherever
            // alpha is low: the last bright frame stays burned in as a ghost
            // that never fades. Hidden most of the time because sharpen and
            // micro-detail hardcode alpha=1.0 — but exposed whenever those
            // passes are off (sharpness 0, or the governor's fx gate) while
            // light shift or lighting is on.
            gl.disable(gl.BLEND);
            // [GOVERNOR HOOK] post-FX gate (sharpen, micro-detail, sunrays)
            const _fxOn = window.QualityGovernor ? window.QualityGovernor.fxOn() : true;
            // Apply sharpness pass if enabled. RIDGES 0 makes the kernel a
            // mathematical no-op (zero-radius offsets → detail = 0), so skip
            // the whole dye-res pass — sharpening is opt-in via the Ridges
            // slider now (default 0 = the smooth look).
            const sharpnessEnabled = _fxOn && config.SHARPNESS > 0 && (config.RIDGES || 0) > 0;
            let displayTexture = density.read.texture;
            if (sharpnessEnabled) {
                gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                sharpenProg.bind();
                gl.uniform1i(sharpenProg.uniforms.uTexture, 0);
                gl.uniform1i(sharpenProg.uniforms.uVelocity, 1);
                gl.uniform1f(sharpenProg.uniforms.sharpness, config.SHARPNESS);
                gl.uniform2f(sharpenProg.uniforms.texelSize, 1.0 / dyeTexWidth, 1.0 / dyeTexHeight);
                // Kernel radius normalized to the 2048 reference: the sharpen
                // LOOK stays constant when dye resolution changes (boot ascent,
                // governor, battery tiers) — resolution now only affects
                // fidelity, not character. RIDGES > 1 recreates the coarse
                // emboss (the boot-ascent "ridges" look) deliberately.
                gl.uniform1f(sharpenProg.uniforms.kernelScale,
                    (config.RIDGES || 1.0) * (Math.max(dyeTexWidth, dyeTexHeight) / 2048));
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(sharpened.fbo);
                displayTexture = sharpened.texture;
            }
            // Apply micro detail pass if clarity or vibrance is active
            const mdClarity = config.CLARITY || 0;
            const mdVibrance = config.VIBRANCE || 0;
            const microDetailEnabled = _fxOn && (mdClarity > 0 || mdVibrance > 0);
            if (microDetailEnabled) {
                gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                microDetailProg.bind();
                gl.uniform1i(microDetailProg.uniforms.uTexture, 0);
                gl.uniform1i(microDetailProg.uniforms.uVelocity, 1);
                gl.uniform2f(microDetailProg.uniforms.texelSize, 1.0 / dyeTexWidth, 1.0 / dyeTexHeight);
                // 2048-reference kernel normalization (aesthetic-decoupling
                // principle — see sharpen pass above)
                gl.uniform1f(microDetailProg.uniforms.kernelScale,
                    Math.max(dyeTexWidth, dyeTexHeight) / 2048);
                gl.uniform1f(microDetailProg.uniforms.clarity, mdClarity);
                gl.uniform1f(microDetailProg.uniforms.vibrance, mdVibrance);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, displayTexture);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(detailed.fbo);
                displayTexture = detailed.texture;
            }
            // Apply lighting pass if enabled
            const lightingEnabled = window.lightSource && window.lightSource.enabled;
            if (lightingEnabled) {
                gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                lightingProg.bind();
                gl.uniform1i(lightingProg.uniforms.uTexture, 0);
                gl.uniform1i(lightingProg.uniforms.uVelocity, 1);
                gl.uniform2f(lightingProg.uniforms.lightPos, 
                    window.lightSource.x || 0.5, 
                    1.0 - (window.lightSource.y || 0.5)); // Flip Y for GL coords
                gl.uniform1f(lightingProg.uniforms.intensity, window.lightSource.intensity || 0.5);
                gl.uniform1f(lightingProg.uniforms.ambient, window.lightSource.ambient || 0.3);
                gl.uniform2f(lightingProg.uniforms.texelSize, 1.0 / dyeTexWidth, 1.0 / dyeTexHeight);
                // Light Shift uniforms
                const lightShiftEnabled = window.lightShift && window.lightShift.enabled && window.lightShift.colorPath.length > 0;
                gl.uniform1i(lightingProg.uniforms.lightShiftEnabled, lightShiftEnabled ? 1 : 0);
                if (lightShiftEnabled) {
                    const shiftColor = window.lightShift.getCurrentColor();
                    gl.uniform3f(lightingProg.uniforms.lightShiftColor, shiftColor.r, shiftColor.g, shiftColor.b);
                    gl.uniform1f(lightingProg.uniforms.lightShiftThreshold, window.lightShift.threshold || 0.85);
                    gl.uniform1f(lightingProg.uniforms.lightShiftIntensity, window.lightShift.intensity || 0.5);
                    // Blend mode: convert string to int
                    const modeMap = { 'replace': 0, 'tint': 1, 'overlay': 2, 'multiply': 3, 'screen': 4, 'add': 5 };
                    const modeInt = modeMap[window.lightShift.mode] || 0;
                    gl.uniform1i(lightingProg.uniforms.lightShiftMode, modeInt);
                }
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, displayTexture);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(lit.fbo);
                displayTexture = lit.texture;
            }
            // If light shift is enabled but lighting is NOT, apply standalone light shift
            else {
                const lightShiftEnabled = window.lightShift && window.lightShift.enabled && window.lightShift.colorPath.length > 0;
                if (lightShiftEnabled) {
                    gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                    lightShiftProg.bind();
                    gl.uniform1i(lightShiftProg.uniforms.uTexture, 0);
                    const shiftColor = window.lightShift.getCurrentColor();
                    gl.uniform3f(lightShiftProg.uniforms.lightShiftColor, shiftColor.r, shiftColor.g, shiftColor.b);
                    gl.uniform1f(lightShiftProg.uniforms.lightShiftThreshold, window.lightShift.threshold || 0.85);
                    gl.uniform1f(lightShiftProg.uniforms.lightShiftIntensity, window.lightShift.intensity || 0.5);
                    // Blend mode: convert string to int
                    const modeMap = { 'replace': 0, 'tint': 1, 'overlay': 2, 'multiply': 3, 'screen': 4, 'add': 5 };
                    const modeInt = modeMap[window.lightShift.mode] || 0;
                    gl.uniform1i(lightShiftProg.uniforms.lightShiftMode, modeInt);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, displayTexture);
                    blit(lightShifted.fbo);
                    displayTexture = lightShifted.texture;
                }
            }
            // ── Sunrays post-processing ──
            const _sunraysOn = _fxOn && !!config.SUNRAYS; // [GOVERNOR HOOK]
            if (_sunraysOn) {
                applySunrays(displayTexture, sunrays, sunraysTemp);
                blur(sunrays, sunraysTemp, 1);
            }
            gl.disable(gl.BLEND);
            // Shading form field: downsample the frame into the quarter-res
            // shadeForm FBO and blur it — the display shading normals come
            // from this smoothed height field, not the raw dye, so pigment
            // texel noise can't render as relief texture.
            const _shadingOn = (window.displayShading || 0.0) > 0.0 && shadeForm;
            if (_shadingOn) {
                blurProg.bind();
                gl.uniform1i(blurProg.uniforms.uTexture, 0);
                gl.uniform2f(blurProg.uniforms.texelSize, shadeForm.texelSizeX, 0.0);
                gl.viewport(0, 0, shadeForm.width, shadeForm.height);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, displayTexture);
                blit(shadeForm.fbo);
                blur(shadeForm, shadeFormTemp, 1);
            }
            gl.viewport(0, 0, canvas.width, canvas.height);
            displayProg.bind();
            gl.uniform2f(displayProg.uniforms.texelSize, 1.0 / dyeTexWidth, 1.0 / dyeTexHeight);
            gl.uniform1f(displayProg.uniforms.displayShading, window.displayShading || 0.0);
            gl.uniform1f(displayProg.uniforms.shadeInvert, window.displayShadingInvert || 0.0);
            gl.uniform1f(displayProg.uniforms.gateVibrance, (config.BLOOM_CEILING > 0) ? 1.0 : 0.0);
            gl.uniform1i(displayProg.uniforms.uTexture, 0);
            gl.uniform1i(displayProg.uniforms.uSunrays, 1);
            gl.uniform1i(displayProg.uniforms.uShadeForm, 2);
            if (_shadingOn) {
                gl.uniform2f(displayProg.uniforms.shadeTexelSize, shadeForm.texelSizeX, shadeForm.texelSizeY);
            }
            gl.uniform1f(displayProg.uniforms.sunraysEnabled, _sunraysOn ? 1.0 : 0.0);
            gl.uniform1f(displayProg.uniforms.preserveOpacity, window.preserveFluidOpacity ? 1.0 : 0.0);
            gl.uniform1f(displayProg.uniforms.backgroundTransparency, window.backgroundTransparency || 0.0);
            gl.uniform1f(displayProg.uniforms.kaleidoEnabled, window.kaleidoEnabled ? 1.0 : 0.0);
            gl.uniform1f(displayProg.uniforms.segments, (window.kaleidoSegments || 1));
            gl.uniform1i(
                displayProg.uniforms.kMode,
                (typeof window.kaleidoMode === 'number' && isFinite(window.kaleidoMode)) ? window.kaleidoMode : 1
            );
            gl.uniform1f(displayProg.uniforms.kAngle, window.kAngle || 0.0);
            gl.uniform1f(displayProg.uniforms.kTwist, window.kTwist || 0.0);
            gl.uniform1f(displayProg.uniforms.kZoom, window.kZoom || 1.0);
            gl.uniform1f(
                displayProg.uniforms.kBlend,
                (typeof window.kBlend === 'number' && isFinite(window.kBlend)) ? window.kBlend : 1.0
            );
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, displayTexture);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, _sunraysOn ? sunrays.texture : null);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, _shadingOn ? shadeForm.texture : null);
            blit(null);
            // ─── Stats update (ring buffer, zero-GC) ──────────────────
            pushFrameTimestamp(nowMs);
            const fpsVal = countRecentFrames(nowMs);
            const frametimeMs = getLastFrameTime();
            const cpuMs = performance.now() - cpuStart;
            const targetFps = cap > 0 ? cap : displayHz;
            const budgetMs = 1000 / targetFps;
            const budgetPct = Math.min((cpuMs / budgetMs) * 100, 999);
            window.__stats = {
                fps: fpsVal,
                frametime: frametimeMs,
                lastCpuMs: cpuMs,
                targetFps: cap > 0 ? cap : 0,
                displayHz: displayHz,
                budgetPct: budgetPct
            };
            // [GOVERNOR HOOK] feed the adaptive quality governor
            if (window.QualityGovernor) window.QualityGovernor.onFrame(nowMs, cpuMs);
            requestAnimationFrame(update);
        }
