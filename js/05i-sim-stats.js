// ═══════════════════════════════════════════════════════════════════
// js/05i-sim-stats.js — part 9/14 of former 05-fluid-sim.js (lines 2942–3119)
// LOAD ORDER: after 05h-slider-bindings.js, before 05j-update-loop.js
// PROVIDES: splat(), FPS ring buffer, displayHz detection, window.__stats seed, applyGlow, blur
// REQUIRES: splatProg/blurProg (05c), gl (04)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        // ── Splat scissor ─────────────────────────────────────────────────
        // blit() fills the WHOLE target, but a dab's true support is tiny:
        // every stamp shape in splatFrag lives inside ~2.6·√radius of p-space,
        // and the gaussian tail is below half of fp16's smallest subnormal
        // beyond ~4.5·√radius — the discarded contribution rounds to zero in
        // the fullscreen path anyway, so clipping at K=6 is bit-identical
        // (measured: dye exact after 50 sim frames; velocity ≤1 fp16 ulp).
        // Without this, every dab repaints all of the dye texture (4.2M px at
        // 2048), and the D1 dab train × kaleido arms multiplies it — the
        // "painting slows the fluid" cost. Scissor the draw to the dab's
        // bounding box and region-copy write→read instead of swapping, so
        // per-dab cost scales with brush size, not texture size.
        // Console: config.SPLAT_SCISSOR=false reverts to fullscreen passes.
        function splatScissorRect(u, v, dHalf, aspectRatio, W, H) {
            const hx = dHalf / Math.max(aspectRatio, 1e-6); // p.x carries the aspect scale
            const x0 = Math.max(0, Math.floor((u - hx) * W) - 2);
            const x1 = Math.min(W, Math.ceil((u + hx) * W) + 2);
            const y0 = Math.max(0, Math.floor((v - dHalf) * H) - 2);
            const y1 = Math.min(H, Math.ceil((v + dHalf) * H) + 2);
            if (x1 <= x0 || y1 <= y0) return null;            // fully off-target
            // Above ~half the texture the scissored draw + region copy costs
            // more than one classic fullscreen pass — fall back to it.
            if ((x1 - x0) * (y1 - y0) >= 0.5 * W * H) return 'full';
            return [x0, y0, x1 - x0, y1 - y0];
        }
        // One splat pass against a double-FBO: scissored draw into .write,
        // then blitFramebuffer the rect back into .read (NO swap — .read stays
        // the canonical texture, and the untouched area never needs copying).
        // rect 'full' falls back to the classic fullscreen blit+swap; rect
        // null skips the pass (an off-target dab contributes nothing).
        function splatPass(pair, W, H, rect) {
            if (rect === null) return;
            if (rect === 'full') { blit(pair.write.fbo); pair.swap(); return; }
            gl.enable(gl.SCISSOR_TEST);
            gl.scissor(rect[0], rect[1], rect[2], rect[3]);
            blit(pair.write.fbo);
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, pair.write.fbo);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, pair.read.fbo);
            gl.blitFramebuffer(rect[0], rect[1], rect[0] + rect[2], rect[1] + rect[3],
                               rect[0], rect[1], rect[0] + rect[2], rect[1] + rect[3],
                               gl.COLOR_BUFFER_BIT, gl.NEAREST);
            gl.disable(gl.SCISSOR_TEST);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        function splat(x, y, dx, dy, color) {
            // Hold this dab while a selected brush shape's stamp is still
            // uploading (2026-08-18). The custom-shape block below only fires
            // once the texture is ready; until then the dab falls through to
            // the built-in BRUSH_TIP underneath the shape — and that tip is
            // whatever was last picked, so a shape sitting on top of Chisel
            // printed a hard SQUARE for the frame or two after an import, an
            // edit or a reload, with the swatch already showing the shape.
            // Dropping those dabs is the right trade: the wait is a frame or
            // two, and the alternative is a wrong footprint burned into the
            // canvas. Peer strokes and replay are exempt (__remoteStroke) —
            // they paint with the built-in tip by design and must not stall.
            if (window.__brushTipOn && !window.__remoteStroke && window.BrushShapes
                && typeof window.BrushShapes.stampPending === 'function'
                && window.BrushShapes.stampPending()) return;
            const aspectRatio = canvas.width / canvas.height;
            const baseRadius = config.SPLAT_RADIUS * (config.STAMP_RADIUS_SCALE || 1);
            // Dab bounding half-width in p-space (canvas-height-normalized).
            // Covers every splatFrag branch: gaussian tail, clay/chisel/streak
            // rims (≤2.6·√r), and the ring tip (ringRadius + band ≤ 2.2·√r).
            const _scK = (typeof config.SPLAT_SCISSOR_K === 'number') ? config.SPLAT_SCISSOR_K : 5.0;
            const _scOn = (config.SPLAT_SCISSOR !== false) && _scK > 0;
            const _u = x / canvas.width, _v = 1.0 - y / canvas.height;
            const _dHalf = _scK * Math.sqrt(Math.max(baseRadius, 0));
            // D1 brush tip: on user strokes only (multiSplat sets __brushTipOn
            // for non-exactColor calls). A material mode no longer suppresses it
            // — an explicit brush shape is a user override that must win in every
            // fluid type (Fluid / Acrylic-thin / Acrylic). BRUSH_TIP 0 (Soft)
            // stays at 0 here and falls through to the material's own STAMP_*
            // below, so materials keep their default stamp until the user picks a
            // shape. Tips are DYE-ONLY, like the clay stamps — the velocity pass
            // stays gaussian or motion reads as glitch.
            let brushTip = 0;
            if (window.__brushTipOn) {
                brushTip = config.BRUSH_TIP | 0;
            }
            // ── Pressure: the velocity-only brush ────────────────────────
            // Runs the velocity pass and returns before the dye pass, so the
            // stroke moves paint that is already down without depositing any
            // new pigment. Rides the same __brushTipOn gate the tips do, and
            // for the same reason: programmatic splats (audio scenes, path
            // layers, animations) are dye SOURCES and must keep painting.
            const velOnly = !!(config.BRUSH_VELOCITY_ONLY && window.__brushTipOn);
            // 'smudge' takes its direction from pointer travel, exactly like the
            // classic brush — so it does nothing while the pointer stands still
            // (dx/dy are zero). The analytic modes synthesize a direction per
            // fragment instead and therefore DO work stationary, which is the
            // whole point of pairing them with Constant flow.
            let velMode = 'smudge', velSwirl = 0;
            if (velOnly) {
                velMode = config.BRUSH_VEL_MODE || 'smudge';
                if (velMode !== 'smudge' && velMode !== 'spread'
                    && velMode !== 'gather' && velMode !== 'swirl') {
                    velMode = 'smudge'; // unknown string: push along travel rather
                }                       // than push nothing at all
                // Clamped HERE rather than at each caller because this is the one
                // choke point every push goes through — the live brush, stroke
                // replay, and a peer's dabs alike. Peer strength arrives as
                // untrusted wire data (06), and an absurd value would dump enough
                // force to blow the field past its cap.
                const velStr = Math.max(0, Math.min(5,
                    (typeof config.BRUSH_VEL_STRENGTH === 'number') ? config.BRUSH_VEL_STRENGTH : 1));
                if (velMode === 'spread' || velMode === 'gather') {
                    // Radial DYE TRANSPORT, not a velocity force — see the
                    // BRUSH_VEL_MODE note in 04a for the measurements. Published for
                    // the update loop to consume once a frame (05j) rather than
                    // applied per dab: the transport rides dt, so the push rate is
                    // already independent of how fast the hose emits, and a dab
                    // does no GL work at all beyond this.
                    window.__brushPush = {
                        u: x / canvas.width,
                        v: 1.0 - y / canvas.height,
                        // attractorFrag gathers toward POSITIVE strength, so Gather is
                        // the positive sign and Spread the negative one.
                        sign: (velMode === 'spread') ? -1 : 1,
                        // The gather's falloff is exp(-d^2 / (r^2 * 0.5)) while the
                        // splat's is exp(-d^2 / radius), so r = sqrt(2 * radius) puts
                        // the push footprint exactly on the brush ring.
                        radius: Math.sqrt(2 * Math.max(baseRadius, 1e-6)),
                        force: velStr * Math.sqrt(Math.max(baseRadius, 1e-6))
                               * (config.BRUSH_PUSH_DYE_RATE || 2.5),
                        ts: (window.performance && performance.now) ? performance.now() : Date.now()
                    };
                    return;
                }
                if (velMode === 'swirl') {
                    // Tangential velocity IS divergence-free, so the projection keeps
                    // all of it — this one stays a real force on the fluid. Its
                    // magnitude has to carry this dab's share of the reference
                    // sampling density (__splatVelK, published by the paint loop) or
                    // the swirl would get stronger every time the Interval slider
                    // went down. Velocity is purely ADDITIVE in the shader (base +
                    // splat), so unlike dye it takes a plain linear share: no
                    // Gate/additive split, no normalizePaintFlow.
                    const velK = (typeof window.__splatVelK === 'number' && window.__splatVelK > 0)
                        ? Math.min(1, window.__splatVelK) : 1;
                    velSwirl = velStr * (config.BRUSH_VEL_SPEED_REF || 120) * velK;
                }
            }
            splatProg.bind();
            gl.uniform1f(splatProg.uniforms.aspectRatio, aspectRatio);
            gl.uniform2f(splatProg.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
            // Material modes may scale the dab (clay Depth): applies to both the
            // dye footprint and the velocity push so they stay congruent.
            gl.uniform1f(splatProg.uniforms.radius, baseRadius);
            gl.uniform1f(splatProg.uniforms.velocityInfluence, config.VELOCITY_INFLUENCE || 1.2);
            gl.uniform1f(splatProg.uniforms.velocityScale,
                1.0 / Math.max(1, config.VELOCITY_REFERENCE_RESOLUTION || 512));
            // Clay stamp (material modes): 0 = classic gaussian. Fresh seed per
            // splat so consecutive stamps get distinct notch patterns.
            if (brushTip >= 1 && brushTip <= 3) {
                // Blob/chisel/streak tips reuse the clay stamp machinery:
                // shape from the tip, roughness from the Texture slider.
                const tex = (typeof config.BRUSH_TIP_TEXTURE === 'number') ? config.BRUSH_TIP_TEXTURE : 0.7;
                gl.uniform1f(splatProg.uniforms.stampNoise, Math.max(0, Math.min(1, tex)));
                gl.uniform1i(splatProg.uniforms.stampShape, brushTip - 1);
                // The tip's footprint is absolute: Texture roughens it, it never
                // fades it back to the gaussian circle (splatFrag stampTipOn).
                gl.uniform1f(splatProg.uniforms.stampTipOn, 1);
            } else {
                gl.uniform1f(splatProg.uniforms.stampNoise, config.STAMP_NOISE || 0);
                gl.uniform1i(splatProg.uniforms.stampShape, config.STAMP_SHAPE || 0);
                gl.uniform1f(splatProg.uniforms.stampTipOn, 0); // material clay stamp: legacy blend
            }
            gl.uniform2f(splatProg.uniforms.stampSeed, Math.random() * 19.7, Math.random() * 23.3);
            // Brush rotation: degrees → radians for chisel/streak stamps (inert on
            // round shapes, and on the material clay stamp when stampNoise is 0,
            // so it never fights other splats).
            gl.uniform1f(splatProg.uniforms.stampAngle, (config.BRUSH_ANGLE || 0) * Math.PI / 180);
            gl.uniform1f(splatProg.uniforms.ringRadius, 0); // classic blob — never inherit a stale ring stamp
            gl.uniform1f(splatProg.uniforms.barHalfW, 0);   // ...or a stale bar stamp
            // Custom brush shape (user-authored alpha stamp): user strokes only,
            // same __brushTipOn gate as the tips. The shader block lives in the
            // dye branch, so the velocity pass stays gaussian by construction.
            // An active shape overrides the built-in tips (incl. Ring below).
            // __remoteStroke exempts peer strokes and replays: the stamp is
            // viewer-LOCAL (its bitmap can't ride the wire), so without the
            // gate a peer's stroke printed in whatever shape THIS client had
            // selected. Built-in tips still apply — they mirror by design.
            let stampTex = null;
            if (window.__brushTipOn && !window.__remoteStroke &&
                window.BrushShapes && typeof window.BrushShapes.getActiveStamp === 'function') {
                stampTex = window.BrushShapes.getActiveStamp(); // {texture, aspect} | null
            }
            gl.uniform1f(splatProg.uniforms.stampTexOn, stampTex ? 1 : 0);
            if (stampTex) {
                gl.uniform1i(splatProg.uniforms.uStampTex, 2);
                gl.uniform1f(splatProg.uniforms.stampAspect, stampTex.aspect || 1);
                gl.activeTexture(gl.TEXTURE2);
                gl.bindTexture(gl.TEXTURE_2D, stampTex.texture);
                // The Texture slider grains custom stamps too (the shader
                // multiplies cov by the stampNoise grain) — drive stampNoise
                // from it regardless of which tip is nominally selected, or
                // the slider is inert with the Soft/Ring tips and material
                // modes override it.
                const stex = (typeof config.BRUSH_TIP_TEXTURE === 'number') ? config.BRUSH_TIP_TEXTURE : 0.7;
                gl.uniform1f(splatProg.uniforms.stampNoise, Math.max(0, Math.min(1, stex)));
            }
            gl.uniform1i(splatProg.uniforms.gateColor, config.COLOR_GATE ? 1 : 0);
            // Gate flow: scales the convergence (see splatFrag). window.__splatFlow
            // is set per-dab by the paint loop and defaults to 1 (full) for every
            // programmatic/press splat that doesn't set it, so this is inert unless
            // a Gate stroke explicitly asks for partial flow.
            gl.uniform1f(splatProg.uniforms.gateFlow,
                (typeof window.__splatFlow === 'number') ? Math.max(0.0, Math.min(1.0, window.__splatFlow)) : 1.0);
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
            if (velMode === 'swirl') {
                // Swirl reuses the ring band's machinery (splatFrag's isVelocity
                // branch: color.x is signed radial speed, color.y a tangential
                // swirl, both resolved PER FRAGMENT off the vector from the dab
                // centre). Collapsing the band radius to ~0 turns that ring into a
                // point source — rr = d - e, so the envelope is exp(-d^2/radius),
                // the very same gaussian the classic velocity splat uses, while the
                // tangent still resolves around the cursor. No new shader code: the
                // geometry was already there for the Tunnel scene. Only color.y is
                // driven — color.x is the RADIAL component, and that is the one
                // the projection eats.
                gl.uniform1f(splatProg.uniforms.ringRadius, 1e-4);
                gl.uniform1f(splatProg.uniforms.ringSquash, 1);
                gl.uniform3f(splatProg.uniforms.color, 0.0, velSwirl, 0.0);
            } else {
                gl.uniform3f(splatProg.uniforms.color, dx, -dy, 1.0);
            }
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
            splatPass(velocity, simTexWidth, simTexHeight,
                _scOn ? splatScissorRect(_u, _v, _dHalf, aspectRatio, simTexWidth, simTexHeight) : 'full');
            // Push stops here — skipping the dye pass IS the feature. Two other
            // things fall out of the early return and both are correct: no
            // wetness is deposited (no paint was laid, so no paper got wet), and
            // no pigment-memory refresh is queued (that tracks the running peak
            // of DYE, and nothing wrote dye). ringRadius is reset on the way out
            // the same way the tip-4 path and ringSplat reset theirs — splat()
            // already zeroes it on entry, so this is defence in depth.
            if (velOnly) {
                if (velMode === 'swirl') gl.uniform1f(splatProg.uniforms.ringRadius, 0);
                return;
            }
            // Write density at dye resolution (full radius for visual quality)
            gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
            gl.uniform1i(splatProg.uniforms.isVelocity, 0); // Density pass
            gl.uniform1i(splatProg.uniforms.uTarget, 0);
            gl.uniform3fv(splatProg.uniforms.color, color);
            if (brushTip === 4 && !stampTex) {
                // Ring tip: thin dye band at ~the gaussian's visible radius
                // (≈√radius in p-space) — dye pass ONLY, so the ring uniform
                // never reinterprets the velocity pass as a radial push.
                // (Skipped when a custom shape is active — the shape wins.)
                gl.uniform1f(splatProg.uniforms.radius, baseRadius * 0.08); // band width²
                gl.uniform1f(splatProg.uniforms.ringRadius, 0.75 * Math.sqrt(baseRadius));
                gl.uniform1f(splatProg.uniforms.ringSquash, 1);
                // Ring is its own analytic shape: never blend the material's
                // clay stamp on top. Without this, Paint-Thick's STAMP_NOISE
                // (0.7, shape often Chisel) reaches the shader's stamp block,
                // which overwrites the hollow center with a square press.
                gl.uniform1f(splatProg.uniforms.stampNoise, 0);
            }
            gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
            const _dyeRect = _scOn ? splatScissorRect(_u, _v, _dHalf, aspectRatio, dyeTexWidth, dyeTexHeight) : 'full';
            splatPass(density, dyeTexWidth, dyeTexHeight, _dyeRect);
            // Additive dabs maintain pigment memory as a GLOBAL running peak
            // (newMem has no shape factor — see splatFrag). A fullscreen dab
            // refreshed it everywhere as a side effect; a scissored/skipped
            // dab must queue the equivalent whole-texture refresh, run once
            // per frame in 05j (bit-identical by max-monotonicity — 05b).
            if (!config.COLOR_GATE && _dyeRect !== 'full') window.__memRefreshPending = true;
            if (brushTip === 4) gl.uniform1f(splatProg.uniforms.ringRadius, 0); // no leak into the next caller
            // P15-1: a stroke wets the paper. Deposit a saturating gaussian of
            // wetness at the dye dab's footprint (sim res), feature-gated so it
            // is exactly free when off. baseRadius (not the possibly-narrowed
            // ring/tip radius) keeps the wet footprint aligned with the paint.
            if ((config.WET_INFLUENCE || 0) > 0 && typeof wetness !== 'undefined' && wetness) {
                wetSplatProg.bind();
                gl.viewport(0, 0, simTexWidth, simTexHeight);
                gl.uniform1f(wetSplatProg.uniforms.aspectRatio, aspectRatio);
                gl.uniform2f(wetSplatProg.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
                gl.uniform1f(wetSplatProg.uniforms.radius, baseRadius);
                gl.uniform1f(wetSplatProg.uniforms.amount, 1.0);
                gl.uniform1i(wetSplatProg.uniforms.uTarget, 0);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, wetness.read.texture);
                blit(wetness.write.fbo);
                wetness.swap();
            }
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
            gl.uniform1f(splatProg.uniforms.velocityScale,
                1.0 / Math.max(1, config.VELOCITY_REFERENCE_RESOLUTION || 512));
            gl.uniform1f(splatProg.uniforms.stampNoise, 0);
            gl.uniform1i(splatProg.uniforms.stampShape, 0);
            gl.uniform1f(splatProg.uniforms.stampTipOn, 0); // no brush-tip footprint on the band
            gl.uniform1f(splatProg.uniforms.stampAngle, 0);
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
        // ─── Custom brush shapes on the raster/mask stamp ────────────
        // The collider and raster brushes run rasterStampProg, which was a plain
        // disc — so a custom shape was silently ignored the moment you pointed
        // it at a wall or a paint layer, however clearly the swatch said otherwise.
        // Shared by both stampers so they can never drift apart.
        //
        // Returns whether a stamp was bound, because the RADIUS differs: the disc
        // path halves the footprint on purpose (its edge is tuned to sit where the
        // fluid gaussian's visible core ends, so both read as the same Size), while
        // a stamp has no such core and wants the full radius to land at the size it
        // would have painted into the fluid.
        //
        // Built-in tips (chisel/streak/ring) are NOT ported here: those are analytic
        // shapes living in splatFrag's clay-stamp block, and the raster brush stays
        // round for them.
        function bindRasterStamp() {
            var stampTex = null;
            // __plainMaskStamp: the mask EDITOR's own wall tool (15) shares this
            // stamper but is a precision instrument with its own size and eraser —
            // it must stay a disc. __remoteStroke keeps its existing meaning: a stamp
            // bitmap is viewer-local and cannot ride the wire.
            if (!window.__plainMaskStamp && !window.__remoteStroke
                && window.BrushShapes && typeof window.BrushShapes.getActiveStamp === 'function') {
                stampTex = window.BrushShapes.getActiveStamp(); // {texture, aspect} | null
            }
            gl.uniform1f(rasterStampProg.uniforms.stampTexOn, stampTex ? 1 : 0);
            if (!stampTex) return false;
            gl.uniform1i(rasterStampProg.uniforms.uStampTex, 1);
            gl.uniform1f(rasterStampProg.uniforms.stampAspect, stampTex.aspect || 1);
            gl.uniform1f(rasterStampProg.uniforms.stampAngle, (config.BRUSH_ANGLE || 0) * Math.PI / 180);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, stampTex.texture);
            gl.activeTexture(gl.TEXTURE0);
            return true;
        }
        // Same hold splat() applies: while a freshly imported shape is still
        // uploading, drop the dab rather than print a disc. Into a COLLIDER that
        // matters more than it does in dye — a wrong wall is one you have to
        // notice and undo, not something the next stroke covers.
        function rasterStampHeld() {
            return !window.__plainMaskStamp && !window.__remoteStroke && window.BrushShapes
                && typeof window.BrushShapes.stampPending === 'function'
                && window.BrushShapes.stampPending();
        }
        // ─── D2 sketch stamping (raster layer) ──────────────────────────
        // Normal-control drawing: premultiplied over-composite into the
        // persistent sketch FBO; eraser = destination-out with the same
        // stamp. No kaleido arms, no splat-in/out ramps — a plain
        // draughtsman's brush sharing the Size fader and picker color.
        function stampSketchDab(x, y, pressure) {
            if (rasterStampHeld()) return;
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
            const flowMul = (typeof config.BRUSH_FLOW === 'number') ? config.BRUSH_FLOW : 1;
            rasterStampProg.bind();
            gl.uniform2f(rasterStampProg.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
            // 0.5× the fluid footprint: the sketch disc edge sits where the
            // fluid gaussian's visible core ends, so both brushes read as
            // the same Size fader setting. A custom stamp takes the FULL
            // radius instead (see bindRasterStamp).
            var _sketchBaseR = config.SPLAT_RADIUS * (config.STAMP_RADIUS_SCALE || 1);
            var _sketchShaped = bindRasterStamp();
            gl.uniform1f(rasterStampProg.uniforms.radius,
                _sketchShaped ? _sketchBaseR : _sketchBaseR * 0.5);
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
            if (rasterStampHeld()) return;
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
            const flowMul = (typeof config.BRUSH_FLOW === 'number') ? config.BRUSH_FLOW : 1;
            rasterStampProg.bind();
            gl.uniform2f(rasterStampProg.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
            var _maskBaseR = config.SPLAT_RADIUS * (config.STAMP_RADIUS_SCALE || 1);
            var _maskShaped = bindRasterStamp();
            gl.uniform1f(rasterStampProg.uniforms.radius,
                _maskShaped ? _maskBaseR : _maskBaseR * 0.5);
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
        // Splat to Fluid: pour a picture into the dye in one shot. `src` is any
        // canvas/image already laid out in CANVAS space (the caller has baked in
        // wherever its layer sits on screen), so this is a straight 1:1 deposit
        // at dye resolution — no gaussian, no aspect frame, no resampling beyond
        // what the caller chose. Dye ONLY: velocity is left alone, so the flow
        // that is already running is what carries the picture away, exactly like
        // a brush press that never moved.
        //
        // The dye is the live simulation, not a document — like every dab, this
        // is not undoable; it dissolves on its own.
        window.__dyeTexSize = function () { return { w: dyeTexWidth, h: dyeTexHeight }; };
        window.__splatImageToDye = function (src, amount) {
            if (!density || !src) return false;
            let tex = null;
            try {
                tex = gl.createTexture();
                gl.activeTexture(gl.TEXTURE2);
                gl.bindTexture(gl.TEXTURE_2D, tex);
                // FLIP_Y matches every other bitmap upload here (brush stamps,
                // Masks.importCoverage): the dye's v axis runs opposite to a
                // 2D canvas's, and the splat shader's own `point` flips y for
                // the same reason.
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                // Straight alpha, NOT premultiplied: the Gate branch converges
                // dye toward the image's own colour, which has to stay itself
                // at low coverage instead of being pre-darkened by it.
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            } catch (e) {
                if (tex) { try { gl.deleteTexture(tex); } catch (_) {} }
                gl.activeTexture(gl.TEXTURE0);
                return false;
            }
            imageSplatProg.bind();
            gl.disable(gl.BLEND);
            gl.uniform1i(imageSplatProg.uniforms.uTarget, 0);
            gl.uniform1i(imageSplatProg.uniforms.uObstacle, 1);
            gl.uniform1i(imageSplatProg.uniforms.uImage, 2);
            gl.uniform1f(imageSplatProg.uniforms.amount,
                (typeof amount === 'number') ? Math.max(0, Math.min(1, amount)) : 1);
            // The same two knobs a dab reads, so a poured image lands with the
            // brush settings that are live right now (05i splat()).
            gl.uniform1i(imageSplatProg.uniforms.gateColor, config.COLOR_GATE ? 1 : 0);
            gl.uniform1f(imageSplatProg.uniforms.gateFlow,
                config.COLOR_GATE
                    ? Math.max(0, Math.min(1, (typeof config.BRUSH_FLOW === 'number') ? config.BRUSH_FLOW : 1))
                    : 1);
            // Pre-compensate for the display's tone map (same white point 05j
            // hands displayFrag) so the picture lands looking like the picture.
            // config.FLUIDIZE_HDR_CEIL = 0 turns it off and pours raw values.
            const _ceil = (typeof config.FLUIDIZE_HDR_CEIL === 'number') ? config.FLUIDIZE_HDR_CEIL : 12;
            gl.uniform1f(imageSplatProg.uniforms.toneCeil, Math.max(0, _ceil));
            gl.uniform1f(imageSplatProg.uniforms.toneWhite,
                (config.BLOOM_CEILING > 0)
                    ? config.BLOOM_CEILING * ((typeof config.GATE_WHITE_MULT === 'number') ? config.GATE_WHITE_MULT : 1.25)
                    : 0.0);
            const _obsActive = !!(window.collisionLayers && window.collisionLayers.enabled && obstacle);
            gl.uniform1i(imageSplatProg.uniforms.hasObstacle, _obsActive ? 1 : 0);
            if (_obsActive) {
                gl.uniform1f(imageSplatProg.uniforms.uObsMax, window.__obsStrengthMax || 0.7);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
            }
            gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
            blit(density.write.fbo);
            density.swap();
            try { gl.deleteTexture(tex); } catch (_) {}
            gl.activeTexture(gl.TEXTURE0);
            return true;
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
            // D6: stamp a global monotonic seq so the unified UndoManager can
            // undo the most-recent action across sketch / UI / layer histories.
            const seq = (window.__undoSeq = (window.__undoSeq | 0) + 1);
            sketchUndoStack.push({ snap: takeSketchSnapshot(srcFbo), kind: kind, id: id, seq: seq });
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
                toStack.push({ snap: takeSketchSnapshot(target), kind: entry.kind, id: entry.id, seq: entry.seq });
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
        // D6: provider for the unified UndoManager (recency-ordered by seq).
        window.__sketchUndoProvider = {
            canUndo: function () { return sketchUndoStack.length > 0; },
            canRedo: function () { return sketchRedoStack.length > 0; },
            topUndoSeq: function () { return sketchUndoStack.length ? sketchUndoStack[sketchUndoStack.length - 1].seq : -Infinity; },
            topRedoSeq: function () { return sketchRedoStack.length ? sketchRedoStack[sketchRedoStack.length - 1].seq : Infinity; },
            undo: function () { window.__sketchUndo(); },
            redo: function () { window.__sketchRedo(); }
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
        // Glow (HDR bloom): prefilter the pre-tone-map frame's overbright
        // regions into the 256-base target, blur DOWN the halving mip chain,
        // then additively blend back UP it (each octave stacks a wider, softer
        // halo), and write the intensity-scaled result back into `glow` for
        // the display pass to sample. All passes tiny (≤256px) — the whole
        // chain costs a fraction of one dye-res pass.
        function applyGlow(source) {
            if (!glow || glowFramebuffers.length < 2) return;
            gl.disable(gl.BLEND);
            // Prefilter: soft-knee threshold on max-channel brightness
            const thr = (config.GLOW_THRESHOLD != null) ? config.GLOW_THRESHOLD : 0.6;
            const knee = thr * ((config.GLOW_KNEE != null) ? config.GLOW_KNEE : 0.7) + 0.0001;
            glowPrefilterProg.bind();
            gl.uniform3f(glowPrefilterProg.uniforms.curve, thr - knee, knee * 2.0, 0.25 / knee);
            gl.uniform1f(glowPrefilterProg.uniforms.threshold, thr);
            gl.uniform1i(glowPrefilterProg.uniforms.uTexture, 0);
            gl.viewport(0, 0, glow.width, glow.height);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, source);
            blit(glow.fbo);
            // ── Scatter (volumetric light shafts) ──
            // Runs HERE, wedged between the prefilter and the blur chain,
            // because right now `glow` holds the soft-knee-thresholded
            // overbright frame — precisely "where the canvas is emitting
            // light" — and the chain is about to consume it. Marching this
            // instead of the finished halo keeps the shafts crisp, and the
            // emitter costs nothing extra.
            // Safe to interleave: blend is off, and the chain re-binds its
            // own program, viewport and texel size on every iteration below.
            if (scatter && config.SCATTER && window.__scatterOrigin) {
                const _so = window.__scatterOrigin;
                scatterProg.bind();
                gl.uniform1i(scatterProg.uniforms.uTexture, 0);
                gl.uniform2f(scatterProg.uniforms.origin, _so.x, _so.y);
                gl.uniform2f(scatterProg.uniforms.aspect,
                    canvas.width / Math.max(1, canvas.height), 1.0);
                gl.uniform1f(scatterProg.uniforms.density,
                    (config.SCATTER_DENSITY != null) ? config.SCATTER_DENSITY : 0.6);
                gl.uniform1f(scatterProg.uniforms.decay,
                    (config.SCATTER_DECAY != null) ? config.SCATTER_DECAY : 0.94);
                gl.uniform1f(scatterProg.uniforms.weight,
                    (config.SCATTER_AMOUNT != null) ? config.SCATTER_AMOUNT : 0.7);
                gl.uniform1f(scatterProg.uniforms.dispersion,
                    (config.SCATTER_DISPERSION != null) ? config.SCATTER_DISPERSION : 0.03);
                // Colliders block light (Scatter panel toggle). The whole glow
                // chain only ever uses unit 0, so unit 1 is free here.
                // `obstacle` swaps with obstacleScratch on every GPU composite,
                // so read the live binding each frame \u2014 never cache the texture.
                const _occlude = !!config.SCATTER_BLOCK
                    && !!(window.collisionLayers && window.collisionLayers.enabled) && !!obstacle;
                gl.uniform1i(scatterProg.uniforms.hasObstacle, _occlude ? 1 : 0);
                gl.uniform1f(scatterProg.uniforms.uObsMax, window.__obsStrengthMax || 0.7);
                gl.uniform1f(scatterProg.uniforms.blockStrength,
                    (config.SCATTER_BLOCK_STRENGTH != null) ? config.SCATTER_BLOCK_STRENGTH : 1.0);
                gl.uniform1i(scatterProg.uniforms.uObstacle, 1);
                gl.viewport(0, 0, scatter.width, scatter.height);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, _occlude ? obstacle.texture : null);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, glow.texture);
                blit(scatter.fbo);
            }
            // Downsample chain
            glowBlurProg.bind();
            gl.uniform1i(glowBlurProg.uniforms.uTexture, 0);
            let last = glow;
            for (let i = 0; i < glowFramebuffers.length; i++) {
                const dest = glowFramebuffers[i];
                gl.uniform2f(glowBlurProg.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
                gl.viewport(0, 0, dest.width, dest.height);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, last.texture);
                blit(dest.fbo);
                last = dest;
            }
            // Additive upsample: each mip keeps its own blur and gains the
            // coarser octave's — the classic wide-soft bloom falloff.
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.enable(gl.BLEND);
            for (let i = glowFramebuffers.length - 2; i >= 0; i--) {
                const dest = glowFramebuffers[i];
                gl.uniform2f(glowBlurProg.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
                gl.viewport(0, 0, dest.width, dest.height);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, last.texture);
                blit(dest.fbo);
                last = dest;
            }
            gl.disable(gl.BLEND);
            // Final: intensity-scaled write back into the full glow target
            glowFinalProg.bind();
            gl.uniform2f(glowFinalProg.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
            gl.uniform1i(glowFinalProg.uniforms.uTexture, 0);
            gl.uniform1f(glowFinalProg.uniforms.intensity,
                (config.GLOW_INTENSITY != null) ? config.GLOW_INTENSITY : 0.8);
            gl.viewport(0, 0, glow.width, glow.height);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, last.texture);
            blit(glow.fbo);
        }
        // PhotoSafe (photosensitivity protection): runs INSTEAD of the direct
        // present when config.PHOTOSAFE is on. The display pass has already
        // rendered this frame into safeFrame (05j reroutes its blit target);
        // this measures it, updates the limiter state, applies the exposure
        // correction + history blend, and presents the result.
        //
        //   safeFrame -> safeLuma.write (16x16 block luminance/redness)
        //   luma cur+prev + stats.read -> safeStats.write (envelope/slew state)
        //   safeFrame + safeOut.read (history) + fresh stats -> safeOut.write
        //   safeOut.write --blitFramebuffer--> canvas; swap all three pairs
        //
        // dt is WALL-CLOCK and self-measured: flash physics runs in viewer
        // time, so it must ignore timeScale, sub-stepping and the fps cap's
        // sim pacing. NOT governor-sheddable — never consults fxOn().
        let _psLastNow = 0;
        function applyPhotoSafe() {
            if (!safeFrame || !safeOut || !safeLuma || !safeStats) return;
            const nowS = performance.now() / 1000;
            let dt = nowS - _psLastNow;
            _psLastNow = nowS;
            if (!(dt > 0.0005) || dt > 0.1) dt = 0.0167; // first frame / tab-hidden spike
            // Harness hook (console-tunable, undefined in production): the
            // deterministic test suite drives update() synchronously, where
            // wall-clock dt is dominated by readback stalls — pin dt so the
            // limiter's windows behave as they would at real frame cadence.
            if (typeof config.PHOTOSAFE_DT_OVERRIDE === 'number') dt = config.PHOTOSAFE_DT_OVERRIDE;
            gl.disable(gl.BLEND);
            // 1. block luminance + redness grid
            photoSafeLumaProg.bind();
            gl.uniform1i(photoSafeLumaProg.uniforms.uTexture, 0);
            gl.viewport(0, 0, 16, 16);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, safeFrame.texture);
            blit(safeLuma.write.fbo);
            // 2. limiter state
            photoSafeStatsProg.bind();
            gl.uniform1i(photoSafeStatsProg.uniforms.uLumaCur, 0);
            gl.uniform1i(photoSafeStatsProg.uniforms.uLumaPrev, 1);
            gl.uniform1i(photoSafeStatsProg.uniforms.uStatsPrev, 2);
            gl.uniform1f(photoSafeStatsProg.uniforms.dt, dt);
            gl.uniform1f(photoSafeStatsProg.uniforms.slew,
                (config.PHOTOSAFE_SLEW != null) ? config.PHOTOSAFE_SLEW : 0.5);
            gl.uniform1f(photoSafeStatsProg.uniforms.flashDelta,
                (config.PHOTOSAFE_FLASH_DELTA != null) ? config.PHOTOSAFE_FLASH_DELTA : 0.10);
            gl.uniform1f(photoSafeStatsProg.uniforms.darkFloor,
                (config.PHOTOSAFE_DARK_FLOOR != null) ? config.PHOTOSAFE_DARK_FLOOR : 0.80);
            gl.uniform1f(photoSafeStatsProg.uniforms.redDelta,
                (config.PHOTOSAFE_RED_DELTA != null) ? config.PHOTOSAFE_RED_DELTA : 0.20);
            gl.uniform1f(photoSafeStatsProg.uniforms.areaFrac,
                (config.PHOTOSAFE_AREA != null) ? config.PHOTOSAFE_AREA : 0.10);
            gl.uniform1f(photoSafeStatsProg.uniforms.releaseTau,
                (config.PHOTOSAFE_RELEASE != null) ? config.PHOTOSAFE_RELEASE : 1.2);
            gl.uniform1f(photoSafeStatsProg.uniforms.pairWindow,
                (config.PHOTOSAFE_PAIR_WINDOW != null) ? config.PHOTOSAFE_PAIR_WINDOW : 0.35);
            gl.uniform1f(photoSafeStatsProg.uniforms.rateAllow,
                (config.PHOTOSAFE_RATE != null) ? config.PHOTOSAFE_RATE : 5.0);
            gl.viewport(0, 0, 2, 1);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, safeLuma.write.texture);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, safeLuma.read.texture);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, safeStats.read.texture);
            blit(safeStats.write.fbo);
            // 3. composite: exposure correction + history blend
            photoSafeCompositeProg.bind();
            gl.uniform1i(photoSafeCompositeProg.uniforms.uCur, 0);
            gl.uniform1i(photoSafeCompositeProg.uniforms.uHist, 1);
            gl.uniform1i(photoSafeCompositeProg.uniforms.uStats, 2);
            gl.uniform1f(photoSafeCompositeProg.uniforms.dt, dt);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, safeFrame.texture);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, safeOut.read.texture);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, safeStats.write.texture);
            blit(safeOut.write.fbo);
            // 4. present + rotate history
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, safeOut.write.fbo);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
            gl.blitFramebuffer(0, 0, safeOut.write.width, safeOut.write.height,
                               0, 0, canvas.width, canvas.height,
                               gl.COLOR_BUFFER_BIT, gl.NEAREST);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            safeLuma.swap();
            safeStats.swap();
            safeOut.swap();
        }
        // Clear the limiter's state buffers. Called on the OFF->ON edge (05j):
        // resuming with stale history/stats would flash-correct against a
        // scene from minutes ago (exposure dip + a ghost of an old frame).
        // The stats shader's init sentinel (st.b < 8) then re-seeds cleanly.
        function resetPhotoSafeState() {
            if (!safeOut || !safeLuma || !safeStats) return;
            gl.clearColor(0, 0, 0, 0);
            [safeLuma.read, safeLuma.write, safeStats.read, safeStats.write,
             safeOut.read, safeOut.write].forEach(function (f) {
                if (f && f.fbo) { gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo); gl.clear(gl.COLOR_BUFFER_BIT); }
            });
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        // PhotoSafe buffers are only allocated while protection is on at init
        // time (05c) — flipping the toggle on later must build them. The full
        // initFramebuffers preserves the artwork, so this is safe mid-session.
        window.__photoSafeEnsure = function () {
            if (!safeFrame && typeof initFramebuffers === 'function') initFramebuffers();
        };
