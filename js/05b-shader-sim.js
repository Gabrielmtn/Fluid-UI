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
            uniform int isVelocity; // 1 for velocity, 0 for density
            uniform int hasObstacle;
            void main() {
                vec2 p = vUv - point;
                p.x *= aspectRatio;
                vec3 base = texture(uTarget, vUv).xyz;
                // Don't inject paint or velocity inside collision masks: the
                // damped velocity field pins whatever lands there, so injected
                // dye lingers as a burned-in imprint of the mask shape.
                float obsBlock = 1.0;
                if (hasObstacle == 1) {
                    obsBlock = 1.0 - smoothstep(0.15, 0.7, texture(uObstacle, vUv).r);
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
                    vec3 splat = exp(-dot(p, p) / radius) * color;
                    fragColor = vec4(base + splat * obsBlock, 1.0);
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
            uniform float dt, dissipation;
            uniform int isDensity;
            uniform int hasObstacle;
            void main() {
                vec2 coord = clamp(vUv - dt * texture(uVelocity, vUv).xy * texelSize, 0.0, 1.0);
                // Time-independent dissipation: pow(d, dt*60) so decay rate is
                // constant regardless of framerate. 60.0 = reference FPS these
                // values were tuned for. At 60fps dt=1/60 → pow(d,1) = d (unchanged).
                // At 144fps dt=1/144 → pow(d,0.417) = weaker per-frame decay = same per-second.
                float decay = pow(dissipation, dt * 60.0);
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
                    if (dissipation < 0.999) {
                        float stillness = exp(-speed * 30.0);
                        float boostRate = stillness * 0.005 * dt * 60.0;
                        effectiveDecay *= max(1.0 - boostRate, 0.95);
                    }
                    color = effectiveDecay * source;
                    // Obstacle-aware drain: dye inside collision masks cannot
                    // advect out (velocity is damped to zero there), so dissolve
                    // it FASTER, not slower — the old slow-decay override pinned
                    // a burned-in imprint of the mask shape. Skipped in freeze
                    // mode (dissipation ~1.0 = preserve artwork).
                    if (hasObstacle == 1 && dissipation < 0.999) {
                        float obs = texture(uObstacle, vUv).r;
                        float obsSmooth = smoothstep(0.0, 0.6, obs);
                        color *= 1.0 - obsSmooth * 0.04 * dt * 60.0;
                    }
                    // Guaranteed-zero cleanup. Multiplicative decay alone never
                    // reaches zero (and half-float storage stalls it at a dim
                    // visible floor), which left a permanent residue wash that
                    // new paint interacted with badly.
                    // 1) Linear floor drain, proportional to the preset's decay
                    //    rate so slow "smoke" presets keep their long tails and
                    //    freeze mode (dissipation = 1.0) is untouched.
                    float floorEps = (1.0 - min(dissipation, 1.0)) * 0.02 * dt * 60.0;
                    color = max(color - floorEps, 0.0);
                    // 2) Smooth low-end ramp to zero (replaces the old binary
                    //    "< 0.001 → 0" snap, whose hard cutoff created jagged
                    //    boundaries between cleared and not-yet-cleared texels).
                    float maxC = max(max(color.r, color.g), color.b);
                    color *= smoothstep(0.0003, 0.0015, maxC);
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
        // Alternative turbulence shader for billowing clouds effect
        const turbulenceFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv, vL, vR, vT, vB;
            out vec4 fragColor;
            uniform sampler2D uVelocity;
            uniform float time;
            // Simple noise function for turbulence
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
            }
            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                float a = hash(i);
                float b = hash(i + vec2(1.0, 0.0));
                float c = hash(i + vec2(0.0, 1.0));
                float d = hash(i + vec2(1.0, 1.0));
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }
            void main() {
                // Get velocity field
                vec2 vel = texture(uVelocity, vUv).xy;
                float velMag = length(vel);
                // Large-scale turbulence based on velocity
                vec2 noiseCoord = vUv * 2.5 + vel * 0.3 + time * 0.02;
                float n1 = noise(noiseCoord) * 2.0 - 1.0;
                float n2 = noise(noiseCoord * 1.7 + vec2(5.2, 1.3)) * 2.0 - 1.0;
                // Create swirling turbulence
                float turbulence = n1 * 0.7 + n2 * 0.3;
                // Scale by velocity magnitude for more dynamic effect
                turbulence *= (0.5 + velMag * 2.0);
                fragColor = vec4(turbulence, 0.0, 0.0, 1.0);
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
