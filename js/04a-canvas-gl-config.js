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

        

        // No WebGL2 = nothing below can run. Replace the silent dead canvas
        // with an actionable message (Steam's hardware spread includes GPUs,
        // VMs, and remote desktops where WebGL2 is blocklisted or broken).

        if (!gl) {

            try {

                var _noGl = document.createElement('div');

                _noGl.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#0d1117;color:#e6edf3;' +
                    'display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;' +
                    'font:14px/1.6 "Segoe UI",sans-serif;padding:40px';

                _noGl.innerHTML = '<div style="font-size:40px;margin-bottom:12px">🎨</div>' +
                    '<div style="font-size:20px;font-weight:600;margin-bottom:10px">This GPU can&#39;t run Fluid Simulation</div>' +
                    '<div style="max-width:520px;opacity:.8">WebGL2 is unavailable &mdash; usually an outdated or broken ' +
                    'graphics driver, or a virtual machine without GPU acceleration.<br><br>' +
                    'Try updating your GPU drivers, then relaunch.</div>';

                (document.body || document.documentElement).appendChild(_noGl);

                var _splash = document.getElementById('splash-screen');

                if (_splash) _splash.style.display = 'none';

            } catch(_) {}

            // Every later chunk will now throw on the uninitialized bindings
            // this file never created — suppress the error-card cascade so the
            // friendly screen above stays the only thing the user sees.

            window.__fatalGpu = true;

            throw new Error('WebGL2 unavailable — cannot initialize');

        }



        // Expose for stats panel

        window.gl = gl;

        // GPU adapter check (2026-07-23): Windows assigns GPUs per-app, and
        // Chrome landing on an integrated GPU is exactly "high detail tears /
        // breaks in the browser but not Electron" (found on Gabriel's
        // 4090+13900K box: Chrome AND the Claude pane were both on the Intel
        // UHD 770). powerPreference:'high-performance' above only REQUESTS
        // the discrete adapter — the Windows per-app Graphics setting wins.
        // Log the adapter at boot and warn loudly on integrated so user-test
        // perf reports can be triaged without guessing.
        try {
            const _dbgExt = gl.getExtension('WEBGL_debug_renderer_info');
            const _renderer = _dbgExt ? gl.getParameter(_dbgExt.UNMASKED_RENDERER_WEBGL) : 'unavailable';
            window.__gpuRenderer = _renderer;
            console.log('[GPU]', _renderer);
            // Intel Arc (A3xx/A5xx/A7xx/B5xx) is DISCRETE and reports "Intel" —
            // excluded, or its owners get told to fix a problem they don't have.
            if (/Intel|UHD|Iris|integrated/i.test(_renderer)
                && !/NVIDIA|Radeon RX|GeForce|\bArc\b|\bA[3-7][0-9]{2}\b|\bB[5-9][0-9]{2}\b/i.test(_renderer)) {
                console.warn('[GPU] Running on an INTEGRATED GPU — high detail/resolution will struggle. ' +
                    'On Windows: Settings > System > Display > Graphics > add this browser > High performance, ' +
                    'then fully quit and relaunch it.');
                // Steam prep S2-5: the console is invisible to a customer — the
                // laptop buyer whose app landed on the iGPU is exactly the person
                // who needs this. Dismiss remembers the adapter, so a hardware
                // change re-warns.
                try {
                    if (localStorage.getItem('fluidIgpuBannerDismissed') !== _renderer) {
                        var _appName = window.IS_ELECTRON ? 'Fluid Simulation' : 'this browser';
                        var _banner = document.createElement('div');
                        _banner.style.cssText = 'position:fixed;top:44px;left:50%;transform:translateX(-50%);z-index:2147483645;' +
                            'max-width:560px;background:#2b2311;color:#f0d47a;border:1px solid #b8860b88;border-radius:8px;' +
                            'padding:10px 14px;font:12px/1.5 "Segoe UI",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.5)';
                        var _txt = document.createElement('div');
                        _txt.textContent = '⚡ Running on the integrated GPU (' + _renderer + ') — painting will feel slow. ' +
                            'Fix: Windows Settings → System → Display → Graphics → add ' + _appName + ' → High performance, then relaunch.';
                        var _dis = document.createElement('button');
                        _dis.textContent = 'Got it';
                        _dis.style.cssText = 'margin-top:8px;background:#3a3016;color:#f0d47a;border:1px solid #b8860b66;' +
                            'border-radius:4px;padding:3px 12px;font:11px "Segoe UI",sans-serif;cursor:pointer';
                        _dis.onclick = function () {
                            try { localStorage.setItem('fluidIgpuBannerDismissed', _renderer); } catch(_) {}
                            _banner.remove();
                        };
                        _banner.appendChild(_txt); _banner.appendChild(_dis);
                        var _mount = function () { (document.body || document.documentElement).appendChild(_banner); };
                        if (document.body) _mount(); else document.addEventListener('DOMContentLoaded', _mount);
                    }
                } catch (_) {}
            }
        } catch (_) {}

        

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

            SPLAT_SCISSOR: true,      // Clip each splat pass to the dab's bounding box (bit-identical
                                      // to fullscreen — see 05i splatScissorRect); false = old fullscreen passes
            SPLAT_SCISSOR_K: 6.0,     // Bounding half-width in units of √SPLAT_RADIUS; 6 keeps the clipped
                                      // gaussian tail below fp16's smallest subnormal with margin — measured
                                      // dye bit-identical, velocity ≤1-ulp on a handful of texels (console-tunable)

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

            COLLIDER_GAP_FILL: 14,    // Collider gap fill: morphological-close radius in
                                      // reference-512 sim texels (res-scaled). Seals enclosed
                                      // pockets narrower than ~2R — line-art mask images
                                      // (fish-scale/knit texture) have TRUE-zero interiors
                                      // that no alpha curve can lift, so the fill read as a
                                      // net and dye pooled in every scale (2026-08-05).
                                      // Larger drawn cutouts and the silhouette stay open —
                                      // 14 verified on the scale-mesh mask: every scale cell
                                      // (incl. the larger forehead ones) seals, the eye
                                      // sockets survive. NOTE: this intentionally overrides
                                      // the D0.5 "fine channels stay open" behavior for
                                      // channels narrower than ~2R; set 0 to restore it
                                      // (bit-identical off). Console-tunable; re-apply live
                                      // via collisionLayers.updateObstacleFromLayers().

            COLLIDER_ALPHA_SOLID: 0.45, // Mask/raster → collider coverage: source alpha at
                                      // (and above) which the collider reads FULLY solid.
                                      // Painted/imported fills carry mid-alpha texture
                                      // (soft-brush overlap, fabric grain); raw alpha put
                                      // that ripple in solidity()'s coverage window and the
                                      // fill became a patchy solid/leaky lattice — dye
                                      // seeped in and pooled at every dip (2026-08-05).
                                      // Ramp starts at 0.25× this (near-transparent stays
                                      // open; AA edges stay smooth). Console-tunable.

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

            VELOCITY_REFERENCE_RESOLUTION: 512,

            VELOCITY_CAP: 30,         // "Max Speed" ceiling in canvas-widths/s (soft knee from
                                      // 70%). fp16 safety AND an aesthetic knob: growth presets
                                      // (velocity dissipation > 1) settle at this ceiling inside
                                      // closed mask pockets — lower = calmer bounded swirls,
                                      // higher = wilder motion before the sim reins it in.

            HF_FLOOR: 0.85,           // M2 spectral floor (2026-07-17): fraction of the
                                      // velocity field's Nyquist (Laplacian) component
                                      // removed per frame where it reads as NOISE — HF
                                      // decorrelated from local speed. The sim's missing
                                      // small-scale energy sink: wall injection and cap
                                      // churn park energy at grid scale and nothing else
                                      // ever removes it. Exact no-op at rest, on smooth
                                      // flow, and on straight shear (zero Laplacian).
                                      // Skips a ~1-texel collider apron (wall slip stays).
                                      // 0 = off (console A/B).
            HF_FLOOR_DYE: 0.6,        // M2 dye floor: same idea on the dye, gated by
                                      // MOTION — per-texel contrast in moving dye is
                                      // always numerical (bilinear transport cannot
                                      // sustain it), which is what lets preserve/growth
                                      // presets ratchet stroke speckle forever (the
                                      // "paint a mask and the page tears" chain). Still
                                      // dye and frozen artwork are never touched.
                                      // Straight dye edges have zero Laplacian — moving
                                      // fronts keep their crispness. 0 = off.

            DEBAND: 0.0,              // De-band / "organic" taper (2026-07-18): softens the
                                      // MacCormack anti-diffusion where dye is BOTH hard-edged
                                      // and moving fast (the terrace cliffs of no-curl acrylic
                                      // flow — with curl the turbulence revert already blurs
                                      // them). 0 = off / bit-exact. ~0.3-0.6 = organic. See
                                      // macCorrectFrag in 05b. Console-tunable; slider TBD.

            IGNITE_VIBRANCE: 0.22,    // Saturation Ignite adds at full hold (2026-07-20).
                                      // Ignite enriches instead of brightening: raising dye
                                      // magnitude past the Gate cap walks every channel up
                                      // the Reinhard curve together, which lightens at
                                      // constant saturation — the "pale light green" bug.
                                      // Applied post-tone-map in displayFrag, so it never
                                      // touches stored dye and a locked Ignite holds steady
                                      // instead of ratcheting. Measured on a green: 0.45 took
                                      // saturation 0.742 -> 0.958 (neon); 0.22 is the "turned
                                      // up, still your colour" setting. 0 = off.

            SHADE_RELIEF: 1.0,        // Surface Shading relief strength (2026-07-21 rebalance).
                                      // Multiplies the luminance-preserving relief term (the signed
                                      // N.L-L.z form modulation) on top of the slider. 1 = shipped;
                                      // raise for deeper sculpting, 0 = flat (gloss only). The pass
                                      // no longer dims the dye — see displayFrag in 05a.

            SHADE_GLOSS: 0.35,        // Surface Shading specular strength (2026-07-21). The plastic
                                      // sheen: a tight Blinn-Phong highlight ADDED on top of the
                                      // preserved hue. 0.35 = shipped; raise for wetter/glossier
                                      // plastic, 0 = matte relief. Console-tunable, x the slider.

            LS_DENSITY_MIX: 1.0,      // Color Shift density trigger (2026-07-21): how much the
                                      // pigment-memory / raw-density overblow signal feeds Light
                                      // Shift's trigger, alongside the displayed-whiteness key.
                                      // Memory (dye alpha) and the pre-tone-map magnitude survive
                                      // the Gate's rgb clamp AND the Gate/Ignite vibrance boost,
                                      // so Color Shift keys off ACTUAL overblow instead of a
                                      // capped, re-saturated display — which is why "replace"
                                      // stopped landing once Ignite/Gate touched a region.
                                      // 1 = full hybrid; 0 = old whiteness-only. See displayFrag
                                      // in 05a. Console-tunable.

            DYE_MEMORY_DISS: 0.9995,  // Pigment memory half-life (2026-07-20): dye alpha
                                      // remembers the strength a stroke was PAINTED at, so
                                      // Ignite restores the original colour instead of just
                                      // amplifying a faded remnant (multiplicative decay
                                      // keeps hue but destroys magnitude). Decays on its own
                                      // slow clock: 0.9995 ≈ a 23s half-life, so recent work
                                      // can be re-ignited while anything you deliberately let
                                      // fade stays gone. 1.0 = memory never expires. Memory is
                                      // still drained in step with the dye by the obstacle,
                                      // cleanup and edge drains. See advectionFrag in 05b.

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
            BRUSH_TIP: 0,             // D1 brush tip on USER strokes (fluid dye only; velocity
                                      // stays gaussian, programmatic splats unaffected):
                                      // 0 = gaussian, 1 = blob, 2 = chisel, 3 = streak, 4 = ring
            BRUSH_TIP_TEXTURE: 0.7,   // Stamp grain/blend for blob/chisel/streak tips
                                      // (splatFrag stampNoise; ring ignores it)
            BRUSH_ANGLE: 0,           // D1 brush rotation in degrees (0-360). Rotates the
                                      // asymmetric stamp shapes (chisel/streak) in the splat
                                      // shader; the brush-ring cursor's line shows this angle.
                                      // Round tips (soft/blob/ring) are rotation-invariant.

            SWIRL: 0,                 // Curl-noise micro-swirl in dye advection (0 = off).
                                      // Painterly sub-grid wisps on moving paint; dies with
                                      // motion so settled artwork stays bit-stable

            WET_INFLUENCE: 0,         // P15-1 wetness→mobility coupling (0 = feature off,
                                      // bit-identical to no wetness). 1 = bone-dry paint
                                      // fully freezes in place; wet paint always flows.
            WET_DRYING: 3.0,          // P15-1 wetness half-life in seconds: time for a wet
                                      // region to dry halfway. Lower = paint sets faster.

            RIDGES: 0,                // Sharpen kernel radius in 2048-reference texels.
                                      // 0 = sharpen OFF (default — the smooth look; the
                                      // pass is skipped entirely), 1 = classic unsharp
                                      // look, >1 = coarse emboss ridges. NOTE: the
                                      // Viscosity/sharpness strength only acts when
                                      // this is > 0.



            GLOW: false,              // Glow (HDR bloom) post-FX enabled (toggled in Effects)

            GLOW_INTENSITY: 0.8,      // Halo brightness scale (slider). MUST be seeded:
                                      // undefined here would upload NaN to the shader.

            GLOW_THRESHOLD: 0.6,      // Pre-tone-map brightness where dye starts to glow
                                      // (slider; HDR scale — dye runs well past 1.0)

            GLOW_KNEE: 0.7,           // Soft-knee width fraction (console-tunable)

            GLOW_RESOLUTION: 256,     // Glow chain base resolution (long side)

            GLOW_ITERATIONS: 8        // Max mip-chain depth (halvings from base res)

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

        

