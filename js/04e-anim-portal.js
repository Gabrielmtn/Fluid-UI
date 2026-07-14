// ═══════════════════════════════════════════════════════════════════
// js/04e-anim-portal.js — part 5/7 of former 04-ui-interactions.js (lines 2103–2920)
// LOAD ORDER: after 04d-anim-ascend-star.js, before 04f-canvas-actions.js
// PROVIDES: playPortalAnimation, playPortalExpandAnimation, playPortraitAnimation
// REQUIRES: config (04a)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
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

                    

                    multiSplat(x, y, dx, dy, color, false, true);

                    

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

                                    

                                    multiSplat(x, y, dx, dy, color, false, true);

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

                                    

                                    multiSplat(x, y, dx, dy, color, false, true);

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

        

