// ═══════════════════════════════════════════════════════════════════
// js/05b-shader-sim.js — part 2/14 of former 05-fluid-sim.js (lines 654–966)
// LOAD ORDER: after 05a-shader-core.js, before 05c-programs-framebuffers.js
// PROVIDES: splat/advection/macAdvect/macCorrect/divergence/curl/turbulence/vorticity/pressure/mgResidual/mgRestrict/mgProlong/gradient/clear/obstacleDamp/glow frag sources
// REQUIRES: PRECISION (05a)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
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
                    // Must match obstacleSolidityGLSL's curve: dye injection
                    // blocking and the projection's wall must agree on where
                    // the wall IS, or paint deposits inside a wall the flow
                    // respects (burned-in rims). See the solidity() comment.
                    float ocov = clamp(texture(uObstacle, vUv).r / max(uObsMax, 0.05), 0.0, 1.0);
                    float osr = clamp(uObsMax, 0.0, 1.0);
                    osr = min(osr * osr * osr, 0.997); // full-range strength curve + stability ceiling (matches solidity())
                    obsBlock = 1.0 - osr * smoothstep(0.35, 0.85, ocov);
                    // The BRUSH is blocked by coverage alone, with no strength
                    // term (2026-08-16). The s^3 permeability curve is right for
                    // flow — a weak wall should leak — but applying it to direct
                    // deposition meant the brush painted 27% of every dab INTO a
                    // wall at the 0.9 default, and under Gate repeated dabs
                    // converge on the full picked colour, so a wall could simply
                    // be painted over. That is why colliding did not feel like
                    // colliding. Paint now goes AROUND the shape at every
                    // strength; advection through a leaky wall is untouched.
                    obsBlockDye = 1.0 - smoothstep(0.35, 0.85, ocov);
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
                    if (stampNoise > 0.0 && ringRadius <= 0.0 && barHalfW <= 0.0) {
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
                        float rim = 1.4 * (0.55 + 0.9 * n);
                        float stamp = (1.0 - smoothstep(rim * 0.72, rim, m)) * (0.75 + 0.5 * n);
                        shape = mix(shape, stamp, stampNoise);
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
                        float cov = 0.0;
                        if (all(greaterThanEqual(suv, vec2(0.0))) && all(lessThanEqual(suv, vec2(1.0)))) {
                            cov = texture(uStampTex, suv).a;
                        }
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
        // Curl-noise micro-swirl (Bridson 2007): the curl of a scrolling
        // value-noise potential is divergence-free by construction, so it
        // never fights the pressure solve. Applied ONLY as an offset to the
        // dye-sampling displacement (uniform-gated; the velocity pass sets
        // swirl=0) — never written back into the velocity texture, so it's
        // feedback-safe: still pure bilinear resampling, gain ≤ 1. Adds
        // painterly sub-grid wisps below sim-grid resolution for one noise
        // eval. Shared by all three dye advection passes — the MacCormack
        // correction needs the exact same displacement in every pass.
        const swirlGLSL = `
            uniform float swirl;     // micro-swirl strength (0 = off, branch skipped)
            uniform float swirlTime; // animation clock, seconds
            float sw_hash(vec2 q) {
                q = fract(q * vec2(127.1, 311.7));
                q += dot(q, q + 19.19);
                return fract(q.x * q.y);
            }
            float sw_noise(vec2 q) {
                vec2 i = floor(q), f = fract(q);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(sw_hash(i),                  sw_hash(i + vec2(1.0, 0.0)), f.x),
                           mix(sw_hash(i + vec2(0.0, 1.0)), sw_hash(i + vec2(1.0, 1.0)), f.x), f.y);
            }
            vec2 swirlCurl(vec2 uv, float t) {
                // 2D curl of the noise potential: (dN/dy, -dN/dx)
                vec2 q = uv * 24.0 + vec2(t * 0.35, -t * 0.27);
                float e = 0.35;
                float dy = sw_noise(q + vec2(0.0, e)) - sw_noise(q - vec2(0.0, e));
                float dx = sw_noise(q + vec2(e, 0.0)) - sw_noise(q - vec2(e, 0.0));
                return vec2(dy, -dx) * (0.5 / e);
            }
        `;
        // Obstacle solidity: defined HERE (above the advection shaders)
        // because rk2Backtrace's obstacle-aware probes call solidity() —
        // every includer must interpolate this snippet first. Consumed by
        // the projection passes (divergence/pressure/mgResidual/gradient)
        // further down and by all three dye advection passes.
        const obstacleSolidityGLSL = `
            uniform float uObsMax; // max collisionStrength among composited
                                   // collision sources (JS: window.__obsStrengthMax)
            float obsStrengthResponse() {
                // s³: blocking COMPOUNDS over frames (a 65%-solidity wall
                // already stops a steady jet), so a perceptually graded
                // slider needs a response that stays low through the mid
                // range — measured with an even S-curve the wall still
                // cliffed between 0.5 and 0.8. Cubic spreads usable
                // permeability across the upper half.
                // Ceiling 0.997 (2026-07-15, Gabriel): a PERFECT seal is the
                // degenerate extreme — dye/energy pressed against zero-leak
                // walls pile into HDR blowout ("intense overflow destruction
                // at 1.0, really nice at 0.999"). 0.997 is exactly the
                // response slider-0.999 produced, so 1.0 now means "as solid
                // as is stable" — visually rigid, never mathematically sealed.
                float s = clamp(uObsMax, 0.0, 1.0);
                return min(s * s * s, 0.997);
            }
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
                float cov = clamp(texture(uObstacle, uv).r / max(uObsMax, 0.05), 0.0, 1.0);
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
                return min(0.995, obsStrengthResponse() * smoothstep(0.35, 0.85, cov));
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
                vec2 midUv = clamp(vUv - 0.5 * dt * vHalf, 0.0, 1.0);
                vec2 disp = dt * texture(uVelocity, midUv).xy;
                float mTexels = length(disp / srcTexelSize);
                // Swirl magnitude rides on the LOCAL advective displacement
                // (mTexels factor): moving paint wisps, settled paint gets
                // exactly nothing — and the settle ease-out below multiplies
                // the total, so the at-rest bit-stability guarantee holds
                // with swirl active.
                if (swirl > 0.0) {
                    disp += swirlCurl(vUv, swirlTime) * (mTexels * swirl) * srcTexelSize;
                }
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
                // final displacement (swirl offset included) so dry regions set
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
            uniform int isDensity;
            uniform int hasObstacle;
            uniform int macMode; // 1 = uSource is the already-advected MacCormack
                                 // result (macCorrectFrag output): self-fetch it
                                 // and apply only the decay/drain logic below.
            ${swirlGLSL}
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
                        float covOwn = clamp(texture(uObstacle, vUv).r / max(uObsMax, 0.05), 0.0, 1.0);
                        float obsD = texture(uObstacle, vUv).r;
                        obsD = max(obsD, texture(uObstacle, vUv + vec2(obstacleTexelSize.x, 0.0)).r);
                        obsD = max(obsD, texture(uObstacle, vUv - vec2(obstacleTexelSize.x, 0.0)).r);
                        obsD = max(obsD, texture(uObstacle, vUv + vec2(0.0, obstacleTexelSize.y)).r);
                        obsD = max(obsD, texture(uObstacle, vUv - vec2(0.0, obstacleTexelSize.y)).r);
                        float covD = clamp(obsD / max(uObsMax, 0.05), 0.0, 1.0);
                        // Scaled by the strength response: leaky (low-strength)
                        // walls legitimately let dye THROUGH — draining it
                        // there would eat paint the physics allows to pass.
                        obsInterior = obsStrengthResponse() * smoothstep(0.55, 0.95, covD);
                        obsCore = obsStrengthResponse()
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
                // exits freely — this hairline drain at the outermost ~2.5%
                // just guarantees whatever crosses the rim dies there and never
                // washes back in via the clamped edge texels. Invisible: it sits
                // at the border, not inside the composition.
                if (edgeAbsorb > 0.0) {
                    float ed = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
                    float bandK = (1.0 - smoothstep(0.0, 0.025, ed)) * edgeAbsorb;
                    color *= max(0.0, 1.0 - bandK * 0.55 * dt * 60.0);
                    if (isDensity == 0) color.a = 1.0;
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
            uniform int hasObstacle;
            ${swirlGLSL}
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
            uniform int hasObstacle;
            uniform float deband;        // 0 = off (bit-exact); >0 softens fast-moving dye cliffs
            ${swirlGLSL}
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
        // shared rk2Backtrace as the dye — swirl=0 and wetInfluence=0 so the
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
            uniform float dryMul;          // batched half-life factor (1.0 = no-op)
            uniform int hasObstacle;
            ${swirlGLSL}
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
            in vec2 vL, vR, vT, vB;
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
                    float o = texture(uObstacle, vUv).r;
                    o = max(o, texture(uObstacle, cL).r);
                    o = max(o, texture(uObstacle, cR).r);
                    o = max(o, texture(uObstacle, cT).r);
                    o = max(o, texture(uObstacle, cB).r);
                    float cov = clamp(o / max(uObsMax, 0.05), 0.0, 1.0);
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
                    vec2 tang = vec2(-dir.y, dir.x);           // swirl keeps the pool alive
                    transport += (dir + tang * uSwirl) * (A.z * f);
                }
                transport *= uForce * fillGate;
                // Semi-Lagrangian gather: sample from the OUTWARD side so dye
                // creeps toward the magnet. Pure resample — bounded, no energy.
                vec2 src = clamp(vUv - transport * dt, 0.0, 1.0);
                // Carry alpha through the gather: it is pigment memory now, and
                // writing a constant here would erase it everywhere the
                // attractor field runs (and read as full-strength memory over
                // the whole canvas, so Ignite would blow the pool out).
                fragColor = texture(uDensity, src);
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
                    float cov = clamp(texture(uObstacle, vUv).r / max(uObsMax, 0.05), 0.0, 1.0);
                    k *= 1.0 - smoothstep(0.65, 0.98, cov);
                }
                fragColor = vec4(c - hfv * k, 0.0, 1.0);
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
            uniform float strength;
            uniform vec2 texelSize; // obstacle texel (1/obsW, 1/obsH)
            uniform float covKnee; // alpha at which coverage saturates to
                                   // fully solid (config.COLLIDER_ALPHA_SOLID)
            void main() {
                vec2 q = vUv - vec2(0.5) - sourceTransform.xy;
                float c = cos(sourceRotation);
                float s = sin(sourceRotation);
                q = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);
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
                        vec2 so = vec2(c * off.x + s * off.y, -s * off.x + c * off.y) * invScale;
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
                float previous = texture(uObstacle, vUv).r;
                fragColor = vec4(min(1.0, previous + coverage), 0.0, 0.0, 1.0);
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
                float c = texture(uTexture, vUv).r;
                float l = texture(uTexture, clamp(vL, 0.0, 1.0)).r;
                float r = texture(uTexture, clamp(vR, 0.0, 1.0)).r;
                float t = texture(uTexture, clamp(vT, 0.0, 1.0)).r;
                float b = texture(uTexture, clamp(vB, 0.0, 1.0)).r;
                float mx = max(c, max(max(l, r), max(t, b)));
                float mn = min(c, min(min(l, r), min(t, b)));
                fragColor = vec4(isErode == 1 ? mn : mx, 0.0, 0.0, 1.0);
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
                vec2 vel = texture(uVelocity, vUv).xy - vec2(pR - pL, pT - pB) / pScale;
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
            uniform float wallSlip; // 0 = legacy full-apron damp ("sticky" walls),
                                    // 1 = interior-mostly damp. The obstacle-aware
                                    // projection (Phase 1) already enforces
                                    // no-penetration and kills interior velocity —
                                    // this pass's wide apron was also killing the
                                    // TANGENTIAL flow the projection deliberately
                                    // preserves, making collisions feel sluggish
                                    // instead of fluid-sliding-around-stone.
                                    // Driven by config.WALL_SLIP (default 0.6).
            void main() {
                vec2 vel = texture(uVelocity, vUv).xy;
                // Sample obstacle with neighbors for smooth boundary (anti-alias)
                float c  = texture(uObstacle, vUv).r;
                float l  = texture(uObstacle, vUv - vec2(texelSize.x, 0.0)).r;
                float r  = texture(uObstacle, vUv + vec2(texelSize.x, 0.0)).r;
                float t  = texture(uObstacle, vUv + vec2(0.0, texelSize.y)).r;
                float b  = texture(uObstacle, vUv - vec2(0.0, texelSize.y)).r;
                float obs = (c * 4.0 + l + r + t + b) * 0.125;
                // Coverage-normalized + strength-scaled (2026-07-15): the damp
                // depth follows the same full-range strength S-curve as
                // solidity(), so the Strength slider grades damping instead of
                // cliffing at 0.5; wallSlip still narrows the curve toward the
                // interior (its window now operates on coverage 0..1).
                float covAvg = clamp(obs / max(uObsMax, 0.05), 0.0, 1.0);
                float osr = clamp(uObsMax, 0.0, 1.0);
                osr = min(osr * osr * osr, 0.997); // stability ceiling (matches solidity())
                float damp = 1.0 - osr * smoothstep(wallSlip * 0.45, 0.8 + wallSlip * 0.1, covAvg);
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
            void main() {
                vec2 p = vUv - point;
                p.x *= aspectRatio;
                float r2 = dot(p, p) / radius;
                float soft = exp(-r2 * 3.0);
                float hard = 1.0 - smoothstep(0.72, 1.0, r2);
                float a = mix(soft, hard, clamp(hardness, 0.0, 1.0)) * clamp(flow, 0.0, 1.0);
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
