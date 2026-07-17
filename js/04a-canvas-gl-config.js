// ═══════════════════════════════════════════════════════════════════
// js/04a-canvas-gl-config.js — part 1/7 of former 04-ui-interactions.js (lines 1–270)
// LOAD ORDER: after 03-recording.js, before 04b-presets.js
// PROVIDES: saved colors UI, mouse tracking/replay, const gl (WebGL2 context), let config, baselineConfig, mobile defaults
// REQUIRES: canvas (01/03), ParamRegistry (01a)
// NOTE: verbatim split of unwrapped top-level classic-script code.
//   Correctness comes from preserved source order — do not reorder.
// ═══════════════════════════════════════════════════════════════════
        

        

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

                velocity: { dx: pointer.dx, dy: pointer.dy },

                // recorded so the hold-to-replay trail reproduces the stroke
                // faithfully (same fix as processReplay, 2026-07-13)

                radius: config.SPLAT_RADIUS,

                mult: (typeof animationMultiplier === 'number') ? animationMultiplier : 1

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

                    // Faithful trail: recorded radius + arm count (2026-07-13)

                    if (typeof window.applyMultiSplatWith === 'function') {

                        window.applyMultiSplatWith(pos.x, pos.y, pos.velocity.dx, pos.velocity.dy,
                            pos.color, pos.mult || 1,
                            (typeof pos.radius === 'number') ? pos.radius : config.SPLAT_RADIUS);

                    } else {

                        splat(pos.x, pos.y, pos.velocity.dx, pos.velocity.dy, pos.color);

                    }

                    

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

            preserveDrawingBuffer: true,   // Required so drawImage()/toBlob() can read the
                                           // canvas for image/video/GIF/sequence export. Without
                                           // it the buffer is cleared after each frame and every
                                           // export captures black. Minor perf cost (no swap-based
                                           // present); exports are a core feature so it's enabled.

            desynchronized: false,         // MUST stay false. With alpha:true + layer divs
                                           // stacked under the canvas, desynchronized presents
                                           // bypass DOM compositing (direct-composition overlay
                                           // on Chrome/Windows) — frames tear or present cleared,
                                           // momentarily exposing the layers beneath (rhythmic
                                           // "layer flash"). preserveDrawingBuffer:true makes the
                                           // copy-present path even more tear-prone. Electron
                                           // ignores desync (no overlay), which is why the bug
                                           // only showed in the web/preview builds.

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

            PRESSURE_DISSIPATION: 0.95, // was 0.944 — retuned with the multigrid solve
                                        // (low values were stabilizing unconverged Jacobi)

            PRESSURE_ITERATIONS: 32,  // 32 gives clean incompressible flow without being expensive

            CURL: 25,                 // Strong vortices for visually interesting fluid on first load

            SPLAT_RADIUS: 0.011,

            SHARPNESS: 0.8,           // Adaptive sharpness (0.0 = off, 1.0 = moderate, 2.0 = aggressive)

            CLARITY: 0,               // Local contrast enhancement (0 = off, 1.0 = max)

            VIBRANCE: 0,              // Selective saturation boost (0 = off, 1.0 = max)

            DYE_RESOLUTION: 2048,     // Ultra (2K) by default on desktop — the highest real-time tier.
                                      // The governor's boot ascent starts light and ramps up to this;
                                      // Cinematic 4K stays a dropdown choice for capture work (a live
                                      // realloc to 4096 can spike VRAM enough to lose the GL context).

            SIM_RESOLUTION: 512,      // Ultra physics by default on desktop (mobile overrides below)

            VELOCITY_INFLUENCE: 2.5,  // Motion isolation (1.0 = full motion, 5.0 = maximum isolation)

            MACCORMACK: true,         // Crisp advection: MacCormack error-corrected dye transport
                                      // (2 extra dye-res passes; governor sheds it with post-FX)

            MULTIGRID: true,          // Multigrid pressure V-cycle — converges like hundreds of
                                      // Jacobi iterations at ~1/3 the fill cost of the 32 default
                                      // (governor ladder: 2 cycles → 1 → Jacobi floor)

            MG_CYCLES: 2,             // V-cycles per frame (governor caps to 1 under load)
            MG_PRE: 2,                // Smoother sweeps before each restriction
            MG_POST: 2,               // Smoother sweeps after each prolongation
            MG_COARSE: 8,             // Jacobi sweeps standing in for the coarsest-level solve
            MG_RELAX: 1.0,            // Smoother damping ω. 1.0 = the shipped undamped
                                      // behavior; the slider exists for experiments
                                      // (textbook MG uses ~0.8, but it measured neutral
                                      // here — see pressureFrag).

            DEPTH_EDGE_BAND: 12,      // D0.5 edge quality (rev 2): CAP on the fwidth-style
                                      // adaptive soft cut for depth-mask colliders. The band
                                      // scales with the LOCAL depth gradient (edges get
                                      // ~0.75px of AA; flat midtone regions cut hard), capped
                                      // here. Rev 1's FIXED band turned flat regions near the
                                      // threshold into porous half-walls — whole-canvas fuzz
                                      // under high strength + multigrid. 0.5 ≈ legacy hard
                                      // cut everywhere. Console-tunable.

            PRESSURE_SCALE: 1 / 256,  // fp16 headroom rescale of the pressure system.
                                      // 1/64 → 1/256 (2026-07-15): a vortex confined in a
                                      // SEALED strength-1.0 mask pocket generates real
                                      // stagnation pressure ~v² — at Max-Speed-capped speeds
                                      // that exceeded the stored fp16 ceiling at 1/64 and
                                      // clipped ("breaks and flows away"). Relative fp16
                                      // precision is scale-invariant, so this is look-free.
                                      // Multigrid converges the TRUE pressure, which
                                      // saturated fp16 (pegged 65504) under fast multi-arm
                                      // strokes — clipped peaks → glitchy projection →
                                      // speed-scaled jitter (2026-07-14). Stored p is
                                      // p·this; gradient divides it back out. Console-
                                      // tunable for A/B (1 = legacy unscaled).

            VELOCITY_CAP: 30,         // "Max Speed" ceiling in canvas-widths/s (soft knee from
                                      // 70%). fp16 safety AND an aesthetic knob: growth presets
                                      // (velocity dissipation > 1) settle at this ceiling inside
                                      // closed mask pockets — lower = calmer bounded swirls,
                                      // higher = wilder motion before the sim reins it in.

            VEL_SOURCE_GATE: true,    // M1 (2026-07-17): taper the energy SOURCES (growth
                                      // amplification + vorticity confinement) to neutral as
                                      // speed approaches VELOCITY_CAP, so pockets settle below
                                      // the soft knee instead of slamming it every frame — the
                                      // knee-strip → divergence → pressure-rebound limit cycle
                                      // read as "jiggle" at top speed. Console A/B: false =
                                      // legacy cap-only behavior. Exact no-op below 45% of cap.

            CURL_WALL_GATE: true,     // Suppress vorticity confinement in a ~1-texel apron
                                      // around colliders (2026-07-16): wall shear reads as a
                                      // huge curl spike, so confinement kicked energy into
                                      // walls every frame — with multigrid's converged
                                      // projection that closed a feedback loop (fuzz +
                                      // pressure climb at strength 1.0). Console A/B:
                                      // false = legacy everywhere-confinement.

            WALL_SLIP: 0.6,           // Collision feel: 0 = legacy sticky walls (damp pass
                                      // kills a wide apron), 1 = interior-only damp (the
                                      // projection's tangential slip fully shows). Console-
                                      // tunable for feel testing; no UI slider yet.

            BRUSH_STABILIZER: 0,      // D1 stroke stabilizer (weighted lag): 0 = raw input,
                                      // 1 = heavy Krita-style smoothing. Brush section slider.

            BRUSH_SPACING: 0.35,      // D1 dab spacing as a fraction of brush diameter —
                                      // distance-parameterized stroke density (speed-
                                      // independent; kills the 1-dab-per-frame gaps)

            BRUSH_PRESSURE_SIZE: true,  // Pen pressure → dab size (gamma-0.7 curve;
                                        // mouse/touch always report pressure 1)
            BRUSH_PRESSURE_FLOW: false, // Pen pressure → dye intensity (off by default —
                                        // additive dye reads strong already)

            BRUSH_TARGET: 'fluid',    // D2/D3 stroke routing: 'fluid' (splats), 'sketch'
                                      // (the active raster paint layer — normal-control
                                      // drawing; local-only, no replay/broadcast until
                                      // D7), or 'mask' (paint coverage into the active
                                      // Mask object — D3)
            MASK_OVERLAY: false,      // D3: show the active mask as a red film even when
                                      // not painting into it (auto-shown while target=mask)
            BRUSH_ERASER: false,      // Eraser mode (sketch target: destination-out)
            BRUSH_HARDNESS: 0.8,      // Sketch stamp edge: 0 = soft gaussian, 1 = hard AA disc
            SKETCH_VISIBLE: true,     // Sketch layer visibility (display composite)

            BRUSH_FLOW: 1,            // D1 dye intensity per dab (fluid: scales splat color;
                                      // sketch: scales stamp alpha). 1 = legacy full flow.
            BRUSH_JITTER: 0,          // D1 per-dab scatter, fraction of brush diameter
                                      // (0 = clean line; spray/charcoal territory above ~0.3)
            BRUSH_PRESSURE_CURVE: 0.7,// D1 pressure response gamma for size/flow: <1 lifts
                                      // the light-touch range (0.7 = legacy feel), 1 = linear,
                                      // >1 demands a heavy hand
            BRUSH_TIP: 0,             // D1 brush tip on USER strokes (fluid dye only; velocity
                                      // stays gaussian, programmatic splats unaffected):
                                      // 0 = gaussian, 1 = blob, 2 = chisel, 3 = streak, 4 = ring
            BRUSH_TIP_TEXTURE: 0.7,   // Stamp grain/blend for blob/chisel/streak tips
                                      // (splatFrag stampNoise; ring ignores it)

            SWIRL: 0,                 // Curl-noise micro-swirl in dye advection (0 = off).
                                      // Painterly sub-grid wisps on moving paint; dies with
                                      // motion so settled artwork stays bit-stable

            RIDGES: 0,                // Sharpen kernel radius in 2048-reference texels.
                                      // 0 = sharpen OFF (default — the smooth look; the
                                      // pass is skipped entirely), 1 = classic unsharp
                                      // look, >1 = coarse emboss ridges. NOTE: the
                                      // Viscosity/sharpness strength only acts when
                                      // this is > 0.



            SUNRAYS: false,           // Sunrays post-FX enabled (toggled in Effects)

            SUNRAYS_WEIGHT: 0.5       // MUST be seeded: undefined here uploads NaN to the
                                      // sunrays shader and blacks out the whole canvas the
                                      // moment Sunrays is toggled on (slider only writes it on input)

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

                    config.MACCORMACK = false;     // Skip the 2 extra dye passes on mobile
                                                   // (tile-GPU pass overhead; toggle re-enables)

                    config.MULTIGRID = false;      // ~40 small draws/frame is real overhead on
                                                   // tile GPUs; 15 warm Jacobi stays the default

                    config.SPLAT_RADIUS = 0.012;   // Slightly larger for touch

                }

            } catch(_) {}

        })();

        

