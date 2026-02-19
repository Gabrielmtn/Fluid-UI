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
        
        const PRECISION = (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? "mediump" : "highp");

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

        const displayFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTexture;
            uniform float preserveOpacity;
            uniform float backgroundTransparency;
            uniform float kaleidoEnabled;
            uniform float segments;
            uniform int kMode; // 0=Off,1=Wedge,2=MirrorH,3=MirrorV,4=MirrorQuad,5=Spiral
            uniform float kAngle; // radians
            uniform float kTwist; // radians per unit radius
            uniform float kZoom;  // scale
            uniform float kBlend; // 0..1
            
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
            
            // Tone mapping to prevent white blowout when colors accumulate
            vec3 toneMap(vec3 color) {
                // Reinhard tone mapping with slight desaturation for very bright areas
                float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
                
                // Apply Reinhard on luminance
                float mappedLuminance = luminance / (1.0 + luminance);
                
                // Preserve some color saturation even in bright areas
                vec3 mappedColor = color / (1.0 + color);
                
                // Blend between per-channel and luminance-based mapping
                // This prevents complete desaturation while avoiding clipping
                return mix(mappedColor, color * (mappedLuminance / max(luminance, 0.001)), 0.5);
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
                
                // Apply tone mapping to prevent white blowout
                color.rgb = toneMap(color.rgb);
                
                float intensity = max(max(color.r, color.g), color.b);
                
                if (preserveOpacity > 0.5) {
                    // Preserve fluid opacity - make alpha proportional to color intensity
                    // backgroundTransparency controls how transparent the black areas become
                    float alpha = mix(1.0, intensity, backgroundTransparency);
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
            
            void main() {
                vec3 center = texture(uTexture, vUv).rgb;
                
                // Early exit if pixel is nearly black (no sharpening needed)
                float centerIntensity = dot(center, vec3(0.299, 0.587, 0.114));
                if (centerIntensity < 0.01) {
                    fragColor = vec4(center, 1.0);
                    return;
                }
                
                // Sample neighbors for detail extraction (unsharp mask technique)
                vec3 blur = vec3(0.0);
                blur += texture(uTexture, vUv + vec2(texelSize.x, 0.0)).rgb;
                blur += texture(uTexture, vUv - vec2(texelSize.x, 0.0)).rgb;
                blur += texture(uTexture, vUv + vec2(0.0, texelSize.y)).rgb;
                blur += texture(uTexture, vUv - vec2(0.0, texelSize.y)).rgb;
                blur *= 0.25;
                
                // Extract high-frequency detail
                vec3 detail = center - blur;
                
                // Velocity-adaptive sharpening (sharpen more where fluid moves)
                vec2 vel = texture(uVelocity, vUv).xy;
                float velocityMag = length(vel);
                float adaptiveStrength = sharpness * (0.8 + min(velocityMag * 3.0, 1.2));
                
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
            
            void main() {
                vec3 center = texture(uTexture, vUv).rgb;
                vec3 lumaW = vec3(0.299, 0.587, 0.114);
                float centerLuma = dot(center, lumaW);
                
                if (centerLuma < 0.005) {
                    fragColor = vec4(center, 1.0);
                    return;
                }
                
                vec3 result = center;
                
                // ── Clarity — Wide-kernel unsharp mask ──
                // Same proven additive approach as the sharpening pass
                // but with a wider 2-ring kernel for mid-frequency contrast.
                if (clarity > 0.0) {
                    vec2 t = texelSize;
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
                    
                    // Velocity-adaptive strength
                    float velMag = length(texture(uVelocity, vUv).xy);
                    float adaptiveStrength = clarity * (1.0 + min(velMag * 3.0, 1.5));
                    
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
                    float boost = vibrance * (1.0 - sat * sat) * 1.2;
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

        // Standalone Light Shift shader (works without lighting)
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

        const splatFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTarget;
            uniform vec2 point;
            uniform vec3 color;
            uniform float radius, aspectRatio, velocityInfluence;
            uniform int isVelocity; // 1 for velocity, 0 for density
            void main() {
                vec2 p = vUv - point;
                p.x *= aspectRatio;
                
                vec3 base = texture(uTarget, vUv).xyz;
                
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
                    
                    fragColor = vec4(base + splat * impactReduction, 1.0);
                } else {
                    // For density: always use full radius and full impact (visual quality)
                    vec3 splat = exp(-dot(p, p) / radius) * color;
                    fragColor = vec4(base + splat, 1.0);
                }
            }
        `;

        const advectionFrag = `#version 300 es
            precision ${PRECISION} float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uVelocity, uSource;
            uniform vec2 texelSize;
            uniform float dt, dissipation;
            uniform int isDensity;
            
            void main() {
                vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
                vec4 color = dissipation * texture(uSource, coord);
                
                if (isDensity == 1) {
                    // Density pass: fade based on stillness
                    // Sample velocity at this point to determine how still the fluid is
                    vec2 vel = texture(uVelocity, vUv).xy;
                    float speed = length(vel);
                    
                    // When fluid is still (low speed), fade alpha more aggressively
                    float stillness = 1.0 - min(speed * 100.0, 1.0);
                    float stillnessFade = stillness * 0.01 * dt * 60.0;
                    
                    // Apply stillness-based fade to alpha
                    color.a = max(color.a - stillnessFade, 0.0);
                    
                    // Snap very small values to zero
                    if (color.a < 0.003) {
                        color = vec4(0.0);
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
                fragColor = vec4(texture(uVelocity, vR).y - texture(uVelocity, vL).y - 
                                 texture(uVelocity, vT).x + texture(uVelocity, vB).x, 0.0, 0.0, 1.0);
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
                float L = texture(uCurl, vL).x;
                float R = texture(uCurl, vR).x;
                float T = texture(uCurl, vT).x;
                float B = texture(uCurl, vB).x;
                float C = texture(uCurl, vUv).x;
                // Full 2D gradient of |curl| (eta vector)
                vec2 eta = vec2(abs(R) - abs(L), abs(T) - abs(B));
                // Normalize with safety epsilon
                eta = eta / (length(eta) + 0.00001);
                // Vorticity confinement: force = curl_strength * (eta × omega)
                // In 2D, cross(eta, omega_z) = vec2(eta.y, -eta.x) * omega_z
                vec2 force = curl * vec2(eta.y, -eta.x) * C;
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
            void main() {
                vec2 L = clamp(vL, 0.0, 1.0), R = clamp(vR, 0.0, 1.0);
                vec2 T = clamp(vT, 0.0, 1.0), B = clamp(vB, 0.0, 1.0);
                vec2 vel = texture(uVelocity, vUv).xy - vec2(texture(uPressure, R).x - texture(uPressure, L).x,
                                                              texture(uPressure, T).x - texture(uPressure, B).x);
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
            void main() {
                vec2 vel = texture(uVelocity, vUv).xy;
                float obs = texture(uObstacle, vUv).r;
                // Damp velocity inside obstacle regions: 0 = free, 1 = fully blocked
                vel *= (1.0 - obs);
                fragColor = vec4(vel, 0.0, 1.0);
            }
        `;
        
        const displayProg = new Program(baseVert, displayFrag);
        const sharpenProg = new Program(baseVert, sharpenFrag);
        const microDetailProg = new Program(baseVert, microDetailFrag);
        const lightingProg = new Program(baseVert, lightingFrag);
        const lightShiftProg = new Program(baseVert, lightShiftFrag);
        const splatProg = new Program(baseVert, splatFrag);
        const advectionProg = new Program(baseVert, advectionFrag);
        const divergenceProg = new Program(baseVert, divergenceFrag);
        const curlProg = new Program(baseVert, curlFrag);
        const turbulenceProg = new Program(baseVert, turbulenceFrag);
        const vorticityProg = new Program(baseVert, vorticityFrag);
        const pressureProg = new Program(baseVert, pressureFrag);
        const gradientProg = new Program(baseVert, gradientFrag);
        const clearProg = new Program(baseVert, clearFrag);
        const obstacleDampProg = new Program(baseVert, obstacleDampFrag);
        
        let dyeTexWidth, dyeTexHeight, simTexWidth, simTexHeight;
        
        // Expose for stats panel
        function exposeSimStats() {
            window.simTexWidth = simTexWidth;
            window.simTexHeight = simTexHeight;
            window.dyeTexWidth = dyeTexWidth;
            window.dyeTexHeight = dyeTexHeight;
            window.density = density;
            window.velocity = velocity;
            window.pressure = pressure;
            window.divergence = divergence;
            window.curl = curl;
        }
        
        function createFBO(w, h, internalFormat, format, type, filter) {
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
            
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            gl.viewport(0, 0, w, h);
            gl.clear(gl.COLOR_BUFFER_BIT);
            
            return { texture, fbo, width: w, height: h };
        }
        
        function createDoubleFBO(w, h, internalFormat, format, type, filter) {
            let fbo1 = createFBO(w, h, internalFormat, format, type, filter);
            let fbo2 = createFBO(w, h, internalFormat, format, type, filter);
            return {
                get read() { return fbo1; },
                get write() { return fbo2; },
                swap() { [fbo1, fbo2] = [fbo2, fbo1]; }
            };
        }
        
        let density, velocity, divergence, curl, pressure, sharpened, detailed, lit, lightShifted, obstacle;
        
        function initFramebuffers() {
            const displayW = gl.drawingBufferWidth;
            const displayH = gl.drawingBufferHeight;
            const aspect = displayW / Math.max(1, displayH);
            const dyeBase = config.DYE_RESOLUTION || 1024;
            const simBase = config.SIM_RESOLUTION || 128;
            
            // Check WebGL texture size limits
            const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
            
            // Compute absolute internal sizes: long side = base, short side scaled by aspect
            if (displayW >= displayH) {
                dyeTexWidth = Math.min(dyeBase, maxTextureSize); 
                dyeTexHeight = Math.max(1, Math.min(Math.round(dyeBase / aspect), maxTextureSize));
                simTexWidth = Math.min(simBase, maxTextureSize); 
                simTexHeight = Math.max(1, Math.min(Math.round(simBase / aspect), maxTextureSize));
            } else {
                dyeTexHeight = Math.min(dyeBase, maxTextureSize); 
                dyeTexWidth = Math.max(1, Math.min(Math.round(dyeBase * aspect), maxTextureSize));
                simTexHeight = Math.min(simBase, maxTextureSize); 
                simTexWidth = Math.max(1, Math.min(Math.round(simBase * aspect), maxTextureSize));
            }
            
            const texType = gl.HALF_FLOAT;
            const rgba = { internalFormat: gl.RGBA16F, format: gl.RGBA };
            const rg = { internalFormat: gl.RG16F, format: gl.RG };
            const r = { internalFormat: gl.R16F, format: gl.RED };
            const _linearOk = (typeof window !== 'undefined' && window.linearExt) || gl.getExtension('OES_texture_float_linear');
            const filter = _linearOk ? gl.LINEAR : gl.NEAREST;
            
            // Visual dye buffers at dye resolution
            density = createDoubleFBO(dyeTexWidth, dyeTexHeight, rgba.internalFormat, rgba.format, texType, filter);
            // Sharpness buffer at dye resolution
            sharpened = createFBO(dyeTexWidth, dyeTexHeight, rgba.internalFormat, rgba.format, texType, filter);
            // Micro detail buffer at dye resolution
            detailed = createFBO(dyeTexWidth, dyeTexHeight, rgba.internalFormat, rgba.format, texType, filter);
            // Lighting buffer at dye resolution
            lit = createFBO(dyeTexWidth, dyeTexHeight, rgba.internalFormat, rgba.format, texType, filter);
            // Light shift buffer at dye resolution
            lightShifted = createFBO(dyeTexWidth, dyeTexHeight, rgba.internalFormat, rgba.format, texType, filter);
            // Physics buffers at simulation resolution
            velocity = createDoubleFBO(simTexWidth, simTexHeight, rg.internalFormat, rg.format, texType, filter);
            divergence = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
            curl = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
            pressure = createDoubleFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
            // Obstacle texture for collision layers (single-channel, sim resolution)
            obstacle = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.LINEAR);
        }
        
        initFramebuffers();
        exposeSimStats(); // Expose to window for stats panel
        
        // Obstacle texture upload for collision layers
        // Cached buffers to avoid per-frame allocations (GPU crash prevention)
        var _obsTempCanvas = null, _obsTempCtx = null;
        var _obsFloatBuf = null;     // cached Float32Array
        var _obsZeroBuf = null;      // cached zeros for clear
        var _obsLastW = 0, _obsLastH = 0;
        
        function _obsEnsureBuffers(w, h) {
            if (_obsLastW === w && _obsLastH === h && _obsTempCanvas) return;
            _obsTempCanvas = document.createElement('canvas');
            _obsTempCanvas.width = w;
            _obsTempCanvas.height = h;
            _obsTempCtx = _obsTempCanvas.getContext('2d', { willReadFrequently: true });
            _obsFloatBuf = new Float32Array(w * h);
            _obsZeroBuf = new Float32Array(w * h); // stays zeroed
            _obsLastW = w;
            _obsLastH = h;
        }
        
        window.updateObstacleTexture = function (sourceCanvas) {
            if (!obstacle || gl.isContextLost()) return;
            try {
                var w = obstacle.width;
                var h = obstacle.height;
                _obsEnsureBuffers(w, h);
                _obsTempCtx.clearRect(0, 0, w, h);
                _obsTempCtx.drawImage(sourceCanvas, 0, 0, w, h);
                var imgData = _obsTempCtx.getImageData(0, 0, w, h);
                var d = imgData.data;
                var f = _obsFloatBuf;
                for (var i = 0, n = w * h; i < n; i++) {
                    f[i] = d[i * 4 + 3] * (1 / 255);
                }
                gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RED, gl.FLOAT, f);
            } catch (e) {
                console.warn('⚠️ Obstacle texture upload failed:', e.message);
            }
        };
        
        window.clearObstacleTexture = function () {
            if (!obstacle || gl.isContextLost()) return;
            try {
                var w = obstacle.width;
                var h = obstacle.height;
                _obsEnsureBuffers(w, h);
                gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RED, gl.FLOAT, _obsZeroBuf);
            } catch (e) {
                console.warn('⚠️ Obstacle texture clear failed:', e.message);
            }
        };
        
        // Also expose on resize
        window.needsFramebufferReinit = false;
        
        // Pointer handling
        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
        
        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
        
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);
        
        function blit(dest) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, dest);
            gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        }
        
        let pointer = { x: 0, y: 0, dx: 0, dy: 0, down: false, moved: false, color: [1, 0, 0] };
        window.pointer = pointer; // Expose for stats panel
        // Stroke tracking for right-click replay
        let strokeEvents = [];
        let strokeStartTime = 0;
        let replayStartTime = 0;
        let replayIndex = 0;
        // History of completed strokes for time-based replay
        let strokeHistory = [];
        let lastSplatTime = 0; // for brush refresh rate throttle
        
        // ─── Splat Envelope ───────────────────────────────────────────
        // Controls how splats ramp in (on press) and fade out (on release).
        // Modes: 'instant' (default), 'linear', 'easing'
        let splatDownTime = 0;
        let splatUpTime = 0;
        let splatOutActive = false;
        let splatOutX = 0, splatOutY = 0, splatOutDx = 0, splatOutDy = 0;
        let splatOutColor = [1, 0, 0];
        const SPLAT_IN_DURATION = 250;  // ms
        const SPLAT_OUT_DURATION = 350; // ms
        
        window.splatInMode = window.splatInMode || 'instant';
        window.splatOutMode = window.splatOutMode || 'instant';
        
        function smoothstep(t) {
            return t * t * (3.0 - 2.0 * t);
        }
        
        function getSplatInMult() {
            if (window.splatInMode === 'instant') return 1.0;
            const elapsed = Date.now() - splatDownTime;
            const t = Math.min(elapsed / SPLAT_IN_DURATION, 1.0);
            if (window.splatInMode === 'linear') return t;
            return smoothstep(t); // easing
        }
        
        function getSplatOutMult() {
            if (window.splatOutMode === 'instant') return 0.0;
            const elapsed = Date.now() - splatUpTime;
            const t = Math.min(elapsed / SPLAT_OUT_DURATION, 1.0);
            if (t >= 1.0) return 0.0;
            const remaining = 1.0 - t;
            if (window.splatOutMode === 'linear') return remaining;
            return smoothstep(remaining); // easing
        }
        
        function splatWithRadius(x, y, dx, dy, color, radius) {
            const saved = config.SPLAT_RADIUS;
            config.SPLAT_RADIUS = radius;
            splat(x, y, dx, dy, color);
            config.SPLAT_RADIUS = saved;
        }

        let strokeArchived = false;

        function archiveCurrentStroke() {
            if (strokeArchived || strokeEvents.length === 0) return;
            strokeHistory.push({ events: strokeEvents.slice(), startTime: strokeStartTime, endTime: Date.now() });
            strokeArchived = true;
            // Cap history at 200 strokes to limit memory (oldest first)
            while (strokeHistory.length > 200) {
                strokeHistory.shift();
            }
        }

        function startStroke(x, y) {
            archiveCurrentStroke();
            strokeEvents = [];
            strokeStartTime = Date.now();
            strokeArchived = false;
        }

        function pushStrokeEvent(x, y, dx, dy, color) {
            if (isReplayActive) return; // Don't record during replay
            const t = Date.now() - strokeStartTime;
            strokeEvents.push({ t, x, y, dx, dy, color: color.slice(), mult: (typeof animationMultiplier === 'number' ? animationMultiplier : 1), radius: config.SPLAT_RADIUS });
        }


        function deepCopyEvent(ev) {
            return { t: ev.t, x: ev.x, y: ev.y, dx: ev.dx, dy: ev.dy, color: ev.color.slice(), mult: ev.mult, radius: ev.radius };
        }

        function buildTimeReplayEvents() {
            var period = (window.replayTimePeriod || 5) * 1000;

            // Collect all strokes: history + current (if not yet archived)
            var allStrokes = [];
            for (var i = 0; i < strokeHistory.length; i++) {
                allStrokes.push(strokeHistory[i].events);
            }
            if (!strokeArchived && strokeEvents.length > 0) {
                allStrokes.push(strokeEvents);
            }
            if (allStrokes.length === 0) return [];

            // Each stroke's duration is its last event's t value (ms since stroke start).
            // Work backwards from the newest stroke, accumulating painting time
            // until we fill the budget. Gaps between strokes are irrelevant.
            var budget = period;
            var startIdx = allStrokes.length; // will walk backwards
            var startEventOffset = 0;        // partial-stroke trim point
            for (var s = allStrokes.length - 1; s >= 0 && budget > 0; s--) {
                var evs = allStrokes[s];
                if (evs.length === 0) continue;
                var dur = evs[evs.length - 1].t; // stroke painting duration
                if (dur <= budget) {
                    // Whole stroke fits
                    budget -= dur;
                    startIdx = s;
                    startEventOffset = 0;
                } else {
                    // Partial fit — trim the beginning of this stroke
                    var trimPoint = evs[evs.length - 1].t - budget;
                    startIdx = s;
                    startEventOffset = trimPoint;
                    budget = 0;
                }
            }

            // Stitch selected strokes back-to-back, collapsing all gaps
            var allEvents = [];
            var cursor = 0; // running playback time
            for (var si = startIdx; si < allStrokes.length; si++) {
                var evs2 = allStrokes[si];
                for (var j = 0; j < evs2.length; j++) {
                    var ev = evs2[j];
                    // Skip events before the trim point in the first partial stroke
                    if (si === startIdx && ev.t < startEventOffset) continue;
                    var localT = ev.t - (si === startIdx ? startEventOffset : 0);
                    allEvents.push({
                        t: cursor + localT,
                        x: ev.x, y: ev.y, dx: ev.dx, dy: ev.dy,
                        color: ev.color.slice(), mult: ev.mult, radius: ev.radius
                    });
                }
                // Advance cursor by this stroke's contributed duration
                if (evs2.length > 0) {
                    var strokeDur = evs2[evs2.length - 1].t - (si === startIdx ? startEventOffset : 0);
                    cursor += strokeDur;
                }
            }
            return allEvents;
        }

        function replayStroke(broadcast = true) {
            var eventsToReplay;
            if (!broadcast && window._activeReplayEvents && window._activeReplayEvents.length) {
                // Looping — reuse the snapshot from the initial trigger
                eventsToReplay = window._activeReplayEvents;
            } else if (window.replayMode === 'time') {
                eventsToReplay = buildTimeReplayEvents();
            } else {
                // Deep-copy so replay is fully isolated from source data
                eventsToReplay = strokeEvents.map(deepCopyEvent);
            }
            if (!eventsToReplay || !eventsToReplay.length) {
                // Fallback: try the most recent stroke from history
                if (strokeHistory.length > 0) {
                    eventsToReplay = strokeHistory[strokeHistory.length - 1].events.map(deepCopyEvent);
                }
            }
            if (!eventsToReplay || !eventsToReplay.length) { isReplayActive = false; return; }
            // Store the active replay events for processReplay
            window._activeReplayEvents = eventsToReplay;
            replayIndex = 0;
            replayStartTime = Date.now();
            isReplayActive = true;
            // Broadcast full stroke to multiplayer
            if (broadcast && typeof broadcastReplayStroke === 'function') {
                const norm = eventsToReplay.map(ev => ({
                    t: ev.t,
                    x: ev.x / canvas.width,
                    y: ev.y / canvas.height,
                    dx: ev.dx / canvas.width,
                    dy: ev.dy / canvas.height,
                    color: ev.color,
                    mult: ev.mult,
                    radius: ev.radius
                }));
                try { broadcastReplayStroke(norm); } catch(_){}
            }
        }
        
        // FPS Cap dropdown (supports numeric values + 'native' for display-matched)
        function applyFpsCap(val) {
            if (val === 'native') {
                // 0 = uncapped; the render loop will run at display Hz naturally
                window.fpsCap = 0;
                window.__fpsCapMode = 'native';
            } else {
                const num = parseInt(val, 10);
                window.fpsCap = Number.isFinite(num) ? num : 60;
                window.__fpsCapMode = 'fixed';
            }
        }
        
        function initFpsCapControl() {
            const fpsCapSel = document.getElementById('fpsCap');
            if (!fpsCapSel) { setTimeout(initFpsCapControl, 100); return; }
            
            let savedVal = '60';
            try {
                if (window.Settings && typeof window.Settings.loadSelect === 'function') {
                    savedVal = window.Settings.loadSelect('fpsCap', '60');
                }
            } catch (_) {}
            
            fpsCapSel.value = savedVal;
            // If the saved value doesn't match any option, fall back to '60'
            if (fpsCapSel.value !== savedVal) {
                fpsCapSel.value = '60';
                savedVal = '60';
            }
            applyFpsCap(savedVal);
            
            fpsCapSel.addEventListener('change', (e) => {
                const val = e.target.value;
                applyFpsCap(val);
                try {
                    if (window.Settings && typeof window.Settings.saveSelect === 'function') {
                        window.Settings.saveSelect('fpsCap', val);
                    }
                } catch (_) {}
            });
            
            // Update "Native" label once display Hz is detected
            const nativeOpt = fpsCapSel.querySelector('option[value="native"]');
            if (nativeOpt) {
                const updateNativeLabel = setInterval(() => {
                    if (window.__displayHz && window.__displayHz !== 60 || document.visibilityState === 'visible') {
                        nativeOpt.textContent = 'Native (' + (window.__displayHz || 60) + ' Hz)';
                    }
                    // Stop polling after detection settles (after ~2s)
                    if (typeof window.__displayHz === 'number' && performance.now() > 3000) {
                        nativeOpt.textContent = 'Native (' + window.__displayHz + ' Hz)';
                        clearInterval(updateNativeLabel);
                    }
                }, 1000);
            }
        }
        initFpsCapControl();

        function processReplay() {
            if (!isReplayActive) return;
            var events = window._activeReplayEvents;
            if (!events || !events.length) { isReplayActive = false; return; }
            try {
                const elapsed = Date.now() - replayStartTime;
                while (replayIndex < events.length && events[replayIndex].t <= elapsed) {
                    const ev = events[replayIndex++];
                    // Use current live settings (brush size, multiplier) so changes
                    // during replay are reflected immediately. Position, velocity,
                    // timing and color come from the recording.
                    multiSplat(ev.x, ev.y, ev.dx, ev.dy, ev.color, false);
                    if (typeof recRecordInteraction === 'function' && recEnabled) {
                        try { recRecordInteraction(ev.x, ev.y, ev.dx, ev.dy, ev.color); } catch(_){}
                    }
                }
                if (replayIndex >= events.length) {
                    // If right button still held, loop replay without rebroadcast
                    if (isRightMouseDown) {
                        replayStroke(false);
                    } else {
                        isReplayActive = false;
                        window._activeReplayEvents = null;
                    }
                }
            } catch (err) {
                isReplayActive = false;
                window._activeReplayEvents = null;
            }
        }

        // Allow multiplayer to schedule a stroke replay with normalized events
        window.scheduleStrokeReplay = function(normalizedEvents) {
            var remoteEvents = (normalizedEvents || []).map(ev => ({
                t: ev.t || 0,
                x: (ev.x || 0) * canvas.width,
                y: (ev.y || 0) * canvas.height,
                dx: (ev.dx || 0) * canvas.width,
                dy: (ev.dy || 0) * canvas.height,
                color: Array.isArray(ev.color) ? ev.color.slice() : pointer.color.slice(),
                mult: Math.max(1, Math.round(ev.mult || 1)),
                radius: (typeof ev.radius === 'number') ? ev.radius : config.SPLAT_RADIUS
            }));
            if (!remoteEvents.length) return;
            window._activeReplayEvents = remoteEvents;
            replayIndex = 0;
            replayStartTime = Date.now();
            isReplayActive = true;
        };
        
        canvas.addEventListener('mousedown', (e) => {
            // Right-click replay always works, even when paused
            if (e.button === 2) {
                e.preventDefault();
                isRightMouseDown = true;
                isReplayActive = true;
                replayStroke(true);
                return;
            }
            // Only process left-clicks that actually target the canvas (not click-throughs from UI)
            if (isPaused || e.target !== canvas) return;
            
            const coords = getCanvasCoordinates(e);
            pointer.down = true;
            pointer.moved = false;
            pointer.x = coords.x;
            pointer.y = coords.y;
            pointer.dx = 0;
            pointer.dy = 0;
            splatDownTime = Date.now();
            splatOutActive = false;
            applyPickerColor();
            // Begin stroke recording and include initial splat
            startStroke(pointer.x, pointer.y);
            pushStrokeEvent(pointer.x, pointer.y, 0, 0, pointer.color);
            if (recEnabled) recRecordInteraction(coords.x, coords.y, 0, 0, pointer.color);
            const inMult = getSplatInMult();
            splatWithRadius(pointer.x, pointer.y, 0, 0, pointer.color, config.SPLAT_RADIUS * inMult);
            if (typeof broadcastSplat === 'function') {
                broadcastSplat(
                    coords.x / canvas.width,
                    coords.y / canvas.height,
                    0,
                    0,
                    pointer.color,
                    (typeof animationMultiplier === 'number' ? animationMultiplier : 1),
                    config.SPLAT_RADIUS
                );
            }
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (isPaused || isReplayActive) return;
            const coords = getCanvasCoordinates(e);
            pointer.dx = (coords.x - pointer.x) * 10.0;
            pointer.dy = (coords.y - pointer.y) * 10.0;
            pointer.x = coords.x;
            pointer.y = coords.y;

            if (typeof broadcastCursor === 'function') {
                broadcastCursor(coords.x / canvas.width, coords.y / canvas.height);
            }

            if (pointer.down) {
                // Brush refresh rate throttle
                var rate = window.brushRefreshRate || 0;
                if (rate > 0) {
                    var now = Date.now();
                    if (now - lastSplatTime < rate) {
                        return; // pointer.moved stays false → no splat in render loop
                    }
                    lastSplatTime = now;
                }
                pointer.moved = true;
                if (recEnabled) recRecordInteraction(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
                
                if (typeof broadcastSplat === 'function') {
                    if (!canvas._lastBroadcast || Date.now() - canvas._lastBroadcast > 33) {
                        broadcastSplat(
                            coords.x / canvas.width,
                            coords.y / canvas.height,
                            pointer.dx / canvas.width,
                            pointer.dy / canvas.height,
                            pointer.color,
                            (typeof animationMultiplier === 'number' ? animationMultiplier : 1),
                            config.SPLAT_RADIUS
                        );
                        canvas._lastBroadcast = Date.now();
                    }
                }
            }
        });
        
        window.addEventListener('mouseup', (e) => {
            if (e.button === 2) {
                isRightMouseDown = false;
                isReplayActive = false;
                window._activeReplayEvents = null;
                customCursor.style.opacity = '0';
            } else if (e.button === 0) {
                var wasDown = pointer.down;
                if (wasDown && typeof broadcastPointerUp === 'function') {
                    broadcastPointerUp();
                }
                if (wasDown && window.splatOutMode !== 'instant') {
                    splatUpTime = Date.now();
                    splatOutActive = true;
                    splatOutX = pointer.x;
                    splatOutY = pointer.y;
                    splatOutDx = pointer.dx;
                    splatOutDy = pointer.dy;
                    splatOutColor = pointer.color.slice();
                }
                pointer.down = false;
                pointer.moved = false;
                if (wasDown) {
                    archiveCurrentStroke();
                    advanceColor();
                }
            }
        });
        
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (isPaused) return;
            const touch = e.touches[0];
            const coords = getCanvasCoordinates(touch);
            pointer.down = true;
            pointer.moved = false;
            pointer.x = coords.x;
            pointer.y = coords.y;
            pointer.dx = 0;
            pointer.dy = 0;
            splatDownTime = Date.now();
            splatOutActive = false;
            applyPickerColor();
            if (recEnabled) recRecordInteraction(coords.x, coords.y, 0, 0, pointer.color);
            const inMult = getSplatInMult();
            splatWithRadius(pointer.x, pointer.y, 0, 0, pointer.color, config.SPLAT_RADIUS * inMult);
            if (typeof broadcastSplat === 'function') {
                broadcastSplat(
                    coords.x / canvas.width,
                    coords.y / canvas.height,
                    0,
                    0,
                    pointer.color,
                    (typeof animationMultiplier === 'number' ? animationMultiplier : 1),
                    config.SPLAT_RADIUS
                );
            }
        }, { passive: false });
        
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (isPaused) return;
            const touch = e.touches[0];
            const coords = getCanvasCoordinates(touch);
            pointer.dx = (coords.x - pointer.x) * 10.0;
            pointer.dy = (coords.y - pointer.y) * 10.0;
            pointer.x = coords.x;
            pointer.y = coords.y;
            if (pointer.down) {
                // Brush refresh rate throttle (same as mousemove)
                var rate = window.brushRefreshRate || 0;
                if (rate > 0) {
                    var now = Date.now();
                    if (now - lastSplatTime < rate) return;
                    lastSplatTime = now;
                }
                pointer.moved = true;
                if (recEnabled) recRecordInteraction(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
                
                if (typeof broadcastSplat === 'function') {
                    const now = Date.now();
                    if (!canvas._lastTouchBroadcast || now - canvas._lastTouchBroadcast > 50) {
                        broadcastSplat(
                            coords.x / canvas.width,
                            coords.y / canvas.height,
                            pointer.dx / canvas.width,
                            pointer.dy / canvas.height,
                            pointer.color,
                            (typeof animationMultiplier === 'number' ? animationMultiplier : 1),
                            config.SPLAT_RADIUS
                        );
                        canvas._lastTouchBroadcast = now;
                    }
                }
            }
        }, { passive: false });
        
        window.addEventListener('touchend', () => {
            if (pointer.down) {
                if (window.splatOutMode !== 'instant') {
                    splatUpTime = Date.now();
                    splatOutActive = true;
                    splatOutX = pointer.x;
                    splatOutY = pointer.y;
                    splatOutDx = pointer.dx;
                    splatOutDy = pointer.dy;
                    splatOutColor = pointer.color.slice();
                }
                pointer.down = false;
                pointer.moved = false;
                archiveCurrentStroke();
                advanceColor();
                if (typeof broadcastPointerUp === 'function') {
                    broadcastPointerUp();
                }
            }
        });
        
        window.addEventListener('touchcancel', () => {
            if (pointer.down) {
                pointer.down = false;
                pointer.moved = false;
                if (typeof broadcastPointerUp === 'function') {
                    broadcastPointerUp();
                }
            }
        });
        
        // Turbulence mode toggle
        window.useTurbulenceMode = false;
        const turbulenceToggle = document.getElementById('turbulenceMode');
        if (turbulenceToggle) {
            turbulenceToggle.addEventListener('change', (e) => {
                window.useTurbulenceMode = e.target.checked;
            });
        }
        
        // Micro Detail toggle
        const microDetailToggle = document.getElementById('microDetailToggle');
        const microDetailPanel = document.getElementById('microDetailPanel');
        if (microDetailToggle) {
            microDetailToggle.addEventListener('change', (e) => {
                const on = e.target.checked;
                if (microDetailPanel) microDetailPanel.style.display = on ? '' : 'none';
                if (!on) {
                    // Reset to zero when disabled
                    config.CLARITY = 0;
                    config.VIBRANCE = 0;
                    ['clarity', 'vibrance'].forEach(id => {
                        const sl = document.getElementById(id);
                        if (sl) { sl.value = 0; sl.style.setProperty('--val', 0); }
                        const sp = document.getElementById(id + 'Value');
                        if (sp) sp.textContent = '0.00';
                    });
                } else {
                    // Set sensible defaults on enable
                    const defaults = { clarity: 0.35, vibrance: 0.25 };
                    Object.entries(defaults).forEach(([id, val]) => {
                        config[id.toUpperCase()] = val;
                        const sl = document.getElementById(id);
                        if (sl) { sl.value = val; sl.style.setProperty('--val', val); }
                        const sp = document.getElementById(id + 'Value');
                        if (sp) sp.textContent = val.toFixed(2);
                    });
                }
            });
        }
        
        // Background color picker
        const backgroundColorPicker = document.getElementById('backgroundColorPicker');
        let lastBackgroundColor = '#000000';
        
        if (backgroundColorPicker) {
            lastBackgroundColor = backgroundColorPicker.value || '#000000';
            backgroundColorPicker.addEventListener('input', (e) => {
                const color = e.target.value;
                lastBackgroundColor = color;
                if (!document.body.classList.contains('transparent-mode')) {
                    canvasArea.style.backgroundColor = color;
                }
            });
        }
        
        // Canvas opacity slider (for layer visibility)
        const canvasOpacitySlider = document.getElementById('canvasOpacity');
        const opacityValueDisplay = document.getElementById('opacityValue');
        
        if (canvasOpacitySlider) {
            canvasOpacitySlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                const opacity = value / 100;
                canvas.style.opacity = opacity;
                opacityValueDisplay.textContent = `${value}%`;
            });
        }
        
        // Preserve fluid opacity checkbox ("Empty Alpha Locked")
        const preserveFluidOpacityCheckbox = document.getElementById('preserveFluidOpacity');
        window.preserveFluidOpacity = preserveFluidOpacityCheckbox ? !!preserveFluidOpacityCheckbox.checked : true;
        
        if (preserveFluidOpacityCheckbox) {
            preserveFluidOpacityCheckbox.addEventListener('change', (e) => {
                window.preserveFluidOpacity = e.target.checked;
            });
        }
        
        // Capture dimming slider (controls background transparency)
        window.backgroundTransparency = 0.8; // Default 80%
        const captureDimmingSlider = document.getElementById('captureDimming');
        const dimmingValueDisplay = document.getElementById('dimmingValue');
        
        if (captureDimmingSlider) {
            captureDimmingSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                window.backgroundTransparency = value / 100; // Convert to 0-1 range
                dimmingValueDisplay.textContent = `${value}%`;
            });
        }
        
        // Multiplier slider
        const multiplierSlider = document.getElementById('multiplier');
        const multiplierValue = document.getElementById('multiplierValue');
        
        if (multiplierSlider) {
            multiplierSlider.addEventListener('input', (e) => {
                animationMultiplier = parseInt(e.target.value);
                window.animationMultiplier = animationMultiplier; // Expose for stats
                multiplierValue.textContent = animationMultiplier + 'x';
            });
        }
        
        // Hotkeys: 1-8 set Multiplier 1x-8x
        function setMultiplierHotkey(val) {
            const n = Math.max(1, Math.min(8, parseInt(val)));
            if (!Number.isFinite(n)) return;
            animationMultiplier = n;
            window.animationMultiplier = n;
            if (multiplierSlider) {
                multiplierSlider.value = String(n);
                try { multiplierSlider.style.setProperty('--val', n); } catch (_) {}
            }
            if (multiplierValue) multiplierValue.textContent = n + 'x';
        }
        document.addEventListener('keydown', (e) => {
            // Ignore when typing in inputs/textareas or contenteditable
            const t = e.target;
            const tag = t && t.tagName ? t.tagName.toUpperCase() : '';
            const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || (t && t.isContentEditable);
            if (isEditable) return;
            
            const code = e.code;
            if (code && (code.startsWith('Digit') || code.startsWith('Numpad'))) {
                const d = code.replace(/^(Digit|Numpad)/, '');
                const num = parseInt(d, 10);
                if (num >= 1 && num <= 8) {
                    e.preventDefault();
                    setMultiplierHotkey(num);
                }
            }
        });
        
        // Expose initial value
        window.animationMultiplier = animationMultiplier;
        
        // Initialize all kaleidoscope variables with defaults
        window.kaleidoEnabled = false;
        window.kaleidoSegments = 6;
        window.kaleidoMode = 1;  // Default to Wedge mode
        window.kAngle = 0;
        window.kTwist = 0;
        window.kZoom = 1;
        window.kBlend = 1;
        window.kAnimateRot = false;
        const kaleidoToggleEl = document.getElementById('kaleidoToggle');
        const kaleidoSegmentsEl = document.getElementById('kaleidoSegments');
        const kaleidoValueEl = document.getElementById('kaleidoValue');
        
        if (kaleidoToggleEl) {
            kaleidoToggleEl.addEventListener('change', (e) => {
                window.kaleidoEnabled = e.target.checked;
                if (e.target.checked) {
                    window._prevMultiplier = animationMultiplier;
                    if (!window._kaleidoBootstrapped) {
                        animationMultiplier = 8;
                        window.animationMultiplier = 8;
                        if (multiplierSlider) {
                            multiplierSlider.value = 8;
                            multiplierSlider.style.setProperty('--val', 8);
                            if (multiplierValue) multiplierValue.textContent = '8x';
                        }
                        window.kaleidoSegments = 16;
                        if (kaleidoSegmentsEl) {
                            kaleidoSegmentsEl.value = '16';
                            kaleidoSegmentsEl.style.setProperty('--val', 16);
                            kaleidoSegmentsEl.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                        if (kaleidoValueEl) kaleidoValueEl.textContent = '16';
                        window._kaleidoBootstrapped = true;
                    }
                } else {
                    if (typeof window._prevMultiplier === 'number') {
                        animationMultiplier = window._prevMultiplier;
                        window.animationMultiplier = animationMultiplier;
                        if (multiplierSlider) {
                            multiplierSlider.value = String(animationMultiplier);
                            multiplierSlider.style.setProperty('--val', animationMultiplier);
                            if (multiplierValue) multiplierValue.textContent = animationMultiplier + 'x';
                        }
                    }
                }
            });
        }
        if (kaleidoSegmentsEl) {
            const setVal = () => { if (kaleidoValueEl) kaleidoValueEl.textContent = String(window.kaleidoSegments); };
            kaleidoSegmentsEl.addEventListener('input', (e) => {
                window.kaleidoSegments = parseInt(e.target.value, 10) || 1;
                setVal();
            });
            window.kaleidoSegments = parseInt(kaleidoSegmentsEl.value, 10) || 1;
            setVal();
        }
        const kaleidoPanel = document.getElementById('kaleidoPanel');
        function syncKaleidoPanel() {
            if (kaleidoPanel) kaleidoPanel.classList.toggle('open', !!window.kaleidoEnabled);
            // Note: Removed resize dispatch - it was clearing fluid data via initFramebuffers()
        }
        if (kaleidoToggleEl) {
            window.kaleidoEnabled = !!kaleidoToggleEl.checked;
            syncKaleidoPanel();
            kaleidoToggleEl.addEventListener('change', () => syncKaleidoPanel());
        }
        let lastAngleSnapTime = 0;
        const ANGLE_STICK_MS = 1500;
        const ANGLE_STICK_TOL = 1.0;
        const kAngleEl = document.getElementById('kAngle');
        const kAngleValueEl = document.getElementById('kAngleValue');
        if (kAngleEl) {
            kAngleEl.addEventListener('input', (e) => {
                let deg = parseFloat(e.target.value);
                const now = Date.now();
                const withinTol = Math.abs(deg) <= ANGLE_STICK_TOL;
                const stickActive = (now - lastAngleSnapTime) < ANGLE_STICK_MS;

                if (!stickActive && withinTol) {
                    deg = 0;
                    lastAngleSnapTime = now;
                } else if (stickActive) {
                    deg = 0;
                }

                if (!Number.isNaN(deg)) {
                    e.target.value = String(deg);
                    try { e.target.style.setProperty('--val', deg); } catch (_){}
                    window.kAngle = deg * Math.PI / 180;
                    if (kAngleValueEl) kAngleValueEl.textContent = deg + '°';
                }
            });
        }
        
        const kSpinSpeedEl = document.getElementById('kSpinSpeed');
        const kSpinSpeedValueEl = document.getElementById('kSpinSpeedValue');
        if (kSpinSpeedEl) {
            kSpinSpeedEl.addEventListener('input', (e) => {
                const degs = parseFloat(e.target.value);
                window.kSpinSpeed = degs;
                if (kSpinSpeedValueEl) kSpinSpeedValueEl.textContent = degs + '°/s';
            });
        }
        const kTwistEl = document.getElementById('kTwist');
        const kTwistValueEl = document.getElementById('kTwistValue');
        if (kTwistEl) {
            kTwistEl.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                window.kTwist = v;
                if (kTwistValueEl) kTwistValueEl.textContent = v.toFixed(1);
            });
        }
        const kZoomEl = document.getElementById('kZoom');
        const kZoomValueEl = document.getElementById('kZoomValue');
        if (kZoomEl) {
            kZoomEl.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                window.kZoom = v;
                if (kZoomValueEl) kZoomValueEl.textContent = v.toFixed(2);
            });
        }
        const kBlendEl = document.getElementById('kBlend');
        const kBlendValueEl = document.getElementById('kBlendValue');
        if (kBlendEl) {
            kBlendEl.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                window.kBlend = v;
                if (kBlendValueEl) kBlendValueEl.textContent = v.toFixed(2);
            });
        }
        // Initial defaults (middling), applied without requiring user interaction
        (function initKaleidoDefaults(){
            // Angle
            if (kAngleEl) {
                const deg = parseFloat(kAngleEl.value || '0');
                window.kAngle = (isFinite(deg) ? deg : 0) * Math.PI / 180;
                if (kAngleValueEl) kAngleValueEl.textContent = (isFinite(deg)?deg:0) + '°';
            } else {
                window.kAngle = 0;
            }
            // Spin
            if (kSpinSpeedEl) {
                const s = parseFloat(kSpinSpeedEl.value || '30');
                window.kSpinSpeed = isFinite(s) ? s : 30;
                if (kSpinSpeedValueEl) kSpinSpeedValueEl.textContent = (isFinite(s)?s:30) + '°/s';
            } else {
                window.kSpinSpeed = 30;
            }
            // Twist
            if (kTwistEl) {
                const t = parseFloat(kTwistEl.value || '0');
                window.kTwist = isFinite(t) ? t : 0;
                if (kTwistValueEl) kTwistValueEl.textContent = (isFinite(t)?t:0).toFixed(1);
            } else {
                window.kTwist = 0;
            }
            // Zoom
            if (kZoomEl) {
                const z = parseFloat(kZoomEl.value || '1');
                window.kZoom = isFinite(z) ? z : 1;
                if (kZoomValueEl) kZoomValueEl.textContent = (isFinite(z)?z:1).toFixed(2);
            } else {
                window.kZoom = 1;
            }
            // Blend - default to 1
            if (kBlendEl) {
                const b = parseFloat(kBlendEl.value || '1');
                window.kBlend = isFinite(b) ? b : 1;
                if (kBlendValueEl) kBlendValueEl.textContent = (isFinite(b)?b:1).toFixed(2);
            } else {
                window.kBlend = 1;
            }
        })();
        const kAnimateRotEl = document.getElementById('kAnimateRot');
        if (kAnimateRotEl) {
            window.kAnimateRot = !!kAnimateRotEl.checked;
            kAnimateRotEl.addEventListener('change', (e) => { window.kAnimateRot = e.target.checked; });
        }
        const kaleidoModeEl = document.getElementById('kaleidoMode');
        
        // Update segments label based on kaleidoscope mode
        function updateSegmentsLabel(mode) {
            const segmentsLabelEl = document.querySelector('label[for="kaleidoSegments"]');
            if (!segmentsLabelEl) return;
            
            const valueSpan = segmentsLabelEl.querySelector('.value-display');
            const currentValue = valueSpan ? valueSpan.textContent : '';
            
            let labelText = 'Segments';
            switch(mode) {
                case 0: // Off
                    labelText = 'Segments';
                    break;
                case 1: // Wedge
                    labelText = 'Facets';
                    break;
                case 2: // Mirror H
                    labelText = 'Layers';
                    break;
                case 3: // Mirror V
                    labelText = 'Layers';
                    break;
                case 4: // Mirror Quad
                    labelText = 'Reflections';
                    break;
                case 5: // Spiral
                    labelText = 'Rings';
                    break;
                default:
                    labelText = 'Segments';
            }
            
            // Update only the text node before the value span (preserve the live span element)
            if (valueSpan) {
                // Find or create the text node before the span
                const textNode = segmentsLabelEl.firstChild;
                if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                    textNode.textContent = labelText + ' ';
                } else {
                    segmentsLabelEl.insertBefore(document.createTextNode(labelText + ' '), valueSpan);
                }
            } else {
                segmentsLabelEl.textContent = labelText;
            }
        }
        
        if (kaleidoModeEl) {
            window.kaleidoMode = parseInt(kaleidoModeEl.value || '1', 10);
            // Delay label update to ensure DOM is ready
            setTimeout(() => updateSegmentsLabel(window.kaleidoMode), 0);
            kaleidoModeEl.addEventListener('change', (e) => {
                const mode = parseInt(e.target.value, 10);
                window.kaleidoMode = mode;
                updateSegmentsLabel(mode);
            });
        }
        
        function multiSplat(x, y, dx, dy, color, shouldBroadcast) {
            // Kaleidoscope behavior
            const centerX = canvas.width * 0.5;
            const centerY = canvas.height * 0.5;

            for (let i = 0; i < animationMultiplier; i++) {
                const angle = (Math.PI * 2 * i) / animationMultiplier;

                const relX = x - centerX;
                const relY = y - centerY;

                const rotatedX = relX * Math.cos(angle) - relY * Math.sin(angle);
                const rotatedY = relX * Math.sin(angle) + relY * Math.cos(angle);

                const finalX = rotatedX + centerX;
                const finalY = rotatedY + centerY;

                const rotatedDx = dx * Math.cos(angle) - dy * Math.sin(angle);
                const rotatedDy = dx * Math.sin(angle) + dy * Math.cos(angle);

                splat(finalX, finalY, rotatedDx, rotatedDy, color);
            }

            if (shouldBroadcast && typeof broadcastSplat === 'function') {
                broadcastSplat(
                    x / canvas.width,
                    y / canvas.height,
                    dx / canvas.width,
                    dy / canvas.height,
                    color,
                    (typeof animationMultiplier === 'number' ? animationMultiplier : 1),
                    config.SPLAT_RADIUS
                );
            }
        }
        
        // Helper to apply a multiSplat with specific multiplier and radius, restoring after
        window.applyMultiSplatWith = function(x, y, dx, dy, color, mult, radius) {
            const prevM = (typeof animationMultiplier === 'number') ? animationMultiplier : 1;
            const prevR = config.SPLAT_RADIUS;
            animationMultiplier = Math.max(1, Math.round(mult || 1));
            config.SPLAT_RADIUS = (typeof radius === 'number') ? radius : prevR;
            try { multiSplat(x, y, dx, dy, color, false); } finally {
                animationMultiplier = prevM;
                config.SPLAT_RADIUS = prevR;
            }
        };
        
        const cursorToggle = document.getElementById('cursorToggle');
        
        cursorToggle.addEventListener('change', (e) => {
            showCursor = e.target.checked;
            if (!showCursor && !isReplayActive) {
                customCursor.style.opacity = '0';
            }
            
            // Toggle cursor visibility on non-UI elements
            const nonUIElements = [
                document.getElementById('canvas-area'),
                document.getElementById('canvas-wrapper'),
                document.getElementById('canvas'),
                document.getElementById('canvas-size-display'),
                document.getElementById('layers-container'),
                ...document.querySelectorAll('.background-layer'),
                ...document.querySelectorAll('.resize-handle'),
                ...document.querySelectorAll('.corner-lock'),
                ...document.querySelectorAll('.layer-resize-handle')
            ];
            
            nonUIElements.forEach(element => {
                if (element) {
                    if (showCursor) {
                        element.classList.remove('hide-cursor');
                    } else {
                        element.classList.add('hide-cursor');
                    }
                }
            });
        });
        
        // Initialize cursor state on page load
        cursorToggle.dispatchEvent(new Event('change'));
        
        colorStorage.load();
        initPaletteUI();
        preseedPaletteOnLoad();
        const colorPickerEl = document.getElementById('colorPicker');
        if (colorPickerEl) {
            colorPickerEl.addEventListener('input', () => {
                const rnd = document.getElementById('randomColor');
                if (rnd) rnd.checked = false;
                const stepEl = document.getElementById('stepPalette');
                if (stepEl) stepEl.checked = false;
                applyPickerColor();
                updatePaletteStepIndicator();
            });
        }
        const randomColorCheckboxEl = document.getElementById('randomColor');
        if (randomColorCheckboxEl) {
            randomColorCheckboxEl.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const stepEl = document.getElementById('stepPalette');
                    if (stepEl) stepEl.checked = false;
                    advanceColor();
                }
                updatePaletteStepIndicator();
            });
        }
        const stepPaletteCheckboxEl = document.getElementById('stepPalette');
        if (stepPaletteCheckboxEl) {
            stepPaletteCheckboxEl.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const rnd = document.getElementById('randomColor');
                    if (rnd) rnd.checked = false;
                    advanceColor();
                }
                updatePaletteStepIndicator();
            });
        }
        
        // Generate vibrant random color (avoids washed out/pale colors)
        function generateVibrantColor() {
            // Use HSL to control saturation and lightness
            const hue = Math.random() * 360; // Full spectrum
            const sat = 0.7 + Math.random() * 0.3; // 70-100% saturation (vibrant)
            const light = 0.45 + Math.random() * 0.2; // 45-65% lightness (not too bright/dark)
            
            // Convert HSL to RGB
            const c = (1 - Math.abs(2 * light - 1)) * sat;
            const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
            const m = light - c / 2;
            
            let r, g, b;
            if (hue < 60) { r = c; g = x; b = 0; }
            else if (hue < 120) { r = x; g = c; b = 0; }
            else if (hue < 180) { r = 0; g = c; b = x; }
            else if (hue < 240) { r = 0; g = x; b = c; }
            else if (hue < 300) { r = x; g = 0; b = c; }
            else { r = c; g = 0; b = x; }
            
            return [r + m, g + m, b + m];
        }
        
        function rgbToHex(r, g, b) {
            var hr = Math.round(r * 255).toString(16).padStart(2, '0');
            var hg = Math.round(g * 255).toString(16).padStart(2, '0');
            var hb = Math.round(b * 255).toString(16).padStart(2, '0');
            return '#' + hr + hg + hb;
        }

        function syncPickerIndicator(r, g, b) {
            var cp = document.getElementById('colorPicker');
            if (cp) cp.value = rgbToHex(r, g, b);
        }

        // Read whatever the picker currently shows into pointer.color
        function applyPickerColor() {
            const hex = document.getElementById('colorPicker').value;
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            pointer.color = [r, g, b];
        }

        // Advance step/random to the NEXT color and sync the picker
        // (called on mouseup so the picker shows what's coming next)
        function advanceColor() {
            const stepEl = document.getElementById('stepPalette');
            const rndEl = document.getElementById('randomColor');
            if (stepEl && stepEl.checked) {
                const list = getStepColorList();
                if (list.length > 0) {
                    const len = list.length;
                    const idx = paletteStepIndex % len;
                    const col = list[idx];
                    paletteStepIndex = (paletteStepIndex + 1) % len;
                    if (col) {
                        syncPickerIndicator(
                            parseInt(col.slice(1, 3), 16) / 255,
                            parseInt(col.slice(3, 5), 16) / 255,
                            parseInt(col.slice(5, 7), 16) / 255
                        );
                    }
                    if (typeof updatePaletteStepIndicator === 'function') {
                        updatePaletteStepIndicator();
                    }
                    return;
                }
            }
            if (rndEl && rndEl.checked) {
                var c = generateVibrantColor();
                syncPickerIndicator(c[0], c[1], c[2]);
                return;
            }
        }

        // Legacy wrapper — reads picker then advances (used by non-pointer callers)
        function updateColor() {
            applyPickerColor();
            advanceColor();
        }
        
        // Expose globally for other scripts
        window.generateVibrantColor = generateVibrantColor;
        
        const sliderConfig = {
            densityDissipation: { key: 'DENSITY_DISSIPATION', decimals: 4 },
            velocityDissipation: { key: 'VELOCITY_DISSIPATION', decimals: 4 },
            pressureDissipation: { key: 'PRESSURE_DISSIPATION', decimals: 3 },
            pressureIteration: { key: 'PRESSURE_ITERATIONS', decimals: 0 },
            velocityInfluence: { key: 'VELOCITY_INFLUENCE', decimals: 3 },
            curl: { key: 'CURL', decimals: 0 },
            sharpness: { key: 'SHARPNESS', decimals: 1 },
            clarity: { key: 'CLARITY', decimals: 2 },
            vibrance: { key: 'VIBRANCE', decimals: 2 }
        };
        
        const brushSizeSlider = document.getElementById('brushSize');
        brushSizeSlider.addEventListener('input', (e) => {
            config.SPLAT_RADIUS = e.target.value / 1000;
        });
        
        // Transparent Mode checkbox (controls canvas-area transparency)
        const transparentModeCheckbox = document.getElementById('transparentMode');
        if (transparentModeCheckbox) {
            const applyTransparentMode = (enabled) => {
                if (enabled) {
                    document.body.classList.add('transparent-mode');
                    canvasArea.style.backgroundColor = 'transparent';
                } else {
                    document.body.classList.remove('transparent-mode');
                    const color = (backgroundColorPicker && backgroundColorPicker.value) || lastBackgroundColor || '#000000';
                    canvasArea.style.backgroundColor = color;
                }
            };

            transparentModeCheckbox.addEventListener('change', (e) => {
                applyTransparentMode(e.target.checked);
                
                // Save to settings
                if (window.Settings && typeof window.Settings.saveCheckbox === 'function') {
                    window.Settings.saveCheckbox('transparentMode', e.target.checked);
                }
            });
            
            // Load saved value
            if (window.Settings && typeof window.Settings.loadCheckbox === 'function') {
                const saved = window.Settings.loadCheckbox('transparentMode', false);
                transparentModeCheckbox.checked = saved;
                applyTransparentMode(saved);
            } else {
                // Ensure initial background matches picker when no settings are available
                if (canvasArea && backgroundColorPicker && !transparentModeCheckbox.checked) {
                    canvasArea.style.backgroundColor = backgroundColorPicker.value;
                }
            }
        }

        // Resolution dropdowns (absolute resolution, independent of display canvas size)
        const visualResSel = document.getElementById('visualResolution');
        const visualResCustom = document.getElementById('visualResolutionCustom');
        if (visualResSel) {
            // Check if current value exists in options, otherwise use custom
            const currentVal = String(config.DYE_RESOLUTION);
            const hasOption = Array.from(visualResSel.options).some(opt => opt.value === currentVal);
            if (hasOption) {
                visualResSel.value = currentVal;
            } else {
                visualResSel.value = 'custom';
                if (visualResCustom) {
                    visualResCustom.style.display = 'block';
                    visualResCustom.value = config.DYE_RESOLUTION;
                }
            }
            
            visualResSel.addEventListener('change', (e) => {
                if (e.target.value === 'custom') {
                    if (visualResCustom) {
                        visualResCustom.style.display = 'block';
                        // Restore from session or use current
                        const sessionVal = window.settingsManager?.getSession('temp.visualResolutionCustom');
                        visualResCustom.value = sessionVal || config.DYE_RESOLUTION;
                        visualResCustom.focus();
                    }
                } else {
                    if (visualResCustom) visualResCustom.style.display = 'none';
                    const v = parseInt(e.target.value, 10);
                    if (isFinite(v)) {
                        config.DYE_RESOLUTION = v;
                        window.needsFramebufferReinit = true;
                    }
                }
            });
            
            if (visualResCustom) {
                visualResCustom.addEventListener('input', (e) => {
                    const v = parseInt(e.target.value, 10);
                    if (isFinite(v) && v >= 64) {
                        config.DYE_RESOLUTION = v;
                        window.needsFramebufferReinit = true;
                        // Save to session storage
                        window.settingsManager?.setSession('temp.visualResolutionCustom', v);
                    }
                });
            }
        }
        
        const physicsResSel = document.getElementById('physicsResolution');
        const physicsResCustom = document.getElementById('physicsResolutionCustom');
        if (physicsResSel) {
            // Check if current value exists in options, otherwise use custom
            const currentVal = String(config.SIM_RESOLUTION);
            const hasOption = Array.from(physicsResSel.options).some(opt => opt.value === currentVal);
            if (hasOption) {
                physicsResSel.value = currentVal;
            } else {
                physicsResSel.value = 'custom';
                if (physicsResCustom) {
                    physicsResCustom.style.display = 'block';
                    physicsResCustom.value = config.SIM_RESOLUTION;
                }
            }
            
            physicsResSel.addEventListener('change', (e) => {
                if (e.target.value === 'custom') {
                    if (physicsResCustom) {
                        physicsResCustom.style.display = 'block';
                        // Restore from session or use current
                        const sessionVal = window.settingsManager?.getSession('temp.physicsResolutionCustom');
                        physicsResCustom.value = sessionVal || config.SIM_RESOLUTION;
                        physicsResCustom.focus();
                    }
                } else {
                    if (physicsResCustom) physicsResCustom.style.display = 'none';
                    const v = parseInt(e.target.value, 10);
                    if (isFinite(v)) {
                        config.SIM_RESOLUTION = v;
                        window.needsFramebufferReinit = true;
                    }
                }
            });
            
            if (physicsResCustom) {
                physicsResCustom.addEventListener('input', (e) => {
                    const v = parseInt(e.target.value, 10);
                    if (isFinite(v) && v >= 16) {
                        config.SIM_RESOLUTION = v;
                        window.needsFramebufferReinit = true;
                        // Save to session storage
                        window.settingsManager?.setSession('temp.physicsResolutionCustom', v);
                    }
                });
            }
        }
        
        // Scrollwheel to adjust brush size, density (Shift), or motion isolation (Ctrl+Shift) on canvas area
        let lastDensitySnapTime = 0;
        
        canvasArea.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            if (e.ctrlKey && e.shiftKey) {
                // Ctrl+Shift+Scroll: Adjust Motion Isolation (Velocity Influence)
                // Uses eased acceleration: faster scroll = bigger jumps
                const velSlider = document.getElementById('velocityInfluence');
                const velValueSpan = document.getElementById('velocityInfluenceValue');
                if (velSlider) {
                    let currentValue = parseFloat(velSlider.value);
                    const minValue = parseFloat(velSlider.min);
                    const maxValue = parseFloat(velSlider.max);
                    const range = maxValue - minValue;
                    
                    // Eased step: base 0.1 + acceleration from scroll speed
                    // deltaY is typically 100-150 for normal scroll, higher for fast scroll
                    const scrollMagnitude = Math.min(Math.abs(e.deltaY) / 100, 3); // Cap at 3x
                    const easedStep = 0.1 + (scrollMagnitude - 1) * 0.15; // 0.1 to 0.4 range
                    const stepSize = easedStep * (range / 4); // Scale to slider range
                    
                    let newValue;
                    if (e.deltaY < 0) {
                        newValue = Math.min(currentValue + stepSize, maxValue);
                    } else {
                        newValue = Math.max(currentValue - stepSize, minValue);
                    }
                    
                    // Update slider and config
                    velSlider.value = String(newValue);
                    velSlider.style.setProperty('--val', newValue);
                    config.VELOCITY_INFLUENCE = newValue;
                    if (velValueSpan) velValueSpan.textContent = newValue.toFixed(3);
                }
            } else if (e.ctrlKey && e.altKey) {
                // Ctrl+Alt+Scroll: Adjust Curl
                const cSlider = document.getElementById('curl');
                const cSpan = document.getElementById('curlValue');
                if (cSlider) {
                    let currentValue = parseFloat(cSlider.value);
                    const minValue = parseFloat(cSlider.min);
                    const maxValue = parseFloat(cSlider.max);
                    const stepSize = parseFloat(cSlider.step) || 1;

                    let newValue;
                    if (e.deltaY < 0) {
                        newValue = currentValue + stepSize;
                        if (newValue > maxValue) newValue = maxValue;
                    } else {
                        newValue = currentValue - stepSize;
                        if (newValue < minValue) newValue = minValue;
                    }

                    cSlider.value = String(newValue);
                    cSlider.style.setProperty('--val', newValue);
                    config.CURL = newValue;
                    if (cSpan) cSpan.textContent = newValue.toFixed(0);
                }
            } else if (e.altKey && e.shiftKey) {
                // Alt+Shift+Scroll: Adjust Velocity Sustain (Velocity Dissipation) with higher sensitivity
                const vSlider = document.getElementById('velocityDissipation');
                const vSpan = document.getElementById('velocityValue');
                if (vSlider) {
                    let currentValue = parseFloat(vSlider.value);
                    const minValue = parseFloat(vSlider.min);
                    const maxValue = parseFloat(vSlider.max);
                    const baseStep = parseFloat(vSlider.step) || 0.0001;
                    const stepSize = baseStep * 10; // faster changes via scroll
                    
                    let newValue;
                    if (e.deltaY < 0) {
                        // Scrolling up - increase sustain
                        newValue = currentValue + stepSize;
                        if (newValue > maxValue) newValue = maxValue;
                    } else {
                        // Scrolling down - decrease sustain
                        newValue = currentValue - stepSize;
                        if (newValue < minValue) newValue = minValue;
                    }
                    
                    // Update slider and config
                    vSlider.value = String(newValue);
                    vSlider.style.setProperty('--val', newValue);
                    config.VELOCITY_DISSIPATION = newValue;
                    if (vSpan) vSpan.textContent = newValue.toFixed(4);
                }
            } else if (e.shiftKey) {
                // Shift+Scroll: Adjust density (less sensitive) with momentary stick at 1.0
                const densitySlider = document.getElementById('densityDissipation');
                const densityValueSpan = document.getElementById('densityValue');
                let currentValue = parseFloat(densitySlider.value);
                const minValue = parseFloat(densitySlider.min);
                const maxValue = parseFloat(densitySlider.max);
                const stepSize = 0.001; // reduced sensitivity
                // Stick parameters (reuse lastDensitySnapTime)
                const stickTarget = 1.0;
                const stickCooldown = 1500; // ms window to prevent overshoot past 1.0
                const now = Date.now();
                const stickActive = (now - lastDensitySnapTime) < stickCooldown;

                let newValue;
                if (e.deltaY < 0) {
                    // Scrolling up - increase density
                    newValue = currentValue + stepSize;
                    if (newValue > maxValue) newValue = maxValue;
                } else {
                    // Scrolling down - decrease density
                    newValue = currentValue - stepSize;
                    if (newValue < minValue) newValue = minValue;
                }
                
                // Momentary stick: simple debounce at 1.0 for stickCooldown ms
                if (!stickActive && newValue >= stickTarget) {
                    newValue = stickTarget;
                    lastDensitySnapTime = now; // start stick window
                } else if (stickActive) {
                    newValue = stickTarget; // hold at 1.0 until cooldown expires
                }
                
                // Update slider and config
                densitySlider.value = newValue;
                densitySlider.style.setProperty('--val', newValue);
                config.DENSITY_DISSIPATION = newValue;
                densityValueSpan.textContent = newValue.toFixed(4);
                
                // Auto-wipe simulation when density sustain gets very low
                if (newValue < 0.88) {
                    wipeSimulation();
                }
            } else {
                // Normal scroll: Adjust brush size with smooth proportional steps
                const brushSizeSlider = document.getElementById('brushSize');
                const currentValue = parseFloat(brushSizeSlider.value);
                const minValue = parseFloat(brushSizeSlider.min);
                const maxValue = parseFloat(brushSizeSlider.max);
                
                // Proportional step: ~8% of current value, clamped to [0.1, 2.0]
                // Gives fine control at small sizes, snappier at large sizes
                const scrollSpeed = Math.min(Math.abs(e.deltaY) / 100, 2); // 1–2× from scroll velocity
                const stepSize = Math.max(0.1, Math.min(currentValue * 0.08 * scrollSpeed, 2.0));
                
                let newValue;
                if (e.deltaY < 0) {
                    newValue = Math.min(currentValue + stepSize, maxValue);
                } else {
                    newValue = Math.max(currentValue - stepSize, minValue);
                }
                
                // Round to one decimal for clean slider display
                newValue = Math.round(newValue * 10) / 10;
                
                brushSizeSlider.value = newValue;
                brushSizeSlider.style.setProperty('--val', newValue);
                config.SPLAT_RADIUS = newValue / 1000;
            }
        }, { passive: false });
        
        // Magnetic snap state for density slider
        let densitySnapTimeout = null;
        let densityLastValue = null;
        let densityIsSnapped = false;
        
        Object.entries(sliderConfig).forEach(([id, cfg]) => {
            const slider = document.getElementById(id);
            if (!slider) return; // Skip if slider doesn't exist
            
            // Map slider IDs to their value span IDs
            const valueSpanMap = {
                'densityDissipation': 'densityValue',
                'velocityDissipation': 'velocityValue',
                'pressureDissipation': 'pressureValue',
                'pressureIteration': 'iterationValue',
                'velocityInfluence': 'velocityInfluenceValue',
                'curl': 'curlValue',
                'sharpness': 'sharpnessValue',
                'clarity': 'clarityValue',
                'vibrance': 'vibranceValue'
            };
            const valueSpanId = valueSpanMap[id] || (id + 'Value');
            const valueSpan = document.getElementById(valueSpanId);
            
            slider.addEventListener('input', (e) => {
                let val = parseFloat(e.target.value);
                
                // Clear active preset when manually adjusting sliders
                if (typeof window.clearActivePreset === 'function') {
                    window.clearActivePreset();
                }
                
                // Magnetic snap to 1.0 for density slider
                if (id === 'densityDissipation') {
                    const snapTarget = 1.0;
                    const snapRange = 0.003; // How close you need to be to snap
                    const pushThrough = 0.008; // How far you need to push to break free
                    
                    // Clear any pending snap timeout
                    if (densitySnapTimeout) {
                        clearTimeout(densitySnapTimeout);
                        densitySnapTimeout = null;
                    }
                    
                    // Check if we're in the snap zone
                    if (Math.abs(val - snapTarget) < snapRange && !densityIsSnapped) {
                        // Snap to 1.0
                        val = snapTarget;
                        slider.value = snapTarget;
                        slider.style.setProperty('--val', snapTarget);
                        densityIsSnapped = true;
                        
                        // Set a timeout to allow breaking free
                        densitySnapTimeout = setTimeout(() => {
                            densityIsSnapped = false;
                        }, 300); // 300ms to push through
                    } else if (densityIsSnapped && Math.abs(val - snapTarget) > pushThrough) {
                        // User pushed through the snap
                        densityIsSnapped = false;
                    } else if (densityIsSnapped && densityLastValue !== null) {
                        // While snapped, resist small movements
                        if (Math.abs(val - snapTarget) < pushThrough) {
                            val = snapTarget;
                            slider.value = snapTarget;
                            slider.style.setProperty('--val', snapTarget);
                        }
                    }
                    
                    densityLastValue = val;
                }
                
                config[cfg.key] = cfg.decimals === 0 ? parseInt(val) : val;
                if (valueSpan) {
                    valueSpan.textContent = cfg.decimals === 0 ? val : val.toFixed(cfg.decimals);
                }
                
                // Auto-wipe simulation when density sustain gets very low
                if (id === 'densityDissipation' && val < 0.88) {
                    wipeSimulation();
                }
            });
            
            // Reset snap state when user releases the slider
            if (id === 'densityDissipation') {
                slider.addEventListener('mouseup', () => {
                    if (densitySnapTimeout) {
                        clearTimeout(densitySnapTimeout);
                        densitySnapTimeout = null;
                    }
                    densityIsSnapped = false;
                    densityLastValue = null;
                });
                
                slider.addEventListener('touchend', () => {
                    if (densitySnapTimeout) {
                        clearTimeout(densitySnapTimeout);
                        densitySnapTimeout = null;
                    }
                    densityIsSnapped = false;
                    densityLastValue = null;
                });
            }
        });
        
        // Load saved slider values from Settings
        function loadSavedSliderValues() {
            if (!window.Settings || typeof window.Settings.loadSlider !== 'function') return;
            
            // Load main sliders
            Object.entries(sliderConfig).forEach(([id, cfg]) => {
                const savedValue = window.Settings.loadSlider(id, null);
                if (savedValue !== null) {
                    const slider = document.getElementById(id);
                    if (slider) {
                        slider.value = savedValue;
                        slider.style.setProperty('--val', savedValue);
                        config[cfg.key] = cfg.decimals === 0 ? parseInt(savedValue) : savedValue;
                        
                        const valueSpanId = id === 'pressureIteration' ? 'iterationValue' : 
                                            id.replace('Dissipation', '') + 'Value';
                        const valueSpan = document.getElementById(valueSpanId);
                        if (valueSpan) {
                            valueSpan.textContent = cfg.decimals === 0 ? Math.round(savedValue) : savedValue.toFixed(cfg.decimals);
                        }
                    }
                }
            });
            
            // Load brush size
            const savedBrushSize = window.Settings.loadSlider('brushSize', null);
            if (savedBrushSize !== null && brushSizeSlider) {
                brushSizeSlider.value = savedBrushSize;
                brushSizeSlider.style.setProperty('--val', savedBrushSize);
                config.SPLAT_RADIUS = savedBrushSize / 1000;
            }
            
            // Load multiplier
            const savedMultiplier = window.Settings.loadSlider('multiplier', null);
            if (savedMultiplier !== null && multiplierSlider) {
                const val = parseInt(savedMultiplier);
                multiplierSlider.value = val;
                multiplierSlider.style.setProperty('--val', val);
                animationMultiplier = val;
                window.animationMultiplier = val;
                if (multiplierValue) multiplierValue.textContent = val + 'x';
            }
            
            // Load canvas opacity
            const savedCanvasOpacity = window.Settings.loadSlider('canvasOpacity', null);
            if (savedCanvasOpacity !== null && canvasOpacitySlider) {
                canvasOpacitySlider.value = savedCanvasOpacity;
                canvasOpacitySlider.style.setProperty('--val', savedCanvasOpacity);
                canvas.style.opacity = savedCanvasOpacity / 100;
                if (opacityValueDisplay) opacityValueDisplay.textContent = `${savedCanvasOpacity}%`;
            }
            
            // Load capture dimming
            const savedCaptureDimming = window.Settings.loadSlider('captureDimming', null);
            if (savedCaptureDimming !== null && captureDimmingSlider) {
                captureDimmingSlider.value = savedCaptureDimming;
                captureDimmingSlider.style.setProperty('--val', savedCaptureDimming);
                window.backgroundTransparency = savedCaptureDimming / 100;
                if (dimmingValueDisplay) dimmingValueDisplay.textContent = `${savedCaptureDimming}%`;
            }
            
            // Load kaleidoscope sliders
            const savedKaleidoSegments = window.Settings.loadSlider('kaleidoSegments', null);
            if (savedKaleidoSegments !== null && kaleidoSegmentsEl) {
                kaleidoSegmentsEl.value = savedKaleidoSegments;
                kaleidoSegmentsEl.style.setProperty('--val', savedKaleidoSegments);
                window.kaleidoSegments = parseInt(savedKaleidoSegments);
                if (kaleidoValueEl) kaleidoValueEl.textContent = String(savedKaleidoSegments);
            }
            
            const savedKAngle = window.Settings.loadSlider('kAngle', null);
            if (savedKAngle !== null && kAngleEl) {
                kAngleEl.value = savedKAngle;
                kAngleEl.style.setProperty('--val', savedKAngle);
                window.kAngle = savedKAngle * Math.PI / 180;
                if (kAngleValueEl) kAngleValueEl.textContent = savedKAngle + '°';
            }
            
            const savedKSpinSpeed = window.Settings.loadSlider('kSpinSpeed', null);
            if (savedKSpinSpeed !== null && kSpinSpeedEl) {
                kSpinSpeedEl.value = savedKSpinSpeed;
                kSpinSpeedEl.style.setProperty('--val', savedKSpinSpeed);
                window.kSpinSpeed = savedKSpinSpeed;
                if (kSpinSpeedValueEl) kSpinSpeedValueEl.textContent = savedKSpinSpeed + '°/s';
            }
            
            const savedKTwist = window.Settings.loadSlider('kTwist', null);
            if (savedKTwist !== null && kTwistEl) {
                kTwistEl.value = savedKTwist;
                kTwistEl.style.setProperty('--val', savedKTwist);
                window.kTwist = savedKTwist;
                if (kTwistValueEl) kTwistValueEl.textContent = savedKTwist.toFixed(1);
            }
            
            const savedKZoom = window.Settings.loadSlider('kZoom', null);
            if (savedKZoom !== null && kZoomEl) {
                kZoomEl.value = savedKZoom;
                kZoomEl.style.setProperty('--val', savedKZoom);
                window.kZoom = savedKZoom;
                if (kZoomValueEl) kZoomValueEl.textContent = savedKZoom.toFixed(2);
            }
            
            const savedKBlend = window.Settings.loadSlider('kBlend', null);
            if (savedKBlend !== null && kBlendEl) {
                kBlendEl.value = savedKBlend;
                kBlendEl.style.setProperty('--val', savedKBlend);
                window.kBlend = savedKBlend;
                if (kBlendValueEl) kBlendValueEl.textContent = savedKBlend.toFixed(2);
            }
        }
        
        // Expose loadSavedSliderValues globally so save-load.js can call it when needed
        window.loadSavedSliderValues = loadSavedSliderValues;
        
        function updateSliderValues() {
            Object.entries(sliderConfig).forEach(([id, cfg]) => {
                const val = config[cfg.key];
                const slider = document.getElementById(id);
                slider.value = val;
                slider.style.setProperty('--val', val);
                const valueSpanId = id === 'pressureIteration' ? 'iterationValue' : 
                                    id.replace('Dissipation', '') + 'Value';
                document.getElementById(valueSpanId).textContent = 
                    cfg.decimals === 0 ? Math.round(val) : val.toFixed(cfg.decimals);
            });
            const brushSlider = document.getElementById('brushSize');
            const brushValue = config.SPLAT_RADIUS * 1000;
            brushSlider.value = brushValue;
            brushSlider.style.setProperty('--val', brushValue);
        }
        
        function splat(x, y, dx, dy, color) {
            const aspectRatio = canvas.width / canvas.height;
            
            splatProg.bind();
            gl.uniform1f(splatProg.uniforms.aspectRatio, aspectRatio);
            gl.uniform2f(splatProg.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
            gl.uniform1f(splatProg.uniforms.radius, config.SPLAT_RADIUS);
            gl.uniform1f(splatProg.uniforms.velocityInfluence, config.VELOCITY_INFLUENCE || 1.2);
            
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
        // Uses its own timestamp (lastRafMs) to measure raw rAF intervals,
        // independent of FPS cap (which may skip rendered frames).
        const rafSamples = [];
        let lastRafMs = 0;
        let displayHz = 60;
        let displayHzDetected = false;
        window.__displayHz = 60;
        
        function detectDisplayHz(nowMs) {
            if (displayHzDetected) return;
            if (lastRafMs > 0) {
                const dt = nowMs - lastRafMs;
                // Only accept plausible rAF intervals (1-50ms = 20-1000Hz)
                if (dt > 1 && dt < 50) {
                    rafSamples.push(dt);
                }
            }
            lastRafMs = nowMs;
            if (rafSamples.length >= 20) {
                displayHzDetected = true;
                const sorted = rafSamples.slice().sort((a, b) => a - b);
                const median = sorted[Math.floor(sorted.length / 2)];
                const raw = Math.round(1000 / median);
                const standards = [30, 48, 60, 72, 75, 90, 100, 120, 144, 165, 180, 200, 240, 360];
                let closest = 60, minDiff = Infinity;
                for (let i = 0; i < standards.length; i++) {
                    const d = Math.abs(raw - standards[i]);
                    if (d < minDiff) { minDiff = d; closest = standards[i]; }
                }
                displayHz = closest;
                window.__displayHz = closest;
            }
        }
        
        // DEFAULT to 60 FPS, not uncapped!
        window.fpsCap = (typeof window.fpsCap === 'number' && window.fpsCap > 0) ? window.fpsCap : 60;
        window.__stats = { fps: 0, frametime: 0, lastCpuMs: 0, targetFps: 60, displayHz: 60, budgetPct: 0 };
        
        function update() {
            const nowMs = performance.now();
            const cpuStart = nowMs;
            
            // Detect display refresh rate from first ~20 frames
            detectDisplayHz(nowMs);
            
            // FPS Cap: skip frame if interval hasn't elapsed (with epsilon tolerance)
            const cap = (typeof window.fpsCap === 'number' && window.fpsCap > 0) ? window.fpsCap : 0;
            if (cap > 0) {
                const desiredMs = 1000 / cap;
                if (nowMs - lastDrawTimeMs < desiredMs - 0.5) {
                    requestAnimationFrame(update);
                    return;
                }
                // Drift-aligned advance: step by interval instead of snapping to now
                lastDrawTimeMs += desiredMs;
                // If we fell too far behind (tab hidden, etc.), snap to now
                if (nowMs - lastDrawTimeMs > desiredMs) {
                    lastDrawTimeMs = nowMs;
                }
            } else {
                lastDrawTimeMs = nowMs;
            }
            
            // Physics timestep: Cap at 16ms to prevent instability at low FPS
            // Without this cap, 30 FPS = 33ms timestep = simulation explodes!
            const dt = Math.min((nowMs - lastTime) / 1000, 0.016);
            lastTime = nowMs;
            if (window.kAnimateRot && window.kSpinSpeed) {
                window.kAngle = (window.kAngle || 0) + dt * window.kSpinSpeed * Math.PI / 180;
            }
            
            const targetWidth = canvasWrapper.clientWidth;
            const targetHeight = canvasWrapper.clientHeight;
            
            if (canvas.width !== targetWidth || canvas.height !== targetHeight || window.needsFramebufferReinit) {
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                initFramebuffers();
                exposeSimStats(); // Update stats after resize
                window.needsFramebufferReinit = false;
            }
            
            // Process replay even when paused so right-click replay always works
            processReplay();
            
            if (!isPaused) {
                if (pointer.moved) {
                    const inMult = getSplatInMult();
                    const savedR = config.SPLAT_RADIUS;
                    config.SPLAT_RADIUS = savedR * inMult;
                    multiSplat(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color, false);
                    config.SPLAT_RADIUS = savedR;
                    pushStrokeEvent(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
                    pointer.moved = false;
                }
                
                // Splat-out: continue splatting with decaying radius after release
                if (splatOutActive) {
                    const outMult = getSplatOutMult();
                    if (outMult <= 0.001) {
                        splatOutActive = false;
                    } else {
                        splatWithRadius(splatOutX, splatOutY, splatOutDx * 0.9, splatOutDy * 0.9, splatOutColor, config.SPLAT_RADIUS * outMult);
                        splatOutDx *= 0.9;
                        splatOutDy *= 0.9;
                    }
                }
                
                if (recEnabled) {
                    recUpdatePlayback();
                }
                
                // Disable blend for physics passes (pure overwrite, no alpha needed)
                gl.disable(gl.BLEND);
                
                advectionProg.bind();
                // Velocity advection at physics resolution
                gl.viewport(0, 0, simTexWidth, simTexHeight);
                gl.uniform2f(advectionProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1f(advectionProg.uniforms.dt, dt);
                
                // Velocity pass
                gl.uniform1i(advectionProg.uniforms.isDensity, 0);
                gl.uniform1i(advectionProg.uniforms.uVelocity, 0);
                gl.uniform1i(advectionProg.uniforms.uSource, 0);
                gl.uniform1f(advectionProg.uniforms.dissipation, config.VELOCITY_DISSIPATION);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(velocity.write.fbo);
                velocity.swap();
                
                // Density pass (advected by velocity field at sim resolution)
                gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                gl.uniform2f(advectionProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1i(advectionProg.uniforms.isDensity, 1);
                gl.uniform1i(advectionProg.uniforms.uVelocity, 0);
                gl.uniform1i(advectionProg.uniforms.uSource, 1);
                gl.uniform1f(advectionProg.uniforms.dissipation, config.DENSITY_DISSIPATION);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
                blit(density.write.fbo);
                density.swap();
                
                // Use turbulence or curl based on toggle
                const useTurbulence = window.useTurbulenceMode || false;
                const curlProgram = useTurbulence ? turbulenceProg : curlProg;
                
                curlProgram.bind();
                gl.viewport(0, 0, simTexWidth, simTexHeight);
                gl.uniform2f(curlProgram.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1i(curlProgram.uniforms.uVelocity, 0);
                if (useTurbulence) {
                    gl.uniform1f(curlProgram.uniforms.time, performance.now() * 0.001);
                }
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(curl.fbo);
                
                vorticityProg.bind();
                gl.uniform2f(vorticityProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1i(vorticityProg.uniforms.uVelocity, 0);
                gl.uniform1i(vorticityProg.uniforms.uCurl, 1);
                gl.uniform1f(vorticityProg.uniforms.curl, config.CURL);
                gl.uniform1f(vorticityProg.uniforms.dt, dt);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, curl.texture);
                blit(velocity.write.fbo);
                velocity.swap();
                
                divergenceProg.bind();
                gl.uniform2f(divergenceProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1i(divergenceProg.uniforms.uVelocity, 0);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(divergence.fbo);
                
                clearProg.bind();
                gl.uniform1i(clearProg.uniforms.uTexture, 0);
                gl.uniform1f(clearProg.uniforms.value, config.PRESSURE_DISSIPATION);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
                blit(pressure.write.fbo);
                pressure.swap();
                
                pressureProg.bind();
                gl.uniform2f(pressureProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1i(pressureProg.uniforms.uDivergence, 0);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, divergence.texture);
                
                for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
                    gl.uniform1i(pressureProg.uniforms.uPressure, 1);
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
                    blit(pressure.write.fbo);
                    pressure.swap();
                }
                
                gradientProg.bind();
                gl.uniform2f(gradientProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1i(gradientProg.uniforms.uPressure, 0);
                gl.uniform1i(gradientProg.uniforms.uVelocity, 1);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(velocity.write.fbo);
                velocity.swap();
                
                // Obstacle damping pass — runs only when collision layers are active.
                // Completely separate from the core physics shaders.
                if (window.collisionLayers && window.collisionLayers.enabled && obstacle) {
                    obstacleDampProg.bind();
                    gl.uniform1i(obstacleDampProg.uniforms.uVelocity, 0);
                    gl.uniform1i(obstacleDampProg.uniforms.uObstacle, 1);
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, obstacle.texture);
                    blit(velocity.write.fbo);
                    velocity.swap();
                }
                
                // Re-enable blend for post-processing and display passes
                gl.enable(gl.BLEND);
            }
            
            // Apply sharpness pass if enabled (config.SHARPNESS > 0)
            const sharpnessEnabled = config.SHARPNESS > 0;
            let displayTexture = density.read.texture;
            
            if (sharpnessEnabled) {
                gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                sharpenProg.bind();
                gl.uniform1i(sharpenProg.uniforms.uTexture, 0);
                gl.uniform1i(sharpenProg.uniforms.uVelocity, 1);
                gl.uniform1f(sharpenProg.uniforms.sharpness, config.SHARPNESS);
                gl.uniform2f(sharpenProg.uniforms.texelSize, 1.0 / dyeTexWidth, 1.0 / dyeTexHeight);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(sharpened.fbo);
                displayTexture = sharpened.texture;
            }
            
            // Apply micro detail pass if clarity or vibrance is active
            const mdClarity = config.CLARITY || 0;
            const mdVibrance = config.VIBRANCE || 0;
            const microDetailEnabled = mdClarity > 0 || mdVibrance > 0;
            
            if (microDetailEnabled) {
                gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                microDetailProg.bind();
                gl.uniform1i(microDetailProg.uniforms.uTexture, 0);
                gl.uniform1i(microDetailProg.uniforms.uVelocity, 1);
                gl.uniform2f(microDetailProg.uniforms.texelSize, 1.0 / dyeTexWidth, 1.0 / dyeTexHeight);
                gl.uniform1f(microDetailProg.uniforms.clarity, mdClarity);
                gl.uniform1f(microDetailProg.uniforms.vibrance, mdVibrance);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, displayTexture);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(detailed.fbo);
                displayTexture = detailed.texture;
            }
            
            // Apply lighting pass if enabled
            const lightingEnabled = window.lightSource && window.lightSource.enabled;
            if (lightingEnabled) {
                gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                lightingProg.bind();
                gl.uniform1i(lightingProg.uniforms.uTexture, 0);
                gl.uniform1i(lightingProg.uniforms.uVelocity, 1);
                gl.uniform2f(lightingProg.uniforms.lightPos, 
                    window.lightSource.x || 0.5, 
                    1.0 - (window.lightSource.y || 0.5)); // Flip Y for GL coords
                gl.uniform1f(lightingProg.uniforms.intensity, window.lightSource.intensity || 0.5);
                gl.uniform1f(lightingProg.uniforms.ambient, window.lightSource.ambient || 0.3);
                gl.uniform2f(lightingProg.uniforms.texelSize, 1.0 / dyeTexWidth, 1.0 / dyeTexHeight);
                
                // Light Shift uniforms
                const lightShiftEnabled = window.lightShift && window.lightShift.enabled && window.lightShift.colorPath.length > 0;
                gl.uniform1i(lightingProg.uniforms.lightShiftEnabled, lightShiftEnabled ? 1 : 0);
                if (lightShiftEnabled) {
                    const shiftColor = window.lightShift.getCurrentColor();
                    gl.uniform3f(lightingProg.uniforms.lightShiftColor, shiftColor.r, shiftColor.g, shiftColor.b);
                    gl.uniform1f(lightingProg.uniforms.lightShiftThreshold, window.lightShift.threshold || 0.85);
                    gl.uniform1f(lightingProg.uniforms.lightShiftIntensity, window.lightShift.intensity || 0.5);
                    
                    // Blend mode: convert string to int
                    const modeMap = { 'replace': 0, 'tint': 1, 'overlay': 2, 'multiply': 3, 'screen': 4, 'add': 5 };
                    const modeInt = modeMap[window.lightShift.mode] || 0;
                    gl.uniform1i(lightingProg.uniforms.lightShiftMode, modeInt);
                }
                
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, displayTexture);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
                blit(lit.fbo);
                displayTexture = lit.texture;
            }
            // If light shift is enabled but lighting is NOT, apply standalone light shift
            else {
                const lightShiftEnabled = window.lightShift && window.lightShift.enabled && window.lightShift.colorPath.length > 0;
                if (lightShiftEnabled) {
                    gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
                    lightShiftProg.bind();
                    gl.uniform1i(lightShiftProg.uniforms.uTexture, 0);
                    
                    const shiftColor = window.lightShift.getCurrentColor();
                    gl.uniform3f(lightShiftProg.uniforms.lightShiftColor, shiftColor.r, shiftColor.g, shiftColor.b);
                    gl.uniform1f(lightShiftProg.uniforms.lightShiftThreshold, window.lightShift.threshold || 0.85);
                    gl.uniform1f(lightShiftProg.uniforms.lightShiftIntensity, window.lightShift.intensity || 0.5);
                    
                    // Blend mode: convert string to int
                    const modeMap = { 'replace': 0, 'tint': 1, 'overlay': 2, 'multiply': 3, 'screen': 4, 'add': 5 };
                    const modeInt = modeMap[window.lightShift.mode] || 0;
                    gl.uniform1i(lightShiftProg.uniforms.lightShiftMode, modeInt);
                    
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, displayTexture);
                    blit(lightShifted.fbo);
                    displayTexture = lightShifted.texture;
                }
            }
            
            gl.viewport(0, 0, canvas.width, canvas.height);
            displayProg.bind();
            gl.uniform1i(displayProg.uniforms.uTexture, 0);
            gl.uniform1f(displayProg.uniforms.preserveOpacity, window.preserveFluidOpacity ? 1.0 : 0.0);
            gl.uniform1f(displayProg.uniforms.backgroundTransparency, window.backgroundTransparency || 0.0);
            gl.uniform1f(displayProg.uniforms.kaleidoEnabled, window.kaleidoEnabled ? 1.0 : 0.0);
            gl.uniform1f(displayProg.uniforms.segments, (window.kaleidoSegments || 1));
            gl.uniform1i(
                displayProg.uniforms.kMode,
                (typeof window.kaleidoMode === 'number' && isFinite(window.kaleidoMode)) ? window.kaleidoMode : 1
            );
            gl.uniform1f(displayProg.uniforms.kAngle, window.kAngle || 0.0);
            gl.uniform1f(displayProg.uniforms.kTwist, window.kTwist || 0.0);
            gl.uniform1f(displayProg.uniforms.kZoom, window.kZoom || 1.0);
            gl.uniform1f(
                displayProg.uniforms.kBlend,
                (typeof window.kBlend === 'number' && isFinite(window.kBlend)) ? window.kBlend : 1.0
            );
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, displayTexture);
            blit(null);
            
            // ─── Stats update (ring buffer, zero-GC) ──────────────────
            pushFrameTimestamp(nowMs);
            const fpsVal = countRecentFrames(nowMs);
            const frametimeMs = getLastFrameTime();
            const cpuMs = performance.now() - cpuStart;
            const targetFps = cap > 0 ? cap : displayHz;
            const budgetMs = 1000 / targetFps;
            const budgetPct = Math.min((cpuMs / budgetMs) * 100, 999);
            window.__stats = {
                fps: fpsVal,
                frametime: frametimeMs,
                lastCpuMs: cpuMs,
                targetFps: cap > 0 ? cap : 0,
                displayHz: displayHz,
                budgetPct: budgetPct
            };

            requestAnimationFrame(update);
        }
        
        function renderLayers() {
            // Ensure all layers have mask property
            if (typeof ensureLayerMasks === 'function') {
                ensureLayerMasks();
            }
            
            const panel = document.getElementById('layersPanel');
            panel.innerHTML = '';
            
            // layerOrder is in visual order: index 0 = top (closest to viewer), last = bottom (furthest)
            // We'll assign z-indices in reverse: top items get highest z-index
            
            // Add top drop zone
            const topZone = document.createElement('div');
            topZone.className = 'drop-zone';
            topZone.dataset.dropPosition = 'top';
            topZone.textContent = '↑ Drop here for top (closest to viewer)';
            topZone.addEventListener('dragover', handleDropZoneDragOver);
            topZone.addEventListener('drop', handleDropZoneDrop);
            topZone.addEventListener('dragleave', handleDragLeave);
            panel.appendChild(topZone);
            
            // Render all items in layerOrder
            layerOrder.forEach((item, idx) => {
                const element = document.createElement('div');
                element.className = 'layer-item';
                // Only header is draggable; the whole item is NOT draggable to avoid slider conflicts
                element.draggable = false;
                element.dataset.orderIndex = idx; // Store position in order array
                
                if (item.type === 'sim') {
                    element.dataset.layerType = 'sim';
                    element.innerHTML = `
                        <div class="layer-item-header">
                            <div class="layer-thumbnail" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; font-size: 20px;">
                                🌊
                            </div>
                            <div class="layer-info">
                                <input type="text" class="layer-title" value="Sim Layer" readonly>
                            </div>
                            <div class="layer-controls">
                                <button class="layer-btn" onclick="toggleSimLayer()">${canvas.style.display !== 'none' ? '👁️' : '👁️‍🗨️'}</button>
                            </div>
                        </div>
                    `;
                    const headerElSim = element.querySelector('.layer-item-header');
                    if (headerElSim) headerElSim.draggable = true;
                    const titleInput = element.querySelector('.layer-title');
                    if (titleInput) {
                        const prev = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
                        ['dragstart','mousedown','pointerdown','touchstart'].forEach(evt => titleInput.addEventListener(evt, prev, { capture: true }));
                    }
                } else {
                    const layer = layers.find(l => l.index === item.id);
                    if (!layer) return; // Skip if layer not found
                    
                    element.dataset.layerIndex = layer.index;
                    if (layer.active) {
                        element.classList.add('active-layer');
                    }
                    
                    const hasMask = layer.mask?.shapes?.length > 0;
                    element.innerHTML = `
                        <div class="layer-item-header">
                            <div class="layer-thumbnail" style="background-image: url(${layer.data})"></div>
                            <div class="layer-info">
                                <input type="text" class="layer-title" value="${layer.title}" 
                                       onchange="updateLayerTitle(${layer.index}, this.value)">
                            </div>
                            <div class="layer-controls">
                                <button class="layer-btn" onclick="toggleActiveLayer(${layer.index})" title="${layer.active ? 'Deactivate positioning' : 'Activate positioning'}">
                                    ${layer.active ? '🎯' : '⭕'}
                                </button>
                                <button class="layer-btn" onclick="toggleLayer(${layer.index})">
                                    ${layer.visible ? '👁️' : '👁️‍🗨️'}
                                </button>
                                <button class="layer-btn layer-mask-btn ${hasMask ? 'has-mask' : ''} ${layer.mask?.enabled ? 'active' : ''}" onclick="toggleImageLayerMask(${layer.index})" title="${hasMask ? (layer.mask?.enabled ? 'Disable Mask' : 'Enable Mask') : 'No mask defined'}">✂️</button>
                                <button class="layer-btn" onclick="deleteLayer(${layer.index})">🗑️</button>
                            </div>
                        </div>
                        ${hasMask ? `
                        <div class="layer-mask-controls" style="display:flex; gap:6px; margin-bottom:6px; align-items:center; flex-wrap:wrap;">
                            <button class="mask-control-btn" onclick="editImageLayerMask(${layer.index})" title="Edit Mask">✏️ Edit Mask</button>
                            <button class="mask-control-btn mask-clear-btn" onclick="clearImageLayerMask(${layer.index})" title="Clear Mask">🗑️ Clear</button>
                            <span style="font-size:11px; opacity:0.7;">${layer.mask.shapes.length} shape${layer.mask.shapes.length !== 1 ? 's' : ''}</span>
                        </div>
                        ` : `
                        <div class="layer-mask-controls" style="display:flex; gap:6px; margin-bottom:6px;">
                            <button class="mask-control-btn mask-create-btn" onclick="editImageLayerMask(${layer.index})" title="Create Mask">✂️ Create Mask</button>
                        </div>
                        `}
                        <div class="layer-threshold">
                            <span>${hasMask ? 'Feather:' : 'Mask:'}</span>
                            <div class="layer-slider-host"></div>
                            <span class="layer-slider-value">${layer.threshold}%</span>
                        </div>
                        ${!layer.isCollision ? `
                        <div style="margin-bottom:6px;">
                            <button class="mask-control-btn" onclick="collisionFromMask(${layer.index})" title="Generate collision layer from current mask or threshold" style="width:100%;background:rgba(255,160,60,0.13);border-color:rgba(255,160,60,0.35);text-align:center;">🧱 Generate Collision Layer</button>
                        </div>
                        ` : ''}
                        ${layer.isCollision ? `
                        <div class="collision-controls" data-collision-layer="${layer.index}">
                            <div class="collision-row">
                                <label class="collision-label">Mode</label>
                                <select class="collision-mode-select" data-ci="${layer.index}">
                                    <option value="block" ${layer.collisionMode === 'block' ? 'selected' : ''}>Block</option>
                                    <option value="slow" ${layer.collisionMode === 'slow' ? 'selected' : ''}>Slow</option>
                                    <option value="deflect" ${layer.collisionMode === 'deflect' ? 'selected' : ''}>Deflect</option>
                                </select>
                            </div>
                            <div class="collision-row">
                                <label class="collision-label">Strength</label>
                                <div class="collision-slider-host" data-cs="${layer.index}"></div>
                                <span class="collision-strength-val">${(layer.collisionStrength || 0.7).toFixed(1)}</span>
                            </div>
                            <div class="collision-row">
                                <label class="collision-label">Threshold</label>
                                <div class="collision-slider-host" data-ct="${layer.index}"></div>
                                <span class="collision-threshold-val">${layer.mask?.shapes?.[0]?.threshold || 128}</span>
                            </div>
                            <div class="collision-row">
                                <label class="collision-toggle"><input type="checkbox" class="collision-invert-cb" data-cinv="${layer.index}" ${layer.mask?.shapes?.[0]?.invert ? 'checked' : ''}> Invert</label>
                                <button type="button" class="collision-refresh-btn" data-cref="${layer.index}" title="Re-run depth estimation">🔄</button>
                            </div>
                        </div>
                        ` : ''}
                    `;
                    
                    // Create encapsulated slider in host
                    const host = element.querySelector('.layer-slider-host');
                    const valueEl = element.querySelector('.layer-slider-value');
                    const headerEl = element.querySelector('.layer-item-header');
                    if (headerEl) headerEl.draggable = true;
                    if (host && valueEl) {
                        const slider = buildEncapsulatedRange({ min: 0, max: 100, value: layer.threshold, step: 1, className: 'encapsulated-slider slider-gray' });
                        host.appendChild(slider);
                        slider.addEventListener('input', () => {
                            valueEl.textContent = slider.value + '%';
                            updateLayerThreshold(layer.index, slider.value);
                        });
                        // Temporarily disable parent draggable while interacting with slider to avoid HTML5 DnD starting
                        const itemEl = element; // .layer-item
                        const disable = () => { isLayerSliderActive = true; if (headerEl) headerEl.draggable = false; if (itemEl) itemEl.dataset.sliderActive = '1'; };
                        const enable = () => { isLayerSliderActive = false; if (headerEl) headerEl.draggable = true; if (itemEl) delete itemEl.dataset.sliderActive; };
                        ['pointerdown','mousedown','touchstart'].forEach(evt => slider.addEventListener(evt, disable, { passive: true }));
                        ['pointerup','pointercancel','mouseup','touchend','touchcancel'].forEach(evt => slider.addEventListener(evt, enable, { passive: true }));
                    }

                    // Wire collision controls if present
                    if (layer.isCollision) {
                        // Mode select
                        const modeSelect = element.querySelector('.collision-mode-select');
                        if (modeSelect) {
                            modeSelect.addEventListener('change', (e) => {
                                e.stopPropagation();
                                layer.collisionMode = e.target.value;
                                if (window.collisionLayers) window.collisionLayers.updateObstacleFromLayers();
                            });
                            modeSelect.addEventListener('mousedown', (e) => e.stopPropagation());
                        }

                        // Strength slider
                        const strengthHost = element.querySelector('[data-cs="' + layer.index + '"]');
                        const strengthVal = element.querySelector('.collision-strength-val');
                        if (strengthHost) {
                            const sSlider = buildEncapsulatedRange({ min: 0, max: 100, value: Math.round((layer.collisionStrength || 0.7) * 100), step: 1, className: 'encapsulated-slider slider-orange' });
                            strengthHost.appendChild(sSlider);
                            sSlider.addEventListener('input', () => {
                                const v = parseInt(sSlider.value) / 100;
                                layer.collisionStrength = v;
                                if (strengthVal) strengthVal.textContent = v.toFixed(1);
                                if (window.collisionLayers) window.collisionLayers.updateObstacleFromLayers();
                            });
                            const dis = () => { isLayerSliderActive = true; if (headerEl) headerEl.draggable = false; };
                            const en = () => { isLayerSliderActive = false; if (headerEl) headerEl.draggable = true; };
                            ['pointerdown','mousedown','touchstart'].forEach(evt => sSlider.addEventListener(evt, dis, { passive: true }));
                            ['pointerup','pointercancel','mouseup','touchend','touchcancel'].forEach(evt => sSlider.addEventListener(evt, en, { passive: true }));
                        }

                        // Threshold slider
                        const threshHost = element.querySelector('[data-ct="' + layer.index + '"]');
                        const threshVal = element.querySelector('.collision-threshold-val');
                        if (threshHost) {
                            const depthShape = layer.mask?.shapes?.find(s => s.type === 'depth-mask');
                            const tSlider = buildEncapsulatedRange({ min: 0, max: 255, value: depthShape?.threshold || 128, step: 1, className: 'encapsulated-slider slider-orange' });
                            threshHost.appendChild(tSlider);
                            tSlider.addEventListener('input', () => {
                                const v = parseInt(tSlider.value);
                                if (threshVal) threshVal.textContent = v;
                                if (depthShape) depthShape.threshold = v;
                                if (window.collisionLayers) window.collisionLayers.updateObstacleFromLayers();
                            });
                            const dis = () => { isLayerSliderActive = true; if (headerEl) headerEl.draggable = false; };
                            const en = () => { isLayerSliderActive = false; if (headerEl) headerEl.draggable = true; };
                            ['pointerdown','mousedown','touchstart'].forEach(evt => tSlider.addEventListener(evt, dis, { passive: true }));
                            ['pointerup','pointercancel','mouseup','touchend','touchcancel'].forEach(evt => tSlider.addEventListener(evt, en, { passive: true }));
                        }

                        // Invert checkbox — stop propagation on all pointer/click events
                        // to prevent parent drag handlers from eating the interaction
                        const invertCb = element.querySelector('.collision-invert-cb');
                        const invertLabel = element.querySelector('.collision-toggle');
                        if (invertCb) {
                            const stopProp = (ev) => ev.stopPropagation();
                            ['click', 'mousedown', 'pointerdown', 'touchstart'].forEach(evt => {
                                invertCb.addEventListener(evt, stopProp);
                                if (invertLabel) invertLabel.addEventListener(evt, stopProp);
                            });
                            invertCb.addEventListener('change', () => {
                                const depthShape = layer.mask?.shapes?.find(s => s.type === 'depth-mask');
                                if (depthShape) depthShape.invert = invertCb.checked;
                                if (window.collisionLayers) window.collisionLayers.updateObstacleFromLayers();
                            });
                        }

                        // Refresh button
                        const refreshBtn = element.querySelector('.collision-refresh-btn');
                        if (refreshBtn) {
                            refreshBtn.addEventListener('click', (e) => {
                                e.stopPropagation();
                                if (window.collisionLayers) window.collisionLayers.refreshDepth(layer.index);
                            });
                        }
                    }
                }
                
                // Only start drags from the header
                const headerEl = element.querySelector('.layer-item-header');
                if (headerEl) headerEl.addEventListener('dragstart', handleDragStart);
                // Guard: block dragstart initiated anywhere else in the item (capture)
                element.addEventListener('dragstart', (e) => {
                    if (isLayerSliderActive || !(e.target && e.target.closest && e.target.closest('.layer-item-header'))) { e.preventDefault(); e.stopPropagation(); }
                }, true);
                // Guard: prevent header text input from initiating drags
                const titleInput = element.querySelector('.layer-title');
                if (titleInput) {
                    const prev = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
                    ['dragstart','mousedown','pointerdown','touchstart'].forEach(evt => titleInput.addEventListener(evt, prev, { capture: true }));
                }
                element.addEventListener('dragover', handleDragOver);
                element.addEventListener('drop', handleDrop);
                element.addEventListener('dragend', handleDragEnd);
                element.addEventListener('dragleave', handleDragLeave);
                
                panel.appendChild(element);
            });
            
            // Add bottom drop zone
            const bottomZone = document.createElement('div');
            bottomZone.className = 'drop-zone';
            bottomZone.dataset.dropPosition = 'bottom';
            bottomZone.textContent = '↓ Drop here for bottom (furthest from viewer)';
            bottomZone.addEventListener('dragover', handleDropZoneDragOver);
            bottomZone.addEventListener('drop', handleDropZoneDrop);
            bottomZone.addEventListener('dragleave', handleDragLeave);
            panel.appendChild(bottomZone);
            
            updateLayerZIndices();
        }
        
        let draggedElement = null;
        let isLayerSliderActive = false;
        let layerDragGuardInstalled = false;
        if (!layerDragGuardInstalled) {
            document.addEventListener('dragstart', (e) => {
                if (isLayerSliderActive) { e.preventDefault(); e.stopPropagation(); }
            }, true);
            document.addEventListener('selectstart', (e) => {
                if (isLayerSliderActive) { e.preventDefault(); e.stopPropagation(); }
            }, true);
            layerDragGuardInstalled = true;
        }
        
        function handleDragStart(e) {
            // If slider is active on this item, cancel
            const item = (e.currentTarget && e.currentTarget.closest) ? e.currentTarget.closest('.layer-item') : null;
            if (item && item.dataset.sliderActive === '1') { e.preventDefault(); return; }
            // Do not start drag from interactive controls
            if (e.target && e.target.closest && (e.target.closest('button') || e.target.closest('input') || e.target.closest('select'))) { e.preventDefault(); return; }
            draggedElement = item || this;
            if (draggedElement && draggedElement.classList) draggedElement.classList.add('dragging');
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        }
        
        function handleDragOver(e) {
            if (e.preventDefault) e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const target = e.target.closest('.layer-item');
            if (target && target !== draggedElement) {
                target.classList.add('drag-over');
            }
            return false;
        }
        
        function handleDragLeave(e) {
            const target = e.target.closest('.layer-item');
            if (target) target.classList.remove('drag-over');
        }
        
        function handleDrop(e) {
            if (e.stopPropagation) e.stopPropagation();
            e.preventDefault();
            
            const target = e.target.closest('.layer-item');
            if (!target || !draggedElement || draggedElement === target) {
                if (target) target.classList.remove('drag-over');
                return false;
            }
            
            const draggedOrderIndex = parseInt(draggedElement.dataset.orderIndex);
            const targetOrderIndex = parseInt(target.dataset.orderIndex);
            
            // Simple reordering: remove from old position, insert at target position
            const [draggedItem] = layerOrder.splice(draggedOrderIndex, 1);
            layerOrder.splice(targetOrderIndex, 0, draggedItem);
            
            renderLayers();
            target.classList.remove('drag-over');
            return false;
        }
        
        function handleDragEnd(e) {
            this.classList.remove('dragging');
            document.querySelectorAll('.layer-item, .drop-zone').forEach(item => {
                item.classList.remove('drag-over');
            });
        }
        
        function handleDropZoneDragOver(e) {
            if (e.preventDefault) e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            this.classList.add('drag-over');
            return false;
        }
        
        function handleDropZoneDrop(e) {
            if (e.stopPropagation) e.stopPropagation();
            e.preventDefault();
            
            const dropPosition = this.dataset.dropPosition;
            const draggedOrderIndex = parseInt(draggedElement.dataset.orderIndex);
            
            // Remove from current position
            const [draggedItem] = layerOrder.splice(draggedOrderIndex, 1);
            
            if (dropPosition === 'top') {
                // Add to beginning (top = closest to viewer = highest z-index)
                layerOrder.unshift(draggedItem);
            } else if (dropPosition === 'bottom') {
                // Add to end (bottom = furthest from viewer = lowest z-index)
                layerOrder.push(draggedItem);
            }
            
            renderLayers();
            this.classList.remove('drag-over');
            return false;
        }
        
        // Build a slider that doesn't bubble events (encapsulated component)
        function buildEncapsulatedRange({ min = 0, max = 100, value = 0, step = 1, className = '' } = {}) {
            const input = document.createElement('input');
            input.type = 'range';
            input.min = String(min);
            input.max = String(max);
            input.step = String(step);
            input.value = String(value);
            input.className = className || '';
            input.setAttribute('draggable', 'false');
            // Prevent bubbling into layer drag/resize
            const stop = (ev) => { ev.stopPropagation(); };
            const stopAndPrevent = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
            ['mousedown','mouseup','click','dblclick','pointerdown','pointerup','pointermove','touchstart','touchmove','touchend','wheel','dragstart','contextmenu','keydown','keyup'].forEach(evt => {
                input.addEventListener(evt, evt === 'wheel' || evt === 'dragstart' ? stopAndPrevent : stop, { passive: false });
            });
            return input;
        }

        function updateLayerZIndices() {
            // layerOrder[0] = top (closest to viewer) = highest z-index
            // layerOrder[last] = bottom (furthest from viewer) = lowest z-index
            // We assign z-indices in reverse order of the array
            
            const BASE_Z_INDEX = 1000;
            
            layerOrder.forEach((item, visualIndex) => {
                // Higher visual index = lower in list = further from viewer = lower z-index
                const zIndex = BASE_Z_INDEX - visualIndex;
                
                if (item.type === 'sim') {
                    canvas.style.zIndex = zIndex;
                } else {
                    const layer = layers.find(l => l.index === item.id);
                    if (layer) {
                        const layerDiv = document.getElementById(`layer${layer.index}`);
                        if (layerDiv) {
                            layerDiv.style.zIndex = zIndex;
                            layerDiv.style.display = layer.visible ? 'block' : 'none';
                            
                            // Ensure all transform properties have default values
                            const x = layer.x || 0;
                            const y = layer.y || 0;
                            const scaleX = layer.scaleX || 1;
                            const scaleY = layer.scaleY || 1;
                            const rotation = layer.rotation || 0;
                            
                            layerDiv.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scaleX}, ${scaleY})`;
                            
                            // Apply active class
                            if (layer.active) {
                                layerDiv.classList.add('active');
                            } else {
                                layerDiv.classList.remove('active');
                            }
                            
                            // Reapply mask / threshold so visual state survives reorder
                            const hasMask = layer.mask?.shapes?.length > 0;
                            if (hasMask && layer.mask.enabled) {
                                applyLayerMask(layer.index);
                            } else if (layer.threshold > 0) {
                                applyRudimentaryMask(layer.index);
                            } else {
                                applyLayerMask(layer.index);
                            }
                        }
                    }
                }
            });
        }
        
        window.toggleSimLayer = () => {
            const isVisible = canvas.style.display !== 'none';
            canvas.style.display = isVisible ? 'none' : 'block';
            renderLayers();
        };
        
        window.toggleLayer = (index) => {
            const layer = layers.find(l => l.index === index);
            if (layer) {
                layer.visible = !layer.visible;
                const layerDiv = document.getElementById(`layer${index}`);
                layerDiv.style.display = layer.visible ? 'block' : 'none';
                renderLayers();
            }
        };
        
        window.deleteLayer = (index) => {
            const layerDiv = document.getElementById(`layer${index}`);
            if (layerDiv) {
                layerDiv.style.backgroundImage = '';
                layerDiv.style.display = 'none';
                layerDiv.style.zIndex = '';
                layerDiv.classList.remove('active');
            }
            
            // Remove from layers array
            layers = layers.filter(l => l.index !== index);
            window.layers = layers;
            
            // Remove from layerOrder array
            layerOrder = layerOrder.filter(item => !(item.type === 'layer' && item.id === index));
            window.layerOrder = layerOrder;
            
            // Re-render and update z-indices
            renderLayers();
        };
        
        // Image layer mask functions
        window.toggleImageLayerMask = (index) => {
            const layer = layers.find(l => l.index === index);
            if (layer && layer.mask) {
                layer.mask.enabled = !layer.mask.enabled;
                applyLayerMask(index);
                renderLayers();
            }
        };
        
        window.editImageLayerMask = (index) => {
            if (typeof window.enterImageLayerMaskMode === 'function') {
                window.enterImageLayerMaskMode(index);
            }
        };
        
        window.collisionFromMask = (index) => {
            if (window.collisionLayers && typeof window.collisionLayers.createFromLayerMask === 'function') {
                window.collisionLayers.createFromLayerMask(index);
            } else {
                console.warn('Collision system not available');
            }
        };
        
        window.clearImageLayerMask = (index) => {
            const layer = layers.find(l => l.index === index);
            if (layer && layer.mask) {
                if (confirm('Clear mask for this layer?')) {
                    layer.mask.shapes = [];
                    layer.mask.enabled = false;
                    renderLayers();
                }
            }
        };
        
        // Layer positioning functionality
        let activeLayerIndex = null;
        let isDraggingLayer = false;
        let layerDragStartX = 0;
        let layerDragStartY = 0;
        let layerStartX = 0;
        let layerStartY = 0;
        
        window.toggleActiveLayer = (index) => {
            const layer = layers.find(l => l.index === index);
            if (!layer) return;
            
            // Deactivate all other layers and remove their handles
            layers.forEach(l => {
                if (l.index !== index) {
                    l.active = false;
                    const div = document.getElementById(`layer${l.index}`);
                    if (div) {
                        div.classList.remove('active');
                        removeLayerResizeHandles(l.index);
                    }
                }
            });
            
            // Toggle this layer
            layer.active = !layer.active;
            const layerDiv = document.getElementById(`layer${index}`);
            
            if (layer.active) {
                layerDiv.classList.add('active');
                activeLayerIndex = index;
                createLayerResizeHandles(index);
                // Don't disable canvas pointer events just for selecting layer
                // Only disable when actually dragging/resizing
            } else {
                layerDiv.classList.remove('active');
                activeLayerIndex = null;
                removeLayerResizeHandles(index);
                // Re-enable canvas pointer events when deactivating
                canvas.style.pointerEvents = 'auto';
            }
            
            renderLayers();
        };
        
        function disablePointerEventsExceptActive(activeIndex) {
            canvas.style.pointerEvents = 'none';
            
            layers.forEach(l => {
                const div = document.getElementById(`layer${l.index}`);
                if (div && l.index !== activeIndex) {
                    div.style.pointerEvents = 'none';
                }
            });
        }
        
        function enableAllPointerEvents() {
            canvas.style.pointerEvents = 'auto';
            
            layers.forEach(l => {
                const div = document.getElementById(`layer${l.index}`);
                if (div) {
                    div.style.pointerEvents = l.visible ? 'none' : 'none';
                }
            });
        }
        
        function createLayerResizeHandles(index) {
            const layerDiv = document.getElementById(`layer${index}`);
            if (!layerDiv) return;
            
            // Remove any existing handles first
            removeLayerResizeHandles(index);
            
            const handles = [
                { class: 'corner layer-resize-nw', dir: 'nw' },
                { class: 'edge layer-resize-n', dir: 'n' },
                { class: 'corner layer-resize-ne', dir: 'ne' },
                { class: 'edge layer-resize-e', dir: 'e' },
                { class: 'corner layer-resize-se', dir: 'se' },
                { class: 'edge layer-resize-s', dir: 's' },
                { class: 'corner layer-resize-sw', dir: 'sw' },
                { class: 'edge layer-resize-w', dir: 'w' }
            ];
            
            handles.forEach(handle => {
                const div = document.createElement('div');
                div.className = `layer-resize-handle ${handle.class}`;
                div.dataset.direction = handle.dir;
                div.dataset.layerIndex = index;
                div.style.touchAction = 'none';
                div.style.userSelect = 'none';
                div.addEventListener('pointerdown', handleLayerResizeStart);
                layerDiv.appendChild(div);
            });
            
            const rotateHandle = document.createElement('div');
            rotateHandle.className = 'layer-rotate-handle';
            rotateHandle.dataset.layerIndex = index;
            rotateHandle.style.touchAction = 'none';
            rotateHandle.style.userSelect = 'none';
            rotateHandle.innerHTML = '🔄';
            rotateHandle.addEventListener('pointerdown', handleLayerRotateStart);
            layerDiv.appendChild(rotateHandle);
        }
        
        function removeLayerResizeHandles(index) {
            const layerDiv = document.getElementById(`layer${index}`);
            if (!layerDiv) return;
            
            const handles = layerDiv.querySelectorAll('.layer-resize-handle, .layer-rotate-handle');
            handles.forEach(handle => handle.remove());
        }
        
        // Layer resize functionality
        let isResizingLayer = false;
        let layerResizeDirection = null;
        let resizeLayerIndex = null;
        let layerResizeStartX = 0;
        let layerResizeStartY = 0;
        let layerResizeStartScaleX = 1;
        
        // Layer rotation functionality
        let isRotatingLayer = false;
        let rotateLayerIndex = null;
        let layerRotateStartAngle = 0;
        let layerRotateStartRotation = 0;
        let layerRotatePointerId = null;
        let layerRotateHandleEl = null;
        let layerResizeStartScaleY = 1;
        let layerResizeStartPosX = 0;
        let layerResizeStartPosY = 0;
        let layerResizePointerId = null;
        let layerResizeHandleEl = null;
        
        function handleLayerResizeStart(e) {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            
            isResizingLayer = true;
            layerResizeDirection = e.target.dataset.direction;
            resizeLayerIndex = parseInt(e.target.dataset.layerIndex);
            layerResizePointerId = e.pointerId;
            layerResizeHandleEl = e.currentTarget || e.target;
            try { if (layerResizeHandleEl && layerResizeHandleEl.setPointerCapture) layerResizeHandleEl.setPointerCapture(e.pointerId); } catch (_) {}
            
            const layer = layers.find(l => l.index === resizeLayerIndex);
            if (!layer) return;
            
            layerResizeStartX = e.clientX;
            layerResizeStartY = e.clientY;
            layerResizeStartScaleX = layer.scaleX;
            layerResizeStartScaleY = layer.scaleY;
            layerResizeStartPosX = layer.x;
            layerResizeStartPosY = layer.y;
            
            disablePointerEventsExceptActive(resizeLayerIndex);
        }
        
        function handleLayerRotateStart(e) {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            
            isRotatingLayer = true;
            rotateLayerIndex = parseInt(e.target.dataset.layerIndex);
            layerRotatePointerId = e.pointerId;
            layerRotateHandleEl = e.currentTarget || e.target;
            try { if (layerRotateHandleEl && layerRotateHandleEl.setPointerCapture) layerRotateHandleEl.setPointerCapture(e.pointerId); } catch (_) {}
            
            const layer = layers.find(l => l.index === rotateLayerIndex);
            
            disablePointerEventsExceptActive(rotateLayerIndex);
            if (!layer) return;
            
            const layerDiv = document.getElementById(`layer${rotateLayerIndex}`);
            if (!layerDiv) return;
            
            const rect = layerDiv.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            layerRotateStartAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
            layerRotateStartRotation = layer.rotation || 0;
        }
        
        // Add pointer event listeners to canvas wrapper for layer dragging
        canvasWrapper.style.touchAction = 'none';
        canvasWrapper.addEventListener('pointerdown', (e) => {
            if (e.target && e.target.closest && e.target.closest('input[type="range"]')) return;
            if (activeLayerIndex === null) return;
            
            if (e.target.classList.contains('layer-resize-handle') || e.target.classList.contains('layer-rotate-handle')) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            
            const layer = layers.find(l => l.index === activeLayerIndex);
            if (!layer || !layer.active) return;
            
            const layerDiv = document.getElementById(`layer${activeLayerIndex}`);
            if (!layerDiv) return;
            
            const rect = layerDiv.getBoundingClientRect();
            const clickX = e.clientX;
            const clickY = e.clientY;
            
            if (clickX < rect.left || clickX > rect.right || clickY < rect.top || clickY > rect.bottom) {
                return;
            }
            
            isDraggingLayer = true;
            layerDragStartX = e.clientX;
            layerDragStartY = e.clientY;
            layerStartX = layer.x;
            layerStartY = layer.y;
            layerDragPointerId = e.pointerId;
            layerDragCaptureEl = canvasWrapper;
            try { if (layerDragCaptureEl && layerDragCaptureEl.setPointerCapture) layerDragCaptureEl.setPointerCapture(e.pointerId); } catch (_) {}
            
            layerDiv.classList.add('dragging');
            disablePointerEventsExceptActive(activeLayerIndex);
            
            e.preventDefault();
        });
        
        document.addEventListener('pointermove', (e) => {
            // Handle layer rotation
            if (isRotatingLayer && rotateLayerIndex !== null && (layerRotatePointerId == null || e.pointerId === layerRotatePointerId)) {
                const layer = layers.find(l => l.index === rotateLayerIndex);
                if (!layer) return;
                
                const layerDiv = document.getElementById(`layer${rotateLayerIndex}`);
                if (!layerDiv) return;
                
                const rect = layerDiv.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                
                const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
                const angleDelta = currentAngle - layerRotateStartAngle;
                
                layer.rotation = layerRotateStartRotation + angleDelta;
                updateLayerPosition(rotateLayerIndex);
                return;
            }
            
            // Handle layer resizing
            if (isResizingLayer && resizeLayerIndex !== null && (layerResizePointerId == null || e.pointerId === layerResizePointerId)) {
                const layer = layers.find(l => l.index === resizeLayerIndex);
                if (!layer) return;
                
                const deltaX = e.clientX - layerResizeStartX;
                const deltaY = e.clientY - layerResizeStartY;
                
                const canvasWidth = canvasWrapper.clientWidth;
                const canvasHeight = canvasWrapper.clientHeight;
                
                // Calculate scale change based on direction
                const scaleFactorX = deltaX / canvasWidth;
                const scaleFactorY = deltaY / canvasHeight;
                
                switch (layerResizeDirection) {
                    case 'se': // Bottom-right
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX + scaleFactorX * 2);
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY + scaleFactorY * 2);
                        break;
                    case 'sw': // Bottom-left
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX - scaleFactorX * 2);
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY + scaleFactorY * 2);
                        break;
                    case 'ne': // Top-right
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX + scaleFactorX * 2);
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY - scaleFactorY * 2);
                        break;
                    case 'nw': // Top-left
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX - scaleFactorX * 2);
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY - scaleFactorY * 2);
                        break;
                    case 'e': // Right edge
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX + scaleFactorX * 2);
                        break;
                    case 'w': // Left edge
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX - scaleFactorX * 2);
                        break;
                    case 's': // Bottom edge
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY + scaleFactorY * 2);
                        break;
                    case 'n': // Top edge
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY - scaleFactorY * 2);
                        break;
                }
                
                updateLayerPosition(resizeLayerIndex);
                return;
            }
            
            // Handle layer dragging
            if (!isDraggingLayer || activeLayerIndex === null || (layerDragPointerId != null && e.pointerId !== layerDragPointerId)) return;
            
            const layer = layers.find(l => l.index === activeLayerIndex);
            if (!layer) return;
            
            const deltaX = e.clientX - layerDragStartX;
            const deltaY = e.clientY - layerDragStartY;
            
            layer.x = layerStartX + deltaX;
            layer.y = layerStartY + deltaY;
            
            updateLayerPosition(activeLayerIndex);
        });
        
        document.addEventListener('pointerup', (e) => {
            if (isDraggingLayer && (layerDragPointerId == null || e.pointerId === layerDragPointerId)) {
                isDraggingLayer = false;
                try { if (layerDragCaptureEl && layerDragCaptureEl.releasePointerCapture) layerDragCaptureEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerDragPointerId = null;
                layerDragCaptureEl = null;
                if (activeLayerIndex !== null) {
                    const layerDiv = document.getElementById(`layer${activeLayerIndex}`);
                    if (layerDiv) layerDiv.classList.remove('dragging');
                }
                enableAllPointerEvents();
            }
            if (isResizingLayer && (layerResizePointerId == null || e.pointerId === layerResizePointerId)) {
                isResizingLayer = false;
                layerResizeDirection = null;
                resizeLayerIndex = null;
                try { if (layerResizeHandleEl && layerResizeHandleEl.releasePointerCapture) layerResizeHandleEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerResizePointerId = null;
                layerResizeHandleEl = null;
                enableAllPointerEvents();
            }
            if (isRotatingLayer && (layerRotatePointerId == null || e.pointerId === layerRotatePointerId)) {
                isRotatingLayer = false;
                rotateLayerIndex = null;
                try { if (layerRotateHandleEl && layerRotateHandleEl.releasePointerCapture) layerRotateHandleEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerRotatePointerId = null;
                layerRotateHandleEl = null;
                enableAllPointerEvents();
            }
        });
        document.addEventListener('pointercancel', (e) => {
            if (isDraggingLayer && (layerDragPointerId == null || e.pointerId === layerDragPointerId)) {
                isDraggingLayer = false;
                try { if (layerDragCaptureEl && layerDragCaptureEl.releasePointerCapture) layerDragCaptureEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerDragPointerId = null;
                layerDragCaptureEl = null;
                if (activeLayerIndex !== null) {
                    const layerDiv = document.getElementById(`layer${activeLayerIndex}`);
                    if (layerDiv) layerDiv.classList.remove('dragging');
                }
                enableAllPointerEvents();
            }
            if (isResizingLayer && (layerResizePointerId == null || e.pointerId === layerResizePointerId)) {
                isResizingLayer = false;
                layerResizeDirection = null;
                resizeLayerIndex = null;
                try { if (layerResizeHandleEl && layerResizeHandleEl.releasePointerCapture) layerResizeHandleEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerResizePointerId = null;
                layerResizeHandleEl = null;
                enableAllPointerEvents();
            }
            if (isRotatingLayer && (layerRotatePointerId == null || e.pointerId === layerRotatePointerId)) {
                isRotatingLayer = false;
                rotateLayerIndex = null;
                try { if (layerRotateHandleEl && layerRotateHandleEl.releasePointerCapture) layerRotateHandleEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerRotatePointerId = null;
                layerRotateHandleEl = null;
                enableAllPointerEvents();
            }
        });
        
        function updateLayerPosition(index) {
            const layer = layers.find(l => l.index === index);
            if (!layer) return;
            
            const layerDiv = document.getElementById(`layer${index}`);
            if (!layerDiv) return;
            
            const rotation = layer.rotation || 0;
            layerDiv.style.transform = `translate(${layer.x}px, ${layer.y}px) rotate(${rotation}deg) scale(${layer.scaleX}, ${layer.scaleY})`;
            
            // Apply mask if enabled
            applyLayerMask(index);
        }
        
        // Apply mask to a layer
        window.applyLayerMask = function applyLayerMask(index) {
            const layer = layers.find(l => l.index === index);
            if (!layer) return;
            
            const layerDiv = document.getElementById(`layer${index}`);
            if (!layerDiv) return;
            
            // If mask is not enabled or no shapes, use original image
            if (!layer.mask || !layer.mask.enabled || !layer.mask.shapes || layer.mask.shapes.length === 0) {
                if (layer.originalData) {
                    layerDiv.style.backgroundImage = `url(${layer.originalData})`;
                }
                return;
            }
            
            // Create a canvas to render the masked image
            const maskCanvas = document.createElement('canvas');
            const canvasElement = document.getElementById('canvas');
            maskCanvas.width = canvasElement ? canvasElement.width : 1920;
            maskCanvas.height = canvasElement ? canvasElement.height : 1080;
            const ctx = maskCanvas.getContext('2d');
            
            // Load and draw the original image
            const img = new Image();
            img.onload = () => {
                if (layer.mask.mode === 'show') {
                    // For SHOW mode: Draw shapes first, then composite image on top
                    ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
                    
                    // Draw all mask shapes as white (shapes stored in original canvas coordinates)
                    layer.mask.shapes.forEach(shape => {
                        ctx.fillStyle = 'rgba(255, 255, 255, 1)';
                        
                        // Apply rotation if needed
                        const rotation = shape.rotation || 0;
                        const centerX = shape.x + shape.width / 2;
                        const centerY = shape.y + shape.height / 2;
                        
                        if (rotation !== 0) {
                            ctx.save();
                            ctx.translate(centerX, centerY);
                            ctx.rotate((rotation * Math.PI) / 180);
                            ctx.translate(-centerX, -centerY);
                        }
                        
                        drawMaskShape(ctx, shape);
                        
                        if (rotation !== 0) {
                            ctx.restore();
                        }
                    });
                    
                    // Now composite the image only where shapes exist
                    ctx.globalCompositeOperation = 'source-in';
                    ctx.drawImage(img, 0, 0, maskCanvas.width, maskCanvas.height);
                } else {
                    // For HIDE mode: Draw image first, then cut out shapes
                    ctx.drawImage(img, 0, 0, maskCanvas.width, maskCanvas.height);
                    
                    // Cut out the mask shapes
                    ctx.globalCompositeOperation = 'destination-out';
                    
                    layer.mask.shapes.forEach(shape => {
                        ctx.fillStyle = 'rgba(255, 255, 255, 1)';
                        
                        // Apply rotation if needed
                        const rotation = shape.rotation || 0;
                        const centerX = shape.x + shape.width / 2;
                        const centerY = shape.y + shape.height / 2;
                        
                        if (rotation !== 0) {
                            ctx.save();
                            ctx.translate(centerX, centerY);
                            ctx.rotate((rotation * Math.PI) / 180);
                            ctx.translate(-centerX, -centerY);
                        }
                        
                        drawMaskShape(ctx, shape);
                        
                        if (rotation !== 0) {
                            ctx.restore();
                        }
                    });
                }

                const feather = typeof layer.threshold === 'number' ? layer.threshold : 0;
                if (feather > 0) {
                    const radius = Math.max(1, Math.round((feather / 100) * 20));
                    featherMaskAlpha(ctx, maskCanvas.width, maskCanvas.height, radius);
                }

                layerDiv.style.backgroundImage = `url(${maskCanvas.toDataURL()})`;
            };
            
            img.src = layer.originalData || layer.data;
        }
        
        // Cached depth-mask temp canvas (avoids per-call allocations)
        let _dmTempCanvas = null, _dmTempCtx = null, _dmImgData = null;
        let _dmCacheW = 0, _dmCacheH = 0;
        
        // Helper function to draw mask shapes (supports all shape types)
        function drawMaskShape(ctx, shape) {
            const cx = shape.x + shape.width / 2;
            const cy = shape.y + shape.height / 2;

            // Special handling for depth-based masks: threshold the depth map
            if (shape.type === 'depth-mask' && shape.depthData && shape.depthWidth && shape.depthHeight) {
                const w = shape.depthWidth;
                const h = shape.depthHeight;
                const threshold = shape.threshold || 128;
                const invert = shape.invert || false;

                // Reuse cached canvas/ImageData when dimensions match
                if (_dmCacheW !== w || _dmCacheH !== h || !_dmTempCanvas) {
                    _dmTempCanvas = document.createElement('canvas');
                    _dmTempCanvas.width = w;
                    _dmTempCanvas.height = h;
                    _dmTempCtx = _dmTempCanvas.getContext('2d', { willReadFrequently: true });
                    _dmImgData = _dmTempCtx.createImageData(w, h);
                    _dmCacheW = w;
                    _dmCacheH = h;
                }
                const data = _dmImgData.data;
                // Zero out buffer — we only write obstacle pixels below
                data.fill(0);

                for (let y = 0; y < h; y++) {
                    const srcY = h - 1 - y; // flip vertically
                    for (let x = 0; x < w; x++) {
                        const srcI = srcY * w + x;
                        const dstI = y * w + x;
                        const dv = shape.depthData[srcI] || 0;
                        const isObstacle = invert ? (dv < threshold) : (dv >= threshold);
                        if (isObstacle) {
                            const idx = dstI * 4;
                            data[idx] = 255;
                            data[idx + 1] = 255;
                            data[idx + 2] = 255;
                            data[idx + 3] = 255;
                        }
                    }
                }

                _dmTempCtx.putImageData(_dmImgData, 0, 0);
                ctx.drawImage(_dmTempCanvas, shape.x, shape.y, shape.width, shape.height);
                return;
            }

            // Special handling for pixel-based SAM masks: draw from the
            // samMask bitmap instead of treating the shape as a solid rect.
            if (shape.type === 'sam-mask' && shape.samMask && shape.samMaskWidth && shape.samMaskHeight) {
                const w = shape.samMaskWidth;
                const h = shape.samMaskHeight;

                // Draw into a temporary canvas, then blit into the main mask
                // canvas. We only need an alpha mask here, so use white where
                // the SAM mask is active.
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = w;
                tempCanvas.height = h;
                const tempCtx = tempCanvas.getContext('2d');
                const imageData = tempCtx.createImageData(w, h);
                const data = imageData.data;

                let nonZero = 0;
                const totalPixels = w * h;
                for (let i = 0; i < totalPixels; i++) {
                    const v = Number(shape.samMask[i] || 0);
                    if (v > 0) {
                        nonZero++;
                        const idx = i * 4;
                        data[idx] = 255;       // R
                        data[idx + 1] = 255;   // G
                        data[idx + 2] = 255;   // B
                        data[idx + 3] = 255;   // A
                    }
                }

                // If the mask is empty for some reason, fall back to the
                // bounding box so we don't silently do nothing.
                if (nonZero === 0) {
                    ctx.beginPath();
                    ctx.rect(shape.x, shape.y, shape.width, shape.height);
                    ctx.fill();
                    return;
                }

                tempCtx.putImageData(imageData, 0, 0);
                ctx.drawImage(tempCanvas, shape.x, shape.y, w, h);
                return;
            }

            ctx.beginPath();

            switch (shape.type) {
                case 'rect':
                    ctx.rect(shape.x, shape.y, shape.width, shape.height);
                    break;

                case 'roundrect':
                    const radius = Math.min(shape.width, shape.height) * 0.15;
                    if (ctx.roundRect) {
                        ctx.roundRect(shape.x, shape.y, shape.width, shape.height, radius);
                    } else {
                        // Fallback for older browsers
                        ctx.rect(shape.x, shape.y, shape.width, shape.height);
                    }
                    break;

                case 'circle':
                    ctx.arc(cx, cy, shape.width / 2, 0, Math.PI * 2);
                    break;

                case 'ellipse':
                    ctx.ellipse(cx, cy, shape.width / 2, shape.height / 2, 0, 0, Math.PI * 2);
                    break;

                case 'triangle':
                    ctx.moveTo(cx, shape.y);
                    ctx.lineTo(shape.x + shape.width, shape.y + shape.height);
                    ctx.lineTo(shape.x, shape.y + shape.height);
                    ctx.closePath();
                    break;

                case 'pentagon':
                    drawMaskPolygon(ctx, cx, cy, 5, Math.min(shape.width, shape.height) / 2);
                    break;

                case 'hexagon':
                    drawMaskPolygon(ctx, cx, cy, 6, Math.min(shape.width, shape.height) / 2);
                    break;

                case 'star':
                    drawMaskStar(ctx, cx, cy, 5, Math.min(shape.width, shape.height) / 2, Math.min(shape.width, shape.height) / 4);
                    break;

                default:
                    ctx.rect(shape.x, shape.y, shape.width, shape.height);
            }

            ctx.fill();
        }
        
        // Expose for collision system to reuse
        window._drawMaskShape = drawMaskShape;
        window._featherMaskAlpha = featherMaskAlpha;
        
        // Helper to draw regular polygon
        function drawMaskPolygon(ctx, cx, cy, sides, radius) {
            const angle = (Math.PI * 2) / sides;
            const startAngle = -Math.PI / 2;
            
            for (let i = 0; i <= sides; i++) {
                const a = startAngle + angle * i;
                const x = cx + Math.cos(a) * radius;
                const y = cy + Math.sin(a) * radius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
        }

        function featherMaskAlpha(ctx, width, height, radius) {
            if (!radius || radius <= 0) return;
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            const w = width;
            const h = height;
            const tmp = new Uint8ClampedArray(w * h);
            const out = new Uint8ClampedArray(w * h);
            const windowSize = radius * 2 + 1;

            for (let y = 0; y < h; y++) {
                let sum = 0;
                const rowOffset = y * w;
                for (let x = -radius; x <= radius; x++) {
                    const xx = x < 0 ? 0 : (x >= w ? w - 1 : x);
                    sum += data[(rowOffset + xx) * 4 + 3];
                }
                for (let x = 0; x < w; x++) {
                    tmp[rowOffset + x] = sum / windowSize;
                    const xRemove = x - radius;
                    const xAdd = x + radius + 1;
                    const xr = xRemove < 0 ? 0 : (xRemove >= w ? w - 1 : xRemove);
                    const xa = xAdd < 0 ? 0 : (xAdd >= w ? w - 1 : xAdd);
                    sum += data[(rowOffset + xa) * 4 + 3] - data[(rowOffset + xr) * 4 + 3];
                }
            }

            for (let x = 0; x < w; x++) {
                let sum = 0;
                for (let y = -radius; y <= radius; y++) {
                    const yy = y < 0 ? 0 : (y >= h ? h - 1 : y);
                    sum += tmp[yy * w + x];
                }
                for (let y = 0; y < h; y++) {
                    out[y * w + x] = sum / windowSize;
                    const yRemove = y - radius;
                    const yAdd = y + radius + 1;
                    const yr = yRemove < 0 ? 0 : (yRemove >= h ? h - 1 : yRemove);
                    const ya = yAdd < 0 ? 0 : (yAdd >= h ? h - 1 : yAdd);
                    sum += tmp[ya * w + x] - tmp[yr * w + x];
                }
            }

            for (let i = 0, len = w * h; i < len; i++) {
                data[i * 4 + 3] = out[i];
            }
            ctx.putImageData(imageData, 0, 0);
        }
        
        // Helper to draw star
        function drawMaskStar(ctx, cx, cy, points, outerRadius, innerRadius) {
            const angle = Math.PI / points;
            const startAngle = -Math.PI / 2;
            
            for (let i = 0; i < points * 2; i++) {
                const radius = i % 2 === 0 ? outerRadius : innerRadius;
                const a = startAngle + angle * i;
                const x = cx + Math.cos(a) * radius;
                const y = cy + Math.sin(a) * radius;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
        }
        
        window.updateLayerTitle = (index, title) => {
            const layer = layers.find(l => l.index === index);
            if (layer) layer.title = title;
        };
        
        window.updateLayerThreshold = (index, threshold) => {
            const layer = layers.find(l => l.index === index);
            if (!layer) return;

            layer.threshold = parseInt(threshold, 10) || 0;

            const hasMask = layer.mask?.shapes?.length > 0;
            
            if (hasMask && layer.mask.enabled) {
                // Has shape mask - threshold controls feathering
                applyLayerMask(index);
            } else if (layer.threshold > 0) {
                // No shape mask - threshold controls rudimentary alpha mask
                applyRudimentaryMask(index);
            } else {
                // No mask and threshold is 0 - show original image
                const layerDiv = document.getElementById(`layer${index}`);
                if (layerDiv && layer.originalData) {
                    layerDiv.style.backgroundImage = `url(${layer.originalData})`;
                }
            }
        };
        
        // Apply rudimentary alpha-threshold mask for layers without shape masks
        window.applyRudimentaryMask = function applyRudimentaryMask(index) {
            const layer = layers.find(l => l.index === index);
            if (!layer) return;
            
            const layerDiv = document.getElementById(`layer${index}`);
            if (!layerDiv) return;
            
            const threshold = layer.threshold || 0;
            if (threshold === 0) {
                if (layer.originalData) {
                    layerDiv.style.backgroundImage = `url(${layer.originalData})`;
                }
                return;
            }
            
            // Create canvas for processing
            const maskCanvas = document.createElement('canvas');
            const canvasElement = document.getElementById('canvas');
            maskCanvas.width = canvasElement ? canvasElement.width : 1920;
            maskCanvas.height = canvasElement ? canvasElement.height : 1080;
            const ctx = maskCanvas.getContext('2d');
            
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0, maskCanvas.width, maskCanvas.height);
                
                // Apply alpha threshold - pixels below threshold become transparent
                const imageData = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
                const data = imageData.data;
                const thresholdValue = Math.round((threshold / 100) * 255);
                
                for (let i = 0; i < data.length; i += 4) {
                    // Calculate luminance (perceived brightness)
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                    
                    // Make dark pixels transparent based on threshold
                    if (luminance < thresholdValue) {
                        data[i + 3] = 0; // Set alpha to 0
                    }
                }
                
                ctx.putImageData(imageData, 0, 0);
                layerDiv.style.backgroundImage = `url(${maskCanvas.toDataURL()})`;
            };
            
            img.src = layer.originalData || layer.data;
        };
        
        // Hotkeys modal + Undo/Redo implementation
        const hotkeyOverlay = document.getElementById('hotkeyOverlay');
        const hotkeyClose = document.getElementById('hotkeyClose');
        function showHotkeys() { if (hotkeyOverlay) hotkeyOverlay.style.display = 'flex'; }
        function hideHotkeys() { if (hotkeyOverlay) hotkeyOverlay.style.display = 'none'; }
        function toggleHotkeys() { if (!hotkeyOverlay) return; hotkeyOverlay.style.display = (hotkeyOverlay.style.display === 'flex' ? 'none' : 'flex'); }
        if (hotkeyClose) hotkeyClose.addEventListener('click', hideHotkeys);
        if (hotkeyOverlay) hotkeyOverlay.addEventListener('click', (e) => { if (e.target === hotkeyOverlay) hideHotkeys(); });
        
        let undoStack = [];
        let redoStack = [];
        let applyingState = false;
        
        function isTypingTarget(el) {
            if (!el) return false;
            const tag = (el.tagName || '').toLowerCase();
            return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
        }
        
        function getWrapperRectState() {
            const areaRect = canvasArea.getBoundingClientRect();
            const rect = canvasWrapper.getBoundingClientRect();
            return {
                left: rect.left - areaRect.left,
                top: rect.top - areaRect.top,
                width: rect.width,
                height: rect.height
            };
        }
        function setWrapperRectState(w) {
            if (!w) return;
            canvasWrapper.style.left = w.left + 'px';
            canvasWrapper.style.top = w.top + 'px';
            canvasWrapper.style.width = w.width + 'px';
            canvasWrapper.style.height = w.height + 'px';
            updateCanvasSize();
        }
        
        function getState() {
            const rect = getWrapperRectState();
            return {
                paletteIndex: (typeof currentPaletteIndex !== 'undefined') ? currentPaletteIndex : 0,
                savedColors: Array.isArray(savedColors) ? savedColors.slice() : [],
                randomOn: !!document.getElementById('randomColor')?.checked,
                stepOn: !!document.getElementById('stepPalette')?.checked,
                colorPickerValue: document.getElementById('colorPicker')?.value || '#ffffff',
                brushSize: parseFloat(document.getElementById('brushSize')?.value || '11'),
                visualRes: parseInt(document.getElementById('visualResolution')?.value || String(config.DYE_RESOLUTION), 10),
                physicsRes: parseInt(document.getElementById('physicsResolution')?.value || String(config.SIM_RESOLUTION), 10),
                showCursor: !!document.getElementById('cursorToggle')?.checked,
                showCanvasHandles: !!document.getElementById('showCanvasHandles')?.checked,
                lockCanvasBorders: !!document.getElementById('lockCanvasBorders')?.checked,
                wrapper: rect
            };
        }
        
        function applyState(s) {
            if (!s) return;
            applyingState = true;
            try {
                // Checkboxes and selectors
                const stepEl = document.getElementById('stepPalette');
                const rndEl = document.getElementById('randomColor');
                const cursorEl = document.getElementById('cursorToggle');
                const handlesEl = document.getElementById('showCanvasHandles');
                const lockEl = document.getElementById('lockCanvasBorders');
                const visualSel = document.getElementById('visualResolution');
                const physSel = document.getElementById('physicsResolution');
                const cp = document.getElementById('colorPicker');
                
                if (typeof applyPalette === 'function' && typeof s.paletteIndex === 'number') {
                    applyPalette(s.paletteIndex);
                }
                if (Array.isArray(s.savedColors) && typeof colorStorage?.save === 'function') {
                    colorStorage.save(s.savedColors.slice());
                }
                
                if (rndEl) { rndEl.checked = !!s.randomOn; rndEl.dispatchEvent(new Event('change')); }
                if (stepEl) { stepEl.checked = !!s.stepOn; stepEl.dispatchEvent(new Event('change')); }
                
                if (cp) { cp.value = s.colorPickerValue || cp.value; }
                if (typeof updateColor === 'function') updateColor();
                
                const brushEl = document.getElementById('brushSize');
                if (brushEl) { 
                    brushEl.value = String(s.brushSize); 
                    brushEl.style.setProperty('--val', s.brushSize);
                    config.SPLAT_RADIUS = s.brushSize / 1000; 
                }
                
                if (visualSel) { visualSel.value = String(s.visualRes); visualSel.dispatchEvent(new Event('change')); }
                if (physSel) { physSel.value = String(s.physicsRes); physSel.dispatchEvent(new Event('change')); }
                
                if (cursorEl) { cursorEl.checked = !!s.showCursor; cursorEl.dispatchEvent(new Event('change')); }
                if (handlesEl) {
                    handlesEl.checked = !!s.showCanvasHandles;
                    if (typeof applyHandlesVisibility === 'function') applyHandlesVisibility(handlesEl.checked);
                }
                if (lockEl) { lockEl.checked = !!s.lockCanvasBorders; bordersLocked = lockEl.checked; }
                
                if (s.wrapper) setWrapperRectState(s.wrapper);
                if (typeof updatePaletteStepIndicator === 'function') updatePaletteStepIndicator();
            } finally {
                applyingState = false;
            }
        }
        
        function pushUndo() {
            if (applyingState) return;
            try {
                const current = getState();
                const last = undoStack.length ? undoStack[undoStack.length - 1] : null;
                if (last) {
                    const lastStr = JSON.stringify(last);
                    const currStr = JSON.stringify(current);
                    if (lastStr === currStr) return; // skip duplicate snapshot
                }
                undoStack.push(current);
                redoStack.length = 0;
            } catch (e) { /* noop */ }
        }
        function doUndo() {
            if (!undoStack.length) return;
            const current = getState();
            // Skip no-op snapshots equal to current state
            while (undoStack.length) {
                const top = undoStack[undoStack.length - 1];
                if (JSON.stringify(top) === JSON.stringify(current)) { undoStack.pop(); } else { break; }
            }
            if (!undoStack.length) return;
            const st = undoStack.pop();
            redoStack.push(current);
            applyState(st);
        }
        function doRedo() {
            if (!redoStack.length) return;
            const current = getState();
            // Skip no-op snapshots equal to current state
            while (redoStack.length) {
                const top = redoStack[redoStack.length - 1];
                if (JSON.stringify(top) === JSON.stringify(current)) { redoStack.pop(); } else { break; }
            }
            if (!redoStack.length) return;
            const st = redoStack.pop();
            undoStack.push(current);
            applyState(st);
        }
        
        function toggleCheckbox(id) {
            const el = document.getElementById(id);
            if (!el) return;
            pushUndo();
            el.checked = !el.checked;
            el.dispatchEvent(new Event('change'));
        }
        function adjustBrush(delta, coarse=false) {
            const el = document.getElementById('brushSize');
            if (!el) return;
            const step = coarse ? 5 : 1;
            let v = parseFloat(el.value || '11');
            const min = parseFloat(el.min || '1');
            const max = parseFloat(el.max || '30');
            v = Math.min(max, Math.max(min, v + delta * step));
            pushUndo();
            el.value = String(v);
            el.style.setProperty('--val', v);
            config.SPLAT_RADIUS = v / 1000;
        }
        function stepPaletteOnce(forward=true) {
            if (typeof getStepColorList !== 'function') return;
            const list = getStepColorList();
            if (!list || !list.length) return;
            const len = list.length;
            if (forward) {
                const hex = list[paletteStepIndex % len];
                paletteStepIndex = (paletteStepIndex + 1) % len;
                const cp = document.getElementById('colorPicker');
                if (cp) cp.value = hex;
                const r = parseInt(hex.slice(1, 3), 16) / 255;
                const g = parseInt(hex.slice(3, 5), 16) / 255;
                const b = parseInt(hex.slice(5, 7), 16) / 255;
                pointer.color = [r, g, b];
            } else {
                paletteStepIndex = (paletteStepIndex - 1 + len) % len;
                const hex = list[paletteStepIndex];
                const cp = document.getElementById('colorPicker');
                if (cp) cp.value = hex;
                const r = parseInt(hex.slice(1, 3), 16) / 255;
                const g = parseInt(hex.slice(3, 5), 16) / 255;
                const b = parseInt(hex.slice(5, 7), 16) / 255;
                pointer.color = [r, g, b];
            }
            if (typeof updatePaletteStepIndicator === 'function') updatePaletteStepIndicator();
        }
        window.stepPaletteOnce = stepPaletteOnce;
        function cycleSelect(el, dir) {
            if (!el) return;
            const opts = el.options;
            if (!opts || !opts.length) return;
            let idx = el.selectedIndex;
            idx = Math.min(opts.length - 1, Math.max(0, idx + dir));
            if (idx !== el.selectedIndex) {
                pushUndo();
                el.selectedIndex = idx;
                el.dispatchEvent(new Event('change'));
            }
        }
        
        document.addEventListener('keydown', (e) => {
            if (isTypingTarget(e.target)) return;
            const key = e.key;
            const lower = key.length === 1 ? key.toLowerCase() : key;
            const ctrlOrMeta = e.ctrlKey || e.metaKey;
            
            // Chromium fullscreen (F11)
            if (key === 'F11') {
                e.preventDefault();
                if (!document.fullscreenElement) {
                    const el = document.documentElement;
                    if (el.requestFullscreen) el.requestFullscreen();
                } else {
                    if (document.exitFullscreen) document.exitFullscreen();
                }
                return;
            }

            // Hotkey modal
            if (key === 'F1' || (e.shiftKey && (key === '?' || key === '/'))) {
                e.preventDefault();
                toggleHotkeys();
                return;
            }
            if (key === 'Escape' && hotkeyOverlay && hotkeyOverlay.style.display === 'flex') {
                hideHotkeys();
                return;
            }
            
            // Undo/Redo
            if (ctrlOrMeta && lower === 'z') {
                e.preventDefault();
                if (e.shiftKey) doRedo(); else doUndo();
                return;
            }
            if (ctrlOrMeta && lower === 'y') {
                e.preventDefault();
                doRedo();
                return;
            }
            
            // Toggles
            if (!ctrlOrMeta && !e.altKey) {
                if (lower === 't') { toggleCheckbox('trailToggle'); return; }
                if (lower === 'c') { toggleCheckbox('cursorToggle'); return; }
                if (lower === 'h') { toggleCheckbox('showCanvasHandles'); return; }
                if (lower === 'l') { toggleCheckbox('lockCanvasBorders'); return; }
                if (lower === 'r') { toggleCheckbox('randomColor'); return; }
                if (lower === 'a') { toggleCheckbox('stepPalette'); return; }
                if (key === '[') { adjustBrush(-1, e.shiftKey); return; }
                if (key === ']') { adjustBrush(1, e.shiftKey); return; }
                if (lower === 'n') { stepPaletteOnce(!e.shiftKey); return; }
                if (e.shiftKey && lower === 's' && typeof window.saveColor === 'function') { e.preventDefault(); pushUndo(); window.saveColor(); return; }
                if (e.shiftKey && lower === 'x' && typeof window.clearColors === 'function') { e.preventDefault(); pushUndo(); window.clearColors(); return; }
            }
            
            // Palette cycling
            if (ctrlOrMeta && (key === 'ArrowLeft' || key === 'ArrowRight')) {
                e.preventDefault();
                if (typeof window.cyclePalette === 'function') { pushUndo(); window.cyclePalette(key === 'ArrowLeft' ? -1 : 1); }
                return;
            }
            
            // Resolution cycling
            if (e.altKey && !ctrlOrMeta) {
                if (key === 'ArrowUp' || key === 'ArrowDown') {
                    e.preventDefault();
                    if (e.shiftKey) cycleSelect(document.getElementById('physicsResolution'), key === 'ArrowUp' ? 1 : -1);
                    else cycleSelect(document.getElementById('visualResolution'), key === 'ArrowUp' ? 1 : -1);
                    return;
                }
            }
        });
        
        // Seed initial undo state after UI init
        try { pushUndo(); } catch (e) { /* noop */ }
        
        // Initialize layer order with sim at the top
        layerOrder = [{ type: 'sim' }];
        // Expose layer system for collision module and other integrations
        window.layers = layers;
        window.layerOrder = layerOrder;
        window.renderLayers = renderLayers;
        renderLayers();
        
        // Initialize Recorded Layers UI
        setupRecUI();
        recRenderUI();
        
        update();
