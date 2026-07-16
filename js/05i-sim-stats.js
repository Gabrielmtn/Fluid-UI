// ═══════════════════════════════════════════════════════════════════
// js/05i-sim-stats.js — part 9/14 of former 05-fluid-sim.js (lines 2942–3119)
// LOAD ORDER: after 05h-slider-bindings.js, before 05j-update-loop.js
// PROVIDES: splat(), FPS ring buffer, displayHz detection, window.__stats seed, applySunrays, blur
// REQUIRES: splatProg/blurProg (05c), gl (04)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        function splat(x, y, dx, dy, color) {
            const aspectRatio = canvas.width / canvas.height;
            splatProg.bind();
            gl.uniform1f(splatProg.uniforms.aspectRatio, aspectRatio);
            gl.uniform2f(splatProg.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
            // Material modes may scale the dab (clay Depth): applies to both the
            // dye footprint and the velocity push so they stay congruent.
            gl.uniform1f(splatProg.uniforms.radius, config.SPLAT_RADIUS * (config.STAMP_RADIUS_SCALE || 1));
            gl.uniform1f(splatProg.uniforms.velocityInfluence, config.VELOCITY_INFLUENCE || 1.2);
            // Clay stamp (material modes): 0 = classic gaussian. Fresh seed per
            // splat so consecutive stamps get distinct notch patterns.
            gl.uniform1f(splatProg.uniforms.stampNoise, config.STAMP_NOISE || 0);
            gl.uniform2f(splatProg.uniforms.stampSeed, Math.random() * 19.7, Math.random() * 23.3);
            gl.uniform1i(splatProg.uniforms.stampShape, config.STAMP_SHAPE || 0);
            gl.uniform1f(splatProg.uniforms.ringRadius, 0); // classic blob — never inherit a stale ring stamp
            gl.uniform1f(splatProg.uniforms.barHalfW, 0);   // ...or a stale bar stamp
            gl.uniform1i(splatProg.uniforms.gateColor, config.COLOR_GATE ? 1 : 0);
            // Block injection inside collision masks (prevents burned-in dye)
            const _splatObsActive = !!(window.collisionLayers && window.collisionLayers.enabled && obstacle);
            gl.uniform1i(splatProg.uniforms.hasObstacle, _splatObsActive ? 1 : 0);
            if (_splatObsActive) {
                gl.uniform1f(splatProg.uniforms.uObsMax, window.__obsStrengthMax || 0.7);
                gl.uniform1i(splatProg.uniforms.uObstacle, 1);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
            }
            // Write velocity at physics resolution (with isolation applied)
            gl.viewport(0, 0, simTexWidth, simTexHeight);
            gl.uniform1i(splatProg.uniforms.isVelocity, 1); // Velocity pass
            gl.uniform1i(splatProg.uniforms.uTarget, 0);
            gl.uniform3f(splatProg.uniforms.color, dx, -dy, 1.0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
            blit(velocity.write.fbo);
            velocity.swap();
            // Write density at dye resolution (full radius for visual quality)
            gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
            gl.uniform1i(splatProg.uniforms.isVelocity, 0); // Density pass
            gl.uniform1i(splatProg.uniforms.uTarget, 0);
            gl.uniform3fv(splatProg.uniforms.color, color);
            gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
            blit(density.write.fbo);
            density.swap();
        }
        // Ring-band splat: paints a thin elliptical band of dye and pushes it
        // radially in ONE velocity+dye pass (vs stamping dozens of dots along
        // the circle). Used by the Tunnel audio scene's solid-ring mode.
        //   cx/cy/ringRadiusPx — canvas pixels; thickness — SPLAT_RADIUS units
        //   (gaussian width² of the band); radialSpeed >0 pushes outward,
        //   <0 toward the center; squash <1 flattens the ellipse vertically.
        function ringSplat(cx, cy, ringRadiusPx, thickness, radialSpeed, swirl, squash, color) {
            const aspectRatio = canvas.width / canvas.height;
            splatProg.bind();
            gl.uniform1f(splatProg.uniforms.aspectRatio, aspectRatio);
            gl.uniform2f(splatProg.uniforms.point, cx / canvas.width, 1.0 - cy / canvas.height);
            gl.uniform1f(splatProg.uniforms.radius, thickness);
            // p-space distances are canvas-height-normalized (p.x carries the
            // aspect correction), so pixels convert via /canvas.height
            gl.uniform1f(splatProg.uniforms.ringRadius, ringRadiusPx / canvas.height);
            gl.uniform1f(splatProg.uniforms.ringSquash, squash || 1);
            gl.uniform1f(splatProg.uniforms.velocityInfluence, config.VELOCITY_INFLUENCE || 1.2);
            gl.uniform1f(splatProg.uniforms.stampNoise, 0);
            gl.uniform1i(splatProg.uniforms.stampShape, 0);
            gl.uniform1i(splatProg.uniforms.gateColor, config.COLOR_GATE ? 1 : 0);
            const _ringObsActive = !!(window.collisionLayers && window.collisionLayers.enabled && obstacle);
            gl.uniform1i(splatProg.uniforms.hasObstacle, _ringObsActive ? 1 : 0);
            if (_ringObsActive) {
                gl.uniform1f(splatProg.uniforms.uObsMax, window.__obsStrengthMax || 0.7);
                gl.uniform1i(splatProg.uniforms.uObstacle, 1);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
            }
            // Velocity: color.x = signed radial speed, color.y = tangential swirl
            gl.viewport(0, 0, simTexWidth, simTexHeight);
            gl.uniform1i(splatProg.uniforms.isVelocity, 1);
            gl.uniform1i(splatProg.uniforms.uTarget, 0);
            gl.uniform3f(splatProg.uniforms.color, radialSpeed, swirl || 0, 1.0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
            blit(velocity.write.fbo);
            velocity.swap();
            // Dye: the visible thin band
            gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
            gl.uniform1i(splatProg.uniforms.isVelocity, 0);
            gl.uniform3fv(splatProg.uniforms.color, color);
            gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
            blit(density.write.fbo);
            density.swap();
            gl.uniform1f(splatProg.uniforms.ringRadius, 0); // belt-and-braces: no leak into classic splats
        }
        window.applyRingSplat = ringSplat;
        // Bar-slab splat: a crisp lane-wide horizontal slab of dye + velocity
        // in one pass — the EQ scene's per-lane paint, shaped like the lane
        // itself instead of a round blob bleeding over the walls.
        //   cx/cy/halfWidthPx/pointPx — canvas pixels; thickness — SPLAT_RADIUS
        //   units (gaussian width² of the slab's vertical profile); pointPx
        //   lifts the stamp's centerline into a pointed arch (0 = flat slab).
        function barSplat(cx, cy, halfWidthPx, thickness, pointPx, dx, dy, color) {
            const aspectRatio = canvas.width / canvas.height;
            splatProg.bind();
            gl.uniform1f(splatProg.uniforms.aspectRatio, aspectRatio);
            gl.uniform2f(splatProg.uniforms.point, cx / canvas.width, 1.0 - cy / canvas.height);
            gl.uniform1f(splatProg.uniforms.radius, thickness);
            gl.uniform1f(splatProg.uniforms.barHalfW, halfWidthPx / canvas.height); // p-space is height-normalized
            gl.uniform1f(splatProg.uniforms.barPoint, (pointPx || 0) / canvas.height);
            gl.uniform1f(splatProg.uniforms.ringRadius, 0);
            gl.uniform1f(splatProg.uniforms.velocityInfluence, config.VELOCITY_INFLUENCE || 1.2);
            gl.uniform1f(splatProg.uniforms.stampNoise, 0);
            gl.uniform1i(splatProg.uniforms.stampShape, 0);
            gl.uniform1i(splatProg.uniforms.gateColor, config.COLOR_GATE ? 1 : 0);
            const _barObsActive = !!(window.collisionLayers && window.collisionLayers.enabled && obstacle);
            gl.uniform1i(splatProg.uniforms.hasObstacle, _barObsActive ? 1 : 0);
            if (_barObsActive) {
                gl.uniform1f(splatProg.uniforms.uObsMax, window.__obsStrengthMax || 0.7);
                gl.uniform1i(splatProg.uniforms.uObstacle, 1);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
            }
            gl.viewport(0, 0, simTexWidth, simTexHeight);
            gl.uniform1i(splatProg.uniforms.isVelocity, 1);
            gl.uniform1i(splatProg.uniforms.uTarget, 0);
            gl.uniform3f(splatProg.uniforms.color, dx, -dy, 1.0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
            blit(velocity.write.fbo);
            velocity.swap();
            gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
            gl.uniform1i(splatProg.uniforms.isVelocity, 0);
            gl.uniform3fv(splatProg.uniforms.color, color);
            gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
            blit(density.write.fbo);
            density.swap();
            gl.uniform1f(splatProg.uniforms.barHalfW, 0); // no leak into classic splats
        }
        window.applyBarSplat = barSplat;
        let lastTime = performance.now();
        let lastDrawTimeMs = 0;
        // ─── FPS Ring Buffer (zero-GC) ────────────────────────────────
        const FPS_RING_SIZE = 360;
        const fpsRing = new Float64Array(FPS_RING_SIZE);
        let fpsRingHead = 0;
        let fpsRingCount = 0;
        function pushFrameTimestamp(ms) {
            fpsRing[fpsRingHead] = ms;
            fpsRingHead = (fpsRingHead + 1) % FPS_RING_SIZE;
            if (fpsRingCount < FPS_RING_SIZE) fpsRingCount++;
        }
        function countRecentFrames(nowMs) {
            const cutoff = nowMs - 1000;
            let count = 0;
            for (let i = 0; i < fpsRingCount; i++) {
                const idx = (fpsRingHead - 1 - i + FPS_RING_SIZE) % FPS_RING_SIZE;
                if (fpsRing[idx] >= cutoff) count++;
                else break;
            }
            return count;
        }
        function getLastFrameTime() {
            if (fpsRingCount < 2) return 0;
            const curr = (fpsRingHead - 1 + FPS_RING_SIZE) % FPS_RING_SIZE;
            const prev = (fpsRingHead - 2 + FPS_RING_SIZE) % FPS_RING_SIZE;
            return fpsRing[curr] - fpsRing[prev];
        }
        // ─── Display Refresh Rate Detection ───────────────────────────
        // Primary: Electron screen API (reads OS-reported displayFrequency)
        // Fallback: rAF interval measurement for non-Electron environments
        let displayHz = 60;
        let displayHzDetected = false;
        window.__displayHz = 60;
        function detectDisplayHzElectron() {
            try {
                const remote = require('@electron/remote');
                if (remote && remote.screen) {
                    const win = remote.getCurrentWindow();
                    const bounds = win.getBounds();
                    const display = remote.screen.getDisplayMatching(bounds);
                    if (display && display.displayFrequency > 0) {
                        const reportedHz = display.displayFrequency;
                        // IMPORTANT: Electron often reports 60Hz even on high-refresh monitors
                        // Only trust values > 60, otherwise let rAF fallback verify
                        if (reportedHz > 60) {
                            displayHz = reportedHz;
                            displayHzDetected = true;
                            window.__displayHz = reportedHz;
                            console.log('[Display Hz] Electron API: ' + reportedHz + 'Hz');
                            return true;
                        } else {
                            // Don't trust 60Hz - let rAF verify
                            console.log('[Display Hz] Electron reports ' + reportedHz + 'Hz, verifying with rAF...');
                            return false;
                        }
                    }
                }
            } catch (e) {
                // Not in Electron or remote not available
            }
            return false;
        }
        // Try Electron API immediately
        if (!detectDisplayHzElectron()) {
            console.log('[Display Hz] Using rAF measurement for accurate detection');
        }
        // Re-detect when window moves (different monitor = different Hz)
        window.addEventListener('resize', function() {
            if (detectDisplayHzElectron()) {
                // Update stats and FPS cap native label
                if (window.__onDisplayHzChanged) window.__onDisplayHzChanged(displayHz);
            }
        });
        // rAF fallback for non-Electron environments
        const rafSamples = [];
        let lastRafMs = 0;
        let rafCallCount = 0;
        function detectDisplayHz(nowMs) {
            if (displayHzDetected) return;
            rafCallCount++;
            // Skip first 90 frames (warmup: shader compile, FBO creation, DOM restructuring)
            if (rafCallCount <= 90) {
                lastRafMs = nowMs;
                return;
            }
            if (lastRafMs > 0) {
                const dt = nowMs - lastRafMs;
                if (dt > 1 && dt < 50) {
                    rafSamples.push(dt);
                }
            }
            lastRafMs = nowMs;
            if (rafSamples.length >= 60) {
                displayHzDetected = true;
                const sorted = rafSamples.slice().sort((a, b) => a - b);
                const q1 = Math.floor(sorted.length * 0.25);
                const q3 = Math.ceil(sorted.length * 0.75);
                let sum = 0, count = 0;
                for (let i = q1; i < q3; i++) { sum += sorted[i]; count++; }
                const avgMs = sum / count;
                const raw = Math.round(1000 / avgMs);
                const standards = [30, 48, 60, 72, 75, 90, 100, 120, 144, 165, 180, 200, 240, 360];
                let closest = 60, minDiff = Infinity;
                for (let i = 0; i < standards.length; i++) {
                    const d = Math.abs(raw - standards[i]);
                    if (d < minDiff) { minDiff = d; closest = standards[i]; }
                }
                displayHz = closest;
                window.__displayHz = closest;
                console.log('[Display Hz] rAF fallback: ' + closest + 'Hz (raw=' + raw + ', avgMs=' + avgMs.toFixed(2) + ')');
                if (window.__onDisplayHzChanged) window.__onDisplayHzChanged(displayHz);
            }
        }
        // DEFAULT to 60 FPS, not uncapped!
        window.fpsCap = (typeof window.fpsCap === 'number' && window.fpsCap > 0) ? window.fpsCap : 60;
        window.__stats = { fps: 0, frametime: 0, lastCpuMs: 0, targetFps: 60, displayHz: displayHz, budgetPct: 0 };
        function applySunrays(source, dest, temp) {
            // Create mask from source
            gl.disable(gl.BLEND);
            sunraysMaskProg.bind();
            gl.uniform1i(sunraysMaskProg.uniforms.uTexture, 0);
            gl.viewport(0, 0, dest.width, dest.height);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, source);
            blit(temp.fbo);
            // Apply radial blur
            sunraysProg.bind();
            gl.uniform1i(sunraysProg.uniforms.uTexture, 0);
            // Guard against an undefined/NaN weight (e.g. a preset that enables
            // SUNRAYS without a weight): NaN here propagates through the sunrays
            // texture and displayFrag's `color *= sr`, blacking out the canvas.
            gl.uniform1f(sunraysProg.uniforms.weight, config.SUNRAYS_WEIGHT != null ? config.SUNRAYS_WEIGHT : 0.5);
            gl.viewport(0, 0, dest.width, dest.height);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, temp.texture);
            blit(dest.fbo);
        }
        function blur(target, temp, iterations) {
            blurProg.bind();
            gl.uniform1i(blurProg.uniforms.uTexture, 0);
            for (let i = 0; i < iterations; i++) {
                // Horizontal pass
                gl.uniform2f(blurProg.uniforms.texelSize, target.texelSizeX, 0.0);
                gl.viewport(0, 0, temp.width, temp.height);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, target.texture);
                blit(temp.fbo);
                // Vertical pass
                gl.uniform2f(blurProg.uniforms.texelSize, 0.0, target.texelSizeY);
                gl.viewport(0, 0, target.width, target.height);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, temp.texture);
                blit(target.fbo);
            }
        }
