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
        
        const baseVert = `#version 300 es
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
            precision highp float;
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
            precision highp float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTarget;
            uniform vec2 point;
            uniform vec3 color;
            uniform float radius, aspectRatio;
            void main() {
                vec2 p = vUv - point;
                p.x *= aspectRatio;
                vec3 splat = exp(-dot(p, p) / radius) * color;
                vec3 base = texture(uTarget, vUv).xyz;
                fragColor = vec4(base + splat * 0.2, 1.0);
            }
        `;
        
        const advectionFrag = `#version 300 es
            precision highp float;
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
            precision highp float;
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
            precision highp float;
            in vec2 vL, vR, vT, vB;
            out vec4 fragColor;
            uniform sampler2D uVelocity;
            void main() {
                fragColor = vec4(texture(uVelocity, vR).y - texture(uVelocity, vL).y - 
                                 texture(uVelocity, vT).x + texture(uVelocity, vB).x, 0.0, 0.0, 1.0);
            }
        `;
        
        const vorticityFrag = `#version 300 es
            precision highp float;
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
            precision highp float;
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
            precision highp float;
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
            precision highp float;
            in vec2 vUv;
            out vec4 fragColor;
            uniform sampler2D uTexture;
            uniform float value;
            void main() { fragColor = value * texture(uTexture, vUv); }
        `;
        
        const displayProg = new Program(baseVert, displayFrag);
        const splatProg = new Program(baseVert, splatFrag);
        const advectionProg = new Program(baseVert, advectionFrag);
        const divergenceProg = new Program(baseVert, divergenceFrag);
        const curlProg = new Program(baseVert, curlFrag);
        const vorticityProg = new Program(baseVert, vorticityFrag);
        const pressureProg = new Program(baseVert, pressureFrag);
        const gradientProg = new Program(baseVert, gradientFrag);
        const clearProg = new Program(baseVert, clearFrag);
        
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
        
        let density, velocity, divergence, curl, pressure;
        
        function initFramebuffers() {
            const displayW = gl.drawingBufferWidth;
            const displayH = gl.drawingBufferHeight;
            const aspect = displayW / Math.max(1, displayH);
            const dyeBase = config.DYE_RESOLUTION || 1024;
            const simBase = config.SIM_RESOLUTION || 128;
            console.log('initFramebuffers called - DYE:', dyeBase, 'SIM:', simBase);
            // Compute absolute internal sizes: long side = base, short side scaled by aspect
            if (displayW >= displayH) {
                dyeTexWidth = dyeBase; dyeTexHeight = Math.max(1, Math.round(dyeBase / aspect));
                simTexWidth = simBase; simTexHeight = Math.max(1, Math.round(simBase / aspect));
            } else {
                dyeTexHeight = dyeBase; dyeTexWidth = Math.max(1, Math.round(dyeBase * aspect));
                simTexHeight = simBase; simTexWidth = Math.max(1, Math.round(simBase * aspect));
            }
            
            const texType = gl.HALF_FLOAT;
            const rgba = { internalFormat: gl.RGBA16F, format: gl.RGBA };
            const rg = { internalFormat: gl.RG16F, format: gl.RG };
            const r = { internalFormat: gl.R16F, format: gl.RED };
            const filter = linearExt ? gl.LINEAR : gl.NEAREST;
            
            // Visual dye buffers at dye resolution
            density = createDoubleFBO(dyeTexWidth, dyeTexHeight, rgba.internalFormat, rgba.format, texType, filter);
            // Physics buffers at simulation resolution
            velocity = createDoubleFBO(simTexWidth, simTexHeight, rg.internalFormat, rg.format, texType, filter);
            divergence = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
            curl = createFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
            pressure = createDoubleFBO(simTexWidth, simTexHeight, r.internalFormat, r.format, texType, gl.NEAREST);
        }
        
        initFramebuffers();
        exposeSimStats(); // Expose to window for stats panel
        
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

        function startStroke(x, y) {
            strokeEvents = [];
            strokeStartTime = Date.now();
        }

        function pushStrokeEvent(x, y, dx, dy, color) {
            const t = Date.now() - strokeStartTime;
            strokeEvents.push({ t, x, y, dx, dy, color: color.slice(), mult: (typeof animationMultiplier === 'number' ? animationMultiplier : 1), radius: config.SPLAT_RADIUS });
        }

        // Called from mousemove path when drawing (stroke capture only)
        function trackStrokeMove(e) {
            // pointer state already updated
            pushStrokeEvent(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
        }

        function replayStroke(broadcast = true) {
            if (!strokeEvents.length) { isReplayActive = false; return; }
            replayIndex = 0;
            replayStartTime = Date.now();
            isReplayActive = true;
            // Broadcast full stroke to multiplayer
            if (broadcast && typeof broadcastReplayStroke === 'function') {
                const norm = strokeEvents.map(ev => ({
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

        function processReplay() {
            if (!isReplayActive) return;
            const elapsed = Date.now() - replayStartTime;
            while (replayIndex < strokeEvents.length && strokeEvents[replayIndex].t <= elapsed) {
                const ev = strokeEvents[replayIndex++];
                if (typeof window.applyMultiSplatWith === 'function') {
                    window.applyMultiSplatWith(ev.x, ev.y, ev.dx, ev.dy, ev.color, ev.mult, ev.radius);
                } else {
                    const prevM = animationMultiplier; const prevR = config.SPLAT_RADIUS;
                    animationMultiplier = ev.mult; config.SPLAT_RADIUS = ev.radius;
                    multiSplat(ev.x, ev.y, ev.dx, ev.dy, ev.color);
                    animationMultiplier = prevM; config.SPLAT_RADIUS = prevR;
                }
                if (typeof recRecordInteraction === 'function' && recEnabled) {
                    try { recRecordInteraction(ev.x, ev.y, ev.dx, ev.dy, ev.color); } catch(_){}
                }
            }
            if (replayIndex >= strokeEvents.length) {
                // If right button still held, loop replay without rebroadcast
                if (isRightMouseDown) {
                    replayStroke(false);
                } else {
                    isReplayActive = false;
                }
            }
        }

        // Allow multiplayer to schedule a stroke replay with normalized events
        window.scheduleStrokeReplay = function(normalizedEvents) {
            strokeEvents = (normalizedEvents || []).map(ev => ({
                t: ev.t || 0,
                x: (ev.x || 0) * canvas.width,
                y: (ev.y || 0) * canvas.height,
                dx: (ev.dx || 0) * canvas.width,
                dy: (ev.dy || 0) * canvas.height,
                color: Array.isArray(ev.color) ? ev.color.slice() : pointer.color.slice(),
                mult: Math.max(1, Math.round(ev.mult || 1)),
                radius: (typeof ev.radius === 'number') ? ev.radius : config.SPLAT_RADIUS
            }));
            replayStroke(false);
        };
        
        canvas.addEventListener('mousedown', (e) => {
            if (isPaused) return;
            
            if (e.button === 2) {
                e.preventDefault();
                isRightMouseDown = true;
                isReplayActive = true;
                replayStroke(true);
                return;
            }
            
            const coords = getCanvasCoordinates(e);
            pointer.down = true;
            pointer.moved = false;
            pointer.x = coords.x;
            pointer.y = coords.y;
            pointer.dx = 0;
            pointer.dy = 0;
            updateColor();
            // Begin stroke recording and include initial splat
            startStroke(pointer.x, pointer.y);
            pushStrokeEvent(pointer.x, pointer.y, 0, 0, pointer.color);
            if (recEnabled) recRecordInteraction(coords.x, coords.y, 0, 0, pointer.color);
            splat(pointer.x, pointer.y, 0, 0, pointer.color);
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
            pointer.moved = pointer.down;
            pointer.dx = (coords.x - pointer.x) * 10.0;
            pointer.dy = (coords.y - pointer.y) * 10.0;
            pointer.x = coords.x;
            pointer.y = coords.y;

            // Broadcast cursor position to multiplayer clients
            if (typeof broadcastCursor === 'function') {
                broadcastCursor(coords.x / canvas.width, coords.y / canvas.height);
            }

            if (pointer.down) {
                trackStrokeMove(e);
                if (recEnabled) recRecordInteraction(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
            }
        });
        
        window.addEventListener('mouseup', (e) => {
            if (e.button === 2) {
                isRightMouseDown = false;
                isReplayActive = false;
                customCursor.style.opacity = '0';
                trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
            } else if (e.button === 0) {
                pointer.down = false;
                pointer.moved = false;
                setTimeout(() => {
                    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
                }, FADE_END);
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
            updateColor();
            if (recEnabled) recRecordInteraction(coords.x, coords.y, 0, 0, pointer.color);
            splat(pointer.x, pointer.y, 0, 0, pointer.color);
            if (typeof broadcastSplat === 'function') {
                broadcastSplat(
                    coords.x / canvas.width,
                    coords.y / canvas.height,
                    0,
                    0,
                    pointer.color
                );
            }
        });
        
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (isPaused) return;
            const touch = e.touches[0];
            const coords = getCanvasCoordinates(touch);
            pointer.moved = pointer.down;
            pointer.dx = (coords.x - pointer.x) * 10.0;
            pointer.dy = (coords.y - pointer.y) * 10.0;
            pointer.x = coords.x;
            pointer.y = coords.y;
            if (recEnabled) recRecordInteraction(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
        });
        
        canvas.addEventListener('touchend', () => {
            pointer.down = false;
            pointer.moved = false;
        });
        
        // Background color picker
        const backgroundColorPicker = document.getElementById('backgroundColorPicker');
        
        if (backgroundColorPicker) {
            backgroundColorPicker.addEventListener('input', (e) => {
                const color = e.target.value;
                canvasArea.style.backgroundColor = color;
                document.body.style.backgroundColor = color;
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
        
        // Preserve fluid opacity checkbox
        window.preserveFluidOpacity = false;
        const preserveFluidOpacityCheckbox = document.getElementById('preserveFluidOpacity');
        
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
        
        window.kaleidoEnabled = false;
        window.kaleidoSegments = 6;
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
            if (window.kaleidoEnabled) {
                setTimeout(() => { try { window.dispatchEvent(new Event('resize')); } catch(e){} }, 60);
            }
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
        const segmentsLabelEl = document.querySelector('#kaleidoPanel .control-group:first-child label');
        
        // Update segments label based on kaleidoscope mode
        function updateSegmentsLabel(mode) {
            if (!segmentsLabelEl) return;
            
            switch(mode) {
                case 0: // Off
                    segmentsLabelEl.textContent = 'Segments';
                    break;
                case 1: // Wedge
                    segmentsLabelEl.textContent = 'Facets';
                    break;
                case 2: // Mirror H
                    segmentsLabelEl.textContent = 'Layers';
                    break;
                case 3: // Mirror V
                    segmentsLabelEl.textContent = 'Layers';
                    break;
                case 4: // Mirror Quad
                    segmentsLabelEl.textContent = 'Reflections';
                    break;
                case 5: // Spiral
                    segmentsLabelEl.textContent = 'Rings';
                    break;
                default:
                    segmentsLabelEl.textContent = 'Segments';
            }
        }
        
        if (kaleidoModeEl) {
            window.kaleidoMode = parseInt(kaleidoModeEl.value || '1', 10);
            updateSegmentsLabel(window.kaleidoMode);
            kaleidoModeEl.addEventListener('change', (e) => { 
                window.kaleidoMode = parseInt(e.target.value || '1', 10);
                updateSegmentsLabel(window.kaleidoMode);
            });
        }
        
        // Helper function to create rotated instances of a splat
        function multiSplat(x, y, dx, dy, color) {
            const centerX = canvas.width * 0.5;
            const centerY = canvas.height * 0.5;

            for (let i = 0; i < animationMultiplier; i++) {
                const angle = (i / animationMultiplier) * Math.PI * 2;

                // Translate to center, rotate, translate back
                const relX = x - centerX;
                const relY = y - centerY;

                const rotatedX = relX * Math.cos(angle) - relY * Math.sin(angle);
                const rotatedY = relX * Math.sin(angle) + relY * Math.cos(angle);

                const finalX = rotatedX + centerX;
                const finalY = rotatedY + centerY;

                // Rotate velocity vector too
                const rotatedDx = dx * Math.cos(angle) - dy * Math.sin(angle);
                const rotatedDy = dx * Math.sin(angle) + dy * Math.cos(angle);

                splat(finalX, finalY, rotatedDx, rotatedDy, color);
            }

            // Broadcast to multiplayer clients (send normalized coordinates)
            if (typeof broadcastSplat === 'function') {
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
            try { multiSplat(x, y, dx, dy, color); } finally {
                animationMultiplier = prevM;
                config.SPLAT_RADIUS = prevR;
            }
        };
        
        const trailToggle = document.getElementById('trailToggle');
        const cursorToggle = document.getElementById('cursorToggle');
        
        trailToggle.addEventListener('change', (e) => {
            showTrail = e.target.checked;
            if (!showTrail) {
                trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
            }
        });
        
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
                document.getElementById('trailCanvas'),
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
                updateColor();
                updatePaletteStepIndicator();
            });
        }
        const randomColorCheckboxEl = document.getElementById('randomColor');
        if (randomColorCheckboxEl) {
            randomColorCheckboxEl.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const stepEl = document.getElementById('stepPalette');
                    if (stepEl) stepEl.checked = false;
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
                }
                updatePaletteStepIndicator();
            });
        }
        
        function updateColor() {
            const stepEl = document.getElementById('stepPalette');
            const rndEl = document.getElementById('randomColor');
            if (stepEl && stepEl.checked) {
                const list = getStepColorList();
                if (list.length > 0) {
                    const hex = list[paletteStepIndex % list.length];
                    paletteStepIndex = (paletteStepIndex + 1) % list.length;
                    const cp = document.getElementById('colorPicker');
                    if (cp) cp.value = hex;
                    const r = parseInt(hex.slice(1, 3), 16) / 255;
                    const g = parseInt(hex.slice(3, 5), 16) / 255;
                    const b = parseInt(hex.slice(5, 7), 16) / 255;
                    pointer.color = [r, g, b];
                    updatePaletteStepIndicator();
                    return;
                }
            }
            if (rndEl && rndEl.checked) {
                pointer.color = [Math.random(), Math.random(), Math.random()];
                return;
            }
            const hex = document.getElementById('colorPicker').value;
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            pointer.color = [r, g, b];
        }
        
        const sliderConfig = {
            densityDissipation: { key: 'DENSITY_DISSIPATION', decimals: 4 },
            velocityDissipation: { key: 'VELOCITY_DISSIPATION', decimals: 4 },
            pressureDissipation: { key: 'PRESSURE_DISSIPATION', decimals: 3 },
            pressureIteration: { key: 'PRESSURE_ITERATIONS', decimals: 0 },
            velocityInfluence: { key: 'VELOCITY_INFLUENCE', decimals: 1 },
            curl: { key: 'CURL', decimals: 0 }
        };
        
        document.getElementById('brushSize').addEventListener('input', (e) => {
            config.SPLAT_RADIUS = e.target.value / 1000;
        });

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
                        console.log('Setting DYE_RESOLUTION to:', v);
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
                        console.log('Setting SIM_RESOLUTION to:', v);
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
                const velSlider = document.getElementById('velocityInfluence');
                const velValueSpan = document.getElementById('velocityInfluenceValue');
                if (velSlider) {
                    let currentValue = parseFloat(velSlider.value);
                    const minValue = parseFloat(velSlider.min);
                    const maxValue = parseFloat(velSlider.max);
                    const stepSize = parseFloat(velSlider.step) || 0.5;
                    
                    let newValue;
                    if (e.deltaY < 0) {
                        // Scrolling up - increase motion isolation influence
                        newValue = currentValue + stepSize;
                        if (newValue > maxValue) newValue = maxValue;
                    } else {
                        // Scrolling down - decrease motion isolation influence
                        newValue = currentValue - stepSize;
                        if (newValue < minValue) newValue = minValue;
                    }
                    
                    // Update slider and config
                    velSlider.value = String(newValue);
                    velSlider.style.setProperty('--val', newValue);
                    config.VELOCITY_INFLUENCE = newValue;
                    if (velValueSpan) velValueSpan.textContent = newValue.toFixed(1);
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
                // Normal scroll: Adjust brush size
                const brushSizeSlider = document.getElementById('brushSize');
                const currentValue = parseFloat(brushSizeSlider.value);
                const minValue = parseFloat(brushSizeSlider.min);
                const maxValue = parseFloat(brushSizeSlider.max);
                const stepSize = 0.5;
                
                let newValue;
                if (e.deltaY < 0) {
                    // Scrolling up - increase brush size
                    newValue = currentValue + stepSize;
                    if (newValue > maxValue) newValue = maxValue;
                } else {
                    // Scrolling down - decrease brush size
                    newValue = currentValue - stepSize;
                    if (newValue < minValue) newValue = minValue;
                }
                
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
            const valueSpanId = id === 'pressureIteration' ? 'iterationValue' : 
                                id.replace('Dissipation', '') + 'Value';
            const valueSpan = document.getElementById(valueSpanId);
            
            slider.addEventListener('input', (e) => {
                let val = parseFloat(e.target.value);
                
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
                valueSpan.textContent = cfg.decimals === 0 ? val : val.toFixed(cfg.decimals);
                
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
            // Write velocity at physics resolution
            gl.viewport(0, 0, simTexWidth, simTexHeight);
            
            gl.uniform1i(splatProg.uniforms.uTarget, 0);
            gl.uniform3f(splatProg.uniforms.color, dx, -dy, 1.0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
            blit(velocity.write.fbo);
            velocity.swap();
            
            // Write density at dye resolution
            gl.viewport(0, 0, dyeTexWidth, dyeTexHeight);
            gl.uniform1i(splatProg.uniforms.uTarget, 0);
            gl.uniform3fv(splatProg.uniforms.color, color);
            gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
            blit(density.write.fbo);
            density.swap();
        }
        
        let lastTime = Date.now();
        
        function update() {
            const dt = Math.min((Date.now() - lastTime) / 1000, 0.016);
            lastTime = Date.now();
            if (window.kAnimateRot && window.kSpinSpeed) {
                window.kAngle = (window.kAngle || 0) + dt * window.kSpinSpeed * Math.PI / 180;
            }
            
            const targetWidth = canvasWrapper.clientWidth;
            const targetHeight = canvasWrapper.clientHeight;
            
            if (canvas.width !== targetWidth || canvas.height !== targetHeight || window.needsFramebufferReinit) {
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                trailCanvas.width = targetWidth;
                trailCanvas.height = targetHeight;
                initFramebuffers();
                exposeSimStats(); // Update stats after resize
                window.needsFramebufferReinit = false;
            }
            
            if (!isPaused) {
                if (pointer.moved) {
                    multiSplat(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
                    pointer.moved = false;
                }
                
                // Process right-click replay events before recording and physics
                processReplay();
                
                if (recEnabled) {
                    recUpdatePlayback();
                }
                
                advectionProg.bind();
                // Velocity advection at physics resolution
                gl.viewport(0, 0, simTexWidth, simTexHeight);
                const velInfluence = config.VELOCITY_INFLUENCE || 22.0;
                gl.uniform2f(advectionProg.uniforms.texelSize, velInfluence / simTexWidth, velInfluence / simTexHeight);
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
                gl.uniform2f(advectionProg.uniforms.texelSize, velInfluence / simTexWidth, velInfluence / simTexHeight);
                gl.uniform1i(advectionProg.uniforms.isDensity, 1);
                gl.uniform1i(advectionProg.uniforms.uVelocity, 0);
                gl.uniform1i(advectionProg.uniforms.uSource, 1);
                gl.uniform1f(advectionProg.uniforms.dissipation, config.DENSITY_DISSIPATION);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
                blit(density.write.fbo);
                density.swap();
                
                curlProg.bind();
                gl.viewport(0, 0, simTexWidth, simTexHeight);
                gl.uniform2f(curlProg.uniforms.texelSize, 1.0 / simTexWidth, 1.0 / simTexHeight);
                gl.uniform1i(curlProg.uniforms.uVelocity, 0);
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
            gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
            blit(null);
            
            requestAnimationFrame(update);
        }
        
        function renderLayers() {
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
                                <button class="layer-btn" onclick="deleteLayer(${layer.index})">🗑️</button>
                            </div>
                        </div>
                        <div class="layer-threshold">
                            <span>Mask:</span>
                            <div class="layer-slider-host"></div>
                            <span class="layer-slider-value">${layer.threshold}%</span>
                        </div>
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
                }
                
                // Only start drags from the header
                const headerEl = element.querySelector('.layer-item-header');
                if (headerEl) headerEl.addEventListener('dragstart', handleDragStart);
                // Guard: block dragstart initiated anywhere else in the item (capture)
                element.addEventListener('dragstart', (e) => {
                    if (isLayerSliderActive || !e.target.closest('.layer-item-header')) { e.preventDefault(); e.stopPropagation(); }
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
            if (e.target && (e.target.closest('button') || e.target.closest('input') || e.target.closest('select'))) { e.preventDefault(); return; }
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
            
            console.log('Reordered layers:', layerOrder);
            
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
                console.log('Moved to top:', draggedItem);
            } else if (dropPosition === 'bottom') {
                // Add to end (bottom = furthest from viewer = lowest z-index)
                layerOrder.push(draggedItem);
                console.log('Moved to bottom:', draggedItem);
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
                    trailCanvas.style.zIndex = zIndex;
                    console.log(`Sim at visual position ${visualIndex}: z-index ${zIndex}`);
                } else {
                    const layer = layers.find(l => l.index === item.id);
                    if (layer) {
                        const layerDiv = document.getElementById(`layer${layer.index}`);
                        if (layerDiv) {
                            layerDiv.style.zIndex = zIndex;
                            layerDiv.style.display = layer.visible ? 'block' : 'none';
                            layerDiv.style.transform = `translate(${layer.x}px, ${layer.y}px) scale(${layer.scaleX}, ${layer.scaleY})`;
                            
                            // Apply active class
                            if (layer.active) {
                                layerDiv.classList.add('active');
                            } else {
                                layerDiv.classList.remove('active');
                            }
                            
                            console.log(`Layer ${layer.index} at visual position ${visualIndex}: z-index ${zIndex}`);
                        }
                    }
                }
            });
        }
        
        window.toggleSimLayer = () => {
            const isVisible = canvas.style.display !== 'none';
            canvas.style.display = isVisible ? 'none' : 'block';
            trailCanvas.style.display = isVisible ? 'none' : 'block';
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
            
            // Remove from layerOrder array
            layerOrder = layerOrder.filter(item => !(item.type === 'layer' && item.id === index));
            
            // Re-render and update z-indices
            renderLayers();
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
            } else {
                layerDiv.classList.remove('active');
                activeLayerIndex = null;
                removeLayerResizeHandles(index);
            }
            
            renderLayers();
        };
        
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
                // Improve pen/touch UX
                div.style.touchAction = 'none';
                div.style.userSelect = 'none';
                div.addEventListener('pointerdown', handleLayerResizeStart);
                layerDiv.appendChild(div);
            });
        }
        
        function removeLayerResizeHandles(index) {
            const layerDiv = document.getElementById(`layer${index}`);
            if (!layerDiv) return;
            
            const handles = layerDiv.querySelectorAll('.layer-resize-handle');
            handles.forEach(handle => handle.remove());
        }
        
        // Layer resize functionality
        let isResizingLayer = false;
        let layerResizeDirection = null;
        let resizeLayerIndex = null;
        let layerResizeStartX = 0;
        let layerResizeStartY = 0;
        let layerResizeStartScaleX = 1;
        let layerResizeStartScaleY = 1;
        let layerResizeStartPosX = 0;
        let layerResizeStartPosY = 0;
        let layerResizePointerId = null;
        let layerResizeHandleEl = null;
        
        function handleLayerResizeStart(e) {
            // Allow pen/touch; restrict mouse to left button
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
        }
        
        // Add pointer event listeners to canvas wrapper for layer dragging
        canvasWrapper.style.touchAction = 'none';
        canvasWrapper.addEventListener('pointerdown', (e) => {
            // Do not start layer dragging if the target is a slider
            if (e.target && e.target.closest && e.target.closest('input[type="range"]')) return;
            if (activeLayerIndex === null) return;
            
            // Don't start dragging if clicking on a resize handle 
            if (e.target.classList.contains('layer-resize-handle')) return;
            // Allow pen/touch; restrict mouse to left button
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            
            const layer = layers.find(l => l.index === activeLayerIndex);
            if (!layer || !layer.active) return;
            
            // Check if clicking on the active layer
            const layerDiv = document.getElementById(`layer${activeLayerIndex}`);
            if (!layerDiv) return;
            
            isDraggingLayer = true;
            layerDragStartX = e.clientX;
            layerDragStartY = e.clientY;
            layerStartX = layer.x;
            layerStartY = layer.y;
            layerDragPointerId = e.pointerId;
            layerDragCaptureEl = canvasWrapper;
            try { if (layerDragCaptureEl && layerDragCaptureEl.setPointerCapture) layerDragCaptureEl.setPointerCapture(e.pointerId); } catch (_) {}
            
            e.preventDefault();
        });
        
        document.addEventListener('pointermove', (e) => {
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
                        layer.x = layerResizeStartPosX + deltaX;
                        break;
                    case 'ne': // Top-right
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX + scaleFactorX * 2);
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY - scaleFactorY * 2);
                        layer.y = layerResizeStartPosY + deltaY;
                        break;
                    case 'nw': // Top-left
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX - scaleFactorX * 2);
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY - scaleFactorY * 2);
                        layer.x = layerResizeStartPosX + deltaX;
                        layer.y = layerResizeStartPosY + deltaY;
                        break;
                    case 'e': // Right edge
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX + scaleFactorX * 2);
                        break;
                    case 'w': // Left edge
                        layer.scaleX = Math.max(0.1, layerResizeStartScaleX - scaleFactorX * 2);
                        layer.x = layerResizeStartPosX + deltaX;
                        break;
                    case 's': // Bottom edge
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY + scaleFactorY * 2);
                        break;
                    case 'n': // Top edge
                        layer.scaleY = Math.max(0.1, layerResizeStartScaleY - scaleFactorY * 2);
                        layer.y = layerResizeStartPosY + deltaY;
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
            }
            if (isResizingLayer && (layerResizePointerId == null || e.pointerId === layerResizePointerId)) {
                isResizingLayer = false;
                layerResizeDirection = null;
                resizeLayerIndex = null;
                try { if (layerResizeHandleEl && layerResizeHandleEl.releasePointerCapture) layerResizeHandleEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerResizePointerId = null;
                layerResizeHandleEl = null;
            }
        });
        document.addEventListener('pointercancel', (e) => {
            if (isDraggingLayer && (layerDragPointerId == null || e.pointerId === layerDragPointerId)) {
                isDraggingLayer = false;
                try { if (layerDragCaptureEl && layerDragCaptureEl.releasePointerCapture) layerDragCaptureEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerDragPointerId = null;
                layerDragCaptureEl = null;
            }
            if (isResizingLayer && (layerResizePointerId == null || e.pointerId === layerResizePointerId)) {
                isResizingLayer = false;
                layerResizeDirection = null;
                resizeLayerIndex = null;
                try { if (layerResizeHandleEl && layerResizeHandleEl.releasePointerCapture) layerResizeHandleEl.releasePointerCapture(e.pointerId); } catch (_) {}
                layerResizePointerId = null;
                layerResizeHandleEl = null;
            }
        });
        
        function updateLayerPosition(index) {
            const layer = layers.find(l => l.index === index);
            if (!layer) return;
            
            const layerDiv = document.getElementById(`layer${index}`);
            if (!layerDiv) return;
            
            layerDiv.style.transform = `translate(${layer.x}px, ${layer.y}px) scale(${layer.scaleX}, ${layer.scaleY})`;
        }
        
        window.updateLayerTitle = (index, title) => {
            const layer = layers.find(l => l.index === index);
            if (layer) layer.title = title;
        };
        
        window.updateLayerThreshold = (index, threshold) => {
            const layer = layers.find(l => l.index === index);
            if (!layer) return;
            
            layer.threshold = parseInt(threshold);
            
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                const ctx = tempCanvas.getContext('2d');
                
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                const data = imageData.data;
                
                const thresholdValue = (threshold / 100) * 255;
                const featherRange = 50;
                
                for (let i = 0; i < data.length; i += 4) {
                    const brightness = Math.max(data[i], data[i + 1], data[i + 2]);
                    const originalAlpha = data[i + 3];
                    
                    if (brightness <= thresholdValue - featherRange) {
                        data[i + 3] = 0;
                    } else if (brightness >= thresholdValue) {
                        data[i + 3] = originalAlpha;
                    } else {
                        const distance = brightness - (thresholdValue - featherRange);
                        const fadePercent = distance / featherRange;
                        data[i + 3] = Math.floor(originalAlpha * fadePercent);
                    }
                }
                
                ctx.putImageData(imageData, 0, 0);
                const processedData = tempCanvas.toDataURL('image/png');
                
                layer.data = processedData;
                
                const layerDiv = document.getElementById(`layer${index}`);
                if (layerDiv) {
                    layerDiv.style.backgroundImage = `url(${processedData})`;
                }
            };
            
            img.src = layer.originalData;
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
                showTrail: !!document.getElementById('trailToggle')?.checked,
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
                const trailEl = document.getElementById('trailToggle');
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
                
                if (trailEl) { trailEl.checked = !!s.showTrail; trailEl.dispatchEvent(new Event('change')); }
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
        renderLayers();
        
        // Initialize Recorded Layers UI
        setupRecUI();
        recRenderUI();
        
        update();
