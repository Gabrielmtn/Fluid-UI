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
            const baseRadius = config.SPLAT_RADIUS * (config.STAMP_RADIUS_SCALE || 1);
            // D1 brush tip: only on user strokes (multiSplat sets __brushTipOn
            // for non-exactColor calls) and never while a material mode owns
            // the STAMP_* keys (clay's stamp config stays authoritative).
            // Tips are DYE-ONLY, like the clay stamps — the velocity pass
            // stays gaussian or motion reads as glitch.
            let brushTip = 0;
            if (window.__brushTipOn && !(window.MaterialModes && window.MaterialModes.active())) {
                brushTip = config.BRUSH_TIP | 0;
            }
            splatProg.bind();
            gl.uniform1f(splatProg.uniforms.aspectRatio, aspectRatio);
            gl.uniform2f(splatProg.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
            // Material modes may scale the dab (clay Depth): applies to both the
            // dye footprint and the velocity push so they stay congruent.
            gl.uniform1f(splatProg.uniforms.radius, baseRadius);
            gl.uniform1f(splatProg.uniforms.velocityInfluence, config.VELOCITY_INFLUENCE || 1.2);
            // Clay stamp (material modes): 0 = classic gaussian. Fresh seed per
            // splat so consecutive stamps get distinct notch patterns.
            if (brushTip >= 1 && brushTip <= 3) {
                // Blob/chisel/streak tips reuse the clay stamp machinery:
                // shape from the tip, grain/blend from the Texture slider.
                const tex = (typeof config.BRUSH_TIP_TEXTURE === 'number') ? config.BRUSH_TIP_TEXTURE : 0.7;
                gl.uniform1f(splatProg.uniforms.stampNoise, Math.max(0, Math.min(1, tex)));
                gl.uniform1i(splatProg.uniforms.stampShape, brushTip - 1);
            } else {
                gl.uniform1f(splatProg.uniforms.stampNoise, config.STAMP_NOISE || 0);
                gl.uniform1i(splatProg.uniforms.stampShape, config.STAMP_SHAPE || 0);
            }
            gl.uniform2f(splatProg.uniforms.stampSeed, Math.random() * 19.7, Math.random() * 23.3);
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
            if (brushTip === 4) {
                // Ring tip: thin dye band at ~the gaussian's visible radius
                // (≈√radius in p-space) — dye pass ONLY, so the ring uniform
                // never reinterprets the velocity pass as a radial push.
                gl.uniform1f(splatProg.uniforms.radius, baseRadius * 0.08); // band width²
                gl.uniform1f(splatProg.uniforms.ringRadius, 0.75 * Math.sqrt(baseRadius));
                gl.uniform1f(splatProg.uniforms.ringSquash, 1);
            }
            gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
            blit(density.write.fbo);
            density.swap();
            if (brushTip === 4) gl.uniform1f(splatProg.uniforms.ringRadius, 0); // no leak into the next caller
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
        // ─── D2 sketch stamping (raster layer) ──────────────────────────
        // Normal-control drawing: premultiplied over-composite into the
        // persistent sketch FBO; eraser = destination-out with the same
        // stamp. No kaleido arms, no splat-in/out ramps — a plain
        // draughtsman's brush sharing the Size fader and picker color.
        function stampSketchDab(x, y, pressure) {
            // D2: lazily create the default paint layer on first use (boot,
            // or after the user deleted every raster layer)
            if (!sketch && window.rasterLayers) window.rasterLayers.ensureDefault();
            if (!sketch) return;
            // D6: one undo snapshot per stroke, taken before its first dab
            if (!_sketchStrokeOpen) {
                window.__sketchUndoPush();
                _sketchStrokeOpen = true;
                _strokeKind = 'raster';
            }
            const aspectRatio = canvas.width / canvas.height;
            const p = (typeof pressure === 'number' && pressure > 0) ? pressure : 1;
            const sizeMul = window.BrushEngine ? window.BrushEngine.sizeScale(p) : 1;
            // Pressure response × the Flow slider (matches the fluid route)
            const flowMul = (window.BrushEngine ? window.BrushEngine.flowScale(p) : 1)
                * ((typeof config.BRUSH_FLOW === 'number') ? config.BRUSH_FLOW : 1);
            rasterStampProg.bind();
            gl.uniform2f(rasterStampProg.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
            // 0.5× the fluid footprint: the sketch disc edge sits where the
            // fluid gaussian's visible core ends, so both brushes read as
            // the same Size fader setting.
            gl.uniform1f(rasterStampProg.uniforms.radius,
                config.SPLAT_RADIUS * (config.STAMP_RADIUS_SCALE || 1) * 0.5 * sizeMul * sizeMul);
            gl.uniform1f(rasterStampProg.uniforms.aspectRatio, aspectRatio);
            const c = (window.pointer && window.pointer.color) ? window.pointer.color : [1, 1, 1];
            gl.uniform3f(rasterStampProg.uniforms.color, c[0], c[1], c[2]);
            gl.uniform1f(rasterStampProg.uniforms.flow, flowMul);
            gl.uniform1f(rasterStampProg.uniforms.hardness,
                (typeof config.BRUSH_HARDNESS === 'number') ? config.BRUSH_HARDNESS : 0.8);
            gl.enable(gl.BLEND);
            if (config.BRUSH_ERASER) {
                gl.blendFuncSeparate(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
            } else {
                gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            }
            gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
            blit(sketch.fbo);
            gl.disable(gl.BLEND);
        }
        window.__sketchStamp = stampSketchDab;
        // ─── D3 mask stamping ────────────────────────────────────────────
        // Same draughtsman stamp, but coverage-only (white) into the ACTIVE
        // Mask object's buffer. Eraser carves coverage back out. Shares the
        // undo ring (entries tagged kind:'mask').
        function stampMaskDab(x, y, pressure) {
            const M = window.Masks;
            if (!M) return;
            if (M.activeId() == null) M.ensureDefault();
            const mf = M.getFBO(M.activeId());
            if (!mf) return;
            if (!_sketchStrokeOpen) {
                window.__maskUndoPush();
                _sketchStrokeOpen = true;
                _strokeKind = 'mask';
            }
            const aspectRatio = canvas.width / canvas.height;
            const p = (typeof pressure === 'number' && pressure > 0) ? pressure : 1;
            const sizeMul = window.BrushEngine ? window.BrushEngine.sizeScale(p) : 1;
            const flowMul = (window.BrushEngine ? window.BrushEngine.flowScale(p) : 1)
                * ((typeof config.BRUSH_FLOW === 'number') ? config.BRUSH_FLOW : 1);
            rasterStampProg.bind();
            gl.uniform2f(rasterStampProg.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
            gl.uniform1f(rasterStampProg.uniforms.radius,
                config.SPLAT_RADIUS * (config.STAMP_RADIUS_SCALE || 1) * 0.5 * sizeMul * sizeMul);
            gl.uniform1f(rasterStampProg.uniforms.aspectRatio, aspectRatio);
            gl.uniform3f(rasterStampProg.uniforms.color, 1, 1, 1); // coverage is the alpha
            gl.uniform1f(rasterStampProg.uniforms.flow, flowMul);
            gl.uniform1f(rasterStampProg.uniforms.hardness,
                (typeof config.BRUSH_HARDNESS === 'number') ? config.BRUSH_HARDNESS : 0.8);
            gl.enable(gl.BLEND);
            if (config.BRUSH_ERASER) {
                gl.blendFuncSeparate(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
            } else {
                gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            }
            gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
            blit(mf.fbo);
            gl.disable(gl.BLEND);
        }
        window.__maskStamp = stampMaskDab;
        window.__clearSketch = function () {
            if (!sketch) return;
            window.__sketchUndoPush(); // D6: Clear is undoable
            gl.bindFramebuffer(gl.FRAMEBUFFER, sketch.fbo);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            notifySketchMutated();
        };
        // ─── D2 bridges: sketch ↔ fluid ─────────────────────────────────
        // Ignite: pour the sketch into the fluid as dye (one-shot; the sim's
        // velocity field takes it from there). Mutates DYE, not sketch — no
        // undo snapshot.
        window.__igniteSketch = function (gain) {
            if (!sketch || !density) return;
            igniteProg.bind();
            gl.disable(gl.BLEND);
            gl.uniform1i(igniteProg.uniforms.uDye, 0);
            gl.uniform1i(igniteProg.uniforms.uSketch, 1);
            gl.uniform1f(igniteProg.uniforms.gain, (typeof gain === 'number' && gain > 0) ? gain : 1);
            gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, sketch.texture);
            blit(density.write.fbo);
            density.swap();
            gl.activeTexture(gl.TEXTURE0);
        };
        // Capture: freeze the current fluid dye into the sketch layer —
        // over-composited (captureFrag emits premultiplied color with
        // alpha = max channel), so existing sketch content shows through
        // where the dye is faint. Folds in the old Capture Layer idea at
        // the raster level.
        window.__captureToSketch = function () {
            if (!sketch || !density) return;
            window.__sketchUndoPush(); // D6: Capture mutates the sketch
            captureProg.bind();
            gl.uniform1i(captureProg.uniforms.uDye, 0);
            gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            blit(sketch.fbo);
            gl.disable(gl.BLEND);
            notifySketchMutated();
        };
        // ─── D6 slice 1: sketch stroke undo/redo ────────────────────────
        // GPU snapshot ring: one RGBA8 dye-res copy per mutating op (stroke
        // start / Clear / Capture), bounded depth, FBOs pooled + lazily
        // (re)created so resolution changes just invalidate pool entries.
        // Restoring an old-res snapshot into a new-res sketch rescales via
        // the normalized-UV copy — acceptable for undo.
        const SKETCH_UNDO_DEPTH = 6;
        const sketchUndoStack = [];
        const sketchRedoStack = [];
        const sketchSnapPool = [];
        let _sketchStrokeOpen = false;
        let _strokeKind = 'raster'; // which route opened the current stroke
        // Fired on every raster-layer mutation (stroke end / Clear / Capture
        // / undo / redo) — 23-depth-collision listens for the live collider
        // binding, rasterLayers (05l) for panel thumbnails; cheap no-op
        // otherwise. rid = the mutated layer's index (defaults to active).
        function notifySketchMutated(rid) {
            if (rid == null && window.rasterLayers) rid = window.rasterLayers.activeId();
            if (typeof window.__onSketchMutated === 'function') window.__onSketchMutated(rid);
            if (typeof window.__onRasterMutated === 'function') window.__onRasterMutated(rid);
        }
        // D3: mask mutations get their own listener channel (thumbnail-less,
        // but the live collider binding cares).
        function notifyMaskMutated(mid) {
            if (mid == null && window.Masks) mid = window.Masks.activeId();
            if (typeof window.__onMaskMutated === 'function') window.__onMaskMutated(mid);
        }
        // Resolve an undo entry's target FBO — the entry's own surface, so
        // undo restores the layer/mask it was recorded on even if the user
        // has since switched targets. null = surface was deleted.
        function _targetFboFor(kind, id) {
            if (kind === 'mask') return (window.Masks && window.Masks.getFBO(id)) || null;
            if (id == null) return sketch;
            return (window.rasterLayers && window.rasterLayers.getFBO(id)) || null;
        }
        window.__sketchStrokeEnd = function () {
            if (!_sketchStrokeOpen) return;
            _sketchStrokeOpen = false;
            if (_strokeKind === 'mask') notifyMaskMutated();
            else notifySketchMutated();
        };
        function copySketchTex(srcTex, dstFbo, w, h) {
            clearProg.bind();
            gl.disable(gl.BLEND);
            gl.uniform1i(clearProg.uniforms.uTexture, 0);
            gl.uniform1f(clearProg.uniforms.value, 1.0);
            gl.uniform1f(clearProg.uniforms.softClamp, 0.0); // plain copy, no valve
            gl.viewport(0, 0, w, h);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, srcTex);
            blit(dstFbo);
        }
        function takeSketchSnapshot(src) {
            let snap = sketchSnapPool.pop();
            if (snap && (snap.w !== dyeTexWidth || snap.h !== dyeTexHeight)) {
                gl.deleteTexture(snap.texture);
                gl.deleteFramebuffer(snap.fbo);
                snap = null;
            }
            if (!snap) {
                snap = createFBO(dyeTexWidth, dyeTexHeight, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
                snap.w = dyeTexWidth;
                snap.h = dyeTexHeight;
            }
            copySketchTex((src || sketch).texture, snap.fbo, snap.w, snap.h);
            return snap;
        }
        // One Krita-style global ring across all paint surfaces: entries are
        // tagged {kind:'raster'|'mask', id}; undo restores whichever surface
        // the mutation happened on.
        function _pushEntry(kind, id, srcFbo) {
            sketchUndoStack.push({ snap: takeSketchSnapshot(srcFbo), kind: kind, id: id });
            if (sketchUndoStack.length > SKETCH_UNDO_DEPTH) sketchSnapPool.push(sketchUndoStack.shift().snap);
            while (sketchRedoStack.length) sketchSnapPool.push(sketchRedoStack.pop().snap);
        }
        window.__sketchUndoPush = function () {
            if (!sketch) return;
            _pushEntry('raster', window.rasterLayers ? window.rasterLayers.activeId() : null, sketch);
        };
        window.__maskUndoPush = function () {
            const M = window.Masks;
            if (!M) return;
            const mid = M.activeId();
            const mf = M.getFBO(mid);
            if (mf) _pushEntry('mask', mid, mf);
        };
        function _applyHistory(fromStack, toStack) {
            while (fromStack.length) {
                const entry = fromStack.pop();
                const target = _targetFboFor(entry.kind, entry.id);
                if (!target) { sketchSnapPool.push(entry.snap); continue; } // surface deleted — skip entry
                toStack.push({ snap: takeSketchSnapshot(target), kind: entry.kind, id: entry.id });
                copySketchTex(entry.snap.texture, target.fbo, dyeTexWidth, dyeTexHeight);
                sketchSnapPool.push(entry.snap);
                if (entry.kind === 'mask') notifyMaskMutated(entry.id);
                else notifySketchMutated(entry.id);
                return;
            }
        }
        window.__sketchUndo = function () { _applyHistory(sketchUndoStack, sketchRedoStack); };
        window.__sketchRedo = function () { _applyHistory(sketchRedoStack, sketchUndoStack); };
        // Drop history entries for a deleted surface (their snapshots go
        // back to the pool; the surface's pixels are gone).
        window.__sketchUndoPurge = function (id, kind) {
            kind = kind || 'raster';
            for (let i = sketchUndoStack.length - 1; i >= 0; i--) {
                if (sketchUndoStack[i].id === id && sketchUndoStack[i].kind === kind) sketchSnapPool.push(sketchUndoStack.splice(i, 1)[0].snap);
            }
            for (let i = sketchRedoStack.length - 1; i >= 0; i--) {
                if (sketchRedoStack[i].id === id && sketchRedoStack[i].kind === kind) sketchSnapPool.push(sketchRedoStack.splice(i, 1)[0].snap);
            }
        };
        window.__sketchUndoDepths = function () {
            return { undo: sketchUndoStack.length, redo: sketchRedoStack.length, pool: sketchSnapPool.length };
        };
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
