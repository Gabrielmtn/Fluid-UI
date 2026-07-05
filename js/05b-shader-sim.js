// ═══════════════════════════════════════════════════════════════════
// js/05b-shader-sim.js — part 2/14 of former 05-fluid-sim.js (lines 654–966)
// LOAD ORDER: after 05a-shader-core.js, before 05c-programs-framebuffers.js
// PROVIDES: splat/advection/divergence/curl/turbulence/vorticity/pressure/gradient/clear/obstacleDamp/sunrays frag sources
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
            uniform int gateColor;     // 1 = clamp dye at the splat's own color (no HDR overflow into white)
            uniform int isVelocity; // 1 for velocity, 0 for density
            uniform int hasObstacle;
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
                    obsBlock = 1.0 - smoothstep(0.1, 0.5, texture(uObstacle, vUv).r);
                }
                if (isVelocity == 1) {
                    // Motion Isolation: prevent new velocity from affecting areas with existing velocity
                    // Higher velocityInfluence = more isolation (less impact on existing areas)
                    // Range: 1.0 (no isolation) to 5.0 (maximum isolation)
                    // Calculate splat intensity
                    float dist = dot(p, p);
                    float splatIntensity = exp(-dist / radius);
                    vec3 splat = splatIntensity * color;
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
            uniform float frozen; // 1.0 = freeze mode (preserve artwork, skip drains)
            uniform float bloomCeiling; // >0: cap dye's max channel here (Gate breathing safety)
            uniform int isDensity;
            uniform int hasObstacle;
            void main() {
                vec2 disp = dt * texture(uVelocity, vUv).xy * texelSize;
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
                // along a moving frontier.
                float mTexels = length(disp / srcTexelSize);
                disp *= smoothstep(0.002, 0.05, mTexels);
                vec2 coord = clamp(vUv - disp, 0.0, 1.0);
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
                    if ((dissipation < 0.999 || hasObstacle == 1) && frozen < 0.5) {
                        float stillness = exp(-speed * 30.0);
                        float boostRate = stillness * 0.005 * decayDt * 60.0;
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
                        // Dilate by one sim texel: depth-thresholded masks leave
                        // sub-texel gaps (image detail) and a thin rim where dye
                        // is pinned without obs being high at the exact texel.
                        float obs = texture(uObstacle, vUv).r;
                        obs = max(obs, texture(uObstacle, vUv + vec2(texelSize.x, 0.0)).r);
                        obs = max(obs, texture(uObstacle, vUv - vec2(texelSize.x, 0.0)).r);
                        obs = max(obs, texture(uObstacle, vUv + vec2(0.0, texelSize.y)).r);
                        obs = max(obs, texture(uObstacle, vUv - vec2(0.0, texelSize.y)).r);
                        // Wider half-strength apron (±3 texels): with density
                        // decay near 1.0 (e.g. 0.9969) dye that the flow presses
                        // against the collider piles up at stagnation zones a few
                        // texels out and otherwise never clears — the burn halo.
                        float apron = texture(uObstacle, vUv + vec2(3.0 * texelSize.x, 0.0)).r;
                        apron = max(apron, texture(uObstacle, vUv - vec2(3.0 * texelSize.x, 0.0)).r);
                        apron = max(apron, texture(uObstacle, vUv + vec2(0.0, 3.0 * texelSize.y)).r);
                        apron = max(apron, texture(uObstacle, vUv - vec2(0.0, 3.0 * texelSize.y)).r);
                        obs = max(obs, apron * 0.55);
                        float obsSmooth = smoothstep(0.0, 0.45, obs);
                        color *= 1.0 - obsSmooth * 0.06 * dt * 60.0;
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
                }
                fragColor = color;
            }
        `;
        const divergenceFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vL, vR, vT, vB;
            out vec4 fragColor;
            uniform sampler2D uVelocity;
            vec2 sampleVelocity(vec2 uv) {
                vec2 m = vec2(1.0);
                if(uv.x < 0.0 || uv.x > 1.0) { uv.x = clamp(uv.x, 0.0, 1.0); m.x = -1.0; }
                if(uv.y < 0.0 || uv.y > 1.0) { uv.y = clamp(uv.y, 0.0, 1.0); m.y = -1.0; }
                return m * texture(uVelocity, uv).xy;
            }
            void main() {
                float div = 0.5 * (sampleVelocity(vR).x - sampleVelocity(vL).x + 
                                   sampleVelocity(vT).y - sampleVelocity(vB).y);
                fragColor = vec4(div, 0.0, 0.0, 1.0);
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
            uniform float curl, dt;
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
                vec2 force = curl * vec2(eta.y, -eta.x) * C * gate;
                fragColor = vec4(texture(uVelocity, vUv).xy + force * dt, 0.0, 1.0);
            }
        `;
        const pressureFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv, vL, vR, vT, vB;
            out vec4 fragColor;
            uniform sampler2D uPressure, uDivergence;
            void main() {
                vec2 L = clamp(vL, 0.0, 1.0), R = clamp(vR, 0.0, 1.0);
                vec2 T = clamp(vT, 0.0, 1.0), B = clamp(vB, 0.0, 1.0);
                float pressure = (texture(uPressure, L).x + texture(uPressure, R).x + 
                                 texture(uPressure, B).x + texture(uPressure, T).x - 
                                 texture(uDivergence, vUv).x) * 0.25;
                fragColor = vec4(pressure, 0.0, 0.0, 1.0);
            }
        `;
        const gradientFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv, vL, vR, vT, vB;
            out vec4 fragColor;
            uniform sampler2D uPressure, uVelocity;
            uniform vec2 texelSize;
            void main() {
                vec2 L = clamp(vL, 0.0, 1.0), R = clamp(vR, 0.0, 1.0);
                vec2 T = clamp(vT, 0.0, 1.0), B = clamp(vB, 0.0, 1.0);
                vec2 vel = texture(uVelocity, vUv).xy - vec2(texture(uPressure, R).x - texture(uPressure, L).x,
                                                              texture(uPressure, T).x - texture(uPressure, B).x);
                // No-penetration boundary: zero velocity normal to wall at edges
                if (vUv.x < texelSize.x)       vel.x = max(vel.x, 0.0);
                if (vUv.x > 1.0 - texelSize.x) vel.x = min(vel.x, 0.0);
                if (vUv.y < texelSize.y)        vel.y = max(vel.y, 0.0);
                if (vUv.y > 1.0 - texelSize.y)  vel.y = min(vel.y, 0.0);
                fragColor = vec4(vel, 0.0, 1.0);
            }
        `;
        const clearFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTexture;
            uniform float value;
            void main() { fragColor = value * texture(uTexture, vUv); }
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
            void main() {
                vec2 vel = texture(uVelocity, vUv).xy;
                // Sample obstacle with neighbors for smooth boundary (anti-alias)
                float c  = texture(uObstacle, vUv).r;
                float l  = texture(uObstacle, vUv - vec2(texelSize.x, 0.0)).r;
                float r  = texture(uObstacle, vUv + vec2(texelSize.x, 0.0)).r;
                float t  = texture(uObstacle, vUv + vec2(0.0, texelSize.y)).r;
                float b  = texture(uObstacle, vUv - vec2(0.0, texelSize.y)).r;
                float obs = (c * 4.0 + l + r + t + b) * 0.125;
                // Smooth damping curve — gradual slowdown instead of hard kill
                float damp = 1.0 - smoothstep(0.0, 0.8, obs);
                vel *= damp;
                fragColor = vec4(vel, 0.0, 1.0);
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
