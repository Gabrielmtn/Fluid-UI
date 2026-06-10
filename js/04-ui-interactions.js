        

        

        window.saveColor = () => {

            const color = document.getElementById('colorPicker').value;

            colorStorage.add(color);

        };

        

        window.clearColors = () => {

            colorStorage.clear();

        };

        

        function renderSavedColors() {

            const container = document.getElementById('savedColors');

            container.innerHTML = '';

            savedColors.forEach(color => {

                const wrap = document.createElement('div');

                wrap.className = 'swatch-wrap';

                const swatch = document.createElement('div');

                swatch.className = 'color-swatch';

                swatch.style.backgroundColor = color;

                swatch.onclick = () => window.setColor(color);

                const rm = document.createElement('button');

                rm.className = 'swatch-remove';

                rm.textContent = '×';

                rm.title = 'Remove color';

                rm.onclick = (e) => { e.stopPropagation(); colorStorage.remove(color); };

                wrap.appendChild(swatch);

                wrap.appendChild(rm);

                container.appendChild(wrap);

            });

        }

        

        function trackMouseMovement(e) {

            if (!pointer.down || isReplayActive) return;

            

            const position = {

                x: pointer.x,

                y: pointer.y,

                dx: pointer.dx,

                dy: pointer.dy,

                timestamp: Date.now(),

                color: [...pointer.color],

                velocity: { dx: pointer.dx, dy: pointer.dy }

            };

            

            mousePositions.push(position);

            const cutoff = position.timestamp - FADE_END;

            mousePositions = mousePositions.filter(pos => pos.timestamp >= cutoff);

        }

        

        function replayMovements() {

            if (!isRightMouseDown || !isReplayActive) {

                customCursor.style.display = 'none';

                return;

            }

            

            customCursor.style.opacity = showCursor ? '1' : '0';

            const now = Date.now();

            const replayProgress = (now % 500) / 500;

            

            mousePositions.forEach((pos, index) => {

                const progress = index / (mousePositions.length - 1);

                if (progress <= replayProgress) {

                    splat(pos.x, pos.y, pos.velocity.dx, pos.velocity.dy, pos.color);

                    

                    if (Math.abs(progress - replayProgress) < 0.1) {

                        customCursor.style.display = 'block';

                        customCursor.style.left = (pos.x - 13) + 'px';

                        customCursor.style.top = (pos.y - 13) + 'px';

                    }

                }

            });

            

            requestAnimationFrame(replayMovements);

        }

        

        const gl = canvas.getContext('webgl2', {

            alpha: true,

            depth: false,

            stencil: false,

            antialias: false,

            preserveDrawingBuffer: false,  // Disabled for performance (enable if canvas export needed)

            desynchronized: true,          // Lower latency rendering

            powerPreference: 'high-performance'

        });

        

        // Expose for stats panel

        window.gl = gl;

        

        gl.getExtension('EXT_color_buffer_float');

        const linearExt = gl.getExtension('OES_texture_float_linear');

        try { window.linearExt = linearExt; } catch(_) {}

        gl.clearColor(0, 0, 0, 0);

        gl.enable(gl.BLEND);

        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        

        let config = {

            TEXTURE_DOWNSAMPLE: 1,

            DENSITY_DISSIPATION: 0.993,

            VELOCITY_DISSIPATION: 0.999,

            PRESSURE_DISSIPATION: 0.944,

            PRESSURE_ITERATIONS: 32,  // 32 gives clean incompressible flow without being expensive

            CURL: 25,                 // Strong vortices for visually interesting fluid on first load

            SPLAT_RADIUS: 0.011,

            SHARPNESS: 0.8,           // Adaptive sharpness (0.0 = off, 1.0 = moderate, 2.0 = aggressive)

            CLARITY: 0,               // Local contrast enhancement (0 = off, 1.0 = max)

            VIBRANCE: 0,              // Selective saturation boost (0 = off, 1.0 = max)

            DYE_RESOLUTION: 1024,     // 1024 looks great, 2048 is overkill

            SIM_RESOLUTION: 384,      // 384 gives noticeably better physics detail than 256

            VELOCITY_INFLUENCE: 2.5   // Motion isolation (1.0 = full motion, 5.0 = maximum isolation)

        };

        

        // Expose for stats panel

        window.config = config;

        // Snapshot baseline for potential adaptive logic

        window.baselineConfig = {

            DYE_RESOLUTION: config.DYE_RESOLUTION,

            SIM_RESOLUTION: config.SIM_RESOLUTION,

            PRESSURE_ITERATIONS: config.PRESSURE_ITERATIONS

        };

        

        // Mobile defaults: reduce load for iOS/Android WebKit and smaller GPUs

        (function applyMobileDefaults(){

            try {

                const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

                if (isMobile) {

                    config.DYE_RESOLUTION = 512;   // Lower for mobile (was 1024)

                    config.SIM_RESOLUTION = 128;   // Lower for mobile (was 256)

                    config.PRESSURE_ITERATIONS = 15; // Fewer iterations (was 40)

                    config.SHARPNESS = 0.0;        // Disable sharpening on mobile

                    config.SPLAT_RADIUS = 0.012;   // Slightly larger for touch

                }

            } catch(_) {}

        })();

        

        const presets = {

            silky: { DENSITY_DISSIPATION: 0.9995, VELOCITY_DISSIPATION: 1.0001, PRESSURE_DISSIPATION: 0.8, PRESSURE_ITERATIONS: 20, CURL: 30, SPLAT_RADIUS: 0.011 },

            thick: { DENSITY_DISSIPATION: 0.999, VELOCITY_DISSIPATION: 0.99, PRESSURE_DISSIPATION: 0.95, PRESSURE_ITERATIONS: 35, CURL: 1, SPLAT_RADIUS: 0.015 },  // Was 120

            wispy: { DENSITY_DISSIPATION: 0.9972, VELOCITY_DISSIPATION: 0.9996, PRESSURE_DISSIPATION: 0.92, PRESSURE_ITERATIONS: 25, CURL: 60, SPLAT_RADIUS: 0.01 },  // Was 40

            chaotic: { DENSITY_DISSIPATION: 0.996, VELOCITY_DISSIPATION: 0.9938, PRESSURE_DISSIPATION: 0.934, PRESSURE_ITERATIONS: 25, CURL: 12, SPLAT_RADIUS: 0.0151 },

            ethereal: { DENSITY_DISSIPATION: 0.9998, VELOCITY_DISSIPATION: 1.0005, PRESSURE_DISSIPATION: 0.75, PRESSURE_ITERATIONS: 15, CURL: 45, SPLAT_RADIUS: 0.008 },

            turbulent: { DENSITY_DISSIPATION: 0.994, VELOCITY_DISSIPATION: 0.997, PRESSURE_DISSIPATION: 0.88, PRESSURE_ITERATIONS: 30, CURL: 55, SPLAT_RADIUS: 0.013 },  // Was 60

            marble: { DENSITY_DISSIPATION: 0.9992, VELOCITY_DISSIPATION: 0.9985, PRESSURE_DISSIPATION: 0.98, PRESSURE_ITERATIONS: 35, CURL: 8, SPLAT_RADIUS: 0.018 },  // Was 100

            electric: { DENSITY_DISSIPATION: 0.9965, VELOCITY_DISSIPATION: 1.0008, PRESSURE_DISSIPATION: 0.82, PRESSURE_ITERATIONS: 25, CURL: 52, SPLAT_RADIUS: 0.006 }  // Was 35

        };

        

        window.applyPreset = (name) => {

            const preset = presets[name];

            if (!preset) return;



            activePreset = name;

            

            // Instant application - zero overhead

            Object.assign(config, preset);

            

            // Single DOM update

            updateSliderValues();

            

            // Update button states

            updatePresetButtons();

            

            // Deactivate performance profile — style preset overrides profile settings

            if (typeof window.clearActiveProfile === 'function') window.clearActiveProfile();



            // Broadcast to multiplayer clients

            if (typeof broadcastPreset === 'function') {

                broadcastPreset(name);

            }

        };

        

        function updatePresetButtons() {

            const presetContainer = document.querySelector('.presets');

            if (!presetContainer) return;

            

            const buttons = presetContainer.querySelectorAll('button');

            buttons.forEach(btn => {

                const presetName = btn.textContent.trim().toLowerCase();

                if (presetName === activePreset) {

                    btn.classList.add('active');

                } else {

                    btn.classList.remove('active');

                }

            });

        }

        

        // Clear active preset when user manually changes settings

        function clearActivePreset() {

            if (activePreset) {

                activePreset = null;

                updatePresetButtons();

            }

        }

        

        // Expose to window for slider listeners

        window.clearActivePreset = clearActivePreset;

        

        window.toggleFreeze = () => {

            const freezeBtn = document.getElementById('freezeBtn');

            const isUnfreezing = freezeBtn.textContent.includes('Unfreeze');

            

            freezeBtn.textContent = isUnfreezing ? '❄️ Freeze' : '🔥 Unfreeze';

            if (isUnfreezing) {

                freezeBtn.classList.remove('active');

            } else {

                freezeBtn.classList.add('active');

            }

            

            if (!isUnfreezing) {

                // Freeze: save current values and set to freeze state

                savedDensity = config.DENSITY_DISSIPATION;

                savedVelocity = config.VELOCITY_DISSIPATION;

                config.DENSITY_DISSIPATION = 1.0;

                config.VELOCITY_DISSIPATION = 0.9;

            } else {

                // Unfreeze: restore saved values

                config.DENSITY_DISSIPATION = savedDensity;

                config.VELOCITY_DISSIPATION = savedVelocity;

            }

            

            // Single DOM update

            updateSliderValues();

        };

        

        window.playExpandAnimation = () => {

            const centerX = canvas.width / 2;

            const centerY = canvas.height / 2;

            

            // Phase 1: 4 drags from center to each corner

            const corners = [

                { x: canvas.width * 0.1, y: canvas.height * 0.1 },   // Top-left

                { x: canvas.width * 0.9, y: canvas.height * 0.1 },   // Top-right

                { x: canvas.width * 0.1, y: canvas.height * 0.9 },   // Bottom-left

                { x: canvas.width * 0.9, y: canvas.height * 0.9 }    // Bottom-right

            ];

            

            const cornerColors = [

                [0.9, 0.1, 0.2],  // Red

                [0.1, 0.9, 0.2],  // Green

                [0.1, 0.2, 0.9],  // Blue

                [0.9, 0.9, 0.1]   // Yellow

            ];

            

            // Animate to corners simultaneously

            corners.forEach((corner, idx) => {

                const steps = 20;

                const color = cornerColors[idx];

                

                for (let i = 0; i <= steps; i++) {

                    setTimeout(() => {

                        const progress = i / steps;

                        const x = centerX + (corner.x - centerX) * progress;

                        const y = centerY + (corner.y - centerY) * progress;

                        const dx = (corner.x - centerX) / steps * 2;

                        const dy = (corner.y - centerY) / steps * 2;

                        splat(x, y, dx, dy, color);

                    }, i * 25);

                }

            });

            

            // Phase 2: After pause, 4 outward drags in cardinal directions

            setTimeout(() => {

                const cardinals = [

                    { startX: centerX, startY: centerY, endX: centerX, endY: canvas.height * 0.05 },        // Up

                    { startX: centerX, startY: centerY, endX: canvas.width * 0.95, endY: centerY },         // Right

                    { startX: centerX, startY: centerY, endX: centerX, endY: canvas.height * 0.95 },        // Down

                    { startX: centerX, startY: centerY, endX: canvas.width * 0.05, endY: centerY }          // Left

                ];

                

                const cardinalColors = [

                    [0.9, 0.1, 0.9],  // Magenta

                    [0.1, 0.9, 0.9],  // Cyan

                    [0.9, 0.5, 0.1],  // Orange

                    [0.5, 0.1, 0.9]   // Purple

                ];

                

                cardinals.forEach((dir, idx) => {

                    const steps = 25;

                    const color = cardinalColors[idx];

                    

                    for (let i = 0; i <= steps; i++) {

                        setTimeout(() => {

                            const progress = i / steps;

                            const x = dir.startX + (dir.endX - dir.startX) * progress;

                            const y = dir.startY + (dir.endY - dir.startY) * progress;

                            const dx = (dir.endX - dir.startX) / steps * 3;

                            const dy = (dir.endY - dir.startY) / steps * 3;

                            splat(x, y, dx, dy, color);

                        }, i * 20);

                    }

                });

            }, 600); // Pause before cardinal expansion

        };

        

        window.playSmashAnimation = () => {

            const centerY = canvas.height / 2;

            const leftX = canvas.width * 0.2;

            const rightX = canvas.width * 0.8;

            const targetX = canvas.width / 2;

            

            // Add some randomness to the collision point

            const randomOffsetY = (Math.random() - 0.5) * canvas.height * 0.2;

            const randomOffsetX = (Math.random() - 0.5) * canvas.width * 0.1;

            const collisionY = centerY + randomOffsetY;

            const collisionX = targetX + randomOffsetX;

            

            // Generate random colors

            const color1 = pointer.color;

            const color2 = window.generateVibrantColor ? window.generateVibrantColor() : [Math.random(), Math.random(), Math.random()];

            

            // Left side smash (comes in first)

            setTimeout(() => {

                const steps = 15;

                for (let i = 0; i <= steps; i++) {

                    setTimeout(() => {

                        const progress = i / steps;

                        const x = leftX + (collisionX - leftX) * progress;

                        const y = collisionY + (Math.random() - 0.5) * 20;

                        const dx = (collisionX - leftX) / steps * 2;

                        const dy = (Math.random() - 0.5) * 2;

                        splat(x, y, dx, dy, color1);

                    }, i * 20);

                }

            }, 0);

            

            // Right side smash (comes in slightly after)

            setTimeout(() => {

                const steps = 15;

                for (let i = 0; i <= steps; i++) {

                    setTimeout(() => {

                        const progress = i / steps;

                        const x = rightX + (collisionX - rightX) * progress;

                        const y = collisionY + (Math.random() - 0.5) * 20;

                        const dx = (collisionX - rightX) / steps * 2;

                        const dy = (Math.random() - 0.5) * 2;

                        splat(x, y, dx, dy, color2);

                    }, i * 20);

                }

            }, 150);

        };

        

        // Jellyfish origin debounce

        let jellyfishOrigin = null;

        let jellyfishOriginTimeout = null;

        

        window.playJellyfishAnimation = () => {

            // Use existing origin if within debounce window, otherwise create new one

            if (!jellyfishOrigin) {

                jellyfishOrigin = {

                    x: canvas.width * (0.3 + Math.random() * 0.4),

                    y: canvas.height * (0.85 + Math.random() * 0.1) // Start at bottom (85-95%)

                };

            }

            

            const originX = jellyfishOrigin.x;

            const originY = jellyfishOrigin.y;

            

            // Reset debounce timer - origin stays for 3 seconds after last click

            if (jellyfishOriginTimeout) {

                clearTimeout(jellyfishOriginTimeout);

            }

            jellyfishOriginTimeout = setTimeout(() => {

                jellyfishOrigin = null;

            }, 3000);

            

            // Random pulse count (4-7 pulses)

            const pulseCount = 4 + Math.floor(Math.random() * 4);

            

            for (let pulse = 0; pulse < pulseCount; pulse++) {

                setTimeout(() => {

                    const steps = 12;

                    const randomColor = window.generateVibrantColor ? window.generateVibrantColor() : [Math.random(), Math.random(), Math.random()];

                    

                    // Random base velocity for this pulse

                    const baseVelocity = -10 - Math.random() * 6;

                    

                    for (let i = 0; i < steps; i++) {

                        setTimeout(() => {

                            // Easing for more natural motion (starts fast, slows down)

                            const progress = i / steps;

                            const easing = 1 - Math.pow(1 - progress, 2);

                            

                            // Spread out from center as it goes up

                            const spreadAmount = easing * 80;

                            const randomSpread = (Math.random() - 0.5) * spreadAmount;

                            const x = originX + randomSpread;

                            const y = originY - (easing * 200);

                            

                            // Velocity decreases with easing, but stays vertical

                            const velocityMultiplier = 1 - (progress * 0.7);

                            const dx = randomSpread * 0.15;

                            const dy = baseVelocity * velocityMultiplier;

                            

                            splat(x, y, dx, dy, randomColor);

                        }, i * 25);

                    }

                }, pulse * 250);

            }

        };

        

        window.playJellyfishSwarm = () => {

            // Save original settings

            const originalCurl = config.CURL;

            const originalVelocity = config.VELOCITY_DISSIPATION;

            const originalDensity = config.DENSITY_DISSIPATION;

            

            // Use the great settings from the screenshot

            config.CURL = 40;

            config.VELOCITY_DISSIPATION = 0.9888;

            config.DENSITY_DISSIPATION = 0.9934;

            

            // Create 3 locations spread across X axis

            const locationCount = 3;

            const locations = [];

            

            // Generate locations spread across center 80% of X axis

            for (let i = 0; i < locationCount; i++) {

                const xPos = canvas.width * (0.1 + (i / (locationCount - 1)) * 0.8);

                locations.push({ x: xPos, y: null });

            }

            

            // Assign Y positions (origin heights) with variety

            for (let i = 0; i < locationCount; i++) {

                // Use full variety of heights since we only have 3 locations

                const yHeight = 0.65 + Math.random() * 0.2; // Range (65-85%)

                locations[i].y = canvas.height * yHeight;

            }

            

            // For each location, spawn 3 jellyfish in sequence

            locations.forEach((location, locIndex) => {

                for (let j = 0; j < 3; j++) {

                    setTimeout(() => {

                        const jellyfishX = location.x;

                        const jellyfishY = location.y;

                        

                        // Medium pulses (4-5 pulses)

                        const pulseCount = 4 + Math.floor(Math.random() * 2);

                        const jellyfishColor = window.generateVibrantColor ? window.generateVibrantColor() : [Math.random(), Math.random(), Math.random()];

                        

                        // Stronger velocity for nice jelly shapes

                        const baseVelocity = -7 - Math.random() * 3;

                        

                        for (let pulse = 0; pulse < pulseCount; pulse++) {

                            setTimeout(() => {

                                const steps = 14;

                                

                                for (let i = 0; i < steps; i++) {

                                    setTimeout(() => {

                                        const progress = i / steps;

                                        const easing = 1 - Math.pow(1 - progress, 2);

                                        

                                        // More spread for jellyfish shape

                                        const spreadAmount = easing * 35;

                                        const randomSpread = (Math.random() - 0.5) * spreadAmount;

                                        const x = jellyfishX + randomSpread;

                                        const y = jellyfishY - (easing * 140);

                                        

                                        const velocityMultiplier = 1 - (progress * 0.6);

                                        const dx = randomSpread * 0.12;

                                        const dy = baseVelocity * velocityMultiplier;

                                        

                                        // Bigger brush size for nice jellies

                                        const originalBrush = config.SPLAT_RADIUS;

                                        config.SPLAT_RADIUS = 0.005;

                                        splat(x, y, dx, dy, jellyfishColor);

                                        config.SPLAT_RADIUS = originalBrush;

                                    }, i * 25);

                                }

                            }, pulse * 220);

                        }

                    }, (locIndex * 3 + j) * 200); // Stagger each jellyfish

                }

            });

            

            // Restore settings after swarm completes

            setTimeout(() => {

                config.CURL = originalCurl;

                config.VELOCITY_DISSIPATION = originalVelocity;

                config.DENSITY_DISSIPATION = originalDensity;

            }, 5000);

        };

        

        window.playVortexAnimation = (clockwise = true) => {

            // Save original settings

            const originalBrush = config.SPLAT_RADIUS;

            const originalDensity = config.DENSITY_DISSIPATION;

            const originalCurl = config.CURL;

            

            // Reduce curl for cleaner spirals

            config.CURL = 10;

            

            const centerX = canvas.width * 0.5;

            const centerY = canvas.height * 0.5;

            const numStreams = 3; // 3 streams per vortex (6 total)

            const rotations = 1.5; // Fewer rotations for more spread

            const steps = 50; // Fewer steps for more spacing

            

            // Neon colors - bright and saturated

            const streamColors = [

                [1.0, 0.0, 0.4],  // Neon pink

                [0.0, 1.0, 0.3],  // Neon green

                [0.0, 0.4, 1.0]   // Neon blue

            ];

            

            // Outer vortex - starts from edge, ends at mid-radius

            for (let stream = 0; stream < numStreams; stream++) {

                const startAngle = (stream / numStreams) * Math.PI * 2;

                const color = streamColors[stream];

                

                for (let i = 0; i <= steps; i++) {

                    setTimeout(() => {

                        const progress = i / steps;

                        

                        // Modulate brush size - smaller as we approach center

                        const brushSize = 0.008 * (1 - progress * 0.7); // 0.008 to 0.0024

                        config.SPLAT_RADIUS = brushSize;

                        

                        // Modulate density - higher sustain as we approach center

                        const densitySustain = 0.992 + progress * 0.007; // 0.992 to 0.999

                        config.DENSITY_DISSIPATION = densitySustain;

                        

                        // Outer vortex: from 45% radius to 20% radius (doesn't reach center)

                        const maxRadius = Math.min(canvas.width, canvas.height) * 0.45;

                        const minRadius = Math.min(canvas.width, canvas.height) * 0.20;

                        const radius = maxRadius - (maxRadius - minRadius) * progress;

                        

                        // Angle increases as we spiral in

                        const direction = clockwise ? 1 : -1;

                        const angle = startAngle + direction * rotations * Math.PI * 2 * progress;

                        

                        const x = centerX + radius * Math.cos(angle);

                        const y = centerY + radius * Math.sin(angle);

                        

                        // Velocity tangent to the spiral

                        const speed = 7;

                        const tangentAngle = angle + direction * Math.PI / 2;

                        const dx = speed * Math.cos(tangentAngle) - radius * 0.08 * Math.cos(angle);

                        const dy = speed * Math.sin(tangentAngle) - radius * 0.08 * Math.sin(angle);

                        

                        splat(x, y, dx, dy, color);

                    }, i * 40 + stream * 250); // Even more spacing

                }

            }

            

            // Inner vortex - covers center area, offset angle

            for (let stream = 0; stream < numStreams; stream++) {

                const startAngle = (stream / numStreams) * Math.PI * 2 + Math.PI / numStreams; // Offset by half

                const color = streamColors[(stream + 1) % numStreams]; // Different color order

                

                for (let i = 0; i <= steps; i++) {

                    setTimeout(() => {

                        const progress = i / steps;

                        

                        // Modulate brush size - smaller as we approach center

                        const brushSize = 0.006 * (1 - progress * 0.6); // 0.006 to 0.0024

                        config.SPLAT_RADIUS = brushSize;

                        

                        // Modulate density - higher sustain as we approach center

                        const densitySustain = 0.992 + progress * 0.007; // 0.992 to 0.999

                        config.DENSITY_DISSIPATION = densitySustain;

                        

                        // Inner vortex: from 18% radius to 3% radius (covers center without point)

                        const maxRadius = Math.min(canvas.width, canvas.height) * 0.18;

                        const minRadius = Math.min(canvas.width, canvas.height) * 0.03;

                        const radius = maxRadius - (maxRadius - minRadius) * progress;

                        

                        // Angle increases as we spiral in

                        const direction = clockwise ? 1 : -1;

                        const angle = startAngle + direction * rotations * Math.PI * 2 * progress;

                        

                        const x = centerX + radius * Math.cos(angle);

                        const y = centerY + radius * Math.sin(angle);

                        

                        // Velocity tangent to the spiral

                        const speed = 6;

                        const tangentAngle = angle + direction * Math.PI / 2;

                        const dx = speed * Math.cos(tangentAngle) - radius * 0.08 * Math.cos(angle);

                        const dy = speed * Math.sin(tangentAngle) - radius * 0.08 * Math.sin(angle);

                        

                        splat(x, y, dx, dy, color);

                    }, i * 40 + stream * 250 + 500); // Start inner vortex later with more spacing

                }

            }

            

            // After animation completes, smoothly transition settings

            const animationEndTime = steps * 40 + 500 + numStreams * 250 + 500;

            

            setTimeout(() => {

                // Smooth decay phase - gradually reduce density over 500ms

                const decayDuration = 500;

                const decaySteps = 20;

                let decayStep = 0;

                

                const decayInterval = setInterval(() => {

                    decayStep++;

                    const decayProgress = decayStep / decaySteps;

                    

                    // Smoothly transition from 0.999 to 0.985 to 0.9999

                    if (decayProgress <= 0.6) {

                        // First 60%: decay from 0.999 to 0.985

                        const phase1Progress = decayProgress / 0.6;

                        config.DENSITY_DISSIPATION = 0.999 - (0.014 * phase1Progress);

                    } else {

                        // Last 40%: ramp up from 0.985 to 0.9999

                        const phase2Progress = (decayProgress - 0.6) / 0.4;

                        config.DENSITY_DISSIPATION = 0.985 + (0.0149 * phase2Progress);

                    }

                    

                    if (decayStep >= decaySteps) {

                        clearInterval(decayInterval);

                        config.DENSITY_DISSIPATION = 0.9999; // Lock at maximum

                        config.SPLAT_RADIUS = originalBrush;

                        config.CURL = originalCurl;

                        

                        // Restore original density after a longer period

                        setTimeout(() => {

                            config.DENSITY_DISSIPATION = originalDensity;

                        }, 5000);

                    }

                }, decayDuration / decaySteps);

            }, animationEndTime);

        };

        

        // Setup vortex button click handlers

        const vortexBtn = document.getElementById('vortexBtn');

        vortexBtn.addEventListener('click', (e) => {

            e.preventDefault();

            playVortexAnimation(true); // Clockwise

        });

        vortexBtn.addEventListener('contextmenu', (e) => {

            e.preventDefault();

            playVortexAnimation(false); // Counter-clockwise

        });

        

        // Setup smash button click handlers

        const smashBtn = document.getElementById('smashBtn');

        smashBtn.addEventListener('click', (e) => {

            e.preventDefault();

            playSmashAnimation();

        });

        smashBtn.addEventListener('contextmenu', (e) => {

            e.preventDefault();

            playExpandAnimation();

        });

        

        // Setup jellyfish button click handlers

        const jellyfishBtn = document.getElementById('jellyfishBtn');

        jellyfishBtn.addEventListener('click', (e) => {

            e.preventDefault();

            playJellyfishAnimation();

        });

        jellyfishBtn.addEventListener('contextmenu', (e) => {

            e.preventDefault();

            playJellyfishSwarm();

        });

        

        // ── Ascend animation (toggle) ─────────────────────────────

        let ascendActive = false;

        let ascendAnimationId = null;

        

        window.toggleAscend = (forceState) => {

            ascendActive = typeof forceState === 'boolean' ? forceState : !ascendActive;

            const cb = document.getElementById('ascendToggle');

            if (cb) cb.checked = ascendActive;

            const panel = document.getElementById('ascendSettings');

            if (panel) panel.classList.toggle('open', ascendActive);

            

            if (ascendActive) {

                startAscendAnimation();

            } else if (ascendAnimationId) {

                clearTimeout(ascendAnimationId);

                ascendAnimationId = null;

            }

        };

        

        function startAscendAnimation() {

            if (!ascendActive) return;

            

            const originalDensity = config.DENSITY_DISSIPATION;

            const originalVelocity = config.VELOCITY_DISSIPATION;

            const originalBrush = config.SPLAT_RADIUS;

            

            config.DENSITY_DISSIPATION = 0.999;

            config.VELOCITY_DISSIPATION = 1.0;

            config.SPLAT_RADIUS = 0.008;

            

            const centerX = canvas.width * 0.5;

            const startY = canvas.height * 0.95;

            const endY = canvas.height * 0.05;

            const steps = 600;

            const randomnessEnabled = document.getElementById('ascendRandomness').checked;

            

            let currentStep = 0;

            let listingPhase = 0;

            let spurtCounter = 0;

            

            function animateStep() {

                if (!ascendActive) {

                    config.DENSITY_DISSIPATION = originalDensity;

                    config.VELOCITY_DISSIPATION = originalVelocity;

                    config.SPLAT_RADIUS = originalBrush;

                    return;

                }

                

                const progress = currentStep / steps;

                const y = startY - (startY - endY) * progress;

                

                let x = centerX;

                if (randomnessEnabled) {

                    listingPhase += 0.05;

                    x = centerX + Math.sin(listingPhase) * 50;

                }

                

                const color = window.generateVibrantColor ? window.generateVibrantColor() : [Math.random(), Math.random(), Math.random()];

                const dx = randomnessEnabled ? Math.sin(listingPhase) * 0.8 : 0;

                const dy = -8;

                splat(x, y, dx, dy, color);

                

                spurtCounter++;

                if (spurtCounter >= 60 + Math.random() * 40) {

                    spurtCounter = 0;

                    const spurtCount = 8 + Math.floor(Math.random() * 5);

                    const spurtColors = [[0.9,0.1,0.2],[0.1,0.9,0.2],[0.1,0.2,0.9],[0.9,0.9,0.1],[0.9,0.1,0.9],[0.1,0.9,0.9]];

                    const spurtColor = spurtColors[Math.floor(Math.random() * 6)];

                    for (let i = 0; i < spurtCount; i++) {

                        setTimeout(() => {

                            const spurtX = centerX + (Math.random() - 0.5) * 20;

                            const p = i / (spurtCount - 1);

                            const spurtDy = (-12 - Math.random() * 4) * (1 + p * 1.2);

                            splat(spurtX, startY, (Math.random() - 0.5) * 2, spurtDy, spurtColor);

                        }, i * 30);

                    }

                }

                

                currentStep++;

                if (currentStep >= steps) { currentStep = 0; listingPhase = 0; }

                ascendAnimationId = setTimeout(animateStep, 50);

            }

            animateStep();

        }

        

        // Wire ascend toggle (now a checkbox) — clicking anywhere on the row toggles it

        const ascendCb = document.getElementById('ascendToggle');

        if (ascendCb) {

            ascendCb.addEventListener('change', () => toggleAscend(ascendCb.checked));

            const ascendRow = ascendCb.closest('.anim-toggle-row') || ascendCb.parentElement?.parentElement;

            if (ascendRow) {

                ascendRow.addEventListener('click', (e) => {

                    if (e.target.closest('.anim-switch')) return; // already handled by label/input

                    ascendCb.checked = !ascendCb.checked;

                    ascendCb.dispatchEvent(new Event('change', { bubbles: true }));

                });

            }

        }

        

        // ── Shooting Star animation (toggle) ─────────────────────

        let ssActive = false;

        let ssTimerId = null;

        let ssStars = []; // active shooting star arcs

        

        // Config read from sliders

        let ssFrequency = 2.0;  // stars per second

        let ssAngleDeg = 120;   // launch angle in degrees (120° = down-left in canvas coords)

        let ssLength = 0.4;     // arc duration in seconds

        let ssSize = 0.5;       // size multiplier

        let ssGravity = 0.10;    // downward pull (0 = straight, 1 = heavy droop)

        // Origin as % of canvas: 0,0 = top-left corner of frame, 100,100 = bottom-right

        // Values outside 0-100 are off-screen (the whole point)

        let ssOriginX = -30;    // default: 30% off the left edge

        let ssOriginY = 0;      // default: top edge

        let ssVariance = 15;    // scatter radius in % of canvas

        

        window.toggleShootingStar = (forceState) => {

            ssActive = typeof forceState === 'boolean' ? forceState : !ssActive;

            const cb = document.getElementById('shootingStarToggle');

            if (cb) cb.checked = ssActive;

            const panel = document.getElementById('shootingStarSettings');

            if (panel) panel.classList.toggle('open', ssActive);

            

            if (ssActive) {

                startShootingStars();

            } else {

                if (ssTimerId) { clearInterval(ssTimerId); ssTimerId = null; }

                ssStars.length = 0;

            }

        };

        

        function startShootingStars() {

            if (ssTimerId) clearInterval(ssTimerId);

            scheduleNextStar();

        }

        

        function scheduleNextStar() {

            if (!ssActive) return;

            const intervalMs = 1000 / Math.max(0.2, ssFrequency);

            // Add ±30% jitter so stars don't feel mechanical

            const jitter = intervalMs * (0.7 + Math.random() * 0.6);

            ssTimerId = setTimeout(() => {

                if (!ssActive) return;

                launchStar();

                scheduleNextStar();

            }, jitter);

        }

        

        function launchStar() {

            const cw = canvas.width;

            const ch = canvas.height;

            

            // Travel direction: angle in canvas coords (0°=right, 90°=down)

            // Add ±15° randomization for natural spread

            const angleRad = (ssAngleDeg + (Math.random() - 0.5) * 30) * Math.PI / 180;

            

            // Spawn at the user-picked origin (% of canvas) + random scatter from variance

            const varPx = (ssVariance / 100) * cw;

            const varPy = (ssVariance / 100) * ch;

            const sx = (ssOriginX / 100) * cw + (Math.random() - 0.5) * 2 * varPx;

            const sy = (ssOriginY / 100) * ch + (Math.random() - 0.5) * 2 * varPy;

            

            // Streak length in pixels (based on canvas diagonal and Length slider)

            const diag = Math.sqrt(cw * cw + ch * ch);

            const streakLen = diag * (0.25 + ssLength * 0.5); // 25-75% of diagonal

            

            // High tick rate for smooth thin trails

            const FPS = 60;

            const totalSteps = Math.max(8, Math.round(ssLength * FPS));

            const stepMs = (ssLength * 1000) / totalSteps;

            const stepDist = streakLen / totalSteps;

            

            // Gravity: always bends downward (toward +Y in canvas coords)

            // Determine which perpendicular direction is "down" relative to travel

            const perpDown = Math.cos(angleRad) >= 0 ? 1 : -1;

            const curvature = perpDown * ssGravity * Math.PI;

            

            // Pick a bright color — bias toward whites/warm tones like real meteors

            let color;

            if (window.generateVibrantColor) {

                color = window.generateVibrantColor();

                // Brighten toward white for star-like appearance

                color = [

                    Math.min(1, color[0] + 0.4),

                    Math.min(1, color[1] + 0.3),

                    Math.min(1, color[2] + 0.2)

                ];

            } else {

                color = [1, 0.95, 0.8]; // warm white

            }

            

            let step = 0;

            let px = sx, py = sy;

            

            const star = { id: Date.now() + Math.random() };

            ssStars.push(star);

            

            function tick() {

                if (!ssActive || step >= totalSteps) {

                    const idx = ssStars.indexOf(star);

                    if (idx !== -1) ssStars.splice(idx, 1);

                    return;

                }

                

                const t = step / totalSteps; // 0→1

                

                // Gentle arc bend

                const curAngle = angleRad + curvature * t;

                

                // Fast head, fading tail

                const speedMult = 1.0 - t * 0.3;

                const dist = stepDist * speedMult;

                

                const nx = px + Math.cos(curAngle) * dist;

                const ny = py + Math.sin(curAngle) * dist;

                

                // High velocity aligned with travel → elongated thin splats

                const velScale = dist * 0.6;

                const dx = Math.cos(curAngle) * velScale;

                const dy = Math.sin(curAngle) * velScale;

                

                // Tiny radius: bright pinpoint head → vanishing tail

                const baseRadius = 0.0003 + (1 - t) * 0.0009;

                const headRadius = baseRadius * ssSize;

                

                // Fade opacity along the tail (bright head, dim tail)

                const fade = 1.0 - t * 0.7;

                const tailColor = [

                    color[0] * fade,

                    color[1] * fade,

                    color[2] * fade * 0.8

                ];

                

                if (typeof window.applyMultiSplatWith === 'function') {

                    window.applyMultiSplatWith(nx, ny, dx, dy, tailColor, 1, headRadius);

                } else {

                    splat(nx, ny, dx, dy, tailColor);

                }

                

                px = nx;

                py = ny;

                step++;

                

                setTimeout(tick, stepMs);

            }

            

            tick();

        }

        

        // Wire shooting star toggle + sliders

        const ssCb = document.getElementById('shootingStarToggle');

        if (ssCb) {

            ssCb.addEventListener('change', () => toggleShootingStar(ssCb.checked));

            const ssRow = ssCb.closest('.anim-toggle-row') || ssCb.parentElement?.parentElement;

            if (ssRow) {

                ssRow.addEventListener('click', (e) => {

                    if (e.target.closest('.anim-switch')) return;

                    ssCb.checked = !ssCb.checked;

                    ssCb.dispatchEvent(new Event('change', { bubbles: true }));

                });

            }

        }

        const ssFreqSlider = document.getElementById('ssFrequency');

        const ssAngleSlider = document.getElementById('ssAngle');

        const ssLengthSlider = document.getElementById('ssLength');

        if (ssFreqSlider) {

            ssFreqSlider.addEventListener('input', () => {

                ssFrequency = parseFloat(ssFreqSlider.value);

                const el = document.getElementById('ssFreqVal');

                if (el) el.textContent = ssFrequency.toFixed(1) + '/s';

            });

        }

        if (ssAngleSlider) {

            ssAngleSlider.addEventListener('input', () => {

                ssAngleDeg = parseInt(ssAngleSlider.value);

                const el = document.getElementById('ssAngleVal');

                if (el) el.textContent = ssAngleDeg + '°';

            });

        }

        if (ssLengthSlider) {

            ssLengthSlider.addEventListener('input', () => {

                ssLength = parseFloat(ssLengthSlider.value);

                const el = document.getElementById('ssLengthVal');

                if (el) el.textContent = ssLength.toFixed(1) + 's';

            });

        }

        const ssSizeSlider = document.getElementById('ssSize');

        if (ssSizeSlider) {

            ssSizeSlider.addEventListener('input', () => {

                ssSize = parseFloat(ssSizeSlider.value);

                const el = document.getElementById('ssSizeVal');

                if (el) el.textContent = ssSize.toFixed(1) + 'x';

            });

        }

        

        // ── Origin picker drag interaction ───────────────────────

        // The .ss-origin-frame element represents 0-100% of canvas.

        // The surrounding margin (20px) is the off-screen zone.

        // The dot can be dragged anywhere in the picker area (including the margin).

        // Origin coords are stored as % of canvas: <0 or >100 = off-screen.

        const ssFrame = document.getElementById('ssOriginFrame');

        const ssDot = document.getElementById('ssOriginDot');

        const ssCoords = document.getElementById('ssOriginCoords');

        

        function updateOriginDot() {

            if (!ssFrame || !ssDot) return;

            // Map ssOriginX/Y (% of canvas) → CSS left/top (% of frame element)

            ssDot.style.left = ssOriginX + '%';

            ssDot.style.top = ssOriginY + '%';

            if (ssCoords) ssCoords.textContent = Math.round(ssOriginX) + '%, ' + Math.round(ssOriginY) + '%';

        }

        

        function originFromPointer(e) {

            if (!ssFrame) return;

            const rect = ssFrame.getBoundingClientRect();

            // Pointer position relative to the frame element as % (can go outside 0-100)

            const px = ((e.clientX - rect.left) / rect.width) * 100;

            const py = ((e.clientY - rect.top) / rect.height) * 100;

            // Clamp to roughly -60% to 160% (generous off-screen range)

            ssOriginX = Math.max(-60, Math.min(160, px));

            ssOriginY = Math.max(-60, Math.min(160, py));

            updateOriginDot();

        }

        

        // Sync origin frame aspect ratio to actual canvas dimensions

        function syncFrameRatio() {

            if (!ssFrame || !canvas) return;

            const cw = canvas.width || 1;

            const ch = canvas.height || 1;

            ssFrame.style.setProperty('--ss-frame-ratio', (cw / ch).toFixed(4));

        }

        syncFrameRatio();

        // Watch for canvas size changes

        if (typeof ResizeObserver !== 'undefined' && canvas) {

            new ResizeObserver(syncFrameRatio).observe(canvas);

        }

        // Also hook into the global updateCanvasSize if available

        const origUpdateCanvasSize = window.updateCanvasSize;

        if (typeof origUpdateCanvasSize === 'function') {

            window.updateCanvasSize = function() {

                origUpdateCanvasSize.apply(this, arguments);

                syncFrameRatio();

            };

        }

        

        if (ssFrame) {

            // Use the picker container (which includes margin) as the hit area

            const ssPickerEl = document.getElementById('ssOriginPicker');

            let draggingOrigin = false;

            

            const startDrag = (e) => {

                draggingOrigin = true;

                originFromPointer(e.touches ? e.touches[0] : e);

                e.preventDefault();

            };

            const moveDrag = (e) => {

                if (!draggingOrigin) return;

                originFromPointer(e.touches ? e.touches[0] : e);

                e.preventDefault();

            };

            const endDrag = () => { draggingOrigin = false; };

            

            (ssPickerEl || ssFrame).addEventListener('mousedown', startDrag);

            document.addEventListener('mousemove', moveDrag);

            document.addEventListener('mouseup', endDrag);

            (ssPickerEl || ssFrame).addEventListener('touchstart', startDrag, { passive: false });

            document.addEventListener('touchmove', moveDrag, { passive: false });

            document.addEventListener('touchend', endDrag);

            

            // Set initial dot position

            updateOriginDot();

        }

        

        // Variance slider

        const ssGravitySlider = document.getElementById('ssGravity');

        if (ssGravitySlider) {

            ssGravitySlider.addEventListener('input', () => {

                ssGravity = parseFloat(ssGravitySlider.value);

                const el = document.getElementById('ssGravityVal');

                if (el) el.textContent = ssGravity.toFixed(2);

            });

        }

        const ssVarianceSlider = document.getElementById('ssVariance');

        if (ssVarianceSlider) {

            ssVarianceSlider.addEventListener('input', () => {

                ssVariance = parseInt(ssVarianceSlider.value);

                const el = document.getElementById('ssVarianceVal');

                if (el) el.textContent = ssVariance + '%';

            });

        }

        

        // Portal animation

        let portalAlternate = false; // Track left/right alternation

        

        window.playPortalAnimation = () => {

            // Save current multiplier and brush size

            const originalMultiplier = animationMultiplier;

            const originalBrush = config.SPLAT_RADIUS;

            

            // Set to 8x for kaleidoscope effect

            animationMultiplier = 8;

            multiplierSlider.value = 8;

            multiplierValue.textContent = '8x';

            

            // Set very small brush size to avoid blowing out

            config.SPLAT_RADIUS = 0.001;

            

            // Alternate between left and right corners

            portalAlternate = !portalAlternate;

            

            // Start at bottom edge, parallel to axis

            const startX = canvas.width * 0.5;

            const startY = canvas.height * 0.95; // Very bottom

            

            // End at top corner, hugging the edge

            const endX = portalAlternate ? canvas.width * 0.05 : canvas.width * 0.95; // Very edge

            const endY = canvas.height * 0.05; // Very top

            

            // Random vibrant color for this portal

            const portalColors = [

                [1.0, 0.0, 0.5],  // Hot pink

                [0.5, 0.0, 1.0],  // Purple

                [0.0, 1.0, 0.5],  // Cyan-green

                [1.0, 0.5, 0.0],  // Orange

                [0.0, 0.5, 1.0],  // Sky blue

                [1.0, 0.0, 1.0]   // Magenta

            ];

            const color = portalColors[Math.floor(Math.random() * portalColors.length)];

            

            // Update button color to match portal

            const portalBtn = document.getElementById('portalBtn');

            const r = Math.floor(color[0] * 255);

            const g = Math.floor(color[1] * 255);

            const b = Math.floor(color[2] * 255);

            portalBtn.style.background = `rgba(${r}, ${g}, ${b}, 0.3)`;

            

            // Animate the swoop - slow and controlled

            const steps = 35;

            for (let i = 0; i <= steps; i++) {

                setTimeout(() => {

                    const progress = i / steps;

                    

                    // Gentle ease - smooth throughout

                    const easing = progress * progress;

                    

                    // Start angular/parallel, then curve to corner (hugging edge)

                    // Control point stays near the edge to hug it

                    const controlX = portalAlternate ? canvas.width * 0.05 : canvas.width * 0.95; // Hug edge

                    const controlY = canvas.height * 0.5; // Midpoint

                    

                    const t = easing;

                    const mt = 1 - t;

                    const x = mt * mt * startX + 2 * mt * t * controlX + t * t * endX;

                    const y = mt * mt * startY + 2 * mt * t * controlY + t * t * endY;

                    

                    // Very gentle velocity - slow motion

                    const dx = 2 * (mt * (controlX - startX) + t * (endX - controlX)) * 0.3;

                    const dy = 2 * (mt * (controlY - startY) + t * (endY - controlY)) * 0.3;

                    

                    multiSplat(x, y, dx, dy, color);

                    

                    // Restore settings after animation completes

                    if (i === steps) {

                        setTimeout(() => {

                            animationMultiplier = originalMultiplier;

                            multiplierSlider.value = originalMultiplier;

                            multiplierValue.textContent = originalMultiplier + 'x';

                            config.SPLAT_RADIUS = originalBrush;

                            

                            // Reset button color

                            portalBtn.style.background = 'rgba(255, 100, 255, 0.2)';

                        }, 200);

                    }

                }, i * 50); // Very slow timing - 50ms per step

            }

        };

        

        window.playPortalExpandAnimation = () => {

            // Save current multiplier and brush size

            const originalMultiplier = animationMultiplier;

            const originalBrush = config.SPLAT_RADIUS;

            

            // Set to 8x for kaleidoscope effect

            animationMultiplier = 8;

            multiplierSlider.value = 8;

            multiplierValue.textContent = '8x';

            

            // Minimum brush size

            config.SPLAT_RADIUS = 0.001;

            

            // Random vibrant color for this portal

            const portalColors = [

                [1.0, 0.0, 0.5],  // Hot pink

                [0.5, 0.0, 1.0],  // Purple

                [0.0, 1.0, 0.5],  // Cyan-green

                [1.0, 0.5, 0.0],  // Orange

                [0.0, 0.5, 1.0],  // Sky blue

                [1.0, 0.0, 1.0]   // Magenta

            ];

            const color = portalColors[Math.floor(Math.random() * portalColors.length)];

            

            // Update button color

            const portalBtn = document.getElementById('portalBtn');

            const r = Math.floor(color[0] * 255);

            const g = Math.floor(color[1] * 255);

            const b = Math.floor(color[2] * 255);

            portalBtn.style.background = `rgba(${r}, ${g}, ${b}, 0.3)`;

            

            const centerX = canvas.width * 0.5;

            const centerY = canvas.height * 0.5;

            

            // Pattern: CW, CW, Out, CCW, CCW, Out (repeats)

            // One drag every 2 seconds

            const numCycles = 10; // 10 cycles of the 6-drag pattern

            const dragInterval = 2000; // 2 seconds between drags

            

            let dragIndex = 0;

            

            for (let cycle = 0; cycle < numCycles; cycle++) {

                const cycleStartTime = cycle * 6 * dragInterval; // 6 drags per cycle

                

                // Expanding radius for this cycle

                const baseRadius = (cycle + 1) * (Math.min(canvas.width, canvas.height) * 0.08);

                

                // Pattern array: [type, direction]

                // type: 'rotate' or 'outward'

                // direction: 1 (clockwise), -1 (counter-clockwise), 0 (outward)

                const pattern = [

                    { type: 'rotate', direction: 1 },   // CW

                    { type: 'rotate', direction: 1 },   // CW

                    { type: 'outward', direction: 0 },  // Out

                    { type: 'rotate', direction: -1 },  // CCW

                    { type: 'rotate', direction: -1 },  // CCW

                    { type: 'outward', direction: 0 }   // Out

                ];

                

                pattern.forEach((drag, patternIndex) => {

                    const dragDelay = cycleStartTime + patternIndex * dragInterval;

                    

                    // Random angle for this drag

                    const angle = Math.random() * Math.PI * 2;

                    const radius = baseRadius + (Math.random() - 0.5) * 30;

                    

                    setTimeout(() => {

                        const startX = centerX + radius * Math.cos(angle);

                        const startY = centerY + radius * Math.sin(angle);

                        

                        if (drag.type === 'outward') {

                            // Small outward drag - faster velocity

                            const dragLength = 30 + Math.random() * 30; // 30-60 pixels

                            const steps = 8;

                            

                            for (let i = 0; i < steps; i++) {

                                setTimeout(() => {

                                    const progress = i / steps;

                                    const distance = progress * dragLength;

                                    const x = startX + distance * Math.cos(angle);

                                    const y = startY + distance * Math.sin(angle);

                                    

                                    const dx = Math.cos(angle) * 3.5;

                                    const dy = Math.sin(angle) * 3.5;

                                    

                                    multiSplat(x, y, dx, dy, color);

                                }, i * 30);

                            }

                        } else {

                            // Small rotating drag - faster velocity

                            const dragLength = 35 + Math.random() * 35; // 35-70 pixels

                            const steps = 10;

                            const tangentAngle = angle + drag.direction * Math.PI / 2;

                            

                            for (let i = 0; i < steps; i++) {

                                setTimeout(() => {

                                    const progress = i / steps;

                                    const distance = progress * dragLength;

                                    const x = startX + distance * Math.cos(tangentAngle);

                                    const y = startY + distance * Math.sin(tangentAngle);

                                    

                                    const dx = Math.cos(tangentAngle) * 3.5;

                                    const dy = Math.sin(tangentAngle) * 3.5;

                                    

                                    multiSplat(x, y, dx, dy, color);

                                }, i * 30);

                            }

                        }

                    }, dragDelay);

                });

            }

            

            // Restore settings after animation completes (~2 minutes)

            const totalDuration = numCycles * 6 * dragInterval;

            setTimeout(() => {

                animationMultiplier = originalMultiplier;

                multiplierSlider.value = originalMultiplier;

                multiplierValue.textContent = originalMultiplier + 'x';

                config.SPLAT_RADIUS = originalBrush;

                portalBtn.style.background = 'rgba(255, 100, 255, 0.2)';

            }, totalDuration + 1000);

        };

        

        // Setup portal button

        const portalBtn = document.getElementById('portalBtn');

        portalBtn.addEventListener('click', (e) => {

            e.preventDefault();

            playPortalAnimation();

        });

        portalBtn.addEventListener('contextmenu', (e) => {

            e.preventDefault();

            playPortalExpandAnimation();

        });

        

        window.playPortraitAnimation = () => {

            // Save original settings

            const originalBrushSize = config.SPLAT_RADIUS;

            const originalDensity = config.DENSITY_DISSIPATION;

            const originalVelocity = config.VELOCITY_DISSIPATION;

            const originalCurl = config.CURL;

            

            // Helper to instantly apply settings (zero overhead)

            function animateSettings(targetBrush, targetDensity, targetVelocity, targetCurl, duration) {

                // Instant application - ignore duration parameter

                config.SPLAT_RADIUS = targetBrush;

                config.DENSITY_DISSIPATION = targetDensity;

                config.VELOCITY_DISSIPATION = targetVelocity;

                config.CURL = targetCurl;

                

                updateSliderValues();

                

                return Promise.resolve();

            }

            

            // Helper to draw a curved line

            function drawCurve(startX, startY, controlX, controlY, endX, endY, steps, color) {

                return new Promise(resolve => {

                    for (let i = 0; i <= steps; i++) {

                        setTimeout(() => {

                            const t = i / steps;

                            const t2 = t * t;

                            const mt = 1 - t;

                            const mt2 = mt * mt;

                            

                            // Quadratic bezier curve

                            const x = mt2 * startX + 2 * mt * t * controlX + t2 * endX;

                            const y = mt2 * startY + 2 * mt * t * controlY + t2 * endY;

                            

                            // Calculate velocity from curve tangent

                            const dx = 2 * (mt * (controlX - startX) + t * (endX - controlX)) * 0.5;

                            const dy = 2 * (mt * (controlY - startY) + t * (endY - controlY)) * 0.5;

                            

                            splat(x, y, dx, dy, color);

                            

                            if (i === steps) resolve();

                        }, i * 15);

                    }

                });

            }

            

            // Convergence point - center-bottom with room at bottom

            const convergenceX = canvas.width * 0.5;

            const convergenceY = canvas.height * 0.75;

            

            // Execute the portrait sequence - all strokes converge to bottom center

            async function drawPortrait() {

                // 1. LEFT SHOULDER - Converges from left toward center bottom

                await animateSettings(0.010, 0.998, 0.95, 8, 200);

                const leftShoulderColor = [0.1, 0.3, 0.9]; // Bright blue

                await drawCurve(

                    canvas.width * 0.15, canvas.height * 0.5,

                    canvas.width * 0.3, canvas.height * 0.7,

                    convergenceX - 40, convergenceY,

                    35, leftShoulderColor

                );

                

                await new Promise(r => setTimeout(r, 150));

                

                // 2. RIGHT SHOULDER - Converges from right toward center bottom

                await animateSettings(0.010, 0.998, 0.95, 8, 200);

                const rightShoulderColor = [0.9, 0.5, 0.1]; // Bright orange

                await drawCurve(

                    canvas.width * 0.85, canvas.height * 0.5,

                    canvas.width * 0.7, canvas.height * 0.7,

                    convergenceX + 40, convergenceY,

                    35, rightShoulderColor

                );

                

                await new Promise(r => setTimeout(r, 150));

                

                // 3. HEAD - Converges from top toward center bottom

                await animateSettings(0.008, 0.998, 0.95, 5, 200);

                const headColor = [0.9, 0.2, 0.3]; // Bright red/pink

                await drawCurve(

                    convergenceX, canvas.height * 0.2,

                    convergenceX - 30, canvas.height * 0.5,

                    convergenceX, convergenceY - 50,

                    40, headColor

                );

                

                await new Promise(r => setTimeout(r, 150));

                

                // 4. LEFT EYE - Small stroke converging from upper left

                await animateSettings(0.004, 0.998, 0.95, 3, 150);

                const leftEyeColor = [0.1, 0.9, 0.3]; // Bright green

                await drawCurve(

                    canvas.width * 0.35, canvas.height * 0.35,

                    canvas.width * 0.4, canvas.height * 0.6,

                    convergenceX - 20, convergenceY - 30,

                    25, leftEyeColor

                );

                

                await new Promise(r => setTimeout(r, 120));

                

                // 5. RIGHT EYE - Small stroke converging from upper right

                await animateSettings(0.004, 0.998, 0.95, 3, 150);

                const rightEyeColor = [0.8, 0.1, 0.8]; // Bright purple

                await drawCurve(

                    canvas.width * 0.65, canvas.height * 0.35,

                    canvas.width * 0.6, canvas.height * 0.6,

                    convergenceX + 20, convergenceY - 30,

                    25, rightEyeColor

                );

                

                await new Promise(r => setTimeout(r, 200));

                

                // 6. LEFT CORNER SWOOP - Pull fluid up from bottom left to 3/4 height

                await animateSettings(0.006, 0.999, 0.88, 2, 200);

                const leftSwoopColor = [0.2, 0.8, 0.9]; // Bright cyan

                await drawCurve(

                    canvas.width * 0.05, canvas.height * 0.95,

                    canvas.width * 0.2, canvas.height * 0.85,

                    convergenceX - 10, canvas.height * 0.25,

                    45, leftSwoopColor

                );

                

                await new Promise(r => setTimeout(r, 100));

                

                // 7. RIGHT CORNER SWOOP - Pull fluid up from bottom right to 3/4 height

                await animateSettings(0.006, 0.999, 0.88, 2, 200);

                const rightSwoopColor = [0.9, 0.8, 0.2]; // Bright yellow

                await drawCurve(

                    canvas.width * 0.95, canvas.height * 0.95,

                    canvas.width * 0.8, canvas.height * 0.85,

                    convergenceX + 10, canvas.height * 0.25,

                    45, rightSwoopColor

                );

                

                await new Promise(r => setTimeout(r, 300));

                

                // 8. FINALE JELLYFISH - Slow upward pull from center to lift all colors

                // Very low curl, very high velocity sustain, slow and deliberate

                await animateSettings(0.005, 0.998, 0.995, 1, 250);

                

                // Random vibrant pure color (avoid white/gray)

                const colorChoice = Math.floor(Math.random() * 6);

                const finaleColors = [

                    [0.9, 0.1, 0.2],  // Pure red

                    [0.1, 0.9, 0.2],  // Pure green

                    [0.1, 0.2, 0.9],  // Pure blue

                    [0.9, 0.9, 0.1],  // Pure yellow

                    [0.9, 0.1, 0.9],  // Pure magenta

                    [0.1, 0.9, 0.9]   // Pure cyan

                ];

                const finaleColor = finaleColors[colorChoice];

                

                // Start lower - closer to bottom

                const finaleStartY = canvas.height * 0.85;

                

                // Single slow upward stroke with jellyfish-like pulses

                const finaleSteps = 60; // Very slow

                const pulses = 5;

                

                for (let pulse = 0; pulse < pulses; pulse++) {

                    await new Promise(r => setTimeout(r, pulse * 300));

                    

                    for (let i = 0; i < finaleSteps / pulses; i++) {

                        setTimeout(() => {

                            const progress = (pulse * (finaleSteps / pulses) + i) / finaleSteps;

                            const easing = 1 - Math.pow(1 - progress, 2);

                            

                            // Minimal spread, straight up

                            const spreadAmount = easing * 15;

                            const randomSpread = (Math.random() - 0.5) * spreadAmount;

                            const x = convergenceX + randomSpread;

                            const y = finaleStartY - (easing * 350);

                            

                            // Strong upward velocity

                            const dx = randomSpread * 0.05;

                            const dy = -8;

                            

                            splat(x, y, dx, dy, finaleColor);

                        }, i * 50);

                    }

                }

                

                // Restore original settings

                await new Promise(r => setTimeout(r, 2000));

                await animateSettings(originalBrushSize, originalDensity, originalVelocity, originalCurl, 300);

            }

            

            drawPortrait();

        };

        

        function wipeSimulation() {

            gl.bindFramebuffer(gl.FRAMEBUFFER, density.write.fbo);

            gl.clearColor(0, 0, 0, 0);

            gl.clear(gl.COLOR_BUFFER_BIT);

            density.swap();

            

            gl.bindFramebuffer(gl.FRAMEBUFFER, density.read.fbo);

            gl.clear(gl.COLOR_BUFFER_BIT);

            

            gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);

            gl.clear(gl.COLOR_BUFFER_BIT);

            velocity.swap();

            

            gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.read.fbo);

            gl.clear(gl.COLOR_BUFFER_BIT);

        }

        

        window.clearCanvas = () => {

            wipeSimulation();

            // Broadcast to multiplayer clients

            if (typeof broadcastClear === 'function') {

                broadcastClear();

            }

        };

        

        window.togglePause = () => {

            isPaused = !isPaused;

            const btn = document.getElementById('pauseBtn');

            btn.textContent = isPaused ? 'Resume' : 'Pause';

            btn.style.background = isPaused ? 'rgba(100, 200, 255, 0.3)' : 'rgba(255, 255, 255, 0.15)';

        };

        

        // Respect reduced motion preferences

        (function setupReducedMotion(){

            try {

                const mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

                function applyReducedMotion(on) {

                    if (!on) return;

                    // Disable kaleido, set multiplier=1, slightly reduce motion

                    window.kaleidoEnabled = false;

                    const kt = document.getElementById('kaleidoToggle');

                    if (kt) kt.checked = false;

                    animationMultiplier = 1;

                    window.animationMultiplier = 1;

                    const ms = document.getElementById('multiplier');

                    const mv = document.getElementById('multiplierValue');

                    if (ms) { ms.value = '1'; try { ms.style.setProperty('--val', 1); } catch(_){} }

                    if (mv) mv.textContent = '1x';

                    if (typeof config === 'object') {

                        // Nudge velocity influence to moderate motion

                        config.VELOCITY_INFLUENCE = Math.min(config.VELOCITY_INFLUENCE || 3.0, 4.0);

                    }

                }

                if (mq) {

                    applyReducedMotion(!!mq.matches);

                    if (mq.addEventListener) mq.addEventListener('change', (e) => applyReducedMotion(!!e.matches));

                    else if (mq.addListener) mq.addListener((e) => applyReducedMotion(!!e.matches));

                }

            } catch(_) {}

        })();

        

        // Page Visibility: auto-pause when hidden, resume if we paused it

        (function setupVisibilityPause(){

            try {

                let pausedByVisibility = false;

                document.addEventListener('visibilitychange', () => {

                    if (document.hidden) {

                        if (!isPaused) { pausedByVisibility = true; window.togglePause(); }

                    } else {

                        if (pausedByVisibility && isPaused) { window.togglePause(); }

                        pausedByVisibility = false;

                    }

                });

            } catch(_) {}

        })();

        

        // WebGL context loss handling: prevent default loss, reload on restore

        (function setupContextLossHandling(){

            try {

                if (!canvas) return;

                canvas.addEventListener('webglcontextlost', (e) => {

                    try { e.preventDefault(); } catch(_){}

                }, false);

                canvas.addEventListener('webglcontextrestored', () => {

                    // Simplest reliable recovery across modules

                    try { window.location.reload(); } catch(_){}

                }, false);

            } catch(_) {}

        })();

        

        window.captureLayer = () => {

            const ok = typeof doCaptureFromRegion === 'function' ? doCaptureFromRegion() : false;

            if (ok && typeof startCaptureDebounce === 'function') startCaptureDebounce();

        };

        

        // Hover capture functionality

        const captureBtn = document.getElementById('captureBtn');

        const hoverCaptureToggle = document.getElementById('hoverCaptureToggle');

        let hoverCaptureEnabled = false;

        

        hoverCaptureToggle.addEventListener('change', (e) => {

            hoverCaptureEnabled = e.target.checked;

        });

        

        captureBtn.addEventListener('click', () => {

            captureLayer();

        });

        

        captureBtn.addEventListener('mouseenter', () => {

            if (hoverCaptureEnabled && !hoverCaptureCooldown) {

                captureLayer();

            }

        });

        

        // Image upload functionality

        const uploadBtn = document.getElementById('uploadBtn');

        const imageUpload = document.getElementById('imageUpload');

        

        uploadBtn.addEventListener('click', () => {

            imageUpload.click();

        });

        

        imageUpload.addEventListener('change', (e) => {

            const file = e.target.files[0];

            if (!file) return;

            

            // Validate file type

            const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];

            if (!validTypes.includes(file.type)) {

                alert('Please upload a PNG or JPG image.');

                return;

            }

            

            if (layers.length >= MAX_LAYERS) {

                alert('Maximum 10 layers reached. Delete some layers to create new ones.');

                return;

            }

            

            // Find first available slot

            let availableIndex = -1;

            for (let i = 0; i < MAX_LAYERS; i++) {

                if (!layers.find(l => l.index === i)) {

                    availableIndex = i;

                    break;

                }

            }

            

            if (availableIndex === -1) {

                alert('No available layer slots.');

                return;

            }

            

            // Read the file and create layer

            const reader = new FileReader();

            reader.onload = (event) => {

                const dataUrl = event.target.result;

                const layerDiv = document.getElementById(`layer${availableIndex}`);

                layerDiv.style.backgroundImage = `url(${dataUrl})`;

                layerDiv.style.zIndex = availableIndex;

                layerDiv.style.display = 'block';

                

                const layer = {

                    index: availableIndex,

                    title: file.name.replace(/\.[^/.]+$/, ''), // Remove file extension

                    data: dataUrl,

                    originalData: dataUrl,

                    visible: true,

                    threshold: 0,

                    mask: {

                        enabled: false,

                        mode: 'show',

                        shapes: []

                    },

                    active: false,

                    x: 0,

                    y: 0,

                    scaleX: 1,

                    scaleY: 1,

                    rotation: 0

                };

                

                layers.push(layer);

                

                // Add new layer to layerOrder below the sim (furthest from viewer)

                const simIndex = layerOrder.findIndex(item => item.type === 'sim');

                if (simIndex !== -1) {

                    layerOrder.splice(simIndex + 1, 0, { type: 'layer', id: availableIndex });

                } else {

                    layerOrder.push({ type: 'layer', id: availableIndex });

                }

                

                renderLayers();

            };

            

            reader.readAsDataURL(file);

            

            // Reset input so the same file can be uploaded again if needed

            e.target.value = '';

        });

        

        // ==============================

        // Detachable Capture Area & Hover Capture

        // ==============================

        // Reuse existing captureBtn and hoverCaptureToggle; add detach toggle

        // captureBtn and hoverCaptureToggle are defined above in Hover capture section

        const detachToggle = document.getElementById('detachCaptureToggle');

        let captureAreaEl = null;

        let hoverCaptureCooldown = false;

        let hoverCooldownTimer = null;

        let isDraggingCA = false;



        function ensureCaptureArea() {

            if (captureAreaEl) return captureAreaEl;

            captureAreaEl = document.getElementById('captureArea');

            if (!captureAreaEl) {

                captureAreaEl = document.createElement('div');

                captureAreaEl.id = 'captureArea';

                const host = document.getElementById('canvas-area') || document.body;

                host.appendChild(captureAreaEl);

            }

            // Build UI (drag bar + resize handles) once

            if (!captureAreaEl.querySelector('.cap-drag-handle')) {

                captureAreaEl.innerHTML = `

                    <div class="cap-drag-handle"></div>

                    <div class="cap-rz cap-n" data-dir="n"></div>

                    <div class="cap-rz cap-s" data-dir="s"></div>

                    <div class="cap-rz cap-e" data-dir="e"></div>

                    <div class="cap-rz cap-w" data-dir="w"></div>

                    <div class="cap-rz cap-ne" data-dir="ne"></div>

                    <div class="cap-rz cap-nw" data-dir="nw"></div>

                    <div class="cap-rz cap-se" data-dir="se"></div>

                    <div class="cap-rz cap-sw" data-dir="sw"></div>

                `;

            }



            // Make it draggable across the viewport (no canvas clamping)

            try {

                if (!captureAreaEl.dataset.draggableInit) {

                    captureAreaEl.style.position = 'fixed';

                    new Draggable(captureAreaEl, {

                        handle: '.cap-drag-handle',

                        savePosition: 'ui.captureArea.pos',

                        constrainToViewport: true,

                        onDragStart: () => { isDraggingCA = true; },

                        onDragEnd: () => { isDraggingCA = false; }

                    });

                    captureAreaEl.dataset.draggableInit = '1';

                }

            } catch (e) { /* draggable optional */ }



            // Enable resize via border handles

            setupCaptureResize(captureAreaEl);



            // Hover capture trigger (use mouseover to catch entering children too)

            captureAreaEl.addEventListener('mouseover', () => {

                if (!hoverCaptureToggle || !hoverCaptureToggle.checked) return;

                if (hoverCaptureCooldown) return;

                // Skip while interacting (drag/resize)

                if (isDraggingCA) return;

                if (isResizingCA) return;

                const ok = doCaptureFromRegion();

                if (ok) startCaptureDebounce();

            });



            // Click to capture (only on main area; ignore drag bar and resize handles)

            captureAreaEl.addEventListener('click', (ev) => {

                if (isDraggingCA || isResizingCA) return;

                const t = ev.target;

                if (t.closest('.cap-drag-handle') || t.closest('.cap-rz')) return;

                const ok = doCaptureFromRegion();

                if (ok) startCaptureDebounce();

            });



            return captureAreaEl;

        }



 // Custom resize logic for capture area

        let isResizingCA = false;

        let caDir = '';

        let caStartX = 0, caStartY = 0;

        let caStartRect = null;

        let caPointerId = null;

        const CA_MIN_W = 40, CA_MIN_H = 40;



        function setupCaptureResize(el) {

            const handles = el.querySelectorAll('.cap-rz');

            handles.forEach(h => {

                // Improve pen/touch UX

                h.style.touchAction = 'none';

                h.style.userSelect = 'none';

                h.addEventListener('pointerdown', (ev) => {

                    // Allow pen/touch; restrict mouse to left button

                    if (ev.pointerType === 'mouse' && ev.button !== 0) return;

                    ev.preventDefault(); ev.stopPropagation();

                    isResizingCA = true;

                    caPointerId = ev.pointerId;

                    try { h.setPointerCapture(ev.pointerId); } catch (_) {}

                    caDir = ev.currentTarget.dataset.dir;

                    const r = el.getBoundingClientRect();

                    caStartRect = { left: r.left, top: r.top, width: r.width, height: r.height };

                    caStartX = ev.clientX; caStartY = ev.clientY;

                    document.addEventListener('pointermove', onCAResizeMove, { passive: false });

                    document.addEventListener('pointerup', onCAResizeEnd, { passive: false });

                    document.addEventListener('pointercancel', onCAResizeEnd, { passive: false });

                });

            });

        }



        function onCAResizeMove(ev) {

            if (!isResizingCA || !captureAreaEl) return;

            if (typeof caPointerId === 'number' && ev.pointerId !== caPointerId) return;

            const dx = ev.clientX - caStartX;

            const dy = ev.clientY - caStartY;

            let left = caStartRect.left;

            let top = caStartRect.top;

            let width = caStartRect.width;

            let height = caStartRect.height;



            const applyN = () => { top = caStartRect.top + dy; height = caStartRect.height - dy; };

            const applyS = () => { height = caStartRect.height + dy; };

            const applyW = () => { left = caStartRect.left + dx; width = caStartRect.width - dx; };

            const applyE = () => { width = caStartRect.width + dx; };



            if (caDir.includes('n')) applyN();

            if (caDir.includes('s')) applyS();

            if (caDir.includes('w')) applyW();

            if (caDir.includes('e')) applyE();



            // Enforce minimum size

            if (width < CA_MIN_W) {

                if (caDir.includes('w')) left -= (CA_MIN_W - width);

                width = CA_MIN_W;

            }

            if (height < CA_MIN_H) {

                if (caDir.includes('n')) top -= (CA_MIN_H - height);

                height = CA_MIN_H;

            }



            // Apply to element (fixed coordinates)

            captureAreaEl.style.left = Math.round(left) + 'px';

            captureAreaEl.style.top = Math.round(top) + 'px';

            captureAreaEl.style.width = Math.round(width) + 'px';

            captureAreaEl.style.height = Math.round(height) + 'px';

        }



        function onCAResizeEnd(ev) {

            if (!isResizingCA) return;

            if (ev && typeof caPointerId === 'number' && ev.pointerId !== caPointerId) return;

            isResizingCA = false; caDir = '';

            try { if (ev && ev.currentTarget && ev.currentTarget.releasePointerCapture) ev.currentTarget.releasePointerCapture(ev.pointerId); } catch (_) {}

            document.removeEventListener('pointermove', onCAResizeMove);

            document.removeEventListener('pointerup', onCAResizeEnd);

            document.removeEventListener('pointercancel', onCAResizeEnd);

            caPointerId = null;

        }



        function startCaptureDebounce() {

            hoverCaptureCooldown = true;

            if (captureBtn) captureBtn.classList.add('debounce');

            clearTimeout(hoverCooldownTimer);

            hoverCooldownTimer = setTimeout(() => {

                hoverCaptureCooldown = false;

                if (captureBtn) captureBtn.classList.remove('debounce');

            }, 1000);

        }



        function getIntersectionRect(a, b) {

            const left = Math.max(a.left, b.left);

            const top = Math.max(a.top, b.top);

            const right = Math.min(a.right, b.right);

            const bottom = Math.min(a.bottom, b.bottom);

            const w = right - left;

            const h = bottom - top;

            if (w <= 0 || h <= 0) return null;

            return { left, top, width: w, height: h };

        }



        function doCaptureFromRegion() {

            const canvasRect = canvas.getBoundingClientRect();

            // Use detached region if present and visible; fallback to full canvas if no intersection

            let region = null;

            if (detachToggle && detachToggle.checked && captureAreaEl && getComputedStyle(captureAreaEl).display !== 'none') {

                const areaRect = captureAreaEl.getBoundingClientRect();

                region = getIntersectionRect(areaRect, canvasRect);

            }

            if (!region) {

                region = { left: canvasRect.left, top: canvasRect.top, width: canvasRect.width, height: canvasRect.height };

            }



            const sx = Math.round(region.left - canvasRect.left);

            const sy = Math.round(region.top - canvasRect.top);

            const sw = Math.round(region.width);

            const sh = Math.round(region.height);

            if (sw <= 0 || sh <= 0) return false;



            const temp = document.createElement('canvas');

            temp.width = sw;

            temp.height = sh;

            const ctx = temp.getContext('2d');

            // Draw canvas content

            try {

                ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

            } catch (e) { /* ignore */ }



            let dataUrl = null;

            try {

                dataUrl = temp.toDataURL('image/png');

            } catch (err) {

                // Fallback: capture full canvas directly if 2D canvas became tainted

                try {

                    dataUrl = canvas.toDataURL('image/png');

                } catch (e2) {

                    console.warn('Capture failed:', err);

                    return false;

                }

            }

            // Create a new layer from this capture

            if (layers.length >= MAX_LAYERS) {

                alert('Maximum 10 layers reached. Delete some layers to create new ones.');

                return false;

            }

            let availableIndex = -1;

            for (let i = 0; i < MAX_LAYERS; i++) {

                if (!layers.find(l => l.index === i)) { availableIndex = i; break; }

            }

            if (availableIndex === -1) { alert('No available layer slots.'); return false; }



            const layerDiv = document.getElementById(`layer${availableIndex}`);

            if (layerDiv) {

                layerDiv.style.backgroundImage = `url(${dataUrl})`;

                layerDiv.style.zIndex = availableIndex;

                layerDiv.style.display = 'block';

            }

            const layer = {

                index: availableIndex,

                title: `Capture ${availableIndex}`,

                data: dataUrl,

                originalData: dataUrl,

                visible: true,

                threshold: 0,

                active: false,

                x: 0,

                y: 0,

                scaleX: 1,

                scaleY: 1,

                rotation: 0

            };

            layers.push(layer);

            const simIndex = layerOrder.findIndex(item => item.type === 'sim');

            if (simIndex !== -1) {

                layerOrder.splice(simIndex + 1, 0, { type: 'layer', id: availableIndex });

            } else {

                layerOrder.push({ type: 'layer', id: availableIndex });

            }

            if (typeof renderLayers === 'function') renderLayers();

            return true;

        }



        // Click capture handled above via captureLayer()

        if (detachToggle) {

            detachToggle.addEventListener('change', (e) => {

                const el = ensureCaptureArea();

                if (e.target.checked) {

                    el.style.display = 'block';

                    // Place inside canvas bounds by default

                    try {

                        const r = canvas.getBoundingClientRect();

                        const w = Math.min( Math.max(240, r.width * 0.4), r.width - 40);

                        const h = Math.min( Math.max(160, r.height * 0.3), r.height - 40);

                        el.style.width = Math.round(w) + 'px';

                        el.style.height = Math.round(h) + 'px';

                        el.style.left = Math.round(r.left + (r.width - w) / 2) + 'px';

                        el.style.top = Math.round(r.top + (r.height - h) / 2) + 'px';

                    } catch (_) { /* ignore */ }

                } else {

                    el.style.display = 'none';

                }

            });

            // Initialize state

            if (detachToggle.checked) {

                const el = ensureCaptureArea();

                el.style.display = 'block';

                // Also position within canvas on init

                try {

                    const r = canvas.getBoundingClientRect();

                    const w = Math.min( Math.max(240, r.width * 0.4), r.width - 40);

                    const h = Math.min( Math.max(160, r.height * 0.3), r.height - 40);

                    el.style.width = Math.round(w) + 'px';

                    el.style.height = Math.round(h) + 'px';

                    el.style.left = Math.round(r.left + (r.width - w) / 2) + 'px';

                    el.style.top = Math.round(r.top + (r.height - h) / 2) + 'px';

                } catch (_) { /* ignore */ }

            }

        }

