// ═══════════════════════════════════════════════════════════════════
// js/05a-shader-core.js — part 1/14 of former 05-fluid-sim.js (lines 1–653)
// LOAD ORDER: after 04-ui-interactions.js (async loader), before 05b-shader-sim.js
// PROVIDES: compileShader, Program, PRECISION, baseVert/blur/display/sharpen/microDetail/lighting/lightShift frag sources
// REQUIRES: gl (04)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        function compileShader(type, source) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(shader));
            }
            return shader;
        }
        class Program {
            constructor(vertSrc, fragSrc) {
                const vertShader = compileShader(gl.VERTEX_SHADER, vertSrc);
                const fragShader = compileShader(gl.FRAGMENT_SHADER, fragSrc);
                this.program = gl.createProgram();
                gl.attachShader(this.program, vertShader);
                gl.attachShader(this.program, fragShader);
                gl.linkProgram(this.program);
                if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
                    const info = gl.getProgramInfoLog(this.program) || 'Unknown link error';
                    console.error('Program link failed:', info);
                }
                this.uniforms = {};
                const count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
                for (let i = 0; i < count; i++) {
                    const name = gl.getActiveUniform(this.program, i).name;
                    this.uniforms[name] = gl.getUniformLocation(this.program, name);
                }
            }
            bind() {
                gl.useProgram(this.program);
            }
        }
        // WebGL2 / GLSL ES 3.00 GUARANTEES highp float in fragment shaders (the
        // "fragment highp is optional" caveat is WebGL1/ESSL100 only). mediump = real
        // fp16 (~10-bit mantissa) on mobile, which made the dissipation feedback loop's
        // decay math (05b advection: pow(dissipation, decayDt*60) + floor/smoothstep
        // cleanup) compound rounding error each frame -> grainy fadeout. highp matches
        // what desktop already runs (zero desktop change); only the final fp16 *store*
        // quantizes, which is uniform, not grainy. (Costs ~2x fragment time on scalar
        // mobile GPUs; the QualityGovernor absorbs it. If mobile perf regresses, split
        // into highp for the 05b sim/feedback shaders + mediump for cheap display passes.)
        const PRECISION = "highp";
        const baseVert = `#version 300 es
            precision ${PRECISION} float;
            layout (location = 0) in vec2 aPos;
            out vec2 vUv, vL, vR, vT, vB;
            uniform vec2 texelSize;
            void main() {
                vUv = aPos * 0.5 + 0.5;
                vL = vUv - vec2(texelSize.x, 0.0);
                vR = vUv + vec2(texelSize.x, 0.0);
                vT = vUv + vec2(0.0, texelSize.y);
                vB = vUv - vec2(0.0, texelSize.y);
                gl_Position = vec4(aPos, 0.0, 1.0);
            }
        `;
        const blurVert = `#version 300 es
            precision ${PRECISION} float;
            layout (location = 0) in vec2 aPos;
            out vec2 vUv, vL, vR;
            uniform vec2 texelSize;
            void main() {
                vUv = aPos * 0.5 + 0.5;
                float offset = 1.33333333;
                vL = vUv - texelSize * offset;
                vR = vUv + texelSize * offset;
                gl_Position = vec4(aPos, 0.0, 1.0);
            }
        `;
        const blurFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv, vL, vR;
            out vec4 fragColor;
            uniform sampler2D uTexture;
            void main() {
                vec4 sum = texture(uTexture, vUv) * 0.29411764;
                sum += texture(uTexture, vL) * 0.35294117;
                sum += texture(uTexture, vR) * 0.35294117;
                fragColor = sum;
            }
        `;
        const displayFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv, vL, vR, vT, vB;
            out vec4 fragColor;
            uniform sampler2D uTexture;
            uniform sampler2D uSunrays;
            uniform sampler2D uSketch;    // D2 raster sketch layer (premultiplied RGBA8)
            uniform float sketchEnabled;
            uniform sampler2D uShadeForm; // quarter-res blurred frame: the shading height field
            uniform vec2 shadeTexelSize;
            uniform float sunraysEnabled;
            uniform float preserveOpacity;
            uniform float backgroundTransparency;
            uniform float kaleidoEnabled;
            uniform float segments;
            uniform int kMode; // 0=Off,1=Wedge,2=MirrorH,3=MirrorV,4=MirrorQuad,5=Spiral
            uniform float kAngle; // radians
            uniform float kTwist; // radians per unit radius
            uniform float kZoom;  // scale
            uniform float kBlend; // 0..1
            uniform float displayShading; // 0=off, >0 = shading intensity
            uniform float shadeInvert;    // 1 = flip relief normals (clay chiaroscuro: strokes read as carved dents)
            uniform float gateVibrance;   // 1 = Gate on: re-add the saturation the Reinhard tone-map strips from HDR dye
            uniform vec2 texelSize;
            const float PI = 3.141592653589793;
            // Mode 1: Wedge - Facets create angular reflections
            vec2 kaleidoWedge(vec2 uv) {
                vec2 center = vec2(0.5);
                vec2 p = uv - center;
                float ca = cos(kAngle), sa = sin(kAngle);
                p = mat2(ca, -sa, sa, ca) * p;
                float r = length(p) * max(0.0001, kZoom);
                float a = atan(p.y, p.x);
                a += r * kTwist;
                float facets = max(1.0, segments);
                float segAngle = 2.0 * PI / facets;
                a = mod(a + 2.0 * PI, 2.0 * PI);
                a = mod(a, segAngle);
                a = abs(a - segAngle * 0.5);
                vec2 dir = vec2(cos(a), sin(a));
                vec2 mapped = dir * r;
                return mapped + center;
            }
            // Mode 2/3: Mirror - Layers create stacked reflections with depth
            vec2 mirrorLayers(vec2 uv, bool horizontal) {
                vec2 uvz = uv - vec2(0.5);
                float ca = cos(kAngle), sa = sin(kAngle);
                uvz = mat2(ca, -sa, sa, ca) * uvz;
                uvz = uvz * max(0.0001, kZoom);
                // Layers create repeating reflections with offset
                float layers = max(1.0, segments);
                float layerSize = 1.0 / layers;
                if (horizontal) {
                    float xPos = mod(abs(uvz.x) + 0.5, layerSize * 2.0);
                    if (xPos > layerSize) xPos = layerSize * 2.0 - xPos;
                    uvz.x = xPos - layerSize * 0.5;
                } else {
                    float yPos = mod(abs(uvz.y) + 0.5, layerSize * 2.0);
                    if (yPos > layerSize) yPos = layerSize * 2.0 - yPos;
                    uvz.y = yPos - layerSize * 0.5;
                }
                return uvz + vec2(0.5);
            }
            // Mode 4: Quad - Reflections multiply the quad mirror effect
            vec2 quadReflections(vec2 uv) {
                vec2 uvz = uv - vec2(0.5);
                float ca = cos(kAngle), sa = sin(kAngle);
                uvz = mat2(ca, -sa, sa, ca) * uvz;
                uvz = uvz * max(0.0001, kZoom);
                // Reflections create nested quad patterns
                float reflections = max(1.0, segments);
                float scale = pow(2.0, reflections - 1.0) * 0.5;
                uvz = uvz * scale;
                uvz = vec2(0.5 - abs(mod(uvz.x + 0.5, 1.0) - 0.5), 
                          0.5 - abs(mod(uvz.y + 0.5, 1.0) - 0.5));
                return uvz;
            }
            // Mode 5: Spiral - Rings create concentric spiral bands
            vec2 spiralRings(vec2 uv) {
                vec2 center = vec2(0.5);
                vec2 p = uv - center;
                float ca = cos(kAngle), sa = sin(kAngle);
                p = mat2(ca, -sa, sa, ca) * p;
                float r = length(p) * max(0.0001, kZoom);
                float a = atan(p.y, p.x);
                // Rings create banded spiral effect
                float rings = max(1.0, segments);
                float ringSize = 0.5 / rings;
                float bandedR = mod(r, ringSize * 2.0);
                if (bandedR > ringSize) bandedR = ringSize * 2.0 - bandedR;
                a += bandedR * kTwist * rings;
                vec2 mapped = vec2(cos(a), sin(a)) * bandedR;
                return mapped + center;
            }
            void main() {
                vec4 base = texture(uTexture, vUv);
                vec4 kcol = base;
                bool doK = (kMode != 0) && (kaleidoEnabled > 0.5);
                if (doK) {
                    vec2 uv2;
                    if (kMode == 1) {
                        // Wedge - Facets control angular divisions
                        uv2 = kaleidoWedge(vUv);
                    } else if (kMode == 2) {
                        // Mirror H - Layers control horizontal stacking
                        uv2 = mirrorLayers(vUv, true);
                    } else if (kMode == 3) {
                        // Mirror V - Layers control vertical stacking
                        uv2 = mirrorLayers(vUv, false);
                    } else if (kMode == 4) {
                        // Quad - Reflections control nested depth
                        uv2 = quadReflections(vUv);
                    } else if (kMode == 5) {
                        // Spiral - Rings control concentric bands
                        uv2 = spiralRings(vUv);
                    } else {
                        uv2 = vUv;
                    }
                    kcol = texture(uTexture, uv2);
                }
                vec4 color = mix(base, kcol, clamp(kBlend, 0.0, 1.0));
                float hdrMax = max(color.r, max(color.g, color.b));
                // Tone map HDR to displayable range (per-channel Reinhard)
                color.rgb = color.rgb / (1.0 + color.rgb);
                // Gate vibrance: per-channel Reinhard flattens channel ratios as
                // dye climbs into HDR — the washed-out look near the bloom
                // ceiling. Re-widen saturation in proportion to how deep into
                // HDR the dye sits (the richness the pre-Gate blowout showed in
                // transit, but bounded — dye can't pass the ceiling, so neither
                // can the boost).
                if (gateVibrance > 0.0) {
                    float satW = smoothstep(0.8, 2.5, hdrMax) * 0.35 * gateVibrance;
                    vec3 lw = vec3(0.299, 0.587, 0.114);
                    float gv = dot(color.rgb, lw);
                    color.rgb = clamp(mix(vec3(gv), color.rgb, 1.0 + satW), 0.0, 1.0);
                }
                // Enhanced display shading: normal-mapped lighting for 3D fabric/clay depth
                if (displayShading > 0.0) {
                    vec3 lumaW = vec3(0.299, 0.587, 0.114);
                    float centerLuma = dot(color.rgb, lumaW);
                    // Fade the whole effect out at low luminance: in fading dye
                    // the gradients are dominated by fp16 quantization steps and
                    // the sim's cleanup floor, and full-strength normals/contrast
                    // paint hard lines along those steps.
                    float shadeFade = smoothstep(0.005, 0.06, centerLuma);
                    // Gradient from the blurred quarter-res form field (raw
                    // HDR for strong gradients) — the paint-engine approach:
                    // relief is lit from a smoothed height map, so pigment
                    // texel noise (fp16 grain, stir micro-laminae) physically
                    // cannot read as texture; only actual swirl forms shade.
                    // Sobel at 1 form texel ≈ 4 dye texels; 0.0625 keeps the
                    // same response as the original 1-texel differences on
                    // smooth ramps.
                    vec2 t2 = shadeTexelSize;
                    float lL  = dot(texture(uShadeForm, vUv + vec2(-t2.x,  0.0 )).rgb, lumaW);
                    float lR  = dot(texture(uShadeForm, vUv + vec2( t2.x,  0.0 )).rgb, lumaW);
                    float lT  = dot(texture(uShadeForm, vUv + vec2( 0.0 ,  t2.y)).rgb, lumaW);
                    float lB  = dot(texture(uShadeForm, vUv + vec2( 0.0 , -t2.y)).rgb, lumaW);
                    float lTL = dot(texture(uShadeForm, vUv + vec2(-t2.x,  t2.y)).rgb, lumaW);
                    float lTR = dot(texture(uShadeForm, vUv + vec2( t2.x,  t2.y)).rgb, lumaW);
                    float lBL = dot(texture(uShadeForm, vUv + vec2(-t2.x, -t2.y)).rgb, lumaW);
                    float lBR = dot(texture(uShadeForm, vUv + vec2( t2.x, -t2.y)).rgb, lumaW);
                    float dx = ((lTR + 2.0 * lR + lBR) - (lTL + 2.0 * lL + lBL)) * 0.0625;
                    float dy = ((lTL + 2.0 * lT + lTR) - (lBL + 2.0 * lB + lBR)) * 0.0625;
                    float nStr = displayShading * 6.0 * shadeFade * (shadeInvert > 0.5 ? -1.0 : 1.0);
                    vec3 N = normalize(vec3(dx * nStr, dy * nStr, 0.25));
                    // Key light (upper-left, warm white)
                    vec3 keyDir = normalize(vec3(-0.5, 0.7, 0.9));
                    float keyDiff = max(dot(N, keyDir), 0.0);
                    vec3 warmKey = vec3(1.0, 0.97, 0.92);
                    // Fill light (lower-right, cool, softer)
                    vec3 fillDir = normalize(vec3(0.4, -0.5, 0.7));
                    float fillDiff = max(dot(N, fillDir), 0.0);
                    vec3 coolFill = vec3(0.9, 0.94, 1.0);
                    // Specular highlight (Blinn-Phong, key light)
                    vec3 V = vec3(0.0, 0.0, 1.0);
                    vec3 H = normalize(keyDir + V);
                    float spec = pow(max(dot(N, H), 0.0), 48.0);
                    // Ambient occlusion from curvature (Laplacian)
                    float avgN = (lL + lR + lT + lB) * 0.25;
                    avgN = avgN / (1.0 + avgN); // tone-map for comparison
                    float ao = smoothstep(-0.08, 0.04, centerLuma - avgN);
                    ao = mix(1.0, ao, displayShading * 0.6 * shadeFade);
                    // Combine lighting, normalized against a flat surface:
                    // without this, raising the intensity tilts normals away
                    // from the fixed lights and the WHOLE image darkens — the
                    // slider read as a brightness knob, not a relief knob.
                    // Dividing by the flat-normal lighting keeps flat areas at
                    // constant brightness at every intensity; only actual
                    // slopes get brighter/darker relative to it.
                    vec3 lighting = vec3(0.35) + keyDiff * warmKey * 0.55 + fillDiff * coolFill * 0.2;
                    vec3 lightFlat = vec3(0.35) + keyDir.z * warmKey * 0.55 + fillDir.z * coolFill * 0.2;
                    color.rgb = color.rgb * (lighting / lightFlat) * ao + spec * warmKey * 0.2 * centerLuma;
                    // S-curve contrast, faded at low luminance — near black it
                    // crushes faint dye toward zero and hardens the fade edge
                    color.rgb = min(color.rgb, vec3(1.0));
                    vec3 sCurved = color.rgb * color.rgb * (3.0 - 2.0 * color.rgb);
                    color.rgb = mix(color.rgb, sCurved, shadeFade);
                    // Saturation boost (fades to neutral at low luminance)
                    float gray = dot(color.rgb, lumaW);
                    color.rgb = mix(vec3(gray), color.rgb, 1.0 + (0.15 + displayShading * 0.35) * shadeFade);
                    color.rgb = max(color.rgb, vec3(0.0));
                }
                // Sunrays: multiplicative light/shadow on tone-mapped base
                if (sunraysEnabled > 0.5) {
                    float sr = texture(uSunrays, vUv).r;
                    color.rgb *= sr;
                }
                // D2 sketch layer: normal-control paint composited OVER the
                // fluid, AFTER tone-map/shading/sunrays (fluid effects never
                // touch it) and sampled at RAW vUv (kaleido never warps it —
                // a sketch stays where you drew it). Premultiplied over.
                float skA = 0.0;
                if (sketchEnabled > 0.5) {
                    vec4 sk = texture(uSketch, vUv);
                    color.rgb = color.rgb * (1.0 - sk.a) + sk.rgb;
                    skA = sk.a;
                }
                // ±0.5 LSB hash dither before the 8-bit store: smooth slow
                // gradients otherwise quantize into visible contour bands that
                // crawl as the field decays (the S-curve and saturation boost
                // in the shading pass steepen them further). Static pattern —
                // temporal dither would shimmer.
                float dn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
                color.rgb = max(color.rgb + dn * (1.0 / 255.0), 0.0);
                float intensity = max(max(color.r, color.g), color.b);
                if (preserveOpacity > 0.5) {
                    // Preserve fluid opacity - make alpha proportional to color intensity
                    // backgroundTransparency controls how transparent the black areas become
                    // (sketch coverage counts as content — dark sketch strokes
                    // must not go transparent in layer mode)
                    float alpha = mix(1.0, max(intensity, skA), backgroundTransparency);
                    fragColor = vec4(color.rgb, alpha);
                } else {
                    fragColor = color;
                }
            }
        `;
        const sharpenFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTexture;
            uniform sampler2D uVelocity;
            uniform float sharpness;
            uniform vec2 texelSize;
            uniform float kernelScale; // kernel radius in 2048-reference texels
                                       // (CPU pre-multiplies by dyeRes/2048): the
                                       // LOOK stops changing when governor/battery/
                                       // boot-ascent changes dye resolution, and
                                       // values >1 recreate the coarse "ridges"
                                       // emboss deliberately (Ridges slider).
            void main() {
                vec3 center = texture(uTexture, vUv).rgb;
                float centerIntensity = dot(center, vec3(0.299, 0.587, 0.114));
                // Early exit only for truly black pixels. The old hard cutoff
                // at 0.01 drew a visible seam where faint dye met sharpened
                // dye; sharpening now fades in smoothly across that range.
                if (centerIntensity < 0.001) {
                    fragColor = vec4(center, 1.0);
                    return;
                }
                float lowFade = smoothstep(0.003, 0.03, centerIntensity);
                // Sample neighbors for detail extraction (unsharp mask technique)
                vec2 off = texelSize * kernelScale;
                vec3 blur = vec3(0.0);
                blur += texture(uTexture, vUv + vec2(off.x, 0.0)).rgb;
                blur += texture(uTexture, vUv - vec2(off.x, 0.0)).rgb;
                blur += texture(uTexture, vUv + vec2(0.0, off.y)).rgb;
                blur += texture(uTexture, vUv - vec2(0.0, off.y)).rgb;
                blur *= 0.25;
                // Extract high-frequency detail, bounded to the local
                // intensity so faint dye is never more than ~doubled
                // (quantization steps would otherwise amplify into speckle)
                vec3 detail = center - blur;
                detail = clamp(detail, vec3(-centerIntensity), vec3(centerIntensity));
                // Velocity-adaptive sharpening (sharpen more where fluid moves),
                // faded out smoothly at low intensities so faint dye is never
                // contrast-amplified into jagged noise.
                vec2 vel = texture(uVelocity, vUv).xy;
                float velocityMag = length(vel);
                float adaptiveStrength = sharpness * (0.8 + min(velocityMag * 3.0, 1.2)) * lowFade;
                // Apply sharpening with clamping to prevent overshooting
                vec3 sharpened = center + detail * adaptiveStrength;
                // Clamp to valid range [0, max(center * 2.0, 1.0)]
                // This prevents white halos while allowing brightening
                vec3 maxVal = max(center * 2.0, vec3(1.0));
                sharpened = clamp(sharpened, vec3(0.0), maxVal);
                fragColor = vec4(sharpened, 1.0);
            }
        `;
        // ─── Micro Detail Pass ─────────────────────────────────────
        // Clarity + Vibrance only. Keeps fluid texture sharp through
        // TikTok / H.264 encoding without color artifacts.
        const microDetailFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTexture;
            uniform sampler2D uVelocity;
            uniform vec2 texelSize;
            uniform float clarity;    // 0–1: local contrast boost
            uniform float vibrance;   // 0–1: selective saturation
            uniform float kernelScale; // 2048-reference normalization (same
                                       // principle as sharpen): resolution
                                       // changes must not change the look
            void main() {
                vec3 center = texture(uTexture, vUv).rgb;
                vec3 lumaW = vec3(0.299, 0.587, 0.114);
                float centerLuma = dot(center, lumaW);
                // Early exit only for truly black pixels; the effect fades in
                // smoothly above that (same fix as the sharpen pass — a hard
                // cutoff draws a jagged seam through fading dye).
                if (centerLuma < 0.001) {
                    fragColor = vec4(center, 1.0);
                    return;
                }
                float lowFade = smoothstep(0.003, 0.03, centerLuma);
                vec3 result = center;
                // ── Clarity — Wide-kernel unsharp mask ──
                // Same proven additive approach as the sharpening pass
                // but with a wider 2-ring kernel for mid-frequency contrast.
                if (clarity > 0.0) {
                    vec2 t = texelSize * kernelScale;
                    vec2 t2 = t * 2.0;
                    // 12-tap weighted blur (8 inner + 4 outer at half weight)
                    vec3 blur = vec3(0.0);
                    blur += texture(uTexture, vUv + vec2(-t.x, -t.y)).rgb;
                    blur += texture(uTexture, vUv + vec2( 0.0, -t.y)).rgb;
                    blur += texture(uTexture, vUv + vec2( t.x, -t.y)).rgb;
                    blur += texture(uTexture, vUv + vec2(-t.x,  0.0)).rgb;
                    blur += texture(uTexture, vUv + vec2( t.x,  0.0)).rgb;
                    blur += texture(uTexture, vUv + vec2(-t.x,  t.y)).rgb;
                    blur += texture(uTexture, vUv + vec2( 0.0,  t.y)).rgb;
                    blur += texture(uTexture, vUv + vec2( t.x,  t.y)).rgb;
                    blur += texture(uTexture, vUv + vec2(-t2.x, 0.0)).rgb * 0.5;
                    blur += texture(uTexture, vUv + vec2( t2.x, 0.0)).rgb * 0.5;
                    blur += texture(uTexture, vUv + vec2(0.0, -t2.y)).rgb * 0.5;
                    blur += texture(uTexture, vUv + vec2(0.0,  t2.y)).rgb * 0.5;
                    blur /= 10.0;
                    // Extract detail and apply (same as sharpening pass)
                    vec3 detail = center - blur;
                    // Bound the swing to the local luminance so faint dye is
                    // never more than ~doubled — unbounded, fp16 quantization
                    // steps in fading dye amplify into hard speckle and lines.
                    detail = clamp(detail, vec3(-centerLuma), vec3(centerLuma));
                    // Velocity-adaptive strength, faded out at low luminance
                    float velMag = length(texture(uVelocity, vUv).xy);
                    float adaptiveStrength = clarity * (1.0 + min(velMag * 3.0, 1.5)) * lowFade;
                    // Additive unsharp mask with clamping
                    result = center + detail * adaptiveStrength * 1.5;
                    vec3 maxVal = max(center * 2.0, vec3(1.0));
                    result = clamp(result, vec3(0.0), maxVal);
                }
                // ── Vibrance — RGB-space selective saturation ──
                if (vibrance > 0.0) {
                    float gray = dot(result, lumaW);
                    float maxC = max(result.r, max(result.g, result.b));
                    float minC = min(result.r, min(result.g, result.b));
                    float sat = maxC > 0.001 ? (maxC - minC) / maxC : 0.0;
                    float boost = vibrance * (1.0 - sat * sat) * 1.2 * lowFade;
                    result = mix(vec3(gray), result, 1.0 + boost);
                    result = max(result, vec3(0.0));
                }
                fragColor = vec4(result, 1.0);
            }
        `;
        const lightingFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv, vL, vR, vT, vB;
            out vec4 fragColor;
            uniform sampler2D uTexture;
            uniform sampler2D uVelocity;
            uniform vec2 lightPos;
            uniform float intensity;
            uniform float ambient;
            uniform vec2 texelSize;
            // Light Shift uniforms
            uniform bool lightShiftEnabled;
            uniform vec3 lightShiftColor;
            uniform float lightShiftThreshold;
            uniform float lightShiftIntensity;
            uniform int lightShiftMode; // 0=replace, 1=tint, 2=overlay, 3=multiply, 4=screen, 5=add
            // Calculate very subtle pseudo-normal from color gradients
            vec3 calculateNormal(vec2 uv) {
                float left = dot(texture(uTexture, vL).rgb, vec3(0.299, 0.587, 0.114));
                float right = dot(texture(uTexture, vR).rgb, vec3(0.299, 0.587, 0.114));
                float top = dot(texture(uTexture, vT).rgb, vec3(0.299, 0.587, 0.114));
                float bottom = dot(texture(uTexture, vB).rgb, vec3(0.299, 0.587, 0.114));
                // Very subtle gradients
                float dx = (right - left) * 0.3;
                float dy = (top - bottom) * 0.3;
                // Mostly flat normal with slight tilt
                return normalize(vec3(dx, dy, 1.0));
            }
            void main() {
                vec4 color = texture(uTexture, vUv);
                vec2 vel = texture(uVelocity, vUv).xy;
                if (color.a < 0.01) {
                    fragColor = color;
                    return;
                }
                // Direction and distance to light
                vec2 toLight = lightPos - vUv;
                float dist = length(toLight);
                vec2 lightDir = normalize(toLight + 0.0001);
                // Pseudo-depth
                float colorDepth = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                float velMag = length(vel);
                float depth = colorDepth * (1.0 + velMag * 0.15);
                // Soft distance falloff
                float falloff = 1.0 / (1.0 + dist * dist * 4.0);
                // === DIFFUSE LIGHTING (main effect) ===
                vec3 normal = calculateNormal(vUv);
                vec3 lightDir3D = normalize(vec3(lightDir.x, lightDir.y, 0.5));
                // Lambertian diffuse (N · L) - this is the key lighting term
                float diffuse = max(0.0, dot(normal, lightDir3D));
                diffuse = mix(1.0, diffuse, 0.5); // More directional influence
                // === COMBINE LIGHTING ===
                // Diffuse is the primary lighting component (shadows removed for performance)
                float lightContribution = falloff * diffuse * intensity * 0.6;
                // Brightness: ambient + subtle directional boost
                float brightness = ambient + lightContribution * (1.0 - ambient);
                // === SUBTLE COLOR TEMPERATURE ===
                vec3 warmShift = vec3(1.03, 1.015, 0.99);  // Very subtle warm
                vec3 coolShift = vec3(0.98, 0.99, 1.02);   // Very subtle cool
                float colorShiftAmount = lightContribution * 0.4;
                vec3 colorShift = mix(coolShift, warmShift, colorShiftAmount);
                // Apply base lighting
                vec3 litColor = color.rgb * brightness * colorShift;
                // === SUBTLE RIM LIGHT (complementary) ===
                vec3 viewDir = vec3(0.0, 0.0, 1.0);
                float rimDot = 1.0 - max(0.0, dot(normal, viewDir));
                float rimLight = pow(rimDot, 4.0) * diffuse * falloff * intensity * 0.1;
                litColor += vec3(rimLight) * vec3(1.1, 1.05, 1.0);
                // === SUBTLE SPECULAR (complementary) ===
                vec3 halfVec = normalize(lightDir3D + viewDir);
                float specular = pow(max(0.0, dot(normal, halfVec)), 24.0);
                specular *= falloff * intensity * depth * 0.08;
                litColor += vec3(specular) * 0.5;
                // Soft clamp
                litColor = min(litColor, vec3(1.2));
                // === LIGHT SHIFT (color overexposure) ===
                if (lightShiftEnabled) {
                    // Calculate brightness of lit color
                    float litBrightness = dot(litColor, vec3(0.299, 0.587, 0.114));
                    // If brightness exceeds threshold, apply color shift
                    if (litBrightness > lightShiftThreshold) {
                        // Calculate how much over the threshold we are (0-1)
                        float overexposure = (litBrightness - lightShiftThreshold) / (1.2 - lightShiftThreshold);
                        overexposure = clamp(overexposure, 0.0, 1.0);
                        float shiftAmount = overexposure * lightShiftIntensity;
                        vec3 shiftedColor;
                        // Apply different blend modes
                        if (lightShiftMode == 0) {
                            // Replace: Direct color replacement
                            shiftedColor = mix(litColor, lightShiftColor * litBrightness, shiftAmount);
                        } else if (lightShiftMode == 1) {
                            // Tint: Preserve luminance, shift hue
                            shiftedColor = mix(litColor, lightShiftColor * litBrightness * 0.8 + litColor * 0.2, shiftAmount);
                        } else if (lightShiftMode == 2) {
                            // Overlay: Photoshop-style overlay blend
                            vec3 overlay;
                            for (int i = 0; i < 3; i++) {
                                if (litColor[i] < 0.5) {
                                    overlay[i] = 2.0 * litColor[i] * lightShiftColor[i];
                                } else {
                                    overlay[i] = 1.0 - 2.0 * (1.0 - litColor[i]) * (1.0 - lightShiftColor[i]);
                                }
                            }
                            shiftedColor = mix(litColor, overlay, shiftAmount);
                        } else if (lightShiftMode == 3) {
                            // Multiply: Darken with color
                            shiftedColor = mix(litColor, litColor * lightShiftColor, shiftAmount);
                        } else if (lightShiftMode == 4) {
                            // Screen: Lighten with color
                            vec3 screen = vec3(1.0) - (vec3(1.0) - litColor) * (vec3(1.0) - lightShiftColor);
                            shiftedColor = mix(litColor, screen, shiftAmount);
                        } else {
                            // Add: Additive blend
                            shiftedColor = mix(litColor, litColor + lightShiftColor * shiftAmount, shiftAmount);
                        }
                        litColor = shiftedColor;
                    }
                }
                fragColor = vec4(litColor, color.a);
            }
        `;
        // Standalone Light Shift shader (works without lighting
        // Applies color to overexposed/bright areas above threshold
        const lightShiftFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTexture;
            uniform vec3 lightShiftColor;
            uniform float lightShiftThreshold;
            uniform float lightShiftIntensity;
            uniform int lightShiftMode; // 0=replace, 1=tint, 2=overlay, 3=multiply, 4=screen, 5=add
            // Standard blend mode functions
            vec3 blendMultiply(vec3 base, vec3 blend) {
                return base * blend;
            }
            vec3 blendScreen(vec3 base, vec3 blend) {
                return 1.0 - (1.0 - base) * (1.0 - blend);
            }
            vec3 blendOverlay(vec3 base, vec3 blend) {
                vec3 result;
                result.r = base.r < 0.5 ? (2.0 * base.r * blend.r) : (1.0 - 2.0 * (1.0 - base.r) * (1.0 - blend.r));
                result.g = base.g < 0.5 ? (2.0 * base.g * blend.g) : (1.0 - 2.0 * (1.0 - base.g) * (1.0 - blend.g));
                result.b = base.b < 0.5 ? (2.0 * base.b * blend.b) : (1.0 - 2.0 * (1.0 - base.b) * (1.0 - blend.b));
                return result;
            }
            vec3 blendSoftLight(vec3 base, vec3 blend) {
                vec3 result;
                result.r = blend.r < 0.5 ? (2.0 * base.r * blend.r + base.r * base.r * (1.0 - 2.0 * blend.r)) : (sqrt(base.r) * (2.0 * blend.r - 1.0) + 2.0 * base.r * (1.0 - blend.r));
                result.g = blend.g < 0.5 ? (2.0 * base.g * blend.g + base.g * base.g * (1.0 - 2.0 * blend.g)) : (sqrt(base.g) * (2.0 * blend.g - 1.0) + 2.0 * base.g * (1.0 - blend.g));
                result.b = blend.b < 0.5 ? (2.0 * base.b * blend.b + base.b * base.b * (1.0 - 2.0 * blend.b)) : (sqrt(base.b) * (2.0 * blend.b - 1.0) + 2.0 * base.b * (1.0 - blend.b));
                return result;
            }
            vec3 blendAdd(vec3 base, vec3 blend) {
                return min(base + blend, 1.0);
            }
            void main() {
                vec4 color = texture(uTexture, vUv);
                // Skip fully transparent pixels
                if (color.a < 0.01) {
                    fragColor = color;
                    return;
                }
                // Multiple methods to detect "overblown" / bright areas:
                // 1. Luminance (perceived brightness)
                float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
                // 2. Max channel (catches saturated bright colors)
                float maxChannel = max(max(color.r, color.g), color.b);
                // 3. Average (simple brightness)
                float avgBrightness = (color.r + color.g + color.b) / 3.0;
                // 4. "Clipping" detection - how close channels are to 1.0
                //    This catches areas that WOULD be overblown if not clamped
                float clipR = smoothstep(0.9, 1.0, color.r);
                float clipG = smoothstep(0.9, 1.0, color.g);
                float clipB = smoothstep(0.9, 1.0, color.b);
                float clipping = max(max(clipR, clipG), clipB);
                // 5. Saturation loss detection - white areas have low saturation
                float minChannel = min(min(color.r, color.g), color.b);
                float saturation = maxChannel > 0.001 ? (maxChannel - minChannel) / maxChannel : 0.0;
                float desaturated = 1.0 - saturation; // High when approaching white
                // Combine detection methods:
                // - Use max of luminance and maxChannel for general brightness
                // - Weight by clipping detection for near-white areas
                // - Consider desaturation (white = bright + desaturated)
                float brightness = max(luminance, maxChannel);
                // Boost detection for desaturated bright areas (actual white/overblown)
                float overblownFactor = brightness;
                if (brightness > 0.7 && desaturated > 0.5) {
                    // This is likely an overblown area - boost the factor
                    overblownFactor = mix(brightness, 1.0, desaturated * 0.5);
                }
                // Also consider clipping
                overblownFactor = max(overblownFactor, clipping * 0.9 + brightness * 0.1);
                // Check against threshold
                if (overblownFactor > lightShiftThreshold) {
                    // Calculate blend strength - how far above threshold
                    float t = (overblownFactor - lightShiftThreshold) / (1.0 - lightShiftThreshold + 0.001);
                    t = clamp(t, 0.0, 1.0);
                    // Smooth transition
                    t = t * t * (3.0 - 2.0 * t); // smoothstep curve
                    // Final blend amount
                    float blendAmount = t * lightShiftIntensity;
                    // For very bright/white areas, increase the effect
                    if (desaturated > 0.7 && brightness > 0.85) {
                        blendAmount = min(blendAmount * 1.5, 1.0);
                    }
                    vec3 blendedColor;
                    if (lightShiftMode == 0) {
                        // Replace: Direct color replacement in bright areas
                        // Scale shift color by brightness to maintain some variation
                        float brightnessScale = 0.7 + luminance * 0.5;
                        blendedColor = mix(color.rgb, lightShiftColor * brightnessScale, blendAmount);
                    } else if (lightShiftMode == 1) {
                        // Tint: Colorize while preserving luminance structure
                        vec3 tinted = lightShiftColor * luminance;
                        blendedColor = mix(color.rgb, tinted, blendAmount);
                    } else if (lightShiftMode == 2) {
                        // Overlay: Standard Photoshop overlay blend
                        vec3 overlayed = blendOverlay(color.rgb, lightShiftColor);
                        blendedColor = mix(color.rgb, overlayed, blendAmount);
                    } else if (lightShiftMode == 3) {
                        // Multiply: Darkens and colorizes
                        vec3 multiplied = blendMultiply(color.rgb, lightShiftColor);
                        blendedColor = mix(color.rgb, multiplied, blendAmount);
                    } else if (lightShiftMode == 4) {
                        // Screen: Lightens and colorizes (good for glows)
                        vec3 screened = blendScreen(color.rgb, lightShiftColor);
                        blendedColor = mix(color.rgb, screened, blendAmount);
                    } else {
                        // Add: Additive glow effect
                        vec3 added = blendAdd(color.rgb, lightShiftColor * blendAmount);
                        blendedColor = added;
                    }
                    // Clamp to valid range
                    fragColor = vec4(clamp(blendedColor, 0.0, 1.0), color.a);
                } else {
                    // Below threshold, pass through unchanged
                    fragColor = color;
                }
            }
        `;
