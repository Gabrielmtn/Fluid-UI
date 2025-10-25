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
            in vec2 aPos;
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
            void main() {
                vec4 color = texture(uTexture, vUv);
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
        
        const buffer = gl.createBuffer();
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
        
        canvas.addEventListener('mousedown', (e) => {
            if (isPaused) return;
            
            if (e.button === 2) {
                e.preventDefault();
                isRightMouseDown = true;
                isReplayActive = true;
                replayMovements();
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
            if (recEnabled) recRecordInteraction(coords.x, coords.y, 0, 0, pointer.color);
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (isPaused || isReplayActive) return;
            const coords = getCanvasCoordinates(e);
            pointer.moved = pointer.down;
            pointer.dx = (coords.x - pointer.x) * 10.0;
            pointer.dy = (coords.y - pointer.y) * 10.0;
            pointer.x = coords.x;
            pointer.y = coords.y;
            
            if (pointer.down) {
                trackMouseMovement(e);
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
                multiplierValue.textContent = animationMultiplier + 'x';
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
        }
        
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
            curl: { key: 'CURL', decimals: 0 }
        };
        
        document.getElementById('brushSize').addEventListener('input', (e) => {
            config.SPLAT_RADIUS = e.target.value / 1000;
        });

        // Resolution dropdowns (absolute resolution, independent of display canvas size)
        const visualResSel = document.getElementById('visualResolution');
        if (visualResSel) {
            visualResSel.value = String(config.DYE_RESOLUTION);
            visualResSel.addEventListener('change', (e) => {
                const v = parseInt(e.target.value, 10);
                if (isFinite(v)) {
                    config.DYE_RESOLUTION = v;
                    window.needsFramebufferReinit = true;
                }
            });
        }
        const physicsResSel = document.getElementById('physicsResolution');
        if (physicsResSel) {
            physicsResSel.value = String(config.SIM_RESOLUTION);
            physicsResSel.addEventListener('change', (e) => {
                const v = parseInt(e.target.value, 10);
                if (isFinite(v)) {
                    config.SIM_RESOLUTION = v;
                    window.needsFramebufferReinit = true;
                }
            });
        }
        
        // Scrollwheel to adjust brush size or density (with Shift) on canvas area
        let lastDensitySnapTime = 0;
        
        canvasArea.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            if (e.shiftKey) {
                // Shift+Scroll: Adjust density
                const densitySlider = document.getElementById('densityDissipation');
                const densityValueSpan = document.getElementById('densityValue');
                let currentValue = parseFloat(densitySlider.value);
                const minValue = parseFloat(densitySlider.min);
                const maxValue = parseFloat(densitySlider.max);
                const stepSize = 0.002; // Small increment for fine control
                
                // Magnetic snap parameters
                const snapTarget = 1.0;
                const snapRange = 0.003; // Range to trigger snap
                const snapCooldown = 300; // ms before snap can trigger again
                
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
                
                // Apply momentary magnetic snap to 1.0
                const now = Date.now();
                const timeSinceLastSnap = now - lastDensitySnapTime;
                
                // Only snap if we're crossing through 1.0 and cooldown has passed
                if (timeSinceLastSnap > snapCooldown && Math.abs(newValue - snapTarget) < snapRange) {
                    newValue = snapTarget;
                    lastDensitySnapTime = now;
                }
                
                // Update slider and config
                densitySlider.value = newValue;
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
                config.SPLAT_RADIUS = newValue / 1000;
            }
        }, { passive: false });
        
        // Magnetic snap state for density slider
        let densitySnapTimeout = null;
        let densityLastValue = null;
        let densityIsSnapped = false;
        
        Object.entries(sliderConfig).forEach(([id, cfg]) => {
            const slider = document.getElementById(id);
            const valueSpan = document.getElementById(id.replace('Dissipation', '').replace('Iteration', '') + 'Value');
            
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
                document.getElementById(id).value = val;
                document.getElementById(id.replace('Dissipation', '').replace('Iteration', '') + 'Value').textContent = 
                    cfg.decimals === 0 ? Math.round(val) : val.toFixed(cfg.decimals);
            });
            document.getElementById('brushSize').value = config.SPLAT_RADIUS * 1000;
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
            
            const targetWidth = canvasWrapper.clientWidth;
            const targetHeight = canvasWrapper.clientHeight;
            
            if (canvas.width !== targetWidth || canvas.height !== targetHeight || window.needsFramebufferReinit) {
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                trailCanvas.width = targetWidth;
                trailCanvas.height = targetHeight;
                initFramebuffers();
                window.needsFramebufferReinit = false;
            }
            
            if (!isPaused) {
                
                if (pointer.moved) {
                    multiSplat(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
                    pointer.moved = false;
                }
                
                if (recEnabled) {
                    recUpdatePlayback();
                }
                
                advectionProg.bind();
                // Velocity advection at physics resolution
                gl.viewport(0, 0, simTexWidth, simTexHeight);
                gl.uniform2f(advectionProg.uniforms.texelSize, 22.0 / simTexWidth, 22.0 / simTexHeight);
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
                gl.uniform2f(advectionProg.uniforms.texelSize, 22.0 / simTexWidth, 22.0 / simTexHeight);
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
                element.draggable = true;
                element.dataset.orderIndex = idx; // Store position in order array
                
                if (item.type === 'sim') {
                    element.dataset.layerType = 'sim';
                    element.innerHTML = `
                        <div class="layer-item-header">
                            <div class="layer-thumbnail" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; font-size: 20px;">
                                🌊
                            </div>
                            <div class="layer-info">
                                <input type="text" class="layer-title" value="Sim Layer" readonly style="cursor: default;">
                            </div>
                            <div class="layer-controls">
                                <button class="layer-btn" onclick="toggleSimLayer()">
                                    ${canvas.style.display !== 'none' ? '👁️' : '👁️‍🗨️'}
                                </button>
                            </div>
                        </div>
                    `;
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
                            <input type="range" min="0" max="100" value="${layer.threshold}" 
                                   oninput="updateLayerThreshold(${layer.index}, this.value); this.nextElementSibling.textContent = this.value + '%'">
                            <span>${layer.threshold}%</span>
                        </div>
                    `;
                }
                
                element.addEventListener('dragstart', handleDragStart);
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
        
        function handleDragStart(e) {
            draggedElement = this;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
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
                div.addEventListener('mousedown', handleLayerResizeStart);
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
        
        function handleLayerResizeStart(e) {
            e.preventDefault();
            e.stopPropagation();
            
            isResizingLayer = true;
            layerResizeDirection = e.target.dataset.direction;
            resizeLayerIndex = parseInt(e.target.dataset.layerIndex);
            
            const layer = layers.find(l => l.index === resizeLayerIndex);
            if (!layer) return;
            
            layerResizeStartX = e.clientX;
            layerResizeStartY = e.clientY;
            layerResizeStartScaleX = layer.scaleX;
            layerResizeStartScaleY = layer.scaleY;
            layerResizeStartPosX = layer.x;
            layerResizeStartPosY = layer.y;
        }
        
        // Add mouse event listeners to canvas wrapper for layer dragging
        canvasWrapper.addEventListener('mousedown', (e) => {
            if (activeLayerIndex === null) return;
            
            // Don't start dragging if clicking on a resize handle 
            if (e.target.classList.contains('layer-resize-handle')) return;
            
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
            
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            // Handle layer resizing
            if (isResizingLayer && resizeLayerIndex !== null) {
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
            if (!isDraggingLayer || activeLayerIndex === null) return;
            
            const layer = layers.find(l => l.index === activeLayerIndex);
            if (!layer) return;
            
            const deltaX = e.clientX - layerDragStartX;
            const deltaY = e.clientY - layerDragStartY;
            
            layer.x = layerStartX + deltaX;
            layer.y = layerStartY + deltaY;
            
            updateLayerPosition(activeLayerIndex);
        });
        
        document.addEventListener('mouseup', () => {
            if (isDraggingLayer) {
                isDraggingLayer = false;
            }
            if (isResizingLayer) {
                isResizingLayer = false;
                layerResizeDirection = null;
                resizeLayerIndex = null;
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
                paletteIndex: (document.getElementById('paletteSelector')?.value) ? parseInt(document.getElementById('paletteSelector').value, 10) : 0,
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
                const paletteSel = document.getElementById('paletteSelector');
                const cp = document.getElementById('colorPicker');
                
                if (paletteSel && typeof applyPalette === 'function') {
                    applyPalette(String(s.paletteIndex));
                }
                if (Array.isArray(s.savedColors) && typeof colorStorage?.save === 'function') {
                    colorStorage.save(s.savedColors.slice());
                }
                
                if (rndEl) { rndEl.checked = !!s.randomOn; rndEl.dispatchEvent(new Event('change')); }
                if (stepEl) { stepEl.checked = !!s.stepOn; stepEl.dispatchEvent(new Event('change')); }
                
                if (cp) { cp.value = s.colorPickerValue || cp.value; }
                if (typeof updateColor === 'function') updateColor();
                
                const brushEl = document.getElementById('brushSize');
                if (brushEl) { brushEl.value = String(s.brushSize); config.SPLAT_RADIUS = s.brushSize / 1000; }
                
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
                const sel = document.getElementById('paletteSelector');
                if (sel) {
                    pushUndo();
                    let idx = sel.selectedIndex;
                    if (key === 'ArrowLeft') idx = Math.max(0, idx - 1); else idx = Math.min(sel.options.length - 1, idx + 1);
                    if (idx !== sel.selectedIndex) {
                        sel.selectedIndex = idx;
                        sel.dispatchEvent(new Event('change'));
                    }
                }
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
