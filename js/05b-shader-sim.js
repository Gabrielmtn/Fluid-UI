// ═══════════════════════════════════════════════════════════════════
// js/05b-shader-sim.js — part 2/14 of former 05-fluid-sim.js (lines 654–966)
// LOAD ORDER: after 05a-shader-core.js, before 05c-programs-framebuffers.js
// PROVIDES: splat/advection/macAdvect/macCorrect/divergence/curl/turbulence/vorticity/viscosity/pressure/mgResidual/mgRestrict/mgProlong/gradient/clear/obstacleDamp/glow/scatter/scatterSmooth/shadeWall/shadeForm frag sources
// REQUIRES: PRECISION (05a)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        // ─── Per-texel collider strength decode (2026-08-31) ────────────
        // The obstacle texture is RG: R = Σcoverage·strength (the historic
        // channel, unchanged meaning), G = Σcoverage·strength². G/R is
        // therefore the coverage-weighted strength of whatever wrote each
        // texel, and R/(G/R) its coverage — so every collider carries its
        // OWN strength instead of being judged against the globally
        // strongest one (uObsMax). Before this, cov = texel/uObsMax meant
        // one strength-1.0 collider (a Text wall forces exactly that)
        // reshaped every other collider in the scene: a 0.7 wall's
        // interior fell to cov 0.7 — mid-window on the coverage
        // smoothstep's steep flank — so it turned both more solid
        // (response uses the max) and noisier (interior alpha ripple maps
        // through slope ~2.5). G≈0 falls back to the global normalizer,
        // so any unmigrated writer keeps the exact legacy behavior.
        // STRENGTH → SOLIDITY (2026-09-09). Blocking is a per-frame gain
        // the projection and damp passes apply again and again, so a
        // driven flow's transmitted speed falls off like (1−σ)/σ — almost
        // all of the visible change happens in a narrow band of σ. The
        // old s³ map moved that band to the top fifth of the slider and
        // left 0–0.6 doing nothing a person could see ("0 to 0.4 is
        // dead"). This curve is the measured inverse: raw σ was swept on
        // a slab collider with a steady jet (scratchpad collider-probe,
        // headless Chrome on the 4090) and the transmitted-dye fraction
        // fitted, so that equal slider steps give roughly equal steps in
        // how much gets through. Harness switch: ?obsresp=raw evaluates
        // σ = s (for re-measuring), ?obsresp=legacy the s³ map.
        const obsStrengthCurveGLSL = (function () {
            var mode = '';
            try { var m = /[?&]obsresp=([a-z0-9]+)/.exec(location.search); if (m) mode = m[1]; } catch (_) {}
            if (mode === 'raw') return 'return s;';
            if (mode === 'legacy') return 'return s * s * s;';
            // Measured 2026-09-09 (sim 256, 27-texel full-height slab,
            // steady jet, 150 frames, dye mass past the wall relative to
            // open field): T(σ) ≈ 1 − 3.7σ up to σ 0.1, then ≈ 0.81 −
            // 1.77σ, reaching 0 by σ ≈ 0.46; velocity through-flow is
            // gone by σ ≈ 0.2. Inverting T(s) = 1 − s/0.75 gives
            // σ ≈ 0.7·s^1.5 up to s = 0.75 (fits every sampled point
            // within 0.02). Above that the wall is already dye-tight and
            // the remaining travel is rigidity — the stiff regime the
            // 0.997 ceiling and the 1.0-resonance notes describe — so it
            // ramps linearly to 1.0. Legacy s³ for reference: dead until
            // s ≈ 0.5, tight by 0.8.
            // TOP CAPPED AT 0.9, not the 0.997 ceiling (2026-09-09): measured
            // with five capsule walls, a steady jet and frame-to-frame
            // velocity change, a free-slip wall starts resonating above
            // solidity 0.9 (0.95 → +30%, 0.997 → 2.7× the baseline shake)
            // while nothing visible is gained past ~0.5 (dye-tight). So the
            // slider's 1.0 means as solid as is CALM.
            return 'return (s < 0.75) ? 0.7 * pow(s, 1.5) : 0.455 + (s - 0.75) * 1.78;';
        })();
        // COLLIDER MODES (2026-09-09): the texture is RGBA, and the two
        // extra channels carry each collider's MODE the same premultiplied
        // way G carries its strength, so Block / Deflect / Slow colliders
        // can share one texture and overlap:
        //   R = Σcov·S·solid   the historic wall channel. Slow colliders
        //                      write 0 here, so every reader that only
        //                      knows about walls (projection, drain, brush
        //                      block, vorticity gate, scatter shadow) sees
        //                      nothing where a Slow region is — correct,
        //                      it is not a wall.
        //   G = Σcov·S·√S      strength, ALL modes (S = (G / (R + A))²;
        //                      √S rather than S so the 8-bit canvas
        //                      path keeps weak walls — see obsTexStrength).
        //   B = Σcov·S·stick   Block = 1 (no-slip: the damp pass kills a
        //                      wide apron, flow sticks), Deflect = 0
        //                      (interior-only damp, the projection's
        //                      tangential slip shows: flow slides around).
        //   A = Σcov·S·(1−solid)  the Slow channel: a drag field the damp
        //                      pass applies at a strength-graded half-life
        //                      — fluid and paint ENTER and decelerate,
        //                      nothing is blocked or drained.
        // Writers: 05c updateObstacleTexture (CPU canvas: bytes R=solid,
        // G=S, B=stick, alpha=cov·S — collisionLayers.wallStyle()) and
        // obstacleCompositeFrag (GPU sources). Pure functions on a fetched
        // texel — no uniform/sampler decls, so shaders that already declare
        // uObsMax can interpolate this too.
        const obsTexelGLSL = `
            float obsTexStrength(vec4 t, float sMax) {
                // G carries cov·S·sqrt(S), not cov·S² (2026-09-09): the
                // CPU compositor stores it premultiplied in an 8-bit
                // canvas, and S² at a weak wall is under one byte (0.05²·
                // 255 = 0.6), so the decoded strength of a 0.05 wall came
                // back as 0.077 — the low end of the slider quantized
                // away. sqrt keeps it well above the byte floor.
                float presence = t.x + t.w;
                if (t.y <= 1e-5) return max(sMax, 0.05);
                float q = t.y / max(presence, 1e-5);
                return clamp(q * q, 0.05, 1.0);
            }
            float obsTexCoverage(vec4 t, float sMax) {
                return clamp(t.x / obsTexStrength(t, sMax), 0.0, 1.0);
            }
            float obsTexSlowCoverage(vec4 t, float sMax) {
                return clamp(t.w / obsTexStrength(t, sMax), 0.0, 1.0);
            }
            float obsTexStick(vec4 t) {
                return (t.x > 1e-5) ? clamp(t.z / t.x, 0.0, 1.0) : 1.0;
            }
            float obsStrengthCurve(float s) {
                ${obsStrengthCurveGLSL}
            }
            float obsTexResponse(vec4 t, float sMax) {
                // Strength → solidity, per texel (see obsStrengthCurveGLSL
                // for the curve and the 0.997 ceiling).
                float s = clamp(obsTexStrength(t, sMax), 0.0, 1.0);
                return min(obsStrengthCurve(s), 0.997);
            }
            float obsTexPresence(vec4 t, float sMax) {
                // How much of a WALL this is to direct deposition (brush
                // dabs, poured images). Saturates well below the default
                // strength so a normal collider still turns paint away
                // completely (the 2026-08-16 rule), while a deliberately
                // weak one lets paint land inside — the low half of the
                // slider is no longer indistinguishable from the middle.
                float s = clamp(obsTexStrength(t, sMax), 0.0, 1.0);
                return smoothstep(0.0, 0.5, s);
            }
            float obsTexDyeBlock(vec4 t, float sMax) {
                // How much of a DIRECT DEPOSIT (brush dab, poured image) a
                // texel refuses. Coverage only, no strength curve — that is
                // the 2026-08-16 rule, "paint goes around a collider, not
                // over it", and splatFrag and imageSplatFrag must agree on
                // it or the brush and a pour disagree about where the wall
                // is. Shared here so they cannot drift.
                //
                // The window is 0.30-0.55, NOT solidity()'s 0.35-0.85
                // (2026-09-19). An obstacle edge is a ~4-texel coverage ramp
                // — the shape's own antialiasing, the 2x box-filter
                // downsample and the 1-texel finish blur — whose 0.5 contour
                // IS the edge of the shape. Blocking on 0.35-0.85 therefore
                // did not saturate until a texel and a third INSIDE it:
                // measured on a full-strength text collider (frozen sim, so
                // this is deposit alone), a dab still landed 80% of itself
                // on the letterform's own edge, 43% a third of a texel in,
                // 20% three quarters in. Nothing takes that band away —
                // the velocity there is damped and the advection drain only
                // bites above coverage 0.55 — so every stroke printed a
                // little more rim onto the letters until they wore a
                // permanent outline of paint. Saturating at 0.55 stops the
                // deposit a fifth of a texel inside the edge instead — 4% of
                // a dab on the edge, under half a percent at 0.55, nothing
                // past it — and the ~1-texel taper outside the edge
                // keeps the stroke feathering into the wall rather than
                // clipping against it. solidity()'s window is deliberately
                // untouched: the FLOW still treats the wall as exactly the
                // shape it always did, and so does the velocity a dab
                // injects (splatFrag's covBlock).
                return smoothstep(0.30, 0.55, obsTexCoverage(t, sMax)) * obsTexPresence(t, sMax);
            }
        `;
        const splatFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTarget;
            uniform sampler2D uObstacle;
            uniform vec2 point;
            uniform vec3 color;
            uniform float radius, aspectRatio, velocityInfluence;
            uniform float velocityScale;
            uniform float stampNoise;  // 0 = classic gaussian splat; >0 blends in the clay stamp
            uniform float stampTipOn;  // 1 = explicit brush tip: the SHAPE is absolute and stampNoise is grain only
            uniform vec2 stampSeed;    // per-splat offset so consecutive stamps differ
            uniform int stampShape;    // 0 = blob, 1 = chisel (square press), 2 = streak (elongated smear)
            uniform float stampAngle;  // brush rotation (radians, screen space) for chisel/streak; 0 = upright
            uniform float ringRadius;  // >0: thin ring-band stamp at this radius (aspect-corrected UV); 0 = classic blob
            uniform float ringSquash;  // ring ellipse squash (1 = circle, <1 = flattened vertically)
            uniform float barHalfW;    // >0: crisp bar stamp this half-width wide (aspect-corrected UV); EQ lane slabs
            uniform float barPoint;    // bar stamp tip lift: 0 = flat slab, >0 = pointed arch (flame tongue)
            uniform sampler2D uStampTex; // custom brush-shape stamp (alpha = coverage), bound on unit 2
            uniform float stampTexOn;    // 1 = the dye footprint comes from the stamp texture
            uniform float stampAspect;   // stamp width/height, so non-square stamps keep their aspect
            uniform int gateColor;     // 1 = clamp dye at the splat's own color (no HDR overflow into white)
            uniform float gateFlow;    // Gate: 0-1 flow — scales the CONVERGENCE, not the colour, so low flow builds toward the TRUE colour instead of a darkened one
            uniform int isVelocity; // 1 for velocity, 0 for density
            uniform int hasObstacle;
            uniform float uObsMax;  // max collisionStrength (see obstacleSolidityGLSL)
            uniform float uVelCovBlock; // 1 = velocity injection blocked by wall
                                        // COVERAGE like dye (default); 0 = legacy
                                        // s³ leak (config.OBS_VEL_COVERAGE_BLOCK)
            ${obsTexelGLSL}
            float sn_hash(vec2 q) {
                q = fract(q * vec2(123.34, 345.45));
                q += dot(q, q + 34.345);
                return fract(q.x * q.y);
            }
            float sn_noise(vec2 q) {
                vec2 i = floor(q), f = fract(q);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(sn_hash(i),                  sn_hash(i + vec2(1.0, 0.0)), f.x),
                           mix(sn_hash(i + vec2(0.0, 1.0)), sn_hash(i + vec2(1.0, 1.0)), f.x), f.y);
            }
            void main() {
                vec2 p = vUv - point;
                p.x *= aspectRatio;
                vec3 base = texture(uTarget, vUv).xyz;
                // Don't inject paint or velocity inside collision masks: the
                // damped velocity field pins whatever lands there, so injected
                // dye lingers as a burned-in imprint of the mask shape.
                // Saturates at 0.5 because real collision maps are written at
                // collisionStrength (default 0.7) with antialiased detail —
                // partial-strength texels must still block firmly.
                float obsBlock = 1.0;
                float obsBlockDye = 1.0;
                if (hasObstacle == 1) {
                    // covBlock is obstacleSolidityGLSL's curve, so the
                    // VELOCITY a dab injects and the projection's wall agree
                    // on where the wall is. Deposition uses the tighter
                    // obsTexDyeBlock below — it has to saturate at the
                    // shape's own edge, not a texel inside it, or the brush
                    // prints a rim on the shape (2026-09-19).
                    // Per-texel strength (2026-08-31): coverage and response
                    // come from THIS texel's own strength, so painting on a
                    // weak collider is unchanged by a strong one elsewhere.
                    vec4 ot = texture(uObstacle, vUv);
                    // Coverage window × presence (2026-09-09): a weak wall
                    // (strength < 0.5) takes a graded share of the dab —
                    // see obsTexPresence. Slow regions have no R coverage
                    // and never block.
                    float covBlock = smoothstep(0.35, 0.85, obsTexCoverage(ot, uObsMax))
                                   * obsTexPresence(ot, uObsMax);
                    // The BRUSH is blocked by coverage alone, with no strength
                    // term (2026-08-16). The s^3 permeability curve is right for
                    // flow — a weak wall should leak — but applying it to direct
                    // deposition meant the brush painted 27% of every dab INTO a
                    // wall at the 0.9 default, and under Gate repeated dabs
                    // converge on the full picked colour, so a wall could simply
                    // be painted over. That is why colliding did not feel like
                    // colliding. Paint now goes AROUND the shape at every
                    // strength; advection through a leaky wall is untouched.
                    // The window itself lives in obsTexDyeBlock, which
                    // imageSplatFrag shares so a pour lands where a dab does.
                    obsBlockDye = 1.0 - obsTexDyeBlock(ot, uObsMax);
                    // VELOCITY now defaults to the same coverage-only block
                    // (2026-08-31): the old s³ curve injected (1-s³) of every
                    // dab's velocity INSIDE the wall — 66% at strength 0.7 —
                    // and that in-wall reservoir is what pumped dye radially
                    // out of a painted-on collider (the "dye producer" push;
                    // measured: outward flux + escape-band dye still growing
                    // +56% a second after the stroke stopped). Flow THROUGH a
                    // leaky wall is advection + projection's business and is
                    // untouched. uVelCovBlock=0 restores the legacy leak.
                    obsBlock = 1.0 - mix(obsTexResponse(ot, uObsMax), 1.0, uVelCovBlock) * covBlock;
                }
                if (isVelocity == 1) {
                    // Motion Isolation: prevent new velocity from affecting areas with existing velocity
                    // Higher velocityInfluence = more isolation (less impact on existing areas)
                    // Range: 1.0 (no isolation) to 5.0 (maximum isolation)
                    // Calculate splat intensity
                    float dist = dot(p, p);
                    float splatIntensity = exp(-dist / radius);
                    vec3 splat = splatIntensity * color;
                    if (ringRadius > 0.0) {
                        // Ring band: intensity peaks along the ellipse, and the
                        // velocity is injected RADIALLY per fragment — color.x is
                        // the signed radial speed (>0 outward), color.y a
                        // tangential swirl — so one draw pushes the whole band.
                        vec2 ps = vec2(p.x, p.y / max(ringSquash, 0.05));
                        float d = length(ps);
                        float rr = d - ringRadius;
                        splatIntensity = exp(-(rr * rr) / radius);
                        vec2 dirv = d > 1e-5 ? ps / d : vec2(0.0);
                        splat = vec3((dirv * color.x + vec2(-dirv.y, dirv.x) * color.y) * splatIntensity, 0.0);
                    } else if (barHalfW > 0.0) {
                        // Bar stamp (EQ lanes): crisp box in x; the slab's
                        // centerline lifts parabolically toward lane center
                        // (barPoint), so the stamp is a pointed flame tongue
                        float q = clamp(abs(p.x) / barHalfW, 0.0, 1.0);
                        float bx = 1.0 - smoothstep(0.8, 1.0, q);
                        float cy = barPoint * (1.0 - q * q);
                        float dy2 = p.y - cy;
                        splatIntensity = bx * exp(-(dy2 * dy2) / radius);
                        splat = splatIntensity * color;
                    }
                    splat.xy *= velocityScale;
                    // Measure existing velocity magnitude
                    float existingVelMag = length(base.xy);
                    // Smoother isolation curve using pow(x, 1.5)
                    // At 1.0: isolationStrength = 0.00 (full fluid motion)
                    // At 1.5: isolationStrength ≈ 0.04 (very light protection)
                    // At 2.0: isolationStrength ≈ 0.09 (light protection)
                    // At 2.5: isolationStrength ≈ 0.17 (noticeable protection)
                    // At 3.0: isolationStrength ≈ 0.28 (moderate protection)
                    // At 4.0: isolationStrength ≈ 0.58 (strong protection)
                    // At 5.0: isolationStrength = 1.00 (maximum protection)
                    float normalizedInfluence = clamp((velocityInfluence - 1.0) / 4.0, 0.0, 1.0);
                    float isolationStrength = pow(normalizedInfluence, 1.5);
                    // Velocity-based falloff using smoothstep for natural gradient
                    // Areas with existing motion are shielded proportional to their speed
                    // M3 units: 0.5 cells/s (the old near-zero threshold,
                    // tuned at 512) ≈ 0.001 UV/s — without the rescale,
                    // motion isolation only engaged at ~256× the intended
                    // speed, i.e. never ("paints move other paint" returns).
                    float velShield = smoothstep(0.0, 0.001, existingVelMag);
                    float impactReduction = 1.0 - (velShield * isolationStrength * 0.85);
                    impactReduction = max(0.15, impactReduction); // Minimum 15% impact always allowed
                    fragColor = vec4(base + splat * impactReduction * obsBlock, 1.0);
                } else {
                    // ─── Additive mixing (original) ───────────────────────
                    float r2 = dot(p, p) / radius;
                    float shape = exp(-r2);
                    if (ringRadius > 0.0) {
                        // Ring band: dye deposits only along the thin ellipse
                        vec2 ps = vec2(p.x, p.y / max(ringSquash, 0.05));
                        float rr = length(ps) - ringRadius;
                        shape = exp(-(rr * rr) / radius);
                    } else if (barHalfW > 0.0) {
                        // Bar stamp: lane-wide at the base, pointed arch on top
                        float q = clamp(abs(p.x) / barHalfW, 0.0, 1.0);
                        float bx = 1.0 - smoothstep(0.8, 1.0, q);
                        float cy = barPoint * (1.0 - q * q);
                        float dy2 = p.y - cy;
                        shape = bx * exp(-(dy2 * dy2) / radius);
                    }
                    // Clay stamp never applies to the analytic ring/bar shapes —
                    // they define their own alpha and a stamp overwrite paints
                    // a blob/square inside the ring's hollow center (JS also
                    // zeroes stampNoise for tip 4; this is defense-in-depth).
                    if ((stampNoise > 0.0 || stampTipOn > 0.5) && ringRadius <= 0.0 && barHalfW <= 0.0) {
                        // Clay stamp: hard-edged footprint with a noise-notched rim
                        // and surface grain instead of the gaussian bloom. Dye only —
                        // the velocity pass stays gaussian, or motion reads as glitch.
                        // Noise domain scales with splat size so grain tracks the brush.
                        vec2 q = p / sqrt(radius);
                        float n = sn_noise(q * 3.0 + stampSeed);
                        // Rotate the metric frame so asymmetric tips can be angled.
                        // stampAngle is screen-space radians (p-space is aspect-
                        // corrected + isotropic, so this is a true screen rotation);
                        // grain stays on unrotated q. Blob (m = r2) is rotation-invariant.
                        vec2 qr = q;
                        if (stampAngle != 0.0) {
                            float ca = cos(stampAngle), sa = sin(stampAngle);
                            qr = vec2(q.x * ca - q.y * sa, q.x * sa + q.y * ca);
                        }
                        // Footprint metric per brush shape (r2-compatible units)
                        float m = r2;                                   // 0: round blob
                        if (stampShape == 1) {
                            float box = max(abs(qr.x), abs(qr.y));      // 1: chisel — square press
                            m = box * box;
                        } else if (stampShape == 2) {
                            vec2 qs = qr * vec2(0.55, 2.4);            // 2: streak — wide smear
                            m = dot(qs, qs);
                        }
                        if (stampTipOn > 0.5) {
                            // Brush tips: Texture adds ROUGHNESS to the tip's own
                            // footprint — it must never dissolve the footprint. The
                            // old mix(gaussian, stamp, stampNoise) turned a chisel
                            // back into a soft circle as the slider came down; now
                            // the shape metric always wins and the slider only fades
                            // the rim jitter, the surface grain and the edge softness,
                            // so turning Texture down HARDENS the chisel's angles.
                            // At stampNoise = 1 this is identical to the clay stamp
                            // below (rim jitter ±0.9·(n-0.5), 0.28 edge, 0.75+0.5n grain).
                            float t = clamp(stampNoise, 0.0, 1.0);
                            float rim = 1.4 * (1.0 + 0.9 * (n - 0.5) * t);
                            float edge = mix(0.06, 0.28, t);
                            shape = (1.0 - smoothstep(rim * (1.0 - edge), rim, m))
                                  * mix(1.0, 0.75 + 0.5 * n, t);
                        } else {
                            // Material-mode clay stamp (STAMP_NOISE/STAMP_SHAPE):
                            // unchanged — its noise IS the blend, by design.
                            float rim = 1.4 * (0.55 + 0.9 * n);
                            float stamp = (1.0 - smoothstep(rim * 0.72, rim, m)) * (0.75 + 0.5 * n);
                            shape = mix(shape, stamp, stampNoise);
                        }
                    }
                    // Custom brush shape: the dye footprint is a user-authored
                    // alpha stamp, sampled in the same rotated size-normalized
                    // frame as the clay stamps. Dye ONLY — the velocity pass
                    // stays gaussian (same rule as the clay stamps above). The
                    // Texture slider's grain still applies, so custom shapes
                    // can be roughened like the built-in tips.
                    if (stampTexOn > 0.5 && ringRadius <= 0.0 && barHalfW <= 0.0) {
                        vec2 q = p / sqrt(radius);
                        vec2 qr = q;
                        if (stampAngle != 0.0) {
                            float ca = cos(stampAngle), sa = sin(stampAngle);
                            qr = vec2(q.x * ca - q.y * sa, q.x * sa + q.y * ca);
                        }
                        // Long side spans the same visual extent as the gaussian
                        // dab (its alpha-0.1 edge sits at |p| ~ 1.5*sqrt(radius));
                        // support stays far inside the scissor rect (K = 6).
                        vec2 he = (stampAspect >= 1.0)
                            ? vec2(1.6, 1.6 / max(stampAspect, 0.001))
                            : vec2(1.6 * max(stampAspect, 0.001), 1.6);
                        vec2 suv = qr / (2.0 * he) + 0.5;
                        // Sample first, mask after. The stamp is mipmapped (33
                        // uploadStamp) and a texture() call inside non-uniform
                        // control flow has undefined derivatives, so the LOD it
                        // picked would be undefined for exactly the fragments
                        // at the stamp's own edge. Hoisting the fetch out costs
                        // nothing and makes the mip level well defined.
                        float inStamp = float(all(greaterThanEqual(suv, vec2(0.0))) && all(lessThanEqual(suv, vec2(1.0))));
                        float cov = texture(uStampTex, clamp(suv, 0.0, 1.0)).a * inStamp;
                        if (stampNoise > 0.0) {
                            float n2 = sn_noise(q * 3.0 + stampSeed);
                            cov *= mix(1.0, 0.75 + 0.5 * n2, stampNoise);
                        }
                        shape = cov;
                    }
                    vec3 result;
                    // Pigment memory: what strength was this dye laid down at?
                    // Tracked the same way the colour itself is, so the two
                    // never disagree — Gate CONVERGES it (paint covers, so a
                    // dim stroke over a bright one must be remembered dim, or
                    // Ignite would resurrect the colour underneath), additive
                    // keeps the running peak.
                    float baseMem = texture(uTarget, vUv).w;
                    float newMem;
                    if (gateColor == 1) {
                        // Gate: paint COVERS — dye converges to the stroke's own
                        // color instead of accumulating. A per-channel clamp was
                        // tried first (min(base+splat, max(base,color))) and
                        // failed: painting yellow over blue kept the old blue
                        // channel, and the union of channels tone-mapped to
                        // white. Mixing by splat intensity means heavy strokes
                        // become exactly the picked color over ANY underlying
                        // dye, while soft gaussian edges still blend.
                        // Flow scales this CONVERGENCE, never the colour: low flow
                        // lays each dab down partially, so overlapping dabs still
                        // climb toward the TRUE picked colour (a soft, translucent
                        // build-up) instead of converging to a darkened colour*flow
                        // that can never reach full. (The old JS baked flow into the
                        // colour value — fine for the additive branch below, but
                        // under Gate that made every low-flow stroke a dark hue.)
                        float w = clamp(shape, 0.0, 1.0) * obsBlockDye * gateFlow;
                        result = mix(base, color, w);
                        newMem = mix(baseMem, max(color.r, max(color.g, color.b)), w);
                    } else {
                        result = base + shape * color * obsBlockDye;
                        newMem = max(baseMem, max(result.r, max(result.g, result.b)));
                    }
                    fragColor = vec4(result, newMem);
                }
            }
        `;
        // ─── Pigment-memory refresh (splat-scissor companion) ───────────
        // The additive splat branch maintains memory as a GLOBAL running
        // peak: newMem = max(baseMem, maxRGB) with NO shape factor, so every
        // legacy fullscreen dab refreshed memory across the whole texture.
        // Scissored dabs only refresh their rect, which leaves rect-shaped
        // steps in the memory channel (visible through Ignite / Light Shift
        // keying as hatching). Because additive dye only GROWS within a
        // frame's dab train, max over the intermediate states equals max
        // over the final state -- so ONE fullscreen refresh per frame (run
        // in 05j before dye advection, only on frames that had additive
        // scissored dabs) reproduces the per-dab legacy result bit-exactly.
        const memRefreshFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uDye;
            void main() {
                vec4 d = texture(uDye, vUv);
                fragColor = vec4(d.rgb, max(d.a, max(d.r, max(d.g, d.b))));
            }
        `;
        // ─── Shared backtrace: RK2 (midpoint) + settle ease-out ─────────
        // Interpolated into the main advection pass AND both MacCormack
        // passes below. MUST stay a single shared string: the MacCormack
        // correction is only valid if the correct pass recomputes the exact
        // same displacement the forward pass used (same code + same highp
        // arithmetic → bit-identical).
        //
        // RK2: sample velocity at the half-step midpoint instead of at the
        // start point — one extra fetch, second-order characteristics, so
        // curved strokes stop corner-cutting through swirls.
        //
        // Settle ease-out. Repeated re-filtering + fp16 re-rounding of
        // near-still fluid is what carves the terraced "cooled" banding,
        // so settled fluid must stop being resampled — but a binary
        // stillness snap freezes striation bands one-by-one as velocity
        // dies ("dominoes"). Instead: below ~0.002 source texels/frame
        // (imperceptible, <0.12 texel/s) displacement scales to exactly
        // zero — an exact self-fetch, bit-stable at rest — and the
        // approach is eased smoothly from 0.05 texels/frame down, so
        // fluid glides to rest instead of crawling for many seconds
        // through the worst re-filtering regime and snapping still
        // along a moving frontier. (At rest this also zeroes the
        // MacCormack correction exactly — see macCorrectFrag.)
        // Obstacle solidity: defined HERE (above the advection shaders)
        // because rk2Backtrace's obstacle-aware probes call solidity() —
        // every includer must interpolate this snippet first. Consumed by
        // the projection passes (divergence/pressure/mgResidual/gradient)
        // further down and by all three dye advection passes.
        const obstacleSolidityGLSL = `
            uniform float uObsMax; // max collisionStrength among composited
                                   // collision sources (JS: window.__obsStrengthMax).
                                   // Since the per-texel strength channel
                                   // (2026-08-31, obsTexelGLSL) this is only the
                                   // FALLBACK normalizer for legacy G=0 content.
            ${obsTexelGLSL}
            // s³ strength response: blocking COMPOUNDS over frames (a
            // 65%-solidity wall already stops a steady jet), so a
            // perceptually graded slider needs a response that stays low
            // through the mid range — measured with an even S-curve the
            // wall still cliffed between 0.5 and 0.8. Cubic spreads usable
            // permeability across the upper half.
            // Ceiling 0.997 (2026-07-15, Gabriel): a PERFECT seal is the
            // degenerate extreme — dye/energy pressed against zero-leak
            // walls pile into HDR blowout ("intense overflow destruction
            // at 1.0, really nice at 0.999"). 0.997 is exactly the
            // response slider-0.999 produced, so 1.0 now means "as solid
            // as is stable" — visually rigid, never mathematically sealed.
            // The curve itself lives in obsTexResponse (obsTexelGLSL) and
            // is now evaluated per texel: each collider gets its own
            // slider's response, not the strongest scene collider's.
            float solidity(vec2 uv) {
                // COVERAGE and STRENGTH are different quantities (D0.5 rev 3,
                // 2026-07-14). The obstacle texel stores coverage*strength; a
                // fixed absolute smoothstep window therefore changed the
                // EDGE GEOMETRY with the strength slider — at strength 1.0 it
                // sliced a sub-texel band out of the AA ramp (binary walls →
                // whole-canvas velocity fuzz under the converged MG solve),
                // at 0.4 it never saturated (calm but leaky). Separating them:
                //  - cov = texel / maxStrength  → the antialiased coverage,
                //    given a strength-INDEPENDENT ~1-texel edge ramp (0.2→0.8
                //    of the blur-bounded spatial ramp);
                //  - the interior response keeps the EXACT legacy strength
                //    curve smoothstep(0.25, 0.5, strength): 0.7 → fully
                //    blocking, ≤0.25 → fluid, between → permeable wall.
                vec4 obT = texture(uObstacle, uv);
                float cov = obsTexCoverage(obT, uObsMax);
                // Ramp window 0.35→0.85 (was 0.2→0.8): the compositor's
                // sim-scale blur bleeds coverage INTO narrow unmasked channels
                // from both sides, and with the lower window a 2-texel channel
                // (fine mask detail — scale patterns, thin gaps) never reached
                // solidity 0 anywhere across its width, so fine channels
                // "mostly stopped" (measured 26% of a fine-scale field at
                // partial solidity, 2026-07-14). Raising the window makes
                // blur-bleed mid-coverage read as OPEN channel; the wall
                // recedes ~half a texel and stays antialiased.
                //
                // Strength response (2026-07-15): full-range S-curve. The
                // legacy curve smoothstep(0.25, 0.5, strength) SATURATED at
                // 0.5 — half the Strength slider was dead travel and the
                // working quarter was a cliff ("aggressive at 0.5, not at
                // 0.4"). With coverage separated out, strength now owns the
                // whole 0→1 range as permeability: 1.0 = fully solid wall,
                // mid values = graded leaky walls, 0 = inert.
                // Capped at 0.995, NEVER exactly 1.0 (2026-07-15): at
                // solidity 1.0 a fully sealed cell's pressure equation
                // degenerates — every Neumann mix returns the cell's own
                // pressure, the solve decouples, and pressure inside sealed
                // solids INTEGRATES instead of relaxing (measured: stored
                // pMax ~7000 at strength 1.0 vs ~300 at 0.9 — 20-40× — which
                // then leaks through the MG pyramid's coarse levels and the
                // LINEAR-filtered edges as eruptions of false flow, the
                // "1.0 is still technically broken" runaway). 0.5% residual
                // coupling keeps walls functionally rigid while the interior
                // pressure always has a path to relax through.
                float wall = obsTexResponse(obT, uObsMax) * smoothstep(0.35, 0.85, cov);
                // SLOW regions (A channel) take part in the projection too,
                // as a porous medium (2026-09-09): the same strength-graded
                // coupling, so pressure routes flow AROUND thick syrup and
                // the drag is not simply undone by the next projection
                // (measured: damp-pass-only Slow at strength 1.0 kept 44%
                // of the open-field speed inside the region — the solve
                // re-accelerated what the damp removed). What still sets
                // Slow apart from a leaky wall: nothing is blocked from
                // being painted into it, nothing inside is drained, and
                // the edge has no no-slip apron — see obsTexelGLSL.
                // Capped at 0.45 of the wall response: measured (raw sweep)
                // that is where through-flow reaches zero while dye still
                // ENTERS the region and stalls — tar that swallows, not a
                // wall that turns away. The half-life drag in the damp pass
                // does the rest inside.
                float slow = 0.45 * obsTexResponse(obT, uObsMax)
                           * smoothstep(0.35, 0.85, obsTexSlowCoverage(obT, uObsMax));
                return min(0.995, max(wall, slow));
            }
        `;
        // ─── Wetness → dye mobility (P15-1) ─────────────────────────────
        // Wet paint FLOWS, dry paint HOLDS. A single R16F wetness field
        // (0 = bone dry, 1 = fully wet) scales the dye backtrace
        // displacement: dry regions barely advect (paint sets in place),
        // wet regions transport at full velocity. Interpolated INTO the
        // shared rk2Backtrace snippet below, so MacCormack forward/correct/
        // main compute bit-identical displacements — the correction only
        // stays coherent if every dye pass carries the same
        // (uWetness, wetInfluence) uniforms and the exact same code.
        //
        // wetInfluence <= 0 returns EXACTLY 1.0 — no sample, no arithmetic —
        // so the velocity self-advection pass (which sets wetInfluence=0)
        // and the feature-off default (WET_INFLUENCE 0) stay bit-for-bit
        // identical to the pre-wetness sim. At rest disp is already 0, so
        // the at-rest bit-stability / settle-banding guarantee is untouched
        // regardless of what mobility returns.
        const mobilityGLSL = `
            uniform sampler2D uWetness;  // R16F, sim res: 0 dry … 1 wet
            uniform float wetInfluence;  // 0 = feature off (exact no-op)
            float dyeMobility(vec2 uv) {
                if (wetInfluence <= 0.0) return 1.0;
                float w = clamp(texture(uWetness, uv).r, 0.0, 1.0);
                // wet (w=1) → 1.0 full flow; bone dry (w=0) → (1 - wetInfluence)
                // held. wetInfluence=1 fully freezes dry paint in place.
                return mix(1.0 - wetInfluence, 1.0, w);
            }
        `;
        const rk2Backtrace = `
                vec2 vHalf = texture(uVelocity, vUv).xy;
                // Isotropic velocity units (config.VELOCITY_ISOTROPIC): stored
                // velocity is canvas LONG sides per second on both axes, and
                // each axis turns into its own UV here (uVelToUv = long/axis,
                // 1.78 for y on 16:9). (0, 0), which is also what a pass that
                // never sets it reads, keeps the M3 per-axis UV/s.
                if (uVelToUv.x > 0.0) vHalf *= uVelToUv;
                vec2 midUv = clamp(vUv - 0.5 * dt * vHalf, 0.0, 1.0);
                vec2 disp = dt * texture(uVelocity, midUv).xy;
                if (uVelToUv.x > 0.0) disp *= uVelToUv;
                float mTexels = length(disp / srcTexelSize);
                // Frame-rate-honest ease-out: the thresholds were tuned as
                // texels-per-frame AT 60FPS. At 144Hz dt halves, so the same
                // physical speed reads 2.4x smaller and slow swirls spend
                // 2.4x longer in the partial-scale band — the worst
                // re-filtering regime, which visibly dissolved fine dye
                // structure after the 144Hz unlock (2026-07-09). Normalizing
                // by dt makes the criterion pure physical speed (texels/s in
                // 60fps-reference units): identical behavior at 60fps,
                // identical PHYSICS at any refresh rate. At rest mTexels=0
                // regardless — the bit-stability guarantee is untouched.
                float mRef = mTexels * (0.0166667 / max(dt, 1e-4));
                disp *= smoothstep(0.002, 0.05, mRef);
                // Obstacle-aware backtrace (uniform-gated; requires the
                // including shader to declare uObstacle/hasObstacle and
                // interpolate obstacleSolidityGLSL). At violent speeds the
                // characteristic spans 10-30 texels and crosses collider
                // walls — dye near an edge samples its history from the FAR
                // side and "teleports" through, shredding edges into grain
                // (measured: edge-zone dye HF 0.73 vs 0.17 open field at
                // speed 2400, 2026-07-14). Two probes shorten the step so
                // sampling stays on this side of the wall. At rest disp is
                // exactly 0, both probes read vUv, and the bit-stability
                // guarantee is untouched. MacCormack stays coherent because
                // this lives in the SHARED snippet with identical uniforms
                // on all three dye passes.
                if (hasObstacle == 1) {
                    if (solidity(clamp(vUv - disp * 0.5, 0.0, 1.0)) > 0.5) disp *= 0.25;
                    else if (solidity(clamp(vUv - disp, 0.0, 1.0)) > 0.5) disp *= 0.5;
                }
                // P15-1 wetness: dry paint holds, wet paint flows. Scales the
                // final displacement so dry regions set
                // in place. dyeMobility is EXACTLY 1.0 when wetInfluence<=0
                // (velocity pass + feature off) — bit-identical no-op — and disp
                // is already 0 at rest, so the settle/bit-stability guarantee is
                // untouched. Shared here so all three dye passes displace alike.
                disp *= dyeMobility(vUv);
        `;
        const advectionFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uVelocity, uSource;
            uniform sampler2D uObstacle;
            uniform vec2 texelSize;
            uniform vec2 obstacleTexelSize;
            uniform vec2 srcTexelSize; // texel size of uSource (dye and sim grids differ)
            uniform float dt, dissipation;
            uniform vec2 uVelToUv; // velocity units → UV per axis (rk2Backtrace)
            uniform float decayDt; // accumulated decay timestep; 0.0 = skip decay this frame
            uniform float uVelCap; // speed ceiling in canvas-widths/s (Max Speed slider)
            uniform float srcGate; // M1: 1 = taper growth amplification by speed headroom
            uniform float hfFloorDye; // M2: dye Nyquist-removal strength (0 = off)
            uniform float frozen; // 1.0 = freeze mode (preserve artwork, skip drains)
            uniform float bloomCeiling; // >0: cap dye's max channel here (Gate breathing safety)
            uniform float obsFlowKeep; // 1 = spare MOVING dye from the wall drain (0 = legacy)
            uniform float obsDrainRate;   // per-frame wall-interior dye drain (0 = off)
            uniform float obsDrainDilate; // 1 = drain the dilated wall band (legacy), 0 = cores only
            // ── Pigment memory (dye alpha) ──────────────────────────────
            // Dye alpha used to be a vestigial copy of the decay — written
            // 1.0 by every splat, then multiplied down alongside rgb, and
            // read by nothing that needed it. It now carries the strength
            // this dye was PAINTED at, which is the one thing multiplicative
            // decay destroys: decay scales all channels alike, so hue
            // survives but magnitude is gone, and a faded bright red is
            // indistinguishable from a fresh dark red. Ignite needs that
            // distinction to restore the original color rather than merely
            // amplify a remnant.
            uniform float memDiss;      // memory's own (much slower) decay base
            uniform float uRestore;     // 0..1: how far toward remembered strength this frame
            uniform float uRestoreGain; // overshoot past it — the "and brighter"
            uniform float edgeAbsorb; // >0: absorbing borders — fluid vents off-canvas instead of bouncing
            uniform float edgeAbsorbBand; // drain band width, fraction of the canvas per axis
            uniform vec2 floorDrain; // Gravity's floor drain: pull direction (UV, +y up) x rate; 0 = off
            uniform vec2 floorBand;  // its band width per axis, UV (same pixel width on every edge)
            uniform int isDensity;
            uniform int hasObstacle;
            uniform int macMode; // 1 = uSource is the already-advected MacCormack
                                 // result (macCorrectFrag output): self-fetch it
                                 // and apply only the decay/drain logic below.
            ${obstacleSolidityGLSL}
            ${mobilityGLSL}
            void main() {
                ${rk2Backtrace}
                vec2 coord = (macMode == 1) ? vUv : clamp(vUv - disp, 0.0, 1.0);
                // Time-independent dissipation: pow(d, t*60) so decay rate is
                // constant regardless of framerate. 60.0 = reference FPS these
                // values were tuned for. Uses decayDt, not dt: when dt is tiny
                // (uncapped Electron framerates, low timeScale) a per-frame
                // multiply shrinks below half-float texture precision and
                // rounds back to the same value — dye then never fades. The
                // CPU side accumulates time across frames and hands it over
                // (as decayDt) only when the step is large enough to survive
                // fp16 rounding; in between decayDt is 0 and pow() returns
                // exactly 1.0 (a true no-op).
                float decay = pow(dissipation, decayDt * 60.0);
                // Bilinear on purpose: an interpolating cubic (Catmull-Rom)
                // was tried here and etched permanent pixel-scale crackle —
                // its >1 mid-frequency gain slowly amplifies noise in this
                // forever-feedback loop, even min/max-clamped. Bilinear only
                // attenuates, which keeps the field clean; the settle ease-out
                // above is what prevents its terracing artifact at rest.
                vec4 source = texture(uSource, coord);
                vec4 color = decay * source;
                if (isDensity == 1) {
                    vec2 vel = texture(uVelocity, vUv).xy;
                    float speed = length(vel);
                    // Stillness boost: accelerate decay for still fluid using
                    // multiplicative factor on ALL channels (RGB + alpha stay
                    // coherent — no separate alpha drain). Smooth exponential
                    // falloff avoids the binary still/moving boundary that
                    // caused patchy disappearance with vorticity confinement.
                    // Skip entirely when frozen (dissipation ~1.0 = preserve mode)
                    float effectiveDecay = decay;
                    // Also applied on slow presets whenever a collision mask is
                    // active: obstacles pin pockets of dye in place (velocity is
                    // damped around them), and motionless pinned dye is an
                    // artifact there, not aesthetic. Never in freeze mode —
                    // frozen artwork must not erode.
                    // Batched on decayDt like the base decay (a per-frame
                    // 0.5%·dt boost also rounds to nothing in fp16 at tiny dt).
                    // Coverage-normalized "am I at/inside a wall" factor, shared
                    // by the stillness boost and the drain below. Uses the
                    // INTERIOR band (0.55→0.95 of coverage): the D0.5 blurred
                    // obstacle field has wide soft skirts, and the old raw-value
                    // tests read the whole skirt as near-wall — a visible
                    // forced-dissipation halo around detailed masks
                    // ("something forcing dissipation", 2026-07-14).
                    float obsInterior = 0.0;
                    // Wall-drain coverage (2026-08-11). Same idea as obsInterior
                    // but WITHOUT the dilation — see the drain below for why the
                    // dilated field cannot be the one that decides what to eat.
                    float obsCore = 0.0;
                    // Pinned-dye gate for the wall drain further down (2026-08-11).
                    // 1 = this dye cannot get out (drain it), 0 = it is flowing
                    // (leave it alone). See the drain for the measurements.
                    float obsPinned = 1.0;
                    if (hasObstacle == 1) {
                        // Dilate by one sim texel: sub-texel mask gaps and the
                        // thin pinned rim still count as wall-adjacent.
                        // (Componentwise max of the RG texels — the dilated
                        // strength ratio can mix two colliders at a seam,
                        // which is exactly the wall-adjacent semantics the
                        // dilation wants.)
                        vec4 obTc = texture(uObstacle, vUv);
                        float covOwn = obsTexCoverage(obTc, uObsMax);
                        vec4 obsD = obTc;
                        obsD = max(obsD, texture(uObstacle, vUv + vec2(obstacleTexelSize.x, 0.0)));
                        obsD = max(obsD, texture(uObstacle, vUv - vec2(obstacleTexelSize.x, 0.0)));
                        obsD = max(obsD, texture(uObstacle, vUv + vec2(0.0, obstacleTexelSize.y)));
                        obsD = max(obsD, texture(uObstacle, vUv - vec2(0.0, obstacleTexelSize.y)));
                        float covD = obsTexCoverage(obsD, uObsMax);
                        // Scaled by the strength response: leaky (low-strength)
                        // walls legitimately let dye THROUGH — draining it
                        // there would eat paint the physics allows to pass.
                        // Per texel (2026-08-31): a weak collider drains at its
                        // OWN response even with a strength-1.0 wall elsewhere.
                        obsInterior = obsTexResponse(obsD, uObsMax) * smoothstep(0.55, 0.95, covD);
                        obsCore = mix(obsTexResponse(obTc, uObsMax), obsTexResponse(obsD, uObsMax), obsDrainDilate)
                                * smoothstep(0.55, 0.95, mix(covOwn, covD, obsDrainDilate));
                        // Speed separates pinned dye from dye merely PASSING a
                        // wall. Measured on the fine dot lattice (UV/s, sim 512):
                        // wall interior 1e-5 median / 1.2e-3 p90, the partial
                        // coverage skirt and the gaps between details 5e-3 to
                        // 4e-2, open fluid ~1e-1. The window sits in the gap, so
                        // interiors keep ~98% of the drain and anything actually
                        // transporting keeps its paint.
                        obsPinned = 1.0 - obsFlowKeep * smoothstep(0.001, 0.012, speed);
                    }
                    if ((dissipation < 0.999 || hasObstacle == 1) && frozen < 0.5) {
                        // M3 units: speed is UV/s now (was cells/s). The old
                        // constant (30, tuned at 512) must scale by the 512
                        // reference or "still" reads slow-drifting dye as
                        // settled and the clearing boost erodes moving artwork.
                        float stillness = exp(-speed * 15360.0);
                        float boostRate = stillness * 0.005 * decayDt * 60.0;
                        // On preserve-style presets (dissipation ≈ 1.0) the
                        // boost exists ONLY to clear dye pinned in walls — keep
                        // it wall-local instead of eroding the whole artwork
                        // the moment any mask is active.
                        if (dissipation >= 0.999) boostRate *= obsInterior;
                        effectiveDecay *= max(1.0 - boostRate, 0.95);
                    }
                    color = effectiveDecay * source;
                    // Memory rides its own clock. Everything above reassigns
                    // the whole vec4 from source, so this must come AFTER the
                    // last such write or the slow decay gets clobbered by the
                    // fast one. Still batched on decayDt, so it inherits the
                    // same fp16-rounding protection and stays an exact no-op
                    // on skip frames. The drains further down (obstacle,
                    // cleanup, edge) DO apply to alpha on purpose: memory of
                    // dye that is being removed should go with it.
                    color.a = source.a * pow(memDiss, decayDt * 60.0);
                    // M2 dye spectral floor: remove a fraction of the dye's
                    // Laplacian (Nyquist) component where the fluid is MOVING.
                    // Bilinear transport physically cannot sustain per-texel
                    // contrast in moving dye — whatever is there is numerical
                    // (wall-injection speckle that preserve/growth presets
                    // never decay: the measured 17.7→24.1→31.6 dyeHF ratchet).
                    // Still dye and frozen artwork: motion gate is exactly 0.
                    // Straight edges: zero Laplacian — moving fronts stay crisp.
                    if (hfFloorDye > 0.0 && frozen < 0.5) {
                        vec4 nAvg = 0.25 * (
                            texture(uSource, clamp(coord + vec2(srcTexelSize.x, 0.0), 0.0, 1.0)) +
                            texture(uSource, clamp(coord - vec2(srcTexelSize.x, 0.0), 0.0, 1.0)) +
                            texture(uSource, clamp(coord + vec2(0.0, srcTexelSize.y), 0.0, 1.0)) +
                            texture(uSource, clamp(coord - vec2(0.0, srcTexelSize.y), 0.0, 1.0)));
                        vec4 hfc = color - effectiveDecay * nAvg;
                        // Gate opens at slow DRIFT (0.03-0.3 dye texels/frame
                        // ≈ 2-20 texels/s): any transport at all makes
                        // per-texel contrast physically unsustainable, and the
                        // wall-injected speckle lives in slow-moving dye near
                        // colliders — a fast-transport-only gate misses it
                        // (measured: ratchet 14→27→34 survived at 0.5-4).
                        // True stillness (settle ease-out zeroes disp) stays
                        // exactly 0 — frozen artwork untouched.
                        float transportTexels = length(disp / srcTexelSize);
                        float mGate = smoothstep(0.03, 0.3, transportTexels);
                        float kD = min(hfFloorDye * mGate * (dt * 60.0), 0.85);
                        // RGB only: subtracting a Laplacian from the memory
                        // channel would carve contrast into it, and memory has
                        // no visible speckle to remove — it is a scalar the
                        // dye carries, not something the eye ever sees.
                        color.rgb -= hfc.rgb * kD;
                        color.rgb = max(color.rgb, 0.0);
                    }
                    // ── Ignite: restore the color it was PAINTED at ────────
                    // The multiplier is memory/current, so it is exactly 1.0
                    // on fresh paint (a true no-op — you cannot over-ignite a
                    // full-strength stroke) and grows as dye fades. That is
                    // the whole point: scaling up a faded remnant just makes a
                    // dim colour brighter-dim, whereas this lands back on the
                    // original and uRestoreGain carries it past.
                    if (uRestore > 0.0) {
                        float mxNow = max(color.r, max(color.g, color.b));
                        float want = color.a * uRestoreGain;
                        // 1e-5 guard: fully-drained dye has no ratios left to
                        // renormalize, and reviving it would resurrect texels
                        // the cleanup below deliberately zeroed.
                        if (mxNow > 1e-5 && want > mxNow) {
                            color.rgb *= mix(1.0, want / mxNow, uRestore);
                        }
                    }
                    // Bloom ceiling (Gate breathing): the up-phase (dissipation
                    // > 1) grows dye into HDR; without a cap it eventually
                    // tone-maps out to white. Scale the WHOLE color down when
                    // the dominant channel hits the ceiling — hue-preserving,
                    // unlike a per-channel clamp which drifts toward white.
                    if (bloomCeiling > 0.0) {
                        float mxCh = max(color.r, max(color.g, color.b));
                        if (mxCh > bloomCeiling) color.rgb *= bloomCeiling / mxCh;
                    }
                    // Obstacle-aware drain: dye inside collision masks cannot
                    // advect out (velocity is damped to zero there), so dissolve
                    // it FASTER, not slower — the old slow-decay override pinned
                    // a burned-in imprint of the mask shape. Real collision maps
                    // are written at collisionStrength (default 0.7) with
                    // antialiased detail, so the curve must saturate well below
                    // 1.0 and the drain must apply on slow presets too (gate at
                    // 0.9999 excludes only true freeze, which preserves artwork).
                    // Gated by the explicit freeze flag rather than dissipation:
                    // the density slider magnetically snaps to exactly 1.0, and
                    // dye pinned against colliders must still drain there — only
                    // true freeze mode preserves it.
                    if (hasObstacle == 1 && frozen < 0.5) {
                        // Interior-only drain (obsInterior above): dissolve dye
                        // pinned INSIDE walls, not the AA skirt around them.
                        // The old raw-value curve (smoothstep 0→0.45) plus a
                        // ±3-texel apron, applied to the blurred coverage
                        // field, drained a wide band around every mask edge —
                        // on a fine-detail mask that band covered virtually
                        // the whole region (the burned halo + forced fade).
                        // The stagnation-pile-up the apron used to clear is
                        // handled by the obstacle-aware projection now (flow
                        // deflects instead of ramming).
                        //   WHAT IT EATS (2026-08-11). obsInterior dilates
                        // coverage by a SIM texel to catch sub-texel gaps and the
                        // thin pinned rim — which at dye resolution is a 4-texel
                        // band around every wall. Fine for a few big shapes; on an
                        // INTRICATE collider that band is most of the region, and
                        // the fluid flows straight through it, so at 6%/frame it
                        // stopped being a drain and became a dye SINK. Measured on
                        // a fine dot lattice (strength 1.0): partial-coverage
                        // texels kept 2-4% of their dye over 2s where open fluid
                        // kept 54%, and total dye mass fell to 0.59x the
                        // collider-free run — the "intricate collider dulls
                        // everything" report. Loudest under Gate, whose dye is
                        // capped at the picked colour and so has no HDR headroom
                        // to hide the loss.
                        //   So the drain gets its own coverage (obsCore, the
                        // texel's OWN by default) and a flow gate (obsPinned):
                        // dye that is genuinely stuck still dissolves — wall
                        // interiors are damped to a standstill, verified 99.8%
                        // cleared in the paint-then-add-collider burn-in case —
                        // while dye in transit keeps its paint. Measured on the
                        // same lattice at strength 0.9: displayed value +50%,
                        // lit area 0.11 -> 0.56 of the collider region.
                        color *= 1.0 - obsCore * obsPinned * obsDrainRate * dt * 60.0;
                    }
                    // Guaranteed-zero cleanup. Multiplicative decay alone never
                    // reaches zero (and half-float storage stalls it at a dim
                    // visible floor), which left a permanent residue wash that
                    // new paint interacted with badly. Both steps run on the
                    // batched decayDt so they too survive fp16 rounding at tiny
                    // per-frame timesteps (and stay no-ops on skip frames).
                    if (decayDt > 0.0) {
                        // 1) Linear floor drain, proportional to the preset's decay
                        //    rate so slow "smoke" presets keep their long tails and
                        //    freeze mode (dissipation = 1.0) is untouched.
                        float floorEps = (1.0 - min(dissipation, 1.0)) * 0.02 * decayDt * 60.0;
                        color = max(color - floorEps, 0.0);
                        // 2) Smooth low-end ramp to zero (replaces the old binary
                        //    "< 0.001 → 0" snap, whose hard cutoff created jagged
                        //    boundaries between cleared and not-yet-cleared texels).
                        float maxC = max(max(color.r, color.g), color.b);
                        color *= smoothstep(0.0003, 0.0015, maxC);
                    }
                } else {
                    // Velocity pass: keep alpha at 1.0
                    color.a = 1.0;
                    // fp16 safety valve + speed ceiling: velocity is stored in
                    // half floats (max 65504). Choked pockets in fine collision
                    // masks accumulate injected energy they can't advect away,
                    // and GROWTH presets (VELOCITY_DISSIPATION > 1) amplify
                    // energy forever inside closed pockets — either rides to
                    // Inf → NaN → total field breakdown without a ceiling.
                    // Resolution-proportional (cells/s scale with sim res;
                    // uVelCap is in canvas-widths/s, user slider "Max Speed").
                    // SOFT KNEE (2026-07-15): a hard clamp pinned growth-preset
                    // pockets at exactly max speed — chaotic jitter-churn in
                    // whichever mask pocket reached the ceiling while its
                    // neighbors stayed smooth. Above 70% of the cap, speed
                    // compresses rationally toward the cap as an asymptote —
                    // capped pockets settle into a smooth bounded swirl.
                    // Exact no-op below the knee.
                    // 45000 hard ceiling: at very high sim res the
                    // resolution-proportional cap would approach the fp16
                    // limit itself (30 widths/s × 2048 = 61k vs max 65504)
                    float capSpd = max(uVelCap, 0.0);
                    // M1 source gate (2026-07-17): growth presets (decay > 1)
                    // amplify energy every frame; at the ceiling that inflow
                    // is exactly what the knee below must strip back out — and
                    // the strip is not divergence-free, so the next projection
                    // answers with a push-back impulse. Inject → cap → rebound
                    // → re-inject: a limit cycle sitting on the knee, read as
                    // "jiggle" at top speed. Taper the GROWTH component to
                    // neutral as speed approaches the cap so the steady state
                    // settles BELOW the knee and the knee becomes a transient-
                    // only backstop. Exact no-op below 45% of the cap and on
                    // decay presets (decay ≤ 1).
                    if (srcGate > 0.5 && decay > 1.0) {
                        float spd0 = length(color.xy);
                        float g = 1.0 - smoothstep(0.45 * capSpd, 0.7 * capSpd, spd0);
                        color.xy *= (1.0 + (decay - 1.0) * g) / decay;
                    }
                    float knee = capSpd * 0.7;
                    float spd = length(color.xy);
                    if (spd > knee) {
                        float range = capSpd * 0.3;
                        float excess = spd - knee;
                        float compressed = knee + excess / (1.0 + excess / range);
                        color.xy *= compressed / spd;
                    }
                }
                // Overflow mode rim drain: with open boundaries (divergence and
                // gradient passes stop treating edges as walls) outbound fluid
                // exits freely — this drain at the rim guarantees whatever
                // crosses it dies there and never washes back in via the
                // clamped edge texels. Its width is the Border slider
                // (edgeAbsorbBand, canvas fraction per axis): at the 0.025
                // default it is a hairline sitting at the border rather than
                // inside the composition; wider bands visibly eat into the
                // frame, which is the point of exposing it.
                if (edgeAbsorb > 0.0) {
                    float ed = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
                    // Floor the width: smoothstep(0.0, 0.0, x) is undefined.
                    float bandK = (1.0 - smoothstep(0.0, max(edgeAbsorbBand, 1e-4), ed)) * edgeAbsorb;
                    color *= max(0.0, 1.0 - bandK * 0.55 * dt * 60.0);
                    if (isDensity == 0) color.a = 1.0;
                }
                // Gravity's floor drain (2026-09-22): the edge the pull points
                // at eats the paint that reaches it, the way paint runs off the
                // bottom of a canvas. Without it everything that falls piles
                // into a still layer against that wall, and once the pile
                // spans the canvas there is nothing left for the pull to move
                // (Gabriel: gravity "has to be paired with a kind of eating
                // force"). A diagonal pull drains both edges it points at, each
                // by its share. Dye only (the walls stay walls for the flow),
                // alpha included like the other drains, and never while
                // frozen. Measured on a fully painted canvas with the pad
                // straight down: without it the fall stops within ~3 s and the
                // motion winds down (paint-weighted speed 0.51 at 2 s, 0.28 at
                // 10 s); with it the canvas is still turning over at 10 s
                // (~0.5), the floor never silts up (share of the paint in the
                // bottom 15%: 0.10 vs 0.15), and about a third of the paint
                // has poured off by then.
                if (isDensity == 1 && frozen < 0.5 && (floorDrain.x != 0.0 || floorDrain.y != 0.0)) {
                    float fk = max( floorDrain.x, 0.0) * (1.0 - smoothstep(0.0, floorBand.x, 1.0 - vUv.x))
                             + max(-floorDrain.x, 0.0) * (1.0 - smoothstep(0.0, floorBand.x, vUv.x))
                             + max( floorDrain.y, 0.0) * (1.0 - smoothstep(0.0, floorBand.y, 1.0 - vUv.y))
                             + max(-floorDrain.y, 0.0) * (1.0 - smoothstep(0.0, floorBand.y, vUv.y));
                    color *= max(0.0, 1.0 - fk * dt * 60.0);
                }
                fragColor = color;
            }
        `;
        // ─── MacCormack dye advection, passes 1–2 of 3 ──────────────────
        // (Selle et al. 2008 via GPU Gems 3 ch. 30.) Pass 1 (macAdvectFrag):
        // plain forward semi-Lagrangian advect of the dye → φ̂ⁿ⁺¹, no decay
        // or drains — those run exactly once, in the main advection pass,
        // which consumes pass 2's output with macMode=1. Bilinear on purpose
        // throughout, same reason as the main pass: kernels with >1 gain
        // etch permanent artifacts in this forever-feedback loop.
        const macAdvectFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uVelocity, uSource;
            uniform sampler2D uObstacle; // for the shared backtrace's probes
            uniform vec2 texelSize;    // sim-grid texel (velocity lives there)
            uniform vec2 srcTexelSize; // dye-grid texel
            uniform float dt;
            uniform vec2 uVelToUv;     // velocity units → UV per axis (rk2Backtrace)
            uniform int hasObstacle;
            ${obstacleSolidityGLSL}
            ${mobilityGLSL}
            void main() {
                ${rk2Backtrace}
                fragColor = texture(uSource, clamp(vUv - disp, 0.0, 1.0));
            }
        `;
        // Pass 2: back-advect φ̂ⁿ⁺¹ to estimate the scheme's own error, apply
        // half of it as a correction, then LIMIT. The limiter (clamp to the
        // min/max of the 4 dye texels the forward lookup interpolated
        // between) is what makes this safe where Catmull-Rom crackled: the
        // corrected value can never be a new local extremum, so per-texel
        // gain stays ≤ 1 across frames. At rest the shared ease-out zeroes
        // disp, every fetch is an exact self-fetch, the correction is
        // exactly 0.0, and the output equals the input bit-for-bit — the
        // settled-fluid banding fix survives unchanged.
        const macCorrectFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uVelocity;
            uniform sampler2D uSource;   // φⁿ  (dye, pre-advection)
            uniform sampler2D uForward;  // φ̂ⁿ⁺¹ (macAdvectFrag output)
            uniform sampler2D uObstacle;
            uniform vec2 texelSize;      // sim-grid texel
            uniform vec2 srcTexelSize;   // dye-grid texel
            uniform float dt;
            uniform vec2 uVelToUv;       // velocity units → UV per axis (rk2Backtrace)
            uniform int hasObstacle;
            uniform float deband;        // 0 = off (bit-exact); >0 softens fast-moving dye cliffs
            ${obstacleSolidityGLSL}
            ${mobilityGLSL}
            void main() {
                ${rk2Backtrace}
                vec4 fwd = texture(uForward, vUv);
                vec2 fwdCoord = vUv - disp;   // where pass 1 sampled φⁿ
                vec2 backCoord = vUv + disp;  // back-advection of φ̂ⁿ⁺¹
                // Revert to plain semi-Lagrangian (correction = 0) when the
                // characteristic leaves the domain — clamped edge fetches
                // would fabricate error — or touches an obstacle, where
                // MacCormack's dispersive overshoot rings against the wall
                // (Selle 2008 practice).
                float revert = 0.0;
                if (fwdCoord.x < 0.0 || fwdCoord.x > 1.0 || fwdCoord.y < 0.0 || fwdCoord.y > 1.0 ||
                    backCoord.x < 0.0 || backCoord.x > 1.0 || backCoord.y < 0.0 || backCoord.y > 1.0) revert = 1.0;
                if (hasObstacle == 1) {
                    float obs = max(texture(uObstacle, vUv).r,
                                    texture(uObstacle, clamp(fwdCoord, 0.0, 1.0)).r);
                    if (obs > 0.05) revert = 1.0;
                }
                vec2 velocityTexel = 1.0 / vec2(textureSize(uVelocity, 0));
                vec2 velocityC = texture(uVelocity, vUv).xy;
                vec2 velocityAvg = 0.25 * (
                    texture(uVelocity, clamp(vUv + vec2(velocityTexel.x, 0.0), 0.0, 1.0)).xy +
                    texture(uVelocity, clamp(vUv - vec2(velocityTexel.x, 0.0), 0.0, 1.0)).xy +
                    texture(uVelocity, clamp(vUv + vec2(0.0, velocityTexel.y), 0.0, 1.0)).xy +
                    texture(uVelocity, clamp(vUv - vec2(0.0, velocityTexel.y), 0.0, 1.0)).xy);
                float velocityHF = length(velocityC - velocityAvg);
                float velocityRelativeHF = velocityHF / max(length(velocityC), 0.01);
                float transportGate = smoothstep(1.0, 8.0, length(disp / srcTexelSize));
                float noisyTransport = smoothstep(0.15, 0.6, velocityRelativeHF) * transportGate;
                // SMOOTH revert (was a hard "noisyTransport > 0.35 -> revert = 1.0"
                // cliff). velocityRelativeHF is curl-driven, so at MID curl it sat
                // right on the 0.35 line and this flag flipped 0/1 patchily across
                // space AND frame-to-frame as the dye decayed -- the "terraces only
                // at half curl" artifact (CURL 0 stayed below the line = full
                // MacCormack, CURL 60 stayed above = full diffusive, both stable and
                // fine). A smoothstep keeps those two extremes but ramps the
                // borderline, so the MacCormack/semi-Lagrangian blend shifts
                // gradually instead of snapping -- decay stays clean at every curl.
                revert = max(revert, smoothstep(0.2, 0.55, noisyTransport));
                vec4 phiN  = texture(uSource, vUv);
                vec4 backN = texture(uForward, clamp(backCoord, 0.0, 1.0));
                vec4 corrected = fwd + 0.5 * (phiN - backN);
                // Limiter: 4-corner neighborhood of the forward lookup in φⁿ.
                ivec2 sz = textureSize(uSource, 0);
                vec2 st = clamp(fwdCoord, 0.0, 1.0) * vec2(sz) - 0.5;
                ivec2 base = ivec2(floor(st));
                ivec2 maxT = sz - 1;
                vec4 t00 = texelFetch(uSource, clamp(base,               ivec2(0), maxT), 0);
                vec4 t10 = texelFetch(uSource, clamp(base + ivec2(1, 0), ivec2(0), maxT), 0);
                vec4 t01 = texelFetch(uSource, clamp(base + ivec2(0, 1), ivec2(0), maxT), 0);
                vec4 t11 = texelFetch(uSource, clamp(base + ivec2(1, 1), ivec2(0), maxT), 0);
                vec4 mn = min(min(t00, t10), min(t01, t11));
                vec4 mx = max(max(t00, t10), max(t01, t11));
                corrected = clamp(corrected, mn, mx);
                // De-band ("organic") taper: where dye is BOTH hard-edged and
                // moving fast, MacCormack's anti-diffusion razors smooth shear
                // into 1-2 texel cliffs → terraces. Worst with no curl, where
                // the turbulence revert above never fires (smooth velocity =
                // low relative-HF). Blend back toward plain diffusive semi-
                // Lagrangian (fwd) ∝ local dye contrast × transport speed.
                // Static edges (fastMove≈0) and soft gradients (dyeContrast≈0)
                // are untouched; deband=0 is a bit-exact no-op.
                if (deband > 0.0) {
                    float dyeContrast = length((mx - mn).rgb);
                    float fastMove = smoothstep(2.0, 10.0, length(disp / srcTexelSize));
                    float db = smoothstep(0.15, 0.5, dyeContrast) * fastMove * deband;
                    corrected = mix(corrected, fwd, db);
                }
                fragColor = mix(corrected, fwd, revert);
            }
        `;
        // ─── Wetness field: advect + dry (P15-1) ────────────────────────
        // The wetness map is carried by the flow (semi-Lagrangian, the SAME
        // shared rk2Backtrace as the dye — wetInfluence=0 so the
        // field itself transports at full mobility) and dries via a batched
        // half-life decay. dryMul is accumulated CPU-side exactly like the
        // dye's decayDt so the multiply survives fp16 rounding at tiny
        // timesteps; dryMul==1.0 on a skip frame is an exact no-op. Single
        // channel (R16F, sim res). Because wetInfluence=0 here, dyeMobility
        // never samples uWetness — no read-while-writing hazard.
        const wetnessAdvectFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uVelocity, uSource;
            uniform sampler2D uObstacle;   // shared backtrace probes
            uniform vec2 texelSize;        // sim-grid texel (velocity)
            uniform vec2 srcTexelSize;     // wetness-grid texel (== sim res)
            uniform float dt;
            uniform vec2 uVelToUv;         // velocity units → UV per axis (rk2Backtrace)
            uniform float dryMul;          // batched half-life factor (1.0 = no-op)
            uniform int hasObstacle;
            ${obstacleSolidityGLSL}
            ${mobilityGLSL}
            void main() {
                ${rk2Backtrace}
                float w = texture(uSource, clamp(vUv - disp, 0.0, 1.0)).r;
                w *= dryMul;
                // Guaranteed-zero floor: a pure multiply stalls at a dim fp16
                // residue, which would leave the field permanently damp. Ramp
                // the last sliver to exactly 0 so dried regions read bone dry.
                w = (w < 0.002) ? 0.0 : w;
                fragColor = vec4(w, 0.0, 0.0, 1.0);
            }
        `;
        // ─── Wetness deposit (P15-1) ────────────────────────────────────
        // A stroke wets the paper. Saturating gaussian dab: w = max(src, g)
        // so overlapping dabs pool toward fully wet (1.0) without exceeding
        // it (additive would blow past 1 and never dry). Same gaussian form
        // and aspect correction as splatFrag, so the wet footprint lines up
        // with the dye dab. Sim res, single channel.
        const wetSplatFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTarget;     // current wetness
            uniform float aspectRatio;
            uniform vec2 point;            // splat center (uv)
            uniform float radius;          // gaussian width² (p-space, == dye dab)
            uniform float amount;          // peak deposit (0..1)
            void main() {
                float src = texture(uTarget, vUv).r;
                vec2 p = vUv - point;
                p.x *= aspectRatio;
                float g = exp(-dot(p, p) / radius) * amount;
                fragColor = vec4(clamp(max(src, g), 0.0, 1.0), 0.0, 0.0, 1.0);
            }
        `;
        // Obstacle-aware projection (divergence/pressure/gradient below):
        // solids participate in the pressure solve itself, so flow deflects
        // AROUND collision masks instead of ramming into them and relying on
        // the post-hoc damp pass to kill it there (the root cause of dye
        // piling at stagnation zones — the burn-halo class). The obstacle
        // texture is treated as a continuous fluid/solid fraction, not a
        // binary mask: real masks are written at collisionStrength (default
        // 0.7) with antialiased edges, so the curve saturates at 0.5 — same
        // convention as the splat shader's obsBlock. (The multigrid solve
        // will restrict these fractions down its pyramid — keep them float.)
        // (obstacleSolidityGLSL is defined ABOVE rk2Backtrace — the dye
        // advection passes now include it too, for the obstacle-aware
        // backtrace probes.)
        const divergenceFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv, vL, vR, vT, vB;
            out vec4 fragColor;
            uniform sampler2D uVelocity;
            uniform sampler2D uObstacle;
            uniform float openBoundary; // 1 = overflow mode: edges stop being walls
            uniform float pScale; // fp16 headroom rescale of the WHOLE pressure
                                  // system (default 1/64). The multigrid solve
                                  // actually converges the true pressure, whose
                                  // peaks under fast multi-arm strokes SATURATE
                                  // fp16 (measured pegged at 65504, 2026-07-14):
                                  // the clipped plateau's gradients go wrong and
                                  // the projection glitches erratically right
                                  // under fast strokes — the speed-scaled jitter.
                                  // Scaling the RHS here scales the linear system
                                  // end-to-end (solve, MG pyramid, warm start are
                                  // all linear); gradientFrag divides it back out.
                                  // fp16 RELATIVE precision is scale-invariant,
                                  // so mild regimes are visually identical.
            uniform int hasObstacle;
            uniform float uDivMask; // 1 = cut-cell RHS weighting (default),
                                    // 0 = legacy (config.OBS_DIV_MASK)
            ${obstacleSolidityGLSL}
            vec2 sampleVelocity(vec2 uv) {
                vec2 m = vec2(1.0);
                // Closed boundary: mirror velocity beyond the edge so the
                // pressure solve sees a wall. Open boundary (overflow mode):
                // zero-gradient instead — flow exits without pushback.
                if(uv.x < 0.0 || uv.x > 1.0) { uv.x = clamp(uv.x, 0.0, 1.0); if (openBoundary < 0.5) m.x = -1.0; }
                if(uv.y < 0.0 || uv.y > 1.0) { uv.y = clamp(uv.y, 0.0, 1.0); if (openBoundary < 0.5) m.y = -1.0; }
                vec2 v = m * texture(uVelocity, uv).xy;
                // Solid neighbors contribute zero velocity: the solve then
                // computes the pressure that pushes flow around the wall.
                if (hasObstacle == 1) v *= 1.0 - solidity(uv);
                return v;
            }
            void main() {
                float div = 0.5 * (sampleVelocity(vR).x - sampleVelocity(vL).x +
                                   sampleVelocity(vT).y - sampleVelocity(vB).y);
                // Cut-cell RHS (2026-08-31): a mostly-solid cell holds only
                // (1-s) of a cell's fluid, so its mass-conservation source
                // must scale with that fraction. Without this, divergence
                // inside a wall (splat leak, damp/projection mismatch)
                // forces the Neumann-mixed pressure equation whose
                // relaxation is ALSO scaled by (1-s) — the forcing wins
                // 1/(1-s) : 1 and pressure inside near-solid walls
                // INTEGRATES instead of relaxing (the sealed-pocket
                // wind-up clearFrag's softClamp valve was built to
                // survive; worst on the warm-started Jacobi path, where
                // no coarse level ever relaxes the interior). Masking the
                // source where solidity is high cancels that amplification
                // exactly and zeroes the interior residual the MG pyramid
                // would otherwise spray back out through its coarse levels.
                if (hasObstacle == 1) div *= 1.0 - uDivMask * solidity(vUv);
                fragColor = vec4(div * pScale, 0.0, 0.0, 1.0);
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
            uniform sampler2D uObstacle;
            uniform float curl, dt;
            uniform int hasObstacle;
            uniform float uObsMax;
            uniform float uCapSpd; // M1: Max Speed cap in cells/s (0 = gate off)
            uniform float uEdgeGate; // >0.5 = fade confinement at the canvas border
            ${obsTexelGLSL}
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
                // Full 2D gradient of |curl| (eta vector)
                vec2 eta = vec2(abs(R) - abs(L), abs(T) - abs(B));
                // Normalize with safety epsilon
                eta = eta / (length(eta) + 0.00001);
                // Vorticity confinement: force = curl_strength * (eta × omega)
                // In 2D, cross(eta, omega_z) = vec2(eta.y, -eta.x) * omega_z
                // Dead zone: suppress confinement when curl magnitude is below
                // the noise floor to prevent eta normalization from amplifying
                // tiny numerical differences into spurious rotational forces.
                float absC = abs(C);
                float gate = smoothstep(0.0, 0.0005, absC);
                // Obstacle apron gate (2026-07-16): the velocity discontinuity
                // at a collider wall reads as a huge curl spike, so confinement
                // kicked energy INTO the wall every frame — with a well-
                // converged pressure solve (multigrid) this closed a feedback
                // loop (kick → projection slams it along the wall → sharper
                // shear → bigger curl → bigger kick) that pinned pockets at
                // the velocity cap and shredded dye into grid-scale fuzz
                // (strength-1.0 logo-collider breakdown). Measured at 512,
                // CURL 25, MG 2 cycles: velocity-HF 360 → 195, peak stored
                // pressure 6.5k → 2.7k, velocity unpinned from the cap
                // (8-10k → 3.5-7k) — identical to CURL 0 near walls while
                // the bulk keeps full confinement. Confinement is a
                // bulk-fluid effect; it has no business at walls. The cross
                // max of LINEAR obstacle samples widens the apron ~1 texel
                // past the wall so the gate covers the whole discontinuity.
                if (hasObstacle == 1) {
                    // Per-texel coverage (2026-08-31): a weak collider's
                    // apron no longer shrinks when a strong collider exists
                    // elsewhere (cov used to be o/uObsMax — half-open gate =
                    // the kick→shear→curl feedback partially returning at
                    // exactly the walls that can least afford it).
                    vec4 o = texture(uObstacle, vUv);
                    o = max(o, texture(uObstacle, cL));
                    o = max(o, texture(uObstacle, cR));
                    o = max(o, texture(uObstacle, cT));
                    o = max(o, texture(uObstacle, cB));
                    float cov = obsTexCoverage(o, uObsMax);
                    gate *= 1.0 - smoothstep(0.05, 0.5, cov);
                }
                // Domain-edge apron (2026-08-16): the canvas border is a shear
                // wall exactly like a collider — mirrored velocity in the
                // divergence pass, hard no-penetration clamp at the outermost
                // texels — but it never got the apron the obstacle branch above
                // has, so the same kick → projection → sharper shear → bigger
                // kick loop ran freely along the edges. Painting into the border
                // was the reported "dye explodes at the edge". Same rationale as
                // the wall apron: confinement is a bulk-fluid effect, it has no
                // business at a boundary. Texel size comes from the existing
                // neighbour varyings, so no new uniform. The smoothstep saturates
                // ~2 texels in, so THIS PASS leaves interior texels untouched —
                // but the pressure solve is global, so the evolved field still
                // differs everywhere over time (no bit-identical A/B here, same
                // as the wall apron). uEdgeGate = 0 disables.
                if (uEdgeGate > 0.5) {
                    vec2 tsz = vec2(abs(vR.x - vUv.x), abs(vT.y - vUv.y));
                    gate *= smoothstep(0.0, 2.0 * tsz.x, min(vUv.x, 1.0 - vUv.x))
                          * smoothstep(0.0, 2.0 * tsz.y, min(vUv.y, 1.0 - vUv.y));
                }
                // M1 source gate (2026-07-17): confinement is an energy
                // INJECTOR — gate it by speed headroom so it stops pumping
                // texels already near the Max Speed ceiling. Pushing on a
                // capped texel doesn't add motion; it adds divergence the
                // projection bounces back (the same feedback family as the
                // wall apron above). uCapSpd = 0 disables (VEL_SOURCE_GATE
                // off). Exact no-op below 45% of the cap.
                vec2 vel = texture(uVelocity, vUv).xy;
                if (uCapSpd > 0.0) {
                    gate *= 1.0 - smoothstep(0.45 * uCapSpd, 0.7 * uCapSpd, length(vel));
                }
                vec2 force = curl * vec2(eta.y, -eta.x) * C * gate;
                fragColor = vec4(vel + force * dt, 0.0, 1.0);
            }
        `;
        // ── Constant pressure field (ambient gravity / lift) ────────
        // A steady directional body force, weighted by how much PAINT is in
        // each texel — and that weighting is the entire reason this works.
        //
        // A UNIFORM body force is curl-free, and the projection step removes
        // exactly the curl-free part. In a closed box (divergenceFrag mirrors
        // velocity at the edges) the solve finds the hydrostatic gradient that
        // cancels gravity outright, so pushing every texel the same way is
        // undone as fast as it is applied — nothing moves. That is the same
        // wall the radial Pressure modes hit from another angle (measured
        // 2026-08-23: a radial dab kept 51% of its speed after six steps while
        // a divergence-free one kept 107%).
        //
        // Scaling by dye makes the field NON-uniform, so its curl is
        // grad(rho) x g — nonzero wherever a dye edge runs across the force.
        // That is the baroclinic term, the same one that makes smoke mushroom:
        // the INTERIOR of a blob does not accelerate (correct, it is
        // incompressible and has nowhere to go) but its EDGES roll. What you
        // see is paint falling, pooling and fingering rather than the whole
        // canvas sliding off one side.
        //
        // BALANCED PULL (2026-09-22). "At high densities it doesn't feel like
        // gravity anymore", and it wasn't: measured, a blob dropped on paint
        // loaded past 1.6 ROSE (-0.066 of the canvas in 2 s where a clear
        // canvas let it fall 0.37), and in a painting session with the pad
        // down, strokes laid on already-painted canvas moved UP on average
        // (-0.03 canvas/s 1/6 s after the dab; the first ten, on clear
        // canvas, fell at +0.05). Two causes, both fixed here:
        //
        //  1. The pull saturated. rho was clamp(max(r,g,b)/1.6, 0, 1), so
        //     paint over paint weighed no more than the paint under it (and a
        //     blue stroke over red weighed nothing extra at all: max, not
        //     sum). Equal weight everywhere is a uniform force, which is
        //     exactly what the projection deletes. The weight is now the
        //     paint's AMOUNT, summed over the channels, so every layer adds
        //     some (ambientWeightGLSL).
        //
        //  2. The part of the pull that is the same all along a row (for a
        //     vertical pull; along a column for a sideways one) moves
        //     nothing in a closed box. It only loads the pressure with the
        //     column's weight. This projection subtracts twice the gradient
        //     its solve converges to (divergenceFrag takes half-differences,
        //     gradientFrag full ones), so that load is not cancelled but
        //     REFLECTED: a uniform pull comes back as a steady drift of about
        //     half a frame's pull the OTHER way (measured: heavy paint drifting
        //     up at 0.03 canvas/s under full gravity). So each texel is now
        //     pulled by how much heavier it is than its own row, and the
        //     lighter fluid beside it is pushed the other way just as hard:
        //     buoyancy, net force zero. With an exact projection the result is
        //     identical (the subtracted part is a pure gradient); with this one
        //     the drift is gone and the pressure stops carrying the column.
        //     The row and column means come from ambientMeanFrag, one tiny
        //     pass before this one.
        //
        // After both: a blob on paint at any load (0.25 to 4.0, same colour or
        // not) falls 0.16-0.20 of the canvas in 2 s, and new strokes keep
        // falling (about +0.1 canvas/s on average) for a whole 30 s session,
        // the pad straight down. On clear canvas a
        // typical stroke falls within ~30% of before (0.25 -> 0.29 in 2 s),
        // and a single blob exactly as before (0.37 -> 0.38).
        //
        // The paint that falls has to go somewhere, or it piles into a still,
        // muddy layer against the floor (the drain in advectionFrag, floorDrain).
        const ambientWeightGLSL = `
            // How heavy the paint in a texel is, in units of a loaded stroke.
            // Thin-paint floor (2026-09-09): the density-proportional pull let
            // a spread-out sheet hang (dye thrown sideways off the crown of a
            // collider, a letter under gravity, thinned to ~0.1 and felt 6%
            // of the gravity, so it sat there as a horizontal streak). Anything
            // visibly painted carries floorShare as a BASE weight; the amount
            // adds on top of it (2026-09-22: it used to be a max, which gave
            // a thin wash and a loaded stroke over it the same weight). The
            // amount is summed over the channels so that paint laid over
            // paint, in any colour, is heavier; capped at 4 so a blown-out
            // highlight does not fall like a stone.
            float ambientWeight(vec3 d, float load, float floorShare) {
                d = max(d, vec3(0.0));
                float mx = max(d.r, max(d.g, d.b));
                return floorShare * smoothstep(0.01, 0.06, mx)
                     + min((d.r + d.g + d.b) / max(load, 1e-4), 4.0);
            }
        `;
        // Row and column means of that weight, over exactly the texels the
        // force pass samples (the sim grid's centres). Target is W x 2 with
        // W = max(sim width, sim height): row 0 holds column means (index =
        // x), row 1 holds row means (index = y). highp on purpose: this is a
        // sum of up to 512 terms and a mediump accumulator would round it
        // away. At most 512 samples per line; above that it strides.
        const ambientMeanFrag = `#version 300 es
            precision highp float;
            precision highp int;
            out vec4 fragColor;
            uniform sampler2D uDensity;
            uniform ivec2 uSim;          // sim grid size
            uniform float uLoad, uFloor;
            ${ambientWeightGLSL}
            void main() {
                int idx = int(gl_FragCoord.x);
                bool colPass = gl_FragCoord.y < 1.0;
                int len = colPass ? uSim.x : uSim.y;
                int n = colPass ? uSim.y : uSim.x;
                if (idx >= len) { fragColor = vec4(0.0); return; }
                int stride = max(1, (n + 511) / 512);
                float s = 0.0, c = 0.0;
                vec2 inv = 1.0 / vec2(uSim);
                for (int i = 0; i < 512; i++) {
                    int k = i * stride;
                    if (k >= n) break;
                    vec2 uv = colPass ? vec2(float(idx) + 0.5, float(k) + 0.5) * inv
                                      : vec2(float(k) + 0.5, float(idx) + 0.5) * inv;
                    s += ambientWeight(texture(uDensity, uv).rgb, uLoad, uFloor);
                    c += 1.0;
                }
                fragColor = vec4(s / max(c, 1.0), 0.0, 0.0, 1.0);
            }
        `;
        const ambientForceFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uVelocity;
            uniform sampler2D uDensity;
            uniform sampler2D uMeans;  // ambientMeanFrag's output
            uniform vec2  uForce;      // direction * intensity, velocity units per second
            uniform float dt;
            uniform float uLoad;       // paint amount that weighs one loaded stroke
            uniform float uCapSpd;     // Max Speed headroom gate (0 = off)
            uniform float uFloor;      // base weight of any VISIBLE paint
                                       // (config.AMBIENT_FORCE_FLOOR, 0 = none)
            uniform float uBalance;    // 1 = weigh against the row/column (default),
                                       // 0 = the old absolute pull
            ${ambientWeightGLSL}
            void main() {
                vec2 vel = texture(uVelocity, vUv).xy;
                float w = ambientWeight(texture(uDensity, vUv).rgb, uLoad, uFloor);
                // The force pass runs on the sim grid, so its fragment IS the
                // texel index the means were taken at.
                ivec2 p = ivec2(gl_FragCoord.xy);
                vec2 around = vec2(texelFetch(uMeans, ivec2(p.x, 0), 0).r,
                                   texelFetch(uMeans, ivec2(p.y, 1), 0).r);
                vec2 f = uForce * (vec2(w) - uBalance * around);
                // Same source gate vorticity uses: stop pushing texels already
                // near the Max Speed ceiling. Pushing a capped texel adds no
                // motion, only divergence for the projection to bounce back.
                if (uCapSpd > 0.0) {
                    f *= 1.0 - smoothstep(0.45 * uCapSpd, 0.7 * uCapSpd, length(vel));
                }
                fragColor = vec4(vel + f * dt, 0.0, 1.0);
            }
        `;
        // ── Attractor field (analytic dye-gather force, 2026-07-18) ─────
        // A DYE-TRANSPORT gather that captures the fluid toward a set of
        // "magnet" points — a sacred-geometry attractor layout the caller
        // scene drives (hex rings / flower-of-life). Runs after dye
        // advection, moving the DYE itself (a semi-Lagrangian resample),
        // NOT the velocity field. Why not a velocity body force: a radial
        // pull is pure divergence, so the incompressible pressure solve
        // fights it and throws an oscillating return flow (measured: blob
        // velocity flips sign frame-to-frame, dye churns outward) — that IS
        // the "shreds / glitches out" failure of velocity-pull. Transporting
        // dye directly (exactly how the Swirl feature offsets the dye
        // backtrace, never the velocity) pools cleanly and CAN'T destabilize
        // the sim: "capture, never shred" by construction.
        //
        // newDye(p) = oldDye(p - toward*speed*dt): each texel pulls dye from
        // its OUTWARD neighbor, so dye creeps inward and beads at the magnet.
        // Gates: (1) fill gate — a filled region stops pulling so the pool
        // settles instead of clipping (and it's the hook for recursive
        // collection: sub-attractors light up inside filled regions); (2) a
        // dead-zone at each exact center so normalize() never jitters. A
        // tangential (swirl) fraction makes each pool orbit/live rather than
        // sit as a dead dot. Negative strength = repel (beat spikes push out).
        const MAX_ATTRACTORS = 12;
        const attractorFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uDensity;   // dye field (this pass reads + writes it)
            uniform float aspectRatio;    // W/H — screen-circular falloff on non-square canvases
            uniform float dt;
            uniform float uForce;         // dye transport rate (UV/s at full falloff)
            uniform float uSwirl;         // tangential fraction (0 = pure radial)
            uniform float uDensityGate;   // 0..1: how hard filled regions back off
            uniform float uMaxDensity;    // dye level treated as "full"
            uniform int   uCount;
            uniform float uKeep;          // 1 = gather may only ADD (see the note below)
            uniform vec2  uVelToUv;       // isotropic units → UV per axis (config.VELOCITY_ISOTROPIC); 0,0 = UV
            uniform vec4  uAtt[${MAX_ATTRACTORS}]; // xy = UV pos, z = signed strength, w = radius (UV)
            void main() {
                vec3 here = texture(uDensity, vUv).rgb;
                float fill = max(here.r, max(here.g, here.b));
                // Filled regions stop gathering (pool settles; no runaway)
                float fillGate = 1.0 - uDensityGate * smoothstep(0.3 * uMaxDensity, uMaxDensity, fill);
                vec2 transport = vec2(0.0);
                for (int i = 0; i < ${MAX_ATTRACTORS}; i++) {
                    if (i >= uCount) break;
                    vec4 A = uAtt[i];
                    vec2 delta = A.xy - vUv;                 // toward the attractor (UV)
                    vec2 ds = vec2(delta.x * aspectRatio, delta.y);
                    float dist = length(ds);                 // screen-circular distance
                    float r = max(A.w, 1e-4);
                    // Soft peaked falloff, zeroed at the exact center (dead zone)
                    float f = exp(-(dist * dist) / (r * r * 0.5));
                    f *= smoothstep(0.0, r * 0.06, dist);
                    if (f <= 0.0001) continue;
                    vec2 dir = delta / (length(delta) + 1e-5); // inward, in UV
                    // Isotropic (config.VELOCITY_ISOTROPIC): the direction in
                    // SQUARE units, so the pull is radial on screen and as fast
                    // from above as from the side; transport is then canvas long
                    // sides/s and turns into UV per axis below, like velocity.
                    // Normalized in UV, a 16:9 gather drew paint in from above
                    // and below at 0.56 of the speed it drew it from the sides.
                    if (uVelToUv.x > 0.0) { vec2 dq = delta / uVelToUv; dir = dq / (length(dq) + 1e-5); }
                    vec2 tang = vec2(-dir.y, dir.x);           // swirl keeps the pool alive
                    transport += (dir + tang * uSwirl) * (A.z * f);
                }
                transport *= uForce * fillGate;
                if (uVelToUv.x > 0.0) transport *= uVelToUv;
                // Semi-Lagrangian gather: sample from the OUTWARD side so dye
                // creeps toward the magnet. Pure resample — bounded, no energy.
                vec2 src = clamp(vUv - transport * dt, 0.0, 1.0);
                // Carry alpha through the gather: it is pigment memory now, and
                // writing a constant here would erase it everywhere the
                // attractor field runs (and read as full-strength memory over
                // the whole canvas, so Ignite would blow the pool out).
                vec4 gathered = texture(uDensity, src);
                // uKeep: a plain gather ERODES an inward pull's outer rim. Every
                // texel reads from further OUT, so the texels at the edge of a
                // painted region read empty canvas and write it — the region is
                // eaten from the outside in while its middle fills. Harmless for
                // the scene field, whose magnets sit inside a broad dye wash; fatal
                // for the Push brush's Suck, which is aimed at a finite blob
                // (measured 2026-08-23: 57% of the paint gone in 0.7s against the
                // do-nothing control). Taking the max instead lets a texel receive
                // what is outward of it but never lose what it already had, so Suck
                // concentrates and cannot erase. It also cannot run away: a max can
                // never exceed the field's existing peak, so the pool saturates at
                // the brightest dye already present and stops. Default 0 keeps the
                // attractor scene bit-identical.
                fragColor = (uKeep > 0.5) ? max(gathered, texture(uDensity, vUv)) : gathered;
            }
        `;
        // M2 spectral floor (2026-07-17): the sim's small-scale energy sink.
        // Removes a fraction of the velocity field's Laplacian (Nyquist-band)
        // component where it reads as NOISE. Wall injection (M2b) and cap
        // churn deposit energy at grid scale; with zero viscosity anywhere it
        // otherwise accumulates and advects outward until the whole field is
        // static ("miasma"). Selectivity guarantees:
        //   - at rest: c = avg = 0 → exact no-op (bit-stable settle preserved)
        //   - smooth flow / straight shear: Laplacian ≈ 0 → untouched
        //   - relative gate: HF must be significant vs local speed
        //     (decorrelation), so energetic coherent swirls keep their texture
        //   - collider apron skipped (~1 texel): tangential wall flow reads as
        //     HF against damped in-wall neighbors — eating it would put wall
        //     drag back (the WALL_SLIP work). Wall-injected noise advects one
        //     texel out and is eaten there instead.
        const hfFloorFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv, vL, vR, vT, vB;
            out vec4 fragColor;
            uniform sampler2D uVelocity;
            uniform sampler2D uObstacle;
            uniform vec2 texelSize;
            uniform int hasObstacle;
            uniform float uObsMax;
            uniform float dt;
            uniform float strength; // per-frame HF removal fraction (pre-scaled by dt·60, ≤0.85)
            ${obsTexelGLSL}
            void main() {
                vec2 cL = clamp(vL, 0.0, 1.0), cR = clamp(vR, 0.0, 1.0);
                vec2 cT = clamp(vT, 0.0, 1.0), cB = clamp(vB, 0.0, 1.0);
                vec2 c = texture(uVelocity, vUv).xy;
                vec2 avg = 0.25 * (texture(uVelocity, cL).xy + texture(uVelocity, cR).xy
                                 + texture(uVelocity, cT).xy + texture(uVelocity, cB).xy);
                vec2 hfv = c - avg;
                float hf = length(hfv);
                float spd = length(c);
                float rel = hf / max(spd, 0.01);
                float motion = smoothstep(0.001, 0.02, spd * dt);
                float energy = smoothstep(0.002, 0.02, hf);
                float k = strength * motion * smoothstep(0.15, 0.6, rel) * energy;
                if (hasObstacle == 1) {
                    float cov = obsTexCoverage(texture(uObstacle, vUv), uObsMax);
                    k *= 1.0 - smoothstep(0.65, 0.98, cov);
                }
                fragColor = vec4(c - hfv * k, 0.0, 1.0);
            }
        `;
        // Viscosity (2026-09-21): the fluid's thickness, as one axis of a
        // separable Gaussian on velocity. That is the exact solution of the
        // viscous term (du/dt = nu * laplacian(u)) over one step: diffusing for
        // dt spreads momentum by a Gaussian with sigma^2 = 2 * nu * dt, so two
        // passes (x then y) are one whole viscous step, stable at any
        // thickness. The sim had no viscous term before; the old "Viscosity"
        // fader was the display sharpen amount (now Ridge Strength).
        // Walls: each side of the kernel marches outward texel by texel and
        // stops trusting what it samples once it crosses solid (a tap past a
        // wall contributes the texel's OWN velocity, as the pressure passes
        // reflect pressure at solids), so momentum never diffuses through a
        // collider and a wall adds no drag of its own; a collider's mode
        // still decides that. The canvas border is treated the same way.
        // Solid texels keep their velocity (the projection zeroes them).
        // Cost: velocity is LINEAR-filtered, so one fetch placed between two
        // neighbouring taps returns their weighted sum exactly (the usual
        // separable-blur pairing) — half the velocity reads. The wall march
        // still reads the obstacle at every tap, so a one-texel wall is never
        // stepped over; a pair is judged by its outer tap.
        const viscosityFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uVelocity;
            uniform sampler2D uObstacle;
            uniform int hasObstacle;
            uniform vec2 uStep;      // one tap: the pass axis times the tap spacing, in UV
            uniform float uFalloff;  // tap i weighs exp(-i*i*uFalloff), i counted in taps
            uniform int uPairs;      // tap pairs per side, at most 32 (64 taps)
            ${obstacleSolidityGLSL}
            bool outside(vec2 uv) {
                return uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0;
            }
            void main() {
                vec2 c = texture(uVelocity, vUv).xy;
                vec2 sum = c;
                float wsum = 1.0;
                for (int side = 0; side < 2; side++) {
                    vec2 dir = (side == 0) ? uStep : -uStep;
                    float open = 1.0;
                    for (int k = 0; k < 32; k++) {
                        if (k >= uPairs) break;
                        float ia = float(2 * k + 1);
                        float ib = ia + 1.0;
                        float wa = exp(-ia * ia * uFalloff);
                        float wb = exp(-ib * ib * uFalloff);
                        if (outside(vUv + dir * ib)) {
                            open = 0.0;
                        } else if (hasObstacle == 1) {
                            open *= (1.0 - solidity(vUv + dir * ia)) * (1.0 - solidity(vUv + dir * ib));
                        }
                        float w = wa + wb;
                        vec2 pair = texture(uVelocity, vUv + dir * (ia + wb / w)).xy;
                        sum += mix(c, pair, open) * w;
                        wsum += w;
                    }
                }
                vec2 v = sum / wsum;
                if (hasObstacle == 1) v = mix(v, c, solidity(vUv));
                fragColor = vec4(v, 0.0, 1.0);
            }
        `;
        const obstacleCompositeFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uSource;
            uniform sampler2D uObstacle;
            uniform vec4 sourceTransform;
            uniform float sourceRotation;
            uniform vec2 sourceSkew; // shear tangents (tan skewX, tan skewY)
            uniform float uAspect;   // canvas W/H — R and K act in pixel space
            uniform float strength;
            uniform float solid;    // 1 = a wall (Block / Deflect), 0 = Slow
            uniform float stick;    // 1 = Block (no-slip apron), 0 = Deflect
            uniform vec2 texelSize; // obstacle texel (1/obsW, 1/obsH)
            uniform float covKnee; // alpha at which coverage saturates to
                                   // fully solid (config.COLLIDER_ALPHA_SOLID)
            void main() {
                vec2 q = vUv - vec2(0.5) - sourceTransform.xy;
                // Rotate and shear act in PIXEL space at every other site
                // (the CSS divs, the CPU compositors) — conjugate by the
                // canvas aspect so a rotated or skewed GPU-source wall lands
                // on the drawn layer instead of leaning by an extra W/H.
                q.x *= uAspect;
                float c = cos(sourceRotation);
                float s = sin(sourceRotation);
                q = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);
                // Inverse shear between the rotate and the scale-divide —
                // forward is R then K then S (02a-layer-xform contract), so
                // the inverses apply in reverse layers: rotate first, then
                // unshear, then the scale-divide. Signed det kept: a strong
                // two-axis skew can flip it.
                float skDet = 1.0 - sourceSkew.x * sourceSkew.y;
                if (abs(skDet) < 0.0001) skDet = skDet < 0.0 ? -0.0001 : 0.0001;
                q = vec2(q.x - sourceSkew.x * q.y, q.y - sourceSkew.y * q.x) / skDet;
                q.x /= uAspect;
                q /= max(abs(sourceTransform.zw), vec2(0.0001));
                vec2 sourceUv = clamp(q + vec2(0.5), 0.0, 1.0);
                // 4x4 box-filter downsample (2026-08-05, M-watch (a) landed):
                // the old single bilinear tap ALIASED fine mask detail — a
                // 2-3-sim-texel line wall (scale/knit outlines in imported
                // line-art) randomly sampled weak along its length, so cells
                // leaked unevenly and dye pooled as ragged noise instead of
                // the drawn pattern ("fidelity" complaint). Averaging the
                // full footprint of this obstacle texel in source space gives
                // every wall its true area coverage. Offsets ride through the
                // same rotate/scale as the center tap (the map is affine).
                float aSum = 0.0;
                vec2 invScale = 1.0 / max(abs(sourceTransform.zw), vec2(0.0001));
                for (int iy = 0; iy < 4; iy++) {
                    for (int ix = 0; ix < 4; ix++) {
                        vec2 off = vec2((float(ix) - 1.5) * 0.25, (float(iy) - 1.5) * 0.25) * texelSize;
                        off.x *= uAspect;
                        vec2 so = vec2(c * off.x + s * off.y, -s * off.x + c * off.y);
                        so = vec2(so.x - sourceSkew.x * so.y, so.y - sourceSkew.y * so.x) / skDet;
                        so.x /= uAspect;
                        so *= invScale;
                        aSum += texture(uSource, clamp(sourceUv + so, 0.0, 1.0)).a;
                    }
                }
                // Source alpha is SHAPE, not texture (2026-08-05): mid-alpha
                // ripple inside a painted fill (soft-brush overlap, image
                // grain) must read solid, or solidity()'s coverage window
                // turns the fill into a solid/leaky lattice and dye pools at
                // every dip. Applied to the box-filtered AREA coverage: a
                // texel half-covered by a wall line saturates solid (thin
                // walls hold), while mostly-open texels keep an AA ramp.
                float a = aSum * (1.0 / 16.0);
                float coverage = smoothstep(covKnee * 0.25, covKnee, a) * strength;
                vec4 previous = texture(uObstacle, vUv);
                // Channel contract in obsTexelGLSL: R wall, G strength,
                // B stick (Block), A Slow.
                fragColor = vec4(min(1.0, previous.x + coverage * solid),
                                 min(1.0, previous.y + coverage * sqrt(strength)),
                                 min(1.0, previous.z + coverage * solid * stick),
                                 min(1.0, previous.w + coverage * (1.0 - solid)));
            }
        `;
        // Obstacle upload (2026-09-09): the CPU compositor's canvas arrives
        // as a premultiplied RGBA8 texture (R = Σcov·S·solid, G = Σcov·S·√S,
        // B = Σcov·S·stick, A = Σcov·S — collisionLayers.wallBytes drawn at
        // globalAlpha = strength, summed by 'lighter'). This pass resamples
        // it to sim resolution and applies the coverage knee that used to be
        // a per-pixel JS loop over the whole obstacle canvas (measured 550 ms
        // per recomposite at 4096 physics, 173 ms at 2048 — a strength-slider
        // drag froze the app at Extreme/Overkill). Same math as before:
        // coverage = alpha / S with S = (G/A)², smoothstep(0.25·knee, knee),
        // rescaled by S; the wall/strength/stick/slow channels follow.
        const obstacleUploadFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uSource;
            uniform float covKnee;  // config.COLLIDER_ALPHA_SOLID
            uniform float uObsMax;  // strength fallback for G-less (legacy) content
            void main() {
                vec4 c = texture(uSource, vUv);
                float a = c.a;
                if (a < 1e-5) { fragColor = vec4(0.0); return; }
                float q = c.g / a;                       // coverage-weighted √S
                float S = (c.g > 1e-5) ? clamp(q * q, 0.05, 1.0) : max(uObsMax, 0.05);
                float cov = a / S;
                float a2 = smoothstep(covKnee * 0.25, covKnee, cov) * S;
                float k = a2 / a;
                float wall = k * c.r;
                fragColor = vec4(wall, k * c.g, k * c.b, a2 - wall);
            }
        `;
        // Obstacle gap fill — one separable step of grayscale dilate/erode
        // (5-tap cross => an L1 ball after R passes). R dilates followed by
        // R erodes = morphological CLOSE: enclosed pockets narrower than ~2R
        // texels (line-art texture — fish-scale/knit interiors in imported
        // mask images) seal into solid wall, while larger drawn features
        // (eye/mouth cutouts) and the outer silhouette stay put — grayscale
        // close restores every edge farther than R from a sealed feature, so
        // AA ramps survive. Runs only at obstacle-recomposite time.
        const morphObstacleFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv, vL, vR, vT, vB;
            out vec4 fragColor;
            uniform sampler2D uTexture;
            uniform int isErode;
            void main() {
                // Componentwise over RG so the per-texel strength channel
                // rides along; at a seam between two different-strength
                // colliders the ratio can mix for one texel — acceptable
                // for an opt-in solid-slab knob (COLLIDER_GAP_FILL).
                vec4 c = texture(uTexture, vUv);
                vec4 l = texture(uTexture, clamp(vL, 0.0, 1.0));
                vec4 r = texture(uTexture, clamp(vR, 0.0, 1.0));
                vec4 t = texture(uTexture, clamp(vT, 0.0, 1.0));
                vec4 b = texture(uTexture, clamp(vB, 0.0, 1.0));
                vec4 mx = max(c, max(max(l, r), max(t, b)));
                vec4 mn = min(c, min(min(l, r), min(t, b)));
                fragColor = (isErode == 1) ? mn : mx;
            }
        `;
        // The obstacle's finish blur, one axis per pass (2026-09-25). This is
        // blurFrag's 5-texel kernel (the D0.5 rev-3 blur that bounds every
        // edge ramp), except where a wall is THINNER than three texels along
        // this axis. There the blur spread the wall over five texels: a
        // 1-texel stroke peaked at 0.29 coverage, a 2-texel one at 0.53, and
        // the end of a stroke, blurred along both axes, lower still. All of
        // that sits under or at the bottom of solidity()'s 0.35-0.85 window,
        // so thin walls let the fluid through. At the default 512 physics
        // that is most small text and the tips of bigger letters (measured:
        // inside 16 px bold letters the fluid kept 49% of the surrounding
        // speed, 24 px 42%, 48 px 6%). A thin ridge now keeps its own
        // coverage and still gets the blur's apron outside it. A texel of a
        // wall three or more texels across always has a pair of neighbours
        // at least as covered as itself on one side, so the test comes out
        // zero there and the pass is the old blur, bit for bit. The blend
        // weight comes from presence (wall + Slow) and mixes whole texels,
        // so the premultiplied strength and stick ratios are kept.
        const obstacleBlurFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv, vL, vR;
            out vec4 fragColor;
            uniform sampler2D uTexture;
            uniform float uKeepThin;  // config.COLLIDER_KEEP_THIN; 0 = the plain blur
            void main() {
                vec4 c = texture(uTexture, vUv);
                vec4 sum = c * 0.29411764;
                sum += texture(uTexture, vL) * 0.35294117;
                sum += texture(uTexture, vR) * 0.35294117;
                fragColor = sum;
                float pc = c.x + c.w;
                if (uKeepThin < 0.5 || pc < 1e-4) return;
                // One texel along this pass's axis (blurVert puts vL and vR
                // 1.333 texels out), so these four taps land on texel centres.
                vec2 stp = (vR - vUv) * 0.75;
                vec4 l2 = texture(uTexture, vUv - 2.0 * stp);
                vec4 l1 = texture(uTexture, vUv - stp);
                vec4 r1 = texture(uTexture, vUv + stp);
                vec4 r2 = texture(uTexture, vUv + 2.0 * stp);
                // How far the wall carries on past this texel, on its
                // better side: at least as covered for two texels = wide.
                float wide = max(min(l2.x + l2.w, l1.x + l1.w), min(r1.x + r1.w, r2.x + r2.w));
                float keep = clamp(1.0 - wide / pc, 0.0, 1.0);
                float ps = sum.x + sum.w;
                if (keep * pc <= ps) return;
                fragColor = mix(sum, c, (keep * pc - ps) / max(pc - ps, 1e-6));
            }
        `;
        // Doubles as the multigrid smoother: hSq = (2^level)² converts the
        // level's RHS — stored in level-0 "continuous" units all the way down
        // the pyramid so fp16 storage never sees compounding 4^L factors —
        // into this level's texel-Laplacian units inside highp registers.
        // Plain Jacobi path sets hSq = 1.0 (level 0), making this exactly the
        // shader it always was.
        const pressureFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv, vL, vR, vT, vB;
            out vec4 fragColor;
            uniform sampler2D uPressure, uDivergence;
            uniform sampler2D uObstacle;
            uniform int hasObstacle;
            uniform float hSq;
            uniform float relax; // Jacobi damping ω (1.0 = plain Jacobi, the
                                 // shipped default on BOTH solver paths).
                                 // Exposed as the Relaxation slider for
                                 // experiments: textbook multigrid prefers
                                 // ω≈0.8 (damps the checkerboard error mode
                                 // undamped Jacobi leaves oscillating, factor
                                 // 1-2ω per sweep). Measured on this system
                                 // (2026-07-14) it made no reliable difference
                                 // to pressure/dye temporal jitter — the fast-
                                 // stroke jitter was fp16 pressure saturation
                                 // (see divergenceFrag pScale) — so the default
                                 // stays at the historical behavior.
            ${obstacleSolidityGLSL}
            void main() {
                vec2 L = clamp(vL, 0.0, 1.0), R = clamp(vR, 0.0, 1.0);
                vec2 T = clamp(vT, 0.0, 1.0), B = clamp(vB, 0.0, 1.0);
                float pC = texture(uPressure, vUv).x;
                float pL = texture(uPressure, L).x;
                float pR = texture(uPressure, R).x;
                float pB = texture(uPressure, B).x;
                float pT = texture(uPressure, T).x;
                if (hasObstacle == 1) {
                    // Neumann at solids (∂p/∂n = 0): a solid neighbor reflects
                    // the cell's own pressure back — same treatment the clamped
                    // fetches already give the domain edges.
                    pL = mix(pL, pC, solidity(L));
                    pR = mix(pR, pC, solidity(R));
                    pB = mix(pB, pC, solidity(B));
                    pT = mix(pT, pC, solidity(T));
                }
                float jacobi = (pL + pR + pB + pT -
                               texture(uDivergence, vUv).x * hSq) * 0.25;
                // mix(pC, jacobi, 1.0) returns jacobi exactly, so the legacy
                // path (relax 1.0) is bit-identical to the old shader.
                fragColor = vec4(mix(pC, jacobi, relax), 0.0, 0.0, 1.0);
            }
        `;
        // ─── Multigrid V-cycle passes (pressure solve) ──────────────────
        // Residual of the level's equation: r = F − (Σp' − 4p)/hSq, with the
        // same Neumann-at-solids stencil as the smoother (mismatched stencils
        // make the coarse correction fight the fine solve). F is the level's
        // RHS in level-0 units; division by hSq keeps r in those units too,
        // so every pyramid texture stays at the divergence field's magnitude
        // and fp16 storage never overflows. Math in highp.
        const mgResidualFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv, vL, vR, vT, vB;
            out vec4 fragColor;
            uniform sampler2D uPressure, uDivergence;
            uniform sampler2D uObstacle;
            uniform int hasObstacle;
            uniform float hSq;
            ${obstacleSolidityGLSL}
            void main() {
                vec2 L = clamp(vL, 0.0, 1.0), R = clamp(vR, 0.0, 1.0);
                vec2 T = clamp(vT, 0.0, 1.0), B = clamp(vB, 0.0, 1.0);
                float pC = texture(uPressure, vUv).x;
                float pL = texture(uPressure, L).x;
                float pR = texture(uPressure, R).x;
                float pB = texture(uPressure, B).x;
                float pT = texture(uPressure, T).x;
                if (hasObstacle == 1) {
                    pL = mix(pL, pC, solidity(L));
                    pR = mix(pR, pC, solidity(R));
                    pB = mix(pB, pC, solidity(B));
                    pT = mix(pT, pC, solidity(T));
                }
                float lap = pL + pR + pB + pT - 4.0 * pC;
                float r = texture(uDivergence, vUv).x - lap / hSq;
                fragColor = vec4(r, 0.0, 0.0, 1.0);
            }
        `;
        // Restriction: 4-tap box average of the finer level (works for the
        // odd non-power-of-2 grid sizes the aspect fit produces). Used for
        // both residual→RHS and the obstacle-fraction pyramid — restricting
        // FRACTIONS, not a binary mask, is what keeps thin solids alive at
        // coarse levels (cut-cell MG, Weber 2015).
        const mgRestrictFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTexture;
            uniform vec2 fineTexelSize;
            uniform int maxPool; // EXPERIMENT KNOB (config.MG_OBS_MAXPOOL,
                                 // default off): 1 = max of the 4 samples for
                                 // the obstacle pyramid. Tested as a fix for
                                 // the strength-1.0 wall fuzz ("keep thin
                                 // walls sealed at coarse levels") and
                                 // REFUTED — over-blocking open channels
                                 // measured 10× worse pressure/noise. Shipped
                                 // behavior is box-average for everything.
            void main() {
                vec4 a = texture(uTexture, vUv + vec2(-0.5, -0.5) * fineTexelSize);
                vec4 b = texture(uTexture, vUv + vec2( 0.5, -0.5) * fineTexelSize);
                vec4 c = texture(uTexture, vUv + vec2(-0.5,  0.5) * fineTexelSize);
                vec4 d = texture(uTexture, vUv + vec2( 0.5,  0.5) * fineTexelSize);
                fragColor = (maxPool == 1) ? max(max(a, b), max(c, d))
                                           : (a + b + c + d) * 0.25;
            }
        `;
        // Prolongation: bilinear-interpolate the coarse error and add it to
        // the fine pressure. Correction magnitude is already in fine units
        // (the hSq bookkeeping lives entirely in smoother/residual).
        const mgProlongFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uPressure; // fine level, pre-correction
            uniform sampler2D uCoarse;   // coarse error solve
            void main() {
                float p = texture(uPressure, vUv).x + texture(uCoarse, vUv).x;
                fragColor = vec4(p, 0.0, 0.0, 1.0);
            }
        `;
        const gradientFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv, vL, vR, vT, vB;
            out vec4 fragColor;
            uniform sampler2D uPressure, uVelocity;
            uniform sampler2D uObstacle;
            uniform vec2 texelSize;
            uniform float openBoundary; // 1 = overflow mode: edges stop being walls
            uniform float pScale; // undo the divergence pass's fp16 headroom
                                  // rescale (see divergenceFrag) — the stored
                                  // pressure is p·pScale, so gradients divide it out
            uniform float uHalfGrad; // 1 = half-difference gradient
                                     // (config.PROJECTION_HALF_GRADIENT);
                                     // 0 / unset = the historic full difference
            uniform int hasObstacle;
            ${obstacleSolidityGLSL}
            void main() {
                vec2 L = clamp(vL, 0.0, 1.0), R = clamp(vR, 0.0, 1.0);
                vec2 T = clamp(vT, 0.0, 1.0), B = clamp(vB, 0.0, 1.0);
                float pL = texture(uPressure, L).x;
                float pR = texture(uPressure, R).x;
                float pB = texture(uPressure, B).x;
                float pT = texture(uPressure, T).x;
                float sL = 0.0, sR = 0.0, sB = 0.0, sT = 0.0;
                if (hasObstacle == 1) {
                    // Mirror the pressure pass's Neumann treatment so the
                    // gradient this pass subtracts is the same one the solve
                    // converged with — mismatched stencils leak flow into walls.
                    sL = solidity(L); sR = solidity(R);
                    sB = solidity(B); sT = solidity(T);
                    float pC = texture(uPressure, vUv).x;
                    pL = mix(pL, pC, sL);
                    pR = mix(pR, pC, sR);
                    pB = mix(pB, pC, sB);
                    pT = mix(pT, pC, sT);
                }
                // divergenceFrag takes HALF differences and the solve inverts
                // the compact Laplacian, so the gradient consistent with them
                // is 0.5·(pR − pL). The full difference (Pavel heritage)
                // subtracts twice the solved gradient: once the solve
                // converges (multigrid), smooth divergence is REFLECTED each
                // frame instead of removed (Fourier symbol −cos k, not ~0).
                // Measured 2026-09-23 (sim 512): a lone push rings at 30 Hz
                // (centre speed 599, 42, 438, 161, 312…; half: 599, 309, 265,
                // 254…), the ringing grows with the solve (4 V-cycles: the
                // divergence rises frame over frame), collider-scene jitter
                // 0.20 → 0.17 at the default solve and 1.02 → 0.17 at 4
                // cycles, and a pure radial push runs BACKWARDS (an outward
                // ring push pulls the paint in). On by default since
                // 2026-09-23; strokes keep less lingering motion with it.
                vec2 gradP = vec2(pR - pL, pT - pB);
                if (uHalfGrad > 0.5) gradP *= 0.5;
                vec2 vel = texture(uVelocity, vUv).xy - gradP / pScale;
                // No-penetration boundary: zero velocity normal to wall at edges.
                // Skipped in overflow mode — outbound velocity keeps flowing out.
                if (openBoundary < 0.5) {
                    if (vUv.x < texelSize.x)       vel.x = max(vel.x, 0.0);
                    if (vUv.x > 1.0 - texelSize.x) vel.x = min(vel.x, 0.0);
                    if (vUv.y < texelSize.y)        vel.y = max(vel.y, 0.0);
                    if (vUv.y > 1.0 - texelSize.y)  vel.y = min(vel.y, 0.0);
                }
                if (hasObstacle == 1) {
                    // No-penetration at solid faces, same max/min trick as the
                    // domain edges above but blended by the face's solidity so
                    // antialiased mask edges stay soft.
                    vel.x = mix(vel.x, max(vel.x, 0.0), sL);
                    vel.x = mix(vel.x, min(vel.x, 0.0), sR);
                    vel.y = mix(vel.y, max(vel.y, 0.0), sB);
                    vel.y = mix(vel.y, min(vel.y, 0.0), sT);
                    // Inside the solid itself velocity dies outright — the
                    // damp pass used to be the only thing doing this; keeping
                    // it here makes the projected field consistent even if
                    // that pass is ever retired.
                    vel *= 1.0 - solidity(vUv);
                }
                fragColor = vec4(vel, 0.0, 1.0);
            }
        `;
        const clearFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTexture;
            uniform float value;
            uniform float softClamp; // >0: rational soft ceiling on |x| of the
                                     // FIRST channel (fp16 pressure valve for
                                     // sealed-pocket stagnation pressure; the
                                     // knee starts at 70% like the velocity
                                     // cap). 0 = plain passthrough — REQUIRED
                                     // for the preserved-copy reinit path,
                                     // which reuses this program for dye and
                                     // velocity.
            void main() {
                vec4 c = value * texture(uTexture, vUv);
                if (softClamp > 0.0) {
                    float knee = softClamp * 0.7;
                    float ap = abs(c.x);
                    if (ap > knee) {
                        float range = softClamp * 0.3;
                        float ex = ap - knee;
                        c.x = sign(c.x) * (knee + ex / (1.0 + ex / range));
                    }
                }
                fragColor = c;
            }
        `;
        // Standalone obstacle damping — runs as a separate pass after normal physics
        // so the existing shaders are completely untouched.
        const obstacleDampFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uVelocity;
            uniform sampler2D uObstacle;
            uniform vec2 texelSize;
            uniform float uObsMax;  // max collisionStrength (coverage normalizer)
            uniform float dt;       // sim step (s) — the Slow drag is a half-life
            uniform float uHalo;    // Block boundary-layer halo strength (config.OBS_BLOCK_HALO, 0 = off)
            ${obsTexelGLSL}
            void main() {
                vec2 vel = texture(uVelocity, vUv).xy;
                // Sample obstacle with neighbors for smooth boundary (anti-alias)
                vec4 c  = texture(uObstacle, vUv);
                vec4 l  = texture(uObstacle, vUv - vec2(texelSize.x, 0.0));
                vec4 r  = texture(uObstacle, vUv + vec2(texelSize.x, 0.0));
                vec4 t  = texture(uObstacle, vUv + vec2(0.0, texelSize.y));
                vec4 b  = texture(uObstacle, vUv - vec2(0.0, texelSize.y));
                vec4 obs = (c * 4.0 + l + r + t + b) * 0.125;
                // Two texels further out, for Block's boundary layer.
                vec4 halo = max(max(texture(uObstacle, vUv - vec2(2.0 * texelSize.x, 0.0)),
                                    texture(uObstacle, vUv + vec2(2.0 * texelSize.x, 0.0))),
                                max(texture(uObstacle, vUv + vec2(0.0, 2.0 * texelSize.y)),
                                    texture(uObstacle, vUv - vec2(0.0, 2.0 * texelSize.y))));
                halo = max(halo, max(max(l, r), max(t, b)));
                // WALLS (Block / Deflect). Coverage-normalized + strength-
                // scaled (2026-07-15): the damp depth follows the same
                // strength curve as solidity(), so the Strength slider grades
                // damping instead of cliffing. Per texel (2026-08-31): the
                // weighted average's ratios ARE the weighted local strength
                // and mode, so each collider damps at its own slider's depth.
                // The apron width is the collider's MODE (2026-09-09): Block
                // (stick 1) damps the full coverage ramp — a no-slip wall the
                // flow piles up against; Deflect (stick 0) damps the interior
                // only, leaving the tangential flow the obstacle-aware
                // projection preserves, so the fluid slides around the shape.
                // (This was the global config.WALL_SLIP knob, 0.6 for every
                // collider; the two modes are its endpoints.)
                float covAvg = obsTexCoverage(obs, uObsMax);
                float osr = obsTexResponse(obs, uObsMax);
                float stick = obsTexStick(halo);
                float slip = 1.0 - stick;
                float wallWin = smoothstep(slip * 0.45, 0.8 + slip * 0.1, covAvg);
                // Block's no-slip boundary layer: a band ~2 texels OUTSIDE
                // the wall where the flow loses a third of its momentum
                // per frame (graded by the wall's own strength response),
                // so a jet stalls against the face and dye piles up there
                // instead of skating along it. Deflect has no band (stick
                // 0): the projection's tangential slip is all the edge
                // does, and the flow slides around.
                float haloWin = stick * uHalo * smoothstep(0.05, 0.5, obsTexCoverage(halo, uObsMax));
                float damp = 1.0 - max(osr * wallWin, obsTexResponse(halo, uObsMax) * haloWin);
                // SLOW: a drag field, not a wall. Velocity decays with a
                // half-life set by the strength on a log scale — 1.5 frames
                // at 1.0 (tar: whatever enters stops), ~12 at 0.5 (honey),
                // ~60 at 0.1 (a faint syrup) — so every slider position
                // reads as a different thickness instead of the top half
                // all meaning "stopped". Coverage ramps it in at the edge.
                float covSlow = obsTexSlowCoverage(obs, uObsMax);
                if (covSlow > 1e-4) {
                    float s = clamp(obsTexStrength(obs, uObsMax), 0.0, 1.0);
                    float halfLife = 1.5 * pow(60.0, 1.0 - s);
                    float keep = pow(0.5, dt * 60.0 / halfLife);
                    damp *= mix(1.0, keep, smoothstep(0.0, 0.5, covSlow));
                }
                vel *= damp;
                fragColor = vec4(vel, 0.0, 1.0);
            }
        `;
        // ─── D2 raster sketch stamp ─────────────────────────────────────
        // Normal-control drawing: dabs stamp into the persistent `sketch`
        // FBO (RGBA8, dye res — paint that never decays or advects). Output
        // is PREMULTIPLIED and the caller blends with (ONE,
        // ONE_MINUS_SRC_ALPHA) — exact over-compositing; the eraser reuses
        // the same stamp with (ZERO, ONE_MINUS_SRC_ALPHA) = destination-out.
        const rasterStampFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform vec2 point;
            uniform vec3 color;
            uniform float radius, aspectRatio;
            uniform float flow;     // stamp alpha at the core
            uniform float hardness; // 0 = soft gaussian edge, 1 = hard AA disc
            uniform sampler2D uStampTex; // custom brush shape (alpha = coverage), unit 1
            uniform float stampTexOn;    // 1 = the footprint IS the stamp, not the disc
            uniform float stampAspect;   // stamp width/height, so non-square shapes keep it
            uniform float stampAngle;    // brush rotation (radians, screen space)
            void main() {
                vec2 p = vUv - point;
                p.x *= aspectRatio;
                float a;
                if (stampTexOn > 0.5) {
                    // Deliberately the SAME mapping splatFrag uses for a custom
                    // stamp (the he/suv block there), so one shape lands at one
                    // size and one angle whether the stroke is painting dye, a
                    // raster layer or a collider wall. Diverging here would mean
                    // a shape that traces a different outline than the wall it
                    // just built. The caller uploads the FULL brush radius in
                    // this branch, not the disc path's halved one.
                    vec2 q = p / sqrt(radius);
                    vec2 qr = q;
                    if (stampAngle != 0.0) {
                        float ca = cos(stampAngle), sa = sin(stampAngle);
                        qr = vec2(q.x * ca - q.y * sa, q.x * sa + q.y * ca);
                    }
                    vec2 he = (stampAspect >= 1.0)
                        ? vec2(1.6, 1.6 / max(stampAspect, 0.001))
                        : vec2(1.6 * max(stampAspect, 0.001), 1.6);
                    vec2 suv = qr / (2.0 * he) + 0.5;
                    // Same hoist as splatFrag: the mipmapped stamp needs its
                    // fetch in uniform control flow for the LOD to be defined.
                    float inStamp = float(all(greaterThanEqual(suv, vec2(0.0))) && all(lessThanEqual(suv, vec2(1.0))));
                    float cov = texture(uStampTex, clamp(suv, 0.0, 1.0)).a * inStamp;
                    a = cov * clamp(flow, 0.0, 1.0);
                } else {
                    float r2 = dot(p, p) / radius;
                    float soft = exp(-r2 * 3.0);
                    float hard = 1.0 - smoothstep(0.72, 1.0, r2);
                    a = mix(soft, hard, clamp(hardness, 0.0, 1.0)) * clamp(flow, 0.0, 1.0);
                }
                fragColor = vec4(color * a, a); // premultiplied
            }
        `;
        // ─── D2 bridge: Ignite — pour the sketch into the fluid dye ─────
        // One-shot additive deposit (sketch is premultiplied, so rgb already
        // carries its own alpha weighting). Dye only — the sim's existing
        // velocity field takes it from there.
        const igniteFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uDye;
            uniform sampler2D uSketch;
            uniform float gain;
            void main() {
                vec4 dye = texture(uDye, vUv);
                vec4 s = texture(uSketch, vUv);
                vec3 lit = dye.rgb + s.rgb * gain;
                // Poured-in sketch is new paint, so it gets remembered at the
                // strength it lands at — otherwise Ignite Sketch would deposit
                // dye with no memory and the Colour channel's Ignite could
                // never revive it. Preserves existing memory underneath.
                float mem = max(dye.a, max(lit.r, max(lit.g, lit.b)));
                fragColor = vec4(lit, mem);
            }
        `;
        // ─── Splat to Fluid — pour an IMAGE into the dye (2026-08-23) ───
        // One frame of a custom brush that is the whole picture: the footprint
        // is the image's alpha and the colour is its own RGB, per texel, laid
        // down with the same rules a brush dab obeys — Gate converges, additive
        // accumulates, Flow scales the convergence not the colour, colliders
        // block deposition, pigment memory tracks what landed. Everything the
        // splat shader does about WHERE (gaussian, clay stamps, aspect frame)
        // is gone: the image is already positioned, so this is a straight
        // full-screen deposit at 1:1, which is what makes it high fidelity.
        const imageSplatFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTarget;    // dye
            uniform sampler2D uObstacle;
            uniform sampler2D uImage;     // canvas-aligned cut-out, straight alpha
            uniform vec4 uImageRect;      // where it lands in dye UV: xy = lower-left, zw = size
            uniform float amount;         // deposit strength (0-1)
            uniform int gateColor;        // mirrors splatFrag's COLOR_GATE branch
            uniform float gateFlow;
            uniform int hasObstacle;
            uniform float uObsMax;
            ${obsTexelGLSL}
            uniform float toneWhite;      // display's Reinhard white point (0 = plain)
            uniform float toneCeil;       // how much HDR headroom to allow (0 = don't pre-compensate)
            // The display tone-maps dye on the way out (05a displayFrag): plain
            // Reinhard turns 0.93 into 0.48, which is why a poured picture came
            // out half-lit. Deposit the value that tone-maps BACK to the image's
            // own colour, so what lands on screen is the picture, not a dimmed
            // copy of it. Inverse of  d = c(1 + c/lw^2)/(1 + c)  solved for c,
            // written in the conjugate form so lw = 0 (plain Reinhard, a = 0)
            // falls out of the same expression as d/(1-d) with no branch.
            vec3 unToneMap(vec3 d, float lw) {
                d = clamp(d, 0.0, 0.995);          // pure white would need infinite dye
                float a = (lw > 0.0) ? 1.0 / (lw * lw) : 0.0;
                vec3 b = 1.0 - d;
                return 2.0 * d / (b + sqrt(b * b + 4.0 * a * d));
            }
            void main() {
                vec4 base4 = texture(uTarget, vUv);
                vec3 base = base4.xyz;
                float baseMem = base4.w;
                // (0,0,1,1) is the whole dye at 1:1, exactly the old lookup, so
                // a canvas-sized pour is unchanged. A smaller rect places a
                // small bitmap (a line of text) anywhere with no dye-sized
                // upload; outside it nothing is deposited.
                vec2 iuv = (vUv - uImageRect.xy) / uImageRect.zw;
                float inImage = float(all(greaterThanEqual(iuv, vec2(0.0))) && all(lessThanEqual(iuv, vec2(1.0))));
                vec4 src = texture(uImage, clamp(iuv, 0.0, 1.0)) * inImage;
                // Same coverage-only wall test as splatFrag's obsBlockDye —
                // paint goes AROUND a collider at every strength, so a poured
                // image cannot deposit inside a wall the flow respects.
                float obsBlockDye = 1.0;
                if (hasObstacle == 1) {
                    obsBlockDye = 1.0 - obsTexDyeBlock(texture(uObstacle, vUv), uObsMax);
                }
                float cov = clamp(src.a, 0.0, 1.0) * clamp(amount, 0.0, 1.0);
                vec3 color = src.rgb;
                if (toneCeil > 0.0) color = min(unToneMap(color, toneWhite), vec3(toneCeil));
                vec3 result;
                float newMem;
                if (gateColor == 1) {
                    float w = cov * obsBlockDye * gateFlow;
                    result = mix(base, color, w);
                    newMem = mix(baseMem, max(color.r, max(color.g, color.b)), w);
                } else {
                    result = base + cov * color * obsBlockDye;
                    newMem = max(baseMem, max(result.r, max(result.g, result.b)));
                }
                fragColor = vec4(result, newMem);
            }
        `;
        // ─── D2 bridge: Capture — freeze the fluid dye into the sketch ──
        // Emits a premultiplied color for over-compositing onto the sketch:
        // alpha = the dye's max channel, so bright dye lands opaque and faint
        // haze lands translucent; each rgb channel <= alpha by construction,
        // which is exactly valid premultiplied coverage.
        const captureFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uDye;
            void main() {
                vec3 c = clamp(texture(uDye, vUv).rgb, 0.0, 1.0);
                float a = max(c.r, max(c.g, c.b));
                fragColor = vec4(c, a);
            }
        `;
        // ─── Glow (HDR bloom) shaders ───────────────────────────────────
        // Classic mip-chain bloom: soft-knee prefilter isolates overbright
        // dye, a halving blur chain spreads it, additive upsampling stacks
        // the octaves, and the display pass adds the result on top of the
        // tone-mapped image — bright cores read as EMITTING light instead
        // of just being bright paint. Sampled from the PRE-tone-map HDR
        // frame, so only dye that actually climbed past the threshold
        // glows; Reinhard never sees (or caps) the halo.
        const glowPrefilterFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTexture;
            uniform vec3 curve;      // (threshold - knee, knee*2, 0.25/knee)
            uniform float threshold;
            void main() {
                vec3 c = texture(uTexture, vUv).rgb;
                float br = max(c.r, max(c.g, c.b));
                // Soft knee: quadratic ramp below the threshold so the glow
                // fades in instead of popping at a hard brightness cliff.
                float rq = clamp(br - curve.x, 0.0, curve.y);
                rq = curve.z * rq * rq;
                c *= max(rq, br - threshold) / max(br, 0.0001);
                fragColor = vec4(c, 0.0);
            }
        `;
        const glowBlurFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv, vL, vR, vT, vB;
            out vec4 fragColor;
            uniform sampler2D uTexture;
            void main() {
                vec4 sum = texture(uTexture, vL) + texture(uTexture, vR)
                         + texture(uTexture, vT) + texture(uTexture, vB);
                fragColor = sum * 0.25;
            }
        `;
        const glowFinalFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv, vL, vR, vT, vB;
            out vec4 fragColor;
            uniform sampler2D uTexture;
            uniform float intensity;
            void main() {
                vec4 sum = texture(uTexture, vL) + texture(uTexture, vR)
                         + texture(uTexture, vT) + texture(uTexture, vB);
                fragColor = sum * 0.25 * intensity;
            }
        `;
        // ─── Scatter (volumetric light shafts) ──────────────────────────
        // Glow is the EMISSIVE half of light: a bright pixel bleeds outward
        // equally in every direction. It has no source position, no
        // direction, no medium. This is the TRANSPORT half — light leaving
        // an origin and travelling through the canvas.
        //
        // Each pixel marches TOWARD the origin, accumulating the emissive
        // dye that lies between the two. Bright dye therefore smears into a
        // shaft pointing back at the source, so the shafts read as radiating
        // FROM it, and gaps in the dye read as the shadows between them.
        //
        // Reads Glow's prefilter output (the soft-knee-thresholded overbright
        // frame), so the emitter is already computed — this costs one extra
        // 256-base pass.
        //
        // Deliberately NOT the old Sunrays pass (removed in 7246d7d, "never
        // worked right"). That one marched from a hard-coded vec2(0.5),
        // sampled .a as OCCLUSION so bright dye cast shadow, accumulated a
        // single greyscale float, and composited MULTIPLICATIVELY — which is
        // why a NaN weight could black out the entire canvas (bd7e62f). This
        // one is origin-driven, emissive, per-channel and purely additive:
        // that failure mode is structurally impossible here.
        //
        // Steps per march. scatterSmoothFrag below averages over exactly one
        // of them, so the two must share this number.
        const SCATTER_STEPS = 48;
        const scatterFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTexture;  // Glow's prefiltered overbright dye = the emitter
            uniform vec2 origin;         // Ray origin in UV (light source or brush)
            uniform vec2 aspect;         // (w/h, 1.0) — circular falloff on non-square canvases
            uniform float density;       // Fraction of the pixel→origin gap the march covers
            uniform float decay;         // Per-step falloff
            uniform float weight;        // Amount slider
            uniform float dispersion;    // Per-channel decay spread
            uniform sampler2D uObstacle; // Collider coverage (RG16F, sim res, same 0..1 UV)
            uniform float uObsMax;       // window.__obsStrengthMax \u2014 the FALLBACK coverage normalizer
            uniform int hasObstacle;     // 0 = no colliders / occlusion off
            uniform float blockStrength; // 1 = opaque wall, <1 = translucent
            ${obsTexelGLSL}
            #define ITERATIONS ${SCATTER_STEPS}
            #define OCC_TAPS 5
            void main() {
                // NB: stepUV, not step — 'step' is a GLSL builtin.
                vec2 stepUV = (vUv - origin) * (density / float(ITERATIONS));
                // Dither the march's starting phase per pixel. With every pixel
                // sampling in lockstep, the discrete steps land in phase across
                // neighbours and the falloff prints as concentric arcs centred on
                // the origin — ghost copies of the dye silhouette, worst far out
                // where the step is longest. Offsetting the start by a fraction of
                // one step decorrelates them, trading banding for fine noise.
                //
                // Interleaved gradient noise off gl_FragCoord, NOT fract(sin(vUv)):
                // the sin hash collapses on drivers that fast-path sin, and it keys
                // off vUv, which is constant along each row of this 256-base buffer
                // for small x deltas — exactly the correlation that leaves the
                // banding visible. IGN is a cheap integer-lattice hash with none of
                // that, and being a pure function of the pixel it stays fixed frame
                // to frame (a time-varying dither would crawl instead of band).
                float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy,
                                                         vec2(0.06711056, 0.00583715))));
                vec2 coord = vUv - stepUV * ign;
                vec3 accum = vec3(0.0);
                // Chromatic dispersion: long wavelengths survive more
                // scattering events, so red carries furthest down the shaft
                // and blue drops out first. This is the whole difference
                // between light moving through a medium and a radial blur.
                vec3 dec = clamp(vec3(decay + dispersion, decay, decay - dispersion), 0.0, 1.0);
                vec3 illum = vec3(1.0);
                // Occlusion is tested along the WHOLE path, not at the march's
                // sample points only (2026-09-15, Gabriel: "hatching in the
                // collider space"). The samples are up to ~15 obstacle texels
                // apart far from the origin — wider than a letter's stroke —
                // and the dither above sets where they land per pixel, so a
                // thin wall was hit by one pixel's march and stepped over by
                // its neighbour's: light speckled INSIDE walls (measured: a
                // quarter of a text wall's texels lit, at two thirds of the
                // light just outside it) and every shadow edge came out in
                // the dither's diagonal saw-tooth. So: the pixel's own spot is
                // tested first — light does not live inside a wall — and each
                // step is swept every ~2 texels, taking the densest wall it
                // crosses. One attenuation per step, as before, so a
                // translucent wall (blockStrength < 1) dims light exactly as
                // much as it did; it just can no longer be missed.
                //
                // Both tests stop light at the wall's OUTLINE, coverage
                // 0.30-0.55: the contour obsTexDyeBlock stops the brush at
                // and shadeWallFrag draws the relief rim on. They used
                // solidity()'s 0.35-0.85, which is how porous a wall is to
                // FLUID (2026-09-25, Gabriel: "our light passing through
                // collisions is awfully grainy"). That window saturates only
                // at 0.85, and a thin stroke never gets there: under 30 px
                // text at sim 512, 133 of 192 columns through the letters
                // peak between 0.55 and 0.85. The march crosses a letter in
                // one step, so up to two thirds of the light went through,
                // and how much depended on where the dither put the taps.
                // The letters printed as grainy streaks of leaked light.
                // A 1536-step march blocks it under either window, because
                // its many small steps compound. Against that march, the
                // error behind the text fell 26.2 -> 10.4 and the light
                // inside the letters 52.9 -> 6.2.
                vec2 obsTexels = vec2(1.0);
                vec2 prev = vUv;
                if (hasObstacle == 1) {
                    obsTexels = vec2(textureSize(uObstacle, 0));
                    float own = obsTexCoverage(texture(uObstacle, vUv), uObsMax);
                    illum *= 1.0 - blockStrength * smoothstep(0.30, 0.55, own);
                }
                for (int i = 0; i < ITERATIONS; i++) {
                    coord -= stepUV;
                    // Colliders block light. illum is already the transmittance
                    // along this pixel's path to the origin, so occlusion is the
                    // same multiply the distance falloff uses \u2014 attenuate BEFORE
                    // accumulating, so the wall's own texel contributes nothing and
                    // everything beyond it is shadowed. The shadow therefore falls
                    // AWAY from the origin behind each collider, which is what a
                    // real shaft of light does.
                    //
                    // Decode is the house convention: the texel stores
                    // coverage*collisionStrength, so divide by uObsMax to recover
                    // coverage. Reading .r raw would treat a fully solid wall as
                    // 0.7 and leak light through it.
                    //
                    // Geometric coverage ONLY, deliberately without the strength
                    // permeability term that solidity() applies: Strength governs
                    // how porous a wall is to FLUID, and a chain-link fence barely
                    // slows air while still throwing a shadow. Same reasoning as
                    // splatFrag's obsBlockDye, which drops strength for the same
                    // reason (a brush is blocked by a wall's shape).
                    if (hasObstacle == 1) {
                        // A march already in full shadow gathers nothing more
                        // — stop (inside a wall that is the first iteration).
                        if (max(illum.r, max(illum.g, illum.b)) < 0.001) break;
                        // Sweep (prev, coord]: one tap per ~2.5 obstacle
                        // texels, at least one, at most OCC_TAPS.
                        float seg = length((prev - coord) * obsTexels);
                        float taps = clamp(ceil(seg * 0.4), 1.0, float(OCC_TAPS));
                        float cov = 0.0;
                        for (int k = 1; k <= OCC_TAPS; k++) {
                            if (float(k) > taps) break;
                            vec2 at = mix(prev, coord, float(k) / taps);
                            cov = max(cov, obsTexCoverage(texture(uObstacle, at), uObsMax));
                        }
                        illum *= 1.0 - blockStrength * smoothstep(0.30, 0.55, cov);
                    }
                    prev = coord;
                    accum += texture(uTexture, coord).rgb * illum;
                    illum *= dec;
                }
                accum *= weight / float(ITERATIONS);
                // Fade in with distance so the origin itself doesn't render
                // as a hard bright disc.
                accum *= smoothstep(0.0, 0.08, length((vUv - origin) * aspect));
                fragColor = vec4(max(accum, vec3(0.0)), 1.0);
            }
        `;
        // ─── Scatter smoothing (2026-09-25) ─────────────────────────────
        // The march leaves texel-sized junk on its 512 grid, and the ~3x
        // upscale to the canvas makes it visible (Gabriel, 2026-09-25: "the
        // beams still have a certain roughness to them"). Each pixel decides
        // on its own whether its ray clears a letter's edge, so every shadow
        // edge comes out as a wobbling stair-step, one texel per ray. The
        // dither also leaves grain along each shaft.
        //
        // Both lie ALONG the ray. A shadow edge runs through the origin, so
        // averaging a pixel with its neighbours on its own ray blends the
        // staircase into the edge's true position and the dither into a
        // denser march, and a shaft gets no wider. The window is one march
        // step, the march's own resolution along the ray, so no detail the
        // march resolved is lost. It stops at a wall, so light never
        // smears across a collider into its own shadow.
        //
        // Measured on a 30 px text wall (a beam edge's RMS distance from a
        // straight line, in canvas px): 0.30 -> 0.17, and 0.10 with
        // displayFrag's B-spline upsample. A native-resolution march
        // scores 0.04. config.SCATTER_SMOOTH = false skips both.
        const scatterSmoothFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTexture;  // scatterFrag's output
            uniform vec2 origin;         // same origin and reach the march used
            uniform float density;
            uniform sampler2D uObstacle;
            uniform float uObsMax;
            uniform int hasObstacle;
            ${obsTexelGLSL}
            #define ITERATIONS ${SCATTER_STEPS}
            #define TAPS 4
            void main() {
                // One march step along this pixel's ray, centred on it.
                vec2 stepUV = (vUv - origin) * (density / float(ITERATIONS));
                vec4 sum = texture(uTexture, vUv);
                float n = 1.0;
                for (int side = 0; side < 2; side++) {
                    float dir = (side == 0) ? -1.0 : 1.0;
                    for (int k = 1; k <= TAPS; k++) {
                        vec2 at = vUv + stepUV * (dir * float(k) / float(2 * TAPS + 1));
                        // Stop at the wall's outline: the middle of the
                        // march's 0.30-0.55 occlusion window.
                        if (hasObstacle == 1
                            && obsTexCoverage(texture(uObstacle, at), uObsMax) > 0.425) break;
                        sum += texture(uTexture, at);
                        n += 1.0;
                    }
                }
                fragColor = sum / n;
            }
        `;
        // ─── Surface Shading around colliders (2026-09-22) ──────────────
        // Surface Shading lights a blurred 256 copy of the frame (05j's
        // shadeForm), so pixel noise can't read as relief. A collider's dye
        // void went through the same blur: every wall turned into a soft pit
        // about three form texels wide, one smudge for a whole word, lit as
        // a dark band that ignored the letterforms (Gabriel, 2026-09-22:
        // "the relief shader is not nicely conforming to the shapes"). Beside
        // 70 px Impact text it darkened the paint out to ~16 px.
        //
        // So with walls up the form field is split by the collider mask: the
        // paint around a wall and the paint inside it (usually none) blur
        // separately, and displayFrag puts the step between them back at the
        // wall's own edge, reading shadeWallFrag's sim-res mask per pixel.
        // The relief then breaks where the paint does, around each letter:
        // measured, nothing changes past ~6 px from the letters.
        //
        // The mask: 1 where a wall cuts the paint. Same contour the brush
        // stops at (obsTexDyeBlock's 0.30-0.55 coverage window), and the
        // shape alone — whether the paint actually stops there is read from
        // the paint itself, so a weak wall that holds paint gets no rim.
        const shadeWallFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uObstacle;
            uniform float uObsMax;
            ${obsTexelGLSL}
            void main() {
                float cov = obsTexCoverage(texture(uObstacle, vUv), uObsMax);
                fragColor = vec4(smoothstep(0.30, 0.55, cov), 0.0, 0.0, 1.0);
            }
        `;
        // The form field's first pass (blurFrag's horizontal 3-tap
        // downsample), split by that mask and reduced to luma, the only thing
        // the shading reads: x = sum open*L, y = sum open, z = sum wall*L,
        // w = sum wall. The blur that follows is linear, so the four channels
        // stay a pair of weighted sums displayFrag can normalize.
        const shadeFormFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv, vL, vR;
            out vec4 fragColor;
            uniform sampler2D uTexture; // the frame being shaded (HDR dye)
            uniform sampler2D uWall;    // shadeWallFrag's mask, sim res
            void main() {
                const vec3 lumaW = vec3(0.299, 0.587, 0.114);
                vec3 l = vec3(dot(texture(uTexture, vL).rgb, lumaW),
                              dot(texture(uTexture, vUv).rgb, lumaW),
                              dot(texture(uTexture, vR).rgb, lumaW));
                vec3 k = vec3(0.35294117, 0.29411764, 0.35294117);
                vec3 wall = k * vec3(texture(uWall, vL).r, texture(uWall, vUv).r, texture(uWall, vR).r);
                vec3 open = k - wall;
                fragColor = vec4(dot(open, l), open.x + open.y + open.z,
                                 dot(wall, l), wall.x + wall.y + wall.z);
            }
        `;
        // ─── PhotoSafe (photosensitivity protection) shaders ──────────────
        // Three tiny passes that make the WCAG 2.3.1 / ISO 9241-391 flash
        // limits hold on the FINAL composited frame — whatever produced it
        // (strokes, peers, replay, audio scenes, Glow, Ignite, Light Shift).
        // 1. photoSafeLumaFrag: 16×16 block grid of approximately-linear
        //    luminance + redness of the rendered frame.
        // 2. photoSafeStatsFrag: 1×1 state update — flash-area detection,
        //    suppression envelope, slew-limited global luminance target.
        // 3. photoSafeCompositeFrag: exposure correction + history blend;
        //    EXACT pass-through (mix a=1.0) when the envelope is idle.
        const photoSafeLumaFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTexture;   // the rendered frame (safeFrame)
            void main() {
                // 4x4 jittered taps per block; LINEAR filtering widens each
                // tap to a 2x2 average, so a block integrates ~8x8 samples.
                vec2 block = vec2(1.0 / 16.0);
                vec2 base = vUv - block * 0.5;
                float luma = 0.0;
                float red = 0.0;
                for (int i = 0; i < 4; i++) {
                    for (int j = 0; j < 4; j++) {
                        vec2 off = (vec2(float(i), float(j)) + 0.5) * 0.25 * block;
                        vec3 c = texture(uTexture, base + off).rgb;
                        // Display-referred values; square approximates the
                        // linearization WCAG relative luminance expects.
                        vec3 lin = c * c;
                        luma += dot(lin, vec3(0.2126, 0.7152, 0.0722));
                        red += max(0.0, lin.r - 0.5 * (lin.g + lin.b));
                    }
                }
                fragColor = vec4(luma / 16.0, red / 16.0, 0.0, 1.0);
            }
        `;
        const photoSafeStatsFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uLumaCur;   // 16x16 this frame  (r=luma g=red)
            uniform sampler2D uLumaPrev;  // 16x16 previous frame
            uniform sampler2D uStatsPrev; // 2x1 state, layout below
            uniform float dt;             // wall-clock seconds, clamped by caller
            uniform float slew;           // max luma change per second (global)
            uniform float flashDelta;     // per-block flash threshold (0.10)
            uniform float darkFloor;      // WCAG dark-state condition (0.80)
            uniform float redDelta;       // red-transition threshold (0.20)
            uniform float areaFrac;       // min flashing area to count a transition
            uniform float releaseTau;     // envelope decay time constant (s)
            uniform float pairWindow;     // opposing-transition window (s)
            uniform float rateAllow;      // transitions/sec permitted before engaging
            //
            // 2x1 state. Texel 0 (display): R envelope, G slew-limited luma
            // target, B this frame's TRUE mean (the composite needs it to form
            // a GLOBAL exposure ratio), A init flag. Texel 1 (detector):
            // R lastSign+1, G pairTimer, B transition-rate accumulator, A init.
            //
            // WHY RATE, NOT DEVIATION: v1 also flagged a block whose luminance
            // deviated from its own short EMA. Painting does that constantly —
            // a stroke entering a block raises it far above its 0.12s average —
            // so merely painting pinned the envelope at 1.0 and the history
            // blend smeared the canvas into ghosts. The hazard WCAG defines is
            // not deviation, it is OSCILLATION: >3 flashes/sec. So count
            // opposing transitions and engage on their RATE. Monotonic change
            // (painting, fades, dye drifting through a block) contributes at
            // most one transition and then stops; only genuine flicker
            // sustains a high rate.
            void main() {
                vec4 s0 = texture(uStatsPrev, vec2(0.25, 0.5));
                vec4 s1 = texture(uStatsPrev, vec2(0.75, 0.5));
                float meanCur = 0.0;
                float posArea = 0.0;
                float negArea = 0.0;
                for (int i = 0; i < 16; i++) {
                    for (int j = 0; j < 16; j++) {
                        vec2 uv = (vec2(float(i), float(j)) + 0.5) / 16.0;
                        vec2 cur = texture(uLumaCur, uv).rg;
                        vec2 prv = texture(uLumaPrev, uv).rg;
                        meanCur += cur.r;
                        float dL = cur.r - prv.r;
                        float dR = cur.g - prv.g;
                        // WCAG flash transition: >=10% of max luminance with
                        // the darker state below 0.80, plus the stricter
                        // saturated-red rule (isoluminant red counts too).
                        float sgn = 0.0;
                        if (abs(dL) >= flashDelta && min(cur.r, prv.r) < darkFloor) sgn = sign(dL);
                        else if (abs(dR) >= redDelta) sgn = (dR >= 0.0) ? 1.0 : -1.0;
                        if (sgn > 0.5) posArea += 1.0;
                        else if (sgn < -0.5) negArea += 1.0;
                    }
                }
                meanCur /= 256.0;
                posArea /= 256.0;
                negArea /= 256.0;
                // Fresh FBO (all zeros): seed from the live scene so boot and
                // resize never open with a spurious exposure dip.
                if (s0.a < 0.5) {
                    if (gl_FragCoord.x < 1.0) fragColor = vec4(0.0, meanCur, meanCur, 1.0);
                    else fragColor = vec4(1.0, 0.0, 0.0, 1.0);
                    return;
                }
                float envelope = s0.r;
                float slewLuma = s0.g;
                float lastSign = s1.r - 1.0;   // -1 / 0 / +1
                float pairTimer = s1.g;
                float rate = s1.b;
                // Rate accumulator decays with tau = 1s, so its steady-state
                // value IS the transitions-per-second of a sustained flicker.
                rate *= exp(-dt / 1.0);
                pairTimer += dt;
                float total = posArea + negArea;
                // Antiphase strobes (one region up while another goes down)
                // barely move the global mean, so the dominant side is what
                // flips: sign(pos-neg) handles both the ordinary and the
                // antiphase case with one rule.
                float dir = (total >= areaFrac) ? ((posArea >= negArea) ? 1.0 : -1.0) : 0.0;
                if (dir != 0.0 && dir != lastSign) {
                    // An OPPOSING transition inside the window is half of a
                    // flash pair. Outside the window it just re-arms.
                    if (lastSign != 0.0 && pairTimer <= pairWindow) rate += 1.0;
                    lastSign = dir;
                    pairTimer = 0.0;
                } else if (pairTimer > pairWindow * 3.0) {
                    lastSign = 0.0;   // flicker stopped; forget the phase
                }
                rate = min(rate, 40.0);
                // Engage on RATE: rateAllow transitions/sec is the permitted
                // floor (a square-wave flash is TWO transitions, so 6/s == the
                // 3 flashes/sec danger line), ramping to full 4/s above it.
                float engage = smoothstep(rateAllow, rateAllow + 4.0, rate);
                envelope = max(engage, envelope * exp(-dt / max(releaseTau, 0.05)));
                if (envelope < 0.004) envelope = 0.0;   // snap to exact pass-through
                // Global slew clamp \u2014 ALWAYS on, independent of the envelope.
                // This is the hard guarantee: a slew-limited signal at f has
                // peak-to-peak <= slew/(2f), so 0.5/s gives 0.083 at 3 Hz,
                // under the 0.10 threshold, whatever the source. It is also
                // what covers slow sine/ramp strobes that per-frame deltas are
                // too coarse to flag.
                slewLuma += clamp(meanCur - slewLuma, -slew * dt, slew * dt);
                if (gl_FragCoord.x < 1.0) fragColor = vec4(envelope, slewLuma, meanCur, 1.0);
                else fragColor = vec4(lastSign + 1.0, min(pairTimer, 9.0), rate, 1.0);
            }
        `;
        const photoSafeCompositeFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uCur;    // this frame (safeFrame)
            uniform sampler2D uHist;   // last PRESENTED frame (safeOut.read)
            uniform sampler2D uStats;  // 2x1 state (texel 0 = display state)
            uniform float dt;          // wall-clock seconds, clamped by caller
            void main() {
                vec4 cur = texture(uCur, vUv);
                vec4 hist = texture(uHist, vUv);
                vec4 st = texture(uStats, vec2(0.25, 0.5));
                float envelope = st.r;
                float slewLuma = st.g;
                float meanFrame = st.b;
                // GLOBAL exposure: one uniform ratio for every pixel. On a
                // settled scene slewLuma lands exactly on meanFrame, so the
                // branch below restores bit-exact pass-through. Asymmetric cap:
                // dimming a bright flash is protective, brightening past 1.25x
                // would add light the artist never painted.
                float exposure = clamp((slewLuma + 0.005) / (meanFrame + 0.005), 0.33, 1.25);
                vec3 corr;
                if (exposure == 1.0) {
                    corr = cur.rgb;   // exact \u2014 no sqrt(x*x) round-trip
                } else {
                    corr = sqrt(cur.rgb * cur.rgb * exposure);
                }
                // History blend, dt-corrected: at full suppression the follow
                // rate is 1-exp(-dt/0.55) \u2014 0.030/frame at 60 fps, the same
                // 0.29 Hz corner (3 Hz attenuated to ~0.097) at ANY refresh
                // rate. a = 1 -> EXACT pass-through.
                float aSup = 1.0 - exp(-dt / 0.55);
                float a = mix(1.0, aSup, envelope);
                fragColor = vec4(mix(hist.rgb, corr, a), mix(hist.a, cur.a, a));
            }
        `;
