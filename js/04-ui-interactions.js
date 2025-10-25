        }
        
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
                const swatch = document.createElement('div');
                swatch.className = 'color-swatch';
                swatch.style.backgroundColor = color;
                swatch.onclick = () => window.setColor(color);
                container.appendChild(swatch);
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
            
            if (showTrail && mousePositions.length > 1) {
                const lastPos = mousePositions[mousePositions.length - 2];
                trailCtx.beginPath();
                trailCtx.strokeStyle = currentTrailColorCss;
                trailCtx.lineWidth = 2;
                trailCtx.lineCap = 'round';
                trailCtx.lineJoin = 'round';
                trailCtx.moveTo(lastPos.x, lastPos.y);
                trailCtx.lineTo(position.x, position.y);
                trailCtx.stroke();
                
                setTimeout(() => {
                    trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
                }, FADE_END);
            }
        }
        
        function replayMovements() {
            if (!isRightMouseDown || !isReplayActive) {
                trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
                customCursor.style.display = 'none';
                return;
            }
            
            customCursor.style.opacity = showCursor ? '1' : '0';
            const now = Date.now();
            const replayProgress = (now % 500) / 500;
            
            trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
            
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
            preserveDrawingBuffer: true
        });
        
        gl.getExtension('EXT_color_buffer_float');
        const linearExt = gl.getExtension('OES_texture_float_linear');
        gl.clearColor(0, 0, 0, 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        let config = {
            TEXTURE_DOWNSAMPLE: 1,
            DENSITY_DISSIPATION: 0.996,
            VELOCITY_DISSIPATION: 0.999,
            PRESSURE_DISSIPATION: 0.944,
            PRESSURE_ITERATIONS: 95,
            CURL: 40,
            SPLAT_RADIUS: 0.011,
            DYE_RESOLUTION: 2048,
            SIM_RESOLUTION: 512
        };
        
        const presets = {
            silky: { DENSITY_DISSIPATION: 0.9995, VELOCITY_DISSIPATION: 1.0001, PRESSURE_DISSIPATION: 0.8, PRESSURE_ITERATIONS: 20, CURL: 30, SPLAT_RADIUS: 0.011 },
            thick: { DENSITY_DISSIPATION: 0.999, VELOCITY_DISSIPATION: 0.99, PRESSURE_DISSIPATION: 0.95, PRESSURE_ITERATIONS: 120, CURL: 1, SPLAT_RADIUS: 0.015 },
            wispy: { DENSITY_DISSIPATION: 0.9972, VELOCITY_DISSIPATION: 0.9996, PRESSURE_DISSIPATION: 0.92, PRESSURE_ITERATIONS: 40, CURL: 60, SPLAT_RADIUS: 0.01 },
            chaotic: { DENSITY_DISSIPATION: 0.996, VELOCITY_DISSIPATION: 0.9938, PRESSURE_DISSIPATION: 0.934, PRESSURE_ITERATIONS: 25, CURL: 12, SPLAT_RADIUS: 0.0151 },
            ethereal: { DENSITY_DISSIPATION: 0.9998, VELOCITY_DISSIPATION: 1.0005, PRESSURE_DISSIPATION: 0.75, PRESSURE_ITERATIONS: 15, CURL: 45, SPLAT_RADIUS: 0.008 },
            turbulent: { DENSITY_DISSIPATION: 0.994, VELOCITY_DISSIPATION: 0.997, PRESSURE_DISSIPATION: 0.88, PRESSURE_ITERATIONS: 60, CURL: 55, SPLAT_RADIUS: 0.013 },
            marble: { DENSITY_DISSIPATION: 0.9992, VELOCITY_DISSIPATION: 0.9985, PRESSURE_DISSIPATION: 0.98, PRESSURE_ITERATIONS: 100, CURL: 8, SPLAT_RADIUS: 0.018 },
            electric: { DENSITY_DISSIPATION: 0.9965, VELOCITY_DISSIPATION: 1.0008, PRESSURE_DISSIPATION: 0.82, PRESSURE_ITERATIONS: 35, CURL: 52, SPLAT_RADIUS: 0.006 }
        };
        
        window.applyPreset = (name) => {
            const preset = presets[name];
            if (!preset) return;

            activePreset = name;
            updatePresetButtons();

            // Broadcast to multiplayer clients
            if (typeof broadcastPreset === 'function') {
                broadcastPreset(name);
            }
            
            const initialConfig = { ...config };
            const startTime = performance.now();
            const duration = 800;
            
            function animate(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easing = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
                const t = easing(progress);
                
                Object.keys(preset).forEach((key) => {
                    config[key] = initialConfig[key] + (preset[key] - initialConfig[key]) * t;
                });
                
                updateSliderValues();
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                }
            }
            
            requestAnimationFrame(animate);
        };
        
        function updatePresetButtons() {
            const presetContainer = document.querySelector('.presets');
            if (!presetContainer) return;
            
            const buttons = presetContainer.querySelectorAll('button');
            buttons.forEach(btn => {
                if (btn.textContent === activePreset) {
                    btn.style.background = 'rgba(100, 200, 255, 0.4)';
                    btn.style.transform = 'scale(1.05)';
                } else {
                    btn.style.background = 'rgba(255, 255, 255, 0.15)';
                    btn.style.transform = 'scale(1)';
                }
            });
        }
        
        window.toggleFreeze = () => {
            const freezeBtn = document.getElementById('freezeBtn');
            const isUnfreezing = freezeBtn.textContent.includes('Unfreeze');
            
            freezeBtn.textContent = isUnfreezing ? '❄️ Freeze' : '🔥 Unfreeze';
            freezeBtn.style.background = isUnfreezing ? 'rgba(255, 255, 255, 0.15)' : 'rgba(100, 200, 255, 0.4)';
            
            const startTime = performance.now();
            const duration = 300;
            
            let startDensity, endDensity, startVelocity, endVelocity;
            
            if (!isUnfreezing) {
                savedDensity = config.DENSITY_DISSIPATION;
                savedVelocity = config.VELOCITY_DISSIPATION;
                startDensity = config.DENSITY_DISSIPATION;
                startVelocity = config.VELOCITY_DISSIPATION;
                endDensity = 1.0;
                endVelocity = 0.9;
            } else {
                startDensity = config.DENSITY_DISSIPATION;
                startVelocity = config.VELOCITY_DISSIPATION;
                endDensity = savedDensity;
                endVelocity = savedVelocity;
            }
            
            function animate(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easing = (t) => t * (2 - t);
                const easedProgress = easing(progress);
                
                config.DENSITY_DISSIPATION = startDensity + (endDensity - startDensity) * easedProgress;
                config.VELOCITY_DISSIPATION = startVelocity + (endVelocity - startVelocity) * easedProgress;
                
                updateSliderValues();
                
                if (progress < 1) {
                    requestAnimationFrame(animate);
                }
            }
            
            requestAnimationFrame(animate);
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
            const color2 = [Math.random(), Math.random(), Math.random()];
            
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
                    const randomColor = [Math.random(), Math.random(), Math.random()];
                    
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
                        const jellyfishColor = [Math.random(), Math.random(), Math.random()];
                        
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
        
        // Ascend animation state
        let ascendActive = false;
        let ascendAnimationId = null;
        
        window.toggleAscend = () => {
            ascendActive = !ascendActive;
            const ascendBtn = document.getElementById('ascendToggle');
            
            if (ascendActive) {
                ascendBtn.style.background = 'rgba(150, 255, 200, 0.5)';
                ascendBtn.textContent = '⬆️ Ascend (Active)';
                startAscendAnimation();
            } else {
                ascendBtn.style.background = 'rgba(150, 255, 200, 0.2)';
                ascendBtn.textContent = '⬆️ Ascend';
                if (ascendAnimationId) {
                    clearTimeout(ascendAnimationId);
                    ascendAnimationId = null;
                }
            }
        };
        
        function startAscendAnimation() {
            if (!ascendActive) return;
            
            // Save original settings
            const originalDensity = config.DENSITY_DISSIPATION;
            const originalVelocity = config.VELOCITY_DISSIPATION;
            const originalBrush = config.SPLAT_RADIUS;
            
            // Set long-lasting flow settings
            config.DENSITY_DISSIPATION = 0.999;  // Very high density sustain
            config.VELOCITY_DISSIPATION = 1.0;   // Maximum velocity sustain - fluid never slows down
            config.SPLAT_RADIUS = 0.008;         // Medium brush size
            
            const centerX = canvas.width * 0.5;
            const startY = canvas.height * 0.95;
            const endY = canvas.height * 0.05;
            const duration = 30000; // 30 seconds
            const steps = 600; // 50ms per step
            const randomnessEnabled = document.getElementById('ascendRandomness').checked;
            
            let currentStep = 0;
            let listingPhase = 0; // For gradual left-right listing
            let spurtCounter = 0; // Counter for occasional spurts
            
            function animateStep() {
                if (!ascendActive) {
                    // Restore original settings when stopped
                    config.DENSITY_DISSIPATION = originalDensity;
                    config.VELOCITY_DISSIPATION = originalVelocity;
                    config.SPLAT_RADIUS = originalBrush;
                    return;
                }
                
                const progress = currentStep / steps;
                const y = startY - (startY - endY) * progress;
                
                // Calculate x position with optional randomness
                let x = centerX;
                if (randomnessEnabled) {
                    // Gradual listing left and right using sine wave
                    listingPhase += 0.05;
                    const listingAmount = Math.sin(listingPhase) * 50;
                    x = centerX + listingAmount;
                }
                
                // Random color for each cycle
                const color = [Math.random(), Math.random(), Math.random()];
                
                // Strong upward velocity for long flows
                const dx = randomnessEnabled ? Math.sin(listingPhase) * 0.8 : 0;
                const dy = -8;
                
                splat(x, y, dx, dy, color);
                
                // Occasional spurts from the origin (every 3-5 seconds)
                spurtCounter++;
                if (spurtCounter >= 60 + Math.random() * 40) { // 3-5 seconds at 50ms intervals
                    spurtCounter = 0;
                    
                    // Create a quick spurt of 8-12 splats shooting up from origin
                    const spurtCount = 8 + Math.floor(Math.random() * 5);
                    
                    // Pick a vibrant pure color (avoid white/gray)
                    const spurtColorChoice = Math.floor(Math.random() * 6);
                    const spurtColors = [
                        [0.9, 0.1, 0.2],  // Pure red
                        [0.1, 0.9, 0.2],  // Pure green
                        [0.1, 0.2, 0.9],  // Pure blue
                        [0.9, 0.9, 0.1],  // Pure yellow
                        [0.9, 0.1, 0.9],  // Pure magenta
                        [0.1, 0.9, 0.9]   // Pure cyan
                    ];
                    const spurtColor = spurtColors[spurtColorChoice];
                    
                    for (let i = 0; i < spurtCount; i++) {
                        setTimeout(() => {
                            const spurtX = centerX + (Math.random() - 0.5) * 20;
                            const spurtY = startY;
                            const spurtDx = (Math.random() - 0.5) * 2;
                            // Velocity ramps up smoothly - final splat gets full 2.2x boost
                            const progress = i / (spurtCount - 1); // 0 to 1
                            const velocityMultiplier = 1 + (progress * 1.2); // 1x to 2.2x
                            const spurtDy = (-12 - Math.random() * 4) * velocityMultiplier;
                            
                            splat(spurtX, spurtY, spurtDx, spurtDy, spurtColor);
                        }, i * 30);
                    }
                }
                
                currentStep++;
                
                // Check if we've reached the top
                if (currentStep >= steps) {
                    // Reset and start over
                    currentStep = 0;
                    listingPhase = 0;
                }
                
                // Continue animation
                ascendAnimationId = setTimeout(animateStep, 50);
            }
            
            animateStep();
        }
        
        // Setup ascend toggle button
        document.getElementById('ascendToggle').addEventListener('click', toggleAscend);
        
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
            
            // Helper to animate slider changes
            function animateSettings(targetBrush, targetDensity, targetVelocity, targetCurl, duration) {
                const startBrush = config.SPLAT_RADIUS;
                const startDensity = config.DENSITY_DISSIPATION;
                const startVelocity = config.VELOCITY_DISSIPATION;
                const startCurl = config.CURL;
                const startTime = performance.now();
                
                return new Promise(resolve => {
                    function animate(currentTime) {
                        const elapsed = currentTime - startTime;
                        const progress = Math.min(elapsed / duration, 1);
                        
                        config.SPLAT_RADIUS = startBrush + (targetBrush - startBrush) * progress;
                        config.DENSITY_DISSIPATION = startDensity + (targetDensity - startDensity) * progress;
                        config.VELOCITY_DISSIPATION = startVelocity + (targetVelocity - startVelocity) * progress;
                        config.CURL = startCurl + (targetCurl - startCurl) * progress;
                        
                        updateSliderValues();
                        
                        if (progress < 1) {
                            requestAnimationFrame(animate);
                        } else {
                            resolve();
                        }
                    }
                    requestAnimationFrame(animate);
                });
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
        
        window.captureLayer = () => {
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
            
            const dataUrl = canvas.toDataURL('image/png');
            const layerDiv = document.getElementById(`layer${availableIndex}`);
            layerDiv.style.backgroundImage = `url(${dataUrl})`;
            layerDiv.style.zIndex = availableIndex;
            layerDiv.style.display = 'block';
            
            const layer = {
                index: availableIndex,
                title: `Layer ${layers.length + 1}`,
                data: dataUrl,
                originalData: dataUrl,
                visible: true,
                threshold: 0,
                active: false,
                x: 0,
                y: 0,
                scaleX: 1,
                scaleY: 1
            };
            
            layers.push(layer);
            
            // Add new layer to layerOrder below the sim (furthest from viewer)
            // Find sim position and insert after it
            const simIndex = layerOrder.findIndex(item => item.type === 'sim');
            if (simIndex !== -1) {
                // Insert right after sim (below it in z-order)
                layerOrder.splice(simIndex + 1, 0, { type: 'layer', id: availableIndex });
            } else {
                // If no sim found (shouldn't happen), add to bottom
                layerOrder.push({ type: 'layer', id: availableIndex });
            }
            
            renderLayers();
        };
        
        // Hover capture functionality
        const captureBtn = document.getElementById('captureBtn');
        const hoverCaptureToggle = document.getElementById('hoverCaptureToggle');
        let hoverCaptureEnabled = false;
        
        hoverCaptureToggle.addEventListener('change', (e) => {
            hoverCaptureEnabled = e.target.checked;
            
            if (hoverCaptureEnabled) {
                captureBtn.classList.add('hover-active');
                captureBtn.textContent = 'Hover Capture';
            } else {
                captureBtn.classList.remove('hover-active');
                captureBtn.textContent = 'Capture Layer';
            }
        });
        
        captureBtn.addEventListener('click', () => {
            if (!hoverCaptureEnabled) {
                captureLayer();
            }
        });
        
        captureBtn.addEventListener('mouseenter', () => {
            if (hoverCaptureEnabled) {
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
                    active: false,
                    x: 0,
                    y: 0,
                    scaleX: 1,
                    scaleY: 1
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
        
