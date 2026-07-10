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

            PRESSURE_DISSIPATION: 0.944,

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

        

