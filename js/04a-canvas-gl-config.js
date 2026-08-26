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
                    '<div style="font-size:20px;font-weight:600;margin-bottom:10px">This GPU can&#39;t run Swirl Together</div>' +
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

            // No GL context means the boot's "frame" gate can never clear, so
            // the desktop build would hold its window invisible until the
            // watchdog fires. Show this screen now instead of twelve seconds
            // of nothing (js/00a-boot.js).
            try { if (window.Boot) window.Boot.revealNow('webgl-unavailable'); } catch (_) {}

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
                        var _appName = window.IS_ELECTRON ? 'Swirl Together' : 'this browser';
                        var _banner = document.createElement('div');
                        _banner.style.cssText = 'position:fixed;top:44px;left:50%;transform:translateX(-50%);z-index:2147483645;' +
                            'max-width:560px;background:#2b2311;color:#f0d47a;border:1px solid #b8860b88;border-radius:8px;' +
                            'padding:10px 14px;font:12px/1.5 "Segoe UI",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.5)';
                        var _txt = document.createElement('div');
                        _txt.textContent = 'Running on the integrated GPU (' + _renderer + ') — painting will feel slow. ' +
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

            PRESSURE_ITERATIONS: 17,  // 17 is the first-touch feel Gabriel tuned to; 32 solved
                                      // "cleaner" but read stiff before the user touches anything

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

            COLLIDER_GAP_FILL: 0,     // OPT-IN collider gap fill: morphological-close radius
                                      // in reference-512 sim texels (res-scaled, 0 = off,
                                      // bit-identical). Seals enclosed pockets narrower than
                                      // ~2R for a "solid slab" collider look. Default OFF
                                      // (2026-08-05): on line-art masks a radius big enough
                                      // to seal texture cells also swallows same-width drawn
                                      // features (brows/mouth measured in the SAME area
                                      // population as scale cells — no size rule separates
                                      // them), flattening the collider into a blob. The
                                      // fidelity fix is the compositor's box-filter
                                      // downsample (05b), not sealing. Console-tunable;
                                      // re-apply live via
                                      // collisionLayers.updateObstacleFromLayers().

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

            COLLIDER_FLOW_KEEP: 1.0,  // Wall-drain flow gate (2026-08-11). The drain that stops
                                      // colliders burning their shape into the artwork used to
                                      // test coverage dilated by a sim texel, so on an
                                      // INTRICATE collider it covered the gaps BETWEEN details
                                      // too — and at 6%/frame that band ate dye in transit,
                                      // not just dye pinned in walls. Measured on a fine dot
                                      // lattice: partial-coverage texels kept 2-4% of their
                                      // dye over 2s (open fluid kept 54%) and total dye mass
                                      // fell to 0.59x the collider-free run — the "collider
                                      // dulls the fluid" report, loudest under Gate (capped
                                      // dye has no HDR headroom to hide the loss).
                                      // 1 = drain only dye that is actually stuck; 0 = legacy.
                                      // See advectionFrag in 05b.
            COLLIDER_DRAIN: 0.06,     // Rate of that drain, per 60fps frame. 0 = off (dye
                                      // pinned in walls then burns the mask shape into the
                                      // artwork, which is what the drain exists to prevent).
            COLLIDER_DRAIN_DILATE: 0.0, // Whether the drain tests coverage dilated by a sim
                                      // texel (1 = legacy) or the texel's own coverage (0).
                                      // The dilation was for sub-texel gaps and the thin
                                      // pinned rim; on a fine mask it instead pushed a
                                      // 4-dye-texel eating band around EVERY detail. The
                                      // flow gate above now covers the rim case.

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

            INSTANT_ROTO_MODEL: 'onnx-community/EdgeTAM-ONNX',
                                      // Instant Roto segmentation model. MEASURED against
                                      // ground truth on the CPU backend (2026-08-14), 5-click
                                      // selection, true IoU:
                                      //   content       EdgeTAM (SAM 2)   SlimSAM-77 (SAM 1)
                                      //   logo/text          0.85               0.88
                                      //   abstract art       0.80               0.27
                                      // A wash on graphics and type, but the distilled SAM 2 is
                                      // ~3x better on painterly/fluid captures, so it stays the
                                      // default. 'Xenova/slimsam-77-uniform' is the SAM 1 model
                                      // and is also bundled for Electron — the loader handles
                                      // either architecture, so it is a one-line swap.
                                      // Console-tunable; reload the page to re-init.

            INSTANT_ROTO_DTYPE: 'fp32', // Weight precision for the model above. EdgeTAM's fp16/q8
                                      // exports produce garbage masks (verified vs the upstream
                                      // truck.jpg reference) — keep fp32 unless a future model
                                      // repo ships working reduced-precision weights.

            INSTANT_ROTO_SOLID_FILL: true,
                                      // Mask antialiasing only ADDS a soft skirt outside the
                                      // cutout; pixels the model marked foreground stay fully
                                      // opaque. Averaging them unconditionally eats thin
                                      // features from the inside (120px text measured only
                                      // 64.6% opaque = the washed-out look on text/shapes).
                                      // false = old behaviour (softer, thinner).

            INSTANT_ROTO_TRUST_IOU: 0.6,
                                      // Above this predicted IoU the model is treated as
                                      // confident and its own ranking picks the default
                                      // cutout; below it (painterly/abstract content, where
                                      // the scores go flat and it will rank a speck first)
                                      // the largest proposal under INSTANT_ROTO_MAX_COVER wins.

            INSTANT_ROTO_MAX_COVER: 0.8,
                                      // Default-candidate picker: proposals covering more than
                                      // this fraction of the canvas lose to any tighter proposal
                                      // (predicted IoU loves "select everything" on flat painterly
                                      // content). 1.0 = old pure-IoU behavior. The 1/2/3 candidate
                                      // cycler still offers every proposal.

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

            BRUSH_SPACING: 0.001,     // D1 dab spacing as a fraction of brush diameter —
                                      // distance-parameterized stroke density (speed-
                                      // independent; kills the 1-dab-per-frame gaps).
                                      // 0.05 → 0.001 (2026-08-18): Spacing is the ONLY thing
                                      // that decides whether a slow stroke reads as a line or
                                      // as separate dabs, so the default sits at the bottom
                                      // where the walker alone stays continuous at any speed
                                      // (measured 100 dabs/s at 25px/s vs 2 at 5%), and every
                                      // move UP the slider adds visible separation. The
                                      // slow-speed floor only assists at or below
                                      // BRUSH_DAB_FLOOR_MAX_SPACING, so raising Spacing gives
                                      // back the dab texture — including its stutter — intact.
                                      // 0.35 → 0.05 (2026-08-17): 0.35 was calibrated for a
                                      // far smaller tip than this app's ~150px default brush,
                                      // so a 200px/s stroke laid THREE deposits per second and
                                      // read as a chain of blobs at any frame rate. Safe to
                                      // lower only because dye is now normalized per unit of
                                      // travel (BRUSH_SPACING_REF), so density is a texture
                                      // control and no longer changes how dark a stroke is.
            BRUSH_SPACING_REF: 0.35,  // Dye-per-travel anchor. Each dab's flow is scaled by
                                      // spacing/REF, so a stroke deposits the same dye per
                                      // pixel travelled at ANY spacing. At spacing == REF the
                                      // factor is exactly 1 — the pre-2026-08-17 behaviour,
                                      // bit-for-bit. Never boosts above 1 (a dab can't deposit
                                      // more than full flow), so spacings above REF still
                                      // thin out the way they always did.
            BRUSH_DAB_INTERVAL_MS: 8, // Constant-flow: SIMULATED milliseconds between dabs —
                                      // the time-axis twin of Spacing, and the only thing that
                                      // decides whether the hose reads as a line or as separate
                                      // pulses. Minimum is the fine smooth hose (8ms = 125
                                      // dabs/sim-sec, ~2 per frame at 60fps, which is finer
                                      // than a display can resolve); every step UP is fewer,
                                      // further-apart deposits you can actually see.
                                      //
                                      // Stored as an INTERVAL rather than a rate so the slider
                                      // reads like Spacing does — minimum = finest — and so the
                                      // slider value, the config value and the persisted value
                                      // are all the same number, with no reciprocal in between
                                      // for a preset or the mirror to get backwards.
                                      //
                                      // Replaces the old fixed BRUSH_DAB_RATE (125): same
                                      // default behaviour, now a control. Note dye is anchored
                                      // to BRUSH_DAB_RATE_REF, so past a 16ms interval the
                                      // per-dab share clamps at full flow and the stroke thins
                                      // — exactly what Spacing does past its own reference.
            BRUSH_DAB_FLOOR_RATE: 125,// Cap on On Move's slow-speed floor, dabs per simulated
                                      // second. Deliberately NOT the constant-flow interval
                                      // above: turning the hose down to visible pulses must not
                                      // also coarsen a slow On Move stroke, which is a
                                      // different mode with its own control (Spacing).
            BRUSH_DAB_RATE_REF: 62.5, // Dye-per-second anchor = 1 dab per 16ms of sim time,
                                      // which is exactly what one-dab-per-frame delivered at
                                      // 60fps (measured 62.5 dabs/sim-sec at both 30 and 60fps,
                                      // because the 16ms dt clamp is what set it). Keep this
                                      // tied to the clamp: 1/0.016. Per-dab flow is scaled by
                                      // REF/rate, so SHORTENING BRUSH_DAB_INTERVAL_MS buys
                                      // smoothness at zero cost to how dark the stroke is.
            BRUSH_DAB_BUDGET: 4000,   // Max dabs per SIMULATED second, for both the engine
                                      // drain and the constant-flow emitter. Was a flat 64 per
                                      // FRAME, which is itself a frame-rate dependence: at
                                      // 30fps a fast dense stroke measured 54 of those 64 used,
                                      // so it was ~10 dabs from silently thinning. 4000/s is
                                      // the same 64 at a 16ms step and scales with the step.
            BRUSH_DAB_FLOOR: true,    // On Move keeps depositing at very slow hand speeds.
                                      // The walker's rate is speed/spacing, so it falls to
                                      // zero as the hand slows: measured 41 dabs/s at
                                      // 400px/s but 5 at 50px/s and 2 at 25px/s, and up to
                                      // 4x worse below Time 1. When a segment is too short
                                      // to reach one spacing, 05d0 emits a dab for the
                                      // distance actually travelled, carrying dye in exact
                                      // proportion — same paint per pixel, finer sampling.
                                      // false restores the pure distance walker.
            BRUSH_SPACING_MIN_PX: 1,  // Smallest dab gap in px, whatever Spacing asks for.
                                      // Guards the drain budget: below ~1px a fast stroke
                                      // demands more dabs per second than the queue can
                                      // retire, and the overflow is DROPPED silently, taking
                                      // its dye with it (measured -52% at 2000px/s with a
                                      // 0.25px floor). Low-speed smoothness comes from the
                                      // dab floor, not from sub-pixel spacing.
            BRUSH_DAB_FLOOR_MAX_SPACING: 0.001,
                                      // Spacing at or below which the slow-speed floor is
                                      // allowed to fill gaps. Above it, Spacing is
                                      // authoritative and a slow stroke keeps the dab
                                      // separation you asked for — the floor only ever fires
                                      // when the walker emitted nothing, i.e. exactly the
                                      // slow-hand case where that separation is visible.
            BRUSH_DAB_INTERP: true,   // Constant flow places its dabs along the path travelled
                                      // this frame instead of stacking them all at the live
                                      // pointer. false restores the single-point behaviour.
            REPLAY_INTERP: true,      // Stroke replay spreads a recorded dab along the path it
                                      // covers instead of dropping it whole at its own
                                      // timestamp. At 1x that is the same one dab per frame;
                                      // below it, it is the difference between a stroke that
                                      // flows and one that arrives as separate blobs, since a
                                      // 0.25x replay leaves three empty frames of advection
                                      // between deposits. Each sample carries its share of the
                                      // dye and of the push (05d emitReplayDab), so total
                                      // paint is unchanged. false restores whole-dab replay.
            BRUSH_TIME_COMP: 4,       // Sim-clock deposition compensation cap (05d0). A dab is
                                      // an impulse, so a distance-spaced walker deposits
                                      // 1/timeScale times as much dye per SIMULATED second at
                                      // low Time — the flat over-saturated middle. Spacing is
                                      // spread by 1/timeScale, up to this multiplier, which
                                      // restores dabs-per-sim-second (momentum per distance is
                                      // unchanged — the momentum rule rescales with spacing).
                                      // Inert at Time ≥ 1; 1 disables. Console-tunable.
            REC_SIM_CLOCK: true,      // Recording playhead rides the sim clock (03-recording).
                                      // false = the old wall-clock playhead, which fed splats
                                      // 1/timeScale times too fast for the physics consuming
                                      // them (and over-deposited on sub-60fps frames, where the
                                      // sim step clamps to 16ms but the wall delta does not).
                                      // On, playback wall-duration stretches by 1/timeScale —
                                      // the timeline's seconds are simulated seconds.
            BRUSH_CONTINUOUS: false,  // Splat mode: false = dabs spaced along travel
                                      // ("on move", the classic feel); true = constant
                                      // flow — dye keeps flowing while the pointer is
                                      // held, even standing still, one dab every
                                      // BRUSH_DAB_INTERVAL_MS of simulated time (05j
                                      // synthesizes the dabs; the
                                      // spacing walker is bypassed, fluid target only).
                                      // Brush panel segmented row.

            SIM_SUBSTEP: true,        // Run several physics steps per frame when the display
                                      // refresh is below ~50Hz. The dt clamp below caps a
                                      // step at 16ms for stability, so on a 30Hz panel the
                                      // fluid only advanced 16ms per 33ms frame — it ran at
                                      // 48% speed, which is most of what "janky on a low-fps
                                      // monitor" actually is. Sub-stepping restores real-time
                                      // evolution at N times the physics cost, so it engages
                                      // ONLY when the frame rate is keeping up with the panel
                                      // (a vsync-limited 30Hz display with headroom), never
                                      // when we are at 30fps because the machine is
                                      // struggling. Self-disengaging: if sub-stepping itself
                                      // costs us the refresh rate, the gate closes next frame.
            SIM_SUBSTEP_MAX: 4,       // Ceiling on steps per frame. Bounds the worst case on a
                                      // very long frame (tab return, hitch) — below ~15fps the
                                      // sim goes back to running slow rather than spiralling.

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

            // ── Constant pressure field (ambient gravity / lift) ──────────
            // A steady body force on the whole canvas, aimed with the pad in the
            // Pressure brush section. AMBIENT_ rather than PRESSURE_ on purpose:
            // PRESSURE_ITERATIONS and friends are the projection solver, and this
            // is a body force, which is very nearly the opposite thing.
            //
            // It is AMBIENT: once switched on it keeps running whichever brush is
            // in hand, because gravity you have to hold a tool to feel is not
            // gravity. The control lives in the Pressure section only because that
            // is where it belongs conceptually.
            AMBIENT_FORCE: false,     // Master on/off for the constant field
            AMBIENT_FORCE_X: 0,       // Pad vector, SCREEN space, -1..1 (y+ = DOWN,
            AMBIENT_FORCE_Y: 0,       // matching the pad). 05j flips y on upload,
                                      // because velocity's +y is up.
            AMBIENT_FORCE_REF: 5,     // Velocity added per second at full pad deflection,
                                      // on fully loaded dye. Measured 2026-08-24 (blob
                                      // dropped for one second, canvas fractions fallen):
                                      //   0.5 — 1.1%   2 — 5.1%    5 — 10.4%
                                      //    10 — 17.4%  20 — 27.0%
                                      // 5 puts full deflection at ~10% of the canvas per
                                      // second and peak velocity ~1.8x a painted dab: a
                                      // fall you can watch cross the canvas in ten
                                      // seconds, with the low end of the pad still a slow
                                      // atmospheric drift. Above ~10 the field starts
                                      // outrunning the dye it is pushing.
            AMBIENT_FORCE_MAXDYE: 1.6,// Dye level treated as fully loaded, so a faint
                                      // wash falls slower than a saturated one.
            BRUSH_VELOCITY_ONLY: false, // Velocity-only brush ("Pressure"): the stroke runs the
                                      // splat's VELOCITY pass and skips the dye pass entirely,
                                      // so it moves paint that is already down without
                                      // depositing any new pigment. Fluid target only — the
                                      // sketch/mask routes have their own paths. User strokes
                                      // only (the __brushTipOn gate): programmatic splats
                                      // (audio scenes, path layers, animations) still paint.
            BRUSH_VEL_MODE: 'smudge', // How a Pressure dab moves paint:
                                      //   'smudge' — velocity along pointer travel (the
                                      //              classic brush's push, minus the dye)
                                      //   'swirl'  — tangential velocity, a vortex at the cursor
                                      //   'spread' — dye transported radially outward
                                      //   'gather' — dye transported radially inward
                                      // The last three are ANALYTIC, so they work while the
                                      // pointer stands still — which 'smudge' cannot do
                                      // (its dx/dy go to zero). Pair them with Constant flow.
                                      //
                                      // The UI calls this whole mode 'Pressure', but the config
                                      // keys stay BRUSH_VEL_* on purpose: BRUSH_PRESSURE_* was
                                      // PEN pressure, removed 2026-07-22, and reusing that
                                      // prefix would make the two indistinguishable in a grep.
                                      //
                                      // Why spread/gather move DYE while smudge/swirl move
                                      // VELOCITY: the projection step removes the curl-free
                                      // part of the velocity field, and a radial push is
                                      // ENTIRELY curl-free — so forcing velocity radially
                                      // is undone as fast as it is applied. Measured
                                      // 2026-08-23, six steps after one dab: swirl
                                      // (divergence-free) kept 107% of its speed and smudge
                                      // 187%, while spread kept 51% and gather 55% — and
                                      // the projection's return flow pulled dye INWARD,
                                      // CONTRACTING the blob spread was meant to open (mean
                                      // radius 0.93x the do-nothing control). Same wall the
                                      // attractor field hit from the opposite sign (05b
                                      // attractorFrag), so it takes the same answer:
                                      // transport the dye, never the velocity.
            BRUSH_VEL_STRENGTH: 1,    // Pressure speed for the stationary modes, in units of
                                      // BRUSH_VEL_SPEED_REF. Inert for 'smudge', which takes
                                      // its magnitude from the pointer.
            BRUSH_PUSH_DYE_RATE: 0.5, // Spread/Gather transport rate at strength 1, in brush-radii
                                      // per second. Those two modes move DYE rather than
                                      // velocity (see BRUSH_VEL_MODE above), so they need
                                      // their own scale — BRUSH_VEL_SPEED_REF is in
                                      // splat-velocity units and means nothing to them.
                                      //
                                      // Ceiling, not taste: the gather is a RESAMPLE, so a
                                      // texel reads from wherever the offset lands, and an
                                      // offset larger than the painted region reads EMPTY
                                      // canvas — which writes empty, destroying paint
                                      // instead of moving it. Measured at 2.5 (2026-08-23):
                                      // ~8.7 texels of jump per frame, and a 0.7s gather ate
                                      // 98% of the blob it was supposed to collect. At 0.5
                                      // the step is ~1 texel/frame — the same scale
                                      // advection itself moves at — and dye is conserved.
                                      // Raise it only alongside a substepped transport.
            BRUSH_VEL_SPEED_REF: 120, // Strength 1.0 in splat-velocity units. Calibrated
                                      // against a real stroke: the engine emits |v| = 10x
                                      // spacing per dab (05d0), so 120 is a hand moving ~12px
                                      // between dabs — a firm but unremarkable push.

            BRUSH_FLOW: 1,            // D1 dye intensity per dab (fluid: scales splat color;
                                      // sketch: scales stamp alpha). 1 = legacy full flow.
            BRUSH_JITTER: 0,          // D1 per-dab scatter, fraction of brush diameter
                                      // (0 = clean line; spray/charcoal territory above ~0.3)
            BRUSH_TIP: 0,             // D1 brush tip on USER strokes (fluid dye only; velocity
                                      // stays gaussian, programmatic splats unaffected):
                                      // 0 = gaussian, 1 = blob, 2 = chisel, 3 = streak, 4 = ring
            BRUSH_TIP_TEXTURE: 0.7,   // Stamp ROUGHNESS (rim jitter + surface grain + edge
                                      // softness) for blob/chisel/streak tips and custom
                                      // shapes. The tip's footprint is absolute — 0 is a
                                      // hard-edged chisel, not a gaussian circle.
                                      // (splatFrag stampNoise; ring ignores it)
            BRUSH_ANGLE: 0,           // D1 brush rotation in degrees (0-360). Rotates the
                                      // asymmetric stamp shapes (chisel/streak) in the splat
                                      // shader; the brush-ring cursor's line shows this angle.
                                      // Round tips (soft/blob/ring) are rotation-invariant.

            SYMMETRY_MODE: 'radial',  // Multi-Brush arm layout (05g symmetryTransforms).
                                      // 'radial' = the classic C_n ring (default, unchanged);
                                      // 'mirrorX'/'mirrorY'/'mirrorQuad' fold that ring across
                                      // the centre axes (dihedral — 2n/2n/4n dabs); 'rake' =
                                      // bristles offset perpendicular to travel. Multi-Brush
                                      // dropdown select. (A 'spiral' mode was retired 2026-08-16
                                      // — it never read right; stale values coerce to radial.)
            SYM_RAKE_SMOOTH: 2.5,     // 'rake' heading smoothing: brush diameters of TRAVEL
                                      // the bristle line takes to turn. Per-dab direction is
                                      // one 1-2px pointer segment (±45° of quantization
                                      // noise), amplified by the outer bristle's long lever
                                      // arm — this is what stops it whipping. 0 disables.
            SYM_RAKE_SPACING: 1.0,    // 'rake' bristle gap in brush diameters, so the rake
                                      // opens and closes with the Size fader

            // ── Perceptual fader curves (Density, Time) ────────────────────
            // These shape the VISIBLE Density and Time faders only. The
            // underlying values, their ids, ranges and stored form are
            // untouched — see the curve block in 20-mixer-layout.js. Dial any
            // of these from the console, then call refreshFaderCurves() to
            // re-seat the thumbs.
            DENSITY_FADER_TAU_MIN: 0.12,  // dye half-life in seconds at the bottom of the
                                          // Density fader. Stays clear of the < 0.88
                                          // instant-wipe zone, which is deliberately out
                                          // of the fader's reach (it maps to d ≈ 0.908).
            DENSITY_FADER_TAU_MAX: 60,    // half-life at the top of the log-spaced region,
                                          // just below the 1.0 detent.
            DENSITY_FADER_HOLD_A: 0.86,   // fader fraction where the "never fades" detent
            DENSITY_FADER_HOLD_B: 0.92,   // starts and ends — it parks on EXACTLY 1.0, the
                                          // value people want most and could never reliably
                                          // land on. Above HOLD_B is the growth zone (>1).
            TIME_FADER_HOLD_A: 0.70,      // same idea for Time: everything below 1× gets
            TIME_FADER_HOLD_B: 0.76,      // 70% of the travel instead of the ~15% a linear
                                          // 0.01–3 scale gave it, with a detent on 1×.

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



            // ── Overflow (open canvas edges) ── the divergence and gradient
            // passes stop treating the border as a wall, so outbound fluid
            // leaves instead of bouncing; a drain band at the rim nulls
            // whatever crosses it so nothing washes back in off the clamped
            // edge texels. Lived as a Tunnel audio-scene toggle until it
            // became an Effects checkbox (2026-08-24).

            EDGE_ABSORB: false,       // Overflow enabled (toggled in Effects)

            EDGE_ABSORB_BAND: 0.025,  // Drain band width as a fraction of the canvas,
                                      // per axis (0.025 = the original hairline 2.5%).
                                      // The Border slider writes this; MUST stay > 0 —
                                      // smoothstep(0, 0, x) is undefined in GLSL.

            GLOW: false,              // Glow (HDR bloom) post-FX enabled (toggled in Effects)

            GLOW_INTENSITY: 0.8,      // Halo brightness scale (slider). MUST be seeded:
                                      // undefined here would upload NaN to the shader.

            GLOW_THRESHOLD: 0.6,      // Pre-tone-map brightness where dye starts to glow
                                      // (slider; HDR scale — dye runs well past 1.0)

            GLOW_KNEE: 0.7,           // Soft-knee width fraction (console-tunable)

            GLOW_RESOLUTION: 256,     // Glow chain base resolution (long side)

            GLOW_ITERATIONS: 8,       // Max mip-chain depth (halvings from base res)

            // ── Scatter (volumetric light shafts) ── a CHILD of Glow: it
            // marches Glow's own prefiltered overbright buffer toward a light
            // origin, so it costs one extra 256-base pass and does nothing
            // while Glow is off. Purely additive — unlike the old Sunrays
            // pass it removed (7246d7d), it can never darken the frame.
            // Every numeric below MUST be seeded: bd7e62f blacked out the
            // whole canvas when an unseeded weight reached the shader as NaN.

            SCATTER: false,           // Volumetric light shafts enabled (toggled under Glow)

            SCATTER_AMOUNT: 0.5,      // Shaft gain actually uploaded to the shader.
                                      // The UI slider is 0..1 and is SQUARED into this
                                      // (0..2), so slider 0.50 == this 0.5. Keep the two
                                      // defaults consistent or a fresh load renders at a
                                      // different strength than the slider reads.

            SCATTER_SOURCE: 'light',  // Ray origin: 'light' (Light Source dot) | 'brush' (cursor)

            SCATTER_DENSITY: 1.0,     // "Reach" slider. Fraction of each pixel's path to the
                                      // origin that it gathers light along. A pixel only
                                      // lights up if an emitter falls inside that span, so
                                      // this is what decides how far from the source a shaft
                                      // can still reach — at 0.6 rays visibly died before the
                                      // canvas edge. It also brightens the far field: a longer
                                      // span means the same emitter sits at a LOWER iteration
                                      // index, so less decay has accumulated by the time it
                                      // is sampled. 1.0 marches the whole way to the origin.

            SCATTER_DECAY: 0.94,      // Per-step falloff (console-tunable) — shaft length

            SCATTER_DISPERSION: 0.03, // Per-channel decay spread (console-tunable). THE
                                      // knob that makes this read as scattering rather
                                      // than a radial blur: long wavelengths survive more
                                      // scattering events, so red carries furthest down
                                      // the shaft and blue drops out first.

            SCATTER_FOLLOW: 0.15,     // Origin lerp per frame (console-tunable). Without it
                                      // the shafts snap when the origin jumps.

            SCATTER_RESOLUTION: 512,  // Scatter's own base resolution (long side),
                                      // NO LONGER tied to GLOW_RESOLUTION. A bloom halo
                                      // is low-frequency so 256 is plenty for it, but a
                                      // collider SHADOW carries the collider's edges: at
                                      // 256 the march undersampled a 512-wide obstacle by
                                      // 2x and then upscaled ~4-8x to the canvas, so every
                                      // shadow boundary quantized to one coarse texel and
                                      // read as jagged stair-steps (2026-08-21).
                                      // Console-tunable; cost is O(res^2).

            SCATTER_BLOCK: true,      // Colliders cast shadows in the light shafts.
                                      // No-op unless BOTH Scatter and a collision layer
                                      // exist, so ON by default is free where it does
                                      // not apply and correct where it does.

            SCATTER_BLOCK_STRENGTH: 1.0, // How opaque a collider is TO LIGHT (console-
                                      // tunable). 1 = full shadow. Deliberately separate
                                      // from the per-layer Strength slider, which is
                                      // permeability to FLUID \u2014 a fence blocks light
                                      // without blocking much air.

            // ── PhotoSafe (photosensitivity protection) ─────────────────────
            // Display-stage limiter encoding WCAG 2.3.1 / ISO 9241-391: the
            // dangerous stimulus is >3 flashes/sec, flash = an opposing pair of
            // luminance transitions ≥10% of max with the darker state <0.80,
            // over a meaningful screen area (plus a stricter saturated-red
            // rule). Two mechanisms: (1) a global luminance slew clamp — a
            // slew-limited signal at frequency f has peak-to-peak amplitude
            // ≤ SLEW/(2f), so SLEW=0.5 makes a ≥10% pair at ≥3 Hz
            // arithmetically impossible at the frame level; (2) block-level
            // flash detection that engages a temporal smoother (flashes become
            // fade-in/fade-outs) and disengages to EXACT pass-through when
            // idle. Default ON; the first-frame warning modal and the Display
            // checkbox both write the 'fluidui.photoSafe' localStorage key.
            // Deliberately NOT a ParamRegistry-persisted checkbox: safety
            // preferences must never ride presets or multiplayer look mirrors.

            PHOTOSAFE: (function () {
                // Absent → protected. Only an explicit '0' disables.
                try { return localStorage.getItem('fluidui.photoSafe') !== '0'; }
                catch (e) { return true; }
            })(),

            PHOTOSAFE_SLEW: 0.5,        // Max global mean-luminance change per second.
                                        // 0.5/(2·3Hz)=0.083 < the 0.10 flash threshold.

            PHOTOSAFE_FLASH_DELTA: 0.10,// Per-block luminance delta that counts as a
                                        // flash transition (fraction of max, WCAG 10%)

            PHOTOSAFE_DARK_FLOOR: 0.80, // WCAG: only pairs whose darker state is below
                                        // 0.80 relative luminance count as flashes

            PHOTOSAFE_RED_DELTA: 0.20,  // Saturated-red transition threshold (stricter
                                        // rule: red flashes are dangerous at lower deltas)

            PHOTOSAFE_AREA: 0.02,       // Fraction of 16x16 blocks that must flash to
                                        // engage (~5 blocks). WCAG's area is 25% of a
                                        // 10-degree field — at desktop viewing that is
                                        // only ~2% of a fullscreen canvas, so 0.10 was
                                        // ~8x too lenient (review 2026-08-21).

            PHOTOSAFE_SMOOTH: 0.03,     // Per-frame history blend at FULL suppression.
                                        // First-order low-pass, fc≈0.29 Hz at 60fps →
                                        // 3 Hz attenuated to ≈0.097: even a full-scale
                                        // strobe lands under the 0.10 threshold.

            PHOTOSAFE_RELEASE: 1.2,     // Suppression envelope decay time constant (s)

            PHOTOSAFE_PAIR_WINDOW: 0.18,// An opposing transition within this window (s)
                                        // completes a "flash pair" → hard engage.
                                        // 0.18s = half-period of ~2.8 Hz: pairs slower
                                        // than the 3-flashes/sec danger line (which the
                                        // standard PERMITS — e.g. 2.5 Hz music pulses)
                                        // only get the soft attack, not the hard latch.

            PHOTOSAFE_RATE: 5.0,        // Opposing transitions/sec permitted before the
                                        // history blend engages, ramping to full over the
                                        // next 4/s. A square-wave flash is TWO transitions,
                                        // so 6/s is exactly WCAG's 3-flashes-sec line; 5
                                        // engages just under it. Rate — not per-frame
                                        // deviation — is what separates a strobe from
                                        // painting: monotonic change contributes one
                                        // transition, only real flicker sustains a rate.

            PHOTOSAFE_SPIN_CAP: 90      // Max kaleido spin under protection (deg/s) —
                                        // the "extreme camera shake" clamp; motion, not
                                        // luminance, so handled at the animator not the
                                        // display limiter

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

        

