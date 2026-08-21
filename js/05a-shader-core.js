// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// js/05a-shader-core.js â€” part 1/14 of former 05-fluid-sim.js (lines 1â€“653)
// LOAD ORDER: after 04-ui-interactions.js (async loader), before 05b-shader-sim.js
// PROVIDES: compileShader, Program, PRECISION, baseVert/blur/display/sharpen/microDetail/lighting/lightShift frag sources
// REQUIRES: gl (04)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order â€” do not reorder.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
            uniform sampler2D uGlow;      // Glow (HDR bloom): mip-chain halo of the overbright dye
            uniform float glowEnabled;
            uniform sampler2D uScatter;   // Scatter: volumetric light shafts marched from an origin
            uniform float scatterEnabled;
            // D2 raster layer stack: up to 4 visible raster paint layers
            // (premultiplied RGBA8), composited around the fluid. Per-slot
            // params: x=enabled, y=opacity, z=blend mode (0 normal /
            // 1 multiply / 2 screen / 3 add), w=1 below the fluid / 0 above.
            // Slots arrive pre-sorted bottom-to-top, below-fluid slots first
            // (see rasterLayers.collectSlots in 05l).
            uniform sampler2D uRaster0;
            uniform sampler2D uRaster1;
            uniform sampler2D uRaster2;
            uniform sampler2D uRaster3;
            uniform vec4 uRasterP0;
            uniform vec4 uRasterP1;
            uniform vec4 uRasterP2;
            uniform vec4 uRasterP3;
            // D3: active mask shown as a red film while painting into it
            // (UI affordance only â€” never part of the exported content,
            // which is why it composites after everything else)
            uniform sampler2D uMaskOverlay;
            uniform float maskOverlayOn;
            // D3 clip bindings: per-slot mask coverage multiplied into the
            // raster sample (premult scale = clip). x=hasClip, y=invert.
            uniform sampler2D uRasterM0;
            uniform sampler2D uRasterM1;
            uniform sampler2D uRasterM2;
            uniform sampler2D uRasterM3;
            uniform vec4 uRasterC0;
            uniform vec4 uRasterC1;
            uniform vec4 uRasterC2;
            uniform vec4 uRasterC3;
            uniform sampler2D uShadeForm; // quarter-res blurred frame: the shading height field
            uniform vec2 shadeTexelSize;
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
            uniform float shadeRelief;    // SHADE_RELIEF x slider: relief strength (redistributes light across the form)
            uniform float shadeGloss;     // SHADE_GLOSS  x slider: specular gloss strength (the plastic sheen)
            uniform float gateVibrance;   // 1 = Gate on: re-add the saturation the Reinhard tone-map strips from HDR dye
            uniform float gateWhite;      // >0 = Gate on: extended-Reinhard white point (ceiling x GATE_WHITE_MULT); 0 = plain Reinhard
            uniform float igniteVibrance; // 0-1 Ignite envelope: enrich rather than lighten (see below)
            uniform vec2 texelSize;
            // â”€â”€ Light Shift (unified, 2026-07-18) â”€â”€
            // ONE implementation, run here at the END of display â€” on the
            // actually-displayed (post tone-map / vibrance / shading) color â€”
            // so "overblown white" means the white you SEE, identically whether
            // Lighting is on or off. Replaces the two divergent versions that
            // used to run pre-tone-map in the lighting/standalone passes.
            uniform float lightShiftEnabled;   // >0.5 = on
            uniform vec3  lightShiftColor;
            uniform float lightShiftThreshold; // 0-1 on displayed brightness
            uniform float lightShiftIntensity;
            uniform int   lightShiftMode;      // 0=replace,1=tint,2=overlay,3=multiply,4=screen,5=add
            uniform float lightShiftCeiling;   // Gate ceiling (config.BLOOM_CEILING; 0 = Gate off) — density-key reference
            uniform float lightShiftDensity;   // 0-1: how much the pigment-density overblow signal feeds the trigger
            const float PI = 3.141592653589793;
            vec3 lsOverlay(vec3 b, vec3 s) {
                return vec3(
                    b.r < 0.5 ? 2.0*b.r*s.r : 1.0 - 2.0*(1.0-b.r)*(1.0-s.r),
                    b.g < 0.5 ? 2.0*b.g*s.g : 1.0 - 2.0*(1.0-b.g)*(1.0-s.g),
                    b.b < 0.5 ? 2.0*b.b*s.b : 1.0 - 2.0*(1.0-b.b)*(1.0-s.b));
            }
            // Mirror-wrap a mapped kaleido UV into [0,1]: out-of-range
            // samples reflect back into the texture instead of CLAMPing to
            // the (usually empty) edge — without this, wedge-mode corners
            // (r > 0.5 maps past 1.0) streak the background across the
            // pattern at full blend.
            vec2 kMirrorWrap(vec2 uv) {
                return 1.0 - abs(mod(uv, 2.0) - 1.0);
            }
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
            // D2: blend one premultiplied raster sample over the running
            // color. Opacity is pre-applied by the caller (scales rgb AND a,
            // which is exactly what fading a premultiplied source means).
            vec3 rasterBlend(vec3 base, vec4 src, float mode) {
                if (mode < 0.5) return base * (1.0 - src.a) + src.rgb;   // normal (premult over)
                if (mode > 2.5) return base + src.rgb;                    // add
                vec3 s = src.rgb / max(src.a, 1e-4);                      // unpremultiply for mode math
                vec3 b = (mode < 1.5) ? base * s
                                      : 1.0 - (1.0 - base) * (1.0 - s);  // multiply : screen
                return mix(base, b, src.a);
            }
            // D2: fold one slot into the composite. Below-fluid slots
            // accumulate into 'under' (plain premult over among themselves);
            // the first above-fluid slot first merges 'under' beneath the
            // fluid (fluid coverage = tone-mapped intensity â€” under-layers
            // show where the dye is dark), then blends itself on top.
            void rasterSlot(vec4 rs, vec4 p, inout vec3 col, inout vec4 under, inout float merged, inout float skA) {
                if (p.w > 0.5) {
                    under.rgb = under.rgb * (1.0 - rs.a) + rs.rgb;
                    under.a = under.a * (1.0 - rs.a) + rs.a;
                    return;
                }
                if (merged < 0.5) {
                    if (under.a > 0.0) {
                        float fA = min(1.0, max(max(col.r, col.g), col.b));
                        col += under.rgb * (1.0 - fA);
                        skA = max(skA, under.a);
                    }
                    merged = 1.0;
                }
                col = rasterBlend(col, rs, p.z);
                skA = max(skA, rs.a);
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
            // Sobel gradient of the shading height field at an arbitrary UV.
            // Factored out so surface shading can sample the FOLDED UV under
            // kaleido: uShadeForm is built from the pre-fold frame (the fold
            // exists only in this shader), so gradients must be looked up
            // where the fold reads the image or the relief ignores the faces.
            vec2 shadeSobel(vec2 uv, vec2 t2) {
                const vec3 lumaW = vec3(0.299, 0.587, 0.114);
                float lL  = dot(texture(uShadeForm, uv + vec2(-t2.x,  0.0 )).rgb, lumaW);
                float lR  = dot(texture(uShadeForm, uv + vec2( t2.x,  0.0 )).rgb, lumaW);
                float lT  = dot(texture(uShadeForm, uv + vec2( 0.0 ,  t2.y)).rgb, lumaW);
                float lB  = dot(texture(uShadeForm, uv + vec2( 0.0 , -t2.y)).rgb, lumaW);
                float lTL = dot(texture(uShadeForm, uv + vec2(-t2.x,  t2.y)).rgb, lumaW);
                float lTR = dot(texture(uShadeForm, uv + vec2( t2.x,  t2.y)).rgb, lumaW);
                float lBL = dot(texture(uShadeForm, uv + vec2(-t2.x, -t2.y)).rgb, lumaW);
                float lBR = dot(texture(uShadeForm, uv + vec2( t2.x, -t2.y)).rgb, lumaW);
                float gx = ((lTR + 2.0 * lR + lBR) - (lTL + 2.0 * lL + lBL)) * 0.0625;
                float gy = ((lTL + 2.0 * lT + lTR) - (lBL + 2.0 * lB + lBR)) * 0.0625;
                return vec2(gx, gy);
            }
            void main() {
                vec4 base = texture(uTexture, vUv);
                vec4 kcol = base;
                vec2 kUv = vUv; // kaleido-remapped UV, kept for glow so the halo warps with the image
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
                    uv2 = kMirrorWrap(uv2);
                    kcol = texture(uTexture, uv2);
                    kUv = uv2;
                }
                vec4 color = mix(base, kcol, clamp(kBlend, 0.0, 1.0));
                float hdrMax = max(color.r, max(color.g, color.b));
                // Tone map HDR to displayable range (per-channel Reinhard).
                // Gate on: the dye is already clamped to the gate ceiling (splat
                // converges to the picked colour; advectionFrag caps the max
                // channel), so plain Reinhard — built to compress UNBOUNDED HDR —
                // needlessly halves it: a ceiling-1.0 channel maps 1.0 -> 0.5, the
                // "dull gate" look. Use extended Reinhard whose white point is the
                // ceiling, so ceiling-level dye reaches (near-)full display and the
                // picked colour keeps the vividness it had before Gate stopped it
                // accumulating into white. gateWhite = ceiling x GATE_WHITE_MULT
                // (console-tunable); a large mult collapses back to plain Reinhard.
                if (gateWhite > 0.0) {
                    float lw2 = gateWhite * gateWhite;
                    color.rgb = color.rgb * (1.0 + color.rgb / lw2) / (1.0 + color.rgb);
                } else {
                    color.rgb = color.rgb / (1.0 + color.rgb);
                }
                // Light Shift keys off THIS â€” the tone-mapped dye before any
                // re-saturation. Gate/Ignite vibrance (and shading's sat boost)
                // below pull overblown pixels back off white; keying the
                // overblow test on the post-vibrance color let them consume the
                // whiteness signal, so "Replace" quit firing once Ignite/Gate
                // enriched a region. Detect on the raw overblow, recolor the
                // displayed pixel â€” the two effects now stack instead of fight.
                vec3 lsSrc = color.rgb;
                // Gate vibrance: per-channel Reinhard flattens channel ratios as
                // dye climbs into HDR â€” the washed-out look near the bloom
                // ceiling. Re-widen saturation in proportion to how deep into
                // HDR the dye sits (the richness the pre-Gate blowout showed in
                // transit, but bounded â€” dye can't pass the ceiling, so neither
                // can the boost).
                float satW = 0.0;
                if (gateVibrance > 0.0) satW += smoothstep(0.8, 2.5, hdrMax) * 0.35 * gateVibrance;
                // Ignite is VIBRANCE, not brightness. Raising dye magnitude
                // past the cap walks every channel up the Reinhard curve
                // together, which lightens at constant saturation — a pastel,
                // the "pale light green" this replaced. Widening the channel
                // spread instead reads as the original colour turned up, and
                // it costs the cap nothing: this runs after the tone-map, is
                // clamped to displayable range, and touches no stored state,
                // so a locked Ignite holds a steady richer colour instead of
                // ratcheting toward neon.
                satW += clamp(igniteVibrance, 0.0, 1.5);
                if (satW > 0.0) {
                    vec3 lw = vec3(0.299, 0.587, 0.114);
                    float gv = dot(color.rgb, lw);
                    color.rgb = clamp(mix(vec3(gv), color.rgb, 1.0 + satW), 0.0, 1.0);
                }
                // Surface shading -- luminance-preserving relief + specular gloss.
                // Sculpts a smooth-plastic surface out of the dye WITHOUT dimming it
                // (rebalanced 2026-07-21; see the relief/gloss notes below).
                if (displayShading > 0.0) {
                    vec3 lumaW = vec3(0.299, 0.587, 0.114);
                    float centerLuma = dot(color.rgb, lumaW);
                    // Fade the whole effect out at low luminance: in fading dye
                    // the gradients are dominated by fp16 quantization steps and
                    // the sim's cleanup floor, and full-strength normals/contrast
                    // paint hard lines along those steps.
                    float shadeFade = smoothstep(0.005, 0.06, centerLuma);
                    // Gradient from the blurred quarter-res form field (raw
                    // HDR for strong gradients) â€” the paint-engine approach:
                    // relief is lit from a smoothed height map, so pigment
                    // texel noise (fp16 grain, stir micro-laminae) physically
                    // cannot read as texture; only actual swirl forms shade.
                    // Sobel at 1 form texel â‰ˆ 4 dye texels; 0.0625 keeps the
                    // same response as the original 1-texel differences on
                    // smooth ramps.
                    vec2 t2 = shadeTexelSize;
                    // Gradient looked up at the kaleido-folded UV so every face
                    // carries its own mirrored copy of the source relief, mixed
                    // with the unfolded gradient by kBlend — the same dual-UV
                    // treatment the glow gets below. Kaleido off: kw = 0 and
                    // this is bit-identical to the single unfolded Sobel.
                    vec2 g = shadeSobel(vUv, t2);
                    if (doK) {
                        float kw = clamp(kBlend, 0.0, 1.0);
                        if (kw > 0.0) g = mix(g, shadeSobel(kUv, t2), kw);
                    }
                    float dx = g.x;
                    float dy = g.y;
                    float nStr = displayShading * 6.0 * shadeFade * (shadeInvert > 0.5 ? -1.0 : 1.0);
                    vec3 N = normalize(vec3(dx * nStr, dy * nStr, 0.25));
                    // Two fixed studio lights (directions/colours unchanged):
                    // warm key upper-left, cool fill lower-right.
                    vec3 keyDir  = normalize(vec3(-0.5,  0.7, 0.9));
                    vec3 fillDir = normalize(vec3( 0.4, -0.5, 0.7));
                    vec3 warmKey  = vec3(1.0, 0.97, 0.92);
                    vec3 coolFill = vec3(0.9, 0.94, 1.0);
                    // -- Relief (luminance-PRESERVING) --------------------------
                    // The old pass lit the dye with max(N.L,0) diffuse + a Laplacian
                    // AO term; both SUBTRACT light, so flat dye came out ~12% dim and
                    // away-facing slopes crushed to the ambient floor -- the slider
                    // read as a dimmer and the hue went muddy. Drive the surface off
                    // the SIGNED deviation from the flat response (N.L - L.z) instead:
                    // exactly 0 on flat dye, + toward a light, - away, and symmetric,
                    // so color *= (1 + relief) sculpts the form (crests brighten,
                    // troughs darken equally) while leaving flat regions and the
                    // overall level untouched. No global dim; the hue is preserved.
                    float dK = dot(N, keyDir)  - keyDir.z;
                    float dF = dot(N, fillDir) - fillDir.z;
                    vec3 relief = dK * 0.62 * warmKey + dF * 0.24 * coolFill;
                    float reliefAmt = displayShading * shadeRelief * shadeFade;
                    color.rgb *= max(vec3(0.0), 1.0 + relief * reliefAmt);
                    // -- Saturation lift (luminance-neutral) -------------------
                    // Keep the hue rich, faded to neutral in faint dye. The old
                    // global S-curve lived here and was a net midtone darkener --
                    // it is gone; relief + gloss supply the plastic pop now.
                    color.rgb = max(color.rgb, vec3(0.0));
                    float gray = dot(color.rgb, lumaW);
                    color.rgb = mix(vec3(gray), color.rgb, 1.0 + (0.15 + displayShading * 0.30) * shadeFade);
                    // -- Specular gloss (the one term that ADDS light) ---------
                    // A tight Blinn-Phong highlight off the key light, laid on top
                    // last -- the plastic sheen. Gated to real dye by shadeFade so
                    // the black ground never sparkles; not scaled by centerLuma, so
                    // mid-tones read glossy too.
                    vec3 H = normalize(keyDir + vec3(0.0, 0.0, 1.0));
                    float spec = pow(max(dot(N, H), 0.0), 48.0);
                    color.rgb += spec * warmKey * (displayShading * shadeGloss) * shadeFade;
                    color.rgb = max(color.rgb, vec3(0.0));
                }
                // â”€â”€ Light Shift â”€â”€ recolor overblown/white areas of the fluid.
                // Keyed on the DISPLAYED color: brightness weighted by whiteness
                // (desaturated bright = the real target), so pure white always
                // maxes the factor and a saturated hue does not read as "white".
                if (lightShiftEnabled > 0.5) {
                    float lsMaxC = max(lsSrc.r, max(lsSrc.g, lsSrc.b));
                    float lsMinC = min(lsSrc.r, min(lsSrc.g, lsSrc.b));
                    float lsSat = lsMaxC > 0.001 ? (lsMaxC - lsMinC) / lsMaxC : 0.0;
                    float lsLum = dot(lsSrc, vec3(0.299, 0.587, 0.114));
                    // (1) Visible-white key: desaturated-bright on the pre-vibrance dye.
                    float lsWhite = max(lsLum, lsMaxC) * (1.0 - 0.6 * lsSat);
                    // (2) Density key: pigment memory (color.a) and the raw pre-tone-map
                    // magnitude (hdrMax) both survive the Gate's rgb clamp AND the
                    // Gate/Ignite vibrance boost, so they read the overblow the display
                    // no longer shows. Reinhard recovers the brightness this pile WOULD
                    // reach uncapped — same 0-1 space as the white key, so the threshold
                    // keeps meaning what it did (Gate OFF: a would-be-white pile reads
                    // its true brightness, e.g. an Ignite settling at ~3.8 -> 0.79). With
                    // the Gate ON both signals sit pinned at the ceiling, so the
                    // ceiling-relative ramp is what lets those gated peaks reach the
                    // threshold at all.
                    float lsDens = max(hdrMax, color.a);
                    float lsDensWhite = lsDens / (1.0 + lsDens);
                    float lsCeil = (lightShiftCeiling > 0.0)
                        ? smoothstep(0.6, 1.0, hdrMax / lightShiftCeiling) : 0.0;
                    // Memory outlives the visible dye (its own slow clock), so gate the
                    // density key on live dye actually being here — never recolour a bare
                    // canvas that merely remembers a stroke.
                    float lsPresent = smoothstep(0.02, 0.08, lsMaxC);
                    float lsDensKey = max(lsDensWhite, lsCeil) * lsPresent * lightShiftDensity;
                    // Hybrid: fire on visible white OR reconstructed density overblow.
                    float lsOver = max(lsWhite, lsDensKey);
                    if (lsOver > lightShiftThreshold) {
                        float lt = clamp((lsOver - lightShiftThreshold) / (1.0 - lightShiftThreshold + 0.001), 0.0, 1.0);
                        lt = lt * lt * (3.0 - 2.0 * lt);
                        float amt = lt * lightShiftIntensity;
                        vec3 c = color.rgb, b = lightShiftColor, res;
                        if (lightShiftMode == 0) {        // Replace
                            res = mix(c, b * (0.6 + lsLum * 0.4), amt);
                        } else if (lightShiftMode == 1) { // Tint (preserve luminance)
                            res = mix(c, b * lsLum, amt);
                        } else if (lightShiftMode == 2) { // Overlay
                            res = mix(c, lsOverlay(c, b), amt);
                        } else if (lightShiftMode == 3) { // Multiply
                            res = mix(c, c * b, amt);
                        } else if (lightShiftMode == 4) { // Screen
                            res = mix(c, 1.0 - (1.0 - c) * (1.0 - b), amt);
                        } else {                          // Add
                            res = c + b * amt;
                        }
                        color.rgb = clamp(res, 0.0, 1.0);
                    }
                }
                // Glow (HDR bloom): add the mip-chain halo of the overbright dye
                // ON TOP of the tone-mapped image — additive light, so hot cores
                // bleed outward instead of just sitting bright. Sampled at both
                // raw and kaleido UVs so the halo follows the warped image;
                // gamma-lifted (1/2.2) so the faint outer halo stays visible —
                // the classic wide-soft falloff. Still before raster compositing
                // (sketch layers never glow).
                //
                // Runs AFTER Light Shift, and that ordering is the whole point.
                // Glow used to be summed in first, which meant Light Shift mixed
                // from a base already near 2.0 and the clamp put it straight back
                // to white — the recolor was erased arithmetically, whatever the
                // Intensity said. Recoloring first and blooming second lets the
                // shift survive; the halo is itself tinted through the shift, so
                // it adds light in the shift's colour instead of repainting the
                // dye's original white over the region LS just recolored. Both
                // effects target the same pixels — overbright dye — so this is
                // the only order in which they can both mean something.
                if (glowEnabled > 0.5) {
                    vec3 glowC = mix(texture(uGlow, vUv).rgb, texture(uGlow, kUv).rgb,
                                     doK ? clamp(kBlend, 0.0, 1.0) : 0.0);
                    glowC = pow(max(glowC, vec3(0.0)), vec3(1.0 / 2.2));
                    if (lightShiftEnabled > 0.5) {
                        // FULLY the shift colour, not scaled by Intensity. The
                        // halo routinely carries luminance well above 1.0, so
                        // leaving even half of it untinted put enough white into
                        // every channel to saturate the recolor back out — the
                        // core measured [231,201,201] with glow off and a flat
                        // [255,255,255] with it on. Intensity governs how far the
                        // CORE shifts; the halo is bloom OF that already-shifted
                        // light, so it takes the colour outright.
                        float glum = dot(glowC, vec3(0.299, 0.587, 0.114));
                        glowC = lightShiftColor * glum;
                    }
                    vec3 gsum = color.rgb + glowC;
                    // Scatter (light shafts) folds into the SAME sum, and it
                    // lives inside the glow branch on purpose: it marches
                    // glow's own prefilter buffer, so glow off means there is
                    // no emitter to march. Summing here (rather than after)
                    // is what puts it under the Gate shoulder below — two
                    // additive light terms, one hue-preserving soft-limit.
                    if (scatterEnabled > 0.5) {
                        vec3 sc = mix(texture(uScatter, vUv).rgb, texture(uScatter, kUv).rgb,
                                      doK ? clamp(kBlend, 0.0, 1.0) : 0.0);
                        sc = pow(max(sc, vec3(0.0)), vec3(1.0 / 2.2));
                        if (lightShiftEnabled > 0.5) {
                            // Same rule as the halo above: shafts are light OF
                            // the already-shifted image, so they take the shift
                            // colour outright rather than pushing white back in.
                            sc = lightShiftColor * dot(sc, vec3(0.299, 0.587, 0.114));
                        }
                        gsum += sc;
                    }
                    if (gateWhite > 0.0) {
                        // Gate on: the ceiling's whole promise is "never blow
                        // out to white", so the halo must not undo it. Soft-
                        // limit the SUM hue-preservingly: compress the max
                        // channel into a shoulder→1.0 asymptote with channel
                        // RATIOS (the picked colour's chroma) intact — hot
                        // cores read lit-from-within at full vividness, never
                        // clipped white. Gate off keeps the raw additive
                        // white-out: that IS the classic luminous look.
                        float gm = max(gsum.r, max(gsum.g, gsum.b));
                        float gsh = 0.85;
                        if (gm > gsh) {
                            float gt = (gm - gsh) / (1.0 - gsh);
                            gsum *= (gsh + (1.0 - gsh) * gt / (1.0 + gt)) / gm;
                        }
                    }
                    color.rgb = gsum;
                }
                // D2 raster layer stack: paint layers composited around the
                // fluid, AFTER tone-map/shading/glow (fluid effects never
                // touch them) and sampled at RAW vUv (kaleido never warps
                // them â€” a sketch stays where you drew it). Unrolled Ã—4:
                // GLSL ES 3.0 forbids dynamically-indexed sampler arrays.
                float skA = 0.0;
                vec4 under = vec4(0.0);
                float underMerged = 0.0;
                vec3 cc = color.rgb;
                if (uRasterP0.x > 0.5) {
                    vec4 rs0 = texture(uRaster0, vUv) * uRasterP0.y;
                    if (uRasterC0.x > 0.5) { float m0 = texture(uRasterM0, vUv).a; rs0 *= (uRasterC0.y > 0.5) ? 1.0 - m0 : m0; }
                    rasterSlot(rs0, uRasterP0, cc, under, underMerged, skA);
                }
                if (uRasterP1.x > 0.5) {
                    vec4 rs1 = texture(uRaster1, vUv) * uRasterP1.y;
                    if (uRasterC1.x > 0.5) { float m1 = texture(uRasterM1, vUv).a; rs1 *= (uRasterC1.y > 0.5) ? 1.0 - m1 : m1; }
                    rasterSlot(rs1, uRasterP1, cc, under, underMerged, skA);
                }
                if (uRasterP2.x > 0.5) {
                    vec4 rs2 = texture(uRaster2, vUv) * uRasterP2.y;
                    if (uRasterC2.x > 0.5) { float m2 = texture(uRasterM2, vUv).a; rs2 *= (uRasterC2.y > 0.5) ? 1.0 - m2 : m2; }
                    rasterSlot(rs2, uRasterP2, cc, under, underMerged, skA);
                }
                if (uRasterP3.x > 0.5) {
                    vec4 rs3 = texture(uRaster3, vUv) * uRasterP3.y;
                    if (uRasterC3.x > 0.5) { float m3 = texture(uRasterM3, vUv).a; rs3 *= (uRasterC3.y > 0.5) ? 1.0 - m3 : m3; }
                    rasterSlot(rs3, uRasterP3, cc, under, underMerged, skA);
                }
                // every slot was below the fluid â€” merge the accumulated
                // under-stack beneath the dye now
                if (under.a > 0.0 && underMerged < 0.5) {
                    float fA = min(1.0, max(max(cc.r, cc.g), cc.b));
                    cc += under.rgb * (1.0 - fA);
                    skA = max(skA, under.a);
                }
                color.rgb = cc;
                // D3 mask overlay film (raw vUv, over everything)
                if (maskOverlayOn > 0.5) {
                    float mcov = texture(uMaskOverlay, vUv).a;
                    color.rgb = mix(color.rgb, vec3(1.0, 0.25, 0.2), mcov * 0.45);
                }
                // Â±0.5 LSB hash dither before the 8-bit store: smooth slow
                // gradients otherwise quantize into visible contour bands that
                // crawl as the field decays (the S-curve and saturation boost
                // in the shading pass steepen them further). Static pattern â€”
                // temporal dither would shimmer.
                float dn = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
                color.rgb = max(color.rgb + dn * (1.0 / 255.0), 0.0);
                float intensity = max(max(color.r, color.g), color.b);
                if (preserveOpacity > 0.5) {
                    // Preserve fluid opacity - make alpha proportional to color intensity
                    // backgroundTransparency controls how transparent the black areas become
                    // (sketch coverage counts as content â€” dark sketch strokes
                    // must not go transparent in layer mode)
                    float alpha = mix(1.0, max(intensity, skA), backgroundTransparency);
                    fragColor = vec4(color.rgb, alpha);
                } else {
                    // Opaque, explicitly. Passing the sampled color straight
                    // through leaked the dye texture's alpha to the canvas —
                    // harmless while that was a decayed 1.0, but it is pigment
                    // memory now and would punch semi-transparent holes into
                    // stills, video export and transparent mode.
                    fragColor = vec4(color.rgb, 1.0);
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
                                       // LOOK stops changing when governor/
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
        // â”€â”€â”€ Micro Detail Pass â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Clarity + Vibrance only. Keeps fluid texture sharp through
        // TikTok / H.264 encoding without color artifacts.
        const microDetailFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTexture;
            uniform sampler2D uVelocity;
            uniform vec2 texelSize;
            uniform float clarity;    // 0â€“1: local contrast boost
            uniform float vibrance;   // 0â€“1: selective saturation
            uniform float kernelScale; // 2048-reference normalization (same
                                       // principle as sharpen): resolution
                                       // changes must not change the look
            void main() {
                vec3 center = texture(uTexture, vUv).rgb;
                vec3 lumaW = vec3(0.299, 0.587, 0.114);
                float centerLuma = dot(center, lumaW);
                // Early exit only for truly black pixels; the effect fades in
                // smoothly above that (same fix as the sharpen pass â€” a hard
                // cutoff draws a jagged seam through fading dye).
                if (centerLuma < 0.001) {
                    fragColor = vec4(center, 1.0);
                    return;
                }
                float lowFade = smoothstep(0.003, 0.03, centerLuma);
                vec3 result = center;
                // â”€â”€ Clarity â€” Wide-kernel unsharp mask â”€â”€
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
                    // never more than ~doubled â€” unbounded, fp16 quantization
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
                // â”€â”€ Vibrance â€” RGB-space selective saturation â”€â”€
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
            // Light Shift moved to the unified pass in displayFrag (2026-07-18)
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
                // Skip lighting where there is nothing lit. This used to test
                // color.a, which tracked the dye's decay closely enough to
                // stand in for "empty" — but alpha is pigment memory now and
                // outlives the visible dye by design, so the test would stop
                // firing on faded areas and light near-black texels. The
                // brightness it actually meant to check is in rgb.
                if (max(color.r, max(color.g, color.b)) < 0.01) {
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
                // Lambertian diffuse (N Â· L) - this is the key lighting term
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
                // (Light Shift now runs once in displayFrag, on the displayed color)
                fragColor = vec4(litColor, color.a);
            }
        `;
