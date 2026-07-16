// ═══════════════════════════════════════════════════════════════════
// js/05b-shader-sim.js — part 2/14 of former 05-fluid-sim.js (lines 654–966)
// LOAD ORDER: after 05a-shader-core.js, before 05c-programs-framebuffers.js
// PROVIDES: splat/advection/macAdvect/macCorrect/divergence/curl/turbulence/vorticity/pressure/mgResidual/mgRestrict/mgProlong/gradient/clear/obstacleDamp/sunrays frag sources
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
            uniform float stampNoise;  // 0 = classic gaussian splat; >0 blends in the clay stamp
            uniform vec2 stampSeed;    // per-splat offset so consecutive stamps differ
            uniform int stampShape;    // 0 = blob, 1 = chisel (square press), 2 = streak (elongated smear)
            uniform float ringRadius;  // >0: thin ring-band stamp at this radius (aspect-corrected UV); 0 = classic blob
            uniform float ringSquash;  // ring ellipse squash (1 = circle, <1 = flattened vertically)
            uniform float barHalfW;    // >0: crisp bar stamp this half-width wide (aspect-corrected UV); EQ lane slabs
            uniform float barPoint;    // bar stamp tip lift: 0 = flat slab, >0 = pointed arch (flame tongue)
            uniform int gateColor;     // 1 = clamp dye at the splat's own color (no HDR overflow into white)
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
                if (hasObstacle == 1) {
                    // Must match obstacleSolidityGLSL's curve: dye injection
                    // blocking and the projection's wall must agree on where
                    // the wall IS, or paint deposits inside a wall the flow
                    // respects (burned-in rims). See the solidity() comment.
                    float ocov = clamp(texture(uObstacle, vUv).r / max(uObsMax, 0.05), 0.0, 1.0);
                    float osr = clamp(uObsMax, 0.0, 1.0);
                    osr = min(osr * osr * osr, 0.997); // full-range strength curve + stability ceiling (matches solidity())
                    obsBlock = 1.0 - osr * smoothstep(0.35, 0.85, ocov);
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
                    float velShield = smoothstep(0.0, 0.5, existingVelMag);
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
                    if (stampNoise > 0.0) {
                        // Clay stamp: hard-edged footprint with a noise-notched rim
                        // and surface grain instead of the gaussian bloom. Dye only —
                        // the velocity pass stays gaussian, or motion reads as glitch.
                        // Noise domain scales with splat size so grain tracks the brush.
                        vec2 q = p / sqrt(radius);
                        float n = sn_noise(q * 3.0 + stampSeed);
                        // Footprint metric per brush shape (r2-compatible units)
                        float m = r2;                                   // 0: round blob
                        if (stampShape == 1) {
                            float box = max(abs(q.x), abs(q.y));        // 1: chisel — square press
                            m = box * box;
                        } else if (stampShape == 2) {
                            vec2 qs = q * vec2(0.55, 2.4);              // 2: streak — wide smear
                            m = dot(qs, qs);
                        }
                        float rim = 1.4 * (0.55 + 0.9 * n);
                        float stamp = (1.0 - smoothstep(rim * 0.72, rim, m)) * (0.75 + 0.5 * n);
                        shape = mix(shape, stamp, stampNoise);
                    }
                    vec3 result;
                    if (gateColor == 1) {
                        // Gate: paint COVERS — dye converges to the stroke's own
                        // color instead of accumulating. A per-channel clamp was
                        // tried first (min(base+splat, max(base,color))) and
                        // failed: painting yellow over blue kept the old blue
                        // channel, and the union of channels tone-mapped to
                        // white. Mixing by splat intensity means heavy strokes
                        // become exactly the picked color over ANY underlying
                        // dye, while soft gaussian edges still blend.
                        float w = clamp(shape, 0.0, 1.0) * obsBlock;
                        result = mix(base, color, w);
                    } else {
                        result = base + shape * color * obsBlock;
                    }
                    fragColor = vec4(result, 1.0);
                }
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
        const rk2Backtrace = `
                vec2 vHalf = texture(uVelocity, vUv).xy;
                vec2 midUv = clamp(vUv - 0.5 * dt * vHalf * texelSize, 0.0, 1.0);
                vec2 disp = dt * texture(uVelocity, midUv).xy * texelSize;
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
        `;
        const advectionFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uVelocity, uSource;
            uniform sampler2D uObstacle;
            uniform vec2 texelSize;
            uniform vec2 srcTexelSize; // texel size of uSource (dye and sim grids differ)
            uniform float dt, dissipation;
            uniform float decayDt; // accumulated decay timestep; 0.0 = skip decay this frame
            uniform float uVelCap; // speed ceiling in canvas-widths/s (Max Speed slider)
            uniform float frozen; // 1.0 = freeze mode (preserve artwork, skip drains)
            uniform float bloomCeiling; // >0: cap dye's max channel here (Gate breathing safety)
            uniform float edgeAbsorb; // >0: absorbing borders — fluid vents off-canvas instead of bouncing
            uniform int isDensity;
            uniform int hasObstacle;
            uniform int macMode; // 1 = uSource is the already-advected MacCormack
                                 // result (macCorrectFrag output): self-fetch it
                                 // and apply only the decay/drain logic below.
            ${swirlGLSL}
            ${obstacleSolidityGLSL}
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
                    if (hasObstacle == 1) {
                        // Dilate by one sim texel: sub-texel mask gaps and the
                        // thin pinned rim still count as wall-adjacent.
                        float obsD = texture(uObstacle, vUv).r;
                        obsD = max(obsD, texture(uObstacle, vUv + vec2(texelSize.x, 0.0)).r);
                        obsD = max(obsD, texture(uObstacle, vUv - vec2(texelSize.x, 0.0)).r);
                        obsD = max(obsD, texture(uObstacle, vUv + vec2(0.0, texelSize.y)).r);
                        obsD = max(obsD, texture(uObstacle, vUv - vec2(0.0, texelSize.y)).r);
                        float covD = clamp(obsD / max(uObsMax, 0.05), 0.0, 1.0);
                        // Scaled by the strength response: leaky (low-strength)
                        // walls legitimately let dye THROUGH — draining it
                        // there would eat paint the physics allows to pass.
                        obsInterior = obsStrengthResponse() * smoothstep(0.55, 0.95, covD);
                    }
                    if ((dissipation < 0.999 || hasObstacle == 1) && frozen < 0.5) {
                        float stillness = exp(-speed * 30.0);
                        float boostRate = stillness * 0.005 * decayDt * 60.0;
                        // On preserve-style presets (dissipation ≈ 1.0) the
                        // boost exists ONLY to clear dye pinned in walls — keep
                        // it wall-local instead of eroding the whole artwork
                        // the moment any mask is active.
                        if (dissipation >= 0.999) boostRate *= obsInterior;
                        effectiveDecay *= max(1.0 - boostRate, 0.95);
                    }
                    color = effectiveDecay * source;
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
                        color *= 1.0 - obsInterior * 0.06 * dt * 60.0;
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
                    float capSpd = min(uVelCap / texelSize.x, 45000.0);
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
            ${swirlGLSL}
            ${obstacleSolidityGLSL}
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
                fragColor = mix(corrected, fwd, revert);
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
                vec2 force = curl * vec2(eta.y, -eta.x) * C * gate;
                fragColor = vec4(texture(uVelocity, vUv).xy + force * dt, 0.0, 1.0);
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
                vec3 dye = texture(uDye, vUv).rgb;
                vec4 s = texture(uSketch, vUv);
                fragColor = vec4(dye + s.rgb * gain, 1.0);
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
        // ─── Sunrays shaders ────────────────────────────────────────────
        const sunraysMaskFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTexture;
            void main() {
                vec4 c = texture(uTexture, vUv);
                float br = max(c.r, max(c.g, c.b));
                // HDR-aware brightness mapping: smooth gradient across full range
                // br=0 → mapped=0 (alpha=1.0, full light)
                // br=0.2 → mapped=0.5 (alpha=0.5, partial shadow)
                // br=1+ → mapped≈0.8+ (alpha=0.2, deep shadow)
                float mapped = br / (0.2 + br);
                c.a = 1.0 - min(mapped, 0.8);
                fragColor = c;
            }
        `;
        const sunraysFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTexture;
            uniform float weight;
            #define ITERATIONS 16
            void main() {
                float Density = 0.3;
                float Decay = 0.95;
                float Exposure = 0.7;
                vec2 coord = vUv;
                vec2 dir = vUv - 0.5;
                dir *= 1.0 / float(ITERATIONS) * Density;
                float illuminationDecay = 1.0;
                float color = 0.0;
                for (int i = 0; i < ITERATIONS; i++) {
                    coord -= dir;
                    float col = texture(uTexture, coord).a;
                    color += col * illuminationDecay * weight;
                    illuminationDecay *= Decay;
                }
                float result = color * Exposure;
                // Normalize to [0,1] so sunrays work as light/shadow multiplier
                result = result / (1.0 + result);
                fragColor = vec4(vec3(result), 1.0);
            }
        `;
