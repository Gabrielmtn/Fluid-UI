// ═══════════════════════════════════════════════════════════════════
// js/04c-anim-burst.js — part 3/7 of former 04-ui-interactions.js (lines 455–1318)
// LOAD ORDER: after 04b-presets.js, before 04d-anim-ascend-star.js
// PROVIDES: playExpandAnimation, playSmashAnimation, playJellyfishAnimation/Swarm, playVortexAnimation + their buttons
// REQUIRES: config (04a); multiSplat (05g, runtime)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
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

        

