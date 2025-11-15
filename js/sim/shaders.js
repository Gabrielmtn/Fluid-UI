// WebGL Shader Strings
// Extracted from 05-fluid-sim.js for better organization

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
        
        // For velocity: higher velocityInfluence = tighter radius (more isolated)
        // For density: always use full radius (visual quality)
        float effectiveRadius = radius;
        if (isVelocity == 1) {
            // Higher value = smaller radius = more isolated
            effectiveRadius = radius / max(1.0, velocityInfluence / 22.0);
        }
        
        vec3 splat = exp(-dot(p, p) / effectiveRadius) * color;
        vec3 base = texture(uTarget, vUv).xyz;
        fragColor = vec4(base + splat, 1.0);
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

const vorticityFrag = `#version 300 es
    precision ${PRECISION} float;
    in vec2 vUv, vT, vB;
    out vec4 fragColor;
    uniform sampler2D uVelocity, uCurl;
    uniform float curl, dt;
    void main() {
        float T = texture(uCurl, vT).x;
        float B = texture(uCurl, vB).x;
        float C = texture(uCurl, vUv).x;
        vec2 force = vec2(abs(T) - abs(B), 0.0) * curl * C / (length(vec2(abs(T) - abs(B), 0.0)) + 0.00001);
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

// Export all shaders
window.Shaders = {
    PRECISION,
    baseVert,
    displayFrag,
    splatFrag,
    advectionFrag,
    divergenceFrag,
    curlFrag,
    vorticityFrag,
    pressureFrag,
    gradientFrag,
    clearFrag
};
