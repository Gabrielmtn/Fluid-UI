// ═══════════════════════════════════════════════════════════════════
// js/04c-anim-burst.js — part 3/7 of former 04-ui-interactions.js (lines 455–1318)
// LOAD ORDER: after 04b-presets.js, before 04d-anim-ascend-star.js
// PROVIDES: playJellyfishAnimation/Swarm + its button
//   (Smash, Expand and Vortex removed 2026-10-04: no stock animations,
//   the user makes what they want to see)
// REQUIRES: config (04a); multiSplat (05g, runtime)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
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

        

