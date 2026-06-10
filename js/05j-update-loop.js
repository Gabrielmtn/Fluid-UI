// ═══════════════════════════════════════════════════════════════════
// js/05j-update-loop.js — part 10/14 of former 05-fluid-sim.js (lines 3120–3489)
// LOAD ORDER: after 05i-sim-stats.js, before 05k-layers-render.js
// PROVIDES: update() main loop (physics passes, post-FX, display, stats, governor feed)
// REQUIRES: everything above; renderLayers NOT needed at load
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
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
            if (canvas.width !== targetWidth || canvas.height !== targetHeight || window.needsFramebufferReinit) {
                // console.log('[RESIZE]', 'canvas:', canvas.width, 'x', canvas.height, '→ target:', targetWidth, 'x', targetHeight);
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                // Lock CSS to explicit pixels (matches updateCanvasSize behavior).
                // Without this, the CSS '100%' sizing can cause compositor differences
                // in Electron's transparent window mode.
                canvas.style.width = targetWidth + 'px';
                canvas.style.height = targetHeight + 'px';
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
                    const inMult = getSplatInMult();
                    const savedR = config.SPLAT_RADIUS;
                    config.SPLAT_RADIUS = savedR * inMult;
                    multiSplat(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color, false);
                    config.SPLAT_RADIUS = savedR;
                    pushStrokeEvent(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
                    pointer.moved = false;
                }
                // Splat-out: continue splatting with decaying radius after release
                if (splatOutActive) {
                    const outMult = getSplatOutMult();
                    if (outMult <= 0.001) {
                        splatOutActive = false;
                        if (pendingArmAdvance) {
                            advanceArmColors();
                            pendingArmAdvance = false;
                        }
                    } else {
                        multiSplatWithRadius(splatOutX, splatOutY, splatOutDx * 0.9, splatOutDy * 0.9, splatOutColor, config.SPLAT_RADIUS * outMult);
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
                // 1. Curl / Turbulence computation
                const useTurbulence = window.useTurbulenceMode || false;
                const curlProgram = useTurbulence ? turbulenceProg : curlProg;
                curlProgram.bind();
                gl.uniform2f(curlProgram.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1i(curlProgram.uniforms.uVelocity, 0);
                if (useTurbulence) {
                    gl.uniform1f(curlProgram.uniforms.time, performance.now() * 0.001);
                }
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
                // 3. Divergence
                divergenceProg.bind();
                gl.uniform2f(divergenceProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1i(divergenceProg.uniforms.uVelocity, 0);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(divergence.fbo);
                // 4. Clear pressure (decay previous frame's pressure field)
                clearProg.bind();
                gl.uniform1i(clearProg.uniforms.uTexture, 0);
                gl.uniform1f(clearProg.uniforms.value, config.PRESSURE_DISSIPATION);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
                blit(pressure.write.fbo);
                pressure.swap();
                // 5. Pressure solve (Jacobi iterations)
                pressureProg.bind();
                gl.uniform2f(pressureProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1i(pressureProg.uniforms.uDivergence, 0);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, divergence.texture);
                // [GOVERNOR HOOK] effective iteration count (config untouched)
                const _pIters = window.QualityGovernor
                    ? window.QualityGovernor.effIters(config.PRESSURE_ITERATIONS)
                    : config.PRESSURE_ITERATIONS;
                for (let i = 0; i < _pIters; i++) {
                    gl.uniform1i(pressureProg.uniforms.uPressure, 1);
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
                    blit(pressure.write.fbo);
                    pressure.swap();
                }
                // 6. Gradient subtract → divergence-free velocity
                gradientProg.bind();
                gl.uniform2f(gradientProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1i(gradientProg.uniforms.uPressure, 0);
                gl.uniform1i(gradientProg.uniforms.uVelocity, 1);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(velocity.write.fbo);
                velocity.swap();
                // Obstacle damping pass — runs only when collision layers are active.
                if (window.collisionLayers && window.collisionLayers.enabled && obstacle) {
                    obstacleDampProg.bind();
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
                gl.uniform1f(advectionProg.uniforms.dt, dt);
                gl.uniform1i(advectionProg.uniforms.isDensity, 0);
                gl.uniform1i(advectionProg.uniforms.hasObstacle, 0);
                gl.uniform1i(advectionProg.uniforms.uVelocity, 0);
                gl.uniform1i(advectionProg.uniforms.uSource, 0);
                gl.uniform1f(advectionProg.uniforms.dissipation, config.VELOCITY_DISSIPATION);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(velocity.write.fbo);
                velocity.swap();
                // 8. Advect density (dye) using the projected velocity
                const obsActive = !!(window.collisionLayers && window.collisionLayers.enabled && obstacle);
                gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                gl.uniform2f(advectionProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1i(advectionProg.uniforms.isDensity, 1);
                gl.uniform1i(advectionProg.uniforms.hasObstacle, obsActive ? 1 : 0);
                gl.uniform1i(advectionProg.uniforms.uVelocity, 0);
                gl.uniform1i(advectionProg.uniforms.uSource, 1);
                gl.uniform1i(advectionProg.uniforms.uObstacle, 2);
                gl.uniform1f(advectionProg.uniforms.dissipation, config.DENSITY_DISSIPATION);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
                if (obsActive) {
                    gl.activeTexture(gl.TEXTURE2);
                    gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                }
                blit(density.write.fbo);
                density.swap();
                // Re-enable blend for post-processing and display passes
                gl.enable(gl.BLEND);
            }
            // [GOVERNOR HOOK] post-FX gate (sharpen, micro-detail, sunrays)
            const _fxOn = window.QualityGovernor ? window.QualityGovernor.fxOn() : true;
            // Apply sharpness pass if enabled (config.SHARPNESS > 0)
            const sharpnessEnabled = _fxOn && config.SHARPNESS > 0;
            let displayTexture = density.read.texture;
            if (sharpnessEnabled) {
                gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                sharpenProg.bind();
                gl.uniform1i(sharpenProg.uniforms.uTexture, 0);
                gl.uniform1i(sharpenProg.uniforms.uVelocity, 1);
                gl.uniform1f(sharpenProg.uniforms.sharpness, config.SHARPNESS);
                gl.uniform2f(sharpenProg.uniforms.texelSize, 1.0 / dyeTexWidth, 1.0 / dyeTexHeight);
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
            // ── Spin (Balatro) — exclusive display mode, skips fluid displayProg ──
            if (window.spinEffect && window.spinEffect.enabled) {
                const se = window.spinEffect;
                gl.viewport(0, 0, canvas.width, canvas.height);
                spinProg.bind();
                gl.uniform2f(spinProg.uniforms.uResolution, canvas.width, canvas.height);
                gl.uniform1f(spinProg.uniforms.uTime,         performance.now() * 0.001);
                gl.uniform1f(spinProg.uniforms.uSpinRotation, se.spinRotation !== undefined ? se.spinRotation : -2.0);
                gl.uniform1f(spinProg.uniforms.uSpinSpeed,    se.spinSpeed    !== undefined ? se.spinSpeed    :  7.0);
                gl.uniform1f(spinProg.uniforms.uContrast,     se.contrast     !== undefined ? se.contrast     :  3.5);
                gl.uniform1f(spinProg.uniforms.uLighting,     se.lighting     !== undefined ? se.lighting     :  0.4);
                gl.uniform1f(spinProg.uniforms.uSpinAmount,   se.spinAmount   !== undefined ? se.spinAmount   :  0.25);
                gl.uniform1f(spinProg.uniforms.uPixelFilter,  se.pixelFilter  !== undefined ? se.pixelFilter  :  745.0);
                gl.uniform1f(spinProg.uniforms.uSpinEase,     se.spinEase     !== undefined ? se.spinEase     :  1.0);
                gl.uniform1f(spinProg.uniforms.uOpacity,      se.opacity      !== undefined ? se.opacity      :  1.0);
                const c1 = se.colour1 || [0.871, 0.267, 0.231, 1.0];
                const c2 = se.colour2 || [0.0,   0.42,  0.706, 1.0];
                const c3 = se.colour3 || [0.086, 0.137, 0.145, 1.0];
                gl.uniform4f(spinProg.uniforms.uColour1, c1[0], c1[1], c1[2], 1.0);
                gl.uniform4f(spinProg.uniforms.uColour2, c2[0], c2[1], c2[2], 1.0);
                gl.uniform4f(spinProg.uniforms.uColour3, c3[0], c3[1], c3[2], 1.0);
                blit(null);
            } else {
            gl.viewport(0, 0, canvas.width, canvas.height);
            displayProg.bind();
            gl.uniform2f(displayProg.uniforms.texelSize, 1.0 / dyeTexWidth, 1.0 / dyeTexHeight);
            gl.uniform1f(displayProg.uniforms.displayShading, window.displayShading || 0.0);
            gl.uniform1i(displayProg.uniforms.uTexture, 0);
            gl.uniform1i(displayProg.uniforms.uSunrays, 1);
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
            blit(null);
            }
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
